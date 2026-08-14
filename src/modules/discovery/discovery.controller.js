const mongoose = require("mongoose");
const Profile = require("../profiles/profile.model");
const Like = require("../likes/like.model");
const Match = require("../matches/match.model");
const { getDiscoveryGenderFilter } = require("../../utils/genderPreference");
const { getWallet } = require("../tokens/token.service");

const DUMMY_DISTANCE_KM = 5;
const MAX_DISCOVERY_RESULTS = 50;

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
      .sort({ createdAt: -1 })
      .limit(MAX_DISCOVERY_RESULTS)
      .lean();

    const data = candidates.map((p) => ({
      ...p,
      distanceKm: DUMMY_DISTANCE_KM,
    }));

    const wallet = await getWallet(currentUserId);
    const likeCost = wallet.costs.like_profile?.cost || 0;
    const dislikeCost = wallet.costs.dislike_profile?.cost || 0;

    return res.status(200).json({
      success: true,
      data,
      tokenWallet: {
        tokenBalance: wallet.tokenBalance,
        likeCost,
        dislikeCost,
        remainingLikes: likeCost > 0 ? Math.floor(wallet.tokenBalance / likeCost) : null,
        remainingDislikes: dislikeCost > 0 ? Math.floor(wallet.tokenBalance / dislikeCost) : null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getFeed };
