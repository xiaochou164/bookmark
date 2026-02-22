export function byId(id) {
  return document.getElementById(id);
}

export function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (_err) {
    return url;
  }
}
