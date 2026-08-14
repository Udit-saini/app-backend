const mongoose = require("mongoose");
const DirectMessage = require("./directMessage.model");
const User = require("../users/user.model");
const Profile = require("../profiles/profile.model");
const { ensureConversationForParticipants } = require("../chats/chat.service");
const { sendPushNotification } = require("../notifications/notification.service");
const { getPrimaryImageUrl } = require("../../utils/profileImage");
const {
  TOKEN_ACTIVITY,
  consumeTokens,
  getWallet,
  refundTokens,
} = require("../tokens/token.service");

const getStartOfUtcDay = (date = new Date()) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const isSameUtcDay = (left, right = new Date()) => {
  if (!left) {
    return false;
  }

  return getStartOfUtcDay(left).getTime() === getStartOfUtcDay(right).getTime();
};

const getUserDisplayName = (user, profile) => {
  return profile?.name || user?.name || "Someone";
};

const getDirectMessageUsage = async (user) => {
  const wallet = await getWallet(user._id);
  const cost = wallet.costs.direct_message?.cost || 0;

  return {
    limit: cost > 0 ? Math.floor(wallet.tokenBalance / cost) : null,
    used: isSameUtcDay(user.dailyDirectMessageDate) ? user.dailyDirectMessageCount || 0 : 0,
    remaining: cost > 0 ? Math.floor(wallet.tokenBalance / cost) : null,
    tokenBalance: wallet.tokenBalance,
    tokenCost: cost,
  };
};

const incrementDirectMessageCounter = async (user, currentUsed) => {
  const today = getStartOfUtcDay();

  await User.findByIdAndUpdate(user._id, {
    $set: {
      dailyDirectMessageDate: today,
      dailyDirectMessageCount: currentUsed + 1,
    },
  });
};

const buildProfileMap = async (userIds) => {
  const profiles = await Profile.find({ userId: { $in: userIds } })
    .select(
      "userId name gender age bio lookingFor zodiac height religion interests images location createdAt updatedAt"
    )
    .lean();

  return new Map(
    profiles.map((profile) => [
      String(profile.userId),
      {
        ...profile,
        image: getPrimaryImageUrl(profile.images),
      },
    ])
  );
};

const sendDirectMessage = async ({ sender, receiverId, message }) => {
  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    const error = new Error("Invalid receiverId");
    error.statusCode = 400;
    throw error;
  }

  const receiverObjectId = new mongoose.Types.ObjectId(receiverId);

  if (String(sender._id) === String(receiverObjectId)) {
    const error = new Error("You cannot send a direct message to yourself");
    error.statusCode = 400;
    throw error;
  }

  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!trimmedMessage) {
    const error = new Error("message is required");
    error.statusCode = 400;
    throw error;
  }

  if (trimmedMessage.length > 500) {
    const error = new Error("message cannot exceed 500 characters");
    error.statusCode = 400;
    throw error;
  }

  const [receiver, existingPending] = await Promise.all([
    User.findById(receiverObjectId).select("_id fcmToken name").lean(),
    DirectMessage.findOne({
      senderId: sender._id,
      receiverId: receiverObjectId,
      status: "pending",
    })
      .select("_id")
      .lean(),
  ]);

  if (!receiver) {
    const error = new Error("Receiver not found");
    error.statusCode = 404;
    throw error;
  }

  if (existingPending) {
    const error = new Error("Direct message request already pending");
    error.statusCode = 409;
    throw error;
  }

  const tokenCharge = await consumeTokens({
    userId: sender._id,
    activityKey: TOKEN_ACTIVITY.DIRECT_MESSAGE,
    metadata: {
      receiverId: String(receiverObjectId),
      source: "direct_message_send",
    },
  });

  let directMessage;
  try {
    directMessage = await DirectMessage.create({
      senderId: sender._id,
      receiverId: receiverObjectId,
      message: trimmedMessage,
      status: "pending",
    });
  } catch (error) {
    if (tokenCharge?.charged) {
      await refundTokens({
        userId: sender._id,
        activityKey: TOKEN_ACTIVITY.DIRECT_MESSAGE,
        amount: tokenCharge.cost,
        metadata: {
          reason: "direct_message_create_failed",
          receiverId: String(receiverObjectId),
        },
      });
    }

    if (error.code === 11000) {
      const conflict = new Error("Direct message request already pending");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }

  const usage = await getDirectMessageUsage(sender);
  await incrementDirectMessageCounter(sender, usage.used);

  const senderProfile = await Profile.findOne({ userId: sender._id })
    .select("name")
    .lean();

  await sendPushNotification({
    token: receiver.fcmToken,
    title: "New Message Request",
    body: `${getUserDisplayName(sender, senderProfile)} sent you a message`,
    data: {
      type: "direct_message",
      directMessageId: directMessage._id,
    },
  });

  return {
    directMessage,
    tokenCharge,
  };
};

