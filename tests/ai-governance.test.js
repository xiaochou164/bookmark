const test = require('node:test');
const assert = require('node:assert/strict');
const {
  aiCapabilityForPath,
  aiEvalSamplesForUser,
  aiFeaturePolicyForUser,
  aiPrivacyPolicyForUser,
  assertAiFeaturePolicy,
  entitlementForUser,
  planFeatures,
  runAiEvalBaseline,
  setAiFeaturePolicy,
  setAiPrivacyPolicy
} = require('../src/services/aiGovernance');
const { tokenize } = require('../src/services/textTokens');
const { registerProductAiGovernanceRoutes } = require('../src/routes/productAiGovernanceRoutes');

test('AI entitlements and feature policies remain scoped to each user', () => {
  const db = {
    userEntitlements: {
      alice: { plan: 'pro', features: { aiSuggestions: true } },
      bob: { plan: 'free' }
    },
    aiFeaturePolicies: {
      alice: { enabled: false, capabilities: { autoTag: false } }
    }
  };

  assert.equal(planFeatures('pro').fullTextSearch, true);
  assert.equal(entitlementForUser(db, 'alice').plan, 'pro');
  assert.equal(aiFeaturePolicyForUser(db, 'alice').enabled, false);
  assert.equal(aiFeaturePolicyForUser(db, 'bob').enabled, true);

  setAiFeaturePolicy(db, 'alice', { enabled: true, capabilities: { autoTag: true } });
  assert.equal(aiFeaturePolicyForUser(db, 'alice').capabilities.autoTag, true);
  assert.equal(aiFeaturePolicyForUser(db, 'bob').capabilities.autoTag, true);
  assert.equal(Object.hasOwn(db.aiFeaturePolicies, 'bob'), false);
});

test('AI path capability checks block disabled features and ignore unrelated paths', () => {
  const db = {
    userEntitlements: { reader: { plan: 'free', features: { aiSuggestions: true } } },
    aiFeaturePolicies: { reader: { enabled: true, capabilities: { autoTag: false } } }
  };
  const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

  assert.equal(aiCapabilityForPath('/api/product/ai/autotag'), 'autoTag');
  assert.equal(aiCapabilityForPath('/api/bookmarks'), '');
  assert.throws(
    () => assertAiFeaturePolicy(db, 'reader', '/api/product/ai/autotag', badRequest),
    (error) => error.code === 'AI_FEATURE_DISABLED' && error.details.capability === 'autoTag'
  );
  assert.equal(assertAiFeaturePolicy(db, 'reader', '/api/bookmarks', badRequest).enabled, true);
});

test('AI privacy policy updates are bounded and tenant-specific', () => {
  const db = {};
  const fields = Array.from({ length: 40 }, (_, index) => `field-${index}`);
  const policy = setAiPrivacyPolicy(db, 'alice', {
    maxPromptChars: 100000,
    stripFields: fields,
    redactPatterns: fields
  });

  assert.equal(policy.maxPromptChars, 50000);
  assert.equal(policy.stripFields.length, 30);
  assert.equal(policy.redactPatterns.length, 20);
  assert.equal(aiPrivacyPolicyForUser(db, 'bob').maxPromptChars, 12000);
  assert.equal(Object.hasOwn(db.aiPrivacyPolicies, 'bob'), false);
});

test('AI evaluation uses only the current user samples and shared tokenization', () => {
  const db = {
    aiEvalSamples: [
      { id: 'alice-custom', userId: 'alice', task: 'custom', expected: { keywords: ['bookmarks'] } },
      { id: 'bob-private', userId: 'bob', task: 'private', expected: { keywords: ['secret'] } }
    ]
  };
  const samples = aiEvalSamplesForUser(db, 'alice');
  const run = runAiEvalBaseline(db, 'alice', [{ sampleId: 'alice-custom', output: { summary: 'bookmarks' } }]);

  assert.ok(samples.some((sample) => sample.id === 'alice-custom'));
  assert.ok(samples.every((sample) => sample.id !== 'bob-private'));
  assert.equal(run.userId, 'alice');
  assert.equal(run.rows.find((row) => row.sampleId === 'alice-custom').passed, true);
  assert.deepEqual(tokenize('Bookmarks 搜索'), ['bookmarks', '搜索']);
});

test('AI governance route module registers endpoints and persists policy per user', async () => {
  const routes = new Map();
  const app = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map((method) => [
    method,
    (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler)
  ]));
  const db = {};
  const dbRepo = {
    async read() { return db; },
    async update(update) { await update(db); }
  };
  const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
  registerProductAiGovernanceRoutes(app, { dbRepo, badRequest });

  assert.equal(routes.has('GET /api/product/ai/evals'), true);
  assert.equal(routes.has('POST /api/product/ai/feedback'), true);
  assert.equal(routes.has('PUT /api/product/ai/privacy-policy'), true);
  assert.equal(routes.has('PUT /api/product/ai/feature-policy'), true);
  assert.equal(routes.has('POST /api/product/ai/health/probe'), true);

  const invoke = async (method, path, userId, body = {}) => {
    let payload;
    let forwardedError;
    const res = { json(value) { payload = value; return this; }, status() { return this; } };
    await routes.get(`${method} ${path}`)(
      { auth: { user: { id: userId } }, body, params: {}, query: {}, originalUrl: path },
      res,
      (error) => { forwardedError = error; }
    );
    if (forwardedError) throw forwardedError;
    return payload;
  };

  await invoke('PUT', '/api/product/ai/privacy-policy', 'alice', { maxPromptChars: 3000 });
  assert.equal((await invoke('GET', '/api/product/ai/privacy-policy', 'alice')).policy.maxPromptChars, 3000);
  assert.equal((await invoke('GET', '/api/product/ai/privacy-policy', 'bob')).policy.maxPromptChars, 12000);
});
