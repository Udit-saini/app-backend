const User = require("../users/user.model");
const Profile = require("../profiles/profile.model");
const Like = require("../likes/like.model");
const { hasActivePremium } = require("../subscriptions/subscription.service");
const { sendPushNotification } = require("./notification.service");

const LIKE_PREVIEW_DELAY_MS = 60 * 1000;

const sendLikePreviewNudgeIfEligible = async ({ userId, profileId }) => {
  const [user, profile] = await Promise.all([
    User.findById(userId),
    Profile.findById(profileId).select("_id userId").lean(),
  ]);

  if (!user || !profile || String(profile.userId) !== String(user._id)) {
    return;
  }

  if (!user.fcmToken || user.likePreviewNudgeSentAt) {
    return;
  }

  if (await hasActivePremium(user)) {
    return;
  }

  const realLike = await Like.findOne({
    toUserId: user._id,
    action: "like",
  })
    .select("_id")
    .lean();

  if (realLike) {
    return;
  }

  const result = await sendPushNotification({
    token: user.fcmToken,
    title: "💘 Someone noticed your profile",
    body: "A like is waiting 👀✨",
    data: {
      type: "premium_like_teaser",
      screen: "likes_received",
    },
  });

  if (result.success) {
    await User.findByIdAndUpdate(user._id, {
      $set: {
        likePreviewNudgeSentAt: new Date(),
      },
    });
  }
};

const scheduleLikePreviewNudge = ({ userId, profileId }) => {
  const timer = setTimeout(() => {
    sendLikePreviewNudgeIfEligible({ userId, profileId }).catch((error) => {
      process.stderr.write(
        `[like-preview-nudge] Failed to send notification: ${error.message || "Unknown error"}\n`
      );
    });
  }, LIKE_PREVIEW_DELAY_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
};

module.exports = {
  LIKE_PREVIEW_DELAY_MS,
  scheduleLikePreviewNudge,
};
