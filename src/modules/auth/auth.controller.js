const authService = require("./auth.service");
const { trackAppOpenAndSchedulePremiumNudge } = require("../notifications/premiumNudge.service");

const login = async (req, res, next) => {
  try {
    const data = await authService.buildLoginResponse(req.user);
    trackAppOpenAndSchedulePremiumNudge(req.user).catch((error) => {
      process.stderr.write(
        `[auth] Failed to track app open: ${error.message || "Unknown error"}\n`
      );
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
  login,
};
