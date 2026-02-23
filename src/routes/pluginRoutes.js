function registerPluginRoutes(app, deps) {
  const { plugins } = deps;
  const userIdOf = (req) => String(req.auth?.user?.id || '');
  const summarizeByStatus = (items = []) =>
    items.reduce((acc, item) => {
      const key = String(item?.status || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  const hourlyFailureTrend = (items = [], { hours = 24, now = Date.now() } = {}) => {
    const buckets = [];
    const hourMs = 60 * 60 * 1000;
    const start = now - (hours - 1) * hourMs;
    for (let i = 0; i < hours; i += 1) {
      buckets.push({ ts: start + i * hourMs, failed: 0, total: 0 });
    }
    for (const item of items) {
      const t = Number(item?.finishedAt || item?.startedAt || item?.createdAt || 0);
      if (!t) continue;
      const index = Math.floor((t - start) / hourMs);
      if (index < 0 || index >= buckets.length) continue;
      buckets[index].total += 1;
      if (String(item?.status || '') === 'failed') buckets[index].failed += 1;
    }
    return buckets;
  };
  const summarizeRecentErrors = (items = [], limit = 10) => {
    const map = new Map();
    for (const item of items) {
      const status = String(item?.status || '');
      if (status !== 'failed') continue;
      const msg = String(item?.error?.message || 'Unknown error');
      const row = map.get(msg) || { message: msg, count: 0, lastAt: 0 };
      row.count += 1;
      row.lastAt = Math.max(row.lastAt, Number(item?.finishedAt || item?.startedAt || item?.createdAt || 0));
      map.set(msg, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).slice(0, limit);
  };

  app.get('/api/plugins', (_req, res) => {
    res.json({ items: plugins.list() });
  });

  app.get('/api/plugins/:id/config', async (req, res, next) => {
    try {
      const config = await plugins.getConfig(req.params.id, { userId: userIdOf(req) });
      res.json(config);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plugins/:id/schedule', async (req, res, next) => {
    try {
      const schedule = await plugins.getSchedule(req.params.id, { userId: userIdOf(req) });
      res.json(schedule);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plugins/:id/devices', async (req, res, next) => {
    try {
      const limit = Number(req.query?.limit || 50);
      const items = await plugins.listDevices(req.params.id, { limit, userId: userIdOf(req) });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/devices/register', async (req, res, next) => {
    try {
      const item = await plugins.registerDevice(req.params.id, req.body || {}, { userId: userIdOf(req) });
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/devices/:deviceId/status', async (req, res, next) => {
    try {
      const item = await plugins.reportDeviceStatus(req.params.id, req.params.deviceId, req.body || {}, { userId: userIdOf(req) });
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plugins/:id/devices/:deviceId/config', async (req, res, next) => {
    try {
      const bundle = await plugins.getConfigBundle(req.params.id, { deviceId: req.params.deviceId, userId: userIdOf(req) });
      res.json(bundle);
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/plugins/:id/schedule', async (req, res, next) => {
    try {
      const schedule = await plugins.setSchedule(req.params.id, req.body || {}, { userId: userIdOf(req) });
      res.json(schedule);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/schedule/pause', async (req, res, next) => {
    try {
      const schedule = await plugins.setSchedule(req.params.id, { paused: true }, { userId: userIdOf(req) });
      res.json({ ok: true, schedule });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/schedule/resume', async (req, res, next) => {
    try {
      const schedule = await plugins.setSchedule(req.params.id, { paused: false }, { userId: userIdOf(req) });
      res.json({ ok: true, schedule });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/schedule/tick', async (req, res, next) => {
    try {
      const force = typeof req.body?.force === 'undefined' ? true : Boolean(req.body.force);
      const result = await plugins.tickSchedulers({ pluginId: req.params.id, userId: userIdOf(req), force, source: 'api' });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/collections', async (req, res, next) => {
    try {
      const plugin = plugins.get(req.params.id);
      if (typeof plugin?.listCollections !== 'function') {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'collections not supported', details: null } });
        return;
      }
      const token = String(req.body?.token || '').trim();
      if (!token) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'token is required', details: null } });
        return;
      }
      const items = await plugin.listCollections({ token });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/plugins/:id/config', async (req, res, next) => {
    try {
      const config = await plugins.setConfig(req.params.id, req.body || {}, { userId: userIdOf(req) });
      res.json(config);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plugins/:id/state', async (req, res, next) => {
    try {
      const state = await plugins.getState(req.params.id, { userId: userIdOf(req) });
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plugins/:id/runs', async (req, res, next) => {
    try {
      const limit = Number(req.query?.limit || 20);
      const items = await plugins.listRuns(req.params.id, { limit, userId: userIdOf(req) });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plugins/:id/tasks', async (req, res, next) => {
    try {
      const limit = Number(req.query?.limit || 20);
      const items = await plugins.listTasks(req.params.id, { limit, userId: userIdOf(req) });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plugins/:id/audit', async (req, res, next) => {
    try {
      const [state, runs, tasks, schedule, devices] = await Promise.all([
        plugins.getState(req.params.id, { userId: userIdOf(req) }),
        plugins.listRuns(req.params.id, { limit: 20, userId: userIdOf(req) }),
        plugins.listTasks(req.params.id, { limit: 20, userId: userIdOf(req) }),
        plugins.getSchedule(req.params.id, { userId: userIdOf(req) }),
        plugins.listDevices(req.params.id, { limit: 20, userId: userIdOf(req) })
      ]);

      const mappingState = state?.mappingState || {};
      const tombstones = state?.tombstones || {};
      const mirrorIndex = state?.mirrorIndex || {};
      const tombstoneCounts = Object.fromEntries(Object.entries(tombstones).map(([k, v]) => [k, Object.keys(v || {}).length]));
      const mirrorCounts = Object.fromEntries(Object.entries(mirrorIndex).map(([k, v]) => [k, Object.keys(v || {}).length]));

      res.json({
        pluginId: req.params.id,
        generatedAt: Date.now(),
        lease: state?.lease || null,
        deviceId: state?.deviceId || null,
        schedule,
        mappingCursors: Object.fromEntries(
          Object.entries(mappingState).map(([k, v]) => [k, { cursor: Number(v?.cursor || 0), lastSuccessAt: Number(v?.lastSuccessAt || 0) }])
        ),
        counts: {
          mappings: Object.keys(mappingState).length,
          tombstoneMappings: Object.keys(tombstones).length,
          tombstones: Object.values(tombstoneCounts).reduce((a, b) => a + b, 0),
          mirrorMappings: Object.keys(mirrorIndex).length,
          mirrorEntries: Object.values(mirrorCounts).reduce((a, b) => a + b, 0),
          appliedOps: Object.keys(state?.appliedOps || {}).length,
          devices: devices.length
        },
        tombstoneCounts,
        mirrorCounts,
        recent: {
          taskStatusCounts: summarizeByStatus(tasks),
          runStatusCounts: summarizeByStatus(runs),
          latestDevices: devices.slice(0, 5),
          latestTask: tasks[0] || null,
          latestRun: runs[0] || null
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plugins/:id/health', async (req, res, next) => {
    try {
      const [schedule, tasks, runs, devices] = await Promise.all([
        plugins.getSchedule(req.params.id, { userId: userIdOf(req) }),
        plugins.listTasks(req.params.id, { limit: 200, userId: userIdOf(req) }),
        plugins.listRuns(req.params.id, { limit: 200, userId: userIdOf(req) }),
        plugins.listDevices(req.params.id, { limit: 50, userId: userIdOf(req) })
      ]);
      const now = Date.now();
      const activeTasks = tasks.filter((t) => t.status === 'queued' || t.status === 'running');
      const failedTasks = tasks.filter((t) => t.status === 'failed');
      const failedRuns = runs.filter((r) => r.status === 'failed');
      const staleRunningTasks = tasks.filter(
        (t) => t.status === 'running' && Number(t.startedAt || 0) > 0 && now - Number(t.startedAt || 0) > 5 * 60 * 1000
      );
      const offlineDevices = devices.filter((d) => Number(d.lastSeenAt || 0) > 0 && now - Number(d.lastSeenAt || 0) > 10 * 60 * 1000);

      res.json({
        pluginId: req.params.id,
        generatedAt: now,
        schedule: {
          ...schedule,
          nextRunInMs: schedule?.nextRunAt ? Math.max(0, Number(schedule.nextRunAt) - now) : 0
        },
        queue: {
          activeTasks: activeTasks.length,
          queued: tasks.filter((t) => t.status === 'queued').length,
          running: tasks.filter((t) => t.status === 'running').length,
          staleRunningTasks: staleRunningTasks.slice(0, 20)
        },
        statusCounts: {
          tasks: summarizeByStatus(tasks),
          runs: summarizeByStatus(runs),
          devices: summarizeByStatus(devices)
        },
        failures: {
          tasks24hTrend: hourlyFailureTrend(tasks, { hours: 24, now }),
          runs24hTrend: hourlyFailureTrend(runs, { hours: 24, now }),
          recentTaskErrors: summarizeRecentErrors(tasks, 8),
          recentRunErrors: summarizeRecentErrors(runs, 8),
          totals: {
            failedTasks: failedTasks.length,
            failedRuns: failedRuns.length
          }
        },
        devices: {
          total: devices.length,
          offlineCount: offlineDevices.length,
          latest: devices.slice(0, 10),
          offline: offlineDevices.slice(0, 10)
        },
        healthFlags: {
          schedulerEnabled: Boolean(schedule?.enabled),
          schedulerPaused: Boolean(schedule?.paused),
          hasQueueBacklog: activeTasks.length > Number(schedule?.maxConcurrent || 1),
          hasStaleRunningTasks: staleRunningTasks.length > 0,
          hasOfflineDevices: offlineDevices.length > 0,
          hasRecentFailures: failedTasks.length > 0 || failedRuns.length > 0
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plugins/:id/tasks/:taskId', async (req, res, next) => {
    try {
      const item = await plugins.getTask(req.params.id, req.params.taskId, { userId: userIdOf(req) });
      if (!item) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'task not found', details: null } });
        return;
      }
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/tasks', async (req, res, next) => {
    try {
      const kind = String(req.body?.kind || 'run');
      if (kind !== 'run') {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'only kind=run supported', details: null } });
        return;
      }
      const task = await plugins.enqueueRunTask(req.params.id, req.body?.input || {}, {
        idempotencyKey: req.body?.idempotencyKey || ''
      }, { userId: userIdOf(req) });
      res.status(202).json({ ok: true, task });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/tasks/:taskId/retry', async (req, res, next) => {
    try {
      const task = await plugins.retryTask(req.params.id, req.params.taskId, { userId: userIdOf(req) });
      res.status(202).json({ ok: true, task, mode: 'retry' });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/tasks/:taskId/replay', async (req, res, next) => {
    try {
      const task = await plugins.replayTask(req.params.id, req.params.taskId, { userId: userIdOf(req) });
      res.status(202).json({ ok: true, task, mode: 'replay' });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/preview', async (req, res, next) => {
    try {
      const result = await plugins.preview(req.params.id, req.body || {}, { userId: userIdOf(req) });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plugins/:id/run', async (req, res, next) => {
    try {
      const result = await plugins.run(req.params.id, req.body || {}, { userId: userIdOf(req) });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerPluginRoutes
};