const getInbox = async (userId) => {
  const messages = await DirectMessage.find({
    receiverId: userId,
    status: "pending",
  })
    .select("senderId message createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const senderIds = messages.map((message) => message.senderId);
  const profileByUserId = await buildProfileMap(senderIds);

  return messages.map((message) => ({
    directMessageId: message._id,
    sender: profileByUserId.get(String(message.senderId)) || {
      userId: message.senderId,
      name: "",
      gender: "",
      age: null,
      bio: "",
      lookingFor: "",
      zodiac: "",
      height: null,
      religion: "",
      interests: [],
      images: [],
      location: null,
      image: null,
    },
    message: message.message,
    createdAt: message.createdAt,
  }));
};

const getSent = async (userId) => {
  const messages = await DirectMessage.find({ senderId: userId })
    .select("receiverId message status conversationId createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();

  const receiverIds = messages.map((message) => message.receiverId);
  const profileByUserId = await buildProfileMap(receiverIds);

  return messages.map((message) => ({
    directMessageId: message._id,
    receiver: profileByUserId.get(String(message.receiverId)) || {
      userId: message.receiverId,
      name: "",
      gender: "",
      age: null,
      bio: "",
      lookingFor: "",
      zodiac: "",
      height: null,
      religion: "",
      interests: [],
      images: [],
      location: null,
      image: null,
    },
    message: message.message,
    status: message.status,
    conversationId: message.conversationId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }));
};

const acceptDirectMessage = async ({ user, directMessageId }) => {
  if (!mongoose.Types.ObjectId.isValid(directMessageId)) {
    const error = new Error("Invalid direct message id");
    error.statusCode = 400;
    throw error;
  }

  const directMessage = await DirectMessage.findById(directMessageId);

  if (!directMessage) {
    const error = new Error("Direct message not found");
    error.statusCode = 404;
    throw error;
  }

  if (String(directMessage.receiverId) !== String(user._id)) {
    const error = new Error("Only the receiver can accept this direct message");
    error.statusCode = 403;
    throw error;
  }

  if (directMessage.status !== "pending") {
    const error = new Error("Direct message is not pending");
    error.statusCode = 400;
    throw error;
  }

  const conversation = await ensureConversationForParticipants({
    userAId: directMessage.senderId,
    userBId: directMessage.receiverId,
  });

  if (!conversation?._id) {
    const error = new Error("Unable to create conversation");
    error.statusCode = 500;
    throw error;
  }

  directMessage.status = "accepted";
  directMessage.conversationId = conversation._id;
  await directMessage.save();

  const [sender, receiverProfile] = await Promise.all([
    User.findById(directMessage.senderId).select("fcmToken").lean(),
    Profile.findOne({ userId: directMessage.receiverId }).select("name").lean(),
  ]);

  await sendPushNotification({
    token: sender?.fcmToken,
    title: "Message Accepted",
    body: `${getUserDisplayName(user, receiverProfile)} accepted your message`,
    data: {
      type: "direct_message_accepted",
      conversationId: conversation._id,
    },
  });

  return {
    conversationId: conversation._id,
  };
};

const rejectDirectMessage = async ({ user, directMessageId }) => {
  if (!mongoose.Types.ObjectId.isValid(directMessageId)) {
    const error = new Error("Invalid direct message id");
    error.statusCode = 400;
    throw error;
  }

  const directMessage = await DirectMessage.findById(directMessageId);

  if (!directMessage) {
    const error = new Error("Direct message not found");
    error.statusCode = 404;
    throw error;
  }

  if (String(directMessage.receiverId) !== String(user._id)) {
    const error = new Error("Only the receiver can reject this direct message");
    error.statusCode = 403;
    throw error;
  }

  if (directMessage.status !== "pending") {
    const error = new Error("Direct message is not pending");
    error.statusCode = 400;
    throw error;
  }

  directMessage.status = "rejected";
  await directMessage.save();
};

module.exports = {
  acceptDirectMessage,
  getDirectMessageUsage,
  getInbox,
  getSent,
  rejectDirectMessage,
  sendDirectMessage,
};
