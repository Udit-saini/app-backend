const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../modules/users/user.model");

const seedSubscriptionUsers = async () => {
  await connectDB();

  const now = new Date();
  const premiumExpiry = new Date(now);
  premiumExpiry.setMonth(premiumExpiry.getMonth() + 1);

  await User.updateOne(
    { firebaseUid: "seed-free-user" },
    {
      $set: {
        firebaseUid: "seed-free-user",
        email: "free@example.com",
        name: "Free User",
        isProfileCompleted: false,
        subscription: {
          plan: "free",
          status: "active",
          productId: null,
          purchaseToken: null,
          platform: "android",
          startDate: null,
          expiryDate: null,
          autoRenewing: false,
        },
        dailySwipeCount: 0,
        dailySwipeDate: now,
      },
    },
    { upsert: true }
  );

  await User.updateOne(
    { firebaseUid: "seed-premium-user" },
    {
      $set: {
        firebaseUid: "seed-premium-user",
        email: "premium@example.com",
        name: "Premium User",
        isProfileCompleted: false,
        subscription: {
          plan: "premium",
          status: "active",
          productId: "premium_monthly",
          purchaseToken: "seed-premium-token",
          platform: "android",
          startDate: now,
          expiryDate: premiumExpiry,
          autoRenewing: true,
        },
        dailySwipeCount: 0,
        dailySwipeDate: now,
      },
    },
    { upsert: true }
  );

  process.stdout.write("Seeded free and premium subscription users\n");
};

seedSubscriptionUsers()
  .catch((error) => {
    process.stderr.write(`Failed to seed subscription users: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
