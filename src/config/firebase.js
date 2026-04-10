const admin = require("firebase-admin");
const env = require("./env");

function initializeFirebase() {
  if (admin.apps.length) return;

  if (!env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey) {
    throw new Error(
      "Firebase credentials are required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
  });
}

function getAdmin() {
  initializeFirebase();
  return admin;
}

module.exports = { initializeFirebase, getAdmin };
