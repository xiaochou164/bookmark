const PLUGIN_RUN_HISTORY_LIMIT = 300;
const PLUGIN_TASK_HISTORY_LIMIT = 300;
const DEFAULT_SCHEDULER_TICK_MS = 15_000;

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
  constructor({ store }) {
    this.store = store;
    this.plugins = new Map();
    this.taskQueue = [];
    this.taskLoopRunning = false;
    this.schedulerTimer = null;
    this.schedulerTickMs = DEFAULT_SCHEDULER_TICK_MS;
    this.schedulerLoopRunning = false;
  }

  register(plugin) {
    if (!plugin?.id) throw new Error('Plugin must have id');
    this.plugins.set(plugin.id, plugin);
  }

  list() {
    return [...this.plugins.values()].map((p) => ({ id: p.id, name: p.name, description: p.description }));
  }

  get(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin not found: ${id}`);
    return plugin;
  }

  async getConfig(id) {
    const db = await this.store.read();
    return db.pluginConfigs?.[id] || {};
  }

  async getConfigMeta(id) {
    this.get(id);
    const db = await this.store.read();
    return normalizeConfigMeta(db.pluginConfigMeta?.[id] || {});
  }

  async setConfig(id, config) {
    const plugin = this.get(id);
    const nextConfig = { ...(plugin.defaultConfig ? plugin.defaultConfig() : {}), ...(config || {}) };
    const now = Date.now();
    await this.store.update((db) => {
      db.pluginConfigs[id] = nextConfig;
      db.pluginConfigMeta = db.pluginConfigMeta || {};
      const prevMeta = normalizeConfigMeta(db.pluginConfigMeta[id] || {});
      db.pluginConfigMeta[id] = {
        revision: Number(prevMeta.revision || 0) + 1,
        updatedAt: now
      };
      return db;
    });
    return nextConfig;
  }

  async getState(id) {
    const db = await this.store.read();
    return db.pluginState?.[id] || {};
  }

  async getConfigBundle(id, { deviceId = '' } = {}) {
    this.get(id);
    const [config, meta, schedule] = await Promise.all([this.getConfig(id), this.getConfigMeta(id), this.getSchedule(id)]);
    const servedAt = Date.now();
    if (deviceId) {
      await this.upsertDevice(id, String(deviceId), {
        status: 'online',
        lastSeenAt: servedAt,
        lastConfigPullAt: servedAt,
        configRevisionSeen: Number(meta.revision || 0),
        configUpdatedAtSeen: Number(meta.updatedAt || 0)
      });
    }
    return {
      pluginId: id,
      servedAt,
      config,
      configMeta: meta,
      schedule
    };
  }

  async upsertDevice(id, deviceId, patch = {}) {
    this.get(id);
    const did = String(deviceId || '').trim();
    if (!did) throw new Error('deviceId is required');

    let out;
    await this.store.update((db) => {
      db.pluginDevices = db.pluginDevices || {};
      db.pluginDevices[id] = db.pluginDevices[id] || {};
      const now = Date.now();
      const prev = db.pluginDevices[id][did] || defaultDeviceRecord(did);
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
      db.pluginDevices[id][did] = out;
      return db;
    });
    return out;
  }

  async registerDevice(id, payload = {}) {
    const now = Date.now();
    const deviceId = String(payload.deviceId || '').trim();
    if (!deviceId) throw new Error('deviceId is required');
    return this.upsertDevice(id, deviceId, {
      ...payload,
      status: payload.status || 'online',
      lastSeenAt: now
    });
  }

  async reportDeviceStatus(id, deviceId, payload = {}) {
    const now = Date.now();
    return this.upsertDevice(id, deviceId, {
      ...payload,
      lastSeenAt: now
    });
  }

  async listDevices(id, { limit = 50 } = {}) {
    this.get(id);
    const n = Math.max(1, Math.min(500, Number(limit) || 50));
    const db = await this.store.read();
    const records = Object.values((db.pluginDevices?.[id] || {}))
      .map((x) => ({ ...defaultDeviceRecord(x?.deviceId), ...x }))
      .sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0));
    return records.slice(0, n);
  }

  async getSchedule(id) {
    this.get(id);
    const db = await this.store.read();
    const raw = db.pluginSchedules?.[id] || {};
    const normalized = normalizeScheduleConfig(raw, raw, { touch: false });
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await this.store.update((nextDb) => {
        nextDb.pluginSchedules = nextDb.pluginSchedules || {};
        nextDb.pluginSchedules[id] = normalized;
        return nextDb;
      });
    }
    return normalized;
  }

  async setSchedule(id, patch = {}) {
    this.get(id);
    let nextSchedule;
    await this.store.update((db) => {
      db.pluginSchedules = db.pluginSchedules || {};
      const prev = db.pluginSchedules[id] || {};
      nextSchedule = normalizeScheduleConfig(patch, prev);
      if (typeof patch.nextRunAt !== 'undefined') {
        nextSchedule.nextRunAt = Number(patch.nextRunAt || 0);
      } else if (typeof prev.nextRunAt === 'undefined' || Number(prev.nextRunAt || 0) <= 0) {
        nextSchedule.nextRunAt = nextSchedule.enabled ? Date.now() + nextSchedule.intervalMinutes * 60_000 : 0;
      }
      db.pluginSchedules[id] = nextSchedule;
      return db;
    });
    return nextSchedule;
  }

  async patchScheduleStatus(id, patch = {}) {
    this.get(id);
    let nextSchedule;
    await this.store.update((db) => {
      db.pluginSchedules = db.pluginSchedules || {};
      const prev = normalizeScheduleConfig(db.pluginSchedules[id] || {}, db.pluginSchedules[id] || {}, { touch: false });
      nextSchedule = { ...prev, ...patch, updatedAt: Date.now() };
      db.pluginSchedules[id] = nextSchedule;
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

  async tickSchedulers({ pluginId = null, force = false, source = 'scheduler' } = {}) {
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
      const pluginIds = pluginId ? [String(pluginId)] : [...this.plugins.keys()];
      const results = [];

      for (const id of pluginIds) {
        this.get(id);
        const schedule = normalizeScheduleConfig(schedules[id] || {}, schedules[id] || {});
        const activeCount = taskItems.filter((t) => t.pluginId === id && (t.status === 'queued' || t.status === 'running')).length;
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
            });
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

        const savedSchedule = await this.patchScheduleStatus(id, patch);
        results.push({
          pluginId: id,
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

  async listRuns(id, { limit = 20 } = {}) {
    this.get(id);
    const n = Math.max(1, Math.min(200, Number(limit) || 20));
    const db = await this.store.read();
    const items = Array.isArray(db.pluginRuns) ? db.pluginRuns : [];
    return items
      .filter((x) => x.pluginId === id)
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

  async listTasks(id, { limit = 20 } = {}) {
    this.get(id);
    const n = Math.max(1, Math.min(200, Number(limit) || 20));
    const db = await this.store.read();
    const items = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
    return items
      .filter((x) => x.pluginId === id)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, n);
  }

  async getTask(id, taskId) {
    this.get(id);
    const db = await this.store.read();
    const items = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
    return items.find((x) => x.pluginId === id && x.id === taskId) || null;
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

  async patchTaskRecord(taskId, patch) {
    await this.store.update((db) => {
      db.pluginTasks = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
      const item = db.pluginTasks.find((x) => x.id === taskId);
      if (item) Object.assign(item, patch || {});
      return db;
    });
  }

  async findActiveTaskByIdempotency(id, idempotencyKey) {
    if (!idempotencyKey) return null;
    const db = await this.store.read();
    const items = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
    return (
      items
        .filter((x) => x.pluginId === id && x.idempotencyKey === idempotencyKey && (x.status === 'queued' || x.status === 'running'))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null
    );
  }

  async enqueueRunTask(id, inputConfig, meta = {}) {
    this.get(id);
    const idempotencyKey = String(meta?.idempotencyKey || '').trim();
    if (idempotencyKey) {
      const existing = await this.findActiveTaskByIdempotency(id, idempotencyKey);
      if (existing) {
        return { ...existing, deduped: true };
      }
    }
    const createdAt = Date.now();
    const task = {
      id: `ptask_${crypto.randomUUID()}`,
      pluginId: id,
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
    this.taskQueue.push({ taskId: task.id, pluginId: id, inputConfig: inputConfig || {} });
    setTimeout(() => {
      this.kickTaskLoop().catch((err) => {
        console.error('plugin task loop failed', err);
      });
    }, 0);
    return task;
  }

  async retryTask(id, taskId) {
    const task = await this.getTask(id, taskId);
    if (!task) throw new Error('task not found');
    return this.enqueueRunTask(id, task.inputSnapshot || {}, {
      sourceTaskId: task.id,
      replayReason: 'retry_failed',
      idempotencyKey: ''
    });
  }

  async replayTask(id, taskId) {
    const task = await this.getTask(id, taskId);
    if (!task) throw new Error('task not found');
    return this.enqueueRunTask(id, task.inputSnapshot || {}, {
      sourceTaskId: task.id,
      replayReason: 'replay_manual',
      idempotencyKey: ''
    });
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
    });

    try {
      const result = await this.run(job.pluginId, job.inputConfig);
      const finishedAt = Date.now();
      await this.patchTaskRecord(job.taskId, {
        status: 'succeeded',
        finishedAt,
        durationMs: finishedAt - startedAt,
        runLogId: result?.task?.id || null,
        resultSummary: summarizePluginResult(result),
        error: null
      });
    } catch (err) {
      const finishedAt = Date.now();
      await this.patchTaskRecord(job.taskId, {
        status: 'failed',
        finishedAt,
        durationMs: finishedAt - startedAt,
        runLogId: err?.runLogId || null,
        error: safeErrorInfo(err)
      });
    }
  }

  async preview(id, inputConfig) {
    const plugin = this.get(id);
    const savedConfig = await this.getConfig(id);
    const effectiveConfig = { ...(plugin.defaultConfig ? plugin.defaultConfig() : {}), ...savedConfig, ...(inputConfig || {}) };
    const startedAt = Date.now();
    const runId = `prun_${crypto.randomUUID()}`;
    try {
      const db = await this.store.read();
      const result = await plugin.run({ mode: 'preview', config: effectiveConfig, db, now: Date.now() });
      const finishedAt = Date.now();
      await this.appendRunRecord({
        id: runId,
        pluginId: id,
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
        pluginId: id,
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

  async run(id, inputConfig) {
    const plugin = this.get(id);
    const savedConfig = await this.getConfig(id);
    const effectiveConfig = { ...(plugin.defaultConfig ? plugin.defaultConfig() : {}), ...savedConfig, ...(inputConfig || {}) };
    const startedAt = Date.now();
    const runId = `prun_${crypto.randomUUID()}`;

    let pluginResult = null;
    try {
      await this.store.update(async (db) => {
        pluginResult = await plugin.run({ mode: 'apply', config: effectiveConfig, db, now: Date.now() });
        return pluginResult?.nextDb || db;
      });
      const finishedAt = Date.now();
      await this.appendRunRecord({
        id: runId,
        pluginId: id,
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
        pluginId: id,
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
