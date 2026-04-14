const mongoose = require("mongoose");
const { getAdmin } = require("../../config/firebase");
const User = require("../users/user.model");
const Conversation = require("./conversation.model");
const { sendMessage: persistAndBroadcastMessage } = require("./chat.service");

const attachUserFromToken = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
      return next(new Error("Unauthorized"));
    }

    const decoded = await getAdmin().auth().verifyIdToken(token);
    let user = await User.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      user = await User.create({
        firebaseUid: decoded.uid,
        email: decoded.email || "",
        name: decoded.name || "",
      });
    }

    socket.userId = user._id;
    return next();
  } catch (err) {
    return next(new Error("Unauthorized"));
  }
};

const initChatSocket = (io) => {
  io.use(attachUserFromToken);

  io.on("connection", (socket) => {
    socket.on("join_conversation", async (conversationId, ack) => {
      try {
        if (!conversationId || !mongoose.Types.ObjectId.isValid(String(conversationId))) {
          if (typeof ack === "function") ack({ success: false, message: "Invalid conversationId" });
          return;
        }

        const conv = await Conversation.findById(conversationId).select("participants").lean();
        if (!conv) {
          if (typeof ack === "function") ack({ success: false, message: "Conversation not found" });
          return;
        }

        if (!conv.participants.some((p) => String(p) === String(socket.userId))) {
          if (typeof ack === "function") ack({ success: false, message: "Forbidden" });
          return;
        }

        await socket.join(String(conversationId));
        if (typeof ack === "function") ack({ success: true });
      } catch (e) {
        if (typeof ack === "function") ack({ success: false, message: e.message });
      }
    });

    socket.on("send_message", async (payload, ack) => {
      try {
        const conversationId = payload?.conversationId;
        const text = payload?.text;

        const result = await persistAndBroadcastMessage({
          conversationId,
          senderId: socket.userId,
          text,
          io,
        });

        if (typeof ack === "function") {
          ack({ success: true, data: result.message });
        }
      } catch (error) {
        const status = error.statusCode || 500;
        if (typeof ack === "function") {
          ack({ success: false, message: error.message, statusCode: status });
        }
      }
    });
  });
};

module.exports = initChatSocket;
