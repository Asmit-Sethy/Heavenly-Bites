const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv").config();
const Stripe = require("stripe");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ===== ENV DEBUG (for Railway logs) =====
console.log("=== ENV DEBUG (startup) ===");
console.log("MONGODB_URL:", process.env.MONGODB_URL ? "SET" : "MISSING");
console.log("STRIPE_SECRET_KEY:", process.env.STRIPE_SECRET_KEY ? "SET" : "MISSING");
console.log("FRONTEND_URL:", process.env.FRONTEND_URL || "NOT SET");
console.log("===========================\n");
// =======================================

const PORT = process.env.PORT || 8080;

// ----- Contact schema -----
const contactSchema = mongoose.Schema({
  name: String,
  email: String,
  message: String,
});

const contactModel = mongoose.model("contact", contactSchema);

// ----- MongoDB connection -----
if (!process.env.MONGODB_URL) {
  console.error("❌ MONGODB_URL is not set. Exiting.");
  process.exit(1);
}

mongoose.set("strictQuery", false);
mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => console.log("✅ Connected to Database"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1); // Exit the server on MongoDB connection error
  });

// ----- User schema -----
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

// ----- Base API -----
app.get("/", (req, res) => {
  res.send("Server is running");
});

// ----- Sign up -----
app.post("/signup", async (req, res) => {
  const { email } = req.body;

  try {
    const result = await userModel.findOne({ email }).exec();

    if (result) {
      return res
        .status(400)
        .send({ message: "Email id is already registered", alert: false });
    }

    const data = userModel(req.body);
    await data.save();
    res.send({ message: "Successfully signed up", alert: true });
  } catch (error) {
    console.error("Sign up error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// ----- Contact form -----
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

// ----- Login -----
app.post("/login", async (req, res) => {
  const { email } = req.body;
  try {
    const result = await userModel.findOne({ email }).exec();

    if (result) {
      const dataSend = {
        _id: result._id,
        firstName: result.firstName,
        lastName: result.lastName,
        email: result.email,
        image: result.image,
      };
      console.log("Login success:", dataSend);
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

// ----- Product schema -----
const schemaProduct = mongoose.Schema({
  name: String,
  category: String,
  image: String,
  price: String,
  description: String,
});

const productModel = mongoose.model("product", schemaProduct);

// ----- Upload product -----
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

// ----- Get products -----
app.get("/product", async (req, res) => {
  try {
    const data = await productModel.find({});
    res.json(data);
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).send({ message: "Server error" });
  }
});

// ===== Stripe payment gateway =====
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("⚠️ STRIPE_SECRET_KEY is not set – payment route will fail.");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

app.post("/create-checkout-session", async (req, res) => {
  try {
    console.log("Incoming cart items:", req.body);

    const lineItems = req.body.map((item) => ({
      price_data: {
        currency: "inr",
        product_data: { name: item.name },
        unit_amount: Math.round(Number(item.price) * 100), // 600 -> 60000 paise
      },
      quantity: item.qty,
    }));

    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:3000"; // fallback for local

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url: `${frontendUrl}/success`,
      cancel_url: `${frontendUrl}/cancel`,
    });

    console.log("Created checkout session:", session.id, session.url);

    // Send URL (client should redirect to this)
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ----- Start server -----
app.listen(PORT, () => console.log("Server is running at port :", PORT));
