const mongoose = require("mongoose");
const Match = require("./match.model");
const Like = require("../likes/like.model");
const Conversation = require("../chats/conversation.model");
const Message = require("../chats/message.model");
const Profile = require("../profiles/profile.model");
const { getPrimaryImageUrl } = require("../../utils/profileImage");

const listMatches = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const matches = await Match.find({
      users: currentUserId,
      isActive: true,
    })
      .select("users")
      .lean();

    if (matches.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const otherUserIds = matches.map((m) => {
      const other = m.users.find((uid) => String(uid) !== String(currentUserId));
      return other;
    });

    const profiles = await Profile.find({ userId: { $in: otherUserIds } })
      .populate({
        path: "userId",
        select: "firebaseUid email name isProfileCompleted",
      })
      .lean();

    const profileByUserId = new Map(profiles.map((p) => [String(p.userId?._id || p.userId), p]));

    const data = matches.map((m) => {
      const otherUserId = m.users.find((uid) => String(uid) !== String(currentUserId));
      const p = profileByUserId.get(String(otherUserId));

      return {
        matchId: m._id,
        userId: otherUserId,
        user: p?.userId || null,
        profile: p || null,
        preview: {
          userId: otherUserId,
          name: p?.name || "",
          image: getPrimaryImageUrl(p?.images),
        },
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const unmatch = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { matchId } = req.params;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid matchId",
      });
    }

    let cleanupStats = {
      deletedMatch: false,
      deletedConversation: false,
      deletedMessages: 0,
      deletedLikes: 0,
    };

    await session.withTransaction(async () => {
      const match = await Match.findById(matchId).session(session);

      if (!match || !match.isActive) {
        const err = new Error("Match not found");
        err.statusCode = 404;
        throw err;
      }

      const isParticipant = match.users.some((uid) => String(uid) === String(currentUserId));
      if (!isParticipant) {
        const err = new Error("Forbidden");
        err.statusCode = 403;
        throw err;
      }

      const [userA, userB] = match.users;

      const conversation = await Conversation.findOne({ matchId: match._id })
        .select("_id")
        .session(session);

      if (conversation) {
        const deletedMessages = await Message.deleteMany({ conversationId: conversation._id }).session(
          session
        );
        cleanupStats.deletedMessages = deletedMessages.deletedCount || 0;

        await Conversation.deleteOne({ _id: conversation._id }).session(session);
        cleanupStats.deletedConversation = true;
      }

      const deletedLikes = await Like.deleteMany({
        $or: [
          { fromUserId: userA, toUserId: userB },
          { fromUserId: userB, toUserId: userA },
        ],
      }).session(session);
      cleanupStats.deletedLikes = deletedLikes.deletedCount || 0;

      await Match.deleteOne({ _id: match._id }).session(session);
      cleanupStats.deletedMatch = true;
    });

    return res.status(200).json({
      success: true,
      message: "Unmatched successfully",
      data: cleanupStats,
    });
  } catch (error) {
    return next(error);
  } finally {
    session.endSession();
  }
};

module.exports = {
  listMatches,
  unmatch,
};
