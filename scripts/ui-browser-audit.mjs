import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewports = [
  { name: 'mobile', width: 360, height: 780 },
  { name: 'small', width: 640, height: 900 },
  { name: 'tablet', width: 920, height: 900 },
  { name: 'desktop', width: 1280, height: 900 }
];
const screenshotDir = path.resolve(root, process.env.UI_AUDIT_DIR || 'docs/screenshots/audit-2026-11-16/after');
const reportPath = path.join(screenshotDir, 'audit-report.json');
const axeSource = fs.readFileSync(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url, options = {}) {
  return fetch(url, options).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  });
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    await sleep(200);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result || {});
        return;
      }
      if (msg.method && this.events.has(msg.method)) {
        for (const fn of this.events.get(msg.method)) fn(msg.params || {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 15000).unref?.();
    });
  }

  on(method, fn) {
    const list = this.events.get(method) || [];
    list.push(fn);
    this.events.set(method, list);
  }

  close() {
    this.ws.close();
  }
}

async function startServer() {
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rainbow-ui-audit-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      SQLITE_FILE: path.join(tmp, 'db.sqlite'),
      DATA_FILE: path.join(tmp, 'empty.json'),
      OBJECT_STORAGE_DIR: path.join(tmp, 'objects'),
      QUEUE_BACKEND: 'memory',
      RATE_LIMIT_MAX: '5000',
      LOG_LEVEL: 'warn'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await waitForHttp(`http://127.0.0.1:${port}/login.html`);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => child.kill('SIGTERM')
  };
}

async function startChrome() {
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found at ${chromePath}`);
  const port = await freePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rainbow-chrome-'));
  const child = spawn(chromePath, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await waitForHttp(`http://127.0.0.1:${port}/json/version`);
  const target = await requestJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('DOM.enable');
  await session.send('Log.enable');
  await session.send('Network.enable');
  return {
    session,
    stop: () => child.kill('SIGTERM')
  };
}

async function evaluate(session, expression) {
  const out = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (out.exceptionDetails) {
    throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text || 'Runtime evaluation failed');
  }
  return out.result?.value;
}

async function navigate(session, url) {
  await session.send('Page.navigate', { url });
  const expected = new URL(url);
  await waitForExpression(session, `document.readyState === 'complete' && location.pathname === ${JSON.stringify(expected.pathname)} && location.hash === ${JSON.stringify(expected.hash)}`, 15000);
  await sleep(100);
}

async function setViewport(session, viewport) {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 640
  });
}

async function waitForExpression(session, expression, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await evaluate(session, expression).catch(() => false);
    if (ok) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function screenshot(session, name) {
  const out = await session.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  const file = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(out.data, 'base64'));
  return file;
}

async function key(session, keyName) {
  const code = {
    Tab: 9,
    Enter: 13,
    Escape: 27,
    Space: 32,
    ArrowRight: 39,
    ArrowLeft: 37
  }[keyName] || 0;
  await session.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: keyName === 'Space' ? ' ' : keyName,
    code: keyName,
    windowsVirtualKeyCode: code,
    nativeVirtualKeyCode: code
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: keyName === 'Space' ? ' ' : keyName,
    code: keyName,
    windowsVirtualKeyCode: code,
    nativeVirtualKeyCode: code
  });
}

async function pressKey(session, keyName, modifiers = 0) {
  const code = { Tab: 9, Enter: 13, Escape: 27, Space: 32, ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35 }[keyName] || 0;
  for (const type of ['rawKeyDown', 'keyUp']) {
    await session.send('Input.dispatchKeyEvent', {
      type,
      key: keyName === 'Space' ? ' ' : keyName,
      code: keyName,
      modifiers,
      windowsVirtualKeyCode: code,
      nativeVirtualKeyCode: code
    });
  }
}

