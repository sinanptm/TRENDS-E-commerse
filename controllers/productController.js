const { Product, Category, Order } = require("../models/productModel")
const sharp = require("sharp")
const path = require("path");
const mongoose = require('mongoose')

//  * dashboard loeding

const loadDashBoard = async (req, res) => {
  try {
    res.render("dashboard");
  } catch (err) {
    console.log(err.message);
  }
};


//  * product management
const loadProducts = async (req, res) => {
  try {
    const perPage = 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * perPage;

    const products = await Product.aggregate([
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryid',
          foreignField: '_id',
          as: 'category',
        },
      },
      {
        $unwind: '$category',
      },
      {
        $project: {
          _id: 1,
          name: 1,
          price: 1,
          quantity: 1,
          status: 1,
          img: 1,
          category: '$category.name',
          discription: "$category.description",
          createdate: 1,
          discount: 1,
        },
      },
    ]).skip(skip).limit(perPage);
    const count = await Product.countDocuments();
    const totalPages = Math.ceil(count / perPage);
    res.render("products-list", { products, totalPages, currentPage: page });
  } catch (err) {
    console.log(err.message);
  }
};





//  * add products
const loadAddProduct = async (req, res) => {
  try {
    const msg = req.query.msg;
    const catogories = await Category.find();
    res.render("addProducts", { catogories: catogories, msg });
  } catch (error) {
    console.log(error.message);
    res.status(404).json(error.message);
  }
};



// * to add now product

const addProduct = async (req, res) => {
  try {
    const { name, price, quantity, status, categoryid, discount, description } = req.body;
    const images = req.files.map(file => file.filename);

    const promises = images.map(async (image) => {
      const originalImagePath = path.join(__dirname, '../public/product_images', image);
      const resizedPath = path.join(__dirname, '../public/resized_images', image);
      await sharp(originalImagePath)
        .resize({ height: 1486, width: 1200, fit: 'fill' })
        .toFile(resizedPath);
      return image
    });

    const img = await Promise.all(promises);

    const product = new Product({
      name,
      price,
      quantity,
      status,
      img,
      description,
      categoryid,
      createdate: new Date(),
      discount,
    });

    const savedProduct = await product.save();
    await Category.findByIdAndUpdate(categoryid, { $push: { items: savedProduct._id } });

    res.redirect("/admin/addProduct?msg=Product added seccussfully")

  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error (MongoDB error code 11000)
      res.redirect("/admin/addProduct?msg=Product with this name already exists");
    } else {
      // Other errors
      console.error(error);
      res.redirect("/admin/addProduct?msg=" + error.message);
    }
  }
};
// * to edit a product

const loadEditProduct = async (req, res) => {
  try {
    const id = req.query.id;
    const type = req.query.type
    if (!id) {
      console.log("Redirecting to /admin/products");
      res.redirect("/admin/products");
      return;
    }

    const product = await Product.aggregate([
      { $match: { _id: mongoose.Types.ObjectId.createFromHexString(id) } },
      {
        $lookup: {
          from: "categories",
          localField: "categoryid",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: 1,
          price: 1,
          quantity: 1,
          status: 1,
          category: {
            name: 1,
            description: 1,
            _id: 1
          },
          description: 1,
          createdate: 1,
          discount: 1,
          img0: { $arrayElemAt: ["$img", 0] },
          img1: { $arrayElemAt: ["$img", 1] },
          img2: { $arrayElemAt: ["$img", 2] }
        }
      }
    ]);


    if (!product) {
      console.error("Product not found");
      res.status(404).send("Product not found");
      return;
    }

    const categories = await Category.find();
    res.render("editt-product", { product:product[0], categories, type });
  } catch (err) {
    console.error("Error in loadEditProduct:", err);
    res.status(500).send("Internal Server Error");
  }
};

//  * edit products

