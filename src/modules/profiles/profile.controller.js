const Profile = require("./profile.model");
const User = require("../users/user.model");
const cloudinary = require("../../config/cloudinary");

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

const getProfile = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found. Create a profile first.",
      });
    }
    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    return next(error);
  }
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

const uploadPhoto = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found. Create a profile first.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image file is required",
      });
    }

    if (profile.images.length >= 6) {
      return res.status(400).json({
        success: false,
        message: "Maximum 6 photos allowed",
      });
    }

    const image = {
      url: req.file.path,
      publicId: req.file.filename,
      isPrimary: profile.images.length === 0,
      uploadedAt: new Date(),
    };

    profile.images.push(image);
    await profile.save();

    return res.status(201).json({
      success: true,
      message: "Photo uploaded successfully",
      data: {
        image,
        images: profile.images,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const deletePhoto = async (req, res, next) => {
  try {
    const encodedPublicId = req.params.publicId;
    const publicId = decodeURIComponent(encodedPublicId || "");

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: "publicId is required",
      });
    }

    const profile = await Profile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found. Create a profile first.",
      });
    }

    const imageIndex = profile.images.findIndex((img) => img.publicId === publicId);
    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }

    const removedImage = profile.images[imageIndex];
    await cloudinary.uploader.destroy(publicId);

    profile.images.splice(imageIndex, 1);

    if (removedImage.isPrimary && profile.images.length > 0) {
      profile.images[0].isPrimary = true;
    }

    await profile.save();

    return res.status(200).json({
      success: true,
      message: "Photo deleted successfully",
      data: {
        images: profile.images,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const setPrimaryPhoto = async (req, res, next) => {
  try {
    const { publicId } = req.body || {};

    if (typeof publicId !== "string" || !publicId.trim()) {
      return res.status(400).json({
        success: false,
        message: "publicId is required",
      });
    }

    const normalizedPublicId = publicId.trim();
    const profile = await Profile.findOne({ userId: req.user._id });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found. Create a profile first.",
      });
    }

    const targetImage = profile.images.find((img) => img.publicId === normalizedPublicId);
    if (!targetImage) {
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }

    profile.images.forEach((img) => {
      img.isPrimary = img.publicId === normalizedPublicId;
    });

    await profile.save();

    return res.status(200).json({
      success: true,
      message: "Primary photo updated successfully",
      data: {
        images: profile.images,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getProfile,
  createProfile,
  updateProfile,
  uploadPhoto,
  deletePhoto,
  setPrimaryPhoto,
};
