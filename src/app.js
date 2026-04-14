const express = require("express");
const cors = require("cors");

const authRoutes = require("./modules/auth/auth.routes");
const profileRoutes = require("./modules/profiles/profile.routes");
const discoveryRoutes = require("./modules/discovery/discovery.routes");
const likeRoutes = require("./modules/likes/like.routes");
const matchRoutes = require("./modules/matches/match.routes");
const chatRoutes = require("./modules/chats/chat.routes");
const errorMiddleware = require("./middlewares/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.status(200).json({ success: true }));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/likes", likeRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/chats", chatRoutes);

app.use(errorMiddleware);

module.exports = app;
