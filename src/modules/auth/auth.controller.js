const authService = require("./auth.service");

const login = async (req, res, next) => {
  try {
    const data = await authService.buildLoginResponse(req.user);
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
