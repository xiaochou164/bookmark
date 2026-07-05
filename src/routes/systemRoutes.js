const { scopeDbForUser } = require('../services/tenantScope');

function statusCounts(items = []) {
  return items.reduce((acc, item) => {
    const status = String(item?.status || 'unknown');
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function latestUpdatedAt(items = []) {
  return items.reduce((max, item) => Math.max(
    max,
    Number(item?.updatedAt || item?.completedAt || item?.startedAt || item?.createdAt || 0) || 0
  ), 0);
}

function summarizeRealtimeItems(items = []) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: list.length,
    counts: statusCounts(list),
    active: list.filter((item) => ['queued', 'running', 'processing'].includes(String(item?.status || ''))).length,
    latestUpdatedAt: latestUpdatedAt(list)
  };
}

function buildRealtimeSnapshot(db, userId) {
  const uid = String(userId || '');
  const scoped = scopeDbForUser(db, uid);
  const byUser = (items = []) => (Array.isArray(items) ? items : []).filter((item) => String(item?.userId || '') === uid);
  const now = Date.now();
  const remindersDue = (scoped.bookmarks || []).filter((bookmark) => {
    if (bookmark.deletedAt) return false;
    const reminderAt = Number(bookmark.reminderAt || 0);
    if (!reminderAt || reminderAt > now) return false;
    const status = String(bookmark.reminderState?.status || '');
    return !['dismissed', 'done', 'none'].includes(status);
  });
  const snapshot = {
    generatedAt: now,
    tasks: {
      metadata: summarizeRealtimeItems(scoped.metadataTasks || []),
      io: summarizeRealtimeItems(scoped.ioTasks || []),
      plugin: summarizeRealtimeItems(byUser(db.pluginTasks)),
      ai: summarizeRealtimeItems([
        ...byUser(db.aiSuggestionJobs),
        ...byUser(db.aiBatchTasks),
        ...byUser(db.aiBackfillTasks),
        ...byUser(db.aiRuleRuns)
      ])
    },
    reminders: {
      due: remindersDue.length,
      latestUpdatedAt: latestUpdatedAt(remindersDue)
    }
  };
  snapshot.signature = JSON.stringify({
    tasks: snapshot.tasks,
    reminders: snapshot.reminders
  });
  return snapshot;
}

function registerSystemRoutes(app, deps) {
  const { dbRepo, config, jobQueue, objectStorage, metrics, toFolderTree, bookmarkStats, tagsSummary } = deps;

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'cloud-bookmarks',
      queue: {
        requested: config?.queueBackend || 'memory',
        active: jobQueue?.backend || 'memory',
        meta: jobQueue?.meta || {}
      },
      objectStorage: {
        requested: config?.objectStorageBackend || 'local',
        active: objectStorage?.backend || 'local'
      }
    });
  });

  app.get('/api/metrics', (_req, res) => {
    res.json({
      ok: true,
      metrics: metrics?.snapshot?.({
        queue: {
          active: jobQueue?.backend || 'memory',
          meta: jobQueue?.meta || {}
        },
        objectStorage: {
          active: objectStorage?.backend || 'local'
        }
      }) || {}
    });
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

  app.get('/api/events-snapshot', async (req, res, next) => {
    try {
      const userId = String(req.auth?.user?.id || '');
      res.json(buildRealtimeSnapshot(await dbRepo.read(), userId));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/events', async (req, res, next) => {
    try {
      const userId = String(req.auth?.user?.id || '');
      res.status(200);
      res.set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders?.();

      let lastSignature = '';
      let lastPingAt = 0;
      const send = (event, payload) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      const tick = async ({ force = false } = {}) => {
        const snapshot = buildRealtimeSnapshot(await dbRepo.read(), userId);
        if (force || snapshot.signature !== lastSignature) {
          lastSignature = snapshot.signature;
          send('rainbow:update', snapshot);
        } else if (Date.now() - lastPingAt > 15_000) {
          lastPingAt = Date.now();
          send('rainbow:ping', { generatedAt: Date.now() });
        }
      };

      res.write('retry: 3000\n\n');
      await tick({ force: true });
      const timer = setInterval(() => {
        tick().catch((err) => {
          send('rainbow:error', { message: err.message || 'event stream failed' });
        });
      }, 2500);
      req.on('close', () => {
        clearInterval(timer);
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  buildRealtimeSnapshot,
  registerSystemRoutes
};
