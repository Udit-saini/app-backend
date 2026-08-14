const buildLoginResponse = async (user) => {
  return {
    userId: user._id,
    isProfileCompleted: user.isProfileCompleted,
    tokenBalance: user.tokenBalance ?? 100,
  };
};

module.exports = {
  buildLoginResponse,
};
