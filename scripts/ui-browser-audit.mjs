import fs from 'node:fs';
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
const screenshotDir = path.join(root, 'docs/screenshots/ui-visual-baseline');
const reportPath = path.join(screenshotDir, 'audit-report.json');

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
    '--disable-gpu',
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
  const started = Date.now();
  while (Date.now() - started < 15000) {
    const ready = await evaluate(session, 'document.readyState');
    if (ready === 'complete') return;
    await sleep(100);
  }
  throw new Error(`Timed out navigating to ${url}`);
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
  if (state === 'login') {
    await navigate(session, `${baseUrl}/login.html`);
  } else if (state === 'main-list') {
    await prepareWorkbench(session, baseUrl, 'list');
  } else if (state === 'main-card') {
    await prepareWorkbench(session, baseUrl, 'card');
  } else if (state === 'detail') {
    await prepareWorkbench(session, baseUrl, 'list');
    await evaluate(session, `document.querySelector('#cards [data-id]')?.click()`);
    await waitForExpression(session, `Boolean(document.querySelector('.detail:not(.hidden), #detailCloseBtn'))`);
  } else if (state === 'settings') {
    await navigate(session, `${baseUrl}/settings.html#app`);
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
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
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
      ok: de.scrollWidth <= de.clientWidth,
      offenders
    };
  })()`);
  const file = await screenshot(session, name);
  return { state, viewport, screenshot: path.relative(root, file), overflow };
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
  await evaluate(session, `document.querySelector('#cards [data-id]')?.focus()`);
  await key(session, 'Enter');
  await sleep(300);
  const detailFocused = await evaluate(session, `document.activeElement?.id === 'detailCloseBtn' || Boolean(document.querySelector('.detail [data-detail-section-key]'))`);
  return {
    hasVisibleFocus,
    menuOpened,
    menuClosed,
    searchValue,
    detailFocused,
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
  await setViewport(session, { width: 390, height: 844 });
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  await navigate(session, `${baseUrl}/settings.html#ai`);
  await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await sleep(300);
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
      visibleControlCount: buttons.length
    };
  })()`);
  await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
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
        report.console.push({ type: entry.level, source: entry.source, text: entry.text || '' });
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
    const states = ['login', 'main-list', 'main-card', 'detail', 'settings', 'plugin', 'public'];
    for (const state of states) {
      for (const viewport of viewports) {
        if (state === 'login' && viewport.name === 'mobile') continue;
        const result = await captureState(session, server.baseUrl, viewport, state, seed.publicPath);
        report.screenshots.push(result);
        report.overflow.push(result.overflow);
      }
    }
    report.keyboard = await keyboardSmoke(session, server.baseUrl);
    report.largeSample = await largeSampleSmoke(session, server.baseUrl);
    report.zoomAndMotion = await zoomAndMotionSmoke(session, server.baseUrl);
  } finally {
    chrome.session.close();
    chrome.stop();
    server.stop();
  }
  const overflowFailures = report.overflow.filter((item) => !item.ok);
  const keyboardFailures = [];
  if (!report.keyboard?.hasVisibleFocus) keyboardFailures.push('focus did not move with Tab');
  if (!report.keyboard?.menuOpened || !report.keyboard?.menuClosed) keyboardFailures.push('add menu did not open/close via keyboard');
  if (report.keyboard?.searchValue !== 'example') keyboardFailures.push('search input did not accept keyboard text');
  if (!report.keyboard?.detailFocused) keyboardFailures.push('list item did not open detail via keyboard');
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
  if (!report.zoomAndMotion?.scrollOk) zoomMotionFailures.push('200% zoom introduced horizontal overflow');
  if (!report.zoomAndMotion?.reachable) zoomMotionFailures.push('200% zoom controls were not reachable');
  const consoleFailures = report.console.filter((item) => !/favicon|PHONE_REGISTRATION_ERROR|google_apis/i.test(String(item.text || '')));
  const networkFailures = report.networkErrors.filter((item) => !/favicon/i.test(String(item.url || '')));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (overflowFailures.length || keyboardFailures.length || largeSampleFailures.length || zoomMotionFailures.length || consoleFailures.length || networkFailures.length) {
    console.error('ui-browser-audit: failed');
    for (const failure of overflowFailures) console.error(`- overflow ${failure.path} ${failure.clientWidth}/${failure.scrollWidth}`);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
