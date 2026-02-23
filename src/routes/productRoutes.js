const crypto = require('node:crypto');
const { hasOwner } = require('../services/tenantScope');

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
    aiSuggestions: false,
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

function registerProductRoutes(app, deps) {
  const { dbRepo, objectStorage, badRequest, notFound } = deps;
  const userIdOf = (req) => String(req.auth?.user?.id || '');

  function userBookmarks(db, userId) {
    return (db.bookmarks || []).filter((b) => hasOwner(b, userId));
  }
  function userFolders(db, userId) {
    return (db.folders || []).filter((f) => hasOwner(f, userId));
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
      if (q) {
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
        if (sort === 'newest') return Number(b.createdAt || 0) - Number(a.createdAt || 0);
        if (sort === 'oldest') return Number(a.createdAt || 0) - Number(b.createdAt || 0);
        if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
        return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
      });
      const total = candidates.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const start = (page - 1) * pageSize;
      const items = candidates.slice(start, start + pageSize);
      res.json({
        ok: true,
        items,
        total,
        page,
        pageSize,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        usedFullText: Boolean(q && ent.features.fullTextSearch)
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

  app.post('/api/product/ai/suggest/:bookmarkId', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const bookmarkId = String(req.params.bookmarkId);
      let job = null;
      await dbRepo.update((db) => {
        requireFeature(db, userId, 'aiSuggestions', badRequest);
        const bm = userBookmarks(db, userId).find((b) => String(b.id) === bookmarkId && !b.deletedAt);
        if (!bm) throw new Error('bookmark not found');
        const now = Date.now();
        const title = String(bm.title || '');
        const host = (() => { try { return new URL(String(bm.url || '')).hostname.replace(/^www\./, ''); } catch { return ''; } })();
        const words = tokenize([title, bm.note || '', host].join(' ')).slice(0, 12);
        const suggestedTags = [...new Set(words.filter((w) => w.length >= 3))].slice(0, 6);
        const summary = String(bm.note || '').trim() || `Saved link from ${host || 'site'}: ${title}`.slice(0, 280);
        db.aiSuggestionJobs = Array.isArray(db.aiSuggestionJobs) ? db.aiSuggestionJobs : [];
        job = {
          id: `ai_${crypto.randomUUID()}`,
          userId,
          bookmarkId,
          status: 'succeeded',
          createdAt: now,
          finishedAt: now,
          result: { suggestedTags, summary }
        };
        db.aiSuggestionJobs.unshift(job);
        bm.aiSuggestions = job.result;
        bm.updatedAt = now;
        return db;
      });
      res.json({ ok: true, job });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.get('/api/product/ai/jobs', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const items = (db.aiSuggestionJobs || []).filter((j) => String(j.userId) === userId).slice(0, 50);
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
