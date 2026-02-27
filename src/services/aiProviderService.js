const crypto = require('node:crypto');

const DEFAULT_AI_CONFIG = {
  enabled: false,
  providerType: 'openai_compatible',
  openaiCompatible: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    model: '',
    embeddingModel: ''
  },
  cloudflareAI: {
    accountId: '',
    apiToken: '',
    model: '@cf/meta/llama-3.1-8b-instruct',
    embeddingModel: ''
  },
  tagging: {
    maxTags: 6,
    applyMode: 'merge',
    preferChinese: true,
    includeDomain: true
  },
  autoClassifyOnCreate: {
    enabled: false,
    requireConfirm: true,
    autoTag: true,
    recommendFolder: true,
    autoMoveRecommendedFolder: false
  },
  embeddings: {
    preferProvider: true,
    fallbackLocal: true,
    dim: 192
  },
  updatedAt: 0
};

function clone(value) {
  return value ? structuredClone(value) : value;
}

function normalizeString(input = '') {
  return String(input || '').trim();
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeBaseUrl(baseUrl) {
  const raw = normalizeString(baseUrl);
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.toString().replace(/\/+$/, '');
  } catch (_err) {
    return '';
  }
}

function mergeConfig(current = {}, patch = {}) {
  const prev = {
    ...clone(DEFAULT_AI_CONFIG),
    ...(current && typeof current === 'object' ? clone(current) : {})
  };
  const next = {
    ...prev,
    ...(patch && typeof patch === 'object' ? patch : {})
  };
  next.openaiCompatible = {
    ...DEFAULT_AI_CONFIG.openaiCompatible,
    ...(prev.openaiCompatible || {}),
    ...((patch && patch.openaiCompatible) || {})
  };
  next.cloudflareAI = {
    ...DEFAULT_AI_CONFIG.cloudflareAI,
    ...(prev.cloudflareAI || {}),
    ...((patch && patch.cloudflareAI) || {})
  };
  next.tagging = {
    ...DEFAULT_AI_CONFIG.tagging,
    ...(prev.tagging || {}),
    ...((patch && patch.tagging) || {})
  };
  next.autoClassifyOnCreate = {
    ...DEFAULT_AI_CONFIG.autoClassifyOnCreate,
    ...(prev.autoClassifyOnCreate || {}),
    ...((patch && patch.autoClassifyOnCreate) || {})
  };
  next.embeddings = {
    ...DEFAULT_AI_CONFIG.embeddings,
    ...(prev.embeddings || {}),
    ...((patch && patch.embeddings) || {})
  };
  return next;
}

function normalizeAiProviderConfigInput(input = {}, current = {}) {
  const merged = mergeConfig(current, input);
  const next = clone(DEFAULT_AI_CONFIG);

  next.enabled = Boolean(merged.enabled);
  next.providerType = ['openai_compatible', 'cloudflare_ai'].includes(String(merged.providerType || ''))
    ? String(merged.providerType)
    : 'openai_compatible';

  next.openaiCompatible.baseUrl = normalizeBaseUrl(merged.openaiCompatible?.baseUrl) || DEFAULT_AI_CONFIG.openaiCompatible.baseUrl;
  next.openaiCompatible.model = normalizeString(merged.openaiCompatible?.model);
  next.openaiCompatible.embeddingModel = normalizeString(merged.openaiCompatible?.embeddingModel);
  const openaiApiKeyPatch = normalizeString(input?.openaiCompatible?.apiKey);
  const openaiApiKeyCurrent = normalizeString(current?.openaiCompatible?.apiKey);
  next.openaiCompatible.apiKey = openaiApiKeyPatch || openaiApiKeyCurrent || '';

  next.cloudflareAI.accountId = normalizeString(merged.cloudflareAI?.accountId);
  next.cloudflareAI.model = normalizeString(merged.cloudflareAI?.model) || DEFAULT_AI_CONFIG.cloudflareAI.model;
  next.cloudflareAI.embeddingModel = normalizeString(merged.cloudflareAI?.embeddingModel);
  const cfTokenPatch = normalizeString(input?.cloudflareAI?.apiToken);
  const cfTokenCurrent = normalizeString(current?.cloudflareAI?.apiToken);
  next.cloudflareAI.apiToken = cfTokenPatch || cfTokenCurrent || '';

  next.tagging.maxTags = clampInt(merged.tagging?.maxTags, 1, 12, DEFAULT_AI_CONFIG.tagging.maxTags);
  next.tagging.applyMode = ['merge', 'replace'].includes(String(merged.tagging?.applyMode || ''))
    ? String(merged.tagging.applyMode)
    : 'merge';
  next.tagging.preferChinese = typeof merged.tagging?.preferChinese === 'boolean'
    ? merged.tagging.preferChinese
    : DEFAULT_AI_CONFIG.tagging.preferChinese;
  next.tagging.includeDomain = typeof merged.tagging?.includeDomain === 'boolean'
    ? merged.tagging.includeDomain
    : DEFAULT_AI_CONFIG.tagging.includeDomain;
  next.autoClassifyOnCreate.enabled = typeof merged.autoClassifyOnCreate?.enabled === 'boolean'
    ? merged.autoClassifyOnCreate.enabled
    : DEFAULT_AI_CONFIG.autoClassifyOnCreate.enabled;
  next.autoClassifyOnCreate.requireConfirm = typeof merged.autoClassifyOnCreate?.requireConfirm === 'boolean'
    ? merged.autoClassifyOnCreate.requireConfirm
    : DEFAULT_AI_CONFIG.autoClassifyOnCreate.requireConfirm;
  next.autoClassifyOnCreate.autoTag = typeof merged.autoClassifyOnCreate?.autoTag === 'boolean'
    ? merged.autoClassifyOnCreate.autoTag
    : DEFAULT_AI_CONFIG.autoClassifyOnCreate.autoTag;
  next.autoClassifyOnCreate.recommendFolder = typeof merged.autoClassifyOnCreate?.recommendFolder === 'boolean'
    ? merged.autoClassifyOnCreate.recommendFolder
    : DEFAULT_AI_CONFIG.autoClassifyOnCreate.recommendFolder;
  next.autoClassifyOnCreate.autoMoveRecommendedFolder = typeof merged.autoClassifyOnCreate?.autoMoveRecommendedFolder === 'boolean'
    ? merged.autoClassifyOnCreate.autoMoveRecommendedFolder
    : DEFAULT_AI_CONFIG.autoClassifyOnCreate.autoMoveRecommendedFolder;
  next.embeddings.preferProvider = typeof merged.embeddings?.preferProvider === 'boolean'
    ? merged.embeddings.preferProvider
    : DEFAULT_AI_CONFIG.embeddings.preferProvider;
  next.embeddings.fallbackLocal = typeof merged.embeddings?.fallbackLocal === 'boolean'
    ? merged.embeddings.fallbackLocal
    : DEFAULT_AI_CONFIG.embeddings.fallbackLocal;
  next.embeddings.dim = clampInt(merged.embeddings?.dim, 32, 1024, DEFAULT_AI_CONFIG.embeddings.dim);
  next.updatedAt = Number(merged.updatedAt || 0) || 0;

  return next;
}

function publicAiProviderConfig(config = {}) {
  const c = normalizeAiProviderConfigInput({}, config);
  return {
    enabled: c.enabled,
    providerType: c.providerType,
    openaiCompatible: {
      baseUrl: c.openaiCompatible.baseUrl,
      model: c.openaiCompatible.model,
      embeddingModel: c.openaiCompatible.embeddingModel,
      hasApiKey: Boolean(c.openaiCompatible.apiKey),
      apiKeyMasked: maskSecret(c.openaiCompatible.apiKey)
    },
    cloudflareAI: {
      accountId: c.cloudflareAI.accountId,
      model: c.cloudflareAI.model,
      embeddingModel: c.cloudflareAI.embeddingModel,
      hasApiToken: Boolean(c.cloudflareAI.apiToken),
      apiTokenMasked: maskSecret(c.cloudflareAI.apiToken)
    },
    tagging: c.tagging,
    autoClassifyOnCreate: c.autoClassifyOnCreate,
    embeddings: c.embeddings,
    updatedAt: c.updatedAt
  };
}

function maskSecret(secret = '') {
  const s = String(secret || '');
  if (!s) return '';
  if (s.length <= 8) return `${s.slice(0, 2)}***`;
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
}

function ensureAiProviderConfigsStore(db) {
  db.aiProviderConfigs = db.aiProviderConfigs && typeof db.aiProviderConfigs === 'object' ? db.aiProviderConfigs : {};
  return db.aiProviderConfigs;
}

function getAiProviderConfig(db, userId) {
  const store = ensureAiProviderConfigsStore(db);
  const raw = store[String(userId) || ''] || {};
  return normalizeAiProviderConfigInput({}, raw);
}

function setAiProviderConfig(db, userId, patch = {}) {
  const key = String(userId || '');
  const store = ensureAiProviderConfigsStore(db);
  const current = getAiProviderConfig(db, key);
  const next = normalizeAiProviderConfigInput(patch, current);
  next.updatedAt = Date.now();
  store[key] = next;
  return next;
}

