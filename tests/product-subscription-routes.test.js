const test = require('node:test');
const assert = require('node:assert/strict');
const { entitlementForUser, setEntitlement } = require('../src/services/aiGovernance');
const { registerProductSubscriptionRoutes } = require('../src/routes/productSubscriptionRoutes');

test('subscription routes register entitlement, subscription and tenant-scoped quota handlers', async () => {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    put(path, handler) { routes.set(`PUT ${path}`, handler); }
  };
  const db = {};
  const dbRepo = {
    async read() { return structuredClone(db); },
    async update(mutator) { await mutator(db); }
  };
  const quotaSummary = (_db, userId) => ({ userId, usage: { bookmarks: 0 }, limits: { bookmarks: 5000 } });
  const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

  registerProductSubscriptionRoutes(app, {
    dbRepo,
    badRequest,
    userIdOf: (req) => String(req.auth?.user?.id || ''),
    quotaSummary,
    entitlementForUser,
    setEntitlement
  });

  assert.equal(routes.has('GET /api/product/entitlements'), true);
  assert.equal(routes.has('GET /api/product/subscription'), true);
  assert.equal(routes.has('PUT /api/product/subscription'), true);
  assert.equal(routes.has('GET /api/product/quota'), true);

  const invoke = async (method, path, userId, body = {}) => {
    let payload;
    let forwardedError;
    const res = { json(value) { payload = value; return this; } };
    await routes.get(`${method} ${path}`)(
      { auth: { user: { id: userId } }, body },
      res,
      (error) => { forwardedError = error; }
    );
    if (forwardedError) throw forwardedError;
    return payload;
  };

  const alice = await invoke('PUT', '/api/product/subscription', 'alice', { plan: 'pro' });
  assert.equal(alice.entitlement.plan, 'pro');
  assert.equal((await invoke('GET', '/api/product/subscription', 'alice')).subscription.userId, 'alice');
  assert.equal((await invoke('GET', '/api/product/subscription', 'bob')).subscription, null);
  assert.equal((await invoke('GET', '/api/product/entitlements', 'bob')).entitlement.plan, 'free');
  assert.equal((await invoke('GET', '/api/product/quota', 'alice')).quota.userId, 'alice');
  assert.deepEqual(db.billingSubscriptions.map((item) => item.userId), ['alice']);
});
