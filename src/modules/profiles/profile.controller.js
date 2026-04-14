const Profile = require("./profile.model");
const User = require("../users/user.model");

const UPDATABLE_PROFILE_FIELDS = [
  "name",
  "gender",
  "age",
  "bio",
  "interests",
  "images",
  "location",
];

const buildProfileUpdatePayload = (body) => {
  const updates = {};
  for (const key of UPDATABLE_PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      updates[key] = body[key];
    }
  }
  return updates;
};

const createProfile = async (req, res, next) => {
  try {
    const existingProfile = await Profile.findOne({ userId: req.user._id });
    if (existingProfile) {
      return res.status(409).json({
        success: false,
        message: "Profile already exists for this user",
      });
    }

    const profile = await Profile.create({
      ...req.body,
      userId: req.user._id,
    });

    await User.findByIdAndUpdate(req.user._id, { isProfileCompleted: true }, { new: false });

    return res.status(201).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    return next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const updates = buildProfileUpdatePayload(req.body || {});

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No updatable fields provided",
      });
    }

    const profile = await Profile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found. Create a profile first.",
      });
    }

    if (updates.name !== undefined) {
      await User.findByIdAndUpdate(req.user._id, { name: updates.name });
    }

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createProfile,
  updateProfile,
};
