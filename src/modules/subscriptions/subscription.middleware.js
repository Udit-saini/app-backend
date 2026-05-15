const subscriptionService = require("./subscription.service");

const requirePremium = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const premium = await subscriptionService.hasActivePremium(req.user);

    if (!premium) {
      return res.status(403).json({
        success: false,
        message: "Premium subscription required",
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  requirePremium,
};
