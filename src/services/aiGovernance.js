const crypto = require('node:crypto');
const { tokenize } = require('./textTokens');

function planFeatures(plan = 'free') {
  const p = String(plan || 'free').toLowerCase();
  const free = {
    fullTextSearch: false,
    dedupeScan: false,
    brokenLinkScan: false,
    backups: false,
    aiSuggestions: true,
    advancedSearch: true
  };
  if (p !== 'pro') return free;
  return {
    ...free,
    fullTextSearch: true,
    dedupeScan: true,
    brokenLinkScan: true,
    backups: true,
    aiSuggestions: true
  };
}

function entitlementForUser(db, userId) {
  db.userEntitlements = db.userEntitlements || {};
  const rec = db.userEntitlements[userId] || {};
  const plan = String(rec.plan || 'free').toLowerCase() === 'pro' ? 'pro' : 'free';
  return {
    userId,
    plan,
    status: String(rec.status || 'active'),
    updatedAt: Number(rec.updatedAt || 0) || 0,
    features: { ...planFeatures(plan), ...(rec.features || {}) }
  };
}

function setEntitlement(db, userId, patch = {}) {
  db.userEntitlements = db.userEntitlements || {};
  const now = Date.now();
  const current = entitlementForUser(db, userId);
  const plan = typeof patch.plan === 'undefined' ? current.plan : String(patch.plan || 'free').toLowerCase();
  const next = {
    userId,
    plan: plan === 'pro' ? 'pro' : 'free',
    status: typeof patch.status === 'undefined' ? current.status : String(patch.status || 'active'),
    updatedAt: now,
    features: {
      ...planFeatures(plan),
      ...(patch.features && typeof patch.features === 'object' ? patch.features : {})
    }
  };
  db.userEntitlements[userId] = next;
  return next;
}

function requireFeature(db, userId, feature, badRequest) {
  const ent = entitlementForUser(db, userId);
  if (!ent.features?.[feature]) {
    const err = badRequest(`feature requires Pro plan: ${feature}`);
    err.code = 'FEATURE_GATED';
    err.details = { feature, plan: ent.plan };
    throw err;
  }
  return ent;
}

const DEFAULT_AI_PROMPT_TEMPLATES = Object.freeze([
  { key: 'bookmark.autotag', name: '书签自动打标签', version: 1, body: '根据标题、URL、摘要、正文和已有标签生成精简标签。' },
  { key: 'bookmark.summary', name: '书签摘要', version: 1, body: '用简洁中文总结书签内容，保留关键结论和适用场景。' },
  { key: 'bookmarks.qa', name: '书签问答', version: 1, body: '基于检索到的书签材料回答问题，并提供出处。' },
  { key: 'bookmark.classify', name: '集合分类', version: 1, body: '根据书签内容推荐最合适的集合，并解释原因。' },
  { key: 'team.tags', name: '团队标签规范', version: 1, body: '根据团队共享集合内标签，建议统一命名、合并和本地化策略。' }
]);

const DEFAULT_AI_EVAL_SAMPLES = Object.freeze([
  {
    id: 'eval_autotag_ai_article',
    task: 'bookmark.autotag',
    input: { title: 'OpenAI API structured outputs guide', url: 'https://platform.openai.com/docs/guides/structured-outputs', note: 'schema constrained JSON' },
    expected: { tags: ['AI', 'OpenAI', 'API'], keywords: ['structured', 'json'] }
  },
  {
    id: 'eval_summary_product',
    task: 'bookmark.summary',
    input: { title: 'Rainbow product roadmap', url: 'https://example.com/roadmap', note: 'product planning and release priorities' },
    expected: { tags: ['产品', '路线图'], keywords: ['规划', '优先级', '发布'] }
  },
  {
    id: 'eval_classify_design',
    task: 'bookmark.classify',
    input: { title: 'Design system accessibility checklist', url: 'https://example.com/a11y', note: 'contrast, focus, keyboard navigation' },
    expected: { tags: ['设计系统', '可访问性'], keywords: ['contrast', 'keyboard', 'focus'] }
  }
]);

const DEFAULT_AI_PRIVACY_POLICY = Object.freeze({
  anonymize: true,
  stripFields: ['apiKey', 'apiToken', 'password', 'rawHtml', 'cookies'],
  maxPromptChars: 12_000,
  redactPatterns: ['email', 'phone', 'token']
});

const DEFAULT_AI_FEATURE_POLICY = Object.freeze({
  enabled: true,
  role: 'owner',
  capabilities: {
    autoTag: true,
    summarize: true,
    qa: true,
    search: true,
    rules: true,
    bulkTasks: true
  }
});

function ensureAiPromptTemplates(db) {
  db.aiPromptTemplates = Array.isArray(db.aiPromptTemplates) ? db.aiPromptTemplates : [];
  return db.aiPromptTemplates;
}

