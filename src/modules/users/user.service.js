const User = require("./user.model");

const createUser = async (payload) => {
  return User.create(payload);
};

module.exports = {
  createUser,
};
