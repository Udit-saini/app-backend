const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: "" },
    name: { type: String, default: "" },
    isProfileCompleted: { type: Boolean, default: false },
    fcmToken: { type: String, default: null },
    subscription: {
      plan: {
        type: String,
        enum: ["free", "premium"],
        default: "free",
      },
      status: {
        type: String,
        enum: ["active", "expired", "cancelled"],
        default: "active",
      },
      productId: { type: String, default: null },
      purchaseToken: { type: String, default: null },
      platform: {
        type: String,
        enum: ["android"],
        default: "android",
      },
      startDate: { type: Date, default: null },
      expiryDate: { type: Date, default: null },
      autoRenewing: { type: Boolean, default: false },
    },
    dailySwipeCount: {
      type: Number,
      default: 0,
    },
    dailySwipeDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
