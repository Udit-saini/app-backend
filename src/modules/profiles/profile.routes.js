const express = require("express");
const profileController = require("./profile.controller");
const authMiddleware = require("../../middlewares/auth.middleware");
const upload = require("../../middlewares/upload.middleware");

const router = express.Router();

router.get("/", authMiddleware, profileController.getProfile);
router.post("/", authMiddleware, profileController.createProfile);
router.patch("/", authMiddleware, profileController.updateProfile);
router.post("/upload-photo", authMiddleware, upload.single("image"), profileController.uploadPhoto);
router.delete("/photo/:publicId", authMiddleware, profileController.deletePhoto);
router.put("/photo/set-primary", authMiddleware, profileController.setPrimaryPhoto);

module.exports = router;
