const Profile = require("./profile.model");
const User = require("../users/user.model");

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

module.exports = {
  createProfile,
};
