const mongoose = require("mongoose");
const env = require("./env");

const connectDB = async () => {
  if (!env.mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  try {
    await mongoose.connect(env.mongoUri);
  } catch (error) {
    throw new Error(`MongoDB connection failed: ${error.message}`);
  }
};

module.exports = connectDB;
