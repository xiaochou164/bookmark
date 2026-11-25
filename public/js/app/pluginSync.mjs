export function createPluginSyncController({ api, byId, setPluginConfig, refreshAll }) {
  let taskPollTimer = null;

  function stopPluginTaskPolling() {
    if (taskPollTimer) {
      clearTimeout(taskPollTimer);
      taskPollTimer = null;
    }
  }

  async function loadPluginAudit() {
    try {
      const audit = await api('/api/plugins/raindropSync/audit');
      if (byId('pluginAudit')) byId('pluginAudit').textContent = JSON.stringify(audit, null, 2);
      return audit;
    } catch (error) {
      if (byId('pluginAudit')) byId('pluginAudit').textContent = error.message;
      return null;
    }
  }

  async function loadPluginDevices() {
    try {
      const devices = await api('/api/plugins/raindropSync/devices?limit=20');
      if (byId('pluginDevices')) byId('pluginDevices').textContent = JSON.stringify(devices, null, 2);
      return devices;
    } catch (error) {
      if (byId('pluginDevices')) byId('pluginDevices').textContent = error.message;
      return null;
    }
  }

  async function loadPluginHealth() {
    try {
      const health = await api('/api/plugins/raindropSync/health');
      if (byId('pluginHealth')) byId('pluginHealth').textContent = JSON.stringify(health, null, 2);
      return health;
    } catch (error) {
      if (byId('pluginHealth')) byId('pluginHealth').textContent = error.message;
      return null;
    }
  }

  async function loadPluginRuns() {
    try {
      const [runs, tasks] = await Promise.all([
        api('/api/plugins/raindropSync/runs?limit=20'),
        api('/api/plugins/raindropSync/tasks?limit=20')
      ]);
      const output = { tasks, runs };
      if (byId('pluginHistory')) byId('pluginHistory').textContent = JSON.stringify(output, null, 2);
      return output;
    } catch (error) {
      if (byId('pluginHistory')) byId('pluginHistory').textContent = error.message;
      return null;
    }
  }

  async function loadPluginConfig() {
    try {
      const config = await api('/api/plugins/raindropSync/config');
      setPluginConfig(config);
      if (byId('pluginToken')) byId('pluginToken').value = config.raindropToken || '';
      if (byId('pluginTopLevel')) byId('pluginTopLevel').checked = Boolean(config.topLevelAutoSync);
      if (byId('pluginMappings')) byId('pluginMappings').value = JSON.stringify(config.mappings || [], null, 2);
      if (byId('pluginOutput')) byId('pluginOutput').textContent = '就绪';
      return config;
    } catch (error) {
      if (byId('pluginOutput')) byId('pluginOutput').textContent = error.message;
      return null;
    }
  }

  function pluginSchedulePayload() {
    return {
      enabled: byId('pluginScheduleEnabled')?.checked ?? false,
      paused: byId('pluginSchedulePaused')?.checked ?? false,
      intervalMinutes: Number(byId('pluginScheduleInterval')?.value || 15),
      maxConcurrent: Number(byId('pluginScheduleMaxConcurrent')?.value || 1),
      windowEnabled: byId('pluginScheduleWindowEnabled')?.checked ?? false,
      windowStartHour: Number(byId('pluginScheduleWindowStart')?.value || 0),
      windowEndHour: Number(byId('pluginScheduleWindowEnd')?.value || 24)
    };
  }

  function applyPluginScheduleToForm(schedule = {}) {
    if (byId('pluginScheduleEnabled')) byId('pluginScheduleEnabled').checked = Boolean(schedule.enabled);
    if (byId('pluginSchedulePaused')) byId('pluginSchedulePaused').checked = Boolean(schedule.paused);
    if (byId('pluginScheduleInterval')) byId('pluginScheduleInterval').value = String(Number(schedule.intervalMinutes || 15));
    if (byId('pluginScheduleMaxConcurrent')) byId('pluginScheduleMaxConcurrent').value = String(Number(schedule.maxConcurrent || 1));
    if (byId('pluginScheduleWindowEnabled')) byId('pluginScheduleWindowEnabled').checked = Boolean(schedule.windowEnabled);
    if (byId('pluginScheduleWindowStart')) byId('pluginScheduleWindowStart').value = String(Number(schedule.windowStartHour ?? 0));
    if (byId('pluginScheduleWindowEnd')) byId('pluginScheduleWindowEnd').value = String(Number(schedule.windowEndHour ?? 24));
  }

  async function loadPluginSchedule() {
    try {
      const schedule = await api('/api/plugins/raindropSync/schedule');
      applyPluginScheduleToForm(schedule);
      if (byId('pluginScheduleOutput')) byId('pluginScheduleOutput').textContent = JSON.stringify(schedule, null, 2);
      return schedule;
    } catch (error) {
      if (byId('pluginScheduleOutput')) byId('pluginScheduleOutput').textContent = error.message;
      return null;
    }
  }

  async function fetchPluginTasks(limit = 20) {
    const response = await api(`/api/plugins/raindropSync/tasks?limit=${Number(limit) || 20}`);
    return Array.isArray(response?.items) ? response.items : [];
  }

  async function pollPluginTask(taskId) {
    stopPluginTaskPolling();
    const id = encodeURIComponent(String(taskId || ''));
    if (!id) return null;
    const tick = async () => {
      try {
        const task = await api(`/api/plugins/raindropSync/tasks/${id}`);
        if (byId('pluginOutput')) byId('pluginOutput').textContent = JSON.stringify({ task }, null, 2);
        if (task.status === 'queued' || task.status === 'running') {
          taskPollTimer = setTimeout(() => tick().catch((error) => {
            if (byId('pluginOutput')) byId('pluginOutput').textContent = error.message;
          }), 1000);
          return task;
        }
        stopPluginTaskPolling();
        await loadPluginAudit();
        await loadPluginDevices();
        await loadPluginHealth();
        await loadPluginRuns();
        if (task.status === 'succeeded') await refreshAll();
        return task;
      } catch (error) {
        stopPluginTaskPolling();
        if (byId('pluginOutput')) byId('pluginOutput').textContent = error.message;
        return null;
      }
    };
    return tick();
  }

  return {
    applyPluginScheduleToForm,
    fetchPluginTasks,
    loadPluginAudit,
    loadPluginConfig,
    loadPluginDevices,
    loadPluginHealth,
    loadPluginRuns,
    loadPluginSchedule,
    pluginSchedulePayload,
    pollPluginTask,
    stopPluginTaskPolling
  };
}