const editProduct = async (req, res) => {
  try {
    const id = req.params.id;

    const { name, price, quantity, status, categoryid, discount, description } = req.body;

    const images = req.files.map(file => file.filename);

    const existingProduct = await Product.findById(id);



    const check = async (image) => {
      if (image) {
        const originalImagePath = path.join(__dirname, '../public/product_images', image);
        const resizedPath = path.join(__dirname, '../public/resized_images', image);
        await sharp(originalImagePath)
          .resize({ height: 1486, width: 1200, fit: 'fill' })
          .toFile(resizedPath);
        return image;
      } else {
        return null;
      }
    };

    const promises = [];
    for (let index = 0; index < 3; index++) {
      const newImage = images[index];
      const existingImage = existingProduct.img[index];

      const result = newImage ? await check(newImage) : existingImage;
      promises.push(result);
    }

    const img = await Promise.all(promises);

    const updatedProduct = await Product.findByIdAndUpdate(id, {
      name,
      price,
      quantity,
      status,
      img,
      description,
      categoryid,
      discount,
    });

    if (categoryid !== existingProduct.categoryid.toString()) {
      const oldCategory = await Category.findByIdAndUpdate(
        existingProduct.categoryid,
        { $pull: { items: existingProduct._id } }
      );
      const newCategory = await Category.findByIdAndUpdate(
        categoryid,
        { $addToSet: { items: existingProduct._id } }
      );

      if (req.query.type) {
        res.redirect("/admin/catogories");
      } else {
        res.redirect("/admin/products?msg=Product updated successfully");
      }

    } else {
      if (req.query.type) {
        res.redirect("/admin/catogories");
      } else {
        res.redirect("/admin/products?msg=Product updated successfully");
      }
    }


  } catch (err) {
    console.error(err.message);
    res.status(500).send(err);
  }
};

// * for listing  the product
const listProduct = async (req, res) => {
  try {
    const id = req.query.id
    if (!id) {
      console.log("Redirecting to /admin/products");
      res.redirect("/admin/products");
      return;
    }
    const product = await Product.findOneAndUpdate({ _id: id }, { $set: { status: "Available" } })
    res.redirect("/admin/products")
  } catch (error) {
    res.status(404).send(error.message)
  }
}

// * for listing  the product
const unlistProduct = async (req, res) => {
  try {
    const id = req.query.id
    if (!id) {
      console.log("Redirecting to /admin/products");
      res.redirect("/admin/products");
      return;
    }
    const product = await Product.findOneAndUpdate({ _id: id }, { $set: { status: "Disabled" } })
    res.redirect("/admin/products")

  } catch (error) {
    res.status(404).send(error.message)
  }
}



// * to delete a product

