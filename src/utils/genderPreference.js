/**
 * Basic opposite-gender filter for discovery.
 * male ↔ female; other / non-binary → candidates with male or female (binary pool).
 */
const getDiscoveryGenderFilter = (profileGender) => {
  const g = (profileGender || "").toLowerCase().trim();

  // Accept common variants (e.g. "women" instead of "female").
  const isMale = ["male", "man", "men", "m"].includes(g);
  const isFemale = ["female", "woman", "women", "f"].includes(g);

  const maleRegex = /^(male|man|men|m)$/i;
  const femaleRegex = /^(female|woman|women|f)$/i;

  if (isMale) {
    return { gender: { $regex: femaleRegex } };
  }
  if (isFemale) {
    return { gender: { $regex: maleRegex } };
  }
  return { $or: [{ gender: { $regex: maleRegex } }, { gender: { $regex: femaleRegex } }] };
};

module.exports = { getDiscoveryGenderFilter };
