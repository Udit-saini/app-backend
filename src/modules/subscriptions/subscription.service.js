const User = require("../users/user.model");
const mongoose = require("mongoose");

const FREE_DAILY_SWIPE_LIMIT = 10;

const VALID_ANDROID_PRODUCTS = new Set([
  "premium_monthly",
  "premium_quarterly",
  "premium_yearly",
]);

const getStartOfUtcDay = (date = new Date()) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const isSameUtcDay = (left, right = new Date()) => {
  if (!left) {
    return false;
  }

  return getStartOfUtcDay(left).getTime() === getStartOfUtcDay(right).getTime();
};

const isSubscriptionCurrentlyActive = (subscription = {}) => {
  if (subscription.plan !== "premium") {
    return false;
  }

  if (subscription.status !== "active") {
    return false;
  }

  if (!subscription.expiryDate) {
    return false;
  }

  return new Date(subscription.expiryDate).getTime() > Date.now();
};

const sanitizeSubscription = (subscription = {}) => {
  return {
    plan: subscription.plan || "free",
    status: subscription.status || "active",
    productId: subscription.productId || null,
    platform: subscription.platform || "android",
    startDate: subscription.startDate || null,
    expiryDate: subscription.expiryDate || null,
    autoRenewing: Boolean(subscription.autoRenewing),
  };
};

const ensureFreshSubscriptionStatus = async (user) => {
  if (!user) {
    return null;
  }

  const subscription = user.subscription || {};
  const shouldExpire =
    subscription.plan === "premium" &&
    subscription.status === "active" &&
    subscription.expiryDate &&
    new Date(subscription.expiryDate).getTime() <= Date.now();

  if (!shouldExpire) {
    return user;
  }

  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        "subscription.plan": "free",
        "subscription.status": "expired",
        "subscription.autoRenewing": false,
      },
    },
    { new: true }
  );

  return updatedUser;
};

const verifyGooglePlaySubscription = async ({ purchaseToken, productId }) => {
  if (!purchaseToken || typeof purchaseToken !== "string" || purchaseToken.trim().length < 8) {
    return {
      valid: false,
      message: "Invalid purchase token",
    };
  }

  if (!productId || typeof productId !== "string" || !VALID_ANDROID_PRODUCTS.has(productId)) {
    return {
      valid: false,
      message: "Invalid subscription product",
    };
  }

  const now = new Date();
  const expiryDate = new Date(now);

  if (productId === "premium_yearly") {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  } else if (productId === "premium_quarterly") {
    expiryDate.setMonth(expiryDate.getMonth() + 3);
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  }

  return {
    valid: true,
    expiryDate,
    autoRenewing: true,
    startDate: now,
    platform: "android",
  };
};

const verifyAndActivateSubscription = async ({ userId, purchaseToken, productId }) => {
  const verification = await verifyGooglePlaySubscription({ purchaseToken, productId });

  if (!verification.valid) {
    const error = new Error(verification.message || "Subscription verification failed");
    error.statusCode = 400;
    throw error;
  }

  if (!verification.expiryDate || new Date(verification.expiryDate).getTime() <= Date.now()) {
    const error = new Error("Subscription is expired");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        "subscription.plan": "premium",
        "subscription.status": "active",
        "subscription.productId": productId,
        "subscription.purchaseToken": purchaseToken,
        "subscription.platform": "android",
        "subscription.startDate": verification.startDate || new Date(),
        "subscription.expiryDate": verification.expiryDate,
        "subscription.autoRenewing": Boolean(verification.autoRenewing),
      },
    },
    { new: true }
  );

  if (!user) {
    const error = new Error("Authenticated user not found");
    error.statusCode = 404;
    throw error;
  }

  return sanitizeSubscription(user.subscription);
};

const getCurrentSubscription = async (user) => {
  const freshUser = await ensureFreshSubscriptionStatus(user);
  return sanitizeSubscription(freshUser?.subscription);
};