function buildAutoTagPrompt(bookmark, config) {
  const title = normalizeString(bookmark?.title) || '(untitled)';
  const url = normalizeString(bookmark?.url);
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch (_err) {
    host = '';
  }
  const note = normalizeString(bookmark?.note);
  const metadataDescription = normalizeString(bookmark?.metadata?.description);
  const excerpt = normalizeString(bookmark?.article?.excerpt || bookmark?.article?.summary);
  const existingTags = Array.isArray(bookmark?.tags) ? bookmark.tags.map((t) => normalizeString(t)).filter(Boolean) : [];
  const maxTags = clampInt(config?.tagging?.maxTags, 1, 12, 6);
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const includeDomain = Boolean(config?.tagging?.includeDomain);

  const system = [
    '你是一个书签整理助手，任务是为单条书签生成高质量标签。',
    `最多输出 ${maxTags} 个标签，标签应简短、可复用、信息密度高。`,
    preferChinese
      ? '优先使用中文标签；专有名词、产品名可以保留英文。'
      : '标签可使用中英文，以信息准确为先。',
    '避免泛化标签，例如：网站、链接、收藏、网页。',
    '如果内容信息不足，可以使用域名或产品名补充，但不要臆造。',
    '请只输出 JSON，不要输出解释或 Markdown。',
    'JSON 结构必须为 {"tags":["..."],"summary":"..."}'
  ].join('\n');

  const user = [
    `标题: ${title}`,
    `URL: ${url || '-'}`,
    includeDomain ? `域名: ${host || '-'}` : '',
    `备注: ${note || '-'}`,
    `页面描述: ${metadataDescription || '-'}`,
    `摘要: ${excerpt || '-'}`,
    `现有标签: ${existingTags.length ? existingTags.join(', ') : '-'}`,
    `请生成 ${maxTags} 个以内的新标签，并给出一句不超过80字的中文摘要。`
  ].filter(Boolean).join('\n');

  return { system, user, host };
}

function bookmarkContextForPrompt(bookmark = {}) {
  const title = normalizeString(bookmark?.title) || '(untitled)';
  const url = normalizeString(bookmark?.url);
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch (_err) {
    host = '';
  }
  return {
    title,
    url,
    host,
    note: normalizeString(bookmark?.note),
    metadataDescription: normalizeString(bookmark?.metadata?.description),
    excerpt: normalizeString(bookmark?.article?.excerpt || bookmark?.article?.summary),
    existingTags: Array.isArray(bookmark?.tags) ? bookmark.tags.map((t) => normalizeString(t)).filter(Boolean) : []
  };
}

function buildTitleCleanupPrompt(bookmark, config) {
  const ctx = bookmarkContextForPrompt(bookmark);
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const system = [
    '你是书签标题清洗助手，任务是把网页标题整理成适合收藏管理的简洁标题。',
    preferChinese ? '优先保留中文标题；专有名词和产品名可保留英文。' : '按原语言输出，避免不必要翻译。',
    '去掉站点噪声后缀（例如品牌名重复、分隔符堆叠、营销文案），保留关键信息。',
    '不要编造标题，不要改变核心语义。',
    '标题尽量控制在 80 个字符以内（必要时可稍长）。',
    '请只输出 JSON，不要输出解释或 Markdown。',
    'JSON 结构必须为 {"title":"...","reason":"..."}'
  ].join('\n');
  const user = [
    `原标题: ${ctx.title}`,
    `URL: ${ctx.url || '-'}`,
    `域名: ${ctx.host || '-'}`,
    `页面描述: ${ctx.metadataDescription || '-'}`,
    `摘要: ${ctx.excerpt || '-'}`,
    `备注: ${ctx.note || '-'}`,
    `现有标签: ${ctx.existingTags.length ? ctx.existingTags.join(', ') : '-'}`,
    '请返回适合书签管理的清洗标题，以及一句简短原因（可选）。'
  ].join('\n');
  return { system, user, host: ctx.host };
}

function buildSummaryPrompt(bookmark, config) {
  const ctx = bookmarkContextForPrompt(bookmark);
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const system = [
    '你是书签摘要助手，任务是为单条书签生成简洁摘要，适合作为备注保存。',
    preferChinese ? '优先使用中文输出摘要。' : '可使用原语言，确保信息准确。',
    '摘要应突出主题、用途或关键信息，避免空话。',
    '长度建议 30-120 字，最多不超过 200 字。',
    '如果信息不足，可基于标题和域名生成保守摘要，不要臆造细节。',
    '请只输出 JSON，不要输出解释或 Markdown。',
    'JSON 结构必须为 {"summary":"..."}'
  ].join('\n');
  const user = [
    `标题: ${ctx.title}`,
    `URL: ${ctx.url || '-'}`,
    `域名: ${ctx.host || '-'}`,
    `页面描述: ${ctx.metadataDescription || '-'}`,
    `正文摘要: ${ctx.excerpt || '-'}`,
    `现有备注: ${ctx.note || '-'}`,
    `标签: ${ctx.existingTags.length ? ctx.existingTags.join(', ') : '-'}`,
    '请生成一条适合作为书签备注的摘要。'
  ].join('\n');
  return { system, user, host: ctx.host };
}

function buildReaderSummaryPrompt(bookmark, config = {}) {
  const ctx = bookmarkContextForPrompt(bookmark);
  const article = bookmark?.article && typeof bookmark.article === 'object' ? bookmark.article : {};
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const articleTitle = normalizeString(article.title || ctx.title || '');
  const articleExcerpt = normalizeString(article.excerpt || ctx.excerpt || '');
  const articleText = normalizeString(article.textContent || '').slice(0, 8000);
  const system = [
    '你是阅读模式摘要助手，任务是基于正文内容生成适合书签管理的阅读摘要。',
    preferChinese ? '优先使用中文输出。' : '回答语言与内容/标题保持一致，优先可读性。',
    '请输出 3 部分：shortSummary（短摘要）、keyPoints（关键要点数组）、whySave（适合收藏理由）。',
    'shortSummary 建议 40-140 字；keyPoints 建议 3-5 条，每条 12-60 字；whySave 建议 20-80 字。',
    '如果正文信息不足，可结合标题、描述和摘要做保守总结，但不要编造细节。',
    '请只输出 JSON，不要输出解释或 Markdown。',
    'JSON 结构必须为 {"shortSummary":"...","keyPoints":["..."],"whySave":"..."}'
  ].join('\n');
  const user = [
    `标题: ${articleTitle || ctx.title}`,
    `URL: ${ctx.url || '-'}`,
    `域名: ${ctx.host || '-'}`,
    `页面描述: ${ctx.metadataDescription || '-'}`,
    `正文摘要: ${articleExcerpt || '-'}`,
    `标签: ${ctx.existingTags.length ? ctx.existingTags.join(', ') : '-'}`,
    `正文内容(节选): ${articleText || '-'}`,
    '请生成阅读模式摘要。'
  ].join('\n');
  return { system, user, host: ctx.host };
}

function buildHighlightCandidatesPrompt(bookmark, config = {}) {
  const ctx = bookmarkContextForPrompt(bookmark);
  const article = bookmark?.article && typeof bookmark.article === 'object' ? bookmark.article : {};
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const articleText = normalizeString(article.textContent || '').slice(0, 9000);
  const existingHighlights = Array.isArray(bookmark?.highlights)
    ? bookmark.highlights.map((h) => normalizeString(h?.quote || h?.text || '')).filter(Boolean).slice(0, 20)
    : [];
  const system = [
    '你是阅读高亮候选助手，任务是从正文中挑选适合高亮保存的关键片段。',
    preferChinese ? '优先使用中文理由说明。' : '理由说明可使用原语言，但要简洁。',
    '候选片段应该有信息密度：结论、定义、原则、步骤、关键数据、注意事项等。',
    '不要返回过长整段；单条 quote 建议 20-220 字。',
    '避免与现有高亮重复。',
    '返回 3-6 条候选，并给出简短 reason 与 score（0~1）。',
    '请只输出 JSON，不要解释或 Markdown。',
    'JSON 结构必须为 {"items":[{"quote":"...","reason":"...","score":0.0}],"summary":"..."}'
  ].join('\n');
  const user = [
    `标题: ${normalizeString(article.title || ctx.title)}`,
    `URL: ${ctx.url || '-'}`,
    `域名: ${ctx.host || '-'}`,
    `正文摘要: ${normalizeString(article.excerpt || ctx.excerpt) || '-'}`,
    `现有高亮: ${existingHighlights.length ? JSON.stringify(existingHighlights) : '[]'}`,
    `正文内容(节选): ${articleText || '-'}`,
    '请推荐适合高亮的正文片段。'
  ].join('\n');
  return { system, user };
}

function buildHighlightDigestPrompt(bookmark, config = {}) {
  const ctx = bookmarkContextForPrompt(bookmark);
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const highlights = Array.isArray(bookmark?.highlights) ? bookmark.highlights : [];
  const rows = highlights
    .map((h, idx) => {
      const quote = normalizeString(h?.quote || h?.text || '').slice(0, 280);
      const note = normalizeString(h?.note || '').slice(0, 200);
      const annotations = Array.isArray(h?.annotations)
        ? h.annotations.map((a) => normalizeString(a?.text || '')).filter(Boolean).slice(0, 4)
        : [];
      if (!quote && !note && !annotations.length) return null;
      return {
        index: idx + 1,
        quote,
        note,
        annotations
      };
    })
    .filter(Boolean)
    .slice(0, 24);
  const system = [
    '你是高亮知识卡片助手，任务是根据书签的高亮片段与注释，总结该条书签的核心知识点。',
    preferChinese ? '优先使用中文输出。' : '输出语言与内容语言保持一致，优先可读性。',
    '请输出结构化结果：summary（总体总结）、themes（主题数组）、keyInsights（关键洞见数组）、actionItems（行动项数组，可为空）、openQuestions（开放问题数组，可为空）。',
    'summary 建议 40-180 字；themes 2-5 条；keyInsights 3-6 条；actionItems/openQuestions 各 0-4 条。',
    '必须以高亮和注释为依据，不要编造未出现的信息。',
    '请只输出 JSON，不要输出解释或 Markdown。',
    'JSON 结构必须为 {"summary":"...","themes":["..."],"keyInsights":["..."],"actionItems":["..."],"openQuestions":["..."]}'
  ].join('\n');
  const user = [
    `标题: ${ctx.title || '-'}`,
    `URL: ${ctx.url || '-'}`,
    `域名: ${ctx.host || '-'}`,
    `标签: ${ctx.existingTags.length ? ctx.existingTags.join(', ') : '-'}`,
    `高亮与注释: ${rows.length ? JSON.stringify(rows) : '[]'}`,
    '请基于这些高亮与注释生成“知识卡片总结”。'
  ].join('\n');
  return { system, user };
}

