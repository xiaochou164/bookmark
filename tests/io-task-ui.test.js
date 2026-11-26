const test = require('node:test');
const assert = require('node:assert/strict');

test('IO task UI controller derives bounded export scope and tracks active task', async () => {
  const { createIoTaskController } = await import('../public/js/app/ioTasks.mjs');
  const elements = {
    ioExportScope: { value: 'selected' },
    ioExportIncludeTrash: { checked: true }
  };
  const state = { filters: { folderId: 'folder-a' }, selected: new Set(['b1', 'b2']) };
  const controller = createIoTaskController({
    api: async () => ({ tasks: [] }),
    byId: (id) => elements[id] || null,
    state,
    escapeHtml: (value) => String(value),
    stateBlockHtml: () => '',
    taskProgressHtml: () => '',
    folderParentOptionsHtml: () => '',
    isIoTaskTerminal: () => true,
    refreshAll: async () => {},
    showToast: () => {}
  });
  assert.deepEqual(controller.ioExportOptionsFromUi(), { includeTrash: true, ids: ['b1', 'b2'] });
  controller.setActiveTaskId('io-1');
  assert.equal(controller.getActiveTaskId(), 'io-1');
});
