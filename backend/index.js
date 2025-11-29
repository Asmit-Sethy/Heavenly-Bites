const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv").config();
const Stripe = require("stripe");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ------------------- ENV + CONFIG -------------------
const PORT = process.env.PORT || 8080;
const MONGODB_URL = process.env.MONGODB_URL;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Debug logs for Railway
console.log("MONGODB_URL present:", !!MONGODB_URL);
console.log("STRIPE_SECRET_KEY present:", !!STRIPE_SECRET_KEY);
console.log("FRONTEND_URL:", FRONTEND_URL);

// ------------------- MONGODB CONNECTION -------------------
mongoose.set("strictQuery", false);

if (!MONGODB_URL) {
  console.error("❌ MONGODB_URL is not set in environment variables");
} else {
  mongoose
    .connect(MONGODB_URL)
    .then(() => console.log("✅ Connected to Database"))
    .catch((err) => {
      console.error("MongoDB connection error:", err);
      // DO NOT process.exit here on Railway; let app keep running for logs
    });
}

// ------------------- SCHEMAS & MODELS -------------------
const contactSchema = mongoose.Schema({
  name: String,
  email: String,
  message: String,
});

const contactModel = mongoose.model("contact", contactSchema);

const userSchema = mongoose.Schema({
  firstName: String,
  lastName: String,
  email: {
    type: String,
    unique: true,
  },
  password: String,
  confirmPassword: String,
  image: String,
});

const userModel = mongoose.model("user", userSchema);

const schemaProduct = mongoose.Schema({
  name: String,
  category: String,
  image: String,
  price: String,
  description: String,
});

const productModel = mongoose.model("product", schemaProduct);

// ------------------- BASIC API -------------------
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Sign up
app.post("/signup", async (req, res) => {
  const { email } = req.body;

  try {
    const result = await userModel.findOne({ email: email });

    if (result) {
      res
        .status(400)
        .send({ message: "Email id is already registered", alert: false });
    } else {
      const data = userModel(req.body);
      await data.save();
      res.send({ message: "Successfully signed up", alert: true });
    }
  } catch (error) {
    console.error("Sign up error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// Contact form
app.post("/submitContactForm", async (req, res) => {
  const { name, email, message } = req.body;

  try {
    const data = contactModel({ name, email, message });
    const savedData = await data.save();
    res
      .status(201)
      .json({ message: "Form submitted successfully", data: savedData });
  } catch (error) {
    console.error("Contact form submission error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email } = req.body;
  try {
    const result = await userModel.findOne({ email: email }).exec();

    if (result) {
      const dataSend = {
        _id: result._id,
        firstName: result.firstName,
        lastName: result.lastName,
        email: result.email,
        image: result.image,
      };
      console.log("Login data:", dataSend);
      res.send({
        message: "Login successfully",
        alert: true,
        data: dataSend,
      });
    } else {
      res
        .status(400)
        .send({ message: "Email not found, Please Sign up!", alert: false });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// ------------------- PRODUCTS -------------------
app.post("/uploadProduct", async (req, res) => {
  try {
    const data = productModel(req.body);
    await data.save();
    res.send({ message: "Successfully uploaded!" });
  } catch (err) {
    console.error("Upload product error:", err);
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/product", async (req, res) => {
  try {
    const data = await productModel.find({});
    res.json(data);
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).send({ message: "Server error" });
  }
});

// ------------------- STRIPE / CHECKOUT -------------------
let stripe = null;
if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is not set – payment route will fail.");
} else {
  stripe = new Stripe(STRIPE_SECRET_KEY);
}

app.post("/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res
        .status(500)
        .json({ error: "Stripe is not configured on the server" });
    }

    console.log("Incoming cart items:", req.body);

    const line_items = req.body.map((item) => ({
      price_data: {
        currency: "inr",
        product_data: { name: item.name },
        unit_amount: Math.round(Number(item.price) * 100), // Rs -> paise
      },
      quantity: item.qty,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${FRONTEND_URL}/success`,
      cancel_url: `${FRONTEND_URL}/cancel`,
    });

    console.log("Created checkout session:", session.id, session.url);
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ------------------- START SERVER -------------------
app.listen(PORT, () =>
  console.log("Server is running at port :", PORT)
);
