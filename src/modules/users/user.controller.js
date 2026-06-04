const mongoose = require("mongoose");
const User = require("./user.model");
const Profile = require("../profiles/profile.model");
const Like = require("../likes/like.model");
const Match = require("../matches/match.model");
const Conversation = require("../chats/conversation.model");
const Message = require("../chats/message.model");

const USER_FIELDS = [
  "firebaseUid",
  "email",
  "name",
  "isProfileCompleted",
  "fcmToken",
  "subscription",
  "dailySwipeCount",
  "dailySwipeDate",
  "dailyDirectMessageCount",
  "dailyDirectMessageDate",
  "lastAppOpenAt",
  "premiumNudgeLastSentAt",
  "premiumNudgeLastScheduledAt",
];

const PROFILE_FIELDS = [
  "name",
  "gender",
  "age",
  "bio",
  "lookingFor",
  "zodiac",
  "height",
  "religion",
  "interests",
  "images",
  "location",
];

const pick = (source, allowedFields) => {
  const output = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) {
      output[field] = source[field];
    }
  }
  return output;
};

const normalizeProfilePayload = (payload = {}) => {
  const profile = pick(payload, PROFILE_FIELDS);

  if (
    Object.prototype.hasOwnProperty.call(payload, "zoidic") &&
    !Object.prototype.hasOwnProperty.call(profile, "zodiac")
  ) {
    profile.zodiac = payload.zoidic;
  }

  return profile;
};

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
};

const buildUserSearchMatch = (search) => {
  if (!search || typeof search !== "string" || !search.trim()) {
    return {};
  }

  const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  return {
    $or: [
      { name: regex },
      { email: regex },
      { firebaseUid: regex },
      { "profile.name": regex },
      { "profile.bio": regex },
    ],
  };
};

const listUsers = async (req, res, next) => {
  try {
    const { gender, plan, search } = req.query;
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const skip = (page - 1) * limit;

    const match = {};

    if (plan) {
      if (!["free", "premium"].includes(plan)) {
        return res.status(400).json({
          success: false,
          message: 'plan must be "free" or "premium"',
        });
      }
      match["subscription.plan"] = plan;
    }

    const afterLookupMatch = buildUserSearchMatch(search);

    if (gender) {
      afterLookupMatch["profile.gender"] = gender;
    }

    const pipeline = [
      {
        $match: match,
      },
      {
        $lookup: {
          from: "profiles",
          localField: "_id",
          foreignField: "userId",
          as: "profile",
        },
      },
      {
        $unwind: {
          path: "$profile",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    if (Object.keys(afterLookupMatch).length > 0) {
      pipeline.push({ $match: afterLookupMatch });
    }

    pipeline.push(
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      }
    );

    const [result] = await User.aggregate(pipeline);
    const total = result?.total?.[0]?.count || 0;

    return res.status(200).json({
      success: true,
      data: result?.data || [],
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

const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const [user, profile] = await Promise.all([
      User.findById(id).lean(),
      Profile.findOne({ userId: id }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...user,
        profile: profile || null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const body = req.body || {};
    const userPayload = pick(body, USER_FIELDS);
    const profilePayload = normalizeProfilePayload(body.profile || {});

    if (!userPayload.firebaseUid || typeof userPayload.firebaseUid !== "string") {
      return res.status(400).json({
        success: false,
        message: "firebaseUid is required",
      });
    }

    if (Object.keys(profilePayload).length > 0) {
      userPayload.isProfileCompleted = true;
      if (!userPayload.name && profilePayload.name) {
        userPayload.name = profilePayload.name;
      }
    }

    const user = await User.create(userPayload);
    let profile = null;

    if (Object.keys(profilePayload).length > 0) {
      profile = await Profile.create({
        ...profilePayload,
        userId: user._id,
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        ...user.toObject(),
        profile,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = "User already exists";
    }
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const userPayload = pick(body, USER_FIELDS);
    const profilePayload = normalizeProfilePayload(body.profile || {});

    delete userPayload.firebaseUid;

    if (Object.keys(profilePayload).length > 0) {
      userPayload.isProfileCompleted = true;
      if (profilePayload.name) {
        userPayload.name = profilePayload.name;
      }
    }

    const user =
      Object.keys(userPayload).length > 0
        ? await User.findByIdAndUpdate(id, { $set: userPayload }, { new: true, runValidators: true })
        : await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let profile = await Profile.findOne({ userId: id });

    if (Object.keys(profilePayload).length > 0) {
      profile = await Profile.findOneAndUpdate(
        { userId: id },
        { $set: profilePayload },
        { new: true, runValidators: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        ...user.toObject(),
        profile,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = "Duplicate user or profile value";
    }
    return next(error);
  }
};

const deleteUser = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const userObjectId = new mongoose.Types.ObjectId(id);
    const result = {
      deletedUser: false,
      deletedProfile: 0,
      deletedLikes: 0,
      deletedMatches: 0,
      deletedConversations: 0,
      deletedMessages: 0,
    };

    await session.withTransaction(async () => {
      const user = await User.findById(userObjectId).session(session);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      const conversations = await Conversation.find({ participants: userObjectId })
        .select("_id")
        .session(session);
      const conversationIds = conversations.map((conversation) => conversation._id);

      if (conversationIds.length > 0) {
        const deletedMessages = await Message.deleteMany({
          conversationId: { $in: conversationIds },
        }).session(session);
        result.deletedMessages = deletedMessages.deletedCount || 0;
      }

      const deletedConversations = await Conversation.deleteMany({
        participants: userObjectId,
      }).session(session);
      result.deletedConversations = deletedConversations.deletedCount || 0;

      const deletedMatches = await Match.deleteMany({
        users: userObjectId,
      }).session(session);
      result.deletedMatches = deletedMatches.deletedCount || 0;

      const deletedLikes = await Like.deleteMany({
        $or: [{ fromUserId: userObjectId }, { toUserId: userObjectId }],
      }).session(session);
      result.deletedLikes = deletedLikes.deletedCount || 0;

      const deletedProfile = await Profile.deleteOne({ userId: userObjectId }).session(session);
      result.deletedProfile = deletedProfile.deletedCount || 0;

      await User.deleteOne({ _id: userObjectId }).session(session);
      result.deletedUser = true;
    });

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  } finally {
    session.endSession();
  }
};

module.exports = {
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  updateUser,
};
