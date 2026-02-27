// popup.js — Rainboard Sync Chrome Extension Popup

const previewBtn = document.getElementById('previewBtn');
const syncBtn = document.getElementById('syncBtn');
const rbPreviewBtn = document.getElementById('rbPreviewBtn');
const rbSyncBtn = document.getElementById('rbSyncBtn');
const statusBox = document.getElementById('statusBox');
const openOptions = document.getElementById('openOptions');

function showStatus(msg, type = 'info') {
  statusBox.className = `status-box visible ${type}`;
  statusBox.textContent = msg;
}

function clearStatus() {
  statusBox.className = 'status-box';
  statusBox.textContent = '';
}

// ── Format Raindrop sync stats ─────────────────────────────────────────────
function formatRaindropStats(payload, title) {
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
    `删除Raindrop: ${deletedInRaindrop}, Chrome→Trash: ${movedToChromeTrash}`,
    ''
  ];

  for (const m of payload?.mappings || []) {
    const mapCreatedInRaindrop = m.createdInRaindrop ?? m.createdRemote ?? 0;
    const mapCreatedInChrome = m.createdInChrome ?? m.createdLocal ?? 0;
    const mapUpdatedRaindropTitle = m.updatedRaindropTitle ?? m.updatedRemoteTitle ?? 0;
    const mapDeletedInRaindrop = m.deletedInRaindrop ?? m.deletedRemote ?? 0;
    const mapMovedToChromeTrash = m.movedToChromeTrash ?? m.deletedLocal ?? 0;
    lines.push(`[${m.collectionId} → ${m.chromeFolder || m.folderName || '-'}]`);
    lines.push(`  +R ${mapCreatedInRaindrop}, +C ${mapCreatedInChrome}, ~${mapUpdatedRaindropTitle}, -R ${mapDeletedInRaindrop}, -C ${mapMovedToChromeTrash}`);
    for (const s of m.samples || []) {
      lines.push(`  ${s}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

// ── Format Rainboard (cloud DB) sync result ────────────────────────────────
function formatRainboardResult(result, title) {
  const c = result.chrome || {};
  const s = result.server || {};
  const lines = [
    title,
    `--- Chrome 侧 ---`,
    `Chrome 文件夹数: ${result.chromeFolders || 0}`,
    `Chrome 书签总数: ${result.totalChromeBookmarks || 0}`,
    `新增到 Chrome: ${c.toAddCount || 0}${result.preview ? ' (预览，未写入)' : ` → 已写入 ${c.addedToChrome || 0} 条`}`,
    ``,
    `--- 云端 DB 侧 ---`,
    `新增到 Rainboard: ${s.createdInDb || 0}`,
    `已跳过重复: ${s.skippedDuplicate || 0}`,
  ];

  const toAdd = result.samples?.toAdd || [];
  if (toAdd.length > 0) {
    lines.push('');
    lines.push('待同步到 Chrome:');
    for (const s of toAdd) lines.push(`  ${s}`);
  }

  return lines.join('\n').trim();
}

function setBusy(buttons, busy) {
  for (const btn of buttons) btn.disabled = busy;
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

// ── All buttons ────────────────────────────────────────────────────────────
const ALL_BTNS = [previewBtn, syncBtn, rbPreviewBtn, rbSyncBtn];

// Raindrop preview
previewBtn.addEventListener('click', async () => {
  setBusy(ALL_BTNS, true);
  showStatus('预览中（Raindrop ↔ Chrome）...', 'info');
  const resp = await call('PREVIEW_SYNC');
  setBusy(ALL_BTNS, false);
  if (!resp.ok) {
    showStatus(resp.error || '预览失败', 'error');
    return;
  }
  showStatus(formatRaindropStats(resp.stats, '✅ Raindrop 预览完成（未写入）'), 'ok');
});

// Raindrop sync
syncBtn.addEventListener('click', async () => {
  setBusy(ALL_BTNS, true);
  showStatus('同步中（Raindrop ↔ Chrome）...', 'info');
  const resp = await call('SYNC_NOW');
  setBusy(ALL_BTNS, false);
  if (!resp.ok) {
    showStatus(resp.error || '同步失败', 'error');
    return;
  }
  showStatus(formatRaindropStats(resp.stats, '✅ Raindrop 同步完成'), 'ok');
});

// Rainboard (cloud DB) preview
rbPreviewBtn.addEventListener('click', async () => {
  setBusy(ALL_BTNS, true);
  showStatus('预览中（Chrome ↔ 云书签 Rainboard）...', 'info');
  const resp = await call('PREVIEW_RAINBOARD_SYNC');
  setBusy(ALL_BTNS, false);
  if (!resp.ok) {
    showStatus(resp.error || '预览失败', 'error');
    return;
  }
  showStatus(formatRainboardResult(resp, '🔍 云书签预览（未写入）'), 'ok');
});

// Rainboard (cloud DB) sync
rbSyncBtn.addEventListener('click', async () => {
  setBusy(ALL_BTNS, true);
  showStatus('同步中（Chrome ↔ 云书签 Rainboard）...', 'info');
  const resp = await call('SYNC_WITH_RAINBOARD');
  setBusy(ALL_BTNS, false);
  if (!resp.ok) {
    showStatus(resp.error || '同步失败', 'error');
    return;
  }
  showStatus(formatRainboardResult(resp, '✅ 云书签同步完成！'), 'ok');
});

// Open options
openOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Load last sync status on open
async function loadLastStatus() {
  const { lastSyncStatus } = await chrome.storage.local.get({ lastSyncStatus: null });
  if (!lastSyncStatus) return;
  if (lastSyncStatus.ok) {
    if (lastSyncStatus.rainboardSync) {
      showStatus(formatRainboardResult(lastSyncStatus.rainboardSync, '上次云书签同步成功'), 'ok');
    } else if (lastSyncStatus.queued) {
      showStatus(formatRaindropStats(lastSyncStatus.stats || {}, '上次同步已入队'), 'ok');
    } else {
      showStatus(formatRaindropStats(lastSyncStatus.stats || {}, '上次 Raindrop 同步成功'), 'ok');
    }
  } else {
    showStatus(`上次失败: ${lastSyncStatus.error || '未知错误'}`, 'error');
  }
}

loadLastStatus();
