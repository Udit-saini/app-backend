const mongoose = require("mongoose");
const Like = require("./like.model");
const Match = require("../matches/match.model");
const Profile = require("../profiles/profile.model");
const User = require("../users/user.model");
const { getPrimaryImageUrl } = require("../../utils/profileImage");
const { ensureConversationForMatch } = require("../chats/chat.service");
const { sendPushNotification } = require("../notifications/notification.service");
const {
  hasActivePremium,
} = require("../subscriptions/subscription.service");
const { LIKE_PREVIEW_DELAY_MS } = require("../notifications/likePreviewNudge.service");
const { TOKEN_ACTIVITY, consumeTokens, refundTokens } = require("../tokens/token.service");

const sendError = (res, next, err) => {
  if (typeof next === "function") {
    return next(err);
  }
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  return res.status(status).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};

const findExistingMatch = async (userA, userB) => {
  return Match.findOne({
    isActive: true,
    $and: [{ users: userA }, { users: userB }],
  })
    .select("_id")
    .lean();
};

const getActionActivityKey = (action) =>
  action === "dislike" ? TOKEN_ACTIVITY.DISLIKE_PROFILE : TOKEN_ACTIVITY.LIKE_PROFILE;

const sendMatchNotifications = async ({ userAId, userBId, matchId }) => {
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: [userAId, userBId] } }).select("_id fcmToken").lean(),
    Profile.find({ userId: { $in: [userAId, userBId] } }).select("userId name").lean(),
  ]);

  const userById = new Map(users.map((user) => [String(user._id), user]));
  const profileByUserId = new Map(profiles.map((profile) => [String(profile.userId), profile]));

  const userAIdStr = String(userAId);
  const userBIdStr = String(userBId);
  const userAName = profileByUserId.get(userAIdStr)?.name || "Someone";
  const userBName = profileByUserId.get(userBIdStr)?.name || "Someone";

  await Promise.all([
    sendPushNotification({
      token: userById.get(userAIdStr)?.fcmToken,
      title: "It's a Match 🎉",
      body: `You matched with ${userBName}`,
      data: {
        type: "match",
        matchId: String(matchId),
      },
    }),
    sendPushNotification({
      token: userById.get(userBIdStr)?.fcmToken,
      title: "It's a Match 🎉",
      body: `You matched with ${userAName}`,
      data: {
        type: "match",
        matchId: String(matchId),
      },
    }),
  ]);
};

const sendLikeNotification = async ({ senderId, receiverId }) => {
  const [receiverUser, senderProfile] = await Promise.all([
    User.findById(receiverId).select("fcmToken subscription").lean(),
    Profile.findOne({ userId: senderId }).select("name").lean(),
  ]);
  const receiverIsPremium = receiverUser ? await hasActivePremium(receiverUser) : false;
  const senderName = senderProfile?.name || "Someone";
  const notification = receiverIsPremium
    ? {
        title: "💘 New like!",
        body: `${senderName} liked your profile ✨`,
      }
    : {
        title: "💘 Someone has a crush on you",
        body: "Your profile just got a like 👀 Unlock Premium to reveal who it is ✨",
      };

  await sendPushNotification({
    token: receiverUser?.fcmToken,
    title: notification.title,
    body: notification.body,
    data: {
      type: "like",
      senderId: String(senderId),
    },
  });
};

const buildFreeLikePreviewCard = () => {
  return {
    directMessageId: null,
    userId: null,
    name: "Someone nearby",
    image: null,
    isPremium: false,
    shouldBlur: true,
    isPreview: true,
    previewType: "premium_like_teaser",
    message: "Upgrade to Premium to reveal who liked you",
  };
};

const getLikePreviewAvailability = async (userId) => {
  const profile = await Profile.findOne({ userId })
    .select("createdAt")
    .lean();

  if (!profile?.createdAt) {
    return {
      available: false,
      availableAt: null,
    };
  }

  const availableAt = new Date(new Date(profile.createdAt).getTime() + LIKE_PREVIEW_DELAY_MS);

  return {
    available: Date.now() >= availableAt.getTime(),
    availableAt,
  };
};

