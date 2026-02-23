const { hasOwner, scopeDbForUser } = require('../services/tenantScope');

function registerTagRoutes(app, deps) {
  const { dbRepo, tagsSummary, normalizeTags, badRequest } = deps;

  function mergeTagsInBookmarks(bookmarks, sources, target) {
    const sourceKeys = new Set(sources.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
    const normalizedTarget = String(target || '').trim();
    if (!sourceKeys.size) throw badRequest('sources required');
    if (!normalizedTarget) throw badRequest('target required');

    let affected = 0;
    let replaced = 0;
    const now = Date.now();

    for (const item of bookmarks) {
      if (!Array.isArray(item.tags) || !item.tags.length) continue;
      let changed = false;
      const nextTags = [];
      let injectedTarget = false;

      for (const rawTag of item.tags) {
        const tag = String(rawTag || '').trim();
        const key = tag.toLowerCase();
        if (!sourceKeys.has(key)) {
          nextTags.push(tag);
          continue;
        }
        replaced += 1;
        changed = true;
        if (!injectedTarget) {
          nextTags.push(normalizedTarget);
          injectedTarget = true;
        }
      }

      if (!changed) continue;
      item.tags = normalizeTags(nextTags);
      item.updatedAt = now;
      affected += 1;
    }

    return { affected, replaced, target: normalizedTarget };
  }

  app.get('/api/tags', async (req, res, next) => {
    try {
      const userId = String(req.auth?.user?.id || '');
      const db = scopeDbForUser(await dbRepo.read(), userId);
      res.json({ items: tagsSummary(db.bookmarks) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/tags/rename', async (req, res, next) => {
    try {
      const userId = String(req.auth?.user?.id || '');
      const from = String(req.body?.from || '').trim();
      const to = String(req.body?.to || '').trim();
      if (!from) return next(badRequest('from is required'));
      if (!to) return next(badRequest('to is required'));

      let result;
      await dbRepo.update((db) => {
        result = mergeTagsInBookmarks((db.bookmarks || []).filter((b) => hasOwner(b, userId)), [from], to);
        return db;
      });

      const snapshot = scopeDbForUser(await dbRepo.read(), userId);
      res.json({
        ok: true,
        mode: 'rename',
        from,
        to: result.target,
        affectedBookmarks: result.affected,
        replacedTags: result.replaced,
        items: tagsSummary(snapshot.bookmarks)
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/tags/merge', async (req, res, next) => {
    try {
      const userId = String(req.auth?.user?.id || '');
      const rawSources = Array.isArray(req.body?.sources) ? req.body.sources : [];
      const sources = rawSources.map((x) => String(x || '').trim()).filter(Boolean);
      const target = String(req.body?.target || '').trim();
      if (!sources.length) return next(badRequest('sources is required'));
      if (!target) return next(badRequest('target is required'));

      let result;
      await dbRepo.update((db) => {
        result = mergeTagsInBookmarks((db.bookmarks || []).filter((b) => hasOwner(b, userId)), sources, target);
        return db;
      });

      const snapshot = scopeDbForUser(await dbRepo.read(), userId);
      res.json({
        ok: true,
        mode: 'merge',
        sources,
        target: result.target,
        affectedBookmarks: result.affected,
        replacedTags: result.replaced,
        items: tagsSummary(snapshot.bookmarks)
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/tags/remove', async (req, res, next) => {
    try {
      const userId = String(req.auth?.user?.id || '');
      const tag = String(req.body?.tag || '').trim();
      if (!tag) return next(badRequest('tag is required'));
      const targetKey = tag.toLowerCase();

      let affectedBookmarks = 0;
      let removedTags = 0;
      const now = Date.now();

      await dbRepo.update((db) => {
        for (const item of (db.bookmarks || [])) {
          if (!hasOwner(item, userId)) continue;
          if (!Array.isArray(item.tags) || !item.tags.length) continue;
          const before = item.tags.length;
          const nextTags = item.tags.filter((t) => String(t || '').trim().toLowerCase() !== targetKey);
          if (nextTags.length === before) continue;
          item.tags = normalizeTags(nextTags);
          item.updatedAt = now;
          affectedBookmarks += 1;
          removedTags += (before - nextTags.length);
        }
        return db;
      });

      const snapshot = scopeDbForUser(await dbRepo.read(), userId);
      res.json({
        ok: true,
        mode: 'remove',
        tag,
        affectedBookmarks,
        removedTags,
        items: tagsSummary(snapshot.bookmarks)
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerTagRoutes
};
