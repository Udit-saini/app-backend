const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const matchController = require("./match.controller");

const router = express.Router();

router.get("/", authMiddleware, matchController.listMatches);

module.exports = router;
