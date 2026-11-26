export function createRealtimeNotificationsController({
  api,
  byId,
  escapeHtml,
  getAuthenticated,
  getActiveBookmarkId,
  loadSidebarSyncHealth,
  loadIoTasks,
  loadLatestMetadataTaskForBookmark,
  refreshAll,
  showToast
}) {
  let eventsSource = null;
  let pollTimer = null;
  let refreshTimer = null;
  let notificationsOpen = false;
  let lastSignature = '';
  let initialSnapshotSeen = false;
  let notifications = [];

  function realtimeTaskActiveCount(snapshot) {
    return Object.values(snapshot?.tasks || {}).reduce((sum, section) => sum + Number(section?.active || 0), 0);
  }

  function realtimeTaskFailureCount(snapshot) {
    return Object.values(snapshot?.tasks || {}).reduce((sum, section) => (
      sum + Number(section?.counts?.failed || 0) + Number(section?.counts?.partial || 0)
    ), 0);
  }

  function realtimeSnapshotMessage(snapshot) {
    const active = realtimeTaskActiveCount(snapshot);
    const failed = realtimeTaskFailureCount(snapshot);
    const due = Number(snapshot?.reminders?.due || 0);
    const parts = [];
    if (active) parts.push(`${active} 个任务进行中`);
    if (failed) parts.push(`${failed} 个任务需关注`);
    if (due) parts.push(`${due} 个提醒到期`);
    return parts.length ? parts.join(' · ') : '实时状态已更新';
  }

  function render() {
    const btn = byId('realtimeNotificationsBtn');
    const badge = byId('realtimeNotificationsBadge');
    const headerBadge = byId('headerNotificationsBadge');
    const menu = byId('realtimeNotificationsMenu');
    if (btn) btn.setAttribute('aria-expanded', String(notificationsOpen));
    if (menu) menu.classList.toggle('hidden', !notificationsOpen);
    const unread = notifications.filter((item) => item.unread).length;
    if (badge) {
      badge.textContent = String(Math.min(99, unread));
      badge.classList.toggle('hidden', unread <= 0);
    }
    if (headerBadge) {
      headerBadge.textContent = String(Math.min(99, unread));
      headerBadge.classList.toggle('hidden', unread <= 0);
    }
    if (!menu) return;
    if (!notifications.length) {
      menu.innerHTML = '<div class="realtime-notification-item"><div class="realtime-notification-title">暂无通知</div><div class="realtime-notification-meta">实时任务和提醒更新会显示在这里。</div></div>';
      return;
    }
    menu.innerHTML = notifications.map((item) => `<div class="realtime-notification-item" role="menuitem">
      <div class="realtime-notification-title">${escapeHtml(item.title)}</div>
      <div class="realtime-notification-meta">${escapeHtml(item.message)} · ${new Date(item.createdAt).toLocaleTimeString()}</div>
    </div>`).join('');
  }

  function markAllRead() {
    notifications = notifications.map((item) => ({ ...item, unread: false }));
  }

  function setOpen(open) {
    notificationsOpen = Boolean(open);
    if (notificationsOpen) markAllRead();
    render();
  }

  function toggleOpen() {
    setOpen(!notificationsOpen);
  }

  function isOpen() {
    return notificationsOpen;
  }

  function addNotification(title, message) {
    notifications.unshift({
      id: `rt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      title: String(title || '实时更新'),
      message: String(message || ''),
      createdAt: Date.now(),
      unread: true
    });
    notifications = notifications.slice(0, 20);
    render();
  }

  function scheduleUiRefresh(snapshot) {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      loadSidebarSyncHealth({ force: true }).catch(() => {});
      loadIoTasks().catch(() => {});
      const activeBookmarkId = getActiveBookmarkId();
      if (activeBookmarkId) {
        loadLatestMetadataTaskForBookmark(activeBookmarkId, { force: true }).catch(() => {});
      }
      if (Number(snapshot?.reminders?.due || 0) > 0 || realtimeTaskActiveCount(snapshot) === 0) {
        refreshAll().catch(() => {});
      }
    }, 700);
  }

  function handleSnapshot(snapshot, { source = 'sse' } = {}) {
    const signature = String(snapshot?.signature || JSON.stringify(snapshot || {}));
    if (!signature || signature === lastSignature) return false;
    const wasInitial = !initialSnapshotSeen;
    initialSnapshotSeen = true;
    lastSignature = signature;
    if (wasInitial) return true;
    const message = realtimeSnapshotMessage(snapshot);
    addNotification(source === 'poll' ? '状态轮询更新' : '实时状态更新', message);
    showToast(message, { timeoutMs: 3200 });
    scheduleUiRefresh(snapshot);
    return true;
  }

  async function pollSnapshot() {
    try {
      const snapshot = await api('/api/events-snapshot');
      handleSnapshot(snapshot, { source: 'poll' });
    } catch (_err) {
      try {
        const health = await api('/api/product/task-health?limit=100');
        handleSnapshot({
          generatedAt: health.generatedAt || Date.now(),
          tasks: health.sections || {},
          reminders: { due: 0 },
          signature: JSON.stringify(health.sections || {})
        }, { source: 'poll' });
      } catch (__err) {
        // Keep the realtime fallback quiet; normal manual refresh still works.
      }
    }
  }

  function stop() {
    if (eventsSource) {
      eventsSource.close();
      eventsSource = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollSnapshot().catch(() => {});
    pollTimer = setInterval(() => {
      pollSnapshot().catch(() => {});
    }, 5000);
  }

  function start() {
    stop();
    if (!getAuthenticated()) return;
    if (!('EventSource' in window)) {
      startPolling();
      return;
    }
    try {
      eventsSource = new EventSource('/api/events');
      eventsSource.addEventListener('rainbow:update', (event) => {
        try {
          handleSnapshot(JSON.parse(event.data || '{}'), { source: 'sse' });
        } catch (_err) {
          // Ignore malformed transient event payloads.
        }
      });
      eventsSource.onerror = () => {
        stop();
        startPolling();
      };
    } catch (_err) {
      startPolling();
    }
  }

  return {
    addNotification,
    handleSnapshot,
    isOpen,
    markAllRead,
    pollSnapshot,
    render,
    setOpen,
    start,
    startPolling,
    stop,
    toggleOpen,
    realtimeTaskActiveCount,
    realtimeTaskFailureCount,
    realtimeSnapshotMessage
  };
}
