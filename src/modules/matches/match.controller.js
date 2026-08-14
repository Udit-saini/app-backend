const mongoose = require("mongoose");
const Match = require("./match.model");
const Like = require("../likes/like.model");
const Conversation = require("../chats/conversation.model");
const Message = require("../chats/message.model");
const Profile = require("../profiles/profile.model");
const User = require("../users/user.model");
const { getPrimaryImageUrl } = require("../../utils/profileImage");

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
};

const summarizeUser = (userId, userById, profileByUserId) => {
  const key = String(userId);
  const user = userById.get(key);
  const profile = profileByUserId.get(key);

  return {
    id: key,
    firebaseUid: user?.firebaseUid || "",
    email: user?.email || "",
    name: user?.name || profile?.name || "",
    isProfileCompleted: Boolean(user?.isProfileCompleted),
    subscription: user?.subscription || null,
    profile: profile
      ? {
          id: String(profile._id),
          name: profile.name || "",
          gender: profile.gender || "",
          age: profile.age || null,
          bio: profile.bio || "",
          lookingFor: profile.lookingFor || "",
          zodiac: profile.zodiac || "",
          height: profile.height || null,
          religion: profile.religion || "",
          interests: profile.interests || [],
          images: profile.images || [],
          image: getPrimaryImageUrl(profile.images),
          location: profile.location || null,
        }
      : null,
  };
};

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

const listAdminMatches = async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 100, 500);
    const skip = (page - 1) * limit;
    const matchQuery = {};

    if (req.query.active !== "all") {
      matchQuery.isActive = req.query.active === "false" ? false : true;
    }

    if (req.query.userId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
        return res.status(400).json({ success: false, message: "Invalid userId" });
      }
      matchQuery.users = new mongoose.Types.ObjectId(req.query.userId);
    }

    const [matches, total] = await Promise.all([
      Match.find(matchQuery).sort({ matchedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Match.countDocuments(matchQuery),
    ]);

    const userIds = [
      ...new Set(matches.flatMap((match) => match.users.map((userId) => String(userId)))),
    ];
    const matchIds = matches.map((match) => match._id);

    const [users, profiles, conversations] = await Promise.all([
      User.find({ _id: { $in: userIds } })
        .select("firebaseUid email name isProfileCompleted subscription createdAt lastAppOpenAt")
        .lean(),
      Profile.find({ userId: { $in: userIds } }).lean(),
      Conversation.find({ matchId: { $in: matchIds } })
        .select("matchId lastMessage lastMessageAt conversationType")
        .lean(),
    ]);

    const userById = new Map(users.map((user) => [String(user._id), user]));
    const profileByUserId = new Map(profiles.map((profile) => [String(profile.userId), profile]));
    const conversationByMatchId = new Map(
      conversations.map((conversation) => [String(conversation.matchId), conversation])
    );
    const byUserMap = new Map();

    const data = matches.map((match) => {
      const [firstUserId, secondUserId] = match.users.map((userId) => String(userId));
      const userA = summarizeUser(firstUserId, userById, profileByUserId);
      const userB = summarizeUser(secondUserId, userById, profileByUserId);
      const conversation = conversationByMatchId.get(String(match._id));
      const row = {
        matchId: String(match._id),
        pairKey: match.pairKey || "",
        matchedAt: match.matchedAt,
        isActive: match.isActive,
        users: [userA, userB],
        conversation: conversation
          ? {
              id: String(conversation._id),
              type: conversation.conversationType,
              lastMessage: conversation.lastMessage || "",
              lastMessageAt: conversation.lastMessageAt,
            }
          : null,
      };

      for (const [user, matchedWith] of [
        [userA, userB],
        [userB, userA],
      ]) {
        if (!byUserMap.has(user.id)) {
          byUserMap.set(user.id, {
            user,
            matchCount: 0,
            matches: [],
          });
        }

        const entry = byUserMap.get(user.id);
        entry.matchCount += 1;
        entry.matches.push({
          matchId: row.matchId,
          matchedAt: row.matchedAt,
          isActive: row.isActive,
          matchedWith,
          conversation: row.conversation,
        });
      }

      return row;
    });

    return res.status(200).json({
      success: true,
      data,
      byUser: Array.from(byUserMap.values()).sort((first, second) => second.matchCount - first.matchCount),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
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
  listAdminMatches,
  listMatches,
  unmatch,
};
