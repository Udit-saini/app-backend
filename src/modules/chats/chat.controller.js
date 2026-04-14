const mongoose = require("mongoose");
const Conversation = require("./conversation.model");
const Message = require("./message.model");
const Profile = require("../profiles/profile.model");
const User = require("../users/user.model");
const { getPrimaryImageUrl } = require("../../utils/profileImage");
const { sendMessage: persistAndBroadcastMessage } = require("./chat.service");

const getConversations = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const conversations = await Conversation.find({ participants: currentUserId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    if (conversations.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const otherUserIds = conversations.map((c) =>
      c.participants.find((p) => String(p) !== String(currentUserId))
    );

    const profiles = await Profile.find({ userId: { $in: otherUserIds } })
      .select("userId name images")
      .lean();

    const profileByUserId = new Map(profiles.map((p) => [String(p.userId), p]));

    const data = conversations.map((c) => {
      const otherId = c.participants.find((p) => String(p) !== String(currentUserId));
      const p = profileByUserId.get(String(otherId));

      return {
        conversationId: c._id,
        matchId: c.matchId,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        lastMessageSenderId: c.lastMessageSenderId,
        otherUser: {
          userId: otherId,
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

const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      const err = new Error("Invalid conversationId");
      err.statusCode = 400;
      return next(err);
    }

    const conversation = await Conversation.findById(conversationId)
      .select("participants matchId")
      .lean();

    if (!conversation) {
      const err = new Error("Conversation not found");
      err.statusCode = 404;
      return next(err);
    }

    if (!conversation.participants.some((p) => String(p) === String(currentUserId))) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      return next(err);
    }

    const messages = await Message.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
    })
      .sort({ createdAt: 1 })
      .select("conversationId senderId text messageType isSeen createdAt")
      .lean();

    return res.status(200).json({ success: true, data: messages });
  } catch (error) {
    return next(error);
  }
};

const postSendMessage = async (req, res, next) => {
  try {
    const { conversationId, text } = req.body || {};
    const io = req.app.get("io");

    const result = await persistAndBroadcastMessage({
      conversationId,
      senderId: req.user._id,
      text,
      io,
    });

    return res.status(201).json({
      success: true,
      data: result.message,
    });
  } catch (error) {
    return next(error);
  }
};

const registerFcmToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body || {};
    if (typeof fcmToken !== "string" || !fcmToken.trim()) {
      return res.status(400).json({
        success: false,
        message: "fcmToken is required",
      });
    }

    await User.findByIdAndUpdate(req.user._id, { fcmToken: fcmToken.trim() });

    return res.status(200).json({ success: true, message: "FCM token saved" });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getConversations,
  getMessages,
  postSendMessage,
  registerFcmToken,
};
