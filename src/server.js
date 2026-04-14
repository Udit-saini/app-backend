const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const connectDB = require("./config/db");
const env = require("./config/env");
const { initializeFirebase } = require("./config/firebase");
const initChatSocket = require("./modules/chats/chat.socket");

const startServer = async () => {
  try {
    process.stdout.write(
      `Startup: MONGO_URI=${env.mongoUri ? "set" : "missing"}, Firebase=${env.firebaseProjectId ? "set" : "missing"}, PORT=${env.port}\n`
    );

    initializeFirebase();
    await connectDB();

    const httpServer = http.createServer(app);
    const io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    app.set("io", io);
    initChatSocket(io);

    httpServer.listen(env.port, () => {
      process.stdout.write(`Server running on port ${env.port}\n`);
    });
  } catch (error) {
    process.stderr.write(`Failed to start server: ${error.message}\n`);
    process.exit(1);
  }
};

startServer();
