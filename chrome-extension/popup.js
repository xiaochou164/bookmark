// popup.js — Rainbow Sync Chrome Extension Popup

const rbPreviewBtn = document.getElementById('rbPreviewBtn');
const rbSyncBtn = document.getElementById('rbSyncBtn');
const statusBox = document.getElementById('statusBox');
const openOptions = document.getElementById('openOptions');

function showStatus(msg, type = 'info') {
  const state = type === 'ok' ? 'success' : type;
  statusBox.className = 'state-box status-box visible';
  statusBox.dataset.state = state;
  statusBox.textContent = msg;
}

// ── Format Rainbow (cloud DB) sync result ────────────────────────────────
function formatRainbowResult(result, title) {
  const c = result.chrome || {};
  const s = result.server || {};
  const lines = [
    title,
    `--- Chrome 侧 ---`,
    `Chrome 文件夹数: ${result.chromeFolders || 0}`,
    `Chrome 书签总数: ${result.totalChromeBookmarks || 0}`,
    `新增到 Chrome: ${c.toAddCount || 0}${result.preview ? ' (预览，未写入)' : ` → 已写入 ${c.addedToChrome || 0} 条`}`,
    `从 Chrome 删除: ${c.toDeleteCount || 0}${result.preview ? ' (预览，未删除)' : ` → 已删除 ${c.deletedFromChrome || 0} 条`}`,
    ``,
    `--- 云端 DB 侧 ---`,
    `新增到 Rainbow: ${s.createdInDb || 0}`,
    `更新/移动到 Rainbow: ${s.updatedInDb || 0} / ${s.movedInDb || 0}`,
    `本地删除同步到 Rainbow: ${s.deletedInDb || 0}`,
    `本地文件夹删除同步到 Rainbow: ${s.deletedFoldersInDb || 0}`,
    `已跳过重复: ${s.skippedDuplicate || 0}`,
  ];

  const toAdd = result.samples?.toAdd || [];
  if (toAdd.length > 0) {
    lines.push('');
    lines.push('待同步到 Chrome:');
    for (const s of toAdd) lines.push(`  ${s}`);
  }

  const toDelete = result.samples?.toDelete || [];
  if (toDelete.length > 0) {
    lines.push('');
    lines.push('待从 Chrome 删除:');
    for (const s of toDelete) lines.push(`  ${s}`);
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
        const raw = String(chrome.runtime.lastError.message || '');
        const sourceUnavailable = /message port closed|receiving end does not exist/i.test(raw);
        resolve({
          ok: false,
          error: sourceUnavailable
            ? '扩展后台未运行。项目已更名为 Rainbow，请在 chrome://extensions 中重新加载此扩展后再试。'
            : raw
        });
        return;
      }
      resolve(resp || { ok: false, error: '未知错误' });
    });
  });
}

const ALL_BTNS = [rbPreviewBtn, rbSyncBtn];

// Rainbow (cloud DB) preview
rbPreviewBtn.addEventListener('click', async () => {
  setBusy(ALL_BTNS, true);
  showStatus('预览中（Chrome ↔ 云书签 Rainbow）...', 'info');
  const resp = await call('PREVIEW_RAINBOW_SYNC');
  setBusy(ALL_BTNS, false);
  if (!resp.ok) {
    showStatus(resp.error || '预览失败', 'error');
    return;
  }
  showStatus(formatRainbowResult(resp, '云书签预览（未写入）'), 'ok');
});

// Rainbow (cloud DB) sync
rbSyncBtn.addEventListener('click', async () => {
  setBusy(ALL_BTNS, true);
  showStatus('同步中（Chrome ↔ 云书签 Rainbow）...', 'info');
  const resp = await call('SYNC_WITH_RAINBOW');
  setBusy(ALL_BTNS, false);
  if (!resp.ok) {
    showStatus(resp.error || '同步失败', 'error');
    return;
  }
  showStatus(formatRainbowResult(resp, '云书签同步完成'), 'ok');
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
    if (lastSyncStatus.rainbowSync) {
      showStatus(formatRainbowResult(lastSyncStatus.rainbowSync, '上次云书签同步成功'), 'ok');
    } else {
      showStatus('上次同步成功。请在设置页使用最新的 Rainbow 同步入口。', 'ok');
    }
  } else {
    showStatus(`上次失败: ${lastSyncStatus.error || '未知错误'}`, 'error');
  }
}

loadLastStatus();
