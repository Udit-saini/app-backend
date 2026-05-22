const subscriptionService = require("./subscription.service");
const env = require("../../config/env");

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
  requireAdminApiKey: (req, res, next) => {
    if (!env.adminApiKey) {
      return res.status(500).json({
        success: false,
        message: "ADMIN_API_KEY is not configured",
      });
    }

    const apiKey = req.headers["x-admin-api-key"];

    if (!apiKey || apiKey !== env.adminApiKey) {
      return res.status(403).json({
        success: false,
        message: "Admin access denied",
      });
    }

    return next();
  },
  requirePremium,
};
