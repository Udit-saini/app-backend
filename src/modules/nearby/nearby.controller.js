const nearbyService = require("./nearby.service");
const { getWallet } = require("../tokens/token.service");

const getFeed = async (req, res, next) => {
  try {
    const result = await nearbyService.getNearbyFeed({
      user: req.user,
      radiusKm: req.query.radiusKm,
      minAge: req.query.minAge,
      maxAge: req.query.maxAge,
    });
    const wallet = await getWallet(req.user._id);
    const likeCost = wallet.costs.like_profile?.cost || 0;
    const dislikeCost = wallet.costs.dislike_profile?.cost || 0;

    return res.status(200).json({
      success: true,
      data: result.data,
      tokenWallet: {
        tokenBalance: wallet.tokenBalance,
        likeCost,
        dislikeCost,
        remainingLikes: likeCost > 0 ? Math.floor(wallet.tokenBalance / likeCost) : null,
        remainingDislikes: dislikeCost > 0 ? Math.floor(wallet.tokenBalance / dislikeCost) : null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getFeed,
};