async function seedSession(session, baseUrl) {
  await navigate(session, `${baseUrl}/login.html`);
  const email = `ui-audit-${Date.now()}@example.com`;
  await evaluate(session, `
    fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ${JSON.stringify(email)}, password: 'password123', displayName: 'UI Audit' })
    }).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    })
  `);
  for (let i = 1; i <= 4; i += 1) {
    await evaluate(session, `
      fetch('/api/bookmarks', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'UI Audit Bookmark ${i}',
          url: 'https://example.com/page-${i}',
          folderId: 'root',
          tags: ['audit', 'ui'],
          note: 'Baseline screenshot fixture ${i}'
        })
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
    `);
  }
  await evaluate(session, `
    (async () => {
      const request = async (url, body) => {
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      };
      for (let i = 1; i <= 150; i += 1) {
        await request('/api/folders', {
          name: 'Audit Collection ' + String(i).padStart(3, '0'),
          parentId: 'root',
          color: i % 3 === 0 ? '#2fb36d' : i % 3 === 1 ? '#2f80ed' : '#8f5ce8'
        });
      }
      for (let i = 5; i <= 96; i += 1) {
        await request('/api/bookmarks', {
          title: 'Large Sample Bookmark ' + String(i).padStart(3, '0'),
          url: 'https://example.com/large-' + i,
          folderId: 'root',
          tags: ['audit-large-' + String(i).padStart(3, '0'), i % 2 === 0 ? 'even-sample' : 'odd-sample'],
          note: 'Large sample fixture for sidebar density and pagination ' + i
        });
      }
    })()
  `);
  const publicLink = await evaluate(session, `
    fetch('/api/collab/public-links', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: 'root', title: 'UI Audit Public Collection', description: 'Visual regression fixture' })
    }).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    })
  `);
  return { publicPath: `/public/c/${publicLink?.item?.token || publicLink?.token || ''}` };
}

async function prepareWorkbench(session, baseUrl, layout = 'list') {
  await navigate(session, `${baseUrl}/`);
  await evaluate(session, `localStorage.setItem('rainbow.bookmarkLayoutMode', ${JSON.stringify(layout)})`);
  await navigate(session, `${baseUrl}/`);
  await waitForExpression(session, `Boolean(document.querySelector('#cards [data-id]'))`);
}

