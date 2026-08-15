const mongoose = require("mongoose");
const User = require("../users/user.model");
const SubscriptionPlan = require("../subscriptions/subscriptionPlan.model");
const TokenConfig = require("./tokenConfig.model");
const TokenLedger = require("./tokenLedger.model");

const TOKEN_ACTIVITY = {
  LIKE_PROFILE: "like_profile",
  DISLIKE_PROFILE: "dislike_profile",
  DIRECT_MESSAGE: "direct_message",
  CHAT_MESSAGE: "chat_message",
};

const DEFAULT_DAILY_TOKEN_GRANT = 0;
const DEFAULT_FREE_TOKENS = 100;

const DEFAULT_TOKEN_CONFIGS = [
  {
    key: TOKEN_ACTIVITY.LIKE_PROFILE,
    label: "Like profile",
    cost: 2,
    description: "Deducted when a user likes a profile from discovery or nearby feed.",
  },
  {
    key: TOKEN_ACTIVITY.DISLIKE_PROFILE,
    label: "Dislike profile",
    cost: 0,
    description: "Deducted when a user dislikes/skips a profile from discovery or nearby feed.",
  },
  {
    key: TOKEN_ACTIVITY.DIRECT_MESSAGE,
    label: "Direct message request",
    cost: 10,
    description: "Deducted when a user sends a direct message request.",
  },
  {
    key: TOKEN_ACTIVITY.CHAT_MESSAGE,
    label: "Conversation message",
    cost: 2,
    description: "Deducted for every message sent inside an existing conversation.",
  },
];

const normalizeBalance = (value) => Math.max(0, Number(value || 0));
const normalizeGrant = (value) => Math.max(0, Number(value || 0));

const getStartOfUtcDay = (date = new Date()) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const isSameUtcDay = (left, right = new Date()) => {
  if (!left) {
    return false;
  }

  return getStartOfUtcDay(left).getTime() === getStartOfUtcDay(right).getTime();
};

const buildInsufficientTokenError = ({ requiredTokens, availableTokens, activityKey }) => {
  const error = new Error("Not enough tokens. Please top up tokens to continue.");
  error.statusCode = 402;
  error.code = "INSUFFICIENT_TOKENS";
  error.requiredTokens = requiredTokens;
  error.availableTokens = availableTokens;
  error.activityKey = activityKey;
  return error;
};

const ensureDefaultTokenConfigs = async () => {
  for (const config of DEFAULT_TOKEN_CONFIGS) {
    await TokenConfig.updateOne(
      { key: config.key },
      {
        $setOnInsert: config,
      },
      { upsert: true }
    );
  }
};

const backfillUserTokenBalances = async () => {
  await User.updateMany(
    {
      $or: [{ tokenBalance: { $exists: false } }, { tokenBalance: null }],
    },
    { $set: { tokenBalance: DEFAULT_FREE_TOKENS } }
  );
};

const initializeTokenSystem = async () => {
  await ensureDefaultTokenConfigs();
  await backfillUserTokenBalances();
};

const isSubscriptionCurrentlyActive = (subscription = {}) => {
  return (
    subscription.plan === "premium" &&
    subscription.status === "active" &&
    subscription.expiryDate &&
    new Date(subscription.expiryDate).getTime() > Date.now()
  );
};

const getUserDailyTokenGrant = async (user) => {
  if (!isSubscriptionCurrentlyActive(user?.subscription)) {
    return DEFAULT_DAILY_TOKEN_GRANT;
  }

  const plan = await SubscriptionPlan.findOne({
    productId: user.subscription.productId,
    platform: user.subscription.platform || "android",
    isActive: true,
  })
    .select("limits.dailyTokenGrant")
    .lean();

  return normalizeGrant(plan?.limits?.dailyTokenGrant);
};