function buildFolderKnowledgeSummaryPrompt({ folder = {}, folderPath = '', bookmarks = [], stats = {}, config = {} } = {}) {
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const rows = (Array.isArray(bookmarks) ? bookmarks : [])
    .map((b) => ({
      id: String(b?.id || ''),
      title: normalizeString(b?.title || ''),
      url: normalizeString(b?.url || ''),
      host: (() => {
        try { return new URL(String(b?.url || '')).hostname.replace(/^www\./i, ''); } catch (_err) { return ''; }
      })(),
      tags: Array.isArray(b?.tags) ? b.tags.map((t) => normalizeString(t)).filter(Boolean).slice(0, 8) : [],
      note: normalizeString(b?.note || '').slice(0, 180),
      metadataDescription: normalizeString(b?.metadata?.description || '').slice(0, 180),
      readerSummary: normalizeString(b?.aiSuggestions?.readerSummary?.shortSummary || '').slice(0, 180),
      highlightCount: Array.isArray(b?.highlights) ? b.highlights.length : 0,
      updatedAt: Number(b?.updatedAt || b?.createdAt || 0) || 0
    }))
    .filter((b) => b.id && (b.title || b.url))
    .slice(0, 60);
  const system = [
    '你是收藏集知识摘要助手，任务是根据一个集合中的书签样本，生成适合书签管理界面的集合知识卡片。',
    preferChinese ? '优先使用中文输出。' : '输出语言与内容语言保持一致，优先可读性。',
    '请输出结构化 JSON，包含：summary（集合主题总结）、themes（主题数组）、commonTags（常见标签数组）、representativeSources（代表来源域名数组）、notableBookmarks（代表书签数组）。',
    'notableBookmarks 每项包含 bookmarkId、title、reason；bookmarkId 必须从输入样本中选择。',
    '只基于给定样本与统计信息总结，不要编造集合中不存在的主题。',
    '请只输出 JSON，不要输出解释或 Markdown。',
    'JSON 结构必须为 {"summary":"...","themes":["..."],"commonTags":["..."],"representativeSources":["..."],"notableBookmarks":[{"bookmarkId":"...","title":"...","reason":"..."}]}'
  ].join('\n');
  const user = [
    `集合名称: ${normalizeString(folder?.name || '') || '-'}`,
    `集合路径: ${normalizeString(folderPath || folder?.name || '') || '-'}`,
    `集合统计: ${JSON.stringify({
      bookmarkCount: Number(stats?.bookmarkCount || rows.length) || rows.length,
      descendantFolderCount: Number(stats?.descendantFolderCount || 0) || 0,
      topTags: Array.isArray(stats?.topTags) ? stats.topTags.slice(0, 12) : [],
      topHosts: Array.isArray(stats?.topHosts) ? stats.topHosts.slice(0, 12) : []
    })}`,
    `书签样本: ${JSON.stringify(rows)}`,
    '请生成集合知识摘要。'
  ].join('\n');
  return { system, user };
}

function buildBookmarksDigestPrompt({ windowLabel = '', range = {}, bookmarks = [], stats = {}, config = {} } = {}) {
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const rows = (Array.isArray(bookmarks) ? bookmarks : [])
    .map((b) => ({
      id: String(b?.id || ''),
      title: normalizeString(b?.title || ''),
      url: normalizeString(b?.url || ''),
      host: (() => {
        try { return new URL(String(b?.url || '')).hostname.replace(/^www\./i, ''); } catch (_err) { return ''; }
      })(),
      folderPath: normalizeString(b?.folderPath || ''),
      tags: Array.isArray(b?.tags) ? b.tags.map((t) => normalizeString(t)).filter(Boolean).slice(0, 8) : [],
      note: normalizeString(b?.note || '').slice(0, 160),
      readerSummary: normalizeString(b?.aiSuggestions?.readerSummary?.shortSummary || '').slice(0, 180),
      metadataDescription: normalizeString(b?.metadata?.description || '').slice(0, 180),
      createdAt: Number(b?.createdAt || 0) || 0
    }))
    .filter((x) => x.id && (x.title || x.url))
    .slice(0, 80);
  const system = [
    '你是书签 Digest 助手，任务是根据一个时间窗口内新增的书签生成日报/周报摘要。',
    preferChinese ? '优先使用中文输出。' : '输出语言与内容语言保持一致，优先清晰简洁。',
    '请输出结构化 JSON，包含：summary（整体总结）、highlights（重点条目数组）、themes（主题数组）、recommendedActions（建议行动数组，可为空）。',
    'highlights 每项包含 bookmarkId、title、reason；bookmarkId 必须来自输入样本。',
    'summary 应概括该时间窗口新增收藏的主要方向与变化；themes 2-6 条；recommendedActions 0-5 条。',
    '只基于输入书签与统计信息，不要编造不存在内容。',
    '请只输出 JSON，不要解释或 Markdown。',
    'JSON 结构必须为 {"summary":"...","themes":["..."],"highlights":[{"bookmarkId":"...","title":"...","reason":"..."}],"recommendedActions":["..."]}'
  ].join('\n');
  const user = [
    `时间窗口: ${windowLabel || '-'}`,
    `时间范围: ${JSON.stringify(range)}`,
    `窗口统计: ${JSON.stringify({
      bookmarkCount: Number(stats?.bookmarkCount || rows.length) || rows.length,
      topTags: Array.isArray(stats?.topTags) ? stats.topTags.slice(0, 12) : [],
      topHosts: Array.isArray(stats?.topHosts) ? stats.topHosts.slice(0, 12) : [],
      topFolders: Array.isArray(stats?.topFolders) ? stats.topFolders.slice(0, 12) : []
    })}`,
    `新增书签样本: ${JSON.stringify(rows)}`,
    '请生成该时间窗口的书签 Digest。'
  ].join('\n');
  return { system, user };
}

function buildTagNormalizationPrompt(tags = [], config = {}) {
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const sample = (Array.isArray(tags) ? tags : [])
    .map((t) => ({
      name: normalizeString(t?.name || t?.tag || ''),
      count: Number(t?.count || 0) || 0
    }))
    .filter((t) => t.name)
    .slice(0, 200);
  const system = [
    '你是标签规范化助手，任务是识别书签系统中的同义标签、大小写变体和中英文重复标签。',
    preferChinese ? '优先推荐中文目标标签；专有名词可保留英文。' : '目标标签以复用性和团队一致性为先。',
    '只给出你有较高把握的合并建议，不要过度合并不同概念。',
    '每个建议必须包含 sources（来源标签数组）和 target（目标标签）。',
    'sources 至少 2 个，且 target 不应为空。',
    '请只输出 JSON，不要解释。',
    'JSON 结构必须为 {"suggestions":[{"sources":["...","..."],"target":"...","reason":"...","confidence":0.0}]}'
  ].join('\n');
  const user = [
    `标签列表（名称与数量）: ${JSON.stringify(sample)}`,
    '请返回最多 12 条规范化建议。'
  ].join('\n');
  return { system, user };
}

function buildTagLocalizationPrompt(tags = [], config = {}) {
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const sample = (Array.isArray(tags) ? tags : [])
    .map((t) => ({
      name: normalizeString(t?.name || t?.tag || ''),
      count: Number(t?.count || 0) || 0
    }))
    .filter((t) => t.name)
    .slice(0, 200);
  const system = [
    '你是标签语言规范助手，任务是识别书签标签中的中英文混用、大小写变体、翻译重复与缩写变体，并给出本地化统一建议。',
    preferChinese
      ? '目标策略：优先统一为中文标签；专有名词、品牌名、产品名可保留英文。'
      : '目标策略：以复用性和准确性为先，可保留英文标签，但要消除重复变体。',
    '只给出高把握建议，不要把不同概念错误合并。',
    '每条建议必须包含 sources（来源标签数组）和 target（目标标签），可附加 detectedLanguage/targetLanguage/reason/confidence。',
    'sources 至少 2 个，target 不应为空。',
    '请只输出 JSON，不要解释。',
    'JSON 结构必须为 {"suggestions":[{"sources":["...","..."],"target":"...","detectedLanguage":"mixed","targetLanguage":"zh","reason":"...","confidence":0.0}]}'
  ].join('\n');
  const user = [
    `标签列表（名称与数量）: ${JSON.stringify(sample)}`,
    '请返回最多 12 条“语言/本地化统一”建议。'
  ].join('\n');
  return { system, user };
}

