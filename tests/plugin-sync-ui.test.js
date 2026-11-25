const test = require('node:test');
const assert = require('node:assert/strict');

test('plugin sync controller normalizes schedule fields and keeps task polling bounded', async () => {
  const { createPluginSyncController } = await import('../public/js/app/pluginSync.mjs');
  const elements = {
    pluginScheduleEnabled: { checked: true },
    pluginSchedulePaused: { checked: false },
    pluginScheduleInterval: { value: '30' },
    pluginScheduleMaxConcurrent: { value: '2' },
    pluginScheduleWindowEnabled: { checked: true },
    pluginScheduleWindowStart: { value: '9' },
    pluginScheduleWindowEnd: { value: '18' },
    pluginOutput: { textContent: '' }
  };
  const calls = [];
  let configState = null;
  let refreshed = 0;
  const controller = createPluginSyncController({
    api: async (path) => {
      calls.push(path);
      if (path.endsWith('/config')) return { raindropToken: 'masked', topLevelAutoSync: true, mappings: [] };
      if (path.includes('/tasks/plugin-1')) return { id: 'plugin-1', status: 'succeeded' };
      if (path.includes('/tasks?')) return { items: [{ id: 'plugin-1', status: 'succeeded' }] };
      return {};
    },
    byId: (id) => elements[id] || null,
    setPluginConfig: (config) => { configState = config; },
    refreshAll: async () => { refreshed += 1; }
  });

  assert.deepEqual(controller.pluginSchedulePayload(), {
    enabled: true,
    paused: false,
    intervalMinutes: 30,
    maxConcurrent: 2,
    windowEnabled: true,
    windowStartHour: 9,
    windowEndHour: 18
  });
  controller.applyPluginScheduleToForm({ enabled: false, paused: true, intervalMinutes: 15, maxConcurrent: 1, windowEnabled: false, windowStartHour: 1, windowEndHour: 2 });
  assert.equal(elements.pluginScheduleEnabled.checked, false);
  assert.equal(elements.pluginScheduleInterval.value, '15');
  await controller.loadPluginConfig();
  assert.equal(configState.raindropToken, 'masked');
  assert.deepEqual(await controller.fetchPluginTasks(10), [{ id: 'plugin-1', status: 'succeeded' }]);
  await controller.pollPluginTask('plugin-1');
  assert.equal(refreshed, 1);
  assert.ok(calls.some((path) => path.includes('/tasks/plugin-1')));
});
