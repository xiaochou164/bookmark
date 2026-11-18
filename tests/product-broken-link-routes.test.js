const test = require('node:test');
const assert = require('node:assert/strict');
const { registerProductBrokenLinkRoutes } = require('../src/routes/productBrokenLinkRoutes');
const { hasOwner } = require('../src/services/tenantScope');

test('broken-link scan and task history remain scoped to the requesting user', async () => {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); }
  };
  const db = {
    bookmarks: [
      { id: 'alice-url', userId: 'alice', url: 'https://alice.example' },
      { id: 'bob-url', userId: 'bob', url: 'https://bob.example' }
    ],
    brokenLinkTasks: []
  };
  const dbRepo = { async read() { return structuredClone(db); }, async update(mutator) { await mutator(db); } };
  registerProductBrokenLinkRoutes(app, {
    dbRepo,
    userBookmarks: (state, userId) => (state.bookmarks || []).filter((bookmark) => hasOwner(bookmark, userId)),
    requireFeature() {},
    badRequest: (message) => Object.assign(new Error(message), { status: 400 }),
    userIdOf: (req) => String(req.auth?.user?.id || '')
  });

  const invoke = async (method, userId, body = {}) => {
    let payload;
    let statusCode = 200;
    const res = { json(value) { payload = value; return this; }, status(value) { statusCode = value; return this; } };
    await routes.get(`${method} ${method === 'GET' ? '/api/product/broken-links/tasks' : '/api/product/broken-links/scan'}`)(
      { auth: { user: { id: userId } }, body },
      res,
      (error) => { throw error; }
    );
    return { payload, statusCode };
  };

  const aliceScan = await invoke('POST', 'alice', { limit: 10 });
  assert.equal(aliceScan.statusCode, 202);
  assert.deepEqual(aliceScan.payload.task.results.map((item) => item.bookmarkId), ['alice-url']);
  assert.equal((await invoke('GET', 'bob')).payload.items.length, 0);

  await invoke('POST', 'bob', { limit: 10 });
  assert.deepEqual((await invoke('GET', 'alice')).payload.items.map((item) => item.userId), ['alice']);
  assert.deepEqual((await invoke('GET', 'bob')).payload.items.map((item) => item.userId), ['bob']);
});
