const mongoose = require("mongoose");

const tokenPurchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    purchaseToken: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    tokenAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "credited", "failed", "duplicate"],
      default: "pending",
    },
    creditedLedgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TokenLedger",
      default: null,
    },
  },
  { timestamps: true }
);

tokenPurchaseSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("TokenPurchase", tokenPurchaseSchema);
