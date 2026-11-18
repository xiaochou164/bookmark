const crypto = require('node:crypto');

function registerProductBackupRoutes(app, { dbRepo, objectStorage, requireFeature, userFolders, userBookmarks, hasOwner, badRequest, notFound, userIdOf }) {
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
}

module.exports = { registerProductBackupRoutes };
