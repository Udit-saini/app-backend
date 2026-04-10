const dotenv = require("dotenv");

dotenv.config();

const env = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || "",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : "",
};

module.exports = env;
