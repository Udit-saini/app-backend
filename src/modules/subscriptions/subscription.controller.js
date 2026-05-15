const subscriptionService = require("./subscription.service");

const verifySubscription = async (req, res, next) => {
  try {
    const { purchaseToken, productId } = req.body || {};

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!purchaseToken || !productId) {
      return res.status(400).json({
        success: false,
        message: "purchaseToken and productId are required",
      });
    }

    const subscription = await subscriptionService.verifyAndActivateSubscription({
      userId: req.user._id,
      purchaseToken: purchaseToken.trim(),
      productId: productId.trim(),
    });

    return res.status(200).json({
      success: true,
      plan: subscription.plan,
      status: subscription.status,
      productId: subscription.productId,
      expiryDate: subscription.expiryDate,
      autoRenewing: subscription.autoRenewing,
    });
  } catch (error) {
    return next(error);
  }
};

const getMySubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const subscription = await subscriptionService.getCurrentSubscription(req.user);

    return res.status(200).json({
      success: true,
      subscription,
    });
  } catch (error) {
    return next(error);
  }
};

const cancelSubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const subscription = await subscriptionService.cancelSubscriptionLocally(req.user._id);

    return res.status(200).json({
      success: true,
      subscription,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  cancelSubscription,
  getMySubscription,
  verifySubscription,
};
