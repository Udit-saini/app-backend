const app = require("./app");
const connectDB = require("./config/db");
const env = require("./config/env");
require("./config/firebase");

const startServer = async () => {
  try {
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
