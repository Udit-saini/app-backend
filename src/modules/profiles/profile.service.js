const Profile = require("./profile.model");

const createProfile = async (payload) => {
  return Profile.create(payload);
};

module.exports = {
  createProfile,
};
