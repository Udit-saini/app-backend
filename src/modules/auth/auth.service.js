const buildLoginResponse = async (user) => {
  return {
    userId: user._id,
    isProfileCompleted: user.isProfileCompleted,
  };
};

module.exports = {
  buildLoginResponse,
};