const ensureUserTokenBalance = async (userId) => {
  let user = await User.findById(userId)
    .select("_id tokenBalance subscription lastDailyTokenGrantAt lastDailyTokenGrantAmount")
    .lean();

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (user.tokenBalance === undefined || user.tokenBalance === null) {
    user = await User.findByIdAndUpdate(
      userId,
      { $set: { tokenBalance: DEFAULT_FREE_TOKENS } },
      { new: true }
    )
      .select("_id tokenBalance subscription lastDailyTokenGrantAt lastDailyTokenGrantAmount")
      .lean();
  }

  const dailyTokenGrant = await getUserDailyTokenGrant(user);
  const today = getStartOfUtcDay();
  const baseBalance = user.tokenBalance;
  const previousGrantToday = isSameUtcDay(user.lastDailyTokenGrantAt, today)
    ? normalizeGrant(user.lastDailyTokenGrantAmount)
    : 0;
  const grantToCredit = Math.max(0, dailyTokenGrant - previousGrantToday);

  if (grantToCredit <= 0) {
    return {
      ...user,
      tokenBalance: baseBalance,
      dailyTokenGrant,
    };
  }

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { lastDailyTokenGrantAt: { $exists: false } },
        { lastDailyTokenGrantAt: null },
        { lastDailyTokenGrantAt: { $lt: today } },
        {
          lastDailyTokenGrantAt: today,
          lastDailyTokenGrantAmount: { $lt: dailyTokenGrant },
        },
        {
          lastDailyTokenGrantAt: today,
          lastDailyTokenGrantAmount: { $exists: false },
        },
      ],
    },
    {
      $set: {
        lastDailyTokenGrantAt: today,
        lastDailyTokenGrantAmount: dailyTokenGrant,
      },
      $inc: { tokenBalance: grantToCredit },
    },
    { new: true }
  )
    .select("_id tokenBalance subscription lastDailyTokenGrantAt lastDailyTokenGrantAmount")
    .lean();

  if (!updatedUser) {
    const currentUser = await User.findById(userId)
      .select("_id tokenBalance subscription lastDailyTokenGrantAt lastDailyTokenGrantAmount")
      .lean();

    return {
      ...currentUser,
      dailyTokenGrant,
    };
  }

  await createLedgerEntry({
    userId,
    activityKey: "daily_token_grant",
    type: "credit",
    amount: grantToCredit,
    balanceBefore: normalizeBalance(baseBalance),
    balanceAfter: normalizeBalance(updatedUser.tokenBalance),
    metadata: {
      source: "subscription_daily_grant",
      grantDate: today.toISOString(),
      dailyTokenGrant,
      productId: updatedUser.subscription?.productId || null,
    },
  });

  return {
    ...updatedUser,
    dailyTokenGrant,
  };
};

const getTokenConfigs = async () => {
  await ensureDefaultTokenConfigs();
  return TokenConfig.find({}).sort({ createdAt: 1 }).lean();
};

const getActiveTokenConfig = async (activityKey) => {
  await ensureDefaultTokenConfigs();
  const config = await TokenConfig.findOne({ key: activityKey }).lean();

  if (!config || !config.isActive) {
    return {
      key: activityKey,
      cost: 0,
      isActive: false,
    };
  }

  return config;
};

const getWallet = async (userId) => {
  const user = await ensureUserTokenBalance(userId);
  const configs = await getTokenConfigs();

  return {
    tokenBalance: normalizeBalance(user.tokenBalance),
    dailyTokenGrant: normalizeGrant(user.dailyTokenGrant),
    freeTokenGrant: DEFAULT_FREE_TOKENS,
    lastDailyTokenGrantAt: user.lastDailyTokenGrantAt || null,
    lastDailyTokenGrantAmount: normalizeGrant(user.lastDailyTokenGrantAmount),
    costs: configs.reduce((map, config) => {
      map[config.key] = {
        label: config.label,
        cost: config.cost,
        isActive: config.isActive,
      };
      return map;
    }, {}),
  };
};

const createLedgerEntry = async ({
  userId,
  activityKey,
  type,
  amount,
  balanceBefore,
  balanceAfter,
  metadata = {},
  adminNote = "",
}) => {
  return TokenLedger.create({
    userId,
    activityKey,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    metadata,
    adminNote,
  });
};

const consumeTokens = async ({ userId, activityKey, metadata = {} }) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid userId");
    error.statusCode = 400;
    throw error;
  }

  const config = await getActiveTokenConfig(activityKey);
  const cost = Number(config.cost || 0);

  if (cost <= 0) {
    const user = await ensureUserTokenBalance(userId);
    return {
      charged: false,
      activityKey,
      cost: 0,
      tokenBalance: normalizeBalance(user.tokenBalance),
    };
  }

  await ensureUserTokenBalance(userId);

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      tokenBalance: { $gte: cost },
    },
    { $inc: { tokenBalance: -cost } },
    { new: true }
  )
    .select("_id tokenBalance")
    .lean();

  if (!updatedUser) {
    const currentUser = await User.findById(userId).select("_id tokenBalance").lean();
    throw buildInsufficientTokenError({
      requiredTokens: cost,
      availableTokens: normalizeBalance(currentUser?.tokenBalance),
      activityKey,
    });
  }

  const balanceAfter = normalizeBalance(updatedUser.tokenBalance);
  const balanceBefore = balanceAfter + cost;

  await createLedgerEntry({
    userId,
    activityKey,
    type: "consume",
    amount: cost,
    balanceBefore,
    balanceAfter,
    metadata,
  });

  return {
    charged: true,
    activityKey,
    cost,
    tokenBalance: balanceAfter,
  };
};

