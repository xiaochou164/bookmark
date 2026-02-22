export function queryString(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === null || v === undefined || v === '' || v === 'all') continue;
    usp.set(k, String(v));
  }
  return usp.toString();
}

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('api-unauthorized', { detail: { path } }));
    }
    let message = `${res.status}`;
    try {
      const parsed = await res.json();
      if (typeof parsed?.error === 'string') {
        message = parsed.error;
      } else if (parsed?.error?.message) {
        message = parsed.error.message;
      } else if (parsed?.message) {
        message = parsed.message;
      } else {
        message = JSON.stringify(parsed);
      }
    } catch (_err) {
      message = await res.text();
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}
