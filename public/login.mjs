import { api } from './js/api.mjs';

function byId(id) {
  return document.getElementById(id);
}

function setStatus(text, { error = false } = {}) {
  const el = byId('loginStatus');
  if (!el) return;
  el.textContent = String(text || '');
  el.classList.toggle('danger-text', Boolean(error));
}

function safeNextPath(raw) {
  const fallback = '/';
  const value = String(raw || '').trim();
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    if (url.pathname === '/login.html') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (_err) {
    return fallback;
  }
}

function nextTarget() {
  const params = new URLSearchParams(window.location.search);
  return safeNextPath(params.get('next'));
}

function redirectToNext() {
  window.location.replace(nextTarget());
}

function setTab(mode) {
  const isRegister = mode === 'register';
  byId('registerForm')?.classList.toggle('hidden', !isRegister);
  byId('loginForm')?.classList.toggle('hidden', isRegister);
  byId('registerTabBtn')?.classList.toggle('active', isRegister);
  byId('loginTabBtn')?.classList.toggle('active', !isRegister);
}

async function loadAuthMe() {
  const res = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) return { authenticated: false };
  try {
    return await res.json();
  } catch (_err) {
    return { authenticated: false };
  }
}

async function login(email, password) {
  return api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

async function registerAndLogin(displayName, email, password) {
  await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ displayName, email, password })
  });
  return login(email, password);
}

async function init() {
  const target = nextTarget();
  const back = byId('backToAppLink');
  if (back) back.setAttribute('href', target);

  byId('loginTabBtn')?.addEventListener('click', () => setTab('login'));
  byId('registerTabBtn')?.addEventListener('click', () => setTab('register'));

  byId('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = byId('loginEmail')?.value?.trim() || '';
    const password = byId('loginPassword')?.value || '';
    if (!email || !password) {
      setStatus('请输入邮箱和密码', { error: true });
      return;
    }
    try {
      setStatus('正在登录...');
      await login(email, password);
      setStatus('登录成功，正在跳转...');
      redirectToNext();
    } catch (err) {
      setStatus(`登录失败：${err.message || '未知错误'}`, { error: true });
    }
  });

  byId('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = byId('registerName')?.value?.trim() || '';
    const email = byId('registerEmail')?.value?.trim() || '';
    const password = byId('registerPassword')?.value || '';
    if (!email || !password) {
      setStatus('请输入邮箱和密码', { error: true });
      return;
    }
    try {
      setStatus('正在注册...');
      await registerAndLogin(displayName, email, password);
      setStatus('注册成功，正在跳转...');
      redirectToNext();
    } catch (err) {
      setStatus(`注册失败：${err.message || '未知错误'}`, { error: true });
    }
  });

  const me = await loadAuthMe();
  if (me?.authenticated) {
    setStatus('已登录，正在跳转...');
    redirectToNext();
    return;
  }

  setStatus('请先登录或注册。');
  setTab('login');
}

init().catch((err) => {
  console.error(err);
  setStatus(`初始化失败：${err.message || '未知错误'}`, { error: true });
});
