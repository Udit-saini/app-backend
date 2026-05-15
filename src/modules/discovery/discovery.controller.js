const mongoose = require("mongoose");
const Profile = require("../profiles/profile.model");
const Like = require("../likes/like.model");
const Match = require("../matches/match.model");
const { getDiscoveryGenderFilter } = require("../../utils/genderPreference");
const {
  FREE_DAILY_SWIPE_LIMIT,
  hasActivePremium,
} = require("../subscriptions/subscription.service");

const DUMMY_DISTANCE_KM = 5;

const isSameUtcDay = (left, right = new Date()) => {
  if (!left) {
    return false;
  }

  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
};

const getFeed = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const myProfile = await Profile.findOne({ userId: currentUserId })
      .select("gender")
      .lean();

    if (!myProfile) {
      const err = new Error("Complete your profile before using discovery");
      err.statusCode = 400;
      return next(err);
    }

    const excludedIds = new Set([String(currentUserId)]);

    const mySwipes = await Like.find({ fromUserId: currentUserId })
      .select("toUserId")
      .lean();

    mySwipes.forEach((row) => excludedIds.add(String(row.toUserId)));

    const myMatches = await Match.find({
      users: currentUserId,
      isActive: true,
    })
      .select("users")
      .lean();

    myMatches.forEach((m) => {
      m.users.forEach((uid) => {
        if (String(uid) !== String(currentUserId)) {
          excludedIds.add(String(uid));
        }
      });
    });

    const excludeObjectIds = [...excludedIds].map((id) => new mongoose.Types.ObjectId(id));

    const genderFilter = getDiscoveryGenderFilter(myProfile.gender);

    const candidates = await Profile.find({
      userId: { $nin: excludeObjectIds },
      ...genderFilter,
    })
      .limit(20)
      .lean();

    const data = candidates.map((p) => ({
      ...p,
      distanceKm: DUMMY_DISTANCE_KM,
    }));

    const premium = await hasActivePremium(req.user);
    const dailySwipeCount = isSameUtcDay(req.user.dailySwipeDate)
      ? req.user.dailySwipeCount || 0
      : 0;

    return res.status(200).json({
      success: true,
      data,
      swipeLimit: {
        unlimited: premium,
        dailyLimit: premium ? null : FREE_DAILY_SWIPE_LIMIT,
        usedToday: premium ? null : dailySwipeCount,
        remainingToday: premium ? null : Math.max(FREE_DAILY_SWIPE_LIMIT - dailySwipeCount, 0),
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getFeed };
