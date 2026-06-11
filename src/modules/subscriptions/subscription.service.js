const User = require("../users/user.model");
const mongoose = require("mongoose");
const SubscriptionPlan = require("./subscriptionPlan.model");

const FREE_DAILY_SWIPE_LIMIT = 10;

const DEFAULT_SUBSCRIPTION_PLANS = [
  {
    plan: "premium",
    productId: "premium_monthly",
    platform: "android",
    billingPeriod: "monthly",
    durationMonths: 1,
    title: "Premium Monthly",
    description: "Unlock premium dating features for one month.",
    amount: 0,
    highAmount: 0,
    currency: "INR",
    features: [
      "See who liked you",
      "Unlimited swipes",
      "Extended nearby radius up to 100 KM",
      "More direct messages per day",
    ],
    limits: {
      dailySwipes: "unlimited",
      dailyDirectMessages: 20,
      maxNearbyRadiusKm: 100,
    },
    sortOrder: 1,
    isActive: true,
  },
  {
    plan: "premium",
    productId: "premium_quarterly",
    platform: "android",
    billingPeriod: "quarterly",
    durationMonths: 3,
    title: "Premium Quarterly",
    description: "Unlock premium dating features for three months.",
    amount: 0,
    highAmount: 0,
    currency: "INR",
    features: [
      "See who liked you",
      "Unlimited swipes",
      "Extended nearby radius up to 100 KM",
      "More direct messages per day",
    ],
    limits: {
      dailySwipes: "unlimited",
      dailyDirectMessages: 20,
      maxNearbyRadiusKm: 100,
    },
    sortOrder: 2,
    isActive: true,
  },
  {
    plan: "premium",
    productId: "premium_yearly",
    platform: "android",
    billingPeriod: "yearly",
    durationMonths: 12,
    title: "Premium Yearly",
    description: "Unlock premium dating features for one year.",
    amount: 0,
    highAmount: 0,
    currency: "INR",
    features: [
      "See who liked you",
      "Unlimited swipes",
      "Extended nearby radius up to 100 KM",
      "More direct messages per day",
    ],
    limits: {
      dailySwipes: "unlimited",
      dailyDirectMessages: 20,
      maxNearbyRadiusKm: 100,
    },
    sortOrder: 3,
    isActive: true,
  },
];

const ensureDefaultSubscriptionPlans = async () => {
  const count = await SubscriptionPlan.countDocuments();

  if (count === 0) {
    await SubscriptionPlan.insertMany(DEFAULT_SUBSCRIPTION_PLANS);
    return;
  }

  await SubscriptionPlan.updateMany(
    {
      $or: [
        { amount: { $exists: false } },
        { highAmount: { $exists: false } },
        { currency: { $exists: false } },
      ],
    },
    {
      $set: {
        amount: 0,
        highAmount: 0,
        currency: "INR",
      },
    }
  );
};

const normalizeSubscriptionPlan = (plan) => {
  if (!plan) {
    return plan;
  }

  return {
    ...plan,
    amount: plan.amount ?? 0,
    highAmount: plan.highAmount ?? 0,
    currency: plan.currency || "INR",
  };
};

const getSubscriptionPlans = async () => {
  await ensureDefaultSubscriptionPlans();

  const plans = await SubscriptionPlan.find({
    platform: "android",
    isActive: true,
  })
    .select(
      "plan productId platform billingPeriod durationMonths title description amount highAmount currency features limits sortOrder isActive"
    )
    .sort({ sortOrder: 1, durationMonths: 1 })
    .lean();

  return {
    plans: plans.map(normalizeSubscriptionPlan),
    priceSource: "google_play_billing",
    note: "Fetch localized prices and offers from Google Play Billing using these productIds.",
  };
};

const getActiveSubscriptionPlanByProductId = async (productId) => {
  await ensureDefaultSubscriptionPlans();

  const plan = await SubscriptionPlan.findOne({
    productId,
    platform: "android",
    isActive: true,
  }).lean();

  return normalizeSubscriptionPlan(plan);
};

