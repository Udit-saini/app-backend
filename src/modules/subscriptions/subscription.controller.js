const subscriptionService = require("./subscription.service");

const getPlans = async (req, res, next) => {
  try {
    const data = await subscriptionService.getSubscriptionPlans();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

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

const setUserSubscriptionByAdmin = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { plan, productId, expiryDate, autoRenewing } = req.body || {};

    const result = await subscriptionService.setUserSubscriptionByAdmin({
      userId,
      plan,
      productId,
      expiryDate,
      autoRenewing,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const listPlansForAdmin = async (req, res, next) => {
  try {
    const data = await subscriptionService.listSubscriptionPlansForAdmin();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const getPlanForAdmin = async (req, res, next) => {
  try {
    const data = await subscriptionService.getSubscriptionPlanForAdmin(req.params.planId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const createPlanByAdmin = async (req, res, next) => {
  try {
    const data = await subscriptionService.createSubscriptionPlanByAdmin(req.body || {});

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const updatePlanByAdmin = async (req, res, next) => {
  try {
    const data = await subscriptionService.updateSubscriptionPlanByAdmin(
      req.params.planId,
      req.body || {}
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const deletePlanByAdmin = async (req, res, next) => {
  try {
    const data = await subscriptionService.deleteSubscriptionPlanByAdmin(req.params.planId);

    return res.status(200).json({
      success: true,
      message: "Subscription plan deleted successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  cancelSubscription,
  createPlanByAdmin,
  deletePlanByAdmin,
  getPlanForAdmin,
  getMySubscription,
  getPlans,
  listPlansForAdmin,
  setUserSubscriptionByAdmin,
  updatePlanByAdmin,
  verifySubscription,
};
