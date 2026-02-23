const PLUGIN_RUN_HISTORY_LIMIT = 300;
const PLUGIN_TASK_HISTORY_LIMIT = 300;
const DEFAULT_SCHEDULER_TICK_MS = 15_000;
const { hasOwner, pluginScopeKey, parsePluginScopeKey } = require('./services/tenantScope');

function defaultScheduleConfig() {
  return {
    enabled: false,
    paused: false,
    intervalMinutes: 15,
    maxConcurrent: 1,
    windowEnabled: false,
    windowStartHour: 0,
    windowEndHour: 24,
    createdAt: 0,
    updatedAt: 0,
    lastTickAt: 0,
    lastEnqueuedAt: 0,
    nextRunAt: 0,
    lastTaskId: null,
    lastSkipReason: '',
    lastError: null
  };
}

function normalizeHour(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(24, Math.floor(n)));
}

function normalizeScheduleConfig(input = {}, prev = {}, options = {}) {
  const base = { ...defaultScheduleConfig(), ...(prev || {}) };
  const now = Date.now();
  const touch = options.touch !== false;
  const intervalMinutes = Math.max(1, Math.min(24 * 60, Number(input.intervalMinutes ?? base.intervalMinutes) || base.intervalMinutes));
  const maxConcurrent = Math.max(1, Math.min(10, Number(input.maxConcurrent ?? base.maxConcurrent) || base.maxConcurrent));
  const windowStartHour = normalizeHour(input.windowStartHour ?? base.windowStartHour, 0);
  const windowEndHour = normalizeHour(input.windowEndHour ?? base.windowEndHour, 24);
  const enabled = typeof input.enabled === 'undefined' ? Boolean(base.enabled) : Boolean(input.enabled);
  const paused = typeof input.paused === 'undefined' ? Boolean(base.paused) : Boolean(input.paused);
  const windowEnabled = typeof input.windowEnabled === 'undefined' ? Boolean(base.windowEnabled) : Boolean(input.windowEnabled);
  return {
    ...base,
    enabled,
    paused,
    intervalMinutes,
    maxConcurrent,
    windowEnabled,
    windowStartHour,
    windowEndHour,
    createdAt: Number(base.createdAt || now),
    updatedAt: touch ? now : Number(base.updatedAt || base.createdAt || now)
  };
}

