import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.resolve(process.env.EXTENSION_SOURCE_ROOT || root);
const outputDir = path.resolve(root, process.env.EXTENSION_UI_AUDIT_DIR || 'docs/screenshots/audit-2026-11-16/after/extensions');
process.env.UI_AUDIT_DIR = outputDir;

const {
  axeSource,
  startChrome,
  setViewport,
  navigate,
  evaluate,
  waitForExpression,
  screenshot
} = await import('./ui-browser-audit.mjs');

const viewports = [
  { name: 'mobile', width: 360, height: 780 },
  { name: 'small', width: 640, height: 900 },
  { name: 'tablet', width: 920, height: 900 },
  { name: 'desktop', width: 1280, height: 900 }
];

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml']
]);

function startFixtureServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const match = String(req.url || '').match(/^\/(chrome|safari)\/(popup|options|shared|logo)\.(html|js|css|svg)$/);
      if (!match) {
        res.writeHead(404).end('not found');
        return;
      }
      const directory = match[1] === 'chrome' ? 'chrome-extension' : 'safari-extension';
      const file = path.join(sourceRoot, directory, `${match[2]}.${match[3]}`);
      if (!fs.existsSync(file)) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': contentTypes.get(path.extname(file)) || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      fs.createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        stop: () => server.close()
      });
    });
  });
}

function fakeExtensionApiSource() {
  return `(() => {
    const state = {
      cloudApiBaseUrl: 'https://bookmark.example.test',
      cloudApiToken: '',
      rbAutoSyncEnabled: false,
      rbAutoSyncMinutes: 30,
      lastSyncStatus: null
    };
    const storage = {
      get(defaults, callback) {
        const value = { ...(defaults || {}), ...state };
        if (callback) { queueMicrotask(() => callback(value)); return; }
        return Promise.resolve(value);
      },
      set(patch, callback) {
        Object.assign(state, patch || {});
        if (callback) queueMicrotask(callback);
        return Promise.resolve();
      },
      remove(keys, callback) {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
        if (callback) queueMicrotask(callback);
        return Promise.resolve();
      }
    };
    const sample = {
      ok: true,
      preview: true,
      chromeFolders: 3,
      totalChromeBookmarks: 42,
      chrome: { toAddCount: 2, addedToChrome: 0, toDeleteCount: 1, deletedFromChrome: 0 },
      server: { createdInDb: 1, updatedInDb: 2, movedInDb: 1, deletedInDb: 0, deletedFoldersInDb: 0, skippedDuplicate: 38 },
      samples: { toAdd: ['+Chrome: 示例书签 (阅读)'], toDelete: ['-Chrome: https://obsolete.example'] }
    };
    const runtime = {
      lastError: null,
      sendMessage(message, callback) {
        let response = { ok: true };
        if (message.type === 'PREVIEW_RAINBOW_SYNC') response = sample;
        if (message.type === 'SYNC_WITH_RAINBOW') response = { ...sample, preview: false, chrome: { ...sample.chrome, addedToChrome: 2, deletedFromChrome: 1 } };
        if (message.type === 'PING_CLOUD') response = { ok: true, health: { service: 'rainbow-fixture' } };
        if (message.type === 'AUTO_FETCH_TOKEN') response = { ok: true, token: 'fixture-token' };
        queueMicrotask(() => callback?.(response));
        return Promise.resolve(response);
      },
      openOptionsPage() { globalThis.__optionsOpened = true; }
    };
    globalThis.chrome = { storage: { local: storage }, runtime };
    globalThis.browser = { storage: { local: storage }, runtime };
  })();`;
}

async function auditPage(session, baseUrl, platform, page, viewport) {
  await setViewport(session, viewport);
  await navigate(session, `${baseUrl}/${platform}/${page}.html`);
  const readySelector = page === 'popup' ? '#rbPreviewBtn' : '#saveBtn';
  await waitForExpression(session, `Boolean(document.querySelector(${JSON.stringify(readySelector)}))`);
  if (page === 'popup') {
    await evaluate(session, `document.querySelector('#rbPreviewBtn').click()`);
    await waitForExpression(session, `document.querySelector('#statusBox')?.dataset.state === 'success'`);
  } else {
    await evaluate(session, `document.querySelector('#toggleTokenBtn').click(); document.querySelector('#rbPreviewNowBtn').click()`);
    await waitForExpression(session, `document.querySelector('#rbSyncMsg')?.dataset.state === 'success'`);
  }
  await evaluate(session, axeSource);
  const result = await evaluate(session, `axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r => ({
    serious: r.violations.filter(v => ['critical','serious'].includes(v.impact)).map(v => ({id:v.id, impact:v.impact, targets:v.nodes.map(n => n.target)})),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    status: document.querySelector('#statusBox, #rbSyncMsg')?.textContent || '',
    activeElement: document.activeElement?.id || ''
  }))`);
  const file = await screenshot(session, `${platform}-${page}-${viewport.name}-${viewport.width}`);
  return { platform, page, viewport, screenshot: path.relative(root, file), ...result };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const fixture = await startFixtureServer();
  const browser = await startChrome();
  const report = { createdAt: new Date().toISOString(), results: [] };
  try {
    await browser.session.send('Page.addScriptToEvaluateOnNewDocument', { source: fakeExtensionApiSource() });
    for (const platform of ['chrome', 'safari']) {
      for (const page of ['popup', 'options']) {
        for (const viewport of viewports) {
          report.results.push(await auditPage(browser.session, fixture.baseUrl, platform, page, viewport));
        }
      }
    }
  } finally {
    browser.session.close();
    browser.stop();
    fixture.stop();
  }
  fs.writeFileSync(path.join(outputDir, 'audit-report.json'), JSON.stringify(report, null, 2));
  const failures = report.results.filter((item) => item.overflow || item.serious.length || !/预览/.test(item.status));
  if (failures.length) {
    for (const failure of failures) console.error(`extension-ui-audit: ${failure.platform}/${failure.page}/${failure.viewport.width} failed ${JSON.stringify(failure)}`);
    process.exit(1);
  }
  console.log(`extension-ui-audit: ok (${report.results.length} screenshots)`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
