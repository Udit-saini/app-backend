const mongoose = require("mongoose");

const matchSchema = new mongoose.Schema(
  {
    users: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      validate: [(arr) => arr.length === 2, "Match must contain exactly two users"],
      required: true,
    },
    pairKey: { type: String, unique: true },
    matchedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

matchSchema.index({ users: 1 });

matchSchema.pre("validate", function setPairKey(next) {
  if (this.users && this.users.length === 2) {
    const sorted = [...this.users].map((id) => String(id)).sort();
    this.pairKey = sorted.join(":");
  }
  next();
});

module.exports = mongoose.model("Match", matchSchema);
