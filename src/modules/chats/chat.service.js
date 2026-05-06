const mongoose = require("mongoose");
const Conversation = require("./conversation.model");
const Message = require("./message.model");
const Match = require("../matches/match.model");
const User = require("../users/user.model");
const { sendPushNotification } = require("../notifications/notification.service");

const ensureConversationForMatch = async (matchId) => {
  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    return null;
  }

  const existing = await Conversation.findOne({ matchId }).select("_id").lean();
  if (existing) {
    return existing;
  }

  const match = await Match.findById(matchId).select("users isActive").lean();
  if (!match || !match.isActive) {
    return null;
  }

  const created = await Conversation.create({
    matchId,
    participants: match.users,
    lastMessage: "",
    lastMessageAt: null,
    lastMessageSenderId: null,
  });

  return { _id: created._id };
};

const sendMessage = async ({ conversationId, senderId, text, io }) => {
  const convIdStr = String(conversationId);
  if (!mongoose.Types.ObjectId.isValid(convIdStr)) {
    const err = new Error("Invalid conversationId");
    err.statusCode = 400;
    throw err;
  }

  const trimmed = (text || "").trim();
  if (!trimmed) {
    const err = new Error("Message text is required");
    err.statusCode = 400;
    throw err;
  }

  const convObjectId = new mongoose.Types.ObjectId(convIdStr);

  const conversation = await Conversation.findById(convObjectId).lean();
  if (!conversation) {
    const err = new Error("Conversation not found");
    err.statusCode = 404;
    throw err;
  }

  const senderStr = String(senderId);
  if (!conversation.participants.some((p) => String(p) === senderStr)) {
    const err = new Error("You are not a participant in this conversation");
    err.statusCode = 403;
    throw err;
  }

  const match = await Match.findById(conversation.matchId).select("isActive").lean();
  if (!match || !match.isActive) {
    const err = new Error("Match is not active");
    err.statusCode = 403;
    throw err;
  }

  const messageDoc = await Message.create({
    conversationId: convObjectId,
    senderId,
    text: trimmed,
    messageType: "text",
    isSeen: false,
  });

  await Conversation.findByIdAndUpdate(convObjectId, {
    lastMessage: trimmed,
    lastMessageAt: new Date(),
    lastMessageSenderId: senderId,
  });

  const payload = {
    _id: messageDoc._id,
    conversationId: messageDoc.conversationId,
    senderId: messageDoc.senderId,
    text: messageDoc.text,
    messageType: messageDoc.messageType,
    isSeen: messageDoc.isSeen,
    createdAt: messageDoc.createdAt,
  };

  if (io) {
    io.to(convIdStr).emit("new_message", payload);
  }

  const otherId = conversation.participants.find((p) => String(p) !== senderStr);
  if (otherId && String(otherId) !== senderStr) {
    const [senderUser, receiverUser] = await Promise.all([
      User.findById(senderId).select("name").lean(),
      User.findById(otherId).select("fcmToken").lean(),
    ]);

    await sendPushNotification({
      token: receiverUser?.fcmToken,
      title: "New Message 💬",
      body: `${senderUser?.name || "Someone"} sent you a message`,
      data: {
        type: "message",
        conversationId: convIdStr,
        senderId: senderStr,
      },
    });
  }

  return { message: payload };
};

module.exports = {
  ensureConversationForMatch,
  sendMessage,
};
