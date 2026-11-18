const test = require('node:test');
const assert = require('node:assert/strict');
const nodeGovernance = require('../src/services/aiGovernance');

test('Worker AI governance defaults and feature policy normalization match Node policy', async () => {
  const worker = await import('../src/worker/aiGovernance.mjs');
  assert.deepEqual(worker.DEFAULT_AI_FEATURE_POLICY, nodeGovernance.DEFAULT_AI_FEATURE_POLICY);
  assert.deepEqual(worker.DEFAULT_AI_PRIVACY_POLICY, nodeGovernance.DEFAULT_AI_PRIVACY_POLICY);
  assert.deepEqual(worker.DEFAULT_AI_EVAL_SAMPLES, nodeGovernance.DEFAULT_AI_EVAL_SAMPLES);
  assert.deepEqual(worker.normalizeAiFeaturePolicy({ enabled: false, capabilities: { qa: false } }), {
    ...worker.DEFAULT_AI_FEATURE_POLICY,
    enabled: false,
    capabilities: { ...worker.DEFAULT_AI_FEATURE_POLICY.capabilities, qa: false }
  });
  assert.equal(worker.normalizeAiFeaturePolicy(null).capabilities.bulkTasks, true);
});

test('Worker AI provider readiness and path capabilities use explicit allowlisted settings', async () => {
  const worker = await import('../src/worker/aiGovernance.mjs');
  assert.equal(worker.aiProviderLooksConfigured({ enabled: false, providerType: 'openai_compatible' }), false);
  assert.equal(worker.aiProviderLooksConfigured({
    enabled: true,
    providerType: 'openai_compatible',
    openaiCompatible: { baseUrl: 'https://api.example/v1', apiKey: 'secret-key', model: 'test-model' }
  }), true);
  assert.equal(worker.aiProviderLooksConfigured({
    enabled: true,
    providerType: 'cloudflare_ai',
    cloudflareAI: { accountId: 'account', apiToken: 'token', model: 'model' }
  }), true);
  assert.equal(worker.aiProviderLooksConfigured({
    enabled: true,
    providerType: 'cloudflare_ai',
    cloudflareAI: { accountId: 'account', apiToken: '', model: 'model' }
  }), false);
  assert.equal(worker.aiCapabilityForPath('/api/product/ai/batch/autotag/tasks'), 'bulkTasks');
  assert.equal(worker.aiCapabilityForPath('/api/product/ai/qa'), 'qa');
  assert.equal(worker.aiCapabilityForPath('/api/product/ai/summary/b1'), 'summarize');
  assert.equal(worker.aiCapabilityForPath('/api/product/ai/tags/localize'), 'autoTag');
  assert.equal(worker.aiCapabilityForPath('/api/product/ai/config'), '');
  assert.equal(worker.isAiGovernancePath('/api/product/ai/privacy-policy'), true);
  assert.equal(worker.isAiGovernancePath('/api/product/ai/summary/b1'), false);
});

test('Worker AI evaluation, feedback, health and job records are bounded and user-labelled', async () => {
  const worker = await import('../src/worker/aiGovernance.mjs');
  const evalRun = worker.buildAiEvalRun('alice', [
    { sampleId: 'eval_autotag_ai_article', output: { tags: ['AI', 'OpenAI', 'API'], keywords: ['structured', 'json'] } }
  ]);
  assert.equal(evalRun.userId, 'alice');
  assert.equal(evalRun.sampleCount, worker.DEFAULT_AI_EVAL_SAMPLES.length);
  assert.equal(evalRun.rows[0].score, 1);
  assert.ok(evalRun.rows.every((row) => row.expected && row.actual));

  assert.deepEqual(worker.aiFeedbackSummary([
    { action: 'accepted', rating: 5 },
    { action: 'accepted', rating: 3 },
    { action: 'dismissed', rating: 0 }
  ]), { total: 3, counts: { accepted: 2, dismissed: 1 }, avgRating: 4 });

  const health = worker.buildAiProviderHealth([
    { id: 'j1', type: 'summary', status: 'succeeded', createdAt: 10, finishedAt: 30 },
    { id: 'j2', type: 'qa', status: 'failed', createdAt: 40, finishedAt: 70, error: { message: 'provider unavailable' } }
  ], [{ ok: true, latencyMs: 45 }]);
  assert.equal(health.availability, 0.5);
  assert.equal(health.avgLatencyMs, 25);
  assert.equal(health.recentFailures[0].message, 'provider unavailable');
  assert.equal(health.checks.length, 1);

  const job = worker.makeAiJobRecord({
    userId: 'alice', bookmarkId: 'b1', type: 'summary', status: 'failed',
    provider: { providerType: 'openai_compatible', model: 'model' },
    request: { attemptCount: 2, maxAttempts: 4 },
    error: new Error('failed'), startedAt: 100, finishedAt: 150
  });
  assert.match(job.id, /^ai_/);
  assert.equal(job.userId, 'alice');
  assert.equal(job.attemptCount, 2);
  assert.deepEqual(job.error, { message: 'failed' });
});

test('public AI guide summarizes only supplied bookmarks with stable top tags', async () => {
  const worker = await import('../src/worker/aiGovernance.mjs');
  const guide = worker.buildPublicAiGuide({ description: 'Curated collection' }, {}, [
    { id: 'b1', title: 'One', url: 'https://example.test/1', tags: ['AI', 'reading'] },
    { id: 'b2', title: 'Two', url: 'https://example.test/2', tags: ['AI'] }
  ]);
  assert.equal(guide.summary, 'Curated collection');
  assert.deepEqual(guide.tags.slice(0, 2), [{ tag: 'AI', count: 2 }, { tag: 'reading', count: 1 }]);
  assert.equal(guide.recommendations[0].id, 'b1');
});
