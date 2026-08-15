const { ensureUserTokenBalance } = require("../tokens/token.service");

const buildLoginResponse = async (user) => {
  const walletUser = await ensureUserTokenBalance(user._id);

  return {
    userId: user._id,
    isProfileCompleted: user.isProfileCompleted,
    tokenBalance: walletUser.tokenBalance ?? 0,
    dailyTokenGrant: walletUser.dailyTokenGrant ?? 0,
    lastDailyTokenGrantAt: walletUser.lastDailyTokenGrantAt || null,
    lastDailyTokenGrantAmount: walletUser.lastDailyTokenGrantAmount || 0,
  };
};

module.exports = {
  buildLoginResponse,
};
