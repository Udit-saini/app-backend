const directMessageService = require("./directMessage.service");

const sendDirectMessage = async (req, res, next) => {
  try {
    const { receiverId, message } = req.body || {};

    await directMessageService.sendDirectMessage({
      sender: req.user,
      receiverId,
      message,
    });

    return res.status(201).json({
      success: true,
      message: "Direct message sent",
    });
  } catch (error) {
    return next(error);
  }
};

const getInbox = async (req, res, next) => {
  try {
    const data = await directMessageService.getInbox(req.user._id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const getSent = async (req, res, next) => {
  try {
    const data = await directMessageService.getSent(req.user._id);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const acceptDirectMessage = async (req, res, next) => {
  try {
    const result = await directMessageService.acceptDirectMessage({
      user: req.user,
      directMessageId: req.params.id,
    });

    return res.status(200).json({
      success: true,
      conversationId: result.conversationId,
    });
  } catch (error) {
    return next(error);
  }
};

const rejectDirectMessage = async (req, res, next) => {
  try {
    await directMessageService.rejectDirectMessage({
      user: req.user,
      directMessageId: req.params.id,
    });

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    return next(error);
  }
};

const getRemaining = async (req, res, next) => {
  try {
    const usage = await directMessageService.getDirectMessageUsage(req.user);

    return res.status(200).json({
      success: true,
      limit: usage.limit,
      used: usage.used,
      remaining: usage.remaining,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  acceptDirectMessage,
  getInbox,
  getRemaining,
  getSent,
  rejectDirectMessage,
  sendDirectMessage,
};
