const { Router } = require("express");
const router = Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Joi = require("joi");
const gravatar = require("gravatar");
const bson = require("bson-objectid");
const path = require("path");
const fs = require("fs");
const Jimp = require("jimp");

const { SECRET_KEY } = process.env;

const emailRegexp = /[a-z0-9]+@[a-z]+\.[a-z]{2,3}/;

const { validateSchema } = require("../../helpers");
const User = require("../../models/userModel");
const { createError } = require("../../helpers");
const authorize = require("../../middleware/authorize");
const upload = require("../../middleware/upload");
const sendMail = require("../../helpers/sendMail");

// JOI-schemas
const registerSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
  subscription: Joi.string()
    .valid("starter", "pro", "business")
    .default("starter"),
});

const logInSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
});

const updateSubscriptionSchema = Joi.object({
  subscription: Joi.string().valid("starter", "pro", "business"),
});

const verificationEmailSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
});

// Routers
router.post("/signup", async (req, res, next) => {
  try {
    validateSchema(registerSchema, req.body);

    const { email, password, subscription } = req.body;
    const user = await User.findOne({ email });

    if (user) {
      throw createError(409, "Email already exist");
    }

    const hash = await bcrypt.hash(password, 10);
    const avatarURL = gravatar.url(email);
    const verificationToken = bson();
    const result = await User.create({
      email,
      password: hash,
      subscription,
      avatarURL,
      verificationToken,
    });

    const mail = {
      to: email,
      subject: "Please verify your account",
      html: `<a target="_blank" href="http://localhost:3000/api/users/verify/${verificationToken}">Click here to confirm your mail</a>`,
    };

    await sendMail(mail);
    res.status(201).json(result.email);
  } catch (error) {
    next(error);
  }
});

// Verif route

router.get("verify/:verificationToken", async (req, res, next) => {
  try {
    const { verificationToken } = req.params;
    const user = await User.findOne({ verificationToken });
    if (!user) {
      throw createError(404, "User not found");
    }
    await User.findByIdAndUpdate(user._id, {
      verificationToken: "",
      verify: true,
    });
    res.status(200).json({ message: "User verified" });
  } catch (error) {
    next(error);
  }
});

// user resend verification email route

router.post("/verify", async (req, res, next) => {
  try {
    validateSchema(verificationEmailSchema, req.body);
    const { email } = req.body;
    const user = User.findOne({ email });
    if (!user) {
      throw createError(404, "User not found");
    }
    if (user.verify) {
      throw createError(400, "User already verified");
    }
    const verificationToken = user.verificationToken;
    const mail = {
      to: email,
      subject: "Please verify your account",
      html: `<a target="_blank" href="http://localhost:3000/api/users/verify/${verificationToken}">Click here to confirm your mail</a>`,
    };
    await sendMail(mail);
  } catch (error) {}
});

router.post("/login", async (req, res, next) => {
  try {
    validateSchema(logInSchema, req.body);
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    const passwordValid = bcrypt.compare(password, user.password);
    if (!passwordValid || !user) {
      throw createError(401, "Invalid email or password");
    }
    if (!user.verify) {
      throw createError(401, "Email not verified");
    }
    const payload = {
      id: user._id,
    };

    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "1h" });
    await User.findByIdAndUpdate(user._id, { token });
    res.status(200).json(token);
  } catch (error) {
    next(error);
  }
});

router.get("/logout", authorize, async (req, res, next) => {
  try {
    const { _id } = req.user;
    await User.findByIdAndUpdate(_id, { token: "" });
    res.json({ message: "logged out" });
  } catch (error) {
    next(error);
  }
});

router.get("/current", authorize, async (req, res, next) => {
  const { email, phone, subscription } = req.user;
  res.json({ email, phone, subscription });
});

router.patch("/subscription", authorize, async (req, res, next) => {
  try {
    const { _id } = req.user;
    validateSchema(updateSubscriptionSchema, req.body);
    const result = await User.findByIdAndUpdate(_id, req.body, { new: true });
    res.json("subscription updated");
    if (!result) {
      throw createError(404, "User not found");
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const avatarDir = path.join(__dirname, "../../", "public", "avatars");

router.patch(
  "/avatar",
  authorize,
  upload.single("avatar"),
  async (req, res, next) => {
    try {
      const { _id } = req.user;
      const { path: tempDir, originalname } = req.file;

      const [ext] = originalname.split(".").reverse();
      const avatarName = `${_id}.${ext}`;
      const avatarPath = path.join(avatarDir, avatarName);

      await fs.rename(tempDir, avatarPath);
      const avatarURL = path.join("/avatars", avatarName);

      Jimp.read(avatarPath, (err, lenna) => {
        if (err) throw err;
        lenna.resize(250, 250).write(avatarPath);
      });

      await User.findByIdAndUpdate(_id, { avatarURL });

      res.json({ avatarURL });
    } catch (error) {
      await fs.unlink(req.file.path);
      next(error);
    }
  }
);

module.exports = router;
