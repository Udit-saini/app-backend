const nearbyService = require("./nearby.service");
const { FREE_DAILY_SWIPE_LIMIT } = require("../subscriptions/subscription.service");

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
    const result = await nearbyService.getNearbyFeed({
      user: req.user,
      radiusKm: req.query.radiusKm,
      minAge: req.query.minAge,
      maxAge: req.query.maxAge,
    });
    const dailySwipeCount = isSameUtcDay(req.user.dailySwipeDate)
      ? req.user.dailySwipeCount || 0
      : 0;

    return res.status(200).json({
      success: true,
      data: result.data,
      swipeLimit: {
        unlimited: result.isPremium,
        dailyLimit: result.isPremium ? null : FREE_DAILY_SWIPE_LIMIT,
        usedToday: result.isPremium ? null : dailySwipeCount,
        remainingToday: result.isPremium
          ? null
          : Math.max(FREE_DAILY_SWIPE_LIMIT - dailySwipeCount, 0),
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getFeed,
};