function buildFolderRecommendationPrompt(bookmark, folders = [], config = {}) {
  const ctx = bookmarkContextForPrompt(bookmark);
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const candidates = (Array.isArray(folders) ? folders : [])
    .map((f) => ({
      id: String(f.id || ''),
      name: normalizeString(f.name || ''),
      path: normalizeString(f.path || ''),
      count: Number(f.bookmarkCount || 0) || 0
    }))
    .filter((f) => f.id && f.name)
    .slice(0, 200);
  const system = [
    '你是书签分类助手，任务是从给定收藏集候选中推荐最合适的目标集合。',
    preferChinese ? '优先依据中文语义匹配。' : '按语义准确性匹配集合。',
    '只能从提供的候选集合中选择，不要编造新集合。',
    '如果没有明显合适的集合，可返回空推荐并说明原因。',
    '请只输出 JSON，不要解释。',
    'JSON 结构必须为 {"folderId":"...","folderName":"...","reason":"...","confidence":0.0}'
  ].join('\n');
  const user = [
    `书签标题: ${ctx.title}`,
    `URL: ${ctx.url || '-'}`,
    `域名: ${ctx.host || '-'}`,
    `页面描述: ${ctx.metadataDescription || '-'}`,
    `摘要: ${ctx.excerpt || '-'}`,
    `备注: ${ctx.note || '-'}`,
    `标签: ${ctx.existingTags.length ? ctx.existingTags.join(', ') : '-'}`,
    `候选集合: ${JSON.stringify(candidates)}`,
    '请从候选集合中选择一个最匹配的 folderId。'
  ].join('\n');
  return { system, user };
}

function buildSearchFilterPrompt(text, { folders = [], tags = [], config = {}, current = {} } = {}) {
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const folderSample = (Array.isArray(folders) ? folders : [])
    .map((f) => ({
      id: String(f.id || ''),
      name: normalizeString(f.name || ''),
      path: normalizeString(f.path || '')
    }))
    .filter((f) => f.id && f.name)
    .slice(0, 200);
  const tagSample = (Array.isArray(tags) ? tags : [])
    .map((t) => ({ name: normalizeString(t?.name || ''), count: Number(t?.count || 0) || 0 }))
    .filter((t) => t.name)
    .slice(0, 80);
  const system = [
    '你是书签搜索助手，任务是把自然语言搜索需求转换为结构化筛选条件。',
    preferChinese ? '输出优先使用中文语义，但字段值必须符合指定枚举。' : '输出字段值必须符合指定枚举。',
    '仅使用以下字段：q,tags,domain,type,favorite,archived,view,sort,folderId,folderName,reason,unsupported,confidence。',
    '可用 type 枚举：web,pdf,image,video 或空字符串。',
    '可用 favorite/archived：true,false 或空字符串。',
    '可用 view 枚举：all,inbox,favorites,archive,trash 或空字符串。',
    '可用 sort 枚举：newest,updated,oldest,title 或空字符串。',
    'folderId 必须从候选集合中选择；如果无法确定可留空并尝试给 folderName（候选中的名字）。',
    '对于当前系统无法表达的条件（例如日期范围、语言筛选），放入 unsupported 数组，并尽量把可表达部分拆出来。',
    'q 应保留无法准确结构化但仍应参与检索的关键词。',
    '请只输出 JSON，不要解释或 Markdown。',
    'JSON 结构必须为 {"q":"","tags":[""],"domain":"","type":"","favorite":"","archived":"","view":"","sort":"","folderId":"","folderName":"","reason":"","unsupported":[],"confidence":0.0}'
  ].join('\n');
  const user = [
    `用户自然语言搜索: ${normalizeString(text)}`,
    `当前上下文: ${JSON.stringify({
      view: String(current?.view || 'all'),
      folderId: String(current?.folderId || 'all'),
      sort: String(current?.sort || 'newest')
    })}`,
    `候选集合(用于 folderId/folderName): ${JSON.stringify(folderSample)}`,
    `常见标签(用于 tags): ${JSON.stringify(tagSample)}`,
    '请返回结构化筛选条件。'
  ].join('\n');
  return { system, user };
}

function buildSearchRerankPrompt({ query, candidates = [], config = {} } = {}) {
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const sample = (Array.isArray(candidates) ? candidates : [])
    .map((c, idx) => ({
      bookmarkId: String(c.bookmarkId || c.id || ''),
      rank: Number(c.rank || (idx + 1)) || (idx + 1),
      title: normalizeString(c.title || ''),
      url: normalizeString(c.url || ''),
      host: normalizeString(c.host || ''),
      folderPath: normalizeString(c.folderPath || ''),
      tags: Array.isArray(c.tags) ? c.tags.map((t) => normalizeString(t)).filter(Boolean).slice(0, 10) : [],
      excerpt: normalizeString(c.excerpt || c.note || '').slice(0, 180),
      lexicalScore: Number.isFinite(Number(c.lexicalScore)) ? Number(c.lexicalScore) : undefined,
      semanticScore: Number.isFinite(Number(c.semanticScore)) ? Number(c.semanticScore) : undefined
    }))
    .filter((c) => c.bookmarkId && c.title)
    .slice(0, 80);
  const system = [
    '你是书签搜索结果重排序助手，任务是根据用户查询语义，对候选书签做相关性重排。',
    preferChinese ? '输出原因优先中文。' : '输出原因可用原语言，但应简洁准确。',
    '只能在给定候选中重排，不能新增或杜撰 bookmarkId。',
    '综合考虑查询语义匹配、主题相关性、信息完整度；不要仅按域名或标题表面词匹配。',
    '优先输出最相关条目，返回顺序即重排结果。',
    '请只输出 JSON，不要解释。',
    'JSON 结构必须为 {"items":[{"bookmarkId":"...","score":0.0,"reason":"..."}],"summary":"","confidence":0.0}'
  ].join('\n');
  const user = [
    `用户查询: ${normalizeString(query)}`,
    `候选结果(当前顺序): ${JSON.stringify(sample)}`,
    '请输出重排后的候选列表（按相关性从高到低）。'
  ].join('\n');
  return { system, user };
}

function buildRelatedBookmarksPrompt(bookmark, candidates = [], config = {}) {
  const ctx = bookmarkContextForPrompt(bookmark);
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const sample = (Array.isArray(candidates) ? candidates : [])
    .map((c) => ({
      bookmarkId: String(c.bookmarkId || c.id || ''),
      title: normalizeString(c.title || ''),
      host: normalizeString(c.host || ''),
      folderPath: normalizeString(c.folderPath || c.path || ''),
      tags: Array.isArray(c.tags) ? c.tags.map((t) => normalizeString(t)).filter(Boolean).slice(0, 8) : [],
      excerpt: normalizeString(c.excerpt || c.note || '').slice(0, 160)
    }))
    .filter((c) => c.bookmarkId && c.title)
    .slice(0, 80);
  const system = [
    '你是书签相关推荐助手，任务是根据当前书签内容，从候选书签中挑选最相关的条目。',
    preferChinese ? '输出原因优先中文。' : '输出原因可使用原语言，但要简洁。',
    '只能从候选列表中选择，不要编造新的 bookmarkId。',
    '优先考虑主题一致、用途相近、同一技术栈/领域、相互补充的条目；避免仅因域名相同而误判。',
    '返回最多 8 条，按相关性排序。',
    '请只输出 JSON，不要解释。',
    'JSON 结构必须为 {"items":[{"bookmarkId":"...","reason":"...","score":0.0}],"summary":"..."}'
  ].join('\n');
  const user = [
    `当前书签标题: ${ctx.title}`,
    `URL: ${ctx.url || '-'}`,
    `域名: ${ctx.host || '-'}`,
    `页面描述: ${ctx.metadataDescription || '-'}`,
    `摘要: ${ctx.excerpt || '-'}`,
    `备注: ${ctx.note || '-'}`,
    `标签: ${ctx.existingTags.length ? ctx.existingTags.join(', ') : '-'}`,
    `候选书签: ${JSON.stringify(sample)}`,
    '请返回最相关的候选条目列表。'
  ].join('\n');
  return { system, user };
}

