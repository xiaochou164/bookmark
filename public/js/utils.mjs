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

export function safeUrl(url) {
  const s = String(url || '').trim();
  if (!s) return 'about:blank';
  if (s.startsWith('/') || s.startsWith('#')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^mailto:/i.test(s)) return s;
  if (/^tel:/i.test(s)) return s;
  return 'unsafe:' + s;
}

export function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (_err) {
    return url;
  }
}