function aiPromptTemplatesForUser(db, userId) {
  const overrides = ensureAiPromptTemplates(db).filter((t) => String(t.userId || '') === String(userId || ''));
  const byKey = new Map(DEFAULT_AI_PROMPT_TEMPLATES.map((t) => [t.key, { ...t, userId: String(userId || ''), source: 'default', updatedAt: 0 }]));
  for (const item of overrides) {
    byKey.set(String(item.key || ''), { ...item, source: 'custom' });
  }
  return [...byKey.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function ensureAiEvalRuns(db) {
  db.aiEvalRuns = Array.isArray(db.aiEvalRuns) ? db.aiEvalRuns : [];
  return db.aiEvalRuns;
}

function aiEvalSamplesForUser(db, userId) {
  const custom = Array.isArray(db.aiEvalSamples) ? db.aiEvalSamples.filter((s) => String(s.userId || '') === String(userId || '')) : [];
  return [...DEFAULT_AI_EVAL_SAMPLES.map((s) => ({ ...s, userId: String(userId || ''), source: 'default' })), ...custom];
}

function tokenOverlapScore(expected = {}, actual = {}) {
  const expectedTokens = tokenize([
    ...(Array.isArray(expected.tags) ? expected.tags : []),
    ...(Array.isArray(expected.keywords) ? expected.keywords : [])
  ].join(' '));
  const actualTokens = tokenize([
    ...(Array.isArray(actual.tags) ? actual.tags : []),
    actual.summary,
    actual.title,
    actual.reason,
    JSON.stringify(actual || {})
  ].join(' '));
  if (!expectedTokens.length) return 1;
  const actualSet = new Set(actualTokens);
  const matched = expectedTokens.filter((token) => actualSet.has(token)).length;
  return Number((matched / expectedTokens.length).toFixed(4));
}

function runAiEvalBaseline(db, userId, candidates = []) {
  const samples = aiEvalSamplesForUser(db, userId).slice(0, 50);
  const candidateBySampleId = new Map((Array.isArray(candidates) ? candidates : []).map((item) => [String(item.sampleId || item.id || ''), item]));
  const rows = samples.map((sample) => {
    const candidate = candidateBySampleId.get(String(sample.id || '')) || {};
    const score = tokenOverlapScore(sample.expected || {}, candidate.output || candidate.result || {});
    return {
      sampleId: sample.id,
      task: sample.task,
      score,
      passed: score >= 0.5,
      expected: sample.expected,
      actual: candidate.output || candidate.result || null
    };
  });
  const avgScore = rows.length ? rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length : 0;
  return {
    id: `ai_eval_${crypto.randomUUID()}`,
    userId: String(userId || ''),
    createdAt: Date.now(),
    sampleCount: rows.length,
    passed: rows.filter((row) => row.passed).length,
    failed: rows.filter((row) => !row.passed).length,
    avgScore: Number(avgScore.toFixed(4)),
    rows
  };
}

function ensureAiFeedbackItems(db) {
  db.aiFeedbackItems = Array.isArray(db.aiFeedbackItems) ? db.aiFeedbackItems : [];
  return db.aiFeedbackItems;
}

function aiFeedbackSummary(items = []) {
  const counts = items.reduce((acc, item) => {
    const action = String(item.action || 'unknown');
    acc[action] = (acc[action] || 0) + 1;
    return acc;
  }, {});
  const ratings = items.map((item) => Number(item.rating || 0)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    total: items.length,
    counts,
    avgRating: ratings.length ? Number((ratings.reduce((sum, n) => sum + n, 0) / ratings.length).toFixed(2)) : 0
  };
}

function aiPrivacyPolicyForUser(db, userId) {
  db.aiPrivacyPolicies = db.aiPrivacyPolicies && typeof db.aiPrivacyPolicies === 'object' ? db.aiPrivacyPolicies : {};
  return {
    ...DEFAULT_AI_PRIVACY_POLICY,
    ...(db.aiPrivacyPolicies[String(userId || '')] || {})
  };
}

function setAiPrivacyPolicy(db, userId, patch = {}) {
  db.aiPrivacyPolicies = db.aiPrivacyPolicies && typeof db.aiPrivacyPolicies === 'object' ? db.aiPrivacyPolicies : {};
  const current = aiPrivacyPolicyForUser(db, userId);
  const next = {
    ...current,
    anonymize: typeof patch.anonymize === 'boolean' ? patch.anonymize : current.anonymize,
    stripFields: Array.isArray(patch.stripFields) ? patch.stripFields.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 30) : current.stripFields,
    maxPromptChars: Math.max(1000, Math.min(50_000, Number(patch.maxPromptChars || current.maxPromptChars) || current.maxPromptChars)),
    redactPatterns: Array.isArray(patch.redactPatterns) ? patch.redactPatterns.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 20) : current.redactPatterns,
    updatedAt: Date.now()
  };
  db.aiPrivacyPolicies[String(userId || '')] = next;
  return next;
}