const validateSubscriptionPlanPayload = (payload = {}, { partial = false } = {}) => {
  const allowedFields = [
    "plan",
    "productId",
    "platform",
    "billingPeriod",
    "durationMonths",
    "title",
    "description",
    "amount",
    "highAmount",
    "currency",
    "features",
    "limits",
    "sortOrder",
    "isActive",
  ];
  const data = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      data[field] = payload[field];
    }
  }

  if (!partial) {
    for (const field of ["productId", "billingPeriod", "durationMonths", "title"]) {
      if (data[field] === undefined || data[field] === null || data[field] === "") {
        const error = new Error(`${field} is required`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  if (data.plan !== undefined && data.plan !== "premium") {
    const error = new Error('plan must be "premium"');
    error.statusCode = 400;
    throw error;
  }

  if (data.platform !== undefined && data.platform !== "android") {
    const error = new Error('platform must be "android"');
    error.statusCode = 400;
    throw error;
  }

  if (data.durationMonths !== undefined) {
    const durationMonths = Number(data.durationMonths);
    if (!Number.isFinite(durationMonths) || durationMonths < 1) {
      const error = new Error("durationMonths must be a positive number");
      error.statusCode = 400;
      throw error;
    }
    data.durationMonths = durationMonths;
  }

  if (data.sortOrder !== undefined) {
    const sortOrder = Number(data.sortOrder);
    if (!Number.isFinite(sortOrder)) {
      const error = new Error("sortOrder must be a number");
      error.statusCode = 400;
      throw error;
    }
    data.sortOrder = sortOrder;
  }

  if (data.amount !== undefined) {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      const error = new Error("amount must be a non-negative number");
      error.statusCode = 400;
      throw error;
    }
    data.amount = amount;
  }

  if (data.highAmount !== undefined) {
    const highAmount = Number(data.highAmount);
    if (!Number.isFinite(highAmount) || highAmount < 0) {
      const error = new Error("highAmount must be a non-negative number");
      error.statusCode = 400;
      throw error;
    }
    data.highAmount = highAmount;
  }

  if (data.currency !== undefined) {
    if (typeof data.currency !== "string" || !data.currency.trim()) {
      const error = new Error("currency must be a non-empty string");
      error.statusCode = 400;
      throw error;
    }
    data.currency = data.currency.trim().toUpperCase();
  }

  if (data.features !== undefined && !Array.isArray(data.features)) {
    const error = new Error("features must be an array");
    error.statusCode = 400;
    throw error;
  }

  return data;
};

const listSubscriptionPlansForAdmin = async () => {
  await ensureDefaultSubscriptionPlans();

  const plans = await SubscriptionPlan.find({})
    .sort({ sortOrder: 1, durationMonths: 1, createdAt: -1 })
    .lean();

  return plans.map(normalizeSubscriptionPlan);
};

const getSubscriptionPlanForAdmin = async (planId) => {
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    const error = new Error("Invalid plan id");
    error.statusCode = 400;
    throw error;
  }

  const plan = await SubscriptionPlan.findById(planId).lean();

  if (!plan) {
    const error = new Error("Subscription plan not found");
    error.statusCode = 404;
    throw error;
  }

  return normalizeSubscriptionPlan(plan);
};

const createSubscriptionPlanByAdmin = async (payload) => {
  const data = validateSubscriptionPlanPayload(payload);

  try {
    return await SubscriptionPlan.create({
      plan: "premium",
      platform: "android",
      isActive: true,
      ...data,
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = "productId already exists";
    }
    throw error;
  }
};

const updateSubscriptionPlanByAdmin = async (planId, payload) => {
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    const error = new Error("Invalid plan id");
    error.statusCode = 400;
    throw error;
  }

  const data = validateSubscriptionPlanPayload(payload, { partial: true });
  delete data.productId;

  if (Object.keys(data).length === 0) {
    const error = new Error("No updatable fields provided");
    error.statusCode = 400;
    throw error;
  }

  const plan = await SubscriptionPlan.findByIdAndUpdate(
    planId,
    { $set: data },
    { new: true, runValidators: true }
  );

  if (!plan) {
    const error = new Error("Subscription plan not found");
    error.statusCode = 404;
    throw error;
  }

  return plan;
};

const deleteSubscriptionPlanByAdmin = async (planId) => {
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    const error = new Error("Invalid plan id");
    error.statusCode = 400;
    throw error;
  }

  const plan = await SubscriptionPlan.findByIdAndDelete(planId).lean();

  if (!plan) {
    const error = new Error("Subscription plan not found");
    error.statusCode = 404;
    throw error;
  }

  return plan;
};

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

  if (!productId || typeof productId !== "string") {
    return {
      valid: false,
      message: "Invalid subscription product",
    };
  }

  const plan = await getActiveSubscriptionPlanByProductId(productId);

  if (!plan) {
    return {
      valid: false,
      message: "Invalid subscription product",
    };
  }

  const now = new Date();
  const expiryDate = new Date(now);
  expiryDate.setMonth(expiryDate.getMonth() + plan.durationMonths);

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
  createSubscriptionPlanByAdmin,
  deleteSubscriptionPlanByAdmin,
  getCurrentSubscription,
  getSubscriptionPlans,
  getSubscriptionPlanForAdmin,
  hasActivePremium,
  isSubscriptionCurrentlyActive,
  listSubscriptionPlansForAdmin,
  setUserSubscriptionByAdmin,
  updateSubscriptionPlanByAdmin,
  verifyAndActivateSubscription,
  verifyGooglePlaySubscription,
};
