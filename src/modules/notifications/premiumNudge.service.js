const User = require("../users/user.model");
const Like = require("../likes/like.model");
const { hasActivePremium } = require("../subscriptions/subscription.service");
const { sendPushNotification } = require("./notification.service");

const PREMIUM_NUDGE_DELAY_MS = 10 * 60 * 1000;

const getStartOfUtcDay = (date = new Date()) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const isSameUtcDay = (left, right = new Date()) => {
  if (!left) {
    return false;
  }

  return getStartOfUtcDay(left).getTime() === getStartOfUtcDay(right).getTime();
};

const isFreeUser = async (user) => {
  return !(await hasActivePremium(user));
};

const sendPremiumNudgeIfEligible = async ({ userId, scheduledAt }) => {
  const user = await User.findById(userId);

  if (!user || !user.fcmToken) {
    return;
  }

  if (!user.lastAppOpenAt || user.lastAppOpenAt.getTime() !== scheduledAt.getTime()) {
    return;
  }

  if (isSameUtcDay(user.premiumNudgeLastSentAt)) {
    return;
  }

  if (!(await isFreeUser(user))) {
    return;
  }

  const receivedLike = await Like.findOne({
    toUserId: user._id,
    action: "like",
  })
    .select("_id")
    .lean();

  const notification = receivedLike
    ? {
        title: "Someone liked you",
        body: "See who liked your profile with Premium",
        data: {
          type: "premium_like_nudge",
          screen: "likes_received",
        },
      }
    : {
        title: "More people are waiting",
        body: "Unlock Premium to discover more profiles and see likes",
        data: {
          type: "premium_nudge",
          screen: "premium",
        },
      };

  const result = await sendPushNotification({
    token: user.fcmToken,
    title: notification.title,
    body: notification.body,
    data: notification.data,
  });

  if (result.success) {
    await User.findByIdAndUpdate(user._id, {
      $set: {
        premiumNudgeLastSentAt: new Date(),
      },
    });
  }
};

const trackAppOpenAndSchedulePremiumNudge = async (user) => {
  if (!user?._id) {
    return;
  }

  const now = new Date();

  await User.findByIdAndUpdate(user._id, {
    $set: {
      lastAppOpenAt: now,
      premiumNudgeLastScheduledAt: now,
    },
  });

  if (!(await isFreeUser(user))) {
    return;
  }

  const timer = setTimeout(() => {
    sendPremiumNudgeIfEligible({
      userId: user._id,
      scheduledAt: now,
    }).catch((error) => {
      process.stderr.write(
        `[premium-nudge] Failed to send premium nudge: ${error.message || "Unknown error"}\n`
      );
    });
  }, PREMIUM_NUDGE_DELAY_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
};

module.exports = {
  trackAppOpenAndSchedulePremiumNudge,
};
