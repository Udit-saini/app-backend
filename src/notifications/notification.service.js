const { getAdmin } = require("../config/firebase");
const User = require("../modules/users/user.model");

const stringifyData = (data) => {
  if (!data || typeof data !== "object") return {};
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v == null ? "" : String(v)])
  );
};

const sendPushNotification = async (userId, title, body, data = {}) => {
  const user = await User.findById(userId).select("fcmToken").lean();
  if (!user?.fcmToken) {
    return { sent: false, reason: "no_token" };
  }

  const admin = getAdmin();
  await admin.messaging().send({
    token: user.fcmToken,
    notification: { title, body },
    data: stringifyData(data),
  });

  return { sent: true };
};

module.exports = {
  sendPushNotification,
};
