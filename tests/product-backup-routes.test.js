const test = require('node:test');
const assert = require('node:assert/strict');
const { registerProductBackupRoutes } = require('../src/routes/productBackupRoutes');
const { hasOwner } = require('../src/services/tenantScope');

test('backup routes restore only the owner snapshot and preserve other tenants', async () => {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); }
  };
  const db = {
    folders: [
      { id: 'alice-folder', userId: 'alice', name: 'Alice folder' },
      { id: 'bob-folder', userId: 'bob', name: 'Bob folder' }
    ],
    bookmarks: [
      { id: 'alice-bookmark', userId: 'alice', url: 'https://alice.example' },
      { id: 'bob-bookmark', userId: 'bob', url: 'https://bob.example' }
    ],
    savedSearches: [
      { id: 'alice-search', userId: 'alice', name: 'Alice search' },
      { id: 'bob-search', userId: 'bob', name: 'Bob search' }
    ],
    backups: []
  };
  const dbRepo = {
    async read() { return structuredClone(db); },
    async update(mutator) { await mutator(db); }
  };
  registerProductBackupRoutes(app, {
    dbRepo,
    objectStorage: null,
    requireFeature() {},
    userFolders: (state, userId) => (state.folders || []).filter((item) => hasOwner(item, userId)),
    userBookmarks: (state, userId) => (state.bookmarks || []).filter((item) => hasOwner(item, userId)),
    hasOwner,
    badRequest: (message) => Object.assign(new Error(message), { status: 400 }),
    notFound: (message) => Object.assign(new Error(message), { status: 404 }),
    userIdOf: (req) => String(req.auth?.user?.id || '')
  });

  const invoke = async (method, path, userId, params = {}) => {
    let payload;
    let statusCode = 200;
    let forwardedError;
    const res = {
      json(value) { payload = value; return this; },
      status(value) { statusCode = value; return this; }
    };
    await routes.get(`${method} ${path}`)(
      { auth: { user: { id: userId } }, params },
      res,
      (error) => { forwardedError = error; }
    );
    return { payload, statusCode, forwardedError };
  };

  const created = await invoke('POST', '/api/product/backups', 'alice');
  const backupId = created.payload.backup.id;
  assert.equal(created.statusCode, 201);
  assert.deepEqual(created.payload.backup.snapshot.bookmarks.map((item) => item.id), ['alice-bookmark']);
  assert.deepEqual((await invoke('GET', '/api/product/backups', 'bob')).payload.items, []);

  db.bookmarks.push({ id: 'alice-new', userId: 'alice', url: 'https://new.example' });
  const foreignRestore = await invoke('POST', '/api/product/backups/:id/restore', 'bob', { id: backupId });
  assert.equal(foreignRestore.forwardedError.status, 404);
  assert.ok(db.bookmarks.some((item) => item.id === 'alice-new'));

  const restored = await invoke('POST', '/api/product/backups/:id/restore', 'alice', { id: backupId });
  assert.equal(restored.payload.restored.id, backupId);
  assert.deepEqual(db.bookmarks.map((item) => item.id), ['bob-bookmark', 'alice-bookmark']);
  assert.deepEqual(db.folders.map((item) => item.id), ['bob-folder', 'alice-folder']);
  assert.deepEqual(db.savedSearches.map((item) => item.id), ['bob-search', 'alice-search']);
});
