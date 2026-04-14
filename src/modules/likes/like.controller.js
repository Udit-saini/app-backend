const mongoose = require("mongoose");
const Like = require("./like.model");
const Match = require("../matches/match.model");
const Profile = require("../profiles/profile.model");
const { getPrimaryImageUrl } = require("../../utils/profileImage");
const { ensureConversationForMatch } = require("../chats/chat.service");

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
      const err = new Error("targetUserId and action are required");
      err.statusCode = 400;
      return next(err);
    }

    if (!["like", "dislike"].includes(action)) {
      const err = new Error('action must be "like" or "dislike"');
      err.statusCode = 400;
      return next(err);
    }

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      const err = new Error("Invalid targetUserId");
      err.statusCode = 400;
      return next(err);
    }

    const targetObjectId = new mongoose.Types.ObjectId(targetUserId);

    if (String(targetObjectId) === String(currentUserId)) {
      const err = new Error("You cannot swipe on yourself");
      err.statusCode = 400;
      return next(err);
    }

    const duplicate = await Like.findOne({
      fromUserId: currentUserId,
      toUserId: targetObjectId,
    })
      .select("_id")
      .lean();

    if (duplicate) {
      const err = new Error("You have already swiped on this user");
      err.statusCode = 400;
      return next(err);
    }

    await Like.create({
      fromUserId: currentUserId,
      toUserId: targetObjectId,
      action,
    });

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
          return next(createErr);
        }
      } else {
        return next(createErr);
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
      return next(dup);
    }
    return next(error);
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
    return next(error);
  }
};

module.exports = {
  recordAction,
  getReceivedLikes,
};
