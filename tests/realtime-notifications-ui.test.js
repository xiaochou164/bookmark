const test = require('node:test');
const assert = require('node:assert/strict');

test('realtime controller deduplicates snapshots and summarizes task health', async () => {
  const { createRealtimeNotificationsController } = await import('../public/js/app/realtimeNotifications.mjs');
  const toasts = [];
  const controller = createRealtimeNotificationsController({
    api: async () => ({}) ,
    byId: () => null,
    escapeHtml: (value) => String(value),
    getAuthenticated: () => false,
    getActiveBookmarkId: () => '',
    loadSidebarSyncHealth: async () => {},
    loadIoTasks: async () => {},
    loadLatestMetadataTaskForBookmark: async () => {},
    refreshAll: async () => {},
    showToast: (message) => toasts.push(message)
  });

  const snapshot = {
    signature: 'one',
    tasks: {
      io: { active: 2, counts: { failed: 1, partial: 1 } },
      ai: { active: 1, counts: { failed: 0, partial: 0 } }
    },
    reminders: { due: 3 }
  };
  assert.equal(controller.realtimeTaskActiveCount(snapshot), 3);
  assert.equal(controller.realtimeTaskFailureCount(snapshot), 2);
  assert.equal(controller.realtimeSnapshotMessage(snapshot), '3 个任务进行中 · 2 个任务需关注 · 3 个提醒到期');
  assert.equal(controller.handleSnapshot(snapshot), true);
  assert.equal(controller.handleSnapshot(snapshot), false);
  assert.equal(controller.handleSnapshot({ ...snapshot, signature: 'two' }, { source: 'poll' }), true);
  assert.deepEqual(toasts, ['3 个任务进行中 · 2 个任务需关注 · 3 个提醒到期']);
  controller.stop();
});
