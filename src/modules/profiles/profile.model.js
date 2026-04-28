const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    gender: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 18, max: 120 },
    bio: { type: String, default: "", trim: true },
    interests: { type: [String], default: [] },
    images: {
      type: [
        {
          url: { type: String, required: true },
          publicId: { type: String, required: true },
          isPrimary: { type: Boolean, default: false },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Profile", profileSchema);
