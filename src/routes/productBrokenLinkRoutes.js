function registerProductBrokenLinkRoutes(app, { dbRepo, userBookmarks, requireFeature, badRequest, userIdOf }) {
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
}

module.exports = { registerProductBrokenLinkRoutes };