function withinRunWindow(schedule, now = Date.now()) {
  if (!schedule?.windowEnabled) return true;
  const start = normalizeHour(schedule.windowStartHour, 0);
  const end = normalizeHour(schedule.windowEndHour, 24);
  if (start === end) return true;
  const hour = new Date(now).getHours();
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function safeErrorInfo(err) {
  return {
    name: String(err?.name || 'Error'),
    message: String(err?.message || 'Unknown error')
  };
}

function summarizePluginResult(result) {
  if (!result || typeof result !== 'object') return result;
  const summary = {
    pluginId: result.pluginId || null,
    mode: result.mode || null,
    totals: result.totals || null
  };
  if (Array.isArray(result.mappings)) {
    summary.mappings = result.mappings.slice(0, 20).map((m) => ({
      mappingId: m.mappingId,
      folderName: m.folderName,
      collectionId: m.collectionId,
      deleteSync: m.deleteSync,
      localTotal: m.localTotal,
      remoteTotal: m.remoteTotal,
      createdRemote: m.createdRemote,
      createdLocal: m.createdLocal,
      updatedRemoteTitle: m.updatedRemoteTitle,
      deletedRemote: m.deletedRemote,
      deletedLocal: m.deletedLocal,
      cursorBefore: m.cursorBefore,
      cursorAfter: m.cursorAfter,
      samples: Array.isArray(m.samples) ? m.samples.slice(0, 12) : []
    }));
  }
  return summary;
}

function defaultConfigMeta() {
  return {
    revision: 0,
    updatedAt: 0
  };
}

function normalizeConfigMeta(input = {}, prev = {}) {
  const base = { ...defaultConfigMeta(), ...(prev || {}) };
  return {
    revision: Math.max(0, Number(input.revision ?? base.revision) || 0),
    updatedAt: Math.max(0, Number(input.updatedAt ?? base.updatedAt) || 0)
  };
}

function defaultDeviceRecord(deviceId = '') {
  return {
    deviceId: String(deviceId || ''),
    createdAt: 0,
    updatedAt: 0,
    firstSeenAt: 0,
    lastSeenAt: 0,
    platform: '',
    app: '',
    appVersion: '',
    extensionVersion: '',
    syncBackend: '',
    cloudApiBaseUrl: '',
    capabilities: [],
    status: 'unknown',
    lastSyncStatus: null,
    lastSyncAt: 0,
    lastError: '',
    lastConfigPullAt: 0,
    configRevisionSeen: 0,
    configUpdatedAtSeen: 0,
    meta: {}
  };
}

function normalizeDevicePatch(input = {}) {
  const out = {};
  if (typeof input.platform !== 'undefined') out.platform = String(input.platform || '');
  if (typeof input.app !== 'undefined') out.app = String(input.app || '');
  if (typeof input.appVersion !== 'undefined') out.appVersion = String(input.appVersion || '');
  if (typeof input.extensionVersion !== 'undefined') out.extensionVersion = String(input.extensionVersion || '');
  if (typeof input.syncBackend !== 'undefined') out.syncBackend = String(input.syncBackend || '');
  if (typeof input.cloudApiBaseUrl !== 'undefined') out.cloudApiBaseUrl = String(input.cloudApiBaseUrl || '');
  if (typeof input.status !== 'undefined') out.status = String(input.status || 'unknown');
  if (typeof input.lastError !== 'undefined') out.lastError = String(input.lastError || '');
  if (typeof input.lastSeenAt !== 'undefined') out.lastSeenAt = Math.max(0, Number(input.lastSeenAt || 0) || 0);
  if (typeof input.lastSyncAt !== 'undefined') out.lastSyncAt = Math.max(0, Number(input.lastSyncAt || 0) || 0);
  if (typeof input.lastConfigPullAt !== 'undefined') out.lastConfigPullAt = Math.max(0, Number(input.lastConfigPullAt || 0) || 0);
  if (typeof input.configRevisionSeen !== 'undefined') out.configRevisionSeen = Math.max(0, Number(input.configRevisionSeen || 0) || 0);
  if (typeof input.configUpdatedAtSeen !== 'undefined') out.configUpdatedAtSeen = Math.max(0, Number(input.configUpdatedAtSeen || 0) || 0);
  if (typeof input.lastSyncStatus !== 'undefined') out.lastSyncStatus = input.lastSyncStatus;
  if (typeof input.meta !== 'undefined' && input.meta && typeof input.meta === 'object') out.meta = input.meta;
  if (typeof input.capabilities !== 'undefined') {
    const arr = Array.isArray(input.capabilities) ? input.capabilities : [];
    out.capabilities = [...new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))];
  }
  return out;
}

class PluginManager {
  constructor({ store, jobQueue = null }) {
    this.store = store;
    this.plugins = new Map();
    this.jobQueue = jobQueue || null;
    this.pluginRunQueue = null;
    this.taskQueue = [];
    this.taskLoopRunning = false;
    this.schedulerTimer = null;
    this.schedulerTickMs = DEFAULT_SCHEDULER_TICK_MS;
    this.schedulerLoopRunning = false;

    if (this.jobQueue && typeof this.jobQueue.createProcessorQueue === 'function') {
      this.pluginRunQueue = this.jobQueue.createProcessorQueue('plugin-run', {
        concurrency: 1,
        handler: async (payload) => {
          await this.processTask(payload || {});
        }
      });
    }
  }

  register(plugin) {
    if (!plugin?.id) throw new Error('Plugin must have id');
    this.plugins.set(plugin.id, plugin);
  }

