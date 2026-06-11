const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
  {
    plan: {
      type: String,
      enum: ["premium"],
      required: true,
      default: "premium",
    },
    productId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ["android"],
      default: "android",
    },
    billingPeriod: {
      type: String,
      required: true,
      trim: true,
    },
    durationMonths: {
      type: Number,
      required: true,
      min: 1,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    highAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
      uppercase: true,
    },
    features: {
      type: [String],
      default: [],
    },
    limits: {
      dailySwipes: {
        type: mongoose.Schema.Types.Mixed,
        default: "unlimited",
      },
      dailyDirectMessages: {
        type: Number,
        default: 20,
      },
      maxNearbyRadiusKm: {
        type: Number,
        default: 100,
      },
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

subscriptionPlanSchema.index({ platform: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
