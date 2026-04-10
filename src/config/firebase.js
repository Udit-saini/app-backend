const admin = require("firebase-admin");
const env = require("./env");

if (!env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey) {
  throw new Error(
    "Firebase credentials are required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
  });
}

module.exports = admin;