  _scope(pluginId, { userId = '' } = {}) {
    const id = String(pluginId || '');
    this.get(id);
    const uid = String(userId || '').trim();
    return {
      pluginId: id,
      userId: uid,
      key: uid ? pluginScopeKey(uid, id) : id
    };
  }

  _scopeTaskRecord(record, userId) {
    if (!userId) return true;
    return String(record?.userId || '') === String(userId);
  }

  _buildPluginRunDb(fullDb, { pluginId, userId }) {
    if (!userId) {
      return {
        pluginDb: fullDb,
        mergeInto: (db, nextDb) => nextDb || db
      };
    }

    const scopeKey = pluginScopeKey(userId, pluginId);
    const folders = (fullDb.folders || []).filter((f) => hasOwner(f, userId)).map((f) => structuredClone(f));
    const bookmarks = (fullDb.bookmarks || []).filter((b) => hasOwner(b, userId)).map((b) => structuredClone(b));
    const pluginDb = {
      ...fullDb,
      folders,
      bookmarks,
      pluginState: {
        ...(fullDb.pluginState || {}),
        [pluginId]: structuredClone((fullDb.pluginState || {})[scopeKey] || {})
      }
    };

    return {
      pluginDb,
      mergeInto: (db, nextDb) => {
        const source = nextDb || pluginDb;
        db.folders = [
          ...(db.folders || []).filter((f) => !hasOwner(f, userId)),
          ...((source.folders || []).map((f) => ({ ...f, userId })))
        ];
        db.bookmarks = [
          ...(db.bookmarks || []).filter((b) => !hasOwner(b, userId)),
          ...((source.bookmarks || []).map((b) => ({ ...b, userId })))
        ];
        db.pluginState = db.pluginState || {};
        db.pluginState[scopeKey] = structuredClone(
          (source.pluginState && source.pluginState[pluginId]) || (pluginDb.pluginState && pluginDb.pluginState[pluginId]) || {}
        );
        return db;
      }
    };
  }

  list() {
    return [...this.plugins.values()].map((p) => ({ id: p.id, name: p.name, description: p.description }));
  }

