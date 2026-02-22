function registerSystemRoutes(app, deps) {
  const { dbRepo, toFolderTree, bookmarkStats, tagsSummary } = deps;

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'cloud-bookmarks' });
  });

  app.get('/api/state', async (_req, res, next) => {
    try {
      const db = await dbRepo.read();
      res.json({
        folders: db.folders,
        foldersTree: toFolderTree(db.folders),
        bookmarks: db.bookmarks,
        stats: bookmarkStats(db.bookmarks),
        tags: tagsSummary(db.bookmarks)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/tags', async (_req, res, next) => {
    try {
      const db = await dbRepo.read();
      res.json({ items: tagsSummary(db.bookmarks) });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerSystemRoutes
};
