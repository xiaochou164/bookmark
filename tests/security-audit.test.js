const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { isSafeUrl } = require('../src/utils/url');
const { fetchPublicResource } = require('../src/utils/publicFetch');

for (const url of ['http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://localhost.', 'http://127.1', 'http://0x7f000001', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'https://user:secret@example.com']) {
  test(`SSRF policy rejects ${url}`, () => assert.equal(isSafeUrl(url), false));
}
test('redirect to private network is rejected before a second fetch', async () => {
  const calls = [];
  await assert.rejects(fetchPublicResource('https://example.com', { fetchImpl: async (url) => {
    calls.push(url);
    return new Response(null, { status: 302, headers: { location: 'http://[::1]/admin' } });
  } }), /Unsafe URL/);
  assert.equal(calls.length, 1);
});
test('fetch caps streamed response size', async () => {
  await assert.rejects(fetchPublicResource('https://example.com', { maxBytes: 4, fetchImpl: async () => new Response('12345') }), /too large/i);
});

function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  let writes = 0;
  return {
    get writes() { return writes; },
    close: () => sqlite.close(),
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const bind = (args) => ({
        async run() { writes++; const info = stmt.run(...args); return { success: true, meta: { changes: Number(info.changes) } }; },
        async first() { return stmt.get(...args) || null; },
        async all() { return { results: stmt.all(...args) }; }
      });
      return { bind: (...args) => bind(args), ...bind([]) };
    }
  };
}

async function exercise(call, snapshot, createAsset) {
  assert.equal((await call('/api/bookmarks')).status, 401);
  const register = async (email) => {
    const response = await call('/api/auth/register', 'POST', { email, password: 'audit-password-123', displayName: email });
    assert.equal(response.status, 201, await response.clone().text());
    return { cookie: response.headers.get('set-cookie') };
  };
  const alice = await register('alice@audit.example');
  const bob = await register('bob@audit.example');
  const create = await call('/api/bookmarks', 'POST', { title: 'Private', url: 'https://example.com/private' }, alice);
  assert.equal(create.status, 201, await create.clone().text());
  const bookmark = await create.json();
  await createAsset?.(bookmark.id);
  const assetPath = `/api/assets/snapshots/bookmarks/${bookmark.id}/source.html`;
  assert.equal((await call(assetPath)).status, 401);
  assert.equal((await call(assetPath, 'GET', undefined, bob)).status, 404);
  const ownAsset = await call(assetPath, 'GET', undefined, alice);
  assert.equal(ownAsset.status, 200);
  assert.match(ownAsset.headers.get('content-security-policy'), /sandbox/);
  assert.equal(ownAsset.headers.get('cache-control'), 'private, no-store');

  for (const [method, body] of [['GET', undefined], ['PUT', { title: 'stolen' }], ['DELETE', undefined]]) {
    const denied = await call(`/api/bookmarks/${bookmark.id}`, method, body, bob);
    assert.ok([403, 404, 501].includes(denied.status), `${method}: ${denied.status}`);
    if (method !== 'GET') assert.notEqual(denied.status, 501);
  }
  const bobItems = await (await call('/api/bookmarks', 'GET', undefined, bob)).json();
  assert.equal(bobItems.items.some((item) => item.id === bookmark.id), false);
  assert.equal((await call('/api/bookmarks', 'POST', { url: 'https://example.com/csrf' }, { ...alice, origin: 'https://evil.example' })).status, 403);
  const tokenRes = await call('/api/auth/tokens', 'POST', { name: 'audit' }, alice);
  const token = (await tokenRes.json()).token;
  assert.ok(token);
  const bearer = { authorization: `Bearer ${token}` };
  const folders = [{ name: 'Bar', path: ['Bar'], bookmarks: [{ url: 'https://example.com/new', title: 'New', chromeId: '99' }] }];
  for (const headers of [alice, bearer]) {
    const before = await snapshot();
    const preview = await call('/api/chrome-sync', 'POST', { folders, preview: true, deleteSync: true }, headers);
    assert.equal(preview.status, 200, await preview.clone().text());
    assert.equal((await preview.json()).stats.createdInDb, 1);
    assert.equal(await snapshot(), before, 'snapshot preview performed a persistent write');
    const beforePlugin = await snapshot();
    const plugin = await call('/api/plugins/raindropSync/preview', 'POST', { raindropToken: 'fixture-unused', mappings: [], topLevelAutoSync: false }, headers);
    assert.equal(plugin.status, 200, await plugin.clone().text());
    assert.equal(await snapshot(), beforePlugin, 'plugin preview performed a persistent write');
  }
  const sync = await call('/api/chrome-sync', 'POST', { folders, deleteSync: false }, bearer);
  assert.equal(sync.status, 200, await sync.clone().text());
  const result = await sync.json();
  assert.equal(result.stats.createdInDb, 1);
  const repeat = await (await call('/api/chrome-sync', 'POST', { folders, deleteSync: false }, bearer)).json();
  assert.equal(repeat.stats.createdInDb, 0, 'sync must be idempotent');
  const missing = await (await call('/api/chrome-sync', 'POST', { folders: [], mirrorIndex: result.mirrorIndex, deleteSync: false }, bearer)).json();
  assert.equal(missing.stats.deletedInDb, 0, 'deleteSync=false must protect cloud data');
  const final = await (await call('/api/bookmarks', 'GET', undefined, alice)).json();
  assert.ok(final.items.some((item) => item.id === bookmark.id && item.title === 'Private'));
}

