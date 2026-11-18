'use strict';

const crypto = require('node:crypto');
const { generateTextEmbeddings } = require('./aiProviderService');

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

async function ensureSemanticIndexRowsForBookmarks({ dbRepo, userId, bookmarks = [], aiConfig, maxBatch = 24, generateEmbeddings = generateTextEmbeddings }) {
  const target = (Array.isArray(bookmarks) ? bookmarks : []).filter((b) => b && !b.deletedAt);
  if (!target.length) return { rowsByBookmarkId: new Map(), updated: 0, provider: { providerType: 'local', model: 'none', transport: 'none' } };
  const requestedBatchSize = Math.floor(Number(maxBatch) || 24);
  const batchSize = Number.isFinite(requestedBatchSize) ? Math.max(1, requestedBatchSize) : 24;

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
    for (let i = 0; i < stale.length; i += batchSize) {
      const batch = stale.slice(i, i + batchSize);
      const embedOut = await generateEmbeddings({
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

module.exports = {
  normalizeUrlLoose,
  hostOfBookmarkUrl,
  bookmarkTextForRetrieval,
  bookmarkTextForSemanticIndex,
  semanticTextFingerprint,
  normalizeVectorRow,
  cosineSimilarity,
  ensureSemanticIndexRowsForBookmarks,
  folderPathMap,
  folderDescendantIdSet
};
