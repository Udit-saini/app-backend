const { getAdmin } = require("../../config/firebase");

const stringifyData = (data) => {
  if (!data || typeof data !== "object") return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value == null ? "" : String(value)])
  );
};

const sendPushNotification = async ({ token, title, body, data = {} }) => {
  if (!token || typeof token !== "string" || !token.trim()) {
    return { success: false, skipped: true, reason: "missing_token" };
  }

  try {
    const admin = getAdmin();

    const messageId = await admin.messaging().send({
      token: token.trim(),
      notification: {
        title: title || "",
        body: body || "",
      },
      data: stringifyData(data),
    });

    return { success: true, skipped: false, messageId };
  } catch (error) {
    process.stderr.write(
      `[FCM] Failed to send push notification: ${error.message || "Unknown error"}\n`
    );

    return {
      success: false,
      skipped: false,
      reason: "send_failed",
      error: error.message || "Unknown error",
    };
  }
};

module.exports = {
  sendPushNotification,
};
