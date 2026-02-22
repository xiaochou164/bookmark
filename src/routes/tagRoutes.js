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

  app.get('/api/tags', async (_req, res, next) => {
    try {
      const db = await dbRepo.read();
      res.json({ items: tagsSummary(db.bookmarks) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/tags/rename', async (req, res, next) => {
    try {
      const from = String(req.body?.from || '').trim();
      const to = String(req.body?.to || '').trim();
      if (!from) return next(badRequest('from is required'));
      if (!to) return next(badRequest('to is required'));

      let result;
      await dbRepo.update((db) => {
        result = mergeTagsInBookmarks(db.bookmarks, [from], to);
        return db;
      });

      const snapshot = await dbRepo.read();
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
      const rawSources = Array.isArray(req.body?.sources) ? req.body.sources : [];
      const sources = rawSources.map((x) => String(x || '').trim()).filter(Boolean);
      const target = String(req.body?.target || '').trim();
      if (!sources.length) return next(badRequest('sources is required'));
      if (!target) return next(badRequest('target is required'));

      let result;
      await dbRepo.update((db) => {
        result = mergeTagsInBookmarks(db.bookmarks, sources, target);
        return db;
      });

      const snapshot = await dbRepo.read();
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
}

module.exports = {
  registerTagRoutes
};