function buildReadingPriorityPrompt({ candidates = [], userProfile = {}, context = {}, config = {} } = {}) {
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const sample = (Array.isArray(candidates) ? candidates : [])
    .map((c) => ({
      bookmarkId: String(c.bookmarkId || c.id || ''),
      title: normalizeString(c.title || ''),
      host: normalizeString(c.host || ''),
      folderPath: normalizeString(c.folderPath || c.path || ''),
      tags: Array.isArray(c.tags) ? c.tags.map((t) => normalizeString(t)).filter(Boolean).slice(0, 8) : [],
      excerpt: normalizeString(c.excerpt || c.note || '').slice(0, 180),
      estimatedLength: Number(c.estimatedLength || 0) || 0,
      localScore: Number.isFinite(Number(c.localScore)) ? Number(c.localScore) : undefined,
      recencyScore: Number.isFinite(Number(c.recencyScore)) ? Number(c.recencyScore) : undefined,
      interestScore: Number.isFinite(Number(c.interestScore)) ? Number(c.interestScore) : undefined,
      hasReminder: Boolean(c.hasReminder),
      favorite: Boolean(c.favorite),
      read: Boolean(c.read),
      archived: Boolean(c.archived),
      daysSinceCreated: Number(c.daysSinceCreated || 0) || 0,
      daysSinceUpdated: Number(c.daysSinceUpdated || 0) || 0
    }))
    .filter((c) => c.bookmarkId && c.title)
    .slice(0, 120);
  const profile = {
    favoredTags: Array.isArray(userProfile?.favoredTags) ? userProfile.favoredTags.slice(0, 20) : [],
    favoredHosts: Array.isArray(userProfile?.favoredHosts) ? userProfile.favoredHosts.slice(0, 20) : [],
    recentInterestTags: Array.isArray(userProfile?.recentInterestTags) ? userProfile.recentInterestTags.slice(0, 20) : [],
    readingSignals: userProfile?.readingSignals || {}
  };
  const system = [
    '你是阅读优先级排序助手，任务是为一批待阅读书签生成“先读什么”的优先级建议。',
    preferChinese ? '输出原因和总结优先使用中文。' : '输出语言与用户环境一致，保持简洁。',
    '只能在提供的候选列表中排序，不要编造 bookmarkId。',
    '综合考虑：主题匹配用户偏好、时效性、提醒信号、内容长度与可读性、重要性（收藏/高亮等）、本地启发式分数。',
    '优先给出“现在读/稍后读/有空再读”的排序建议。',
    '返回顺序即建议阅读顺序。',
    '请只输出 JSON，不要解释。',
    'JSON 结构必须为 {"items":[{"bookmarkId":"...","score":0.0,"priority":"now","reason":"..."}],"summary":"..."}'
  ].join('\n');
  const user = [
    `上下文: ${JSON.stringify({
      view: String(context?.view || 'all'),
      folderId: String(context?.folderId || ''),
      onlyUnread: Boolean(context?.onlyUnread),
      includeArchived: Boolean(context?.includeArchived),
      limit: Number(context?.limit || 10) || 10
    })}`,
    `用户阅读偏好画像(由本地行为推断): ${JSON.stringify(profile)}`,
    `候选书签(含本地评分特征): ${JSON.stringify(sample)}`,
    '请返回优先级排序结果，并给每条一句原因。priority 枚举仅允许 now/soon/later。'
  ].join('\n');
  return { system, user };
}

function buildBookmarksQaPrompt({ question, docs = [], config = {} } = {}) {
  const preferChinese = Boolean(config?.tagging?.preferChinese);
  const compactDocs = (Array.isArray(docs) ? docs : [])
    .map((d) => ({
      bookmarkId: String(d.bookmarkId || d.id || ''),
      title: normalizeString(d.title || ''),
      url: normalizeString(d.url || ''),
      host: normalizeString(d.host || ''),
      folderPath: normalizeString(d.folderPath || ''),
      tags: Array.isArray(d.tags) ? d.tags.map((t) => normalizeString(t)).filter(Boolean).slice(0, 10) : [],
      note: normalizeString(d.note || '').slice(0, 220),
      excerpt: normalizeString(d.excerpt || '').slice(0, 360),
      highlights: Array.isArray(d.highlights) ? d.highlights.map((h) => normalizeString(h)).filter(Boolean).slice(0, 6) : []
    }))
    .filter((d) => d.bookmarkId && d.title)
    .slice(0, 16);

  const system = [
    '你是书签知识问答助手。请仅根据提供的书签上下文回答问题，不要编造未出现的信息。',
    preferChinese ? '优先使用中文回答。' : '回答语言与问题保持一致，确保准确。',
    '回答要简洁、结构化；如果信息不足，要明确说明“根据当前书签上下文无法确定”。',
    '必须给出出处引用，引用只能使用提供的 bookmarkId。',
    '请只输出 JSON，不要输出 Markdown 或解释。',
    'JSON 结构必须为 {"answer":"...","citations":[{"bookmarkId":"...","reason":"..."}],"confidence":0.0,"insufficient":false}'
  ].join('\n');

  const user = [
    `问题: ${normalizeString(question)}`,
    `书签上下文: ${JSON.stringify(compactDocs)}`
  ].join('\n');

  return { system, user };
}

function parseJsonLoosely(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch (_err) {
      continue;
    }
  }
  return null;
}

function normalizeTagList(rawTags, { maxTags = 6 } = {}) {
  const items = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags || '')
      .split(/[\n,，、;；]+/g)
      .map((x) => x.trim());
  const out = [];
  const seen = new Set();
  for (const item of items) {
    let tag = String(item || '').trim();
    if (!tag) continue;
    tag = tag.replace(/^#/, '').trim();
    if (!tag) continue;
    if (tag.length > 24) tag = tag.slice(0, 24).trim();
    const key = tag.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= maxTags) break;
  }
  return out;
}

function contentFromOpenAICompatResponse(payload = {}) {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
      if (part && typeof part === 'object' && typeof part.content === 'string') return part.content;
      return '';
    }).join('').trim();
  }
  return String(content || '').trim();
}

async function httpJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 30_000));
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_err) {
    data = null;
  }
  if (!res.ok) {
    const message = data?.errors?.[0]?.message || data?.error?.message || data?.message || text || `HTTP ${res.status}`;
    const err = new Error(String(message));
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return { status: res.status, data, text };
}

function joinUrl(baseUrl, pathName) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('invalid baseUrl');
  const u = new URL(base.endsWith('/') ? base : `${base}/`);
  const nextPath = String(pathName || '').replace(/^\/+/, '');
  u.pathname = `${u.pathname.replace(/\/+$/, '')}/${nextPath}`;
  return u.toString();
}

async function callOpenAICompatible(config, prompt, { timeoutMs = 30_000 } = {}) {
  const baseUrl = normalizeBaseUrl(config?.openaiCompatible?.baseUrl);
  const apiKey = normalizeString(config?.openaiCompatible?.apiKey);
  const model = normalizeString(config?.openaiCompatible?.model);
  if (!baseUrl) throw new Error('OpenAI 兼容提供商缺少 baseUrl');
  if (!apiKey) throw new Error('OpenAI 兼容提供商缺少 API Key');
  if (!model) throw new Error('OpenAI 兼容提供商缺少模型名称');

  const url = joinUrl(baseUrl, 'chat/completions');
  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]
  };

  const { data } = await httpJson(url, {
    method: 'POST',
    timeoutMs,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body
  });

  const text = contentFromOpenAICompatResponse(data);
  return {
    model,
    providerType: 'openai_compatible',
    transport: 'chat_completions',
    rawText: text,
    rawResponse: data
  };
}

async function callCloudflareAI(config, prompt, { timeoutMs = 30_000 } = {}) {
  const accountId = normalizeString(config?.cloudflareAI?.accountId);
  const apiToken = normalizeString(config?.cloudflareAI?.apiToken);
  const model = normalizeString(config?.cloudflareAI?.model);
  if (!accountId) throw new Error('Cloudflare AI 缺少 Account ID');
  if (!apiToken) throw new Error('Cloudflare AI 缺少 API Token');
  if (!model) throw new Error('Cloudflare AI 缺少模型名称');

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`;
  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]
  };
  const { data } = await httpJson(url, {
    method: 'POST',
    timeoutMs,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body
  });

  const text = contentFromOpenAICompatResponse(data);
  return {
    model,
    providerType: 'cloudflare_ai',
    transport: 'cloudflare_openai_chat',
    rawText: text,
    rawResponse: data
  };
}

async function callAiProvider(config, prompt, opts = {}) {
  const providerType = String(config?.providerType || 'openai_compatible');
  if (providerType === 'cloudflare_ai') return callCloudflareAI(config, prompt, opts);
  return callOpenAICompatible(config, prompt, opts);
}

function normalizeEmbeddingVector(raw, { dim = 0 } = {}) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const v of arr) {
    const n = Number(v);
    out.push(Number.isFinite(n) ? n : 0);
  }
  if (dim > 0) {
    if (out.length > dim) out.length = dim;
    while (out.length < dim) out.push(0);
  }
  let norm = 0;
  for (const v of out) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < out.length; i += 1) out[i] = Number((out[i] / norm).toFixed(8));
  }
  return out;
}

function tokenHashInt(token = '') {
  const digest = crypto.createHash('sha1').update(String(token || '')).digest();
  return digest.readUInt32BE(0);
}

function localTextEmbedding(text = '', { dim = 192 } = {}) {
  const size = clampInt(dim, 32, 1024, 192);
  const vec = new Array(size).fill(0);
  const tokens = String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!tokens.length) return vec;
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  for (const [token, count] of counts.entries()) {
    const h = tokenHashInt(token);
    const idxA = h % size;
    const idxB = ((h >>> 8) ^ h) % size;
    const signA = ((h & 1) ? 1 : -1);
    const signB = ((h & 2) ? 1 : -1);
    const weight = 1 + Math.log1p(Number(count || 1));
    vec[idxA] += signA * weight;
    vec[idxB] += signB * (weight * 0.5);
  }
  return normalizeEmbeddingVector(vec, { dim: size });
}

function embeddingsFromResponsePayload(payload = {}) {
  const direct = Array.isArray(payload?.data) ? payload.data : null;
  if (direct && direct.length) return direct;
  const nested = Array.isArray(payload?.result?.data) ? payload.result.data : null;
  if (nested && nested.length) return nested;
  return [];
}

async function callOpenAICompatibleEmbeddings(config, texts = [], { timeoutMs = 30_000 } = {}) {
  const baseUrl = normalizeBaseUrl(config?.openaiCompatible?.baseUrl);
  const apiKey = normalizeString(config?.openaiCompatible?.apiKey);
  const model = normalizeString(config?.openaiCompatible?.embeddingModel);
  if (!baseUrl) throw new Error('OpenAI 兼容提供商缺少 baseUrl');
  if (!apiKey) throw new Error('OpenAI 兼容提供商缺少 API Key');
  if (!model) throw new Error('OpenAI 兼容 Embedding 模型未配置');

  const url = joinUrl(baseUrl, 'embeddings');
  const body = {
    model,
    input: texts.map((t) => String(t || ''))
  };
  const { data } = await httpJson(url, {
    method: 'POST',
    timeoutMs,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body
  });

  const rows = embeddingsFromResponsePayload(data);
  const vectors = rows.map((row) => normalizeEmbeddingVector(row?.embedding || []));
  return {
    vectors,
    providerType: 'openai_compatible',
    model,
    transport: 'embeddings',
    rawResponse: data
  };
}

async function callCloudflareAIEmbeddings(config, texts = [], { timeoutMs = 30_000 } = {}) {
  const accountId = normalizeString(config?.cloudflareAI?.accountId);
  const apiToken = normalizeString(config?.cloudflareAI?.apiToken);
  const model = normalizeString(config?.cloudflareAI?.embeddingModel);
  if (!accountId) throw new Error('Cloudflare AI 缺少 Account ID');
  if (!apiToken) throw new Error('Cloudflare AI 缺少 API Token');
  if (!model) throw new Error('Cloudflare AI Embedding 模型未配置');

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/embeddings`;
  const body = {
    model,
    input: texts.map((t) => String(t || ''))
  };
  const { data } = await httpJson(url, {
    method: 'POST',
    timeoutMs,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body
  });

  const rows = embeddingsFromResponsePayload(data);
  const vectors = rows.map((row) => normalizeEmbeddingVector(row?.embedding || []));
  return {
    vectors,
    providerType: 'cloudflare_ai',
    model,
    transport: 'embeddings',
    rawResponse: data
  };
}

