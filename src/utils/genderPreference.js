/**
 * Basic opposite-gender filter for discovery.
 * male ↔ female; other / non-binary → candidates with male or female (binary pool).
 */
const getDiscoveryGenderFilter = (profileGender) => {
  const g = (profileGender || "").toLowerCase().trim();
  if (g === "male") {
    return { gender: { $regex: /^female$/i } };
  }
  if (g === "female") {
    return { gender: { $regex: /^male$/i } };
  }
  return {
    $or: [{ gender: { $regex: /^male$/i } }, { gender: { $regex: /^female$/i } }],
  };
};

module.exports = { getDiscoveryGenderFilter };