test('Worker: real SQLite auth, tenant isolation, CSRF, preview zero writes and sync', async () => {
  const { default: worker } = await import('../src/worker.mjs');
  const DB = sqliteD1();
  const env = { DB, TASK_QUEUE: { async send() {} }, OBJECTS: { async get() { return { body: '<h1>Private</h1>', writeHttpMetadata(headers) { headers.set('content-type', 'text/html'); } }; } } };
  const call = (route, method = 'GET', body, headers = {}) => worker.fetch(new Request(`https://audit.example${route}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body)
  }), env);
  try { await exercise(call, () => DB.writes); } finally { DB.close(); }
});

test('Node: isolated JSON auth, tenant isolation, CSRF, preview zero writes and sync', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bookmark-security-'));
  const dataFile = path.join(dir, 'db.json');
  const listener = require('node:net').createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DB_BACKEND: 'json', DATA_FILE: dataFile, OBJECT_STORAGE_DIR: path.join(dir, 'objects'), QUEUE_BACKEND: 'memory', LOG_LEVEL: 'warn' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  try {
    for (let i = 0; i < 100; i++) {
      if (await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.ok).catch(() => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const call = (route, method = 'GET', body, headers = {}) => fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    await exercise(call, () => fs.readFile(dataFile, 'utf8'), async (id) => { const asset = path.join(dir, 'objects/snapshots/bookmarks', id); await fs.mkdir(asset, { recursive: true }); await fs.writeFile(path.join(asset, 'source.html'), '<h1>Private</h1>'); });
  } finally { child.kill('SIGTERM'); await new Promise((resolve) => child.once('exit', resolve)); await fs.rm(dir, { recursive: true, force: true }); }
});


test('Worker restore rejects foreign IDs before replace and protects R2 sources', async () => {
  const { default: worker } = await import('../src/worker.mjs');
  const DB = sqliteD1();
  const messages = [];
  let objectReads = 0;
  const env = { DB, TASK_QUEUE: { async send(message) { messages.push(message); } }, OBJECTS: { async get() { objectReads++; throw new Error('Must not read foreign object'); } } };
  const call = (route, method = 'GET', body, cookie = '') => worker.fetch(new Request(`https://audit.example${route}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  try {
    const accounts = [];
    for (const name of ['owner', 'attacker']) {
      const registered = await call('/api/auth/register', 'POST', { email: `${name}@restore.example`, password: 'restore-password-123' });
      const cookie = registered.headers.get('set-cookie');
      const item = await (await call('/api/bookmarks', 'POST', { title: name, url: `https://example.com/${name}` }, cookie)).json();
      accounts.push({ cookie, item });
    }
    const [owner, attacker] = accounts;
    for (const input of [
      { mode: 'replace', content: JSON.stringify({ folders: [], bookmarks: [{ ...owner.item, title: 'overwritten' }] }) },
      { mode: 'replace', backupFile: { key: 'backups/foreign/private.json' } }
    ]) {
      const response = await call('/api/io/tasks', 'POST', { type: 'restore_backup', input }, attacker.cookie);
      assert.equal(response.status, 202);
      const { task } = await response.json();
      const body = messages.shift();
      await worker.queue({ messages: [{ body, ack() {}, retry() { assert.fail('unexpected retry'); } }] }, env);
      const completed = await (await call(`/api/io/tasks/${task.id}`, 'GET', undefined, attacker.cookie)).json();
      assert.equal(completed.task.status, 'failed', JSON.stringify(completed));
      const owned = await (await call('/api/bookmarks', 'GET', undefined, owner.cookie)).json();
      const own = await (await call('/api/bookmarks', 'GET', undefined, attacker.cookie)).json();
      assert.equal(owned.items[0].title, 'owner');
      assert.equal(own.items[0].title, 'attacker', 'replace must validate before deleting existing data');
    }
    assert.equal(objectReads, 0);
  } finally { DB.close(); }
});

test('JSON store concurrent readers see complete snapshots', async () => {
  const { JsonStore } = require('../src/store');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bookmark-atomic-'));
  const store = new JsonStore(path.join(dir, 'db.json'));
  try {
    await store.init();
    await Promise.all(Array.from({ length: 20 }, (_, index) => Promise.all([
      store.update((db) => ({ ...db, auditPayload: 'x'.repeat(20000), auditCounter: index })),
      store.read().then((db) => assert.ok(Array.isArray(db.bookmarks)))
    ])));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