  get(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin not found: ${id}`);
    return plugin;
  }

  async getConfig(id, ctx = {}) {
    const scope = this._scope(id, ctx);
    const db = await this.store.read();
    return db.pluginConfigs?.[scope.key] || {};
  }

  async getConfigMeta(id, ctx = {}) {
    const scope = this._scope(id, ctx);
    const db = await this.store.read();
    return normalizeConfigMeta(db.pluginConfigMeta?.[scope.key] || {});
  }

  async setConfig(id, config, ctx = {}) {
    const scope = this._scope(id, ctx);
    const plugin = this.get(scope.pluginId);
    const nextConfig = { ...(plugin.defaultConfig ? plugin.defaultConfig() : {}), ...(config || {}) };
    const now = Date.now();
    await this.store.update((db) => {
      db.pluginConfigs[scope.key] = nextConfig;
      db.pluginConfigMeta = db.pluginConfigMeta || {};
      const prevMeta = normalizeConfigMeta(db.pluginConfigMeta[scope.key] || {});
      db.pluginConfigMeta[scope.key] = {
        revision: Number(prevMeta.revision || 0) + 1,
        updatedAt: now
      };
      return db;
    });
    return nextConfig;
  }

  async getState(id, ctx = {}) {
    const scope = this._scope(id, ctx);
    const db = await this.store.read();
    return db.pluginState?.[scope.key] || {};
  }

  async getConfigBundle(id, { deviceId = '', userId = '' } = {}) {
    const scope = this._scope(id, { userId });
    const [config, meta, schedule] = await Promise.all([
      this.getConfig(scope.pluginId, { userId: scope.userId }),
      this.getConfigMeta(scope.pluginId, { userId: scope.userId }),
      this.getSchedule(scope.pluginId, { userId: scope.userId })
    ]);
    const servedAt = Date.now();
    if (deviceId) {
      await this.upsertDevice(scope.pluginId, String(deviceId), {
        userId: scope.userId,
        status: 'online',
        lastSeenAt: servedAt,
        lastConfigPullAt: servedAt,
        configRevisionSeen: Number(meta.revision || 0),
        configUpdatedAtSeen: Number(meta.updatedAt || 0)
      });
    }
    return {
      pluginId: scope.pluginId,
      servedAt,
      config,
      configMeta: meta,
      schedule
    };
  }

  async upsertDevice(id, deviceId, patch = {}, ctx = {}) {
    const scope = this._scope(id, { userId: patch.userId || ctx.userId || '' });
    const did = String(deviceId || '').trim();
    if (!did) throw new Error('deviceId is required');

    let out;
    await this.store.update((db) => {
      db.pluginDevices = db.pluginDevices || {};
      db.pluginDevices[scope.key] = db.pluginDevices[scope.key] || {};
      const now = Date.now();
      const prev = db.pluginDevices[scope.key][did] || defaultDeviceRecord(did);
      const nextPatch = normalizeDevicePatch(patch);
      out = {
        ...prev,
        ...nextPatch,
        deviceId: did,
        createdAt: Number(prev.createdAt || now),
        updatedAt: now,
        firstSeenAt: Number(prev.firstSeenAt || nextPatch.lastSeenAt || now),
        lastSeenAt: Number(nextPatch.lastSeenAt || prev.lastSeenAt || now)
      };
      db.pluginDevices[scope.key][did] = out;
      return db;
    });
    return out;
  }

  async registerDevice(id, payload = {}, ctx = {}) {
    const now = Date.now();
    const deviceId = String(payload.deviceId || '').trim();
    if (!deviceId) throw new Error('deviceId is required');
    return this.upsertDevice(
      id,
      deviceId,
      {
        ...payload,
        status: payload.status || 'online',
        lastSeenAt: now
      },
      { userId: payload.userId || ctx.userId || '' }
    );
  }

  async reportDeviceStatus(id, deviceId, payload = {}, ctx = {}) {
    const now = Date.now();
    return this.upsertDevice(id, deviceId, { ...payload, lastSeenAt: now }, { userId: payload.userId || ctx.userId || '' });
  }

  async listDevices(id, { limit = 50, userId = '' } = {}) {
    const scope = this._scope(id, { userId });
    const n = Math.max(1, Math.min(500, Number(limit) || 50));
    const db = await this.store.read();
    const records = Object.values((db.pluginDevices?.[scope.key] || {}))
      .map((x) => ({ ...defaultDeviceRecord(x?.deviceId), ...x }))
      .sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0));
    return records.slice(0, n);
  }

  async getSchedule(id, ctx = {}) {
    const scope = this._scope(id, ctx);
    const db = await this.store.read();
    const raw = db.pluginSchedules?.[scope.key] || {};
    const normalized = normalizeScheduleConfig(raw, raw, { touch: false });
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await this.store.update((nextDb) => {
        nextDb.pluginSchedules = nextDb.pluginSchedules || {};
        nextDb.pluginSchedules[scope.key] = normalized;
        return nextDb;
      });
    }
    return normalized;
  }

  async setSchedule(id, patch = {}, ctx = {}) {
    const scope = this._scope(id, ctx);
    let nextSchedule;
    await this.store.update((db) => {
      db.pluginSchedules = db.pluginSchedules || {};
      const prev = db.pluginSchedules[scope.key] || {};
      nextSchedule = normalizeScheduleConfig(patch, prev);
      if (typeof patch.nextRunAt !== 'undefined') {
        nextSchedule.nextRunAt = Number(patch.nextRunAt || 0);
      } else if (typeof prev.nextRunAt === 'undefined' || Number(prev.nextRunAt || 0) <= 0) {
        nextSchedule.nextRunAt = nextSchedule.enabled ? Date.now() + nextSchedule.intervalMinutes * 60_000 : 0;
      }
      db.pluginSchedules[scope.key] = nextSchedule;
      return db;
    });
    return nextSchedule;
  }

  async patchScheduleStatus(id, patch = {}, ctx = {}) {
    const scope = this._scope(id, ctx);
    let nextSchedule;
    await this.store.update((db) => {
      db.pluginSchedules = db.pluginSchedules || {};
      const prev = normalizeScheduleConfig(db.pluginSchedules[scope.key] || {}, db.pluginSchedules[scope.key] || {}, { touch: false });
      nextSchedule = { ...prev, ...patch, updatedAt: Date.now() };
      db.pluginSchedules[scope.key] = nextSchedule;
      return db;
    });
    return nextSchedule;
  }

  startScheduler({ tickMs } = {}) {
    if (this.schedulerTimer) return;
    if (tickMs && Number(tickMs) > 0) {
      this.schedulerTickMs = Math.max(1000, Number(tickMs));
    }
    this.schedulerTimer = setInterval(() => {
      this.tickSchedulers().catch((err) => {
        console.error('plugin scheduler tick failed', err);
      });
    }, this.schedulerTickMs);
    if (typeof this.schedulerTimer.unref === 'function') {
      this.schedulerTimer.unref();
    }
  }

  stopScheduler() {
    if (!this.schedulerTimer) return;
    clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
  }

  async tickSchedulers({ pluginId = null, userId = '', force = false, source = 'scheduler' } = {}) {
    if (this.schedulerLoopRunning && !force) {
      return { ok: true, busy: true, tickedAt: Date.now(), source, results: [] };
    }
    if (this.schedulerLoopRunning && force) {
      return { ok: true, busy: true, tickedAt: Date.now(), source, results: [] };
    }

    this.schedulerLoopRunning = true;
    const tickedAt = Date.now();
    try {
      const db = await this.store.read();
      const schedules = db.pluginSchedules || {};
      const taskItems = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
      const requestedPluginId = pluginId ? String(pluginId) : '';
      const requestedUserId = String(userId || '').trim();
      const targets = requestedPluginId
        ? [
            {
              pluginId: requestedPluginId,
              userId: requestedUserId,
              scheduleKey: requestedUserId ? pluginScopeKey(requestedUserId, requestedPluginId) : requestedPluginId,
              raw: schedules[requestedUserId ? pluginScopeKey(requestedUserId, requestedPluginId) : requestedPluginId] || {}
            }
          ]
        : Object.entries(schedules).map(([key, raw]) => {
            const parsed = parsePluginScopeKey(key);
            return {
              pluginId: parsed ? parsed.pluginId : key,
              userId: parsed ? parsed.userId : '',
              scheduleKey: key,
              raw: raw || {}
            };
          });
      const results = [];

      for (const target of targets) {
        const id = target.pluginId;
        const targetUserId = String(target.userId || '').trim();
        this.get(id);
        const schedule = normalizeScheduleConfig(target.raw || {}, target.raw || {});
        const activeCount = taskItems.filter(
          (t) =>
            t.pluginId === id &&
            this._scopeTaskRecord(t, targetUserId) &&
            (t.status === 'queued' || t.status === 'running')
        ).length;
        const intervalMs = Math.max(1, Number(schedule.intervalMinutes || 15)) * 60_000;
        const dueAt = Number(schedule.nextRunAt || (schedule.lastEnqueuedAt ? Number(schedule.lastEnqueuedAt) + intervalMs : 0) || 0);
        let action = 'skipped';
        let reason = '';
        let task = null;
        let patch = { lastTickAt: tickedAt, lastError: null };

        if (!schedule.enabled) {
          reason = 'disabled';
          patch.lastSkipReason = reason;
          if (!schedule.nextRunAt) patch.nextRunAt = 0;
        } else if (schedule.paused) {
          reason = 'paused';
          patch.lastSkipReason = reason;
        } else if (!withinRunWindow(schedule, tickedAt)) {
          reason = 'outside_window';
          patch.lastSkipReason = reason;
        } else if (activeCount >= Number(schedule.maxConcurrent || 1)) {
          reason = 'max_concurrent';
          patch.lastSkipReason = reason;
        } else if (!force && dueAt > 0 && tickedAt < dueAt) {
          reason = 'not_due';
          patch.lastSkipReason = reason;
        } else {
          try {
            task = await this.enqueueRunTask(id, {}, {
              idempotencyKey: `sched:${id}:${Math.floor(tickedAt / intervalMs)}`
            }, { userId: targetUserId });
            action = task?.deduped ? 'deduped' : 'enqueued';
            reason = task?.deduped ? 'idempotent_active_task' : '';
            patch = {
              ...patch,
              lastSkipReason: reason,
              lastTaskId: task?.id || null,
              lastEnqueuedAt: tickedAt,
              nextRunAt: tickedAt + intervalMs
            };
          } catch (err) {
            action = 'error';
            reason = String(err?.message || err || 'Unknown error');
            patch = {
              ...patch,
              lastSkipReason: 'enqueue_error',
              lastError: safeErrorInfo(err)
            };
          }
        }

        const savedSchedule = await this.patchScheduleStatus(id, patch, { userId: targetUserId });
        results.push({
          pluginId: id,
          userId: targetUserId || null,
          action,
          reason,
          activeCount,
          schedule: savedSchedule,
          task: task || null
        });
      }

      return { ok: true, busy: false, tickedAt, source, force: Boolean(force), results };
    } finally {
      this.schedulerLoopRunning = false;
    }
  }

  async listRuns(id, { limit = 20, userId = '' } = {}) {
    const scope = this._scope(id, { userId });
    const n = Math.max(1, Math.min(200, Number(limit) || 20));
    const db = await this.store.read();
    const items = Array.isArray(db.pluginRuns) ? db.pluginRuns : [];
    return items
      .filter((x) => x.pluginId === scope.pluginId && this._scopeTaskRecord(x, scope.userId))
      .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0))
      .slice(0, n);
  }

  async appendRunRecord(record) {
    await this.store.update((db) => {
      db.pluginRuns = Array.isArray(db.pluginRuns) ? db.pluginRuns : [];
      db.pluginRuns.push(record);
      if (db.pluginRuns.length > PLUGIN_RUN_HISTORY_LIMIT) {
        db.pluginRuns = db.pluginRuns
          .sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0))
          .slice(-PLUGIN_RUN_HISTORY_LIMIT);
      }
      return db;
    });
  }

  async listTasks(id, { limit = 20, userId = '' } = {}) {
    const scope = this._scope(id, { userId });
    const n = Math.max(1, Math.min(200, Number(limit) || 20));
    const db = await this.store.read();
    const items = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
    return items
      .filter((x) => x.pluginId === scope.pluginId && this._scopeTaskRecord(x, scope.userId))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, n);
  }

  async getTask(id, taskId, ctx = {}) {
    const scope = this._scope(id, ctx);
    const db = await this.store.read();
    const items = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
    return items.find((x) => x.pluginId === scope.pluginId && x.id === taskId && this._scopeTaskRecord(x, scope.userId)) || null;
  }

  async appendTaskRecord(record) {
    await this.store.update((db) => {
      db.pluginTasks = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
      db.pluginTasks.push(record);
      if (db.pluginTasks.length > PLUGIN_TASK_HISTORY_LIMIT) {
        db.pluginTasks = db.pluginTasks
          .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
          .slice(-PLUGIN_TASK_HISTORY_LIMIT);
      }
      return db;
    });
  }

  async patchTaskRecord(taskId, patch, ctx = {}) {
    await this.store.update((db) => {
      db.pluginTasks = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
      const userId = String(ctx.userId || '').trim();
      const item = db.pluginTasks.find((x) => x.id === taskId && (!userId || this._scopeTaskRecord(x, userId)));
      if (item) Object.assign(item, patch || {});
      return db;
    });
  }

  async findActiveTaskByIdempotency(id, idempotencyKey, ctx = {}) {
    if (!idempotencyKey) return null;
    const scope = this._scope(id, ctx);
    const db = await this.store.read();
    const items = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
    return (
      items
        .filter(
          (x) =>
            x.pluginId === scope.pluginId &&
            this._scopeTaskRecord(x, scope.userId) &&
            x.idempotencyKey === idempotencyKey &&
            (x.status === 'queued' || x.status === 'running')
        )
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null
    );
  }

  async enqueueRunTask(id, inputConfig, meta = {}, ctx = {}) {
    const scope = this._scope(id, ctx);
    const idempotencyKey = String(meta?.idempotencyKey || '').trim();
    if (idempotencyKey) {
      const existing = await this.findActiveTaskByIdempotency(scope.pluginId, idempotencyKey, { userId: scope.userId });
      if (existing) {
        return { ...existing, deduped: true };
      }
    }
    const createdAt = Date.now();
    const task = {
      id: `ptask_${crypto.randomUUID()}`,
      pluginId: scope.pluginId,
      userId: scope.userId || '',
      type: 'run',
      status: 'queued',
      createdAt,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      configKeys: Object.keys(inputConfig || {}),
      inputSnapshot: structuredClone(inputConfig || {}),
      idempotencyKey: idempotencyKey || null,
      sourceTaskId: meta?.sourceTaskId ? String(meta.sourceTaskId) : null,
      replayReason: meta?.replayReason ? String(meta.replayReason) : null,
      runLogId: null,
      resultSummary: null,
      error: null
    };

    await this.appendTaskRecord(task);
    const jobPayload = { taskId: task.id, pluginId: scope.pluginId, userId: scope.userId || '', inputConfig: inputConfig || {} };
    try {
      if (this.pluginRunQueue && typeof this.pluginRunQueue.enqueue === 'function') {
        await this.pluginRunQueue.enqueue(jobPayload, {
          jobId: `ptask:${task.id}`
        });
      } else {
        this.taskQueue.push(jobPayload);
        setTimeout(() => {
          this.kickTaskLoop().catch((err) => {
            console.error('plugin task loop failed', err);
          });
        }, 0);
      }
    } catch (err) {
      await this.patchTaskRecord(task.id, {
        status: 'failed',
        finishedAt: Date.now(),
        error: safeErrorInfo(err)
      }, { userId: scope.userId || '' });
      throw err;
    }
    return task;
  }

  async retryTask(id, taskId, ctx = {}) {
    const scope = this._scope(id, ctx);
    const task = await this.getTask(scope.pluginId, taskId, { userId: scope.userId });
    if (!task) throw new Error('task not found');
    return this.enqueueRunTask(scope.pluginId, task.inputSnapshot || {}, {
      sourceTaskId: task.id,
      replayReason: 'retry_failed',
      idempotencyKey: ''
    }, { userId: scope.userId || task.userId || '' });
  }

  async replayTask(id, taskId, ctx = {}) {
    const scope = this._scope(id, ctx);
    const task = await this.getTask(scope.pluginId, taskId, { userId: scope.userId });
    if (!task) throw new Error('task not found');
    return this.enqueueRunTask(scope.pluginId, task.inputSnapshot || {}, {
      sourceTaskId: task.id,
      replayReason: 'replay_manual',
      idempotencyKey: ''
    }, { userId: scope.userId || task.userId || '' });
  }

  async kickTaskLoop() {
    if (this.taskLoopRunning) return;
    this.taskLoopRunning = true;
    try {
      while (this.taskQueue.length) {
        const job = this.taskQueue.shift();
        if (!job) continue;
        await this.processTask(job);
      }
    } finally {
      this.taskLoopRunning = false;
      if (this.taskQueue.length) {
        this.kickTaskLoop().catch((err) => {
          console.error('plugin task loop restart failed', err);
        });
      }
    }
  }

  async processTask(job) {
    const startedAt = Date.now();
    await this.patchTaskRecord(job.taskId, {
      status: 'running',
      startedAt,
      error: null
    }, { userId: job.userId || '' });

    try {
      const result = await this.run(job.pluginId, job.inputConfig, { userId: job.userId || '' });
      const finishedAt = Date.now();
      await this.patchTaskRecord(job.taskId, {
        status: 'succeeded',
        finishedAt,
        durationMs: finishedAt - startedAt,
        runLogId: result?.task?.id || null,
        resultSummary: summarizePluginResult(result),
        error: null
      }, { userId: job.userId || '' });
    } catch (err) {
      const finishedAt = Date.now();
      await this.patchTaskRecord(job.taskId, {
        status: 'failed',
        finishedAt,
        durationMs: finishedAt - startedAt,
        runLogId: err?.runLogId || null,
        error: safeErrorInfo(err)
      }, { userId: job.userId || '' });
    }
  }

  async preview(id, inputConfig, ctx = {}) {
    const scope = this._scope(id, ctx);
    const plugin = this.get(scope.pluginId);
    const savedConfig = await this.getConfig(scope.pluginId, { userId: scope.userId });
    const effectiveConfig = { ...(plugin.defaultConfig ? plugin.defaultConfig() : {}), ...savedConfig, ...(inputConfig || {}) };
    const startedAt = Date.now();
    const runId = `prun_${crypto.randomUUID()}`;
    try {
      const db = await this.store.read();
      const { pluginDb } = this._buildPluginRunDb(db, { pluginId: scope.pluginId, userId: scope.userId });
      const result = await plugin.run({ mode: 'preview', config: effectiveConfig, db: pluginDb, now: Date.now() });
      const finishedAt = Date.now();
      await this.appendRunRecord({
        id: runId,
        pluginId: scope.pluginId,
        userId: scope.userId || '',
        type: 'preview',
        status: 'succeeded',
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        configKeys: Object.keys(inputConfig || {}),
        resultSummary: summarizePluginResult(result)
      });
      return { ...result, task: { id: runId, type: 'preview', status: 'succeeded', startedAt, finishedAt } };
    } catch (err) {
      const finishedAt = Date.now();
      await this.appendRunRecord({
        id: runId,
        pluginId: scope.pluginId,
        userId: scope.userId || '',
        type: 'preview',
        status: 'failed',
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        configKeys: Object.keys(inputConfig || {}),
        error: safeErrorInfo(err)
      });
      throw err;
    }
  }

  async run(id, inputConfig, ctx = {}) {
    const scope = this._scope(id, ctx);
    const plugin = this.get(scope.pluginId);
    const savedConfig = await this.getConfig(scope.pluginId, { userId: scope.userId });
    const effectiveConfig = { ...(plugin.defaultConfig ? plugin.defaultConfig() : {}), ...savedConfig, ...(inputConfig || {}) };
    const startedAt = Date.now();
    const runId = `prun_${crypto.randomUUID()}`;

    let pluginResult = null;
    try {
      await this.store.update(async (db) => {
        const { pluginDb, mergeInto } = this._buildPluginRunDb(db, { pluginId: scope.pluginId, userId: scope.userId });
        pluginResult = await plugin.run({ mode: 'apply', config: effectiveConfig, db: pluginDb, now: Date.now() });
        return mergeInto(db, pluginResult?.nextDb || pluginDb);
      });
      const finishedAt = Date.now();
      await this.appendRunRecord({
        id: runId,
        pluginId: scope.pluginId,
        userId: scope.userId || '',
        type: 'run',
        status: 'succeeded',
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        configKeys: Object.keys(inputConfig || {}),
        resultSummary: summarizePluginResult(pluginResult)
      });
      return { ...pluginResult, task: { id: runId, type: 'run', status: 'succeeded', startedAt, finishedAt } };
    } catch (err) {
      const finishedAt = Date.now();
      await this.appendRunRecord({
        id: runId,
        pluginId: scope.pluginId,
        userId: scope.userId || '',
        type: 'run',
        status: 'failed',
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        configKeys: Object.keys(inputConfig || {}),
        error: safeErrorInfo(err)
      });
      try {
        err.runLogId = runId;
      } catch (_e) {
        // ignore if error object is not extensible
      }
      throw err;
    }
  }
}

module.exports = {
  PluginManager
};