async function callEmbeddingProvider(config, texts = [], opts = {}) {
  const providerType = String(config?.providerType || 'openai_compatible');
  if (providerType === 'cloudflare_ai') return callCloudflareAIEmbeddings(config, texts, opts);
  return callOpenAICompatibleEmbeddings(config, texts, opts);
}

async function generateTextEmbeddings({ config, texts = [], timeoutMs = 30_000, allowLocalFallback = true, dim } = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const list = (Array.isArray(texts) ? texts : []).map((t) => String(t || ''));
  if (!list.length) return { vectors: [], provider: { providerType: 'local', model: 'none', transport: 'none' }, fallbackLocal: true };
  const targetDim = clampInt(dim || normalized.embeddings?.dim, 32, 1024, 192);

  const shouldTryProvider = Boolean(normalized.embeddings?.preferProvider);
  if (shouldTryProvider) {
    try {
      const out = await callEmbeddingProvider(normalized, list, { timeoutMs });
      const vectors = out.vectors.map((v) => normalizeEmbeddingVector(v, { dim: v.length || targetDim }));
      if (vectors.length === list.length && vectors.every((v) => Array.isArray(v) && v.length > 0)) {
        return {
          vectors,
          provider: {
            providerType: out.providerType,
            model: out.model,
            transport: out.transport
          },
          fallbackLocal: false
        };
      }
    } catch (err) {
      if (!allowLocalFallback && !normalized.embeddings?.fallbackLocal) throw err;
    }
  }

  const localAllowed = allowLocalFallback || Boolean(normalized.embeddings?.fallbackLocal);
  if (!localAllowed) throw new Error('Embedding provider unavailable and local fallback disabled');
  const vectors = list.map((text) => localTextEmbedding(text, { dim: targetDim }));
  return {
    vectors,
    provider: {
      providerType: 'local',
      model: `hashed-bow-${targetDim}`,
      transport: 'local_embedding'
    },
    fallbackLocal: true
  };
}

function deriveSummaryFromBookmark(bookmark, host = '') {
  const note = normalizeString(bookmark?.note);
  if (note) return note.slice(0, 80);
  const title = normalizeString(bookmark?.title) || '未命名书签';
  if (host) return `${host} · ${title}`.slice(0, 80);
  return title.slice(0, 80);
}