const recordAction = async (req, res, next) => {
  try {
    const { targetUserId, action } = req.body || {};
    const currentUserId = req.user._id;
    let shouldSendLikeNotification = false;

    if (!targetUserId || !action) {
      return res.status(400).json({
        success: false,
        message: "targetUserId and action are required",
      });
    }

    if (!["like", "dislike"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be "like" or "dislike"',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid targetUserId",
      });
    }

    const targetObjectId = new mongoose.Types.ObjectId(targetUserId);
    let tokenCharge = null;

    if (String(targetObjectId) === String(currentUserId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot swipe on yourself",
      });
    }

    const existingLike = await Like.findOne({
      fromUserId: currentUserId,
      toUserId: targetObjectId,
    })
      .select("_id action")
      .lean();

    if (!existingLike) {
      const activityKey = getActionActivityKey(action);
      tokenCharge = await consumeTokens({
        userId: currentUserId,
        activityKey,
        metadata: {
          targetUserId: String(targetObjectId),
          action,
          source: "likes_action",
        },
      });

      try {
        await Like.create({
          fromUserId: currentUserId,
          toUserId: targetObjectId,
          action,
        });
      } catch (createError) {
        if (tokenCharge?.charged) {
          await refundTokens({
            userId: currentUserId,
            activityKey,
            amount: tokenCharge.cost,
            metadata: {
              reason: "like_create_failed",
              targetUserId: String(targetObjectId),
            },
          });
        }
        throw createError;
      }

      shouldSendLikeNotification = action === "like";
    } else if (existingLike.action !== action) {
      // Allow changing an existing swipe (e.g. dislike -> like) and make the API idempotent.
      const activityKey = getActionActivityKey(action);
      tokenCharge = await consumeTokens({
        userId: currentUserId,
        activityKey,
        metadata: {
          targetUserId: String(targetObjectId),
          previousAction: existingLike.action,
          action,
          source: "likes_action_change",
        },
      });

      try {
        await Like.updateOne(
          { _id: existingLike._id },
          { $set: { action } }
        );
      } catch (updateError) {
        if (tokenCharge?.charged) {
          await refundTokens({
            userId: currentUserId,
            activityKey,
            amount: tokenCharge.cost,
            metadata: {
              reason: "like_update_failed",
              targetUserId: String(targetObjectId),
            },
          });
        }
        throw updateError;
      }

      shouldSendLikeNotification = action === "like";
    }

    if (action === "dislike") {
      return res.status(200).json({ success: true, matched: false, tokenCharge });
    }

    const reverseLike = await Like.findOne({
      fromUserId: targetObjectId,
      toUserId: currentUserId,
      action: "like",
    })
      .select("_id")
      .lean();

    if (!reverseLike) {
      if (shouldSendLikeNotification) {
        await sendLikeNotification({
          senderId: currentUserId,
          receiverId: targetObjectId,
        });
      }

      return res.status(200).json({ success: true, matched: false, tokenCharge });
    }

    const existingMatch = await findExistingMatch(currentUserId, targetObjectId);
    if (existingMatch) {
      await ensureConversationForMatch(existingMatch._id);

      const targetProfile = await Profile.findOne({ userId: targetObjectId })
        .select("name images")
        .lean();

      return res.status(200).json({
        success: true,
        matched: true,
        matchId: existingMatch._id,
        tokenCharge,
        user: {
          name: targetProfile?.name || "",
          image: getPrimaryImageUrl(targetProfile?.images),
        },
      });
    }

    let newMatch;
    let isNewMatchCreated = false;
    try {
      newMatch = await Match.create({
        users: [currentUserId, targetObjectId],
        matchedAt: new Date(),
        isActive: true,
      });
      isNewMatchCreated = true;
    } catch (createErr) {
      if (createErr.code === 11000) {
        const recovered = await findExistingMatch(currentUserId, targetObjectId);
        if (recovered) {
          newMatch = { _id: recovered._id };
        } else {
          return sendError(res, next, createErr);
        }
      } else {
        return sendError(res, next, createErr);
      }
    }

    await ensureConversationForMatch(newMatch._id);

    if (isNewMatchCreated) {
      await sendMatchNotifications({
        userAId: currentUserId,
        userBId: targetObjectId,
        matchId: newMatch._id,
      });
    }

    const targetProfile = await Profile.findOne({ userId: targetObjectId })
      .select("name images")
      .lean();

    return res.status(200).json({
      success: true,
      matched: true,
      matchId: newMatch._id,
      tokenCharge,
      user: {
        name: targetProfile?.name || "",
        image: getPrimaryImageUrl(targetProfile?.images),
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      const dup = new Error("You have already swiped on this user");
      dup.statusCode = 400;
      return sendError(res, next, dup);
    }
    return sendError(res, next, error);
  }
};

const getReceivedLikes = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const likes = await Like.find({
      toUserId: currentUserId,
      action: "like",
    })
      .select("fromUserId")
      .lean();

    if (likes.length === 0) {
      return res.status(200).json({
        success: true,
        shouldBlur: false,
        data: [],
      });
    }

    const fromIds = likes.map((l) => l.fromUserId);

    const profiles = await Profile.find({ userId: { $in: fromIds } })
      .populate({
        path: "userId",
        select: "firebaseUid email name isProfileCompleted",
      })
      .lean();

    const byUserId = new Map(profiles.map((p) => [String(p.userId?._id || p.userId), p]));

    const data = likes.map((like) => {
      const p = byUserId.get(String(like.fromUserId));
      return {
        userId: like.fromUserId,
        name: p?.name || "",
        image: getPrimaryImageUrl(p?.images),
        shouldBlur: false,
        user: p?.userId || null,
        profile: p || null,
      };
    });

    return res.status(200).json({
      success: true,
      shouldBlur: false,
      data,
    });
  } catch (error) {
    return sendError(res, next, error);
  }
};

module.exports = {
  recordAction,
  getReceivedLikes,
};
