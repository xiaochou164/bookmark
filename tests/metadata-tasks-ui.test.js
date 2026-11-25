const test = require('node:test');
const assert = require('node:assert/strict');

test('metadata task controller keeps detail state scoped to the active bookmark', async () => {
  const { createMetadataTaskController } = await import('../public/js/app/metadataTasks.mjs');
  const elements = {
    detailMetaTaskInfo: { textContent: '' },
    retryMetaTaskBtn: { classList: { values: [], toggle(name, on) { this.values.push([name, on]); } } },
    detailFetchHistory: { textContent: '' },
    detailFetchDetails: { open: true }
  };
  const state = {
    activeId: 'bookmark-1',
    bookmarks: [{ id: 'bookmark-1', url: 'https://example.test', metadata: {} }],
    allBookmarks: []
  };
  const calls = [];
  const controller = createMetadataTaskController({
    api: async (path) => {
      calls.push(path);
      if (path.includes('limit=1')) return { tasks: [{ id: 'task-1', status: 'failed', attempt: 2, maxAttempts: 3 }] };
      if (path.includes('limit=5')) return { tasks: [{ id: 'task-1', status: 'failed', updatedAt: 0 }] };
      return { task: { id: 'task-1', status: 'succeeded' } };
    },
    byId: (id) => elements[id] || null,
    state,
    formatMetadataTaskInfo: (task) => task ? `任务：${task.status}` : '任务：无',
    isMetadataTaskTerminal: (status) => ['succeeded', 'failed'].includes(String(status)),
    getCurrentItem: (id) => state.bookmarks.find((item) => item.id === id) || null,
    renderDetailFetchStatusSummary: ({ task }) => { elements.detailMetaTaskInfo.summaryStatus = task?.status || ''; },
    refreshAll: async () => {}
  });

  await controller.loadLatestMetadataTaskForBookmark('bookmark-1', { force: true });
  assert.equal(controller.getBookmarkId(), 'bookmark-1');
  assert.equal(controller.getLatestTaskId(), 'task-1');
  assert.equal(elements.detailMetaTaskInfo.textContent, '任务：failed');
  assert.equal(elements.retryMetaTaskBtn.classList.values.at(-1)[1], false);

  controller.renderMetadataTaskHistory([{ status: 'failed', attempt: 2, maxAttempts: 3, updatedAt: 0 }], { bookmarkId: 'bookmark-1' });
  assert.match(elements.detailFetchHistory.textContent, /failed \(尝试 2\/3\)/);
  assert.ok(calls.some((path) => path.includes('/bookmarks/bookmark-1/metadata/tasks?limit=1')));

  state.activeId = 'bookmark-2';
  controller.renderMetadataTaskUi({ id: 'task-2', status: 'succeeded' }, { bookmarkId: 'bookmark-1' });
  assert.equal(controller.getLatestTaskId(), 'task-1');
});
