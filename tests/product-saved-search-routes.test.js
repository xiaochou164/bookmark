const test = require('node:test');
const assert = require('node:assert/strict');
const { registerProductSavedSearchRoutes } = require('../src/routes/productSavedSearchRoutes');

test('saved search routes keep create, list, update and delete scoped to the owner', async () => {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    put(path, handler) { routes.set(`PUT ${path}`, handler); },
    delete(path, handler) { routes.set(`DELETE ${path}`, handler); }
  };
  const db = { savedSearches: [] };
  const dbRepo = {
    async read() { return structuredClone(db); },
    async update(mutator) { await mutator(db); }
  };
  const errorFactory = (message) => Object.assign(new Error(message), { status: 404 });
  registerProductSavedSearchRoutes(app, {
    dbRepo,
    badRequest: (message) => Object.assign(new Error(message), { status: 400 }),
    notFound: errorFactory,
    userIdOf: (req) => String(req.auth?.user?.id || '')
  });

  const invoke = async (method, path, userId, body = {}, params = {}) => {
    let payload;
    let statusCode = 200;
    let sent = false;
    let forwardedError;
    const res = {
      json(value) { payload = value; return this; },
      status(value) { statusCode = value; return this; },
      send() { sent = true; return this; }
    };
    await routes.get(`${method} ${path}`)(
      { auth: { user: { id: userId } }, body, params },
      res,
      (error) => { forwardedError = error; }
    );
    return { payload, statusCode, sent, forwardedError };
  };

  const created = await invoke('POST', '/api/product/search/saved', 'alice', { name: 'Work', query: { tags: ['work'] } });
  const id = created.payload.item.id;
  assert.equal(created.statusCode, 201);
  assert.equal((await invoke('GET', '/api/product/search/saved', 'alice')).payload.items.length, 1);
  assert.equal((await invoke('GET', '/api/product/search/saved', 'bob')).payload.items.length, 0);

  const deniedUpdate = await invoke('PUT', '/api/product/search/saved/:id', 'bob', { name: 'Stolen' }, { id });
  assert.equal(deniedUpdate.forwardedError.status, 404);
  assert.equal(db.savedSearches[0].name, 'Work');
  const deniedDelete = await invoke('DELETE', '/api/product/search/saved/:id', 'bob', {}, { id });
  assert.equal(deniedDelete.forwardedError.status, 404);
  assert.equal(db.savedSearches.length, 1);

  const updated = await invoke('PUT', '/api/product/search/saved/:id', 'alice', { name: 'Reading' }, { id });
  assert.equal(updated.payload.item.name, 'Reading');
  const deleted = await invoke('DELETE', '/api/product/search/saved/:id', 'alice', {}, { id });
  assert.equal(deleted.statusCode, 204);
  assert.equal(deleted.sent, true);
  assert.equal(db.savedSearches.length, 0);
});
