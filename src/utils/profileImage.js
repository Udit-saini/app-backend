const getPrimaryImageUrl = (images) => {
  if (!images || images.length === 0) return null;
  const primary = images.find((img) => img.isPrimary);
  return primary ? primary.url : images[0].url;
};

module.exports = { getPrimaryImageUrl };
