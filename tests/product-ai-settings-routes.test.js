const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAiProviderConfig,
  setAiProviderConfig,
  publicAiProviderConfig
} = require('../src/services/aiProviderService');
const {
  DEFAULT_AI_PROMPT_TEMPLATES,
  ensureAiPromptTemplates,
  aiPromptTemplatesForUser
} = require('../src/services/aiGovernance');
const { registerProductAiSettingsRoutes } = require('../src/routes/productAiSettingsRoutes');

test('AI settings routes keep provider secrets, prompt overrides, and rules scoped per user', async () => {
  const db = { aiProviderConfigs: {}, aiPromptTemplates: [] };
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    put(path, handler) { routes.set(`PUT ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); }
  };
  const dbRepo = {
    async read() { return structuredClone(db); },
    async update(mutator) { await mutator(db); }
  };
  const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
  const featureChecks = [];
  const ruleCalls = [];
  const aiRules = {
    async getConfig({ userId }) { return { userId, enabled: true }; },
    async updateConfig({ userId, patch }) { ruleCalls.push({ op: 'update', userId, patch }); return { userId, ...patch }; },
    async runManual(input) { ruleCalls.push({ op: 'run', ...input }); return { run: { userId: input.userId } }; },
    async listRuns(input) { ruleCalls.push({ op: 'list', ...input }); return [{ userId: input.userId }]; }
  };
  registerProductAiSettingsRoutes(app, {
    dbRepo,
    userIdOf: (req) => String(req.auth?.user?.id || ''),
    badRequest,
    notFound: (message) => Object.assign(new Error(message), { status: 404 }),
    publicAiProviderConfig,
    getAiProviderConfig,
    setAiProviderConfig,
    requireFeature(_db, userId, feature) { featureChecks.push({ userId, feature }); },
    async testAiProviderConnection(config) { return { providerType: config.providerType, model: config.openaiCompatible.model }; },
    aiPromptTemplatesForUser,
    DEFAULT_AI_PROMPT_TEMPLATES,
    ensureAiPromptTemplates,
    aiRules
  });

  const invoke = async (method, path, userId, body = {}, params = {}, query = {}) => {
    let payload;
    let forwardedError;
    const res = { json(value) { payload = value; return this; } };
    await routes.get(`${method} ${path}`)(
      { auth: { user: { id: userId } }, body, params, query },
      res,
      (error) => { forwardedError = error; }
    );
    if (forwardedError) throw forwardedError;
    return payload;
  };

  await invoke('PUT', '/api/product/ai/config', 'alice', {
    providerType: 'openai-compatible',
    openaiCompatible: { apiKey: 'alice-secret-key', model: 'alice-model' }
  });
  const aliceConfig = await invoke('GET', '/api/product/ai/config', 'alice');
  const bobConfig = await invoke('GET', '/api/product/ai/config', 'bob');
  assert.equal(aliceConfig.config.openaiCompatible.model, 'alice-model');
  assert.equal(aliceConfig.config.openaiCompatible.hasApiKey, true);
  assert.equal(aliceConfig.config.openaiCompatible.apiKeyMasked.includes('alice-secret-key'), false);
  assert.equal(bobConfig.config.openaiCompatible.hasApiKey, false);
  assert.equal(db.aiProviderConfigs.alice.openaiCompatible.apiKey, 'alice-secret-key');
  assert.equal(db.aiProviderConfigs.bob, undefined);

  const customPrompt = await invoke('PUT', '/api/product/ai/prompts/:key', 'alice', { body: 'Alice only prompt' }, { key: DEFAULT_AI_PROMPT_TEMPLATES[0].key });
  assert.equal(customPrompt.item.userId, 'alice');
  assert.equal((await invoke('GET', '/api/product/ai/prompts', 'bob')).items.find((item) => item.key === customPrompt.item.key).source, 'default');
  assert.equal(db.aiPromptTemplates.filter((item) => item.userId === 'bob').length, 0);

  const rulesConfig = await invoke('PUT', '/api/product/ai/rules/config', 'alice', { enabled: false });
  const rulesRun = await invoke('POST', '/api/product/ai/rules/run', 'alice', { bookmarkId: 'alice-bookmark' });
  const rulesList = await invoke('GET', '/api/product/ai/rules/runs', 'bob', {}, {}, { limit: 5 });
  assert.equal(rulesConfig.config.userId, 'alice');
  assert.equal(rulesRun.run.userId, 'alice');
  assert.deepEqual(rulesList.items, [{ userId: 'bob' }]);
  assert.deepEqual(ruleCalls.map((call) => call.userId), ['alice', 'alice', 'bob']);
  assert.ok(featureChecks.every((check) => check.feature === 'aiSuggestions'));
});

test('AI provider test merges nested settings without persisting the request', async () => {
  const db = { aiProviderConfigs: {} };
  setAiProviderConfig(db, 'alice', {
    providerType: 'openai-compatible',
    openaiCompatible: { apiKey: 'existing-secret', model: 'existing-model' },
    tagging: { maxTags: 4, preferChinese: true }
  });
  let testedConfig;
  const app = {
    get() {},
    put() {},
    post(path, handler) { if (path === '/api/product/ai/test') this.handler = handler; }
  };
  registerProductAiSettingsRoutes(app, {
    dbRepo: { async read() { return structuredClone(db); }, async update(mutator) { await mutator(db); } },
    userIdOf: () => 'alice',
    badRequest: (message) => new Error(message),
    notFound: () => new Error('not found'),
    publicAiProviderConfig,
    getAiProviderConfig,
    setAiProviderConfig,
    requireFeature() {},
    async testAiProviderConnection(config) { testedConfig = config; return { ok: true }; },
    aiPromptTemplatesForUser,
    DEFAULT_AI_PROMPT_TEMPLATES,
    ensureAiPromptTemplates,
    aiRules: null
  });

  let payload;
  await app.handler({ body: { tagging: { maxTags: 7 } } }, { json(value) { payload = value; return this; } }, (error) => { throw error; });
  assert.equal(payload.ok, true);
  assert.equal(testedConfig.openaiCompatible.apiKey, 'existing-secret');
  assert.equal(testedConfig.openaiCompatible.model, 'existing-model');
  assert.equal(testedConfig.tagging.maxTags, 7);
  assert.equal(testedConfig.tagging.preferChinese, true);
  assert.equal(db.aiProviderConfigs.alice.tagging.maxTags, 4);
});
