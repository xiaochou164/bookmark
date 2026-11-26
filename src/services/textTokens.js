function tokenize(text = '') {
  return [...new Set(String(text || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/g).map((x) => x.trim()).filter(Boolean))];
}

module.exports = { tokenize };
