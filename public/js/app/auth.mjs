export function currentAppPath() {
  const path = `${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`;
  return path || '/';
}

export function redirectToLoginPage({ next = currentAppPath() } = {}) {
  const target = String(next || '/').startsWith('/') ? String(next || '/') : '/';
  const url = new URL('/login.html', window.location.origin);
  url.searchParams.set('next', target);
  window.location.replace(`${url.pathname}${url.search}${url.hash}`);
}
