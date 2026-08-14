const mongoose = require("mongoose");

const tokenLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    activityKey: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["consume", "credit", "refund", "adjust"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    adminNote: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

tokenLedgerSchema.index({ userId: 1, createdAt: -1 });
tokenLedgerSchema.index({ activityKey: 1, createdAt: -1 });

module.exports = mongoose.model("TokenLedger", tokenLedgerSchema);
