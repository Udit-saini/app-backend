const mongoose = require("mongoose");
const Profile = require("../profiles/profile.model");
const Like = require("../likes/like.model");
const Match = require("../matches/match.model");
const { getDiscoveryGenderFilter } = require("../../utils/genderPreference");
const { getPrimaryImageUrl } = require("../../utils/profileImage");
const { calculateDistance } = require("../../utils/distance");
const { hasActivePremium } = require("../subscriptions/subscription.service");

const DEFAULT_RADIUS_KM = 20;
const FREE_MAX_RADIUS_KM = 20;
const PREMIUM_MAX_RADIUS_KM = 100;
const MAX_NEARBY_RESULTS = 50;

const hasValidLocation = (profile) => {
  return (
    profile?.location &&
    Number.isFinite(Number(profile.location.lat)) &&
    Number.isFinite(Number(profile.location.lng))
  );
};

const parseRadiusKm = (value) => {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_RADIUS_KM;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    const error = new Error("radiusKm must be a positive number");
    error.statusCode = 400;
    throw error;
  }

  if (parsed > PREMIUM_MAX_RADIUS_KM) {
    const error = new Error("radiusKm cannot exceed 100 KM");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const parseAgeFilter = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 18 || parsed > 120) {
    const error = new Error(`${fieldName} must be a valid age between 18 and 120`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

const getExcludedUserIds = async (currentUserId) => {
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

  myMatches.forEach((match) => {
    match.users.forEach((uid) => {
      if (String(uid) !== String(currentUserId)) {
        excludedIds.add(String(uid));
      }
    });
  });

  return [...excludedIds].map((id) => new mongoose.Types.ObjectId(id));
};

const getNearbyFeed = async ({ user, radiusKm, minAge, maxAge }) => {
  const currentUserId = user._id;
  const requestedRadiusKm = parseRadiusKm(radiusKm);
  const minAgeValue = parseAgeFilter(minAge, "minAge");
  const maxAgeValue = parseAgeFilter(maxAge, "maxAge");

  if (minAgeValue !== null && maxAgeValue !== null && minAgeValue > maxAgeValue) {
    const error = new Error("minAge cannot be greater than maxAge");
    error.statusCode = 400;
    throw error;
  }

  const isPremium = await hasActivePremium(user);

  if (!isPremium && requestedRadiusKm > FREE_MAX_RADIUS_KM) {
    const error = new Error("Premium subscription required for extended radius search");
    error.statusCode = 403;
    throw error;
  }

  const myProfile = await Profile.findOne({ userId: currentUserId })
    .select("gender location")
    .lean();

  if (!myProfile) {
    const error = new Error("Complete your profile before using nearby discovery");
    error.statusCode = 400;
    throw error;
  }

  if (!hasValidLocation(myProfile)) {
    const error = new Error("Profile location is required for nearby discovery");
    error.statusCode = 400;
    throw error;
  }

  const excludeObjectIds = await getExcludedUserIds(currentUserId);
  const genderFilter = getDiscoveryGenderFilter(myProfile.gender);
  const ageFilter = {};

  if (minAgeValue !== null || maxAgeValue !== null) {
    ageFilter.age = {};
    if (minAgeValue !== null) {
      ageFilter.age.$gte = minAgeValue;
    }
    if (maxAgeValue !== null) {
      ageFilter.age.$lte = maxAgeValue;
    }
  }

  const candidates = await Profile.find({
    userId: { $nin: excludeObjectIds },
    "location.lat": { $exists: true, $ne: null },
    "location.lng": { $exists: true, $ne: null },
    ...genderFilter,
    ...ageFilter,
  })
    .select("name age bio interests images location userId")
    .lean();

  return candidates
    .map((profile) => {
      const distanceKm = calculateDistance(
        myProfile.location.lat,
        myProfile.location.lng,
        profile.location.lat,
        profile.location.lng
      );

      if (distanceKm === null || distanceKm > requestedRadiusKm) {
        return null;
      }

      return {
        userId: profile.userId,
        name: profile.name,
        age: profile.age,
        bio: profile.bio,
        interests: profile.interests || [],
        image: getPrimaryImageUrl(profile.images),
        distanceKm,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, MAX_NEARBY_RESULTS);
};

module.exports = {
  getNearbyFeed,
};
