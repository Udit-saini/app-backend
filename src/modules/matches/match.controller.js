const Match = require("./match.model");
const Profile = require("../profiles/profile.model");
const { getPrimaryImageUrl } = require("../../utils/profileImage");

const listMatches = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const matches = await Match.find({
      users: currentUserId,
      isActive: true,
    })
      .select("users")
      .lean();

    if (matches.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const otherUserIds = matches.map((m) => {
      const other = m.users.find((uid) => String(uid) !== String(currentUserId));
      return other;
    });

    const profiles = await Profile.find({ userId: { $in: otherUserIds } })
      .select("userId name images")
      .lean();

    const profileByUserId = new Map(profiles.map((p) => [String(p.userId), p]));

    const data = matches.map((m) => {
      const otherUserId = m.users.find((uid) => String(uid) !== String(currentUserId));
      const p = profileByUserId.get(String(otherUserId));

      return {
        matchId: m._id,
        user: {
          userId: otherUserId,
          name: p?.name || "",
          image: getPrimaryImageUrl(p?.images),
        },
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listMatches,
};
