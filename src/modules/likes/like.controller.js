const mongoose = require("mongoose");
const Like = require("./like.model");
const Match = require("../matches/match.model");
const Profile = require("../profiles/profile.model");
const { getPrimaryImageUrl } = require("../../utils/profileImage");
const { ensureConversationForMatch } = require("../chats/chat.service");

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

const recordAction = async (req, res, next) => {
  try {
    const { targetUserId, action } = req.body || {};
    const currentUserId = req.user._id;

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
      await Like.create({
        fromUserId: currentUserId,
        toUserId: targetObjectId,
        action,
      });
    } else if (existingLike.action !== action) {
      // Allow changing an existing swipe (e.g. dislike -> like) and make the API idempotent.
      await Like.updateOne(
        { _id: existingLike._id },
        { $set: { action } }
      );
    }

    if (action === "dislike") {
      return res.status(200).json({ success: true, matched: false });
    }

    const reverseLike = await Like.findOne({
      fromUserId: targetObjectId,
      toUserId: currentUserId,
      action: "like",
    })
      .select("_id")
      .lean();

    if (!reverseLike) {
      return res.status(200).json({ success: true, matched: false });
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
        user: {
          name: targetProfile?.name || "",
          image: getPrimaryImageUrl(targetProfile?.images),
        },
      });
    }

    let newMatch;
    try {
      newMatch = await Match.create({
        users: [currentUserId, targetObjectId],
        matchedAt: new Date(),
        isActive: true,
      });
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

    const targetProfile = await Profile.findOne({ userId: targetObjectId })
      .select("name images")
      .lean();

    return res.status(200).json({
      success: true,
      matched: true,
      matchId: newMatch._id,
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
      return res.status(200).json({ success: true, data: [] });
    }

    const fromIds = likes.map((l) => l.fromUserId);

    const profiles = await Profile.find({ userId: { $in: fromIds } })
      .select("userId name images")
      .lean();

    const byUserId = new Map(profiles.map((p) => [String(p.userId), p]));

    const data = likes.map((like) => {
      const p = byUserId.get(String(like.fromUserId));
      return {
        userId: like.fromUserId,
        name: p?.name || "",
        image: getPrimaryImageUrl(p?.images),
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, next, error);
  }
};

module.exports = {
  recordAction,
  getReceivedLikes,
};
