export function createIoTaskController({
  api,
  byId,
  state,
  escapeHtml,
  stateBlockHtml,
  taskProgressHtml,
  folderParentOptionsHtml,
  isIoTaskTerminal,
  refreshAll,
  showToast
}) {
  let pollTimer = null;
  let activeTaskId = null;

  function stopIoTaskPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function setActiveTaskId(taskId) {
    activeTaskId = taskId ? String(taskId) : null;
    return activeTaskId;
  }

  function renderIoTaskList(tasks = []) {
    const listEl = byId('ioTaskList');
    if (!listEl) return;
    if (!Array.isArray(tasks) || !tasks.length) {
      listEl.innerHTML = stateBlockHtml({
        state: 'empty',
        eyebrow: '任务状态',
        title: '暂无导入/导出任务',
        message: '新建导入或导出任务后，这里会显示队列状态、进度和结果。'
      });
      return;
    }
    listEl.innerHTML = tasks.map((task) => {
      const active = activeTaskId && activeTaskId === task.id ? 'active' : '';
      const resultText = task.result ? JSON.stringify(task.result) : (task.error?.message || '');
      const startedLabel = task.startedAt || task.createdAt ? new Date(Number(task.startedAt || task.createdAt)).toLocaleString() : '-';
      const updatedLabel = task.updatedAt ? new Date(Number(task.updatedAt)).toLocaleString() : '-';
      return `<div class="io-task-item ${active}" data-io-task="${escapeHtml(String(task.id || ''))}">
        <div class="io-task-row"><strong>${escapeHtml(String(task.type || 'task'))}</strong></div>
        ${taskProgressHtml({
          status: String(task.status || 'unknown'),
          progress: `${task.progress?.percent ?? 0}% · ${task.progress?.step || ''}`,
          startedAt: startedLabel,
          updatedAt: updatedLabel,
          detail: resultText ? resultText.slice(0, 180) : ''
        })}
        <div class="io-task-row"><div class="detail-inline-actions">
          <button type="button" class="ghost" data-io-open="${escapeHtml(String(task.id || ''))}">详情</button>
          ${task.outputFile?.url ? `<button type="button" data-io-download="${escapeHtml(String(task.id || ''))}">下载</button>` : ''}
          ${task.reportFile?.url ? `<button type="button" class="ghost" data-io-report="${escapeHtml(String(task.id || ''))}">日志</button>` : ''}
          ${task.status === 'failed' ? `<button type="button" class="ghost danger" data-io-retry="${escapeHtml(String(task.id || ''))}">重试</button>` : ''}
        </div></div>
      </div>`;
    }).join('');

    const showTaskOutput = async (taskId) => {
      const out = await api(`/api/io/tasks/${encodeURIComponent(taskId)}`);
      setActiveTaskId(taskId);
      byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
      const task = out?.task || null;
      if (task && !isIoTaskTerminal(task.status)) startIoTaskPoll(task.id);
      const latest = await api('/api/io/tasks?limit=20');
      renderIoTaskList(latest?.tasks || []);
    };

    listEl.querySelectorAll('[data-io-open]').forEach((el) => {
      el.addEventListener('click', async () => { await showTaskOutput(el.dataset.ioOpen); });
    });
    listEl.querySelectorAll('[data-io-download]').forEach((el) => {
      el.addEventListener('click', async () => {
        const out = await api(`/api/io/tasks/${encodeURIComponent(el.dataset.ioDownload)}`);
        const url = out?.task?.outputFile?.url;
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    });
    listEl.querySelectorAll('[data-io-report]').forEach((el) => {
      el.addEventListener('click', async () => {
        const out = await api(`/api/io/tasks/${encodeURIComponent(el.dataset.ioReport)}`);
        const url = out?.task?.reportFile?.url;
        if (url) window.open(url, '_blank', 'noopener');
      });
    });
    listEl.querySelectorAll('[data-io-retry]').forEach((el) => {
      el.addEventListener('click', async () => {
        const out = await api(`/api/io/tasks/${encodeURIComponent(el.dataset.ioRetry)}/retry`, { method: 'POST', body: JSON.stringify({}) });
        setActiveTaskId(out?.task?.id);
        byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
        startIoTaskPoll(activeTaskId);
        showToast('重试任务已入队', { timeoutMs: 2500 });
      });
    });
  }

  async function loadIoTasks() {
    try {
      const out = await api('/api/io/tasks?limit=30');
      const tasks = out?.tasks || [];
      renderIoTaskList(tasks);
      if (!activeTaskId && tasks.length) setActiveTaskId(tasks[0].id);
      return tasks;
    } catch (error) {
      const listEl = byId('ioTaskList');
      if (listEl) listEl.innerHTML = `<div class="muted">${escapeHtml(error.message || '加载任务失败')}</div>`;
      return [];
    }
  }

  async function openIoTaskPanel({ output = '就绪' } = {}) {
    populateIoFolderSelects();
    await loadIoTasks();
    if (byId('ioTaskOutput')) byId('ioTaskOutput').textContent = output;
    const dialog = byId('exportDialog');
    if (dialog && !dialog.open) dialog.showModal();
    queueMicrotask(() => byId('ioRefreshTasksBtn')?.focus?.());
  }

  function startIoTaskPoll(taskId) {
    stopIoTaskPoll();
    const id = String(taskId || '');
    if (!id) return;
    setActiveTaskId(id);
    pollTimer = setInterval(async () => {
      try {
        const out = await api(`/api/io/tasks/${encodeURIComponent(id)}`);
        byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
        const task = out?.task || null;
        await loadIoTasks();
        if (!task || isIoTaskTerminal(task.status)) {
          stopIoTaskPoll();
          if (task?.type?.startsWith?.('import_') && task.status === 'succeeded') await refreshAll();
        }
      } catch {
        stopIoTaskPoll();
      }
    }, 1200);
  }

  function populateIoFolderSelects() {
    const target = byId('ioImportTargetFolder');
    if (target) target.innerHTML = folderParentOptionsHtml('root');
  }

  function ioExportOptionsFromUi() {
    const scope = byId('ioExportScope').value;
    const options = { includeTrash: byId('ioExportIncludeTrash').checked };
    if (scope === 'currentFolder' && state.filters.folderId && state.filters.folderId !== 'all') options.folderId = state.filters.folderId;
    if (scope === 'selected') options.ids = [...state.selected];
    return options;
  }

  async function queueIoImportTask() {
    const type = byId('ioImportFormat').value;
    const content = byId('ioImportContent').value;
    if (!String(content || '').trim()) {
      showToast('导入内容为空', { timeoutMs: 3000 });
      return;
    }
    let mapping = null;
    if (type === 'import_csv') {
      const raw = byId('ioImportCsvMapping').value.trim();
      if (raw) {
        try { mapping = JSON.parse(raw); } catch (error) {
          showToast(`CSV 映射 JSON 无效：${error.message}`, { timeoutMs: 4000 });
          return;
        }
      }
    }
    const out = await api('/api/io/tasks', {
      method: 'POST',
      body: JSON.stringify({ type, input: {
        content,
        targetFolderId: byId('ioImportTargetFolder').value || 'root',
        conflictStrategy: byId('ioImportConflict').value || 'skip',
        mapping
      } })
    });
    setActiveTaskId(out?.task?.id);
    if (byId('importDialog')?.open) byId('importDialog').close();
    await openIoTaskPanel({ output: JSON.stringify(out, null, 2) });
    startIoTaskPoll(activeTaskId);
    showToast('导入任务已入队', { timeoutMs: 2500 });
  }

  async function queueIoExportTask() {
    const type = byId('ioExportFormat').value;
    const out = await api('/api/io/tasks', {
      method: 'POST',
      body: JSON.stringify({ type, input: { options: ioExportOptionsFromUi() } })
    });
    setActiveTaskId(out?.task?.id);
    await openIoTaskPanel({ output: JSON.stringify(out, null, 2) });
    startIoTaskPoll(activeTaskId);
    showToast('导出任务已入队', { timeoutMs: 2500 });
  }

  return {
    stopIoTaskPoll,
    renderIoTaskList,
    loadIoTasks,
    openIoTaskPanel,
    startIoTaskPoll,
    populateIoFolderSelects,
    ioExportOptionsFromUi,
    queueIoImportTask,
    queueIoExportTask,
    setActiveTaskId,
    getActiveTaskId: () => activeTaskId
  };
}
