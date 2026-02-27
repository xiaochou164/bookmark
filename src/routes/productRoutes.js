const crypto = require('node:crypto');
const { hasOwner } = require('../services/tenantScope');
const {
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
  buildAiJobRecord
} = require('../services/aiProviderService');

function normalizeUrlLoose(input = '') {
  try {
    const u = new URL(String(input || '').trim());
    u.hash = '';
    const pathname = u.pathname.endsWith('/') && u.pathname !== '/' ? u.pathname.slice(0, -1) : u.pathname;
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}${pathname || '/'}${u.search}`;
  } catch (_err) {
    return String(input || '').trim();
  }
}

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

function tokenize(text = '') {
  return [...new Set(String(text || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/g).map((x) => x.trim()).filter(Boolean))];
}

function normalizeTagsForBookmark(raw = []) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const t = String(item || '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function hostOfBookmarkUrl(input = '') {
  try {
    return new URL(String(input || '').trim()).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_err) {
    return '';
  }
}

function bookmarkTextForRetrieval(item = {}) {
  const highlights = Array.isArray(item?.highlights)
    ? item.highlights.flatMap((h) => [
        String(h?.quote || h?.text || ''),
        String(h?.note || ''),
        ...(Array.isArray(h?.annotations) ? h.annotations.map((a) => String(a?.text || '')) : [])
      ])
    : [];
  return [
    item?.title,
    item?.url,
    item?.note,
    ...(Array.isArray(item?.tags) ? item.tags : []),
    item?.article?.excerpt,
    item?.article?.summary,
    item?.metadata?.description,
    ...highlights
  ].join(' ');
}

function bookmarkTextForSemanticIndex(item = {}) {
  const highlights = Array.isArray(item?.highlights)
    ? item.highlights.flatMap((h) => [
        String(h?.quote || h?.text || ''),
        String(h?.note || ''),
        ...(Array.isArray(h?.annotations) ? h.annotations.map((a) => String(a?.text || '')) : [])
      ])
    : [];
  const articleText = String(item?.article?.contentText || '').slice(0, 4000);
  return [
    item?.title,
    item?.url,
    hostOfBookmarkUrl(item?.url || ''),
    item?.note,
    ...(Array.isArray(item?.tags) ? item.tags : []),
    item?.metadata?.description,
    item?.article?.title,
    item?.article?.excerpt,
    articleText,
    ...highlights
  ]
    .filter(Boolean)
    .join('\n');
}

function semanticTextFingerprint(text = '') {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

function normalizeVectorRow(raw = []) {
  const out = Array.isArray(raw) ? raw.map((v) => Number(v) || 0) : [];
  let norm = 0;
  for (const v of out) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < out.length; i += 1) out[i] = out[i] / norm;
  }
  return out;
}

function cosineSimilarity(a = [], b = []) {
  const len = Math.min(Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0);
  if (!len) return 0;
  let sum = 0;
  for (let i = 0; i < len; i += 1) sum += (Number(a[i]) || 0) * (Number(b[i]) || 0);
  return Number.isFinite(sum) ? sum : 0;
}

async function ensureSemanticIndexRowsForBookmarks({ dbRepo, userId, bookmarks = [], aiConfig, maxBatch = 24 }) {
  const target = (Array.isArray(bookmarks) ? bookmarks : []).filter((b) => b && !b.deletedAt);
  if (!target.length) return { rowsByBookmarkId: new Map(), updated: 0, provider: { providerType: 'local', model: 'none', transport: 'none' } };

  const snapshot = await dbRepo.read();
  const existingRows = Array.isArray(snapshot.semanticIndex) ? snapshot.semanticIndex.filter((r) => String(r.userId) === String(userId)) : [];
  const rowByBookmarkId = new Map(existingRows.map((r) => [String(r.bookmarkId), r]));

  const desired = target.map((b) => {
    const text = bookmarkTextForSemanticIndex(b);
    return {
      bookmarkId: String(b.id),
      text,
      textHash: semanticTextFingerprint(text),
      bookmarkUpdatedAt: Number(b.updatedAt || b.createdAt || 0) || 0
    };
  });

  const stale = desired.filter((d) => {
    const row = rowByBookmarkId.get(d.bookmarkId);
    if (!row) return true;
    if (String(row.textHash || '') !== d.textHash) return true;
    if (!Array.isArray(row.vector) || !row.vector.length) return true;
    return false;
  });

  let embedProvider = { providerType: 'local', model: 'none', transport: 'none' };
  const stagedRows = new Map();
  for (const d of desired) {
    const row = rowByBookmarkId.get(d.bookmarkId);
    if (row && String(row.textHash || '') === d.textHash && Array.isArray(row.vector) && row.vector.length) {
      stagedRows.set(d.bookmarkId, {
        ...row,
        vector: normalizeVectorRow(row.vector)
      });
    }
  }

  if (stale.length) {
    for (let i = 0; i < stale.length; i += maxBatch) {
      const batch = stale.slice(i, i + maxBatch);
      const embedOut = await generateTextEmbeddings({
        config: aiConfig,
        texts: batch.map((x) => x.text),
        allowLocalFallback: true
      });
      embedProvider = embedOut?.provider || embedProvider;
      const now = Date.now();
      batch.forEach((row, idx) => {
        const vector = normalizeVectorRow(embedOut?.vectors?.[idx] || []);
        stagedRows.set(row.bookmarkId, {
          id: `sem_${crypto.randomUUID()}`,
          userId: String(userId),
          bookmarkId: row.bookmarkId,
          textHash: row.textHash,
          vector,
          dim: vector.length,
          providerType: String(embedProvider.providerType || ''),
          model: String(embedProvider.model || ''),
          transport: String(embedProvider.transport || ''),
          bookmarkUpdatedAt: row.bookmarkUpdatedAt,
          updatedAt: now
        });
      });
    }

    await dbRepo.update((db) => {
      db.semanticIndex = Array.isArray(db.semanticIndex) ? db.semanticIndex : [];
      const keep = db.semanticIndex.filter((r) => !(String(r.userId) === String(userId) && stagedRows.has(String(r.bookmarkId))));
      db.semanticIndex = keep.concat([...stagedRows.values()].map((r) => ({ ...r, vector: Array.isArray(r.vector) ? r.vector : [] })));
      return db;
    });
  }

  return { rowsByBookmarkId: stagedRows, updated: stale.length, provider: embedProvider };
}

function mergeBookmarkTags(existing = [], suggested = [], mode = 'merge') {
  const normalizedExisting = normalizeTagsForBookmark(existing);
  const normalizedSuggested = normalizeTagsForBookmark(suggested);
  if (String(mode || 'merge') === 'replace') return normalizedSuggested;
  return normalizeTagsForBookmark([...normalizedExisting, ...normalizedSuggested]);
}

function tagsSummaryForBookmarks(bookmarks = []) {
  const counts = new Map();
  for (const item of Array.isArray(bookmarks) ? bookmarks : []) {
    if (item?.deletedAt) continue;
    for (const rawTag of Array.isArray(item?.tags) ? item.tags : []) {
      const tag = String(rawTag || '').trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      const row = counts.get(key) || { name: tag, count: 0 };
      row.count += 1;
      if (!counts.has(key)) counts.set(key, row);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function mergeTagSuggestionsInBookmarks(bookmarks = [], suggestions = []) {
  const normalizedSuggestions = (Array.isArray(suggestions) ? suggestions : [])
    .map((s) => ({
      sources: normalizeTagsForBookmark(Array.isArray(s?.sources) ? s.sources : []),
      target: String(s?.target || '').trim()
    }))
    .filter((s) => s.sources.length >= 2 && s.target);
  if (!normalizedSuggestions.length) return { appliedGroups: 0, affectedBookmarks: 0, replacedTags: 0 };

  let affectedBookmarks = 0;
  let replacedTags = 0;
  const now = Date.now();

  for (const item of Array.isArray(bookmarks) ? bookmarks : []) {
    if (item?.deletedAt) continue;
    const tags = normalizeTagsForBookmark(item.tags || []);
    if (!tags.length) continue;
    let next = [...tags];
    let changed = false;
    for (const suggestion of normalizedSuggestions) {
      const sourceKeys = new Set(suggestion.sources.map((t) => t.toLowerCase()));
      const hasAny = next.some((t) => sourceKeys.has(String(t).toLowerCase()));
      if (!hasAny) continue;
      const beforeLen = next.length;
      const filtered = [];
      let inserted = false;
      for (const t of next) {
        const key = String(t).toLowerCase();
        if (!sourceKeys.has(key)) {
          filtered.push(t);
          continue;
        }
        if (!inserted) {
          filtered.push(suggestion.target);
          inserted = true;
        }
      }
      next = normalizeTagsForBookmark(filtered);
      if (next.length !== beforeLen || JSON.stringify(next) !== JSON.stringify(tags)) {
        replacedTags += Math.max(0, beforeLen - next.length);
        changed = true;
      }
    }
    if (!changed) continue;
    item.tags = next;
    item.updatedAt = now;
    affectedBookmarks += 1;
  }

  return { appliedGroups: normalizedSuggestions.length, affectedBookmarks, replacedTags };
}

function folderPathMap(folders = []) {
  const map = new Map((Array.isArray(folders) ? folders : []).map((f) => [String(f.id), f]));
  const pathCache = new Map();
  const pathOf = (id) => {
    const key = String(id || '');
    if (!key) return '';
    if (pathCache.has(key)) return pathCache.get(key);
    const node = map.get(key);
    if (!node) return '';
    const parentId = String(node.parentId || '');
    const parentPath = parentId && parentId !== key ? pathOf(parentId) : '';
    const path = parentPath ? `${parentPath} / ${String(node.name || '').trim()}` : String(node.name || '').trim();
    pathCache.set(key, path);
    return path;
  };
  return { pathOf };
}

function folderDescendantIdSet(folders = [], rootId) {
  const id = String(rootId || '').trim();
  if (!id) return new Set();
  const childrenByParent = new Map();
  for (const f of Array.isArray(folders) ? folders : []) {
    const parentId = String(f?.parentId || 'root');
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(String(f?.id || ''));
  }
  const out = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const current = String(queue.shift() || '');
    for (const childId of childrenByParent.get(current) || []) {
      if (!childId || out.has(childId)) continue;
      out.add(childId);
      queue.push(childId);
    }
  }
  return out;
}

function registerProductRoutes(app, deps) {
  const { dbRepo, objectStorage, jobQueue, aiRules, badRequest, notFound } = deps;
  const userIdOf = (req) => String(req.auth?.user?.id || '');

  function userBookmarks(db, userId) {
    return (db.bookmarks || []).filter((b) => hasOwner(b, userId));
  }
  function userFolders(db, userId) {
    return (db.folders || []).filter((f) => hasOwner(f, userId));
  }
  function userBookmarksWithDeleted(db, userId) {
    return (db.bookmarks || []).filter((b) => hasOwner(b, userId));
  }

  function quotaSummary(db, userId) {
    const ent = entitlementForUser(db, userId);
    const limits = ent.plan === 'pro'
      ? { bookmarks: 50000, importsPerDay: 100, metadataFetchesPerDay: 5000, backups: 200 }
      : { bookmarks: 5000, importsPerDay: 20, metadataFetchesPerDay: 500, backups: 10 };
    const usage = {
      bookmarks: userBookmarks(db, userId).filter((b) => !b.deletedAt).length,
      importsPerDay: (db.ioTasks || []).filter((t) => String(t.userId) === userId && String(t.type || '').startsWith('import_')).length,
      metadataFetchesPerDay: (db.metadataTasks || []).filter((t) => String(t.userId) === userId).length,
      backups: (db.backups || []).filter((b) => String(b.userId) === userId).length
    };
    return { plan: ent.plan, usage, limits };
  }

  app.get('/api/product/entitlements', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      res.json({ ok: true, entitlement: entitlementForUser(db, userId) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/subscription', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      db.billingSubscriptions = Array.isArray(db.billingSubscriptions) ? db.billingSubscriptions : [];
      const sub = db.billingSubscriptions.find((s) => String(s.userId) === userId) || null;
      res.json({ ok: true, subscription: sub, entitlement: entitlementForUser(db, userId) });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/subscription', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const plan = String(req.body?.plan || 'free').toLowerCase();
      if (!['free', 'pro'].includes(plan)) return next(badRequest('plan must be free or pro'));
      let subscription = null;
      let entitlement = null;
      await dbRepo.update((db) => {
        db.billingSubscriptions = Array.isArray(db.billingSubscriptions) ? db.billingSubscriptions : [];
        const now = Date.now();
        let sub = db.billingSubscriptions.find((s) => String(s.userId) === userId);
        if (!sub) {
          sub = { id: `sub_${crypto.randomUUID()}`, userId, provider: 'manual', createdAt: now };
          db.billingSubscriptions.unshift(sub);
        }
        sub.plan = plan;
        sub.status = 'active';
        sub.currentPeriodStart = now;
        sub.currentPeriodEnd = now + 30 * 24 * 60 * 60 * 1000;
        sub.updatedAt = now;
        subscription = sub;
        entitlement = setEntitlement(db, userId, { plan, status: 'active' });
        return db;
      });
      res.json({ ok: true, subscription, entitlement });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/quota', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      res.json({ ok: true, quota: quotaSummary(db, userId) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/search/index/rebuild', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      let count = 0;
      await dbRepo.update((db) => {
        requireFeature(db, userId, 'fullTextSearch', badRequest);
        db.searchIndex = Array.isArray(db.searchIndex) ? db.searchIndex : [];
        db.searchIndex = db.searchIndex.filter((row) => String(row.userId) !== userId);
        const bookmarks = userBookmarks(db, userId).filter((b) => !b.deletedAt);
        const rows = bookmarks.map((b) => {
          const text = [b.title, b.url, b.note, ...(b.tags || []), b.article?.contentText || '', b.metadata?.description || ''].join('\n');
          return {
            id: `sidx_${crypto.randomUUID()}`,
            userId,
            bookmarkId: b.id,
            tokens: tokenize(text),
            text,
            title: b.title || '',
            url: b.url || '',
            folderId: b.folderId || 'root',
            updatedAt: Date.now()
          };
        });
        db.searchIndex.unshift(...rows);
        count = rows.length;
        return db;
      });
      res.json({ ok: true, indexed: count });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/search/semantic/index/rebuild', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'advancedSearch', badRequest);
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const aiConfig = getAiProviderConfig(db, userId);
      const bookmarks = userBookmarks(db, userId).filter((b) => !b.deletedAt);
      const keepIds = new Set(bookmarks.map((b) => String(b.id)));
      const { rowsByBookmarkId, updated, provider } = await ensureSemanticIndexRowsForBookmarks({
        dbRepo,
        userId,
        bookmarks,
        aiConfig,
        maxBatch: 20
      });
      let totalRows = rowsByBookmarkId.size;
      await dbRepo.update((dbWrite) => {
        dbWrite.semanticIndex = Array.isArray(dbWrite.semanticIndex) ? dbWrite.semanticIndex : [];
        dbWrite.semanticIndex = dbWrite.semanticIndex.filter((r) => {
          if (String(r.userId) !== String(userId)) return true;
          return keepIds.has(String(r.bookmarkId || ''));
        });
        totalRows = dbWrite.semanticIndex.filter((r) => String(r.userId) === String(userId)).length;
        return dbWrite;
      });
      res.json({
        ok: true,
        indexed: bookmarks.length,
        updated,
        totalRows,
        provider
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/search/query', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const q = String(req.query?.q || '').trim();
      const tags = String(req.query?.tags || '').trim().split(',').map((x) => x.trim()).filter(Boolean);
      const domain = String(req.query?.domain || '').trim().toLowerCase();
      const type = String(req.query?.type || '').trim().toLowerCase();
      const view = String(req.query?.view || 'all').trim().toLowerCase();
      const folderId = String(req.query?.folderId || 'all').trim();
      const sort = String(req.query?.sort || 'updated').trim().toLowerCase();
      const favorite = req.query?.favorite;
      const archived = req.query?.archived;
      const semantic = String(req.query?.semantic || '').trim().toLowerCase() === 'true';
      const semanticMode = ['semantic', 'hybrid'].includes(String(req.query?.semanticMode || '').trim().toLowerCase())
        ? String(req.query?.semanticMode || '').trim().toLowerCase()
        : 'hybrid';
      const rerank = String(req.query?.rerank || '').trim().toLowerCase() === 'true';
      const rerankTopK = Math.max(5, Math.min(80, Number(req.query?.rerankTopK || 36) || 36));
      const pageSize = Math.max(1, Math.min(100, Number(req.query?.pageSize || req.query?.limit || 24) || 24));
      const requestedPage = Math.max(1, Number(req.query?.page || 1) || 1);
      const db = await dbRepo.read();
      const ent = entitlementForUser(db, userId);
      if (!ent.features.advancedSearch) throw badRequest('advancedSearch feature unavailable');

      let candidates = userBookmarks(db, userId).filter((b) => !b.deletedAt);
      if (view === 'favorites') candidates = candidates.filter((b) => b.favorite);
      else if (view === 'archive') candidates = candidates.filter((b) => b.archived);
      else if (view === 'inbox') candidates = candidates.filter((b) => !b.archived);
      if (folderId && folderId !== 'all') candidates = candidates.filter((b) => String(b.folderId || 'root') === folderId);
      if (favorite === 'true') candidates = candidates.filter((b) => b.favorite);
      if (favorite === 'false') candidates = candidates.filter((b) => !b.favorite);
      if (archived === 'true') candidates = candidates.filter((b) => b.archived);
      if (archived === 'false') candidates = candidates.filter((b) => !b.archived);
      if (domain) candidates = candidates.filter((b) => String(b.url || '').toLowerCase().includes(domain));
      if (type) {
        candidates = candidates.filter((b) => {
          const ct = String(b?.metadata?.contentType || '').toLowerCase();
          if (type === 'pdf') return ct.includes('pdf') || /\.pdf([?#]|$)/i.test(String(b.url || ''));
          if (type === 'image') return ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)([?#]|$)/i.test(String(b.url || ''));
          if (type === 'video') return ct.startsWith('video/') || /youtube\.com|youtu\.be|vimeo\.com/i.test(String(b.url || ''));
          return true;
        });
      }
      if (tags.length) {
        const required = new Set(tags.map((t) => t.toLowerCase()));
        candidates = candidates.filter((b) => {
          const set = new Set((b.tags || []).map((t) => String(t).toLowerCase()));
          for (const t of required) if (!set.has(t)) return false;
          return true;
        });
      }
      let semanticMeta = {
        usedSemantic: false,
        semanticMode: semanticMode,
        semanticProvider: null,
        semanticIndexUpdated: 0,
        semanticFallbackLocal: false,
        usedAiRerank: false,
        rerankProvider: null,
        rerankTopK: 0,
        rerankAppliedCount: 0,
        rerankSummary: ''
      };

      if (q && semantic) {
        requireFeature(db, userId, 'aiSuggestions', badRequest);
        const aiConfig = getAiProviderConfig(db, userId);
        const { rowsByBookmarkId, updated, provider } = await ensureSemanticIndexRowsForBookmarks({
          dbRepo,
          userId,
          bookmarks: candidates,
          aiConfig,
          maxBatch: 20
        });
        const qEmbed = await generateTextEmbeddings({
          config: aiConfig,
          texts: [q],
          allowLocalFallback: true
        });
        const qVector = Array.isArray(qEmbed?.vectors?.[0]) ? qEmbed.vectors[0] : [];
        const qTokens = tokenize(q);
        const lexicalScore = (bookmark) => {
          const bt = bookmarkTextForRetrieval(bookmark);
          const tokens = new Set(tokenize(bt));
          if (!qTokens.length) return 0;
          let overlap = 0;
          for (const t of qTokens) if (tokens.has(t)) overlap += 1;
          return overlap / Math.max(1, qTokens.length);
        };
        candidates = candidates
          .map((b) => {
            const row = rowsByBookmarkId.get(String(b.id));
            const vector = Array.isArray(row?.vector) ? row.vector : [];
            const sem = qVector.length && vector.length ? cosineSimilarity(qVector, vector) : 0;
            const lex = lexicalScore(b);
            const score = semanticMode === 'semantic'
              ? sem
              : (sem * 0.78) + (lex * 0.22);
            return {
              ...b,
              _semanticScore: Number(score || 0),
              _semanticOnlyScore: Number(sem || 0),
              _lexicalScore: Number(lex || 0)
            };
          })
          .filter((b) => Number(b._semanticScore || 0) > -0.1);

        semanticMeta = {
          usedSemantic: true,
          semanticMode,
          semanticProvider: qEmbed?.provider || provider || null,
          semanticIndexUpdated: Number(updated || 0) || 0,
          semanticFallbackLocal: Boolean(qEmbed?.fallbackLocal)
        };
      } else if (q) {
        if (ent.features.fullTextSearch) {
          const qTokens = tokenize(q);
          const indexedByBookmark = new Map(
            (db.searchIndex || [])
              .filter((row) => String(row.userId) === userId)
              .map((row) => [String(row.bookmarkId), row])
          );
          candidates = candidates.filter((b) => {
            const row = indexedByBookmark.get(String(b.id));
            const tokens = new Set(row?.tokens || tokenize([b.title, b.url, b.note, ...(b.tags || [])].join(' ')));
            return qTokens.every((t) => tokens.has(t));
          });
        } else {
          const ql = q.toLowerCase();
          candidates = candidates.filter((b) =>
            [b.title, b.url, b.note, ...(b.tags || [])].join(' ').toLowerCase().includes(ql)
          );
        }
      }
      candidates = candidates.sort((a, b) => {
        if (semanticMeta.usedSemantic) {
          const sd = Number(b._semanticScore || 0) - Number(a._semanticScore || 0);
          if (Math.abs(sd) > 1e-9) return sd;
        }
        if (sort === 'newest') return Number(b.createdAt || 0) - Number(a.createdAt || 0);
        if (sort === 'oldest') return Number(a.createdAt || 0) - Number(b.createdAt || 0);
        if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
        return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
      });
      if (q && rerank && candidates.length > 1) {
        requireFeature(db, userId, 'aiSuggestions', badRequest);
        const aiConfig = getAiProviderConfig(db, userId);
        const folders = userFolders(db, userId);
        const pathHelper = folderPathMap(folders);
        const topK = Math.min(rerankTopK, candidates.length);
        const topCandidates = candidates.slice(0, topK);
        const rerankInput = topCandidates.map((b, idx) => ({
          bookmarkId: String(b.id),
          rank: idx + 1,
          title: String(b.title || ''),
          url: String(b.url || ''),
          host: hostOfBookmarkUrl(b.url || ''),
          folderPath: pathHelper.pathOf(b.folderId),
          tags: Array.isArray(b.tags) ? b.tags.slice(0, 10) : [],
          excerpt: String(b.note || b?.article?.excerpt || b?.metadata?.description || '').slice(0, 220),
          lexicalScore: Number(b._lexicalScore || 0),
          semanticScore: Number(b._semanticOnlyScore || b._semanticScore || 0)
        }));
        const rerankOut = await generateSearchRerankRecommendations({
          config: aiConfig,
          query: q,
          candidates: rerankInput,
          limit: topK
        });
        const byId = new Map(topCandidates.map((b) => [String(b.id), b]));
        const scoreById = new Map();
        const reasonById = new Map();
        const aiOrdered = [];
        const seen = new Set();
        for (const row of (Array.isArray(rerankOut?.items) ? rerankOut.items : [])) {
          const id = String(row.bookmarkId || '');
          if (!id || seen.has(id) || !byId.has(id)) continue;
          seen.add(id);
          const item = { ...byId.get(id) };
          item._aiRerankScore = Number(row.score || 0);
          item._aiRerankReason = String(row.reason || '');
          scoreById.set(id, item._aiRerankScore);
          reasonById.set(id, item._aiRerankReason);
          aiOrdered.push(item);
        }
        const remainderTop = topCandidates
          .filter((b) => !seen.has(String(b.id)))
          .map((b) => {
            const item = { ...b };
            item._aiRerankScore = Number(scoreById.get(String(b.id)) || 0);
            item._aiRerankReason = String(reasonById.get(String(b.id)) || '');
            return item;
          });
        candidates = aiOrdered.concat(remainderTop).concat(candidates.slice(topK));
        semanticMeta.usedAiRerank = true;
        semanticMeta.rerankProvider = rerankOut?.provider || null;
        semanticMeta.rerankTopK = topK;
        semanticMeta.rerankAppliedCount = aiOrdered.length;
        semanticMeta.rerankSummary = String(rerankOut?.summary || '').slice(0, 240);
      }
      const total = candidates.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const start = (page - 1) * pageSize;
      const items = candidates.slice(start, start + pageSize);
      res.json({
        ok: true,
        items: items.map((x) => {
          if (!semanticMeta.usedSemantic && !semanticMeta.usedAiRerank) return x;
          const copy = { ...x };
          if (semanticMeta.usedSemantic) {
            copy.semanticScore = Number(copy._semanticScore || 0);
            copy.semanticOnlyScore = Number(copy._semanticOnlyScore || 0);
          }
          if (semanticMeta.usedAiRerank) {
            copy.aiRerankScore = Number(copy._aiRerankScore || 0);
            if (copy._aiRerankReason) copy.aiRerankReason = String(copy._aiRerankReason || '');
          }
          delete copy._semanticScore;
          delete copy._semanticOnlyScore;
          delete copy._lexicalScore;
          delete copy._aiRerankScore;
          delete copy._aiRerankReason;
          return copy;
        }),
        total,
        page,
        pageSize,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        usedFullText: Boolean(q && ent.features.fullTextSearch && !semanticMeta.usedSemantic),
        usedSemantic: Boolean(semanticMeta.usedSemantic),
        semanticMode: semanticMeta.semanticMode,
        semanticProvider: semanticMeta.semanticProvider,
        semanticIndexUpdated: semanticMeta.semanticIndexUpdated,
        semanticFallbackLocal: semanticMeta.semanticFallbackLocal,
        usedAiRerank: Boolean(semanticMeta.usedAiRerank),
        rerankProvider: semanticMeta.rerankProvider,
        rerankTopK: Number(semanticMeta.rerankTopK || 0) || 0,
        rerankAppliedCount: Number(semanticMeta.rerankAppliedCount || 0) || 0,
        rerankSummary: semanticMeta.rerankSummary || ''
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/search/saved', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const items = (db.savedSearches || []).filter((s) => String(s.userId) === userId).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/search/saved', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const name = String(req.body?.name || '').trim();
      const query = req.body?.query && typeof req.body.query === 'object' ? req.body.query : {};
      if (!name) return next(badRequest('name is required'));
      let item;
      await dbRepo.update((db) => {
        db.savedSearches = Array.isArray(db.savedSearches) ? db.savedSearches : [];
        const now = Date.now();
        item = { id: `sq_${crypto.randomUUID()}`, userId, name, query, createdAt: now, updatedAt: now };
        db.savedSearches.unshift(item);
        return db;
      });
      res.status(201).json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/search/saved/:id', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const id = String(req.params.id);
      const name = typeof req.body?.name === 'undefined' ? undefined : String(req.body?.name || '').trim();
      const query = typeof req.body?.query === 'undefined'
        ? undefined
        : (req.body?.query && typeof req.body.query === 'object' ? req.body.query : null);
      if (typeof name !== 'undefined' && !name) return next(badRequest('name cannot be empty'));
      if (typeof query !== 'undefined' && !query) return next(badRequest('query must be object'));
      let item = null;
      await dbRepo.update((db) => {
        db.savedSearches = Array.isArray(db.savedSearches) ? db.savedSearches : [];
        const found = db.savedSearches.find((s) => String(s.id) === id && String(s.userId) === userId);
        if (!found) throw new Error('saved search not found');
        if (typeof name !== 'undefined') found.name = name;
        if (typeof query !== 'undefined') found.query = query;
        found.updatedAt = Date.now();
        item = found;
        return db;
      });
      res.json({ ok: true, item });
    } catch (err) {
      if (String(err?.message || '') === 'saved search not found') return next(notFound('saved search not found'));
      next(err);
    }
  });

  app.delete('/api/product/search/saved/:id', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const id = String(req.params.id);
      let removed = false;
      await dbRepo.update((db) => {
        db.savedSearches = Array.isArray(db.savedSearches) ? db.savedSearches : [];
        const before = db.savedSearches.length;
        db.savedSearches = db.savedSearches.filter((s) => !(String(s.id) === id && String(s.userId) === userId));
        removed = db.savedSearches.length !== before;
        return db;
      });
      if (!removed) return next(notFound('saved search not found'));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/dedupe/scan', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'dedupeScan', badRequest);
      const byUrl = new Map();
      for (const b of userBookmarks(db, userId).filter((x) => !x.deletedAt)) {
        const key = normalizeUrlLoose(b.url).toLowerCase();
        if (!byUrl.has(key)) byUrl.set(key, []);
        byUrl.get(key).push(b);
      }
      const groups = [...byUrl.entries()]
        .filter(([, items]) => items.length > 1)
        .map(([urlKey, items]) => ({
          key: urlKey,
          count: items.length,
          items: items.map((b) => ({ id: b.id, title: b.title, url: b.url, folderId: b.folderId, updatedAt: b.updatedAt }))
        }));
      res.json({ ok: true, groups, totalGroups: groups.length });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/dedupe/semantic-scan', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const threshold = Math.max(0.7, Math.min(0.995, Number(req.body?.threshold || 0.9) || 0.9));
      const minClusterSize = Math.max(2, Math.min(20, Number(req.body?.minClusterSize || 2) || 2));
      const limit = Math.max(20, Math.min(500, Number(req.body?.limit || 240) || 240));
      const startedAt = Date.now();
      const db = await dbRepo.read();
      requireFeature(db, userId, 'advancedSearch', badRequest);
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const aiConfig = getAiProviderConfig(db, userId);
      const folders = userFolders(db, userId);
      const pathHelper = folderPathMap(folders);
      const bookmarks = userBookmarks(db, userId)
        .filter((b) => !b.deletedAt)
        .sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) || 0) - (Number(a.updatedAt || a.createdAt || 0) || 0))
        .slice(0, limit);

      const { rowsByBookmarkId, updated, provider } = await ensureSemanticIndexRowsForBookmarks({
        dbRepo,
        userId,
        bookmarks,
        aiConfig,
        maxBatch: 20
      });

      const items = bookmarks.map((b) => {
        const row = rowsByBookmarkId.get(String(b.id)) || {};
        return {
          bookmark: b,
          id: String(b.id),
          vector: Array.isArray(row.vector) ? row.vector : [],
          textHash: String(row.textHash || ''),
          urlKey: normalizeUrlLoose(b.url || '').toLowerCase(),
          host: hostOfBookmarkUrl(b.url || '')
        };
      });

      const parent = new Map(items.map((x) => [x.id, x.id]));
      const find = (x) => {
        let p = parent.get(x) || x;
        while (p !== (parent.get(p) || p)) p = parent.get(p);
        let n = x;
        while (n !== p) {
          const nextP = parent.get(n) || n;
          parent.set(n, p);
          n = nextP;
        }
        return p;
      };
      const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(rb, ra);
      };

      const edges = [];
      const exactByUrl = new Map();
      for (const it of items) {
        if (!it.urlKey) continue;
        if (!exactByUrl.has(it.urlKey)) exactByUrl.set(it.urlKey, []);
        exactByUrl.get(it.urlKey).push(it.id);
      }
      for (const ids of exactByUrl.values()) {
        if (ids.length < 2) continue;
        for (let i = 1; i < ids.length; i += 1) {
          union(ids[0], ids[i]);
          edges.push({ a: ids[0], b: ids[i], similarity: 1, reason: 'exact_url' });
        }
      }

      for (let i = 0; i < items.length; i += 1) {
        const a = items[i];
        if (!a.vector.length) continue;
        for (let j = i + 1; j < items.length; j += 1) {
          const b = items[j];
          if (!b.vector.length) continue;
          const sim = cosineSimilarity(a.vector, b.vector);
          if (sim < threshold) continue;
          union(a.id, b.id);
          edges.push({
            a: a.id,
            b: b.id,
            similarity: Number(sim.toFixed(4)),
            reason: a.urlKey && b.urlKey && a.urlKey === b.urlKey ? 'exact_url+semantic' : 'semantic'
          });
        }
      }

      const byId = new Map(items.map((x) => [x.id, x]));
      const groupsMap = new Map();
      for (const it of items) {
        const root = find(it.id);
        if (!groupsMap.has(root)) groupsMap.set(root, []);
        groupsMap.get(root).push(it);
      }

      const edgeByCluster = new Map();
      for (const e of edges) {
        const root = find(e.a);
        if (!edgeByCluster.has(root)) edgeByCluster.set(root, []);
        edgeByCluster.get(root).push(e);
      }

      const clusters = [...groupsMap.entries()]
        .filter(([, members]) => members.length >= minClusterSize)
        .map(([root, members]) => {
          const memberIds = new Set(members.map((m) => m.id));
          const clusterEdges = (edgeByCluster.get(root) || []).filter((e) => memberIds.has(e.a) && memberIds.has(e.b));
          const maxSimilarity = clusterEdges.reduce((m, e) => Math.max(m, Number(e.similarity || 0)), 0);
          const avgSimilarity = clusterEdges.length
            ? clusterEdges.reduce((s, e) => s + (Number(e.similarity) || 0), 0) / clusterEdges.length
            : (members.length > 1 ? threshold : 0);
          const tagsCounter = new Map();
          const hostsCounter = new Map();
          for (const m of members) {
            const b = m.bookmark;
            for (const t of Array.isArray(b.tags) ? b.tags : []) {
              const key = String(t || '').trim();
              if (!key) continue;
              tagsCounter.set(key, (tagsCounter.get(key) || 0) + 1);
            }
            if (m.host) hostsCounter.set(m.host, (hostsCounter.get(m.host) || 0) + 1);
          }
          const topTags = [...tagsCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag, count]) => ({ tag, count }));
          const topHosts = [...hostsCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([host, count]) => ({ host, count }));
          const representative = [...members]
            .sort((a, b) => (Number(b.bookmark.updatedAt || b.bookmark.createdAt || 0) || 0) - (Number(a.bookmark.updatedAt || a.bookmark.createdAt || 0) || 0))[0];
          return {
            id: `semdup_${root}`,
            size: members.length,
            maxSimilarity: Number(maxSimilarity.toFixed(4)),
            avgSimilarity: Number(avgSimilarity.toFixed(4)),
            potentialDuplicates: Math.max(0, members.length - 1),
            representative: representative ? {
              bookmarkId: representative.id,
              title: String(representative.bookmark.title || ''),
              url: String(representative.bookmark.url || '')
            } : null,
            commonTags: topTags,
            representativeSources: topHosts,
            items: members
              .sort((a, b) => (Number(b.bookmark.updatedAt || b.bookmark.createdAt || 0) || 0) - (Number(a.bookmark.updatedAt || a.bookmark.createdAt || 0) || 0))
              .map((m) => ({
                id: m.bookmark.id,
                title: m.bookmark.title,
                url: m.bookmark.url,
                host: m.host,
                folderId: m.bookmark.folderId,
                folderPath: pathHelper.pathOf(m.bookmark.folderId),
                tags: Array.isArray(m.bookmark.tags) ? m.bookmark.tags.slice(0, 10) : [],
                updatedAt: m.bookmark.updatedAt,
                createdAt: m.bookmark.createdAt
              })),
            edges: clusterEdges
              .sort((a, b) => Number(b.similarity || 0) - Number(a.similarity || 0))
              .slice(0, 20)
          };
        })
        .sort((a, b) => (b.size - a.size) || (b.maxSimilarity - a.maxSimilarity));

      const now = Date.now();
      const job = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'semantic_dedupe_cluster_scan',
        status: 'succeeded',
        startedAt,
        finishedAt: now,
        config: aiConfig,
        request: { threshold, minClusterSize, limit, scanned: items.length },
        result: {
          clusters: clusters.length,
          potentialDuplicates: clusters.reduce((n, c) => n + Number(c.potentialDuplicates || 0), 0),
          provider,
          semanticIndexUpdated: Number(updated || 0) || 0
        }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(job);
        return dbWrite;
      });

      res.json({
        ok: true,
        threshold,
        minClusterSize,
        scanned: items.length,
        semanticIndexUpdated: Number(updated || 0) || 0,
        provider,
        clusters,
        totalClusters: clusters.length,
        potentialDuplicates: clusters.reduce((n, c) => n + Number(c.potentialDuplicates || 0), 0),
        job
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/digest', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const aiConfig = getAiProviderConfig(db, userId);
      const windowType = ['day', 'week', 'custom_days'].includes(String(req.body?.windowType || '').trim())
        ? String(req.body.windowType).trim()
        : 'day';
      const customDays = Math.max(1, Math.min(30, Number(req.body?.days || 7) || 7));
      const maxItems = Math.max(10, Math.min(200, Number(req.body?.maxItems || 80) || 80));
      const now = Date.now();
      const msDay = 24 * 60 * 60 * 1000;
      const days = windowType === 'week' ? 7 : (windowType === 'custom_days' ? customDays : 1);
      const startAt = now - days * msDay;
      const endAt = now;
      const folders = userFolders(db, userId);
      const pathHelper = folderPathMap(folders);
      const bookmarksAll = userBookmarks(db, userId).filter((b) => !b.deletedAt);
      const inWindow = bookmarksAll
        .filter((b) => {
          const ts = Number(b.createdAt || b.updatedAt || 0) || 0;
          return ts >= startAt && ts <= endAt;
        })
        .sort((a, b) => (Number(b.createdAt || b.updatedAt || 0) || 0) - (Number(a.createdAt || a.updatedAt || 0) || 0));
      if (!inWindow.length) throw badRequest('selected time window has no new bookmarks');
      const sample = inWindow.slice(0, maxItems).map((b) => ({ ...b, folderPath: pathHelper.pathOf(b.folderId) }));
      const tagCount = new Map();
      const hostCount = new Map();
      const folderCount = new Map();
      for (const b of inWindow) {
        for (const t of Array.isArray(b.tags) ? b.tags : []) {
          const key = String(t || '').trim();
          if (!key) continue;
          tagCount.set(key, (tagCount.get(key) || 0) + 1);
        }
        const host = hostOfBookmarkUrl(b.url || '');
        if (host) hostCount.set(host, (hostCount.get(host) || 0) + 1);
        const folderPath = pathHelper.pathOf(b.folderId) || 'root';
        folderCount.set(folderPath, (folderCount.get(folderPath) || 0) + 1);
      }
      const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count }));
      const topHosts = [...hostCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([host, count]) => ({ host, count }));
      const topFolders = [...folderCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([folderPath, count]) => ({ folderPath, count }));
      const startedAt = Date.now();
      let digestOut;
      try {
        digestOut = await generateBookmarksDigestSummary({
          config: aiConfig,
          windowLabel: windowType === 'day' ? '日报（近 24 小时）' : (windowType === 'week' ? '周报（近 7 天）' : `Digest（近 ${days} 天）`),
          range: { startAt, endAt, days, windowType },
          bookmarks: sample,
          stats: {
            bookmarkCount: inWindow.length,
            topTags,
            topHosts,
            topFolders
          }
        });
      } catch (err) {
        const failedJob = buildAiJobRecord({
          userId,
          bookmarkId: '',
          type: 'bookmarks_digest',
          status: 'failed',
          startedAt,
          finishedAt: Date.now(),
          config: aiConfig,
          error: err,
          request: { windowType, days, maxItems, inWindow: inWindow.length }
        });
        await dbRepo.update((dbWrite) => {
          dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
          dbWrite.aiSuggestionJobs.unshift(failedJob);
          return dbWrite;
        });
        err.aiJob = failedJob;
        throw err;
      }

      const digest = {
        id: `digest_${crypto.randomUUID()}`,
        userId,
        windowType,
        days,
        startAt,
        endAt,
        bookmarkCount: inWindow.length,
        sampleCount: sample.length,
        summary: String(digestOut.summary || ''),
        themes: Array.isArray(digestOut.themes) ? digestOut.themes : [],
        highlights: Array.isArray(digestOut.highlights) ? digestOut.highlights : [],
        recommendedActions: Array.isArray(digestOut.recommendedActions) ? digestOut.recommendedActions : [],
        topTags,
        topHosts,
        topFolders,
        provider: digestOut.provider || {},
        createdAt: Date.now()
      };

      let savedJob = null;
      await dbRepo.update((dbWrite) => {
        dbWrite.aiDigests = Array.isArray(dbWrite.aiDigests) ? dbWrite.aiDigests : [];
        dbWrite.aiDigests.unshift(digest);
        dbWrite.aiDigests = dbWrite.aiDigests.filter((d) => String(d.userId) === userId).slice(0, 100)
          .concat((dbWrite.aiDigests || []).filter((d) => String(d.userId) !== userId));
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        savedJob = buildAiJobRecord({
          userId,
          bookmarkId: '',
          type: 'bookmarks_digest',
          status: 'succeeded',
          startedAt,
          finishedAt: Date.now(),
          config: aiConfig,
          request: { windowType, days, maxItems, inWindow: inWindow.length, sampleCount: sample.length },
          result: {
            digestId: digest.id,
            bookmarkCount: digest.bookmarkCount,
            sampleCount: digest.sampleCount,
            themes: digest.themes,
            highlightsCount: digest.highlights.length,
            provider: digest.provider,
            rawText: digestOut.rawText || ''
          }
        });
        dbWrite.aiSuggestionJobs.unshift(savedJob);
        return dbWrite;
      });

      res.json({ ok: true, digest, job: savedJob });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/broken-links/scan', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const limit = Math.max(1, Math.min(100, Number(req.body?.limit || 20) || 20));
      let task;
      await dbRepo.update((db) => {
        requireFeature(db, userId, 'brokenLinkScan', badRequest);
        db.brokenLinkTasks = Array.isArray(db.brokenLinkTasks) ? db.brokenLinkTasks : [];
        const now = Date.now();
        const items = userBookmarks(db, userId).filter((b) => !b.deletedAt).slice(0, limit);
        const results = items.map((b) => {
          const url = String(b.url || '');
          let status = 'unknown';
          if (!/^https?:\/\//i.test(url)) status = 'invalid';
          else if (/localhost|127\.0\.0\.1/i.test(url)) status = 'unreachable';
          else status = 'ok';
          b.linkHealth = { status, checkedAt: now };
          return { bookmarkId: b.id, url: b.url, status };
        });
        task = {
          id: `blt_${crypto.randomUUID()}`,
          userId,
          status: 'succeeded',
          createdAt: now,
          finishedAt: now,
          results
        };
        db.brokenLinkTasks.unshift(task);
        if (db.brokenLinkTasks.length > 300) db.brokenLinkTasks = db.brokenLinkTasks.slice(0, 300);
        return db;
      });
      res.status(202).json({ ok: true, task });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/broken-links/tasks', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const items = (db.brokenLinkTasks || []).filter((t) => String(t.userId) === userId).slice(0, 50);
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/backups', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      let backup = null;
      await dbRepo.update(async (db) => {
        requireFeature(db, userId, 'backups', badRequest);
        const now = Date.now();
        const snapshot = {
          folders: userFolders(db, userId),
          bookmarks: userBookmarks(db, userId),
          pluginConfigs: Object.fromEntries(Object.entries(db.pluginConfigs || {}).filter(([k]) => k.includes(`u:${userId}|`))),
          pluginState: Object.fromEntries(Object.entries(db.pluginState || {}).filter(([k]) => k.includes(`u:${userId}|`))),
          savedSearches: (db.savedSearches || []).filter((x) => String(x.userId) === userId)
        };
        let file = null;
        if (objectStorage) {
          file = await objectStorage.putText('backups', `user-${userId}-${now}.json`, JSON.stringify(snapshot, null, 2), {
            contentType: 'application/json; charset=utf-8'
          });
        }
        db.backups = Array.isArray(db.backups) ? db.backups : [];
        backup = {
          id: `bkp_${crypto.randomUUID()}`,
          userId,
          createdAt: now,
          status: 'ready',
          file,
          summary: {
            folders: snapshot.folders.length,
            bookmarks: snapshot.bookmarks.length,
            savedSearches: snapshot.savedSearches.length
          },
          snapshot
        };
        db.backups.unshift(backup);
        if (db.backups.length > 200) db.backups = db.backups.slice(0, 200);
        return db;
      });
      res.status(201).json({ ok: true, backup });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/backups', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const items = (db.backups || [])
        .filter((b) => String(b.userId) === userId)
        .map((b) => ({ ...b, snapshot: undefined }))
        .slice(0, 50);
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/backups/:id/restore', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const backupId = String(req.params.id);
      let restored = null;
      await dbRepo.update((db) => {
        requireFeature(db, userId, 'backups', badRequest);
        const backup = (db.backups || []).find((b) => String(b.id) === backupId && String(b.userId) === userId);
        if (!backup || !backup.snapshot) throw new Error('backup not found');
        db.folders = (db.folders || []).filter((f) => !hasOwner(f, userId)).concat((backup.snapshot.folders || []).map((f) => ({ ...f, userId })));
        db.bookmarks = (db.bookmarks || []).filter((b) => !hasOwner(b, userId)).concat((backup.snapshot.bookmarks || []).map((b) => ({ ...b, userId })));
        db.savedSearches = (db.savedSearches || []).filter((s) => String(s.userId) !== userId).concat((backup.snapshot.savedSearches || []).map((s) => ({ ...s, userId })));
        restored = { id: backup.id, restoredAt: Date.now(), summary: backup.summary || {} };
        return db;
      });
      res.json({ ok: true, restored });
    } catch (err) {
      if (String(err?.message || '') === 'backup not found') return next(notFound('backup not found'));
      next(err);
    }
  });

  app.get('/api/product/ai/config', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      res.json({
        ok: true,
        config: publicAiProviderConfig(getAiProviderConfig(db, userId))
      });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/ai/config', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      let saved = null;
      await dbRepo.update((db) => {
        saved = setAiProviderConfig(db, userId, req.body || {});
        return db;
      });
      res.json({ ok: true, config: publicAiProviderConfig(saved) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/test', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const current = getAiProviderConfig(db, userId);
      const mergedInput = req.body && typeof req.body === 'object' && Object.keys(req.body).length
        ? {
            ...current,
            ...req.body,
            openaiCompatible: {
              ...(current.openaiCompatible || {}),
              ...((req.body && req.body.openaiCompatible) || {})
            },
            cloudflareAI: {
              ...(current.cloudflareAI || {}),
              ...((req.body && req.body.cloudflareAI) || {})
            },
            tagging: {
              ...(current.tagging || {}),
              ...((req.body && req.body.tagging) || {})
            }
          }
        : current;
      const out = await testAiProviderConnection(mergedInput);
      res.json({ ok: true, test: out });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/rules/config', async (req, res, next) => {
    try {
      if (!aiRules) return next(badRequest('ai rule engine unavailable'));
      const userId = userIdOf(req);
      const config = await aiRules.getConfig({ userId });
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/ai/rules/config', async (req, res, next) => {
    try {
      if (!aiRules) return next(badRequest('ai rule engine unavailable'));
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const config = await aiRules.updateConfig({ userId, patch: req.body || {} });
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/rules/run', async (req, res, next) => {
    try {
      if (!aiRules) return next(badRequest('ai rule engine unavailable'));
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const bookmarkId = String(req.body?.bookmarkId || '').trim();
      if (!bookmarkId) return next(badRequest('bookmarkId is required'));
      const trigger = String(req.body?.trigger || 'manual').trim() || 'manual';
      const out = await aiRules.runManual({
        userId,
        bookmarkId,
        trigger,
        payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {}
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.get('/api/product/ai/rules/runs', async (req, res, next) => {
    try {
      if (!aiRules) return next(badRequest('ai rule engine unavailable'));
      const userId = userIdOf(req);
      const items = await aiRules.listRuns({ userId, limit: req.query?.limit });
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  async function runAiTagJobForUser({
    userId,
    bookmarkId,
    applyTags = false,
    explicitApplyMode = '',
    routeMode = 'suggest'
  } = {}) {
    const targetUserId = String(userId || '');
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, targetUserId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, targetUserId);
    const bookmark = userBookmarksWithDeleted(db, targetUserId).find((b) => String(b.id) === String(bookmarkId) && !b.deletedAt);
    if (!bookmark) throw new Error('bookmark not found');

    const applyMode = ['merge', 'replace'].includes(String(explicitApplyMode || ''))
      ? String(explicitApplyMode)
      : String(aiConfig?.tagging?.applyMode || 'merge');

    let suggestion;
    try {
      suggestion = await generateBookmarkTagSuggestions({
        config: aiConfig,
        bookmark
      });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId: targetUserId,
        bookmarkId,
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        apply: { applyTags, applyMode }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    let savedJob = null;
    let updatedBookmark = null;
    await dbRepo.update((dbWrite) => {
      const bm = (dbWrite.bookmarks || []).find((b) => String(b.id) === String(bookmarkId) && hasOwner(b, targetUserId) && !b.deletedAt);
      if (!bm) throw new Error('bookmark not found');
      const nextTags = mergeBookmarkTags(bm.tags || [], suggestion.suggestedTags || [], applyMode);
      const now = Date.now();
      bm.aiSuggestions = {
        suggestedTags: suggestion.suggestedTags || [],
        summary: suggestion.summary || '',
        provider: suggestion.provider || {},
        generatedAt: now
      };
      if (applyTags) {
        bm.tags = nextTags;
      }
      bm.updatedAt = now;
      updatedBookmark = {
        id: bm.id,
        tags: Array.isArray(bm.tags) ? [...bm.tags] : [],
        aiSuggestions: bm.aiSuggestions,
        updatedAt: bm.updatedAt
      };

      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId: targetUserId,
        bookmarkId,
        status: 'succeeded',
        startedAt,
        finishedAt: now,
        config: aiConfig,
        result: {
          routeMode,
          suggestedTags: suggestion.suggestedTags || [],
          summary: suggestion.summary || '',
          provider: suggestion.provider || {},
          rawText: suggestion.rawText || '',
          applied: Boolean(applyTags),
          applyMode,
          finalTags: applyTags ? updatedBookmark.tags : undefined
        },
        apply: { applyTags, applyMode }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      bookmark: updatedBookmark,
      applied: Boolean(applyTags),
      applyMode
    };
  }

  async function runAiTagJob(req, options = {}) {
    return runAiTagJobForUser({
      userId: userIdOf(req),
      ...options
    });
  }

  async function runAiTitleCleanJob(req, { bookmarkId, apply = true } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const bookmark = userBookmarksWithDeleted(db, userId).find((b) => String(b.id) === String(bookmarkId) && !b.deletedAt);
    if (!bookmark) throw new Error('bookmark not found');

    let suggestion;
    try {
      suggestion = await generateBookmarkTitleSuggestion({ config: aiConfig, bookmark });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_title_clean',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: { apply: Boolean(apply) }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    let savedJob = null;
    let updatedBookmark = null;
    await dbRepo.update((dbWrite) => {
      const bm = (dbWrite.bookmarks || []).find((b) => String(b.id) === String(bookmarkId) && hasOwner(b, userId) && !b.deletedAt);
      if (!bm) throw new Error('bookmark not found');
      const originalTitle = String(bm.title || '');
      const suggestedTitle = String(suggestion.cleanTitle || '').trim() || originalTitle;
      const shouldApply = Boolean(apply) && suggestedTitle && suggestedTitle !== originalTitle;
      const now = Date.now();
      bm.aiSuggestions = {
        ...(bm.aiSuggestions && typeof bm.aiSuggestions === 'object' ? bm.aiSuggestions : {}),
        titleSuggestion: suggestedTitle,
        titleReason: String(suggestion.reason || ''),
        titleGeneratedAt: now,
        provider: suggestion.provider || {}
      };
      if (shouldApply) bm.title = suggestedTitle;
      bm.updatedAt = now;
      updatedBookmark = {
        id: bm.id,
        title: String(bm.title || ''),
        aiSuggestions: bm.aiSuggestions,
        updatedAt: bm.updatedAt
      };

      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_title_clean',
        status: 'succeeded',
        startedAt,
        finishedAt: now,
        config: aiConfig,
        request: { apply: Boolean(apply) },
        result: {
          originalTitle,
          suggestedTitle,
          reason: String(suggestion.reason || ''),
          applied: shouldApply,
          provider: suggestion.provider || {},
          rawText: suggestion.rawText || '',
          finalTitle: String(bm.title || '')
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      bookmark: updatedBookmark,
      applied: Boolean(savedJob?.result?.applied),
      suggestedTitle: String(savedJob?.result?.suggestedTitle || '')
    };
  }

  async function runAiSummaryJob(req, { bookmarkId, apply = true, noteMode = 'if_empty' } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const bookmark = userBookmarksWithDeleted(db, userId).find((b) => String(b.id) === String(bookmarkId) && !b.deletedAt);
    if (!bookmark) throw new Error('bookmark not found');
    const normalizedNoteMode = ['replace', 'if_empty'].includes(String(noteMode || '')) ? String(noteMode) : 'if_empty';

    let suggestion;
    try {
      suggestion = await generateBookmarkSummarySuggestion({ config: aiConfig, bookmark });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_summary_generate',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: { apply: Boolean(apply), noteMode: normalizedNoteMode }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    let savedJob = null;
    let updatedBookmark = null;
    await dbRepo.update((dbWrite) => {
      const bm = (dbWrite.bookmarks || []).find((b) => String(b.id) === String(bookmarkId) && hasOwner(b, userId) && !b.deletedAt);
      if (!bm) throw new Error('bookmark not found');
      const originalNote = String(bm.note || '');
      const suggestedSummary = String(suggestion.summary || '').trim();
      const blockedByExistingNote = Boolean(apply) && normalizedNoteMode === 'if_empty' && String(originalNote || '').trim();
      const shouldApply = Boolean(apply) && !blockedByExistingNote && Boolean(suggestedSummary);
      const now = Date.now();
      bm.aiSuggestions = {
        ...(bm.aiSuggestions && typeof bm.aiSuggestions === 'object' ? bm.aiSuggestions : {}),
        summarySuggestion: suggestedSummary,
        summaryGeneratedAt: now,
        provider: suggestion.provider || {}
      };
      if (shouldApply) bm.note = suggestedSummary;
      bm.updatedAt = now;
      updatedBookmark = {
        id: bm.id,
        note: String(bm.note || ''),
        aiSuggestions: bm.aiSuggestions,
        updatedAt: bm.updatedAt
      };

      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_summary_generate',
        status: 'succeeded',
        startedAt,
        finishedAt: now,
        config: aiConfig,
        request: { apply: Boolean(apply), noteMode: normalizedNoteMode },
        result: {
          suggestedSummary,
          applied: shouldApply,
          noteMode: normalizedNoteMode,
          blockedReason: blockedByExistingNote ? 'note_exists' : '',
          originalNote,
          finalNote: String(bm.note || ''),
          provider: suggestion.provider || {},
          rawText: suggestion.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      bookmark: updatedBookmark,
      applied: Boolean(savedJob?.result?.applied),
      suggestedSummary: String(savedJob?.result?.suggestedSummary || '')
    };
  }

  async function runAiReaderSummaryJob(req, { bookmarkId, apply = true } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const bookmark = userBookmarksWithDeleted(db, userId).find((b) => String(b.id) === String(bookmarkId) && !b.deletedAt);
    if (!bookmark) throw new Error('bookmark not found');
    if (String(bookmark?.article?.status || '') !== 'success' || !String(bookmark?.article?.textContent || '').trim()) {
      throw badRequest('article content not available; extract article first');
    }

    let summaryOut;
    try {
      summaryOut = await generateBookmarkReaderSummary({ config: aiConfig, bookmark });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_reader_summary',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: { apply: Boolean(apply) }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    let savedJob = null;
    let updatedBookmark = null;
    await dbRepo.update((dbWrite) => {
      const bm = (dbWrite.bookmarks || []).find((b) => String(b.id) === String(bookmarkId) && hasOwner(b, userId) && !b.deletedAt);
      if (!bm) throw new Error('bookmark not found');
      const now = Date.now();
      const readerSummary = {
        shortSummary: String(summaryOut.shortSummary || ''),
        keyPoints: Array.isArray(summaryOut.keyPoints) ? summaryOut.keyPoints.map((x) => String(x || '')).filter(Boolean).slice(0, 6) : [],
        whySave: String(summaryOut.whySave || ''),
        generatedAt: now,
        provider: summaryOut.provider || {}
      };
      bm.aiSuggestions = {
        ...(bm.aiSuggestions && typeof bm.aiSuggestions === 'object' ? bm.aiSuggestions : {}),
        readerSummary
      };
      if (apply) {
        bm.aiSuggestions.readerSummaryGeneratedAt = now;
      }
      bm.updatedAt = now;
      updatedBookmark = {
        id: bm.id,
        aiSuggestions: bm.aiSuggestions,
        updatedAt: bm.updatedAt
      };

      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_reader_summary',
        status: 'succeeded',
        startedAt,
        finishedAt: now,
        config: aiConfig,
        request: { apply: Boolean(apply) },
        result: {
          readerSummary,
          applied: Boolean(apply),
          provider: summaryOut.provider || {},
          rawText: summaryOut.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      bookmark: updatedBookmark,
      readerSummary: summaryOut ? {
        shortSummary: String(summaryOut.shortSummary || ''),
        keyPoints: Array.isArray(summaryOut.keyPoints) ? summaryOut.keyPoints : [],
        whySave: String(summaryOut.whySave || '')
      } : null,
      applied: Boolean(apply)
    };
  }

  async function runAiHighlightCandidatesJob(req, { bookmarkId } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const bookmark = userBookmarksWithDeleted(db, userId).find((b) => String(b.id) === String(bookmarkId) && !b.deletedAt);
    if (!bookmark) throw new Error('bookmark not found');
    if (String(bookmark?.article?.status || '') !== 'success' || !String(bookmark?.article?.textContent || '').trim()) {
      throw badRequest('article content not available; extract article first');
    }

    let suggestOut;
    try {
      suggestOut = await generateBookmarkHighlightCandidates({ config: aiConfig, bookmark });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_highlight_candidates',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: { mode: 'suggest' }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    let savedJob = null;
    let updatedBookmark = null;
    await dbRepo.update((dbWrite) => {
      const bm = (dbWrite.bookmarks || []).find((b) => String(b.id) === String(bookmarkId) && hasOwner(b, userId) && !b.deletedAt);
      if (!bm) throw new Error('bookmark not found');
      const now = Date.now();
      const highlightCandidates = {
        items: Array.isArray(suggestOut.items) ? suggestOut.items.map((x) => ({
          quote: String(x.quote || ''),
          reason: String(x.reason || ''),
          score: Math.max(0, Math.min(1, Number(x.score) || 0))
        })) : [],
        summary: String(suggestOut.summary || ''),
        generatedAt: now,
        provider: suggestOut.provider || {}
      };
      bm.aiSuggestions = {
        ...(bm.aiSuggestions && typeof bm.aiSuggestions === 'object' ? bm.aiSuggestions : {}),
        highlightCandidates
      };
      bm.updatedAt = now;
      updatedBookmark = {
        id: bm.id,
        aiSuggestions: bm.aiSuggestions,
        updatedAt: bm.updatedAt
      };

      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_highlight_candidates',
        status: 'succeeded',
        startedAt,
        finishedAt: now,
        config: aiConfig,
        request: { mode: 'suggest' },
        result: {
          itemCount: highlightCandidates.items.length,
          summary: highlightCandidates.summary,
          provider: suggestOut.provider || {},
          rawText: suggestOut.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      bookmark: updatedBookmark,
      candidates: Array.isArray(suggestOut.items) ? suggestOut.items : [],
      summary: String(suggestOut.summary || '')
    };
  }

  async function runAiHighlightDigestJob(req, { bookmarkId, apply = true } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const bookmark = userBookmarksWithDeleted(db, userId).find((b) => String(b.id) === String(bookmarkId) && !b.deletedAt);
    if (!bookmark) throw new Error('bookmark not found');
    const highlights = Array.isArray(bookmark?.highlights) ? bookmark.highlights : [];
    if (!highlights.length) {
      throw badRequest('highlight content not available; create highlights first');
    }

    let digestOut;
    try {
      digestOut = await generateBookmarkHighlightDigest({ config: aiConfig, bookmark });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_highlight_digest',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: { apply: Boolean(apply) }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    let savedJob = null;
    let updatedBookmark = null;
    await dbRepo.update((dbWrite) => {
      const bm = (dbWrite.bookmarks || []).find((b) => String(b.id) === String(bookmarkId) && hasOwner(b, userId) && !b.deletedAt);
      if (!bm) throw new Error('bookmark not found');
      const now = Date.now();
      const highlightDigest = {
        summary: String(digestOut.summary || ''),
        themes: Array.isArray(digestOut.themes) ? digestOut.themes.map((x) => String(x || '')).filter(Boolean).slice(0, 5) : [],
        keyInsights: Array.isArray(digestOut.keyInsights) ? digestOut.keyInsights.map((x) => String(x || '')).filter(Boolean).slice(0, 6) : [],
        actionItems: Array.isArray(digestOut.actionItems) ? digestOut.actionItems.map((x) => String(x || '')).filter(Boolean).slice(0, 4) : [],
        openQuestions: Array.isArray(digestOut.openQuestions) ? digestOut.openQuestions.map((x) => String(x || '')).filter(Boolean).slice(0, 4) : [],
        generatedAt: now,
        provider: digestOut.provider || {}
      };
      bm.aiSuggestions = {
        ...(bm.aiSuggestions && typeof bm.aiSuggestions === 'object' ? bm.aiSuggestions : {}),
        highlightDigest
      };
      if (apply) {
        bm.aiSuggestions.highlightDigestGeneratedAt = now;
      }
      bm.updatedAt = now;
      updatedBookmark = {
        id: bm.id,
        aiSuggestions: bm.aiSuggestions,
        updatedAt: bm.updatedAt
      };

      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_highlight_digest',
        status: 'succeeded',
        startedAt,
        finishedAt: now,
        config: aiConfig,
        request: { apply: Boolean(apply), highlightCount: highlights.length },
        result: {
          summary: highlightDigest.summary,
          themes: highlightDigest.themes,
          keyInsightsCount: highlightDigest.keyInsights.length,
          actionItemsCount: highlightDigest.actionItems.length,
          openQuestionsCount: highlightDigest.openQuestions.length,
          provider: digestOut.provider || {},
          rawText: digestOut.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      bookmark: updatedBookmark,
      highlightDigest: {
        summary: String(digestOut.summary || ''),
        themes: Array.isArray(digestOut.themes) ? digestOut.themes : [],
        keyInsights: Array.isArray(digestOut.keyInsights) ? digestOut.keyInsights : [],
        actionItems: Array.isArray(digestOut.actionItems) ? digestOut.actionItems : [],
        openQuestions: Array.isArray(digestOut.openQuestions) ? digestOut.openQuestions : []
      },
      applied: Boolean(apply)
    };
  }

  async function runAiFolderKnowledgeSummaryJob(req, { folderId, apply = true } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const folders = userFolders(db, userId).filter((f) => String(f.id || '') !== 'root');
    const targetFolder = folders.find((f) => String(f.id) === String(folderId));
    if (!targetFolder) throw new Error('folder not found');

    const descendantIds = folderDescendantIdSet(folders, targetFolder.id);
    const bookmarks = userBookmarks(db, userId)
      .filter((b) => !b.deletedAt && descendantIds.has(String(b.folderId || 'root')));
    if (!bookmarks.length) throw badRequest('selected folder has no bookmarks');

    const folderPaths = folderPathMap(folders);
    const folderPath = folderPaths.pathOf(targetFolder.id) || String(targetFolder.name || '');
    const tagCount = new Map();
    const hostCount = new Map();
    for (const b of bookmarks) {
      for (const t of Array.isArray(b.tags) ? b.tags : []) {
        const key = String(t || '').trim();
        if (!key) continue;
        tagCount.set(key, (tagCount.get(key) || 0) + 1);
      }
      const host = hostOfBookmarkUrl(b.url || '');
      if (host) hostCount.set(host, (hostCount.get(host) || 0) + 1);
    }
    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count }));
    const topHosts = [...hostCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([host, count]) => ({ host, count }));
    const sampleBookmarks = [...bookmarks]
      .sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) || 0) - (Number(a.updatedAt || a.createdAt || 0) || 0))
      .slice(0, 80);

    let summaryOut;
    try {
      summaryOut = await generateFolderKnowledgeSummary({
        config: aiConfig,
        folder: targetFolder,
        folderPath,
        bookmarks: sampleBookmarks,
        stats: {
          bookmarkCount: bookmarks.length,
          descendantFolderCount: Math.max(0, descendantIds.size - 1),
          topTags,
          topHosts
        }
      });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'folder_knowledge_summary',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: { folderId: String(folderId), apply: Boolean(apply), bookmarkCount: bookmarks.length }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    let savedJob = null;
    let updatedFolder = null;
    await dbRepo.update((dbWrite) => {
      const folder = (dbWrite.folders || []).find((f) => hasOwner(f, userId) && String(f.id) === String(folderId));
      if (!folder) throw new Error('folder not found');
      const now = Date.now();
      const collectionSummary = {
        summary: String(summaryOut.summary || ''),
        themes: Array.isArray(summaryOut.themes) ? summaryOut.themes.map((x) => String(x || '')).filter(Boolean).slice(0, 6) : [],
        commonTags: Array.isArray(summaryOut.commonTags) ? summaryOut.commonTags.map((x) => String(x || '')).filter(Boolean).slice(0, 10) : [],
        representativeSources: Array.isArray(summaryOut.representativeSources) ? summaryOut.representativeSources.map((x) => String(x || '')).filter(Boolean).slice(0, 10) : [],
        notableBookmarks: Array.isArray(summaryOut.notableBookmarks) ? summaryOut.notableBookmarks.map((x) => ({
          bookmarkId: String(x?.bookmarkId || ''),
          title: String(x?.title || ''),
          reason: String(x?.reason || '')
        })).filter((x) => x.bookmarkId) : [],
        folderPath,
        bookmarkCount: bookmarks.length,
        descendantFolderCount: Math.max(0, descendantIds.size - 1),
        topTags,
        topHosts,
        generatedAt: now,
        provider: summaryOut.provider || {}
      };
      folder.aiSuggestions = {
        ...(folder.aiSuggestions && typeof folder.aiSuggestions === 'object' ? folder.aiSuggestions : {}),
        collectionSummary
      };
      if (apply) folder.aiSuggestions.collectionSummaryGeneratedAt = now;
      folder.updatedAt = now;
      updatedFolder = {
        id: folder.id,
        name: folder.name,
        aiSuggestions: folder.aiSuggestions,
        updatedAt: folder.updatedAt
      };

      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'folder_knowledge_summary',
        status: 'succeeded',
        startedAt,
        finishedAt: now,
        config: aiConfig,
        request: { folderId: String(folderId), apply: Boolean(apply), bookmarkCount: bookmarks.length, sampleCount: sampleBookmarks.length },
        result: {
          folderId: String(folderId),
          folderPath,
          bookmarkCount: bookmarks.length,
          summary: collectionSummary.summary,
          themes: collectionSummary.themes,
          notableBookmarksCount: collectionSummary.notableBookmarks.length,
          provider: summaryOut.provider || {},
          rawText: summaryOut.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      folder: updatedFolder,
      collectionSummary: updatedFolder?.aiSuggestions?.collectionSummary || null,
      applied: Boolean(apply)
    };
  }

  async function runAiTagStandardizeSuggestJob(req, { apply = false, suggestions: inputSuggestions = null } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const bookmarks = userBookmarks(db, userId).filter((b) => !b.deletedAt);
    const tags = tagsSummaryForBookmarks(bookmarks);
    if (!tags.length) throw badRequest('no tags available');

    let suggestionOut = null;
    let appliedResult = null;

    if (inputSuggestions && Array.isArray(inputSuggestions)) {
      suggestionOut = {
        suggestions: inputSuggestions,
        provider: { providerType: 'local', model: 'reuse', transport: 'replay' },
        rawText: '',
        rawResponseMeta: {}
      };
    } else {
      try {
        suggestionOut = await generateTagNormalizationSuggestions({ config: aiConfig, tags });
      } catch (err) {
        const failedJob = buildAiJobRecord({
          userId,
          bookmarkId: '',
          type: 'tag_standardization_suggest',
          status: 'failed',
          startedAt,
          finishedAt: Date.now(),
          config: aiConfig,
          error: err,
          request: { apply: Boolean(apply), tagCount: tags.length }
        });
        await dbRepo.update((dbWrite) => {
          dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
          dbWrite.aiSuggestionJobs.unshift(failedJob);
          return dbWrite;
        });
        err.aiJob = failedJob;
        throw err;
      }
    }

    if (apply && Array.isArray(suggestionOut?.suggestions) && suggestionOut.suggestions.length) {
      await dbRepo.update((dbWrite) => {
        const userOwned = (dbWrite.bookmarks || []).filter((b) => hasOwner(b, userId));
        appliedResult = mergeTagSuggestionsInBookmarks(userOwned, suggestionOut.suggestions || []);
        return dbWrite;
      });
    }

    let savedJob = null;
    await dbRepo.update((dbWrite) => {
      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'tag_standardization_suggest',
        status: 'succeeded',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        request: { apply: Boolean(apply), tagCount: tags.length },
        result: {
          suggestionCount: Array.isArray(suggestionOut?.suggestions) ? suggestionOut.suggestions.length : 0,
          suggestions: Array.isArray(suggestionOut?.suggestions) ? suggestionOut.suggestions.slice(0, 50) : [],
          applied: Boolean(apply),
          applyResult: appliedResult || null,
          provider: suggestionOut?.provider || {},
          rawText: suggestionOut?.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      suggestions: Array.isArray(suggestionOut?.suggestions) ? suggestionOut.suggestions : [],
      applied: Boolean(apply),
      applyResult: appliedResult
    };
  }

  async function runAiTagLocalizationJob(req, { apply = false, suggestions: inputSuggestions = null } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const bookmarks = userBookmarks(db, userId).filter((b) => !b.deletedAt);
    const tags = tagsSummaryForBookmarks(bookmarks);
    if (!tags.length) throw badRequest('no tags available');

    let suggestionOut = null;
    let appliedResult = null;

    if (inputSuggestions && Array.isArray(inputSuggestions)) {
      suggestionOut = {
        suggestions: inputSuggestions,
        provider: { providerType: 'local', model: 'reuse', transport: 'replay' },
        rawText: '',
        rawResponseMeta: {}
      };
    } else {
      try {
        suggestionOut = await generateTagLocalizationSuggestions({ config: aiConfig, tags });
      } catch (err) {
        const failedJob = buildAiJobRecord({
          userId,
          bookmarkId: '',
          type: 'tag_localization_suggest',
          status: 'failed',
          startedAt,
          finishedAt: Date.now(),
          config: aiConfig,
          error: err,
          request: { apply: Boolean(apply), tagCount: tags.length, preferChinese: Boolean(aiConfig?.tagging?.preferChinese) }
        });
        await dbRepo.update((dbWrite) => {
          dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
          dbWrite.aiSuggestionJobs.unshift(failedJob);
          return dbWrite;
        });
        err.aiJob = failedJob;
        throw err;
      }
    }

    if (apply && Array.isArray(suggestionOut?.suggestions) && suggestionOut.suggestions.length) {
      await dbRepo.update((dbWrite) => {
        const userOwned = (dbWrite.bookmarks || []).filter((b) => hasOwner(b, userId));
        appliedResult = mergeTagSuggestionsInBookmarks(userOwned, suggestionOut.suggestions || []);
        return dbWrite;
      });
    }

    let savedJob = null;
    await dbRepo.update((dbWrite) => {
      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'tag_localization_suggest',
        status: 'succeeded',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        request: { apply: Boolean(apply), tagCount: tags.length, preferChinese: Boolean(aiConfig?.tagging?.preferChinese) },
        result: {
          suggestionCount: Array.isArray(suggestionOut?.suggestions) ? suggestionOut.suggestions.length : 0,
          suggestions: Array.isArray(suggestionOut?.suggestions) ? suggestionOut.suggestions.slice(0, 50) : [],
          applied: Boolean(apply),
          applyResult: appliedResult || null,
          provider: suggestionOut?.provider || {},
          rawText: suggestionOut?.rawText || '',
          strategy: { preferChinese: Boolean(aiConfig?.tagging?.preferChinese) }
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      suggestions: Array.isArray(suggestionOut?.suggestions) ? suggestionOut.suggestions : [],
      applied: Boolean(apply),
      applyResult: appliedResult,
      strategy: { preferChinese: Boolean(aiConfig?.tagging?.preferChinese) }
    };
  }

  async function runAiSearchFilterParseJob(req, { text = '', current = {} } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const queryText = String(text || '').trim();
    if (!queryText) throw badRequest('text is required');

    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    requireFeature(db, userId, 'advancedSearch', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);

    const bookmarks = userBookmarks(db, userId).filter((b) => !b.deletedAt);
    const tags = tagsSummaryForBookmarks(bookmarks);
    const folders = userFolders(db, userId)
      .filter((f) => String(f.id) !== 'root')
      .map((f) => ({ id: String(f.id), name: String(f.name || ''), parentId: String(f.parentId || '') }));
    const pathHelper = folderPathMap(folders);
    const folderCandidates = folders.map((f) => ({ id: f.id, name: f.name, path: pathHelper.pathOf(f.id) }));

    let suggestion;
    try {
      suggestion = await generateSearchFilterSuggestion({
        config: aiConfig,
        text: queryText,
        folders: folderCandidates,
        tags,
        current
      });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'search_filter_parse',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: { text: queryText, current }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    let savedJob = null;
    await dbRepo.update((dbWrite) => {
      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'search_filter_parse',
        status: 'succeeded',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        request: { text: queryText, current },
        result: {
          query: suggestion.query || {},
          reason: suggestion.reason || '',
          unsupported: suggestion.unsupported || [],
          confidence: suggestion.confidence || 0,
          provider: suggestion.provider || {},
          rawText: suggestion.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      query: suggestion.query || {},
      reason: suggestion.reason || '',
      unsupported: suggestion.unsupported || [],
      confidence: suggestion.confidence || 0
    };
  }

  async function runAiRelatedBookmarksJob(req, { bookmarkId, limit = 8 } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const targetId = String(bookmarkId || '').trim();
    if (!targetId) throw badRequest('bookmarkId is required');

    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);

    const all = userBookmarks(db, userId).filter((b) => !b.deletedAt);
    const target = all.find((b) => String(b.id) === targetId);
    if (!target) throw new Error('bookmark not found');

    const targetTokens = new Set(tokenize([
      target.title,
      target.note,
      ...(Array.isArray(target.tags) ? target.tags : []),
      target.article?.excerpt,
      target.metadata?.description,
      hostOfBookmarkUrl(target.url)
    ].join(' ')));
    const targetHost = hostOfBookmarkUrl(target.url);
    const targetFolderId = String(target.folderId || 'root');

    const folders = userFolders(db, userId).filter((f) => String(f.id) !== 'root');
    const pathHelper = folderPathMap(folders);

    const scored = all
      .filter((b) => String(b.id) !== targetId)
      .map((b) => {
        const text = [
          b.title,
          b.note,
          ...(Array.isArray(b.tags) ? b.tags : []),
          b.article?.excerpt,
          b.metadata?.description,
          hostOfBookmarkUrl(b.url)
        ].join(' ');
        const tokens = new Set(tokenize(text));
        let overlap = 0;
        for (const t of targetTokens) if (tokens.has(t)) overlap += 1;
        const sameHost = targetHost && hostOfBookmarkUrl(b.url) === targetHost ? 1 : 0;
        const sameFolder = String(b.folderId || 'root') === targetFolderId ? 1 : 0;
        const tagOverlap = (() => {
          const a = new Set((target.tags || []).map((x) => String(x).toLowerCase()));
          let n = 0;
          for (const t of (b.tags || [])) if (a.has(String(t).toLowerCase())) n += 1;
          return n;
        })();
        const recency = Math.max(0, Number(b.updatedAt || b.createdAt || 0));
        const score = overlap * 3 + tagOverlap * 4 + sameHost * 2 + sameFolder * 1;
        return { bookmark: b, score, recency };
      })
      .sort((a, b) => b.score - a.score || b.recency - a.recency)
      .slice(0, 80);

    const candidates = scored.map(({ bookmark: b, score }) => ({
      bookmarkId: String(b.id),
      title: String(b.title || ''),
      url: String(b.url || ''),
      host: hostOfBookmarkUrl(b.url),
      folderId: String(b.folderId || 'root'),
      folderPath: pathHelper.pathOf(b.folderId),
      tags: Array.isArray(b.tags) ? b.tags.slice(0, 12) : [],
      excerpt: String(b.article?.excerpt || b.metadata?.description || b.note || '').slice(0, 200),
      heuristicScore: score
    }));

    if (!candidates.length) {
      return { job: null, items: [], summary: '没有可用于推荐的候选书签', confidence: 0 };
    }

    let suggestion;
    try {
      suggestion = await generateRelatedBookmarksRecommendations({
        config: aiConfig,
        bookmark: target,
        candidates,
        limit: Math.max(1, Math.min(12, Number(limit) || 8))
      });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId: targetId,
        type: 'related_bookmarks_recommend',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: { limit: Math.max(1, Math.min(12, Number(limit) || 8)) }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    const candidateMap = new Map(candidates.map((c) => [String(c.bookmarkId), c]));
    const bookmarkMap = new Map(all.map((b) => [String(b.id), b]));
    const items = (Array.isArray(suggestion?.items) ? suggestion.items : [])
      .map((r) => {
        const bid = String(r.bookmarkId || '');
        const raw = bookmarkMap.get(bid);
        const c = candidateMap.get(bid);
        if (!raw || !c) return null;
        return {
          id: String(raw.id),
          title: String(raw.title || ''),
          url: String(raw.url || ''),
          folderId: String(raw.folderId || 'root'),
          folderPath: c.folderPath || '',
          tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 8) : [],
          host: c.host || '',
          excerpt: String(raw.article?.excerpt || raw.metadata?.description || raw.note || '').slice(0, 180),
          reason: String(r.reason || ''),
          score: Math.max(0, Math.min(1, Number(r.score) || 0))
        };
      })
      .filter(Boolean);

    let savedJob = null;
    await dbRepo.update((dbWrite) => {
      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId: targetId,
        type: 'related_bookmarks_recommend',
        status: 'succeeded',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        request: { limit: Math.max(1, Math.min(12, Number(limit) || 8)) },
        result: {
          count: items.length,
          summary: String(suggestion?.summary || ''),
          items: items.slice(0, 20).map((x) => ({ id: x.id, reason: x.reason, score: x.score })),
          provider: suggestion?.provider || {},
          rawText: suggestion?.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      items,
      summary: String(suggestion?.summary || ''),
      confidence: items.length ? Math.max(...items.map((x) => Number(x.score || 0))) : 0
    };
  }

  async function runAiReadingPriorityJob(req, {
    view = 'all',
    folderId = '',
    onlyUnread = true,
    includeArchived = false,
    limit = 10,
    candidateLimit = 60
  } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const safeLimit = Math.max(3, Math.min(20, Number(limit) || 10));
    const safeCandidateLimit = Math.max(safeLimit, Math.min(120, Number(candidateLimit) || 60));
    const normalizedView = ['all', 'inbox', 'favorites', 'archive', 'trash'].includes(String(view || '').trim())
      ? String(view || '').trim()
      : 'all';
    const targetFolderId = String(folderId || '').trim();

    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);

    const allBookmarks = userBookmarks(db, userId).filter((b) => !b.deletedAt);
    const folders = userFolders(db, userId).filter((f) => String(f.id) !== 'root');
    const pathHelper = folderPathMap(folders);
    const now = Date.now();

    let candidatesPool = allBookmarks.slice();
    if (normalizedView === 'favorites') candidatesPool = candidatesPool.filter((b) => Boolean(b.favorite));
    else if (normalizedView === 'archive') candidatesPool = candidatesPool.filter((b) => Boolean(b.archived));
    else if (normalizedView === 'inbox') candidatesPool = candidatesPool.filter((b) => !Boolean(b.archived));
    else if (normalizedView === 'trash') candidatesPool = [];

    if (targetFolderId && targetFolderId !== 'all' && targetFolderId !== 'root') {
      const folderIds = folderDescendantIdSet(folders, targetFolderId);
      if (!folderIds.size) throw badRequest('folder not found');
      candidatesPool = candidatesPool.filter((b) => folderIds.has(String(b.folderId || 'root')));
    } else if (targetFolderId === 'root') {
      candidatesPool = candidatesPool.filter((b) => String(b.folderId || 'root') === 'root');
    }

    if (!includeArchived && normalizedView !== 'archive') {
      candidatesPool = candidatesPool.filter((b) => !Boolean(b.archived));
    }
    if (onlyUnread) {
      candidatesPool = candidatesPool.filter((b) => !Boolean(b.read));
    }
    if (!candidatesPool.length) throw badRequest('no bookmarks available for reading priority');

    const weightedTagCounter = new Map();
    const weightedHostCounter = new Map();
    const addWeighted = (bm, weight) => {
      const w = Number(weight) || 0;
      if (w <= 0 || !bm) return;
      for (const t of (Array.isArray(bm.tags) ? bm.tags : [])) {
        const key = String(t || '').trim().toLowerCase();
        if (!key) continue;
        weightedTagCounter.set(key, (weightedTagCounter.get(key) || 0) + w);
      }
      const host = hostOfBookmarkUrl(bm.url || '').toLowerCase();
      if (host) weightedHostCounter.set(host, (weightedHostCounter.get(host) || 0) + w);
    };
    for (const bm of allBookmarks) {
      if (bm.favorite) addWeighted(bm, 3);
      if (bm.read) addWeighted(bm, 1.2);
      if (Array.isArray(bm.highlights) && bm.highlights.length) addWeighted(bm, 1.6);
      const touched = Number(bm.updatedAt || bm.createdAt || 0) || 0;
      const ageDays = touched > 0 ? Math.max(0, (now - touched) / (24 * 60 * 60 * 1000)) : 999;
      if (ageDays <= 21) addWeighted(bm, Math.max(0.2, 1.2 - ageDays / 21));
    }
    const topWeightedTags = [...weightedTagCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const topWeightedHosts = [...weightedHostCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const tagWeightMap = new Map(topWeightedTags);
    const hostWeightMap = new Map(topWeightedHosts);
    const maxTagWeight = topWeightedTags.length ? Math.max(...topWeightedTags.map(([, w]) => Number(w || 0))) : 0;
    const maxHostWeight = topWeightedHosts.length ? Math.max(...topWeightedHosts.map(([, w]) => Number(w || 0))) : 0;

    const scored = candidatesPool.map((b) => {
      const createdAt = Number(b.createdAt || b.updatedAt || 0) || 0;
      const updatedAt = Number(b.updatedAt || b.createdAt || 0) || 0;
      const daysSinceCreated = createdAt > 0 ? Math.max(0, (now - createdAt) / (24 * 60 * 60 * 1000)) : 999;
      const daysSinceUpdated = updatedAt > 0 ? Math.max(0, (now - updatedAt) / (24 * 60 * 60 * 1000)) : 999;
      const host = hostOfBookmarkUrl(b.url || '').toLowerCase();
      const tagsLower = (Array.isArray(b.tags) ? b.tags : []).map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
      const tagAffinityRaw = tagsLower.reduce((sum, t) => sum + (tagWeightMap.get(t) || 0), 0);
      const hostAffinityRaw = host ? (hostWeightMap.get(host) || 0) : 0;
      const tagAffinity = maxTagWeight > 0 ? Math.min(1, tagAffinityRaw / (maxTagWeight * 2)) : 0;
      const hostAffinity = maxHostWeight > 0 ? Math.min(1, hostAffinityRaw / (maxHostWeight * 1.2)) : 0;

      const reminderAt = Number(b.reminderAt || 0) || 0;
      const reminderDueSoon = reminderAt > 0 && reminderAt >= now && reminderAt - now <= (3 * 24 * 60 * 60 * 1000);
      const reminderOverdue = reminderAt > 0 && reminderAt < now;
      const reminderScore = reminderOverdue ? 1 : (reminderDueSoon ? 0.75 : (reminderAt ? 0.35 : 0));

      const recencyScore = Math.max(0, 1 - Math.min(daysSinceUpdated, 30) / 30);
      const freshnessBoost = Math.max(0, 1 - Math.min(daysSinceCreated, 7) / 7);
      const estimatedLength = (() => {
        const articleLen = Number(b.article?.textLength || b.article?.length || 0) || 0;
        if (articleLen > 0) return articleLen;
        const text = [
          b.title,
          b.article?.excerpt,
          b.metadata?.description,
          b.note
        ].filter(Boolean).join(' ');
        return String(text || '').length;
      })();
      const lengthScore = estimatedLength <= 0 ? 0.35
        : estimatedLength <= 600 ? 1
          : estimatedLength <= 1600 ? 0.8
            : estimatedLength <= 3200 ? 0.55
              : estimatedLength <= 6000 ? 0.35
                : 0.2;
      const contentSignal = (
        (b.favorite ? 0.12 : 0) +
        ((Array.isArray(b.highlights) && b.highlights.length) ? 0.1 : 0) +
        (b.note ? 0.06 : 0) +
        (b.article?.excerpt ? 0.06 : 0)
      );
      const interestScore = Math.min(1, (tagAffinity * 0.65) + (hostAffinity * 0.35));
      const localScore = Math.max(0, Math.min(1,
        (recencyScore * 0.22) +
        (freshnessBoost * 0.12) +
        (lengthScore * 0.16) +
        (interestScore * 0.24) +
        (reminderScore * 0.18) +
        contentSignal +
        (!b.read ? 0.08 : 0)
      ));

      return {
        bookmark: b,
        localScore,
        recencyScore: Number(recencyScore.toFixed(4)),
        interestScore: Number(interestScore.toFixed(4)),
        estimatedLength,
        daysSinceCreated: Number(daysSinceCreated.toFixed(2)),
        daysSinceUpdated: Number(daysSinceUpdated.toFixed(2)),
        reminderAt,
        reminderDueSoon,
        reminderOverdue
      };
    })
      .sort((a, b) => b.localScore - a.localScore
        || Number(b.bookmark.updatedAt || b.bookmark.createdAt || 0) - Number(a.bookmark.updatedAt || a.bookmark.createdAt || 0))
      .slice(0, safeCandidateLimit);

    const candidatePayload = scored.map((row) => {
      const b = row.bookmark;
      const host = hostOfBookmarkUrl(b.url || '');
      return {
        bookmarkId: String(b.id),
        title: String(b.title || ''),
        url: String(b.url || ''),
        host,
        folderId: String(b.folderId || 'root'),
        folderPath: pathHelper.pathOf(b.folderId),
        tags: Array.isArray(b.tags) ? b.tags.slice(0, 10) : [],
        excerpt: String(b.article?.excerpt || b.metadata?.description || b.note || '').slice(0, 200),
        favorite: Boolean(b.favorite),
        read: Boolean(b.read),
        archived: Boolean(b.archived),
        hasReminder: Boolean(row.reminderAt),
        reminderOverdue: Boolean(row.reminderOverdue),
        estimatedLength: row.estimatedLength,
        localScore: Number(row.localScore.toFixed(4)),
        recencyScore: row.recencyScore,
        interestScore: row.interestScore,
        daysSinceCreated: row.daysSinceCreated,
        daysSinceUpdated: row.daysSinceUpdated
      };
    });

    let suggestion;
    try {
      suggestion = await generateReadingPriorityRecommendations({
        config: aiConfig,
        candidates: candidatePayload,
        userProfile: {
          favoredTags: topWeightedTags.map(([tag, weight]) => ({ tag, weight: Number(weight.toFixed ? weight.toFixed(2) : weight) })),
          favoredHosts: topWeightedHosts.map(([host, weight]) => ({ host, weight: Number(weight.toFixed ? weight.toFixed(2) : weight) })),
          recentInterestTags: topWeightedTags.slice(0, 10).map(([tag]) => tag),
          readingSignals: {
            totalBookmarks: allBookmarks.length,
            favorites: allBookmarks.filter((b) => b.favorite).length,
            unread: allBookmarks.filter((b) => !b.read && !b.deletedAt).length,
            remindersScheduled: allBookmarks.filter((b) => Number(b.reminderAt || 0) > 0).length
          }
        },
        context: {
          view: normalizedView,
          folderId: targetFolderId,
          onlyUnread: Boolean(onlyUnread),
          includeArchived: Boolean(includeArchived),
          limit: safeLimit
        },
        limit: safeLimit
      });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'reading_priority_recommend',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: {
          view: normalizedView,
          folderId: targetFolderId,
          onlyUnread: Boolean(onlyUnread),
          includeArchived: Boolean(includeArchived),
          limit: safeLimit,
          candidateLimit: safeCandidateLimit,
          candidateCount: candidatePayload.length
        }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    const candidateMap = new Map(candidatePayload.map((c) => [String(c.bookmarkId), c]));
    const bookmarkMap = new Map(allBookmarks.map((b) => [String(b.id), b]));
    let items = (Array.isArray(suggestion?.items) ? suggestion.items : [])
      .map((r) => {
        const bid = String(r.bookmarkId || '');
        const raw = bookmarkMap.get(bid);
        const c = candidateMap.get(bid);
        if (!raw || !c) return null;
        return {
          id: String(raw.id),
          title: String(raw.title || ''),
          url: String(raw.url || ''),
          folderId: String(raw.folderId || 'root'),
          folderPath: c.folderPath || '',
          host: c.host || '',
          tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 8) : [],
          excerpt: String(raw.article?.excerpt || raw.metadata?.description || raw.note || '').slice(0, 180),
          priority: ['now', 'soon', 'later'].includes(String(r.priority || '')) ? String(r.priority) : 'soon',
          score: Math.max(0, Math.min(1, Number(r.score) || 0)),
          reason: String(r.reason || ''),
          localScore: Number(c.localScore || 0)
        };
      })
      .filter(Boolean);

    if (!items.length) {
      items = scored.slice(0, safeLimit).map((row, idx) => {
        const raw = row.bookmark;
        const host = hostOfBookmarkUrl(raw.url || '');
        const priority = idx < Math.max(1, Math.ceil(safeLimit / 3)) ? 'now' : (idx < Math.ceil(safeLimit * 0.7) ? 'soon' : 'later');
        return {
          id: String(raw.id),
          title: String(raw.title || ''),
          url: String(raw.url || ''),
          folderId: String(raw.folderId || 'root'),
          folderPath: pathHelper.pathOf(raw.folderId),
          host,
          tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 8) : [],
          excerpt: String(raw.article?.excerpt || raw.metadata?.description || raw.note || '').slice(0, 180),
          priority,
          score: Number(row.localScore.toFixed(4)),
          reason: row.reminderOverdue
            ? '已过提醒时间，建议优先处理'
            : (row.reminderDueSoon ? '提醒即将到期，建议尽快阅读' : '基于近期兴趣与时效性信号优先推荐'),
          localScore: Number(row.localScore.toFixed(4))
        };
      });
    }

    let savedJob = null;
    await dbRepo.update((dbWrite) => {
      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'reading_priority_recommend',
        status: 'succeeded',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        request: {
          view: normalizedView,
          folderId: targetFolderId,
          onlyUnread: Boolean(onlyUnread),
          includeArchived: Boolean(includeArchived),
          limit: safeLimit,
          candidateLimit: safeCandidateLimit,
          candidateCount: candidatePayload.length
        },
        result: {
          count: items.length,
          summary: String(suggestion?.summary || ''),
          items: items.slice(0, 20).map((x) => ({ id: x.id, priority: x.priority, score: x.score, reason: x.reason })),
          provider: suggestion?.provider || {},
          rawText: suggestion?.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      items,
      summary: String(suggestion?.summary || ''),
      stats: {
        candidateCount: candidatePayload.length,
        filteredCount: candidatesPool.length,
        totalBookmarks: allBookmarks.length
      },
      profile: {
        favoredTags: topWeightedTags.slice(0, 12).map(([tag, weight]) => ({ tag, weight: Number(Number(weight).toFixed(2)) })),
        favoredHosts: topWeightedHosts.slice(0, 12).map(([host, weight]) => ({ host, weight: Number(Number(weight).toFixed(2)) }))
      }
    };
  }

  async function runAiBookmarksQaJob(req, {
    question = '',
    bookmarkId = '',
    bookmarkIds = [],
    scope = 'auto',
    limit = 6
  } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const q = String(question || '').trim();
    if (!q) throw badRequest('question is required');

    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const all = userBookmarks(db, userId).filter((b) => !b.deletedAt);
    const folders = userFolders(db, userId).filter((f) => String(f.id) !== 'root');
    const pathHelper = folderPathMap(folders);
    const folderNameById = new Map(folders.map((f) => [String(f.id), pathHelper.pathOf(f.id)]));

    const explicitBookmarkId = String(bookmarkId || '').trim();
    const requestedIds = [...new Set((Array.isArray(bookmarkIds) ? bookmarkIds : []).map((x) => String(x || '').trim()).filter(Boolean))];
    let pool = all;
    let targetBookmark = null;
    if (explicitBookmarkId) {
      targetBookmark = all.find((b) => String(b.id) === explicitBookmarkId) || null;
      if (!targetBookmark) throw new Error('bookmark not found');
    }
    if (requestedIds.length) {
      const requestedSet = new Set(requestedIds);
      pool = all.filter((b) => requestedSet.has(String(b.id)));
      if (targetBookmark && !pool.some((b) => String(b.id) === String(targetBookmark.id))) {
        pool = [targetBookmark, ...pool];
      }
    }

    const qTokens = new Set(tokenize(q));
    const targetTokens = new Set(tokenize(targetBookmark ? bookmarkTextForRetrieval(targetBookmark) : ''));
    const scored = pool
      .map((b) => {
        const text = bookmarkTextForRetrieval(b);
        const tokens = new Set(tokenize(text));
        let qOverlap = 0;
        for (const t of qTokens) if (tokens.has(t)) qOverlap += 1;
        let targetOverlap = 0;
        for (const t of targetTokens) if (tokens.has(t)) targetOverlap += 1;
        const tagOverlap = targetBookmark
          ? (() => {
              const s = new Set((targetBookmark.tags || []).map((x) => String(x).toLowerCase()));
              let n = 0;
              for (const t of (b.tags || [])) if (s.has(String(t).toLowerCase())) n += 1;
              return n;
            })()
          : 0;
        const sameHost = targetBookmark && hostOfBookmarkUrl(targetBookmark.url) && hostOfBookmarkUrl(b.url) === hostOfBookmarkUrl(targetBookmark.url) ? 1 : 0;
        const sameFolder = targetBookmark && String(b.folderId || 'root') === String(targetBookmark.folderId || 'root') ? 1 : 0;
        const score = qOverlap * 4 + targetOverlap * 2 + tagOverlap * 3 + sameHost * 2 + sameFolder;
        return { bookmark: b, score, updatedAt: Number(b.updatedAt || b.createdAt || 0) };
      })
      .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);

    let candidateRows = scored.slice(0, 24);
    if (targetBookmark) {
      const targetInRows = candidateRows.some((r) => String(r.bookmark.id) === String(targetBookmark.id));
      if (!targetInRows) candidateRows = [{ bookmark: targetBookmark, score: 9999, updatedAt: Number(targetBookmark.updatedAt || targetBookmark.createdAt || 0) }, ...candidateRows].slice(0, 24);
    }
    if (!candidateRows.length) {
      return { job: null, answer: '', sources: [], citations: [], insufficient: true, confidence: 0 };
    }

    const docs = candidateRows.map(({ bookmark: b, score }) => ({
      bookmarkId: String(b.id),
      title: String(b.title || ''),
      url: String(b.url || ''),
      host: hostOfBookmarkUrl(b.url),
      folderPath: folderNameById.get(String(b.folderId || '')) || '',
      tags: Array.isArray(b.tags) ? b.tags.slice(0, 12) : [],
      note: String(b.note || ''),
      excerpt: String(b.article?.excerpt || b.metadata?.description || '').slice(0, 400),
      highlights: Array.isArray(b.highlights)
        ? b.highlights.flatMap((h) => [String(h?.quote || h?.text || ''), String(h?.note || '')]).filter(Boolean).slice(0, 6)
        : [],
      heuristicScore: score
    }));

    let qa;
    try {
      qa = await generateBookmarksQaAnswer({
        config: aiConfig,
        question: q,
        docs,
        maxCitations: Math.max(1, Math.min(10, Number(limit) || 6))
      });
    } catch (err) {
      const failedJob = buildAiJobRecord({
        userId,
        bookmarkId: explicitBookmarkId || '',
        type: 'bookmarks_qa',
        status: 'failed',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        error: err,
        request: { question: q, scope: String(scope || 'auto'), bookmarkId: explicitBookmarkId || '', bookmarkIds: requestedIds.slice(0, 200), limit }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(failedJob);
        return dbWrite;
      });
      err.aiJob = failedJob;
      throw err;
    }

    const bookmarkById = new Map(all.map((b) => [String(b.id), b]));
    const docById = new Map(docs.map((d) => [String(d.bookmarkId), d]));
    const fallbackCitationIds = docs.slice(0, Math.max(1, Math.min(3, Number(limit) || 3))).map((d) => String(d.bookmarkId));
    const citationIds = (Array.isArray(qa.citations) && qa.citations.length
      ? qa.citations.map((c) => String(c.bookmarkId))
      : fallbackCitationIds);

    const sources = citationIds
      .map((id) => {
        const b = bookmarkById.get(String(id));
        const d = docById.get(String(id));
        if (!b || !d) return null;
        const citation = (qa.citations || []).find((c) => String(c.bookmarkId) === String(id)) || null;
        return {
          id: String(b.id),
          title: String(b.title || ''),
          url: String(b.url || ''),
          host: hostOfBookmarkUrl(b.url),
          folderId: String(b.folderId || 'root'),
          folderPath: String(d.folderPath || ''),
          tags: Array.isArray(b.tags) ? b.tags.slice(0, 8) : [],
          excerpt: String(b.article?.excerpt || b.metadata?.description || b.note || '').slice(0, 220),
          reason: String(citation?.reason || ''),
          score: Number((qa.citations || []).find((c) => String(c.bookmarkId) === String(id))?.score || 0) || 0
        };
      })
      .filter(Boolean);

    let savedJob = null;
    await dbRepo.update((dbWrite) => {
      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId: explicitBookmarkId || '',
        type: 'bookmarks_qa',
        status: 'succeeded',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        request: { question: q, scope: String(scope || 'auto'), bookmarkId: explicitBookmarkId || '', bookmarkIds: requestedIds.slice(0, 200), limit },
        result: {
          answer: String(qa.answer || '').slice(0, 2000),
          citations: Array.isArray(qa.citations) ? qa.citations.slice(0, 12) : [],
          sourceIds: sources.map((s) => s.id),
          insufficient: Boolean(qa.insufficient),
          confidence: Math.max(0, Math.min(1, Number(qa.confidence) || 0)),
          provider: qa.provider || {},
          rawText: qa.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      answer: String(qa.answer || ''),
      citations: Array.isArray(qa.citations) ? qa.citations : [],
      sources,
      insufficient: Boolean(qa.insufficient),
      confidence: Math.max(0, Math.min(1, Number(qa.confidence) || 0))
    };
  }

  async function runAiFolderRecommendJob(req, { bookmarkId, apply = false, recommendation: precomputed = null } = {}) {
    const userId = userIdOf(req);
    const startedAt = Date.now();
    const db = await dbRepo.read();
    requireFeature(db, userId, 'aiSuggestions', badRequest);
    const aiConfig = getAiProviderConfig(db, userId);
    const bookmark = userBookmarksWithDeleted(db, userId).find((b) => String(b.id) === String(bookmarkId) && !b.deletedAt);
    if (!bookmark) throw new Error('bookmark not found');

    const folders = userFolders(db, userId).filter((f) => String(f.id) !== 'root');
    const bookmarkCounts = new Map();
    for (const b of userBookmarks(db, userId)) {
      if (b.deletedAt) continue;
      const key = String(b.folderId || 'root');
      bookmarkCounts.set(key, (bookmarkCounts.get(key) || 0) + 1);
    }
    const pathHelper = folderPathMap(folders);
    const candidates = folders.map((f) => ({
      id: String(f.id),
      name: String(f.name || ''),
      path: pathHelper.pathOf(f.id),
      bookmarkCount: Number(bookmarkCounts.get(String(f.id)) || 0)
    }));
    if (!candidates.length) throw badRequest('no collections available');

    let recOut = null;
    if (precomputed && typeof precomputed === 'object') {
      recOut = {
        recommendation: {
          folderId: String(precomputed.folderId || ''),
          folderName: String(precomputed.folderName || ''),
          folderPath: String(precomputed.folderPath || ''),
          confidence: Math.max(0, Math.min(1, Number(precomputed.confidence) || 0))
        },
        reason: String(precomputed.reason || ''),
        provider: { providerType: 'local', model: 'reuse', transport: 'replay' },
        rawText: '',
        rawResponseMeta: {}
      };
    } else {
      try {
        recOut = await generateBookmarkFolderRecommendation({ config: aiConfig, bookmark, folders: candidates });
      } catch (err) {
        const failedJob = buildAiJobRecord({
          userId,
          bookmarkId,
          type: 'bookmark_folder_recommend',
          status: 'failed',
          startedAt,
          finishedAt: Date.now(),
          config: aiConfig,
          error: err,
          request: { apply: Boolean(apply) }
        });
        await dbRepo.update((dbWrite) => {
          dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
          dbWrite.aiSuggestionJobs.unshift(failedJob);
          return dbWrite;
        });
        err.aiJob = failedJob;
        throw err;
      }
    }

    let updatedBookmark = null;
    let applied = false;
    await dbRepo.update((dbWrite) => {
      const bm = (dbWrite.bookmarks || []).find((b) => String(b.id) === String(bookmarkId) && hasOwner(b, userId) && !b.deletedAt);
      if (!bm) throw new Error('bookmark not found');
      const now = Date.now();
      bm.aiSuggestions = {
        ...(bm.aiSuggestions && typeof bm.aiSuggestions === 'object' ? bm.aiSuggestions : {}),
        folderRecommendation: recOut?.recommendation || {},
        folderRecommendationReason: String(recOut?.reason || ''),
        folderRecommendationGeneratedAt: now,
        provider: recOut?.provider || {}
      };
      const targetFolderId = String(recOut?.recommendation?.folderId || '');
      if (apply && targetFolderId && (dbWrite.folders || []).some((f) => hasOwner(f, userId) && String(f.id) === targetFolderId)) {
        bm.folderId = targetFolderId;
        bm.collectionId = targetFolderId;
        applied = true;
      }
      bm.updatedAt = now;
      updatedBookmark = {
        id: bm.id,
        folderId: String(bm.folderId || 'root'),
        collectionId: String(bm.collectionId || bm.folderId || 'root'),
        aiSuggestions: bm.aiSuggestions,
        updatedAt: bm.updatedAt
      };
      return dbWrite;
    });

    let savedJob = null;
    await dbRepo.update((dbWrite) => {
      dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
      savedJob = buildAiJobRecord({
        userId,
        bookmarkId,
        type: 'bookmark_folder_recommend',
        status: 'succeeded',
        startedAt,
        finishedAt: Date.now(),
        config: aiConfig,
        request: { apply: Boolean(apply) },
        result: {
          recommendation: recOut?.recommendation || {},
          reason: String(recOut?.reason || ''),
          applied,
          finalFolderId: String(updatedBookmark?.folderId || ''),
          provider: recOut?.provider || {},
          rawText: recOut?.rawText || ''
        }
      });
      dbWrite.aiSuggestionJobs.unshift(savedJob);
      return dbWrite;
    });

    return {
      job: savedJob,
      bookmark: updatedBookmark,
      recommendation: recOut?.recommendation || {},
      reason: String(recOut?.reason || ''),
      applied
    };
  }

  function ensureAiBatchTasks(db) {
    db.aiBatchTasks = Array.isArray(db.aiBatchTasks) ? db.aiBatchTasks : [];
    return db.aiBatchTasks;
  }

  function aiBatchTaskView(task = {}) {
    return {
      id: String(task.id || ''),
      userId: String(task.userId || ''),
      type: String(task.type || 'bulk_autotag'),
      status: String(task.status || 'unknown'),
      createdAt: Number(task.createdAt || 0) || 0,
      startedAt: Number(task.startedAt || 0) || 0,
      finishedAt: Number(task.finishedAt || 0) || 0,
      updatedAt: Number(task.updatedAt || 0) || 0,
      input: task.input && typeof task.input === 'object' ? task.input : {},
      progress: task.progress && typeof task.progress === 'object' ? task.progress : {},
      result: task.result && typeof task.result === 'object' ? task.result : {},
      error: task.error && typeof task.error === 'object' ? task.error : null
    };
  }

  async function patchAiBatchTask(taskId, mutator) {
    let snapshot = null;
    await dbRepo.update((db) => {
      const tasks = ensureAiBatchTasks(db);
      const task = tasks.find((t) => String(t.id) === String(taskId));
      if (!task) return db;
      mutator(task, db);
      task.updatedAt = Date.now();
      snapshot = aiBatchTaskView(task);
      return db;
    });
    return snapshot;
  }

  async function processAiBatchAutoTagTask({ taskId }) {
    const taskKey = String(taskId || '');
    if (!taskKey) return;

    let taskSnapshot = null;
    await dbRepo.update((db) => {
      const tasks = ensureAiBatchTasks(db);
      const task = tasks.find((t) => String(t.id) === taskKey);
      if (!task) return db;
      if (!['queued', 'retry'].includes(String(task.status || ''))) return db;
      task.status = 'running';
      task.startedAt = task.startedAt || Date.now();
      task.updatedAt = Date.now();
      task.progress = {
        ...(task.progress || {}),
        total: Number(task.input?.total || (Array.isArray(task.input?.bookmarkIds) ? task.input.bookmarkIds.length : 0)) || 0,
        processed: Number(task.progress?.processed || 0) || 0,
        succeeded: Number(task.progress?.succeeded || 0) || 0,
        failed: Number(task.progress?.failed || 0) || 0,
        currentBookmarkId: ''
      };
      taskSnapshot = {
        userId: String(task.userId || ''),
        status: task.status,
        input: structuredClone(task.input || {}),
        progress: structuredClone(task.progress || {})
      };
      return db;
    });

    if (!taskSnapshot || taskSnapshot.status !== 'running') return;

    const userId = String(taskSnapshot.userId || '');
    const input = taskSnapshot.input || {};
    const bookmarkIds = Array.isArray(input.bookmarkIds) ? input.bookmarkIds.map(String) : [];
    const applyMode = ['merge', 'replace'].includes(String(input.applyMode || '')) ? String(input.applyMode) : '';
    const batchSize = Math.max(1, Math.min(50, Number(input.batchSize || 5) || 5));
    const startedAt = Date.now();
    const failures = [];
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < bookmarkIds.length; i += batchSize) {
      const chunk = bookmarkIds.slice(i, i + batchSize);
      for (const bookmarkId of chunk) {
        await patchAiBatchTask(taskKey, (task) => {
          task.progress = task.progress && typeof task.progress === 'object' ? task.progress : {};
          task.progress.currentBookmarkId = bookmarkId;
        });

        try {
          await runAiTagJobForUser({
            userId,
            bookmarkId,
            applyTags: true,
            explicitApplyMode: applyMode,
            routeMode: 'batch_autotag'
          });
          succeeded += 1;
        } catch (err) {
          failed += 1;
          failures.push({
            bookmarkId,
            message: String(err?.message || err || 'failed')
          });
        } finally {
          processed += 1;
          await patchAiBatchTask(taskKey, (task) => {
            task.progress = task.progress && typeof task.progress === 'object' ? task.progress : {};
            task.progress.total = bookmarkIds.length;
            task.progress.processed = processed;
            task.progress.succeeded = succeeded;
            task.progress.failed = failed;
            task.progress.currentBookmarkId = bookmarkId;
          });
        }
      }
    }

    const finalStatus = failed > 0 ? (succeeded > 0 ? 'partial' : 'failed') : 'succeeded';
    await patchAiBatchTask(taskKey, (task) => {
      task.status = finalStatus;
      task.finishedAt = Date.now();
      task.progress = task.progress && typeof task.progress === 'object' ? task.progress : {};
      task.progress.currentBookmarkId = '';
      task.result = {
        total: bookmarkIds.length,
        processed,
        succeeded,
        failed,
        durationMs: Date.now() - startedAt,
        failures: failures.slice(0, 50)
      };
      task.error = failed && !succeeded ? { message: failures[0]?.message || 'all items failed' } : null;
    });
  }

  const aiBatchQueue = jobQueue && typeof jobQueue.createProcessorQueue === 'function'
    ? jobQueue.createProcessorQueue('product-ai-batch-autotag', {
        concurrency: 1,
        handler: async (payload) => {
          await processAiBatchAutoTagTask({ taskId: payload?.taskId });
        }
      })
    : null;

  async function enqueueAiBatchAutoTagTask(taskId) {
    const payload = { taskId: String(taskId || '') };
    if (!payload.taskId) throw badRequest('taskId is required');
    if (aiBatchQueue && typeof aiBatchQueue.enqueue === 'function') {
      await aiBatchQueue.enqueue(payload, { jobId: `ai_batch_${payload.taskId}` });
      return;
    }
    setTimeout(() => {
      void processAiBatchAutoTagTask(payload).catch((err) => {
        console.error('[ai-batch-autotag] async fallback failed', err);
      });
    }, 0);
  }

  function ensureAiBackfillTasks(db) {
    db.aiBackfillTasks = Array.isArray(db.aiBackfillTasks) ? db.aiBackfillTasks : [];
    return db.aiBackfillTasks;
  }

  function aiBackfillTaskView(task = {}) {
    return {
      id: String(task.id || ''),
      userId: String(task.userId || ''),
      type: String(task.type || 'ai_backfill'),
      status: String(task.status || 'unknown'),
      createdAt: Number(task.createdAt || 0) || 0,
      startedAt: Number(task.startedAt || 0) || 0,
      finishedAt: Number(task.finishedAt || 0) || 0,
      updatedAt: Number(task.updatedAt || 0) || 0,
      input: task.input && typeof task.input === 'object' ? task.input : {},
      progress: task.progress && typeof task.progress === 'object' ? task.progress : {},
      result: task.result && typeof task.result === 'object' ? task.result : {},
      error: task.error && typeof task.error === 'object' ? task.error : null
    };
  }

  async function patchAiBackfillTask(taskId, mutator) {
    let snapshot = null;
    await dbRepo.update((db) => {
      const task = ensureAiBackfillTasks(db).find((t) => String(t.id) === String(taskId));
      if (!task) return db;
      mutator(task, db);
      task.updatedAt = Date.now();
      snapshot = aiBackfillTaskView(task);
      return db;
    });
    return snapshot;
  }

  async function getAiBackfillTaskSnapshot(taskId) {
    const db = await dbRepo.read();
    const task = ensureAiBackfillTasks(db).find((t) => String(t.id) === String(taskId));
    return task ? aiBackfillTaskView(task) : null;
  }

  async function processAiBackfillTask({ taskId }) {
    const taskKey = String(taskId || '');
    if (!taskKey) return;
    if (!aiRules) {
      await patchAiBackfillTask(taskKey, (task) => {
        task.status = 'failed';
        task.finishedAt = Date.now();
        task.error = { message: 'ai rule engine unavailable' };
      });
      return;
    }

    let taskSnapshot = null;
    await dbRepo.update((db) => {
      const task = ensureAiBackfillTasks(db).find((t) => String(t.id) === taskKey);
      if (!task) return db;
      if (!['queued', 'retry'].includes(String(task.status || ''))) return db;
      task.status = 'running';
      task.startedAt = task.startedAt || Date.now();
      task.updatedAt = Date.now();
      task.progress = {
        ...(task.progress || {}),
        total: Number(task.input?.total || (Array.isArray(task.input?.bookmarkIds) ? task.input.bookmarkIds.length : 0)) || 0,
        processed: Number(task.progress?.processed || 0) || 0,
        succeeded: Number(task.progress?.succeeded || 0) || 0,
        failed: Number(task.progress?.failed || 0) || 0,
        skipped: Number(task.progress?.skipped || 0) || 0,
        currentBookmarkId: ''
      };
      taskSnapshot = {
        userId: String(task.userId || ''),
        input: structuredClone(task.input || {}),
        progress: structuredClone(task.progress || {}),
        status: task.status
      };
      return db;
    });
    if (!taskSnapshot || taskSnapshot.status !== 'running') return;

    const userId = String(taskSnapshot.userId || '');
    const input = taskSnapshot.input || {};
    const bookmarkIds = Array.isArray(input.bookmarkIds) ? input.bookmarkIds.map(String) : [];
    const batchSize = Math.max(1, Math.min(50, Number(input.batchSize || 5) || 5));
    const startedAt = Date.now();
    const progressSnapshot = taskSnapshot.progress && typeof taskSnapshot.progress === 'object' ? taskSnapshot.progress : {};
    const resumeOffset = Math.max(0, Math.min(bookmarkIds.length, Number(progressSnapshot.processed || 0) || 0));
    let processed = resumeOffset;
    let succeeded = Math.max(0, Number(progressSnapshot.succeeded || 0) || 0);
    let failed = Math.max(0, Number(progressSnapshot.failed || 0) || 0);
    let skipped = Math.max(0, Number(progressSnapshot.skipped || 0) || 0);
    const failures = [];

    for (let i = resumeOffset; i < bookmarkIds.length; i += batchSize) {
      const chunk = bookmarkIds.slice(i, i + batchSize);
      for (const bookmarkId of chunk) {
        const latest = await getAiBackfillTaskSnapshot(taskKey);
        const latestStatus = String(latest?.status || '');
        if (latestStatus === 'paused') return;
        if (latestStatus && latestStatus !== 'running') return;

        await patchAiBackfillTask(taskKey, (task) => {
          task.progress = task.progress && typeof task.progress === 'object' ? task.progress : {};
          task.progress.currentBookmarkId = bookmarkId;
        });

        try {
          const out = await aiRules.runManual({
            userId,
            bookmarkId,
            trigger: 'backfill',
            payload: { sourceTaskId: taskKey }
          });
          if (out?.skipped) skipped += 1;
          else succeeded += 1;
        } catch (err) {
          failed += 1;
          failures.push({
            bookmarkId,
            message: String(err?.message || err || 'failed')
          });
        } finally {
          processed += 1;
          await patchAiBackfillTask(taskKey, (task) => {
            task.progress = task.progress && typeof task.progress === 'object' ? task.progress : {};
            task.progress.total = bookmarkIds.length;
            task.progress.processed = processed;
            task.progress.succeeded = succeeded;
            task.progress.failed = failed;
            task.progress.skipped = skipped;
            task.progress.currentBookmarkId = bookmarkId;
          });
        }
      }
    }

    const finalStatus = failed > 0 ? (succeeded > 0 || skipped > 0 ? 'partial' : 'failed') : 'succeeded';
    await patchAiBackfillTask(taskKey, (task) => {
      task.status = finalStatus;
      task.finishedAt = Date.now();
      task.progress = task.progress && typeof task.progress === 'object' ? task.progress : {};
      task.progress.currentBookmarkId = '';
      task.result = {
        total: bookmarkIds.length,
        processed,
        succeeded,
        failed,
        skipped,
        durationMs: Date.now() - startedAt,
        failures: failures.slice(0, 100)
      };
      task.error = failed && !succeeded && !skipped ? { message: failures[0]?.message || 'all items failed' } : null;
    });
  }

  const aiBackfillQueue = jobQueue && typeof jobQueue.createProcessorQueue === 'function'
    ? jobQueue.createProcessorQueue('product-ai-backfill', {
        concurrency: 1,
        handler: async (payload) => {
          await processAiBackfillTask({ taskId: payload?.taskId });
        }
      })
    : null;

  async function enqueueAiBackfillTask(taskId) {
    const payload = { taskId: String(taskId || '') };
    if (!payload.taskId) throw badRequest('taskId is required');
    if (aiBackfillQueue && typeof aiBackfillQueue.enqueue === 'function') {
      await aiBackfillQueue.enqueue(payload, { jobId: `ai_backfill_${payload.taskId}` });
      return;
    }
    setTimeout(() => {
      void processAiBackfillTask(payload).catch((err) => {
        console.error('[ai-backfill] async fallback failed', err);
      });
    }, 0);
  }

  app.post('/api/product/ai/batch/autotag/tasks', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const requestedIds = Array.isArray(req.body?.bookmarkIds)
        ? req.body.bookmarkIds.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      if (!requestedIds.length) return next(badRequest('bookmarkIds is required'));

      const dedupedRequestedIds = [...new Set(requestedIds)];
      const maxItems = 200;
      if (dedupedRequestedIds.length > maxItems) {
        return next(badRequest(`too many bookmarkIds (max ${maxItems})`));
      }

      let taskRecord = null;
      let skippedIds = [];
      let missingIds = [];

      await dbRepo.update((db) => {
        requireFeature(db, userId, 'aiSuggestions', badRequest);
        const aiConfig = getAiProviderConfig(db, userId);
        if (!aiConfig?.enabled) {
          const err = badRequest('AI provider is disabled');
          err.code = 'AI_PROVIDER_DISABLED';
          throw err;
        }

        const userItems = userBookmarksWithDeleted(db, userId);
        const itemById = new Map(userItems.map((b) => [String(b.id), b]));
        const validBookmarkIds = [];
        skippedIds = [];
        missingIds = [];
        for (const id of dedupedRequestedIds) {
          const bm = itemById.get(String(id));
          if (!bm) {
            missingIds.push(String(id));
            continue;
          }
          if (bm.deletedAt) {
            skippedIds.push(String(id));
            continue;
          }
          validBookmarkIds.push(String(id));
        }

        if (!validBookmarkIds.length) {
          const err = badRequest('no valid bookmarks to process');
          err.code = 'AI_BATCH_NO_VALID_BOOKMARKS';
          err.details = {
            requested: dedupedRequestedIds.length,
            missing: missingIds.length,
            skippedDeleted: skippedIds.length
          };
          throw err;
        }

        const tasks = ensureAiBatchTasks(db);
        const now = Date.now();
        taskRecord = {
          id: `ai_batch_${crypto.randomUUID()}`,
          userId,
          type: 'bulk_autotag',
          status: 'queued',
          createdAt: now,
          startedAt: 0,
          finishedAt: 0,
          updatedAt: now,
          input: {
            bookmarkIds: validBookmarkIds,
            total: validBookmarkIds.length,
            applyMode: ['merge', 'replace'].includes(String(req.body?.applyMode || ''))
              ? String(req.body.applyMode)
              : String(aiConfig?.tagging?.applyMode || 'merge'),
            batchSize: Math.max(1, Math.min(50, Number(req.body?.batchSize || 5) || 5)),
            requestedCount: dedupedRequestedIds.length,
            skippedIds,
            missingIds
          },
          progress: {
            total: validBookmarkIds.length,
            processed: 0,
            succeeded: 0,
            failed: 0,
            currentBookmarkId: ''
          },
          result: {},
          error: null
        };
        tasks.unshift(taskRecord);
        if (tasks.length > 200) tasks.length = 200;
        return db;
      });

      await enqueueAiBatchAutoTagTask(taskRecord.id);
      res.json({
        ok: true,
        task: aiBatchTaskView(taskRecord),
        meta: {
          requested: dedupedRequestedIds.length,
          queued: Number(taskRecord?.input?.total || 0) || 0,
          skippedDeleted: skippedIds.length,
          missing: missingIds.length
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/batch/autotag/tasks', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50) || 50));
      const db = await dbRepo.read();
      const items = ensureAiBatchTasks(db)
        .filter((t) => String(t.userId || '') === userId && String(t.type || '') === 'bulk_autotag')
        .slice(0, limit)
        .map(aiBatchTaskView);
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/batch/autotag/tasks/:taskId', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const taskId = String(req.params.taskId || '');
      const db = await dbRepo.read();
      const task = ensureAiBatchTasks(db).find((t) => String(t.id) === taskId && String(t.userId || '') === userId);
      if (!task) return next(notFound('ai batch task not found'));
      res.json({ ok: true, task: aiBatchTaskView(task) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/batch/autotag/tasks/:taskId/retry', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const taskId = String(req.params.taskId || '');
      let taskSnapshot = null;
      await dbRepo.update((db) => {
        const task = ensureAiBatchTasks(db).find((t) => String(t.id) === taskId && String(t.userId || '') === userId);
        if (!task) return db;
        const status = String(task.status || '');
        if (!['failed', 'partial'].includes(status)) {
          const err = badRequest(`task status cannot retry: ${status || 'unknown'}`);
          err.code = 'AI_BATCH_TASK_RETRY_NOT_ALLOWED';
          throw err;
        }
        const now = Date.now();
        task.status = 'retry';
        task.startedAt = 0;
        task.finishedAt = 0;
        task.updatedAt = now;
        task.error = null;
        task.progress = {
          total: Number(task.input?.total || (Array.isArray(task.input?.bookmarkIds) ? task.input.bookmarkIds.length : 0)) || 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          currentBookmarkId: ''
        };
        task.result = {};
        taskSnapshot = aiBatchTaskView(task);
        return db;
      });
      if (!taskSnapshot) return next(notFound('ai batch task not found'));
      await enqueueAiBatchAutoTagTask(taskId);
      res.json({ ok: true, task: taskSnapshot });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/backfill/tasks', async (req, res, next) => {
    try {
      if (!aiRules) {
        const err = badRequest('AI rule engine unavailable');
        err.code = 'AI_RULE_ENGINE_UNAVAILABLE';
        return next(err);
      }
      const userId = userIdOf(req);
      const requestedFolderIdRaw = String(req.body?.folderId || '').trim();
      const folderId = requestedFolderIdRaw || '';
      const includeDescendants = req.body?.includeDescendants === false ? false : true;
      const onlyUnread = req.body?.onlyUnread === true;
      const onlyUntagged = req.body?.onlyUntagged === true;
      const onlyNoNote = req.body?.onlyNoNote === true;
      const includeArchived = req.body?.includeArchived === true;
      const viewScope = ['all', 'inbox', 'favorites', 'archive'].includes(String(req.body?.view || ''))
        ? String(req.body.view)
        : 'all';
      const order = ['newest', 'oldest', 'updated_desc', 'updated_asc'].includes(String(req.body?.order || ''))
        ? String(req.body.order)
        : 'updated_desc';
      const limit = Math.max(1, Math.min(2000, Number(req.body?.limit || 300) || 300));
      const batchSize = Math.max(1, Math.min(50, Number(req.body?.batchSize || 10) || 10));

      let taskRecord = null;
      let meta = null;

      await dbRepo.update((db) => {
        requireFeature(db, userId, 'aiSuggestions', badRequest);
        const aiConfig = getAiProviderConfig(db, userId);
        if (!aiConfig?.enabled) {
          const err = badRequest('AI provider is disabled');
          err.code = 'AI_PROVIDER_DISABLED';
          throw err;
        }

        const folders = userFolders(db, userId);
        if (folderId && folderId !== 'root' && !folders.some((f) => String(f.id) === folderId)) {
          throw badRequest('folderId not found');
        }
        const folderIds = folderId
          ? (includeDescendants ? folderDescendantIdSet(folders, folderId) : new Set([folderId]))
          : null;
        if (folderIds && folderId === 'root') folderIds.add('root');

        let candidates = userBookmarks(db, userId).filter((b) => !b.deletedAt);
        if (viewScope === 'inbox') candidates = candidates.filter((b) => String(b.folderId || 'root') === 'root');
        if (viewScope === 'favorites') candidates = candidates.filter((b) => Boolean(b.favorite));
        if (viewScope === 'archive') candidates = candidates.filter((b) => Boolean(b.archived));
        if (!includeArchived) candidates = candidates.filter((b) => !b.archived);
        if (folderIds) candidates = candidates.filter((b) => folderIds.has(String(b.folderId || 'root')));
        if (onlyUnread) candidates = candidates.filter((b) => !b.read);
        if (onlyUntagged) candidates = candidates.filter((b) => !Array.isArray(b.tags) || b.tags.length === 0);
        if (onlyNoNote) candidates = candidates.filter((b) => !String(b.note || '').trim());

        candidates.sort((a, b) => {
          if (order === 'oldest') {
            return (Number(a.createdAt || a.updatedAt || 0) || 0) - (Number(b.createdAt || b.updatedAt || 0) || 0);
          }
          if (order === 'updated_asc') {
            return (Number(a.updatedAt || a.createdAt || 0) || 0) - (Number(b.updatedAt || b.createdAt || 0) || 0);
          }
          if (order === 'newest') {
            return (Number(b.createdAt || b.updatedAt || 0) || 0) - (Number(a.createdAt || a.updatedAt || 0) || 0);
          }
          return (Number(b.updatedAt || b.createdAt || 0) || 0) - (Number(a.updatedAt || a.createdAt || 0) || 0);
        });

        const selected = candidates.slice(0, limit);
        if (!selected.length) {
          const err = badRequest('no bookmarks matched backfill filters');
          err.code = 'AI_BACKFILL_NO_MATCHED_BOOKMARKS';
          throw err;
        }

        const tasks = ensureAiBackfillTasks(db);
        const now = Date.now();
        taskRecord = {
          id: `ai_backfill_${crypto.randomUUID()}`,
          userId,
          type: 'ai_backfill',
          status: 'queued',
          createdAt: now,
          startedAt: 0,
          finishedAt: 0,
          updatedAt: now,
          input: {
            bookmarkIds: selected.map((b) => String(b.id)),
            total: selected.length,
            batchSize,
            filters: {
              folderId: folderId || '',
              includeDescendants,
              view: viewScope,
              onlyUnread,
              onlyUntagged,
              onlyNoNote,
              includeArchived,
              order,
              limit
            }
          },
          progress: {
            total: selected.length,
            processed: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0,
            currentBookmarkId: ''
          },
          result: {},
          error: null
        };
        tasks.unshift(taskRecord);
        if (tasks.length > 200) tasks.length = 200;

        meta = {
          matched: candidates.length,
          queued: selected.length,
          filters: taskRecord.input.filters
        };
        return db;
      });

      await enqueueAiBackfillTask(taskRecord.id);
      res.status(201).json({ ok: true, task: aiBackfillTaskView(taskRecord), meta });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/backfill/tasks', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50) || 50));
      const statusFilter = String(req.query.status || '').trim();
      const db = await dbRepo.read();
      let items = ensureAiBackfillTasks(db)
        .filter((t) => String(t.userId || '') === userId && String(t.type || '') === 'ai_backfill');
      if (statusFilter) items = items.filter((t) => String(t.status || '') === statusFilter);
      res.json({ ok: true, items: items.slice(0, limit).map(aiBackfillTaskView) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/backfill/tasks/:taskId', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const taskId = String(req.params.taskId || '');
      const db = await dbRepo.read();
      const task = ensureAiBackfillTasks(db).find((t) => String(t.id) === taskId && String(t.userId || '') === userId);
      if (!task) return next(notFound('ai backfill task not found'));
      res.json({ ok: true, task: aiBackfillTaskView(task) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/backfill/tasks/:taskId/pause', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const taskId = String(req.params.taskId || '');
      let snapshot = null;
      await dbRepo.update((db) => {
        const task = ensureAiBackfillTasks(db).find((t) => String(t.id) === taskId && String(t.userId || '') === userId);
        if (!task) return db;
        const status = String(task.status || '');
        if (!['queued', 'running', 'retry'].includes(status)) {
          const err = badRequest(`task status cannot pause: ${status || 'unknown'}`);
          err.code = 'AI_BACKFILL_TASK_PAUSE_NOT_ALLOWED';
          throw err;
        }
        task.status = 'paused';
        task.error = null;
        task.updatedAt = Date.now();
        if (task.progress && typeof task.progress === 'object') {
          task.progress.currentBookmarkId = '';
        }
        snapshot = aiBackfillTaskView(task);
        return db;
      });
      if (!snapshot) return next(notFound('ai backfill task not found'));
      res.json({ ok: true, task: snapshot });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/backfill/tasks/:taskId/resume', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const taskId = String(req.params.taskId || '');
      let snapshot = null;
      await dbRepo.update((db) => {
        const task = ensureAiBackfillTasks(db).find((t) => String(t.id) === taskId && String(t.userId || '') === userId);
        if (!task) return db;
        const status = String(task.status || '');
        if (status !== 'paused') {
          const err = badRequest(`task status cannot resume: ${status || 'unknown'}`);
          err.code = 'AI_BACKFILL_TASK_RESUME_NOT_ALLOWED';
          throw err;
        }
        const total = Number(task.progress?.total || task.input?.total || 0) || 0;
        const processed = Number(task.progress?.processed || 0) || 0;
        if (total > 0 && processed >= total) {
          const err = badRequest('task already completed');
          err.code = 'AI_BACKFILL_TASK_ALREADY_COMPLETED';
          throw err;
        }
        task.status = processed > 0 ? 'retry' : 'queued';
        task.error = null;
        task.finishedAt = 0;
        task.updatedAt = Date.now();
        if (task.progress && typeof task.progress === 'object') {
          task.progress.currentBookmarkId = '';
        }
        snapshot = aiBackfillTaskView(task);
        return db;
      });
      if (!snapshot) return next(notFound('ai backfill task not found'));
      await enqueueAiBackfillTask(taskId);
      res.json({ ok: true, task: snapshot });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/suggest/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId);
      const out = await runAiTagJob(req, {
        bookmarkId,
        applyTags: false,
        routeMode: 'suggest'
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/autotag/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId);
      const out = await runAiTagJob(req, {
        bookmarkId,
        applyTags: req.body?.apply === false ? false : true,
        explicitApplyMode: String(req.body?.applyMode || ''),
        routeMode: 'autotag'
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/title-clean/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId || '');
      const out = await runAiTitleCleanJob(req, {
        bookmarkId,
        apply: req.body?.apply === false ? false : true
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/summary/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId || '');
      const out = await runAiSummaryJob(req, {
        bookmarkId,
        apply: req.body?.apply === false ? false : true,
        noteMode: String(req.body?.noteMode || 'if_empty')
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/tags/standardize', async (req, res, next) => {
    try {
      const out = await runAiTagStandardizeSuggestJob(req, {
        apply: req.body?.apply === true,
        suggestions: Array.isArray(req.body?.suggestions) ? req.body.suggestions : null
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/tags/localize', async (req, res, next) => {
    try {
      const out = await runAiTagLocalizationJob(req, {
        apply: req.body?.apply === true,
        suggestions: Array.isArray(req.body?.suggestions) ? req.body.suggestions : null
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/search-to-filters', async (req, res, next) => {
    try {
      const out = await runAiSearchFilterParseJob(req, {
        text: req.body?.text,
        current: req.body?.current && typeof req.body.current === 'object' ? req.body.current : {}
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/reader-summary/:bookmarkId', async (req, res, next) => {
    try {
      const out = await runAiReaderSummaryJob(req, {
        bookmarkId: req.params.bookmarkId,
        apply: typeof req.body?.apply === 'undefined' ? true : Boolean(req.body?.apply)
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/highlight-candidates/:bookmarkId', async (req, res, next) => {
    try {
      const out = await runAiHighlightCandidatesJob(req, { bookmarkId: req.params.bookmarkId });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/highlight-digest/:bookmarkId', async (req, res, next) => {
    try {
      const out = await runAiHighlightDigestJob(req, {
        bookmarkId: req.params.bookmarkId,
        apply: typeof req.body?.apply === 'undefined' ? true : Boolean(req.body?.apply)
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/folder-summary/:folderId', async (req, res, next) => {
    try {
      const out = await runAiFolderKnowledgeSummaryJob(req, {
        folderId: req.params.folderId,
        apply: typeof req.body?.apply === 'undefined' ? true : Boolean(req.body?.apply)
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'folder not found') return next(notFound('folder not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/qa', async (req, res, next) => {
    try {
      const out = await runAiBookmarksQaJob(req, {
        question: req.body?.question,
        bookmarkId: req.body?.bookmarkId,
        bookmarkIds: Array.isArray(req.body?.bookmarkIds) ? req.body.bookmarkIds : [],
        scope: req.body?.scope,
        limit: req.body?.limit
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/related/:bookmarkId', async (req, res, next) => {
    try {
      const out = await runAiRelatedBookmarksJob(req, {
        bookmarkId: req.params.bookmarkId,
        limit: req.body?.limit
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/reading-priority', async (req, res, next) => {
    try {
      const out = await runAiReadingPriorityJob(req, {
        view: req.body?.view,
        folderId: req.body?.folderId,
        onlyUnread: typeof req.body?.onlyUnread === 'undefined' ? true : Boolean(req.body?.onlyUnread),
        includeArchived: typeof req.body?.includeArchived === 'undefined' ? false : Boolean(req.body?.includeArchived),
        limit: req.body?.limit,
        candidateLimit: req.body?.candidateLimit
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/folder-recommend/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId || '');
      const out = await runAiFolderRecommendJob(req, {
        bookmarkId,
        apply: req.body?.apply === true,
        recommendation: req.body?.recommendation && typeof req.body.recommendation === 'object'
          ? req.body.recommendation
          : null
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.get('/api/product/ai/jobs', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const items = (db.aiSuggestionJobs || []).filter((j) => String(j.userId) === userId).slice(0, 100);
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerProductRoutes,
  entitlementForUser,
  planFeatures
};
