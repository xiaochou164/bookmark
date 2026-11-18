function registerProductDuplicateScanRoutes(app, { dbRepo, requireFeature, badRequest, normalizeUrlLoose, userBookmarks, userIdOf }) {
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
}

module.exports = { registerProductDuplicateScanRoutes };
