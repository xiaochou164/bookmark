function registerReminderRoutes(app, deps) {
  const { dbRepo, reminders, badRequest, notFound } = deps;

  app.get('/api/reminders', async (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 20) || 20));
      const out = await reminders.getOverview({ limit });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/reminders/scan', async (_req, res, next) => {
    try {
      const out = await reminders.scanDueReminders();
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/reminder/dismiss', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const item = await reminders.dismissBookmarkReminder(id);
      res.json({ ok: true, item });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/reminder/snooze', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const until = typeof req.body?.until !== 'undefined' ? Number(req.body.until) : undefined;
      const minutes = typeof req.body?.minutes !== 'undefined' ? Number(req.body.minutes) : 60;
      if ((typeof until !== 'undefined' && !Number.isFinite(until)) || !Number.isFinite(minutes)) {
        return next(badRequest('invalid snooze payload'));
      }
      const item = await reminders.snoozeBookmarkReminder(id, { until, minutes });
      res.json({ ok: true, item });
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg === 'bookmark not found') return next(notFound('bookmark not found'));
      if (msg === 'invalid snooze time') return next(badRequest(msg));
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/reminder/clear', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const now = Date.now();
      let item = null;
      await dbRepo.update((db) => {
        const found = (db.bookmarks || []).find((b) => String(b.id) === id && !b.deletedAt);
        if (!found) return db;
        found.reminderAt = null;
        found.reminderState = {
          ...(found.reminderState || {}),
          status: 'none',
          snoozedUntil: 0,
          updatedAt: now
        };
        found.updatedAt = now;
        item = found;
        return db;
      });
      if (!item) return next(notFound('bookmark not found'));
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerReminderRoutes
};
