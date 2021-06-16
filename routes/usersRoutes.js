const express = require("express");
const expressAsyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const userRouter = express.Router();
const User = require("../models/userModel");
const generateToken = require("../config/utlis");
const sendSMS = require("../config/helpers");
const isAuth = require("../middlewares/authMiddleware");
const mongoose = require("mongoose");
const fetch = require("node-fetch");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

userRouter.post(
  "/register",
  expressAsyncHandler(async (req, res) => {
    if (
      !req.body.name ||
      !req.body.email ||
      !req.body.password ||
      !req.body.number
    ) {
      return res.status(401).send({
        message: "Fields are missing",
        status: 401,
      });
    }
    const isUserExist = await User.findOne({ email: req.body.email });
    if (isUserExist) {
      return res.status(200).send({
        message: "This email already registered",
        status: 204,
      });
    }
    const user = new User({
      name: req.body.name,
      email: req.body.email,
      number: req.body.number,
      password: bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10)),
    });
    const registeredUser = await user.save();
    sendSMS({
      message:
        "Thank you for register with us. Please visit our wesite and place your first order",
      number: req.body.number,
    });
    res.send({
      message: "User Registered Successfully",
      status: "201",
    });
  })
);

userRouter.post(
  "/login",
  expressAsyncHandler(async (req, res) => {
    if (!req.body.email || !req.body.password) {
      return res.status(401).send({
        status: 401,
        message: "Fields are required",
      });
    }
    const isUserExist = await User.findOne({ email: req.body.email });
    if (!isUserExist) {
      return res.status(401).send({
        status: 401,
        message: "Email not found!",
      });
    }
    if (bcrypt.compareSync(req.body.password, isUserExist.password)) {
      return res.status(200).send({
        _id: isUserExist._id,
        name: isUserExist.name,
        email: isUserExist.email,
        number: isUserExist.number,
        wishlist: isUserExist.wishlist,
        cartItems: isUserExist.cartItems,
        address: isUserExist.address,
        token: generateToken(isUserExist),
      });
    } else {
      return res.status(401).send({
        message: "Invalid Credentials",
      });
    }
  })
);

userRouter.post(
  "/add-wishlist",
  isAuth,
  expressAsyncHandler(async (req, res) => {
    if (!req.body.productId) {
      return res.status(401).send({
        message: "productId is missing",
      });
    }
    const user = await User.findById(req.user._id);
    if (user.wishlist.includes(req.body.productId)) {
      const updateResponse = await User.findOneAndUpdate(
        { _id: req.user._id },
        { $pull: { wishlist: req.body.productId } }
      );
    } else {
      const updateResponse = await User.findOneAndUpdate(
        { _id: req.user._id },
        { $push: { wishlist: req.body.productId } }
      );
    }
    return res.status(200).send({ status: 201, message: "wishlist manage" });
  })
);

userRouter.post(
  "/add-to-cart",
  isAuth,
  expressAsyncHandler(async (req, res) => {
    if (!req.body) {
      return res
        .status(401)
        .send({ status: 401, message: "Cart items missing" });
    }
    let finalData = [];
    req.body.cartItems.forEach(async (element) => {
      let _id = mongoose.Types.ObjectId(element.productId);
      let data = { productId: _id, qty: element.qty };
      finalData.push(data);
    });
    await User.findOneAndUpdate(
      { _id: req.user._id },
      {
        cartItems: finalData,
      }
    );
    return res.status(201).send({ message: "Cart managed" });
  })
);

userRouter.post(
  "/add-address",
  isAuth,
  expressAsyncHandler(async (req, res) => {
    if (!req.body) {
      return res.status(401).send({ status: 401, message: "address missing" });
    }
    const user = await User.findById(req.user._id);
    const updateResponse = await User.findOneAndUpdate(
      { _id: req.user._id },
      { $push: { address: req.body } }
    );
    const updatedUser = await User.findById(req.user._id, {
      address: 1,
      _id: 0,
    });
    return res.status(201).send(updatedUser);
  })
);

userRouter.post(
  "/delete-address",
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const { index } = req.body;
    let address = await User.find(
      { _id: req.user._id },
      { address: 1, _id: 0 }
    );
    address[0].address.splice(index, 1);
    await User.findOneAndUpdate(
      { _id: req.user._id },
      { address: address[0].address }
    );
    return res.status(200).send("ADDRESS_DELETED");
  })
);

