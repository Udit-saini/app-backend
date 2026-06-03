const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      default: null,
    },
    conversationType: {
      type: String,
      enum: ["match", "direct"],
      default: "match",
    },
    pairKey: { type: String, unique: true, sparse: true },
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      validate: [(arr) => arr.length === 2, "Conversation must have exactly two participants"],
      required: true,
    },
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: null },
    lastMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ matchId: 1 }, { unique: true, sparse: true });
conversationSchema.index({ participants: 1 });

conversationSchema.pre("validate", function setPairKey() {
  if (this.participants && this.participants.length === 2) {
    const sorted = [...this.participants].map((id) => String(id)).sort();
    this.pairKey = sorted.join(":");
  }
});

module.exports = mongoose.model("Conversation", conversationSchema);
