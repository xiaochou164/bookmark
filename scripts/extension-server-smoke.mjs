const baseUrl = String(process.argv[2] || 'https://bookmark.sundays.ink').replace(/\/+$/, '');
const stamp = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
const email = `extension-smoke.${stamp}@example.com`;
const password = 'password123';
const deviceId = `ext_smoke_${stamp}`;
const bookmarkUrl = `https://example.com/rainbow-extension-smoke-${stamp}`;
const remoteOnlyUrl = `https://example.com/rainbow-extension-remote-${stamp}`;
const previewOnlyUrl = `https://example.com/rainbow-extension-preview-${stamp}`;

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

async function readJson(response, label) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label}: invalid JSON (${response.status})`);
  }
  assert(response.ok, `${label}: HTTP ${response.status}`, payload);
  return payload;
}

async function request(path, { method = 'GET', token = '', cookie = '', body } = {}) {
  const headers = {};
  if (typeof body !== 'undefined') headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: typeof body === 'undefined' ? undefined : JSON.stringify(body),
    redirect: 'manual'
  });
}

const registerResponse = await request('/api/auth/register', {
  method: 'POST',
  body: { email, password, displayName: 'Extension Smoke' }
});
const register = await readJson(registerResponse, 'register');
assert(register.ok === true, 'register: ok=false', register);
const setCookie = registerResponse.headers.get('set-cookie') || '';
const cookie = setCookie.split(';')[0];
assert(cookie.startsWith('rb_session='), 'register: session cookie missing');

const tokenPayload = await readJson(await request('/api/auth/tokens', {
  method: 'POST',
  cookie,
  body: { name: 'Chrome Ext Contract Smoke' }
}), 'create token');
const token = String(tokenPayload.token || tokenPayload?.item?.token || '');
assert(token, 'create token: token missing', Object.keys(tokenPayload || {}));

const health = await readJson(await request('/api/health', { token }), 'health');
assert(health.ok === true && health.runtime === 'cloudflare-workers', 'health: unexpected payload', health);

const devicePayload = {
  deviceId,
  platform: 'chrome-extension',
  app: 'bookmark-raindrop-sync',
  appVersion: '0.2.9',
  extensionVersion: '0.2.9',
  syncBackend: 'cloud',
  cloudApiBaseUrl: baseUrl,
  capabilities: ['cloud-sync-dispatch', 'device-status-report', 'chrome-bookmarks-access'],
  status: 'online',
  lastSyncStatus: null,
  meta: { reason: 'contract-smoke', mappings: 1 }
};
const device = await readJson(await request('/api/plugins/raindropSync/devices/register', {
  method: 'POST', token, body: devicePayload
}), 'register device');
assert(device.ok === true && String(device.deviceId || device?.item?.deviceId || '') === deviceId, 'register device: device id mismatch', device);

const folders = [{
  name: 'Extension Smoke',
  path: ['Extension Smoke'],
  bookmarks: [{
    url: bookmarkUrl,
    title: 'Extension Contract Bookmark',
    chromeId: 'chrome-smoke-1',
    folderPath: ['Extension Smoke'],
    createdAt: Date.now()
  }]
}];

const firstSync = await readJson(await request('/api/chrome-sync', {
  method: 'POST',
  token,
  body: { folders, deviceId, mirrorIndex: {}, deleteSync: true }
}), 'first chrome sync');
assert(firstSync.ok === true, 'first chrome sync: ok=false', firstSync);
assert(Number(firstSync.stats?.createdInDb || 0) === 1, 'first chrome sync: expected one DB create', firstSync.stats);
assert(firstSync.mirrorIndex && typeof firstSync.mirrorIndex === 'object', 'first chrome sync: mirror index missing');

const secondSync = await readJson(await request('/api/chrome-sync', {
  method: 'POST',
  token,
  body: { folders, deviceId, mirrorIndex: firstSync.mirrorIndex, deleteSync: true }
}), 'second chrome sync');
assert(secondSync.ok === true, 'second chrome sync: ok=false', secondSync);
assert(Number(secondSync.stats?.createdInDb || 0) === 0, 'second chrome sync: duplicate created', secondSync.stats);
assert(Number(secondSync.stats?.skippedDuplicate || 0) >= 1, 'second chrome sync: duplicate not recognized', secondSync.stats);

const remoteFolder = await readJson(await request('/api/folders', {
  method: 'POST', token, body: { name: 'Remote Only' }
}), 'create remote folder');
assert(remoteFolder.id, 'create remote folder: id missing', remoteFolder);
const remoteBookmark = await readJson(await request('/api/bookmarks', {
  method: 'POST',
  token,
  body: { title: 'Remote Only Bookmark', url: remoteOnlyUrl, folderId: remoteFolder.id }
}), 'create remote bookmark');
assert(remoteBookmark.id, 'create remote bookmark: id missing', remoteBookmark);

const serverToChrome = await readJson(await request('/api/chrome-sync', {
  method: 'POST',
  token,
  body: { folders, deviceId, mirrorIndex: secondSync.mirrorIndex, deleteSync: true }
}), 'server to chrome sync');
const remoteCandidate = (serverToChrome.toAddInChrome || []).find((item) => item.url === remoteOnlyUrl);
assert(remoteCandidate, 'server to chrome sync: remote bookmark not returned', serverToChrome);

const previewFolders = [{
  ...folders[0],
  bookmarks: [...folders[0].bookmarks, {
    url: previewOnlyUrl,
    title: 'Preview Only Bookmark',
    chromeId: 'chrome-preview-1',
    folderPath: ['Extension Smoke'],
    createdAt: Date.now()
  }]
}];
await readJson(await request('/api/chrome-sync', {
  method: 'POST',
  token,
  body: { folders: previewFolders, deviceId, mirrorIndex: serverToChrome.mirrorIndex, deleteSync: true }
}), 'extension preview-equivalent request');

const bookmarks = await readJson(await request('/api/chrome-sync/bookmarks', { token }), 'list synced bookmarks');
const matching = (bookmarks.items || []).filter((item) => item.url === bookmarkUrl);
assert(matching.length === 1, 'list synced bookmarks: expected exactly one matching bookmark', { total: bookmarks.total, matching });
const previewMutatedServer = (bookmarks.items || []).some((item) => item.url === previewOnlyUrl);

const status = await readJson(await request(`/api/plugins/raindropSync/devices/${encodeURIComponent(deviceId)}/status`, {
  method: 'POST',
  token,
  body: { status: 'online', lastError: '', lastSyncAt: Date.now() }
}), 'device status');
assert(status.ok === true, 'device status: ok=false', status);

process.stdout.write(`${JSON.stringify({
  ok: true,
  baseUrl,
  extensionVersion: '0.2.9',
  tokenCreation: true,
  deviceRegistration: true,
  firstSync: firstSync.stats,
  secondSync: secondSync.stats,
  syncedBookmarkVisible: true,
  serverToChromeCandidate: {
    title: remoteCandidate.title,
    folderName: remoteCandidate.folderName,
    folderPath: remoteCandidate.folderPath
  },
  previewMutatedServer,
  deviceStatusReport: true
}, null, 2)}\n`);
