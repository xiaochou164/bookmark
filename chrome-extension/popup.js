const previewBtn = document.getElementById('previewBtn');
const syncBtn = document.getElementById('syncBtn');
const statusEl = document.getElementById('status');
const openOptions = document.getElementById('openOptions');

function renderStatus(msg, ok = true) {
  statusEl.className = `row ${ok ? 'ok' : 'error'}`;
  statusEl.textContent = msg;
}

function formatStats(payload, title) {
  const t = payload?.totals || {};
  const createdInRaindrop = t.createdInRaindrop ?? t.createdRemote ?? 0;
  const createdInChrome = t.createdInChrome ?? t.createdLocal ?? 0;
  const updatedRaindropTitle = t.updatedRaindropTitle ?? t.updatedRemoteTitle ?? 0;
  const deletedInRaindrop = t.deletedInRaindrop ?? t.deletedRemote ?? 0;
  const movedToChromeTrash = t.movedToChromeTrash ?? t.deletedLocal ?? 0;
  const backend = t.backend ? `后端: ${t.backend}` : '';
  if (t.queued) {
    return [
      title,
      backend,
      `任务已入队: ${t.taskId || '-'}`,
      '云端服务会异步执行同步，请稍后在设置页/云端审计中查看结果。'
    ].filter(Boolean).join('\n');
  }
  const lines = [
    title,
    backend,
    `映射数: ${t.mappings || 0}`,
    `+Raindrop: ${createdInRaindrop}, +Chrome: ${createdInChrome}`,
    `标题更新: ${updatedRaindropTitle}`,
    `删除Raindrop: ${deletedInRaindrop}, Chrome->Trash: ${movedToChromeTrash}`,
    ''
  ];

  for (const m of payload?.mappings || []) {
    const mapCreatedInRaindrop = m.createdInRaindrop ?? m.createdRemote ?? 0;
    const mapCreatedInChrome = m.createdInChrome ?? m.createdLocal ?? 0;
    const mapUpdatedRaindropTitle = m.updatedRaindropTitle ?? m.updatedRemoteTitle ?? 0;
    const mapDeletedInRaindrop = m.deletedInRaindrop ?? m.deletedRemote ?? 0;
    const mapMovedToChromeTrash = m.movedToChromeTrash ?? m.deletedLocal ?? 0;
    lines.push(`[${m.collectionId} -> ${m.chromeFolder || m.folderName || '-'}]`);
    lines.push(`  +R ${mapCreatedInRaindrop}, +C ${mapCreatedInChrome}, ~ ${mapUpdatedRaindropTitle}, -R ${mapDeletedInRaindrop}, -C ${mapMovedToChromeTrash}`);
    for (const s of m.samples || []) {
      lines.push(`  ${s}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

function setBusy(busy) {
  previewBtn.disabled = busy;
  syncBtn.disabled = busy;
}

function call(type) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(resp || { ok: false, error: '未知错误' });
    });
  });
}

async function loadLastStatus() {
  const { lastSyncStatus } = await chrome.storage.local.get({ lastSyncStatus: null });
  if (!lastSyncStatus) return;
  if (lastSyncStatus.ok) {
    if (lastSyncStatus.queued) {
      renderStatus(formatStats(lastSyncStatus.stats || {}, '上次同步已入队（云端异步执行）'), true);
      return;
    }
    renderStatus(formatStats(lastSyncStatus.stats || {}, '上次同步成功'), true);
  } else {
    renderStatus(`上次失败: ${lastSyncStatus.error || '未知错误'}`, false);
  }
}

previewBtn.addEventListener('click', async () => {
  setBusy(true);
  renderStatus('预览中...', true);
  const resp = await call('PREVIEW_SYNC');
  setBusy(false);
  if (!resp.ok) {
    renderStatus(resp.error || '预览失败', false);
    return;
  }
  renderStatus(formatStats(resp.stats, '预览完成（未写入）'), true);
});

syncBtn.addEventListener('click', async () => {
  setBusy(true);
  renderStatus('同步中...', true);
  const resp = await call('SYNC_NOW');
  setBusy(false);
  if (!resp.ok) {
    renderStatus(resp.error || '同步失败', false);
    return;
  }
  renderStatus(formatStats(resp.stats, '同步完成（已写入）'), true);
});

openOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

loadLastStatus();