function aiFeaturePolicyForUser(db, userId) {
  db.aiFeaturePolicies = db.aiFeaturePolicies && typeof db.aiFeaturePolicies === 'object' ? db.aiFeaturePolicies : {};
  const ent = entitlementForUser(db, userId);
  const stored = db.aiFeaturePolicies[String(userId || '')] || {};
  return {
    ...DEFAULT_AI_FEATURE_POLICY,
    ...stored,
    plan: ent.plan,
    enabled: Boolean(ent.features.aiSuggestions) && (typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_AI_FEATURE_POLICY.enabled),
    capabilities: {
      ...DEFAULT_AI_FEATURE_POLICY.capabilities,
      ...(stored.capabilities && typeof stored.capabilities === 'object' ? stored.capabilities : {})
    }
  };
}

function setAiFeaturePolicy(db, userId, patch = {}) {
  db.aiFeaturePolicies = db.aiFeaturePolicies && typeof db.aiFeaturePolicies === 'object' ? db.aiFeaturePolicies : {};
  const current = aiFeaturePolicyForUser(db, userId);
  const next = {
    ...current,
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    role: ['owner', 'editor', 'viewer'].includes(String(patch.role || '')) ? String(patch.role) : current.role,
    capabilities: {
      ...current.capabilities,
      ...(patch.capabilities && typeof patch.capabilities === 'object' ? Object.fromEntries(Object.entries(patch.capabilities).map(([k, v]) => [k, Boolean(v)])) : {})
    },
    updatedAt: Date.now()
  };
  db.aiFeaturePolicies[String(userId || '')] = next;
  return next;
}

function aiCapabilityForPath(path = '') {
  const p = String(path || '');
  if (/\/(?:batch|backfill)\//.test(p)) return 'bulkTasks';
  if (/\/rules\//.test(p)) return 'rules';
  if (/\/qa(?:[/?]|$)/.test(p)) return 'qa';
  if (/\/(?:search-to-filters|dedupe|related|reading-priority)/.test(p)) return 'search';
  if (/\/(?:summary|reader-summary|folder-summary|digest|highlight)/.test(p)) return 'summarize';
  if (/\/(?:suggest|autotag|title-clean|folder-recommend|tags\/)/.test(p)) return 'autoTag';
  return '';
}

function assertAiFeaturePolicy(db, userId, path, badRequest) {
  const policy = aiFeaturePolicyForUser(db, userId);
  const capability = aiCapabilityForPath(path);
  if (!capability) return policy;
  if (!policy.enabled || !policy.capabilities?.[capability]) {
    const err = badRequest(`AI capability disabled: ${capability}`);
    err.code = 'AI_FEATURE_DISABLED';
    err.details = { capability, policy };
    throw err;
  }
  return policy;
}

function buildAiProviderHealth(db, userId) {
  const jobs = (db.aiSuggestionJobs || []).filter((j) => String(j.userId || '') === String(userId || '')).slice(0, 100);
  const checks = (db.aiProviderHealthChecks || []).filter((j) => String(j.userId || '') === String(userId || '')).slice(0, 20);
  const failures = jobs.filter((j) => String(j.status || '') === 'failed');
  const durations = jobs
    .map((j) => Number(j.finishedAt || 0) - Number(j.createdAt || j.startedAt || 0))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const lastCheck = checks[0] || null;
  const availability = jobs.length ? Number(((jobs.length - failures.length) / jobs.length).toFixed(4)) : (lastCheck?.ok ? 1 : 0);
  return {
    availability,
    avgLatencyMs: durations.length ? Math.round(durations.reduce((sum, n) => sum + n, 0) / durations.length) : Number(lastCheck?.latencyMs || 0) || 0,
    recentFailures: failures.slice(0, 5).map((j) => ({ id: j.id, type: j.type, message: j.error?.message || '', createdAt: j.createdAt })),
    lastCheck,
    checks,
    jobsSampled: jobs.length
  };
}

module.exports = {
  planFeatures,
  entitlementForUser,
  setEntitlement,
  requireFeature,
  DEFAULT_AI_PROMPT_TEMPLATES,
  DEFAULT_AI_EVAL_SAMPLES,
  DEFAULT_AI_PRIVACY_POLICY,
  DEFAULT_AI_FEATURE_POLICY,
  ensureAiPromptTemplates,
  aiPromptTemplatesForUser,
  ensureAiEvalRuns,
  aiEvalSamplesForUser,
  runAiEvalBaseline,
  ensureAiFeedbackItems,
  aiFeedbackSummary,
  aiPrivacyPolicyForUser,
  setAiPrivacyPolicy,
  aiFeaturePolicyForUser,
  setAiFeaturePolicy,
  aiCapabilityForPath,
  assertAiFeaturePolicy,
  buildAiProviderHealth
};
