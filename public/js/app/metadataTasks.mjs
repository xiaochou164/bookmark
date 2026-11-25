export function createMetadataTaskController({
  api,
  byId,
  state,
  formatMetadataTaskInfo,
  isMetadataTaskTerminal,
  renderDetailFetchStatusSummary,
  getCurrentItem,
  refreshAll
}) {
  let bookmarkId = null;
  let latestTaskId = null;
  let loadSeq = 0;
  let pollTimer = null;

  function stopMetadataTaskPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function renderMetadataTaskUi(task, { bookmarkId: targetBookmarkId = null } = {}) {
    const infoEl = byId('detailMetaTaskInfo');
    const retryBtn = byId('retryMetaTaskBtn');
    if (!infoEl || !retryBtn) return;
    const activeBookmarkId = state.activeId ? String(state.activeId) : '';
    if (targetBookmarkId && activeBookmarkId && String(targetBookmarkId) !== activeBookmarkId) return;

    latestTaskId = task ? String(task.id || '') : null;
    if (targetBookmarkId) bookmarkId = String(targetBookmarkId);
    infoEl.textContent = formatMetadataTaskInfo(task);
    retryBtn.classList.toggle('hidden', !(task && String(task.status) === 'failed'));
    renderDetailFetchStatusSummary({ item: getCurrentItem(activeBookmarkId), task });
  }

  function renderMetadataTaskHistory(tasks = [], { bookmarkId: targetBookmarkId = null } = {}) {
    const el = byId('detailFetchHistory');
    if (!el) return;
    const activeBookmarkId = state.activeId ? String(state.activeId) : '';
    if (targetBookmarkId && activeBookmarkId && String(targetBookmarkId) !== activeBookmarkId) return;
    if (!tasks.length) {
      el.textContent = '抓取历史：无';
      const detailsEl = byId('detailFetchDetails');
      if (detailsEl && !String(byId('detailMetaTaskInfo')?.textContent || '').includes('错误')) detailsEl.open = false;
      return;
    }
    const rows = tasks.slice(0, 5).map((task) => {
      const status = String(task.status || 'unknown');
      const attempt = `${Number(task.attempt || 0)}/${Number(task.maxAttempts || 0) || '?'}`;
      const ts = Number(task.updatedAt || task.createdAt || 0);
      const msg = String(task.error?.message || task.lastError?.message || '');
      return `${status} (尝试 ${attempt}) @ ${ts ? new Date(ts).toLocaleTimeString() : '-'}${msg ? ` · ${msg}` : ''}`;
    });
    el.textContent = `抓取历史：\n${rows.join('\n')}`;
  }

  async function loadLatestMetadataTaskForBookmark(targetId, { force = false } = {}) {
    const activeBookmarkId = state.activeId ? String(state.activeId) : '';
    const targetBookmarkId = String(targetId || activeBookmarkId || '');
    if (!targetBookmarkId) {
      renderMetadataTaskUi(null);
      return null;
    }
    if (!force && bookmarkId === targetBookmarkId && latestTaskId) return null;

    const seq = ++loadSeq;
    const out = await api(`/api/bookmarks/${targetBookmarkId}/metadata/tasks?limit=1`);
    if (seq !== loadSeq) return null;
    const task = Array.isArray(out?.tasks) ? out.tasks[0] : null;
    renderMetadataTaskUi(task, { bookmarkId: targetBookmarkId });
    if (task && !isMetadataTaskTerminal(task.status)) startMetadataTaskPoll(task.id, targetBookmarkId);
    else if (task) stopMetadataTaskPoll();
    return task;
  }

  async function loadMetadataTaskHistoryForBookmark(targetId) {
    const targetBookmarkId = String(targetId || state.activeId || '');
    if (!targetBookmarkId) {
      renderMetadataTaskHistory([]);
      return [];
    }
    const out = await api(`/api/bookmarks/${targetBookmarkId}/metadata/tasks?limit=5`);
    const tasks = Array.isArray(out?.tasks) ? out.tasks : [];
    renderMetadataTaskHistory(tasks, { bookmarkId: targetBookmarkId });
    return tasks;
  }

  function startMetadataTaskPoll(taskId, targetId) {
    stopMetadataTaskPoll();
    const targetTaskId = String(taskId || '');
    const targetBookmarkId = String(targetId || state.activeId || '');
    if (!targetTaskId || !targetBookmarkId) return;
    pollTimer = setInterval(async () => {
      try {
        if (!state.activeId || String(state.activeId) !== targetBookmarkId) {
          stopMetadataTaskPoll();
          return;
        }
        const out = await api(`/api/metadata/tasks/${targetTaskId}`);
        const task = out?.task || null;
        renderMetadataTaskUi(task, { bookmarkId: targetBookmarkId });
        if (!task || isMetadataTaskTerminal(task.status)) {
          stopMetadataTaskPoll();
          await loadMetadataTaskHistoryForBookmark(targetBookmarkId);
          await refreshAll();
        }
      } catch (_error) {
        stopMetadataTaskPoll();
      }
    }, 1500);
  }

  function resetMetadataTasks() {
    stopMetadataTaskPoll();
    bookmarkId = null;
    latestTaskId = null;
    loadSeq += 1;
  }

  return {
    getBookmarkId: () => bookmarkId,
    getLatestTaskId: () => latestTaskId,
    loadLatestMetadataTaskForBookmark,
    loadMetadataTaskHistoryForBookmark,
    renderMetadataTaskHistory,
    renderMetadataTaskUi,
    resetMetadataTasks,
    startMetadataTaskPoll,
    stopMetadataTaskPoll
  };
}
