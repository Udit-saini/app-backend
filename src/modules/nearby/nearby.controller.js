const nearbyService = require("./nearby.service");

const getFeed = async (req, res, next) => {
  try {
    const data = await nearbyService.getNearbyFeed({
      user: req.user,
      radiusKm: req.query.radiusKm,
      minAge: req.query.minAge,
      maxAge: req.query.maxAge,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getFeed,
};
