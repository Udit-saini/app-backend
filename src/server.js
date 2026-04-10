const app = require("./app");
const connectDB = require("./config/db");
const env = require("./config/env");
const { initializeFirebase } = require("./config/firebase");

const startServer = async () => {
  try {
    process.stdout.write(
      `Startup: MONGO_URI=${env.mongoUri ? "set" : "missing"}, Firebase=${env.firebaseProjectId ? "set" : "missing"}, PORT=${env.port}\n`
    );

    initializeFirebase();
    await connectDB();

    app.listen(env.port, () => {
      process.stdout.write(`Server running on port ${env.port}\n`);
    });
  } catch (error) {
    process.stderr.write(`Failed to start server: ${error.message}\n`);
    process.exit(1);
  }
};

startServer();