const deleteProduct = async (req, res) => {
  try {
    console.log(1);
    const id = req.params.id;

    const existingProduct = await Product.findById(id);

    await Product.findByIdAndDelete(id);
    await Category.findByIdAndUpdate(existingProduct.categoryid, {
      $pull: { items: id },
    });

    res.redirect("/admin/products?msg=Product deleted successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
};


// * for showiing all the catogories

const laodCatagorie = async (req, res) => {
  try {
    const perPage = 4;
    const page = parseInt(req.query.page) || 1
    const skip = (page - 1) * perPage
    const categories = await Category.find().skip(skip).limit(perPage)
    const count = await Category.countDocuments();
    const totalPages = Math.ceil(count / perPage)
    res.render("catogories", { categories, totalPages, currentPage: page });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};


// * for adding new catogorie

const addCatagorie = async (req, res) => {
  try {
    const { name, description, type } = req.body;

    const processImage = async (filename) => {
      if (filename) {
        const originalImagePath = path.join(__dirname, '../public/product_images', filename);
        const resizedPath = path.join(__dirname, '../public/resized_images', filename);
        await sharp(originalImagePath)
          .resize({ height: 1486, width: 1200, fit: 'fill' })
          .toFile(resizedPath);
        return filename;
      } else {
        return null;
      }
    };

    const img = await processImage(req.file.filename);

    const newCategory = new Category({
      name,
      description,
      img: img,
      type
    });

    const category = await newCategory.save();
    res.redirect("/admin/catogories");
  } catch (error) {
    console.error("Error adding category:", error);
    req.flash("error", "Internal Server Error. Please try again later.");
    res.redirect("/admin/catogories");
  }
};

// * for editting the catogory
const editCatogory = async (req, res) => {
  try {
    const { name, description, type } = req.body;
    const id = req.params.id;

    const existingProduct = await Category.findById(id);
    const file = req.file && req.file.filename;
    img = file || existingProduct.img;

    const category = await Category.updateOne(
      { _id: id },
      {
        $set: {
          name,
          description,
          img,
          type
        },
      }
    );

    if (category) {
      req.flash("success", "catogory details updated successfully.");
    } else {
      req.flash("error", "Failed to update catogory details.");
    }

    res.redirect("/admin/catogories");
  } catch (error) {
    console.error("Error editing catogory:", error);
    req.flash("error", "Internal Server Error. Please try again later.");
    res.redirect("/admin/catogories");
  }
};

// * Delte catogotie

const deleteCatogory = async (req, res) => {
  try {
    const id = req.params.id;
    const category = await Category.deleteOne({ _id: id });
    res.redirect("/admin/catogories");
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send("Internal Server Error");
  }
};


// * for laoding all the orders

const loadOrders = async (req, res) => {
  try {
    const perPage = 4;
    const page = parseInt(req.query.page) || 1
    const skip = (page - 1) * perPage
    const count = await Order.countDocuments()
    const totalPages = Math.ceil(count / perPage)
    const orders = await Order.find().populate('deliveryAddress').skip(skip).limit(perPage)
    console.log(orders[0].deliveryAddress.Lname );
    res.render(`orders-list`, { orders, totalPages, currentPage: page });

  } catch (error) {
    console.log(error.message);
  }
}



// * for deleting a order

const loadOrder = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      return res.status(304).redirect('/admin/orders-list');
    }

    const order = await Order.aggregate([
      { $match: { _id: mongoose.Types.ObjectId.createFromHexString(id) } },
      {
        $lookup: {
          from: 'users', // Assuming 'users' is the name of your user collection
          localField: 'userid',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $lookup: {
          from: 'addresses', // Assuming 'addresses' is the name of your address collection
          localField: 'deliveryAddress',
          foreignField: '_id',
          as: 'deliveryAddress'
        }
      },
      { $unwind: "$user" },
      { $unwind: "$deliveryAddress" },
      {
        $project: {
          _id: 1,
          orderAmount: 1,
          orderDate: 1,
          orderStatus: 1,
          deliveryDate: 1,
          ShippingDate: 1,
          payment: 1,
          'user.email': 1,
          'user.username': 1,
          'user.name': 1,
          'user.gender': 1,
          'user.phone': 1,
          'user.createdate': 1,
          'user.updated': 1,
          'user.is_verified': 1,
          'user.status': 1,
          'deliveryAddress.Fname': 1,
          'deliveryAddress.Lname': 1,
          'deliveryAddress.companyName': 1,
          'deliveryAddress.country': 1,
          'deliveryAddress.streetAdress': 1,
          'deliveryAddress.city': 1,
          'deliveryAddress.state': 1,
          'deliveryAddress.pincode': 1,
          'deliveryAddress.mobile': 1,
          'deliveryAddress.email': 1,
        }
      }
    ]);

    if (!order || order.length === 0) {
      return res.status(304).redirect('/admin/orders-list');
    }

    res.render('order-details', { order: order[0] });

  } catch (error) {
    console.log(error.message);
  }
};



// * for editting a order 
const editOrder = async (req, res) => {
  try {
    const id = req.params.id
    if (!id) {
      return res.status(304).redirect('/admin/order-details?id=' + id)
    }
    const status = req.body.status
    const order = await Order.findByIdAndUpdate(id, { $set: { orderStatus: status } })
    if (!order) {
      return res.status(304).redirect('/admin/order-details?id=' + id)
    }
    
    res.status(200).redirect('/admin/order-details?id=' + id)

  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
}




// * for deleting a order

const deleteOrder = async (req, res) => {
  try {
    const id = req.query.id
    if (!id) {
      return res.status(304).redirect('/admin/orders-list')
    }
    const order = await Order.findById(id);
    if (!order) {
      return res.status(304).redirect('/admin/orders-list')
    }
    await Order.findByIdAndDelete(id);
    res.status(200).redirect('/admin/orders-list')
  } catch (error) {
    console.log(error.message);
    res.status(400).redirect('/admin/orders-list')
  }
}



module.exports = {
  loadDashBoard,
  loadProducts,
  loadAddProduct,
  laodCatagorie,
  loadOrders,
  loadOrder,
  loadEditProduct,
  addProduct,
  addCatagorie,
  editCatogory,
  deleteCatogory,
  editProduct,
  deleteProduct,
  listProduct,
  unlistProduct,
  deleteOrder,
  editOrder,
};