const refundTokens = async ({ userId, activityKey, amount, metadata = {} }) => {
  const refundAmount = Number(amount || 0);

  if (refundAmount <= 0) {
    return null;
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $inc: { tokenBalance: refundAmount } },
    { new: true }
  )
    .select("_id tokenBalance")
    .lean();

  if (!updatedUser) {
    return null;
  }

  const balanceAfter = normalizeBalance(updatedUser.tokenBalance);
  const balanceBefore = Math.max(0, balanceAfter - refundAmount);

  await createLedgerEntry({
    userId,
    activityKey,
    type: "refund",
    amount: refundAmount,
    balanceBefore,
    balanceAfter,
    metadata,
  });

  return {
    activityKey,
    amount: refundAmount,
    tokenBalance: balanceAfter,
  };
};

const creditTokens = async ({ userId, amount, activityKey = "admin_top_up", adminNote = "", metadata = {} }) => {
  const creditAmount = Number(amount);

  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    const error = new Error("amount must be a positive number");
    error.statusCode = 400;
    throw error;
  }

  await ensureUserTokenBalance(userId);

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $inc: { tokenBalance: creditAmount } },
    { new: true }
  )
    .select("_id tokenBalance")
    .lean();

  if (!updatedUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const balanceAfter = normalizeBalance(updatedUser.tokenBalance);
  const balanceBefore = Math.max(0, balanceAfter - creditAmount);

  await createLedgerEntry({
    userId,
    activityKey,
    type: "credit",
    amount: creditAmount,
    balanceBefore,
    balanceAfter,
    metadata,
    adminNote,
  });

  return {
    tokenBalance: balanceAfter,
    credited: creditAmount,
  };
};

const setTokenBalance = async ({ userId, tokenBalance, adminNote = "" }) => {
  const nextBalance = Number(tokenBalance);

  if (!Number.isFinite(nextBalance) || nextBalance < 0) {
    const error = new Error("tokenBalance must be zero or a positive number");
    error.statusCode = 400;
    throw error;
  }

  const currentUser = await ensureUserTokenBalance(userId);
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: { tokenBalance: nextBalance } },
    { new: true }
  )
    .select("_id tokenBalance")
    .lean();

  await createLedgerEntry({
    userId,
    activityKey: "admin_set_balance",
    type: "adjust",
    amount: Math.abs(nextBalance - normalizeBalance(currentUser.tokenBalance)),
    balanceBefore: normalizeBalance(currentUser.tokenBalance),
    balanceAfter: normalizeBalance(updatedUser.tokenBalance),
    adminNote,
  });

  return {
    tokenBalance: normalizeBalance(updatedUser.tokenBalance),
  };
};

const updateTokenConfig = async ({ key, cost, label, description, isActive }) => {
  await ensureDefaultTokenConfigs();
  const nextCost = Number(cost);

  if (!key || typeof key !== "string") {
    const error = new Error("key is required");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(nextCost) || nextCost < 0) {
    const error = new Error("cost must be zero or a positive number");
    error.statusCode = 400;
    throw error;
  }

  const update = {
    cost: nextCost,
  };

  if (label !== undefined) update.label = label;
  if (description !== undefined) update.description = description;
  if (isActive !== undefined) update.isActive = Boolean(isActive);

  const config = await TokenConfig.findOneAndUpdate(
    { key },
    { $set: update, $setOnInsert: { key } },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  return config;
};

const getLedger = async ({ userId, page = 1, limit = 50 }) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid userId");
    error.statusCode = 400;
    throw error;
  }

  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
  const skip = (safePage - 1) * safeLimit;

  const [data, total] = await Promise.all([
    TokenLedger.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    TokenLedger.countDocuments({ userId }),
  ]);

  return {
    data,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

module.exports = {
  DEFAULT_DAILY_TOKEN_GRANT,
  DEFAULT_FREE_TOKENS,
  TOKEN_ACTIVITY,
  consumeTokens,
  creditTokens,
  ensureDefaultTokenConfigs,
  ensureUserTokenBalance,
  getLedger,
  getTokenConfigs,
  getWallet,
  initializeTokenSystem,
  refundTokens,
  setTokenBalance,
  updateTokenConfig,
};