async function generateBookmarkTagSuggestions({ config, bookmark, timeoutMs = 30_000 }) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildAutoTagPrompt(bookmark, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const suggestedTags = normalizeTagList(parsed.tags, { maxTags: normalized.tagging.maxTags });
  const summary = normalizeString(parsed.summary).slice(0, 160) || deriveSummaryFromBookmark(bookmark, prompt.host);

  return {
    suggestedTags,
    summary,
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateBookmarkTitleSuggestion({ config, bookmark, timeoutMs = 30_000 }) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildTitleCleanupPrompt(bookmark, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  let cleanTitle = normalizeString(parsed.title || parsed.cleanTitle || parsed.name);
  if (!cleanTitle) cleanTitle = normalizeString(bookmark?.title) || '';
  if (cleanTitle.length > 180) cleanTitle = cleanTitle.slice(0, 180).trim();
  const reason = normalizeString(parsed.reason).slice(0, 200);
  return {
    cleanTitle,
    reason,
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateBookmarkSummarySuggestion({ config, bookmark, timeoutMs = 30_000 }) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildSummaryPrompt(bookmark, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  let summary = normalizeString(parsed.summary || parsed.note || parsed.excerpt);
  if (!summary) summary = deriveSummaryFromBookmark(bookmark, prompt.host);
  if (summary.length > 240) summary = summary.slice(0, 240).trim();
  return {
    summary,
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateBookmarkReaderSummary({ config, bookmark, timeoutMs = 35_000 }) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const textContent = normalizeString(bookmark?.article?.textContent || '');
  if (!textContent) throw new Error('请先提取正文后再生成阅读摘要');
  const prompt = buildReaderSummaryPrompt(bookmark, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  let shortSummary = normalizeString(parsed.shortSummary || parsed.summary || parsed.excerpt);
  if (!shortSummary) shortSummary = normalizeString(bookmark?.article?.excerpt || bookmark?.metadata?.description || '').slice(0, 200);
  if (shortSummary.length > 280) shortSummary = shortSummary.slice(0, 280).trim();
  const keyPoints = (Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [])
    .map((x) => normalizeString(x))
    .filter(Boolean)
    .slice(0, 6)
    .map((x) => (x.length > 180 ? `${x.slice(0, 180).trim()}…` : x));
  let whySave = normalizeString(parsed.whySave || parsed.whyBookmark || parsed.reason);
  if (!whySave) {
    whySave = shortSummary ? `便于后续快速回顾「${normalizeString(bookmark?.title || '').slice(0, 40)}」主题内容。` : '';
  }
  if (whySave.length > 180) whySave = whySave.slice(0, 180).trim();
  return {
    shortSummary,
    keyPoints,
    whySave,
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateBookmarkHighlightCandidates({ config, bookmark, timeoutMs = 35_000, limit = 6 } = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const textContent = normalizeString(bookmark?.article?.textContent || '');
  if (!textContent) throw new Error('请先提取正文后再生成高亮候选');
  const prompt = buildHighlightCandidatesPrompt(bookmark, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const items = [];
  const seen = new Set();
  const existing = new Set(
    (Array.isArray(bookmark?.highlights) ? bookmark.highlights : [])
      .map((h) => normalizeString(h?.quote || h?.text || '').toLowerCase())
      .filter(Boolean)
  );
  for (const row of (Array.isArray(parsed.items) ? parsed.items : [])) {
    let quote = normalizeString(row?.quote || row?.text);
    if (!quote) continue;
    if (quote.length > 260) quote = `${quote.slice(0, 260).trim()}…`;
    const key = quote.toLowerCase();
    if (seen.has(key) || existing.has(key)) continue;
    seen.add(key);
    items.push({
      quote,
      reason: normalizeString(row?.reason).slice(0, 200),
      score: Math.max(0, Math.min(1, Number(row?.score ?? row?.confidence) || 0))
    });
    if (items.length >= Math.max(1, Math.min(12, Number(limit) || 6))) break;
  }
  return {
    items,
    summary: normalizeString(parsed.summary || parsed.reason || '').slice(0, 240),
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateBookmarkHighlightDigest({ config, bookmark, timeoutMs = 35_000 } = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const highlights = Array.isArray(bookmark?.highlights) ? bookmark.highlights : [];
  if (!highlights.length) throw new Error('请先创建高亮后再生成高亮总结');
  const prompt = buildHighlightDigestPrompt(bookmark, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const normalizeList = (v, { max = 6, maxLen = 140 } = {}) =>
    (Array.isArray(v) ? v : [])
      .map((x) => normalizeString(x))
      .filter(Boolean)
      .slice(0, max)
      .map((x) => (x.length > maxLen ? `${x.slice(0, maxLen).trim()}…` : x));
  let summary = normalizeString(parsed.summary || parsed.digest || parsed.overview);
  if (!summary) {
    const fallbackQuotes = highlights
      .map((h) => normalizeString(h?.quote || h?.text || ''))
      .filter(Boolean)
      .slice(0, 2)
      .join('；');
    summary = fallbackQuotes ? `基于高亮内容整理出该书签的重点：${fallbackQuotes.slice(0, 180)}` : '';
  }
  if (summary.length > 320) summary = `${summary.slice(0, 320).trim()}…`;
  return {
    summary,
    themes: normalizeList(parsed.themes, { max: 5, maxLen: 50 }),
    keyInsights: normalizeList(parsed.keyInsights || parsed.insights || parsed.keyPoints, { max: 6, maxLen: 180 }),
    actionItems: normalizeList(parsed.actionItems || parsed.actions, { max: 4, maxLen: 160 }),
    openQuestions: normalizeList(parsed.openQuestions || parsed.questions, { max: 4, maxLen: 160 }),
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateFolderKnowledgeSummary({ config, folder, folderPath = '', bookmarks = [], stats = {}, timeoutMs = 40_000 } = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const items = Array.isArray(bookmarks) ? bookmarks.filter(Boolean) : [];
  if (!items.length) throw new Error('集合内暂无书签，无法生成集合摘要');
  const prompt = buildFolderKnowledgeSummaryPrompt({ folder, folderPath, bookmarks: items, stats, config: normalized });
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const sampleById = new Map(items.map((b) => [String(b?.id || ''), b]));
  const normalizeList = (v, { max = 6, maxLen = 80 } = {}) =>
    [...new Set((Array.isArray(v) ? v : []).map((x) => normalizeString(x)).filter(Boolean))]
      .slice(0, max)
      .map((x) => (x.length > maxLen ? `${x.slice(0, maxLen).trim()}…` : x));
  let summary = normalizeString(parsed.summary || parsed.overview || parsed.digest);
  if (!summary) {
    summary = `该集合包含 ${Number(stats?.bookmarkCount || items.length)} 条书签，主题集中在 ${normalizeList(parsed.themes, { max: 3, maxLen: 24 }).join('、') || '多个方向'}。`;
  }
  if (summary.length > 360) summary = `${summary.slice(0, 360).trim()}…`;

  const notableBookmarks = [];
  const seenNotable = new Set();
  for (const row of (Array.isArray(parsed.notableBookmarks) ? parsed.notableBookmarks : [])) {
    const bookmarkId = String(row?.bookmarkId || '').trim();
    if (!bookmarkId || seenNotable.has(bookmarkId) || !sampleById.has(bookmarkId)) continue;
    seenNotable.add(bookmarkId);
    const sample = sampleById.get(bookmarkId) || {};
    notableBookmarks.push({
      bookmarkId,
      title: normalizeString(row?.title || sample?.title || '').slice(0, 140),
      reason: normalizeString(row?.reason).slice(0, 180)
    });
    if (notableBookmarks.length >= 6) break;
  }

  return {
    summary,
    themes: normalizeList(parsed.themes, { max: 6, maxLen: 50 }),
    commonTags: normalizeList(parsed.commonTags || parsed.tags, { max: 10, maxLen: 40 }),
    representativeSources: normalizeList(parsed.representativeSources || parsed.sources || parsed.hosts, { max: 10, maxLen: 60 }),
    notableBookmarks,
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateBookmarksDigestSummary({ config, windowLabel = '', range = {}, bookmarks = [], stats = {}, timeoutMs = 40_000 } = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const items = Array.isArray(bookmarks) ? bookmarks.filter(Boolean) : [];
  if (!items.length) throw new Error('时间窗口内暂无新增书签');
  const prompt = buildBookmarksDigestPrompt({ windowLabel, range, bookmarks: items, stats, config: normalized });
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const sampleById = new Map(items.map((b) => [String(b?.id || ''), b]));
  const normalizeList = (v, { max = 6, maxLen = 90 } = {}) =>
    [...new Set((Array.isArray(v) ? v : []).map((x) => normalizeString(x)).filter(Boolean))]
      .slice(0, max)
      .map((x) => (x.length > maxLen ? `${x.slice(0, maxLen).trim()}…` : x));
  let summary = normalizeString(parsed.summary || parsed.digest || parsed.overview);
  if (!summary) {
    summary = `本时间窗口新增 ${items.length} 条书签，主题集中在 ${normalizeList(parsed.themes, { max: 3, maxLen: 24 }).join('、') || '多个方向'}。`;
  }
  if (summary.length > 360) summary = `${summary.slice(0, 360).trim()}…`;
  const highlights = [];
  const seen = new Set();
  for (const row of (Array.isArray(parsed.highlights) ? parsed.highlights : [])) {
    const bookmarkId = String(row?.bookmarkId || '').trim();
    if (!bookmarkId || seen.has(bookmarkId) || !sampleById.has(bookmarkId)) continue;
    seen.add(bookmarkId);
    const sample = sampleById.get(bookmarkId) || {};
    highlights.push({
      bookmarkId,
      title: normalizeString(row?.title || sample?.title || '').slice(0, 160),
      reason: normalizeString(row?.reason).slice(0, 200)
    });
    if (highlights.length >= 8) break;
  }
  return {
    summary,
    themes: normalizeList(parsed.themes, { max: 8, maxLen: 60 }),
    highlights,
    recommendedActions: normalizeList(parsed.recommendedActions || parsed.actions, { max: 6, maxLen: 180 }),
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateTagNormalizationSuggestions({ config, tags, timeoutMs = 30_000, maxSuggestions = 12 } = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildTagNormalizationPrompt(tags, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const seenGroup = new Set();
  const suggestions = [];
  const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  for (const row of rawSuggestions) {
    const sources = normalizeTagList(Array.isArray(row?.sources) ? row.sources : [], { maxTags: 20 })
      .filter(Boolean);
    if (sources.length < 2) continue;
    const target = normalizeTagList([row?.target], { maxTags: 1 })[0] || '';
    if (!target) continue;
    const uniqSources = [...new Set(sources.map((t) => String(t)))];
    if (uniqSources.length < 2) continue;
    const lowerSet = new Set(uniqSources.map((t) => t.toLowerCase()));
    if (lowerSet.has(String(target).toLowerCase()) && lowerSet.size < 2) continue;
    const key = [...lowerSet].sort().join('|') + `=>${String(target).toLowerCase()}`;
    if (seenGroup.has(key)) continue;
    seenGroup.add(key);
    suggestions.push({
      sources: uniqSources,
      target,
      reason: normalizeString(row?.reason).slice(0, 200),
      confidence: Math.max(0, Math.min(1, Number(row?.confidence) || 0))
    });
    if (suggestions.length >= Math.max(1, Math.min(20, Number(maxSuggestions) || 12))) break;
  }
  return {
    suggestions,
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateTagLocalizationSuggestions({ config, tags, timeoutMs = 30_000, maxSuggestions = 12 } = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildTagLocalizationPrompt(tags, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const seenGroup = new Set();
  const suggestions = [];
  const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  for (const row of rawSuggestions) {
    const sources = normalizeTagList(Array.isArray(row?.sources) ? row.sources : [], { maxTags: 20 })
      .filter(Boolean);
    if (sources.length < 2) continue;
    const target = normalizeTagList([row?.target], { maxTags: 1 })[0] || '';
    if (!target) continue;
    const uniqSources = [...new Set(sources.map((t) => String(t)))];
    if (uniqSources.length < 2) continue;
    const lowerSet = new Set(uniqSources.map((t) => t.toLowerCase()));
    if (lowerSet.has(String(target).toLowerCase()) && lowerSet.size < 2) continue;
    const key = [...lowerSet].sort().join('|') + `=>${String(target).toLowerCase()}`;
    if (seenGroup.has(key)) continue;
    seenGroup.add(key);
    suggestions.push({
      sources: uniqSources,
      target,
      detectedLanguage: normalizeString(row?.detectedLanguage || row?.language || row?.sourceLanguage).slice(0, 20),
      targetLanguage: normalizeString(row?.targetLanguage || (normalized?.tagging?.preferChinese ? 'zh' : '')).slice(0, 10),
      reason: normalizeString(row?.reason).slice(0, 200),
      confidence: Math.max(0, Math.min(1, Number(row?.confidence) || 0))
    });
    if (suggestions.length >= Math.max(1, Math.min(20, Number(maxSuggestions) || 12))) break;
  }
  return {
    suggestions,
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateBookmarkFolderRecommendation({ config, bookmark, folders, timeoutMs = 30_000 } = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildFolderRecommendationPrompt(bookmark, folders, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const folderIdRaw = normalizeString(parsed.folderId || parsed.id);
  const folderNameRaw = normalizeString(parsed.folderName || parsed.name);
  const reason = normalizeString(parsed.reason).slice(0, 220);
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const candidates = Array.isArray(folders) ? folders : [];
  let matched = null;
  if (folderIdRaw) matched = candidates.find((f) => String(f.id) === folderIdRaw) || null;
  if (!matched && folderNameRaw) {
    matched = candidates.find((f) => String(f.name || '').trim().toLowerCase() === folderNameRaw.toLowerCase()) || null;
  }
  return {
    recommendation: matched
      ? {
          folderId: String(matched.id),
          folderName: String(matched.name || ''),
          folderPath: String(matched.path || ''),
          confidence
        }
      : {
          folderId: '',
          folderName: folderNameRaw,
          folderPath: '',
          confidence
        },
    reason,
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

function normalizeTriBoolFilter(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'true' || v === 'false') return v;
  return '';
}

async function generateSearchFilterSuggestion({
  config,
  text,
  folders = [],
  tags = [],
  current = {},
  timeoutMs = 30_000
} = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildSearchFilterPrompt(text, { folders, tags, config: normalized, current });
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};

  const candidates = Array.isArray(folders) ? folders : [];
  const byId = new Map(candidates.map((f) => [String(f.id), f]));
  const byName = new Map(candidates.map((f) => [String(f.name || '').trim().toLowerCase(), f]));
  const byPath = new Map(candidates.map((f) => [String(f.path || '').trim().toLowerCase(), f]));

  const rawFolderId = normalizeString(parsed.folderId || '');
  const rawFolderName = normalizeString(parsed.folderName || parsed.collection || parsed.collectionName || '');
  let matchedFolder = rawFolderId ? (byId.get(rawFolderId) || null) : null;
  if (!matchedFolder && rawFolderName) {
    matchedFolder = byPath.get(rawFolderName.toLowerCase()) || byName.get(rawFolderName.toLowerCase()) || null;
  }

  const outTags = normalizeTagList(Array.isArray(parsed.tags) ? parsed.tags : String(parsed.tags || ''), { maxTags: 12 });
  const type = ['web', 'pdf', 'image', 'video'].includes(String(parsed.type || '').trim().toLowerCase())
    ? String(parsed.type).trim().toLowerCase()
    : '';
  const view = ['all', 'inbox', 'favorites', 'archive', 'trash'].includes(String(parsed.view || '').trim().toLowerCase())
    ? String(parsed.view).trim().toLowerCase()
    : '';
  const sort = ['newest', 'updated', 'oldest', 'title'].includes(String(parsed.sort || '').trim().toLowerCase())
    ? String(parsed.sort).trim().toLowerCase()
    : '';
  let domain = normalizeString(parsed.domain || '');
  domain = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
  if (domain.startsWith('www.')) domain = domain.slice(4);
  if (domain.length > 120) domain = domain.slice(0, 120);

  return {
    query: {
      q: normalizeString(parsed.q || parsed.keywords || '').slice(0, 240),
      tags: outTags,
      domain,
      type,
      favorite: normalizeTriBoolFilter(parsed.favorite),
      archived: normalizeTriBoolFilter(parsed.archived),
      view,
      sort,
      folderId: matchedFolder ? String(matchedFolder.id) : '',
      folderName: matchedFolder ? String(matchedFolder.name || '') : rawFolderName
    },
    reason: normalizeString(parsed.reason || parsed.summary || '').slice(0, 240),
    unsupported: (Array.isArray(parsed.unsupported) ? parsed.unsupported : [])
      .map((x) => normalizeString(x))
      .filter(Boolean)
      .slice(0, 12),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateSearchRerankRecommendations({
  config,
  query,
  candidates = [],
  timeoutMs = 30_000,
  limit = 40
} = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildSearchRerankPrompt({ query, candidates, config: normalized });
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const candidateMap = new Map(
    (Array.isArray(candidates) ? candidates : []).map((c) => [String(c.bookmarkId || c.id || ''), c])
  );
  const outItems = [];
  const seen = new Set();
  for (const row of (Array.isArray(parsed.items) ? parsed.items : [])) {
    const bookmarkId = normalizeString(row?.bookmarkId || row?.id);
    if (!bookmarkId || seen.has(bookmarkId) || !candidateMap.has(bookmarkId)) continue;
    seen.add(bookmarkId);
    outItems.push({
      bookmarkId,
      score: Math.max(0, Math.min(1, Number(row?.score ?? row?.confidence) || 0)),
      reason: normalizeString(row?.reason).slice(0, 220)
    });
    if (outItems.length >= Math.max(1, Math.min(120, Number(limit) || 40))) break;
  }
  return {
    items: outItems,
    summary: normalizeString(parsed.summary || parsed.reason || '').slice(0, 240),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateRelatedBookmarksRecommendations({
  config,
  bookmark,
  candidates = [],
  timeoutMs = 30_000,
  limit = 8
} = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildRelatedBookmarksPrompt(bookmark, candidates, normalized);
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const candidateMap = new Map(
    (Array.isArray(candidates) ? candidates : []).map((c) => [String(c.bookmarkId || c.id || ''), c])
  );
  const outItems = [];
  const seen = new Set();
  for (const row of (Array.isArray(parsed.items) ? parsed.items : [])) {
    const bookmarkId = normalizeString(row?.bookmarkId || row?.id);
    if (!bookmarkId || seen.has(bookmarkId) || !candidateMap.has(bookmarkId)) continue;
    seen.add(bookmarkId);
    outItems.push({
      bookmarkId,
      reason: normalizeString(row?.reason).slice(0, 220),
      score: Math.max(0, Math.min(1, Number(row?.score ?? row?.confidence) || 0))
    });
    if (outItems.length >= Math.max(1, Math.min(20, Number(limit) || 8))) break;
  }
  return {
    items: outItems,
    summary: normalizeString(parsed.summary || parsed.reason || '').slice(0, 240),
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateReadingPriorityRecommendations({
  config,
  candidates = [],
  userProfile = {},
  context = {},
  timeoutMs = 30_000,
  limit = 12
} = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildReadingPriorityPrompt({ candidates, userProfile, context, config: normalized });
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};
  const candidateMap = new Map(
    (Array.isArray(candidates) ? candidates : []).map((c) => [String(c.bookmarkId || c.id || ''), c])
  );
  const outItems = [];
  const seen = new Set();
  for (const row of (Array.isArray(parsed.items) ? parsed.items : [])) {
    const bookmarkId = normalizeString(row?.bookmarkId || row?.id);
    if (!bookmarkId || seen.has(bookmarkId) || !candidateMap.has(bookmarkId)) continue;
    seen.add(bookmarkId);
    const priorityRaw = normalizeString(row?.priority).toLowerCase();
    const priority = ['now', 'soon', 'later'].includes(priorityRaw) ? priorityRaw : 'soon';
    outItems.push({
      bookmarkId,
      score: Math.max(0, Math.min(1, Number(row?.score ?? row?.confidence) || 0)),
      priority,
      reason: normalizeString(row?.reason).slice(0, 220)
    });
    if (outItems.length >= Math.max(1, Math.min(24, Number(limit) || 12))) break;
  }
  return {
    items: outItems,
    summary: normalizeString(parsed.summary || parsed.reason || '').slice(0, 280),
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function generateBookmarksQaAnswer({
  config,
  question,
  docs = [],
  timeoutMs = 35_000,
  maxCitations = 6
} = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) throw new Error('AI 功能未启用');
  const prompt = buildBookmarksQaPrompt({ question, docs, config: normalized });
  const providerOut = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(providerOut.rawText) || {};

  const docMap = new Map((Array.isArray(docs) ? docs : []).map((d) => [String(d.bookmarkId || d.id || ''), d]));
  const citations = [];
  const seen = new Set();
  for (const row of (Array.isArray(parsed.citations) ? parsed.citations : [])) {
    const bookmarkId = normalizeString(row?.bookmarkId || row?.id);
    if (!bookmarkId || seen.has(bookmarkId) || !docMap.has(bookmarkId)) continue;
    seen.add(bookmarkId);
    citations.push({
      bookmarkId,
      reason: normalizeString(row?.reason).slice(0, 180)
    });
    if (citations.length >= Math.max(1, Math.min(12, Number(maxCitations) || 6))) break;
  }

  return {
    answer: normalizeString(parsed.answer || parsed.response || parsed.result).slice(0, 4000),
    citations,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    insufficient: Boolean(parsed.insufficient),
    provider: {
      providerType: providerOut.providerType,
      model: providerOut.model,
      transport: providerOut.transport
    },
    rawText: providerOut.rawText,
    rawResponseMeta: {
      id: providerOut.rawResponse?.id || '',
      created: providerOut.rawResponse?.created || 0
    }
  };
}

async function testAiProviderConnection(config, { timeoutMs = 20_000 } = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  const prompt = {
    system: '你是连接测试助手。请只返回 JSON: {"ok":true,"pong":"..."}',
    user: '请返回 {"ok":true,"pong":"pong"}'
  };
  const out = await callAiProvider(normalized, prompt, { timeoutMs });
  const parsed = parseJsonLoosely(out.rawText);
  return {
    ok: true,
    providerType: out.providerType,
    model: out.model,
    transport: out.transport,
    parsed: parsed && typeof parsed === 'object' ? parsed : null,
    rawText: out.rawText.slice(0, 500)
  };
}

function buildAiJobRecord({ userId, bookmarkId, type = 'bookmark_auto_tag', status = 'succeeded', startedAt, finishedAt, config, result, error, apply, request }) {
  const requestPayload = request && typeof request === 'object'
    ? request
    : {
        apply: Boolean(apply?.applyTags),
        applyMode: String(apply?.applyMode || config?.tagging?.applyMode || 'merge')
      };
  return {
    id: `ai_${crypto.randomUUID()}`,
    userId: String(userId || ''),
    bookmarkId: String(bookmarkId || ''),
    type: String(type || 'bookmark_auto_tag'),
    status,
    createdAt: Number(startedAt || Date.now()),
    finishedAt: Number(finishedAt || Date.now()),
    providerType: String(config?.providerType || ''),
    model: String(
      config?.providerType === 'cloudflare_ai'
        ? config?.cloudflareAI?.model || ''
        : config?.openaiCompatible?.model || ''
    ),
    request: requestPayload,
    result: result || null,
    error: error ? { message: String(error.message || error) } : null
  };
}

module.exports = {
  DEFAULT_AI_CONFIG,
  ensureAiProviderConfigsStore,
  getAiProviderConfig,
  setAiProviderConfig,
  publicAiProviderConfig,
  testAiProviderConnection,
  generateBookmarkTagSuggestions,
  generateBookmarkTitleSuggestion,
  generateBookmarkSummarySuggestion,
  generateBookmarkReaderSummary,
  generateBookmarkHighlightCandidates,
  generateBookmarkHighlightDigest,
  generateFolderKnowledgeSummary,
  generateBookmarksDigestSummary,
  generateTagNormalizationSuggestions,
  generateTagLocalizationSuggestions,
  generateBookmarkFolderRecommendation,
  generateSearchFilterSuggestion,
  generateSearchRerankRecommendations,
  generateTextEmbeddings,
  generateRelatedBookmarksRecommendations,
  generateReadingPriorityRecommendations,
  generateBookmarksQaAnswer,
  buildAiJobRecord,
  normalizeTagList,
  normalizeAiProviderConfigInput
};