async function captureState(session, baseUrl, viewport, state, publicPath) {
  await setViewport(session, viewport);
  const name = `${state}-${viewport.name}-${viewport.width}`;
  let loginCookies = [];
  if (state === 'login') {
    loginCookies = (await session.send('Network.getCookies', { urls: [baseUrl] })).cookies;
    for (const cookie of loginCookies) await session.send('Network.deleteCookies', { name: cookie.name, domain: cookie.domain, path: cookie.path });
    await navigate(session, `${baseUrl}/login.html`);
  } else if (state === 'main-list') {
    await prepareWorkbench(session, baseUrl, 'list');
  } else if (state === 'dark-main') {
    await evaluate(session, `localStorage.setItem('rainbow.ui.theme', 'dark')`);
    await prepareWorkbench(session, baseUrl, 'card');
  } else if (state === 'dark-settings') {
    await evaluate(session, `localStorage.setItem('rainbow.ui.theme', 'dark')`);
    await navigate(session, `${baseUrl}/settings.html#app`);
    await waitForExpression(session, `document.documentElement.dataset.theme === 'dark' && Boolean(document.querySelector('#settingsSectionAccount'))`);
  } else if (state === 'main-headline' || state === 'main-moodboard') {
    await prepareWorkbench(session, baseUrl, state.replace('main-', ''));
  } else if (state === 'bulk' || state === 'ai-drawer' || state === 'bookmark-dialog' || state === 'sidebar') {
    await prepareWorkbench(session, baseUrl, 'list');
    if (state === 'bulk') {
      await evaluate(session, `document.querySelector('#cards [data-select]')?.click()`);
      await waitForExpression(session, `!document.querySelector('#bulkActionsBar')?.classList.contains('hidden')`);
    }
    if (state === 'ai-drawer') {
      await evaluate(session, `document.querySelector('#askAiBtn')?.click()`);
      await waitForExpression(session, `document.querySelector('#aiSideDrawer')?.getAttribute('aria-hidden') === 'false'`);
    }
    if (state === 'bookmark-dialog') {
      await evaluate(session, `document.querySelector('#addBookmarkBtn')?.click()`);
      await waitForExpression(session, `document.querySelector('#bookmarkDialog')?.open === true`);
    }
    if (state === 'sidebar' && viewport.width <= 920) {
      await evaluate(session, `document.querySelector('#mobileSidebarBtn')?.click()`);
      await waitForExpression(session, `document.querySelector('.shell')?.classList.contains('sidebar-open')`);
    }
  } else if (state === 'search-empty') {
    await prepareWorkbench(session, baseUrl, 'list');
    await evaluate(session, `const input = document.querySelector('#searchInput'); input.value='zzzz-no-matching-audit'; input.dispatchEvent(new Event('input', {bubbles:true}));`);
    await waitForExpression(session, `!document.querySelector('#cards [data-id]') && document.querySelector('#cards').textContent.length > 0`);
  } else if (state === 'main-card') {
    await prepareWorkbench(session, baseUrl, 'card');
  } else if (state === 'detail') {
    await prepareWorkbench(session, baseUrl, 'list');
    await evaluate(session, `document.querySelector('#cards [data-id]')?.click()`);
    await waitForExpression(session, `Boolean(document.querySelector('.detail:not(.hidden), #detailCloseBtn'))`);
  } else if (state === 'detail-edit') {
    await prepareWorkbench(session, baseUrl, 'list');
    await evaluate(session, `document.querySelector('#cards [data-id]')?.click()`);
    await waitForExpression(session, `Boolean(document.querySelector('#detailPanelEditModeBtn'))`);
    await evaluate(session, `document.querySelector('#detailPanelEditModeBtn')?.click()`);
    await waitForExpression(session, `document.querySelector('#detailPanelEditModeBtn')?.getAttribute('aria-selected') === 'true'`);
  } else if (state === 'search-suggest') {
    await prepareWorkbench(session, baseUrl, 'list');
    await evaluate(session, `(() => {
      const input = document.querySelector('#searchInput');
      if (!input) return;
      input.focus();
      input.value = 'example';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(session, `!document.querySelector('#searchSuggestPopover')?.classList.contains('hidden')`);
  } else if (state === 'row-hover') {
    await prepareWorkbench(session, baseUrl, 'list');
    const point = await evaluate(session, `(() => {
      const rect = document.querySelector('#cards [data-id]')?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`);
    if (point) await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await waitForExpression(session, `getComputedStyle(document.querySelector('#cards [data-id] .bookmark-row-select')).opacity === '1'`);
  } else if (state === 'sort-menu') {
    await prepareWorkbench(session, baseUrl, 'list');
    await evaluate(session, `document.querySelector('#headerSortBtn')?.click()`);
    await waitForExpression(session, `!document.querySelector('#headerSortMenu')?.classList.contains('hidden')`);
  } else if (state === 'notifications-menu') {
    await prepareWorkbench(session, baseUrl, 'list');
    await evaluate(session, `document.querySelector('#headerMoreBtn')?.click()`);
    await waitForExpression(session, `!document.querySelector('#headerMoreMenu')?.classList.contains('hidden')`);
    await evaluate(session, `document.querySelector('[data-header-more-action="notifications"]')?.click()`);
    await waitForExpression(session, `!document.querySelector('#realtimeNotificationsMenu')?.classList.contains('hidden')`);
  } else if (state === 'settings' || state.startsWith('settings-')) {
    await navigate(session, `${baseUrl}/settings.html#${state === 'settings' ? 'app' : state.replace('settings-', '')}`);
    await waitForExpression(session, `Boolean(document.querySelector('#settingsSectionAccount'))`);
  } else if (state === 'plugin') {
    await navigate(session, `${baseUrl}/plugin.html`);
    await waitForExpression(session, `Boolean(document.querySelector('#pluginSectionRun'))`);
  } else if (state === 'public') {
    await navigate(session, `${baseUrl}${publicPath}`);
    await waitForExpression(session, `document.body && document.body.textContent.length > 20`);
  }
  await sleep(350);
  const overflow = await evaluate(session, `(() => {
    const de = document.documentElement;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => el instanceof HTMLElement && el.clientWidth > 0 && el.getClientRects().length && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        className: String(el.className || '').slice(0, 120),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }));
    return {
      path: location.pathname + location.hash,
      clientWidth: de.clientWidth,
      scrollWidth: de.scrollWidth,
      ok: de.scrollWidth <= de.clientWidth && offenders.length === 0,
      offenders
    };
  })()`);
  await evaluate(session, axeSource);
  const accessibility = await evaluate(session, `axe.run(document, {runOnly: {type:'tag', values:['wcag2a','wcag2aa','wcag21aa']}}).then(r => r.violations.map(v => ({id:v.id, impact:v.impact, description:v.description, nodes:v.nodes.map(n => ({target:n.target, summary:n.failureSummary}))})))`);
  const file = await screenshot(session, name);
  if (state.startsWith('dark-')) await evaluate(session, `localStorage.setItem('rainbow.ui.theme', 'light')`);
  if (loginCookies.length) await session.send('Network.setCookies', { cookies: loginCookies.map(({ name, value, domain, path, secure, httpOnly, sameSite, expires }) => ({ name, value, domain, path, secure, httpOnly, sameSite, ...(expires > 0 ? { expires } : {}) })) });
  return { state, viewport, screenshot: path.relative(root, file), overflow, accessibility };
}

async function keyboardSmoke(session, baseUrl) {
  await setViewport(session, { width: 920, height: 900 });
  await prepareWorkbench(session, baseUrl, 'list');
  const focusTrail = [];
  for (let i = 0; i < 12; i += 1) {
    await key(session, 'Tab');
    const active = await evaluate(session, `(() => {
      const el = document.activeElement;
      return { tag: el?.tagName || '', id: el?.id || '', text: String(el?.textContent || el?.ariaLabel || '').trim().slice(0, 40) };
    })()`);
    focusTrail.push(active);
  }
  const hasVisibleFocus = await evaluate(session, `Boolean(document.activeElement && document.activeElement !== document.body)`);
  await evaluate(session, `document.querySelector('#addMenuToggleBtn')?.focus()`);
  await key(session, 'Enter');
  await sleep(150);
  const menuOpened = await evaluate(session, `!document.querySelector('#addToolbarMenu')?.classList.contains('hidden')`);
  await key(session, 'Escape');
  await sleep(150);
  const menuClosed = await evaluate(session, `document.querySelector('#addToolbarMenu')?.classList.contains('hidden')`);
  await evaluate(session, `document.querySelector('#searchInput')?.focus()`);
  await session.send('Input.insertText', { text: 'example' });
  await sleep(150);
  const searchValue = await evaluate(session, `document.querySelector('#searchInput')?.value || ''`);
  await key(session, 'Escape');
  await evaluate(session, `(() => { const input = document.querySelector('#searchInput'); input.value = ''; input.dispatchEvent(new Event('input', {bubbles:true})); input.blur(); })()`);
  await waitForExpression(session, `Boolean(document.querySelector('#cards [data-id]'))`);
  await evaluate(session, `document.querySelector('#cards [data-id]')?.focus()`);
  await key(session, 'Enter');
  await waitForExpression(session, `!document.querySelector('#detailForm')?.classList.contains('hidden') && document.querySelector('#detailForm')?.classList.contains('detail-readonly')`, 5000);
  const detailFocused = await evaluate(session, `Boolean(document.querySelector('#detailSummaryTitle')?.textContent.trim())`);
  await evaluate(session, `document.querySelector('#detailPanelViewModeBtn')?.focus()`);
  await pressKey(session, 'ArrowRight');
  await waitForExpression(session, `document.querySelector('#detailPanelEditModeBtn')?.getAttribute('aria-selected') === 'true' && document.activeElement?.id === 'detailPanelEditModeBtn'`, 5000);
  const detailTabsRove = await evaluate(session, `document.activeElement?.id === 'detailPanelEditModeBtn' && document.querySelector('#detailPanelEditModeBtn')?.getAttribute('aria-selected') === 'true'`);
  const detailTabsState = await evaluate(session, `({active:document.activeElement?.id,view:document.querySelector('#detailPanelViewModeBtn')?.getAttribute('aria-selected'),edit:document.querySelector('#detailPanelEditModeBtn')?.getAttribute('aria-selected'),detailClass:document.querySelector('#detailPanel')?.className})`);
  await evaluate(session, `document.querySelector('#detailCloseBtn')?.click(); document.querySelector('#askAiBtn')?.focus(); document.querySelector('#askAiBtn')?.click()`);
  await waitForExpression(session, `document.querySelector('#aiSideDrawer')?.getAttribute('aria-hidden') === 'false'`);
  const drawerInert = await evaluate(session, `document.querySelector('.main')?.inert === true`);
  await pressKey(session, 'Escape');
  await sleep(120);
  const drawerRestoredFocus = await evaluate(session, `document.activeElement?.id === 'askAiBtn' && document.querySelector('#aiSideDrawer')?.getAttribute('aria-hidden') === 'true'`);
  await evaluate(session, `document.querySelector('#addBookmarkBtn')?.focus(); document.querySelector('#addBookmarkBtn')?.click()`);
  await waitForExpression(session, `document.querySelector('#bookmarkDialog')?.open === true`);
  const dialogFocused = await evaluate(session, `document.querySelector('#bookmarkDialog')?.contains(document.activeElement) === true`);
  await pressKey(session, 'Escape');
  await sleep(120);
  const dialogRestoredFocus = await evaluate(session, `document.activeElement?.id === 'addBookmarkBtn' && document.querySelector('#bookmarkDialog')?.open === false`);
  return {
    hasVisibleFocus,
    menuOpened,
    menuClosed,
    searchValue,
    detailFocused,
    detailTabsRove,
    detailTabsState,
    drawerInert,
    drawerRestoredFocus,
    dialogFocused,
    dialogRestoredFocus,
    focusTrail
  };
}

async function largeSampleSmoke(session, baseUrl) {
  await setViewport(session, { width: 1280, height: 900 });
  await prepareWorkbench(session, baseUrl, 'list');
  await sleep(500);
  const initial = await evaluate(session, `(() => {
    const tree = document.querySelector('#collectionsTree');
    const tags = document.querySelector('#tagsList');
    const bar = document.querySelector('#listLoadMoreBar');
    return {
      folderCount: Number(tree?.dataset.virtualCount || document.querySelectorAll('[data-tree-row-folder]').length || 0),
      treeVirtualized: tree?.classList.contains('is-virtualized') || false,
      visibleTagRows: document.querySelectorAll('#tagsList [data-tag-row]').length,
      tagTotalText: document.querySelector('#tagsSectionTitle')?.textContent || '',
      tagsCollapsed: tags?.classList.contains('collapsed') || false,
      loadMoreVisible: Boolean(bar && !bar.classList.contains('hidden')),
      listRows: document.querySelectorAll('#cards [data-id]').length,
      sidebarWidth: Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width || 0)
    };
  })()`);
  await evaluate(session, `document.querySelector('#tagsExpandToggleBtn')?.click()`);
  await sleep(350);
  const expandedTags = await evaluate(session, `(() => {
    const tags = document.querySelector('#tagsList');
    return {
      tagsVirtualized: tags?.classList.contains('is-virtualized') || false,
      virtualCount: Number(tags?.dataset.virtualCount || 0),
      visibleTagRows: document.querySelectorAll('#tagsList [data-tag-row]').length,
      tagsCollapsed: tags?.classList.contains('collapsed') || false
    };
  })()`);
  await evaluate(session, `document.querySelector('#listLoadMoreBtn')?.click()`);
  await waitForExpression(session, `document.querySelectorAll('#cards [data-id]').length > ${Number(initial.listRows || 0)}`, 10000);
  const afterLoadMore = await evaluate(session, `(() => ({
    listRows: document.querySelectorAll('#cards [data-id]').length,
    loadMoreVisible: Boolean(document.querySelector('#listLoadMoreBar') && !document.querySelector('#listLoadMoreBar').classList.contains('hidden')),
    loadMoreMeta: document.querySelector('#listLoadMoreMeta')?.textContent || '',
    pageOverflowOk: document.documentElement.scrollWidth <= document.documentElement.clientWidth
  }))()`);
  return { initial, expandedTags, afterLoadMore };
}

async function zoomAndMotionSmoke(session, baseUrl) {
  // A browser at 200% desktop zoom exposes roughly half the CSS viewport.
  // Use that effective layout width so this checks reflow and reachability.
  await setViewport(session, { width: 640, height: 900 });
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  await session.send('Performance.enable');
  await navigate(session, `${baseUrl}/settings.html#ai`);
  await session.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const sample = { lcp: 0, cls: 0, inp: 0 };
      const observe = (type, callback) => { try { new PerformanceObserver((list) => callback(list.getEntries())).observe({ type, buffered: true }); } catch (_) {} };
      observe('largest-contentful-paint', entries => { sample.lcp = Math.round(entries.at(-1)?.startTime || sample.lcp); });
      observe('layout-shift', entries => { sample.cls += entries.filter(entry => !entry.hadRecentInput).reduce((sum, entry) => sum + entry.value, 0); });
      observe('event', entries => { sample.inp = Math.max(sample.inp, ...entries.filter(entry => entry.interactionId).map(entry => Math.round(entry.duration))); });
      globalThis.__rainbowWebVitals = sample;
    })();`
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
    connectionType: 'cellular3g'
  });
  const previousTimeOrigin = await evaluate(session, 'performance.timeOrigin');
  await session.send('Page.reload');
  await waitForExpression(session, `performance.timeOrigin > ${Number(previousTimeOrigin)} && document.readyState === 'complete' && location.pathname === '/settings.html' && location.hash === '#ai'`, 20000);
  await sleep(1200);
  const reducedMotion = await evaluate(session, `matchMedia('(prefers-reduced-motion: reduce)').matches`);
  const access = await evaluate(session, `(() => {
    const de = document.documentElement;
    const buttons = [...document.querySelectorAll('button, a, input, select')].filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
    return {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      scrollOk: de.scrollWidth <= de.clientWidth,
      reachable: buttons.length > 0,
      visibleControlCount: buttons.length,
      effectiveLayoutViewportWidth: de.clientWidth,
      focusTargetCount: buttons.filter((el) => el.tabIndex >= 0).length,
      navigationMs: Math.round(performance.getEntriesByType('navigation')[0]?.duration || 0),
      firstContentfulPaintMs: performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint')?.startTime
        ? Math.round(performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint').startTime)
        : null,
      webVitals: globalThis.__rainbowWebVitals
        ? {
            lcp: globalThis.__rainbowWebVitals.lcp || null,
            cls: globalThis.__rainbowWebVitals.cls,
            inp: globalThis.__rainbowWebVitals.inp || null
          }
        : null
    };
  })()`);
  const metrics = await session.send('Performance.getMetrics');
  const metricMap = Object.fromEntries((metrics.metrics || []).map((item) => [item.name, item.value]));
  access.performance = {
    jsHeapUsedMb: Number((Number(metricMap.JSHeapUsedSize || 0) / 1024 / 1024).toFixed(1)),
    taskDurationSeconds: Number(Number(metricMap.TaskDuration || 0).toFixed(3)),
    layoutDurationSeconds: Number(Number(metricMap.LayoutDuration || 0).toFixed(3)),
    scriptDurationSeconds: Number(Number(metricMap.ScriptDuration || 0).toFixed(3)),
    throttle: 'CPU 4x; network 3G profile (150ms, 1.6Mbps down)'
  };
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await session.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await session.send('Emulation.setEmulatedMedia', { features: [] });
  return access;
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const server = await startServer();
  const chrome = await startChrome();
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl: server.baseUrl,
    viewports,
    screenshots: [],
    overflow: [],
    keyboard: null,
    largeSample: null,
    zoomAndMotion: null,
    console: [],
    networkErrors: []
  };
  try {
    const { session } = chrome;
    session.on('Runtime.exceptionThrown', (params) => {
      report.console.push({ type: 'exception', text: params.exceptionDetails?.text || params.exceptionDetails?.exception?.description || 'exception' });
    });
    session.on('Log.entryAdded', (params) => {
      const entry = params.entry || {};
      if (['error', 'warning'].includes(String(entry.level || ''))) {
        report.console.push({ type: entry.level, source: entry.source, text: entry.text || '', url: entry.url || '' });
      }
    });
    session.on('Network.responseReceived', (params) => {
      const status = Number(params.response?.status || 0);
      if (status >= 400) {
        report.networkErrors.push({ status, url: params.response?.url || '' });
      }
    });
    await setViewport(session, viewports[0]);
    await navigate(session, `${server.baseUrl}/login.html`);
    report.screenshots.push(await captureState(session, server.baseUrl, viewports[0], 'login', ''));
    const seed = await seedSession(session, server.baseUrl);
    const states = ['login', 'main-list', 'main-card', 'main-headline', 'main-moodboard', 'detail', 'detail-edit', 'bulk', 'ai-drawer', 'bookmark-dialog', 'sidebar', 'search-empty', 'settings', 'settings-account', 'settings-import', 'settings-collab', 'settings-product', 'settings-ai', 'settings-operations', 'settings-security', 'plugin', 'public', 'dark-main', 'dark-settings'];
    for (const state of states) {
      for (const viewport of viewports) {
        if (state === 'login' && viewport.name === 'mobile') continue;
        const result = await captureState(session, server.baseUrl, viewport, state, seed.publicPath);
        report.screenshots.push(result);
        report.overflow.push(result.overflow);
      }
    }
    for (const state of ['search-suggest', 'row-hover', 'sort-menu', 'notifications-menu', 'detail-edit']) {
      const result = await captureState(session, server.baseUrl, viewports[3], state, seed.publicPath);
      report.screenshots.push(result);
      report.overflow.push(result.overflow);
    }
    report.keyboard = await keyboardSmoke(session, server.baseUrl);
    report.largeSample = await largeSampleSmoke(session, server.baseUrl);
    report.zoomAndMotion = await zoomAndMotionSmoke(session, server.baseUrl);
  } finally {
    chrome.session.close();
    chrome.stop();
    server.stop();
  }
  const a11yFailures = report.screenshots.flatMap(item => (item.accessibility || []).filter(v => ['critical','serious'].includes(v.impact)).map(v => ({state:item.state, width:item.viewport.width, ...v})));
  const overflowFailures = report.overflow.filter((item) => !item.ok);
  const keyboardFailures = [];
  if (!report.keyboard?.hasVisibleFocus) keyboardFailures.push('focus did not move with Tab');
  if (!report.keyboard?.menuOpened || !report.keyboard?.menuClosed) keyboardFailures.push('add menu did not open/close via keyboard');
  if (report.keyboard?.searchValue !== 'example') keyboardFailures.push('search input did not accept keyboard text');
  if (!report.keyboard?.detailFocused) keyboardFailures.push('list item did not open detail via keyboard');
  if (!report.keyboard?.detailTabsRove) keyboardFailures.push('detail tabs did not support arrow-key roving focus');
  if (!report.keyboard?.drawerInert || !report.keyboard?.drawerRestoredFocus) keyboardFailures.push('AI drawer did not isolate or restore focus');
  if (!report.keyboard?.dialogFocused || !report.keyboard?.dialogRestoredFocus) keyboardFailures.push('bookmark dialog did not trap or restore focus');
  const largeSampleFailures = [];
  if (!report.largeSample?.initial?.treeVirtualized || Number(report.largeSample?.initial?.folderCount || 0) < 140) {
    largeSampleFailures.push('large collection tree did not virtualize');
  }
  if (!report.largeSample?.initial?.tagsCollapsed || Number(report.largeSample?.initial?.visibleTagRows || 0) > 16) {
    largeSampleFailures.push('large tag list did not start collapsed');
  }
  if (!report.largeSample?.expandedTags?.tagsVirtualized || Number(report.largeSample?.expandedTags?.virtualCount || 0) < 80) {
    largeSampleFailures.push('expanded large tag list did not virtualize');
  }
  if (!report.largeSample?.initial?.loadMoreVisible || Number(report.largeSample?.afterLoadMore?.listRows || 0) <= Number(report.largeSample?.initial?.listRows || 0)) {
    largeSampleFailures.push('large bookmark list did not load another page');
  }
  if (Math.abs(Number(report.largeSample?.initial?.sidebarWidth || 0) - 300) > 1) {
    largeSampleFailures.push(`sidebar width was not 300px in large sample (${report.largeSample?.initial?.sidebarWidth || 0})`);
  }
  if (!report.largeSample?.afterLoadMore?.pageOverflowOk) {
    largeSampleFailures.push('large sample introduced horizontal overflow after loading more');
  }
  const zoomMotionFailures = [];
  if (!report.zoomAndMotion?.reducedMotion) zoomMotionFailures.push('reduced-motion media emulation did not apply');
  if (!report.zoomAndMotion?.scrollOk) zoomMotionFailures.push('200% effective layout viewport introduced horizontal overflow');
  if (!report.zoomAndMotion?.reachable || Number(report.zoomAndMotion?.focusTargetCount || 0) < 10) zoomMotionFailures.push('200% effective layout viewport controls were not keyboard reachable');
  if (Number(report.zoomAndMotion?.effectiveLayoutViewportWidth || 0) !== 640) zoomMotionFailures.push('200% zoom layout viewport was not sampled at 640 CSS pixels');
  if (!report.zoomAndMotion?.performance?.jsHeapUsedMb) zoomMotionFailures.push('low-performance browser metrics were not sampled');
  const consoleFailures = report.console.filter((item) => !/favicon|PHONE_REGISTRATION_ERROR|google_apis/i.test(String(item.text || '')));
  const networkFailures = report.networkErrors.filter((item) => !/favicon/i.test(String(item.url || '')));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (a11yFailures.length || overflowFailures.length || keyboardFailures.length || largeSampleFailures.length || zoomMotionFailures.length || consoleFailures.length || networkFailures.length) {
    console.error('ui-browser-audit: failed');
    for (const failure of a11yFailures) console.error(`- accessibility ${failure.state} ${failure.width}: ${failure.id} (${failure.nodes.length})`);
    for (const failure of overflowFailures) console.error(`- overflow ${failure.path} ${failure.clientWidth}/${failure.scrollWidth}: ${JSON.stringify(failure.offenders)}`);
    for (const failure of keyboardFailures) console.error(`- ${failure}`);
    for (const failure of largeSampleFailures) console.error(`- ${failure}`);
    for (const failure of zoomMotionFailures) console.error(`- ${failure}`);
    for (const failure of consoleFailures) console.error(`- console ${failure.type}: ${failure.text}`);
    for (const failure of networkFailures) console.error(`- network ${failure.status}: ${failure.url}`);
    process.exit(1);
  }
  console.log('ui-browser-audit: ok');
  console.log(`- screenshots: ${report.screenshots.length}`);
  console.log(`- report: ${path.relative(root, reportPath)}`);
}

export { main, axeSource, startServer, startChrome, setViewport, navigate, evaluate, seedSession, prepareWorkbench, waitForExpression, screenshot, key, pressKey, captureState, keyboardSmoke, zoomAndMotionSmoke };

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