userRouter.post(
  "/edit-address",
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const {
      index,
      fullName,
      number,
      pinCode,
      state,
      city,
      houseNumber,
      roadName,
    } = req.body;
    let address = await User.find(
      { _id: req.user._id },
      { address: 1, _id: 0 }
    );
    await User.findOneAndUpdate(
      { _id: req.user._id },
      { $set: { address: [] } }
    );
    let addressForEdit = address[0].address[index];
    addressForEdit.fullName = fullName;
    addressForEdit.number = number;
    addressForEdit.pinCode = pinCode;
    addressForEdit.state = state;
    addressForEdit.city = city;
    addressForEdit.houseNumber = houseNumber;
    addressForEdit.roadName = roadName;
    address[0].address[index] = addressForEdit;
    await User.findOneAndUpdate(
      { _id: req.user._id },
      { $push: { address: address[0].address } }
    );
    const updatedUser = await User.findById(req.user._id, {
      address: 1,
      _id: 0,
    });
    return res.status(201).send(updatedUser);
  })
);

userRouter.post(
  "/update-personal-detail",
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const { name, number } = req.body;
    if (!name && !number) {
      return res.status(401).send({ status: 401, message: "Field missing" });
    }
    if (name) {
      await User.findByIdAndUpdate(req.user._id, { name: name });
    }
    if (number) {
      await User.findByIdAndUpdate(req.user._id, { number: number });
    }
    return res
      .status(200)
      .send({ status: 200, message: "PROFILE_DETAIL_CHANGE" });
  })
);

userRouter.post(
  "/login-with-facebook",
  expressAsyncHandler(async (req, res) => {
    const { accessToken, userID } = req.body;
    let urlGraphFacebook = `https://graph.facebook.com/v2.11/${userID}/?fields=id,name,email&access_token=${accessToken}`;
    await fetch(urlGraphFacebook, { method: "GET" })
      .then((response) => response.json())
      .then(async (json) => {
        const { email, name } = json;
        if (!email || !name) {
          return res.status(401).send({
            status: 401,
            message: "Fields are required",
          });
        }
        const isUserExist = await User.findOne({ email: email });
        if (!isUserExist) {
          const user = new User({
            name: name,
            email: email,
            number: null,
            loggedInVia: "Facebook",
          });
          const registeredUser = await user.save();
          return res.status(200).send({
            _id: registeredUser._id,
            name: registeredUser.name,
            email: registeredUser.email,
            number: registeredUser.number,
            wishlist: registeredUser.wishlist,
            cartItems: registeredUser.cartItems,
            address: registeredUser.address,
            token: generateToken(registeredUser),
          });
        } else {
          return res.status(200).send({
            _id: isUserExist._id,
            name: isUserExist.name,
            email: isUserExist.email,
            number: isUserExist.number,
            wishlist: isUserExist.wishlist,
            cartItems: isUserExist.cartItems,
            address: isUserExist.address,
            token: generateToken(isUserExist),
          });
        }
      });
  })
);

userRouter.post(
  "/login-with-google",
  expressAsyncHandler(async (req, res) => {
    const { tokenId } = req.body;
    client
      .verifyIdToken({
        idToken: tokenId,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      .then(async (response) => {
        const { email_verified, name, email } = response.payload;
        if (!email || !name) {
          return res.status(401).send({
            status: 401,
            message: "Fields are required",
          });
        }
        const isUserExist = await User.findOne({ email: email });
        if (!isUserExist) {
          const user = new User({
            name: name,
            email: email,
            number: null,
            loggedInVia: "Google",
          });
          const registeredUser = await user.save();
          return res.status(200).send({
            _id: registeredUser._id,
            name: registeredUser.name,
            email: registeredUser.email,
            number: registeredUser.number,
            wishlist: registeredUser.wishlist,
            cartItems: registeredUser.cartItems,
            address: registeredUser.address,
            token: generateToken(registeredUser),
          });
        } else {
          return res.status(200).send({
            _id: isUserExist._id,
            name: isUserExist.name,
            email: isUserExist.email,
            number: isUserExist.number,
            wishlist: isUserExist.wishlist,
            cartItems: isUserExist.cartItems,
            address: isUserExist.address,
            token: generateToken(isUserExist),
          });
        }
      });
  })
);

module.exports = userRouter;
