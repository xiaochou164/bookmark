import crypto from 'node:crypto';
import { wordsFromText, inferSuggestedTags } from './bookmarkIntelligence.mjs';
import { normalizeAiProviderConfigInput } from '../services/aiProviderService.mjs';

export function aiProviderLooksConfigured(config = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) return false;
  if (normalized.providerType === 'cloudflare_ai') {
    return Boolean(
      String(normalized.cloudflareAI?.accountId || '').trim() &&
      String(normalized.cloudflareAI?.apiToken || '').trim() &&
      String(normalized.cloudflareAI?.model || '').trim()
    );
  }
  return Boolean(
    String(normalized.openaiCompatible?.baseUrl || '').trim() &&
    String(normalized.openaiCompatible?.apiKey || '').trim() &&
    String(normalized.openaiCompatible?.model || '').trim()
  );
}

export function makeAiJobRecord({
  userId,
  bookmarkId = '',
  type = 'bookmark_auto_tag',
  status = 'succeeded',
  provider = {},
  request = {},
  result = null,
  error = null,
  startedAt = Date.now(),
  finishedAt = Date.now()
} = {}) {
  return {
    id: `ai_${crypto.randomUUID()}`,
    userId: String(userId || ''),
    bookmarkId: String(bookmarkId || ''),
    type: String(type || 'bookmark_auto_tag'),
    status: String(status || 'succeeded'),
    createdAt: Number(startedAt || Date.now()),
    finishedAt: Number(finishedAt || Date.now()),
    providerType: String(provider.providerType || ''),
    model: String(provider.model || ''),
    attemptCount: Number(request?.attemptCount || 0) || 0,
    maxAttempts: Number(request?.maxAttempts || 3) || 3,
    lastAttemptAt: Number(request?.lastAttemptAt || 0) || 0,
    request: request && typeof request === 'object' ? request : {},
    result,
    error: error ? { message: String(error.message || error) } : null
  };
}

export const DEFAULT_AI_EVAL_SAMPLES = Object.freeze([
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

export const DEFAULT_AI_PRIVACY_POLICY = Object.freeze({
  anonymize: true,
  stripFields: ['apiKey', 'apiToken', 'password', 'rawHtml', 'cookies'],
  maxPromptChars: 12_000,
  redactPatterns: ['email', 'phone', 'token']
});

export const DEFAULT_AI_FEATURE_POLICY = Object.freeze({
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

export function aiEvalScore(expected = {}, actual = {}) {
  const expectedTokens = wordsFromText([
    ...(Array.isArray(expected.tags) ? expected.tags : []),
    ...(Array.isArray(expected.keywords) ? expected.keywords : [])
  ].join(' '));
  const actualTokens = new Set(wordsFromText(JSON.stringify(actual || {})));
  if (!expectedTokens.length) return 1;
  const matched = expectedTokens.filter((token) => actualTokens.has(token)).length;
  return Number((matched / expectedTokens.length).toFixed(4));
}

export function buildAiEvalRun(userId, candidates = []) {
  const candidateBySampleId = new Map((Array.isArray(candidates) ? candidates : []).map((item) => [String(item.sampleId || item.id || ''), item]));
  const rows = DEFAULT_AI_EVAL_SAMPLES.map((sample) => {
    const candidate = candidateBySampleId.get(sample.id) || {};
    const actual = candidate.output || candidate.result || inferSuggestedTags(sample.input || {});
    const score = aiEvalScore(sample.expected, actual);
    return { sampleId: sample.id, task: sample.task, score, passed: score >= 0.5, expected: sample.expected, actual };
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

export function normalizeAiFeaturePolicy(raw = {}) {
  return {
    ...DEFAULT_AI_FEATURE_POLICY,
    ...(raw && typeof raw === 'object' ? raw : {}),
    capabilities: {
      ...DEFAULT_AI_FEATURE_POLICY.capabilities,
      ...(raw?.capabilities && typeof raw.capabilities === 'object' ? raw.capabilities : {})
    }
  };
}

export function aiFeedbackSummary(items = []) {
  const counts = {};
  for (const item of items) {
    const action = String(item.action || 'unknown');
    counts[action] = (counts[action] || 0) + 1;
  }
  const ratings = items.map((item) => Number(item.rating || 0)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    total: items.length,
    counts,
    avgRating: ratings.length ? Number((ratings.reduce((sum, n) => sum + n, 0) / ratings.length).toFixed(2)) : 0
  };
}

export function buildAiProviderHealth(jobs = [], checks = []) {
  const failures = jobs.filter((job) => String(job.status || '') === 'failed');
  const durations = jobs
    .map((job) => Number(job.finishedAt || 0) - Number(job.createdAt || job.startedAt || 0))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const lastCheck = checks[0] || null;
  return {
    availability: jobs.length ? Number(((jobs.length - failures.length) / jobs.length).toFixed(4)) : (lastCheck?.ok ? 1 : 0),
    avgLatencyMs: durations.length ? Math.round(durations.reduce((sum, n) => sum + n, 0) / durations.length) : Number(lastCheck?.latencyMs || 0) || 0,
    recentFailures: failures.slice(0, 5).map((job) => ({ id: job.id, type: job.type, message: job.error?.message || '', createdAt: job.createdAt })),
    lastCheck,
    checks: checks.slice(0, 20),
    jobsSampled: jobs.length
  };
}

export function aiCapabilityForPath(path = '') {
  const p = String(path || '');
  if (/\/(?:batch|backfill)\//.test(p)) return 'bulkTasks';
  if (/\/rules\//.test(p)) return 'rules';
  if (/\/qa(?:[/?]|$)/.test(p)) return 'qa';
  if (/\/(?:search-to-filters|dedupe|related|reading-priority)/.test(p)) return 'search';
  if (/\/(?:summary|reader-summary|folder-summary|digest|highlight)/.test(p)) return 'summarize';
  if (/\/(?:suggest|autotag|title-clean|folder-recommend|tags\/)/.test(p)) return 'autoTag';
  return '';
}

export function isAiGovernancePath(path = '') {
  return /\/api\/product\/ai\/(?:config|evals|feedback|privacy-policy|feature-policy|health)(?:[/?]|$)/.test(String(path || ''));
}

export function buildPublicAiGuide(link = {}, folder = {}, bookmarks = []) {
  const counts = new Map();
  for (const item of bookmarks) {
    for (const tag of Array.isArray(item.tags) ? item.tags : []) {
      const key = String(tag || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
  const sample = bookmarks.slice(0, 5).map((item) => item.title).filter(Boolean);
  return {
    summary: link.description || (sample.length ? `这个集合收录了 ${sample.join('、')} 等内容。` : '这个集合还在整理中。'),
    tags,
    faq: [
      { q: '这个集合适合先看什么？', a: sample[0] ? `可以先从「${sample[0]}」开始。` : '暂无推荐入口。' },
      { q: '主要主题是什么？', a: tags.length ? tags.slice(0, 5).map((x) => `#${x.tag}`).join('、') : '暂无明显主题标签。' }
    ],
    recommendations: bookmarks.slice(0, 3).map((item) => ({ id: item.id, title: item.title, url: item.url }))
  };
}
