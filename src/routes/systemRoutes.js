const { scopeDbForUser } = require('../services/tenantScope');

function registerSystemRoutes(app, deps) {
  const { dbRepo, toFolderTree, bookmarkStats, tagsSummary } = deps;

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'cloud-bookmarks' });
  });

  app.get('/api/state', async (req, res, next) => {
    try {
      const userId = String(req.auth?.user?.id || '');
      const db = scopeDbForUser(await dbRepo.read(), userId);
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

  app.get('/api/tags', async (req, res, next) => {
    try {
      const userId = String(req.auth?.user?.id || '');
      const db = scopeDbForUser(await dbRepo.read(), userId);
      res.json({ items: tagsSummary(db.bookmarks) });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerSystemRoutes
};