const cancelSubscriptionLocally = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        "subscription.status": "cancelled",
        "subscription.autoRenewing": false,
      },
    },
    { new: true }
  );

  if (!user) {
    const error = new Error("Authenticated user not found");
    error.statusCode = 404;
    throw error;
  }

  return sanitizeSubscription(user.subscription);
};

const setUserSubscriptionByAdmin = async ({
  userId,
  plan,
  productId,
  expiryDate,
  autoRenewing,
}) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid userId");
    error.statusCode = 400;
    throw error;
  }

  if (!["free", "premium"].includes(plan)) {
    const error = new Error('plan must be "free" or "premium"');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();
  const update = {};

  if (plan === "premium") {
    const premiumExpiryDate = expiryDate ? new Date(expiryDate) : new Date(now);

    if (!expiryDate) {
      premiumExpiryDate.setMonth(premiumExpiryDate.getMonth() + 1);
    }

    if (Number.isNaN(premiumExpiryDate.getTime()) || premiumExpiryDate.getTime() <= Date.now()) {
      const error = new Error("expiryDate must be a valid future date for premium plan");
      error.statusCode = 400;
      throw error;
    }

    update.$set = {
      "subscription.plan": "premium",
      "subscription.status": "active",
      "subscription.productId": productId || "admin_premium",
      "subscription.purchaseToken": "admin_grant",
      "subscription.platform": "android",
      "subscription.startDate": now,
      "subscription.expiryDate": premiumExpiryDate,
      "subscription.autoRenewing": Boolean(autoRenewing),
    };
  } else {
    update.$set = {
      "subscription.plan": "free",
      "subscription.status": "cancelled",
      "subscription.productId": null,
      "subscription.purchaseToken": null,
      "subscription.platform": "android",
      "subscription.startDate": null,
      "subscription.expiryDate": null,
      "subscription.autoRenewing": false,
    };
  }

  const user = await User.findByIdAndUpdate(userId, update, { new: true });

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    userId: user._id,
    subscription: sanitizeSubscription(user.subscription),
  };
};

const hasActivePremium = async (user) => {
  const freshUser = await ensureFreshSubscriptionStatus(user);
  return isSubscriptionCurrentlyActive(freshUser?.subscription);
};

const consumeSwipeIfAllowed = async (user) => {
  const freshUser = await ensureFreshSubscriptionStatus(user);

  if (isSubscriptionCurrentlyActive(freshUser?.subscription)) {
    return {
      allowed: true,
      unlimited: true,
      dailySwipeCount: freshUser.dailySwipeCount || 0,
      dailySwipeLimit: null,
    };
  }

  const today = getStartOfUtcDay();
  const currentCount = isSameUtcDay(freshUser.dailySwipeDate) ? freshUser.dailySwipeCount || 0 : 0;

  if (currentCount >= FREE_DAILY_SWIPE_LIMIT) {
    return {
      allowed: false,
      unlimited: false,
      dailySwipeCount: currentCount,
      dailySwipeLimit: FREE_DAILY_SWIPE_LIMIT,
    };
  }

  const updatedUser = await User.findByIdAndUpdate(
    freshUser._id,
    {
      $set: {
        dailySwipeDate: today,
        dailySwipeCount: currentCount + 1,
      },
    },
    { new: true }
  );

  return {
    allowed: true,
    unlimited: false,
    dailySwipeCount: updatedUser.dailySwipeCount,
    dailySwipeLimit: FREE_DAILY_SWIPE_LIMIT,
  };
};

module.exports = {
  FREE_DAILY_SWIPE_LIMIT,
  cancelSubscriptionLocally,
  consumeSwipeIfAllowed,
  getCurrentSubscription,
  hasActivePremium,
  isSubscriptionCurrentlyActive,
  setUserSubscriptionByAdmin,
  verifyAndActivateSubscription,
  verifyGooglePlaySubscription,
};
