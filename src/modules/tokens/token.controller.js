const tokenService = require("./token.service");

const getMyWallet = async (req, res, next) => {
  try {
    const wallet = await tokenService.getWallet(req.user._id);

    return res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    return next(error);
  }
};

const listTokenConfigsForAdmin = async (req, res, next) => {
  try {
    const configs = await tokenService.getTokenConfigs();

    return res.status(200).json({
      success: true,
      data: configs,
    });
  } catch (error) {
    return next(error);
  }
};

const updateTokenConfigByAdmin = async (req, res, next) => {
  try {
    const config = await tokenService.updateTokenConfig({
      key: req.params.key,
      cost: req.body?.cost,
      label: req.body?.label,
      description: req.body?.description,
      isActive: req.body?.isActive,
    });

    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    return next(error);
  }
};

const topUpUserTokensByAdmin = async (req, res, next) => {
  try {
    const result = await tokenService.creditTokens({
      userId: req.params.userId,
      amount: req.body?.amount,
      adminNote: req.body?.note || "",
      metadata: { source: "admin" },
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const setUserTokenBalanceByAdmin = async (req, res, next) => {
  try {
    const result = await tokenService.setTokenBalance({
      userId: req.params.userId,
      tokenBalance: req.body?.tokenBalance,
      adminNote: req.body?.note || "",
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const getUserTokenLedgerByAdmin = async (req, res, next) => {
  try {
    const result = await tokenService.getLedger({
      userId: req.params.userId,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMyWallet,
  getUserTokenLedgerByAdmin,
  listTokenConfigsForAdmin,
  setUserTokenBalanceByAdmin,
  topUpUserTokensByAdmin,
  updateTokenConfigByAdmin,
};
