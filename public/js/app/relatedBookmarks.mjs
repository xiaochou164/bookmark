export function createRelatedBookmarksController({
  api,
  byId,
  state,
  store,
  escapeHtml,
  hostFromUrl,
  bookmarkTimeText,
  detailAiOperationBusy,
  isDetailEditMode,
  renderCards,
  renderDetail,
  updateDetailPanelHeadUi,
  uiConfirm,
  refreshAll,
  showToast
}) {
  const relatedState = {
    bookmarkId: '',
    loading: false,
    running: false,
    items: [],
    summary: '',
    confidence: 0,
    error: ''
  };
  let requestSequence = 0;

  function clearState() {
    requestSequence += 1;
    relatedState.bookmarkId = '';
    relatedState.loading = false;
    relatedState.running = false;
    relatedState.items = [];
    relatedState.summary = '';
    relatedState.confidence = 0;
    relatedState.error = '';
  }

  function syncBookmark(item) {
    const id = String(item?.id || '');
    if (relatedState.running && relatedState.bookmarkId && relatedState.bookmarkId !== id) {
      requestSequence += 1;
      relatedState.running = false;
      relatedState.loading = false;
      relatedState.bookmarkId = '';
      relatedState.items = [];
      relatedState.summary = '';
      relatedState.confidence = 0;
      relatedState.error = '';
    }
  }

  function renderRelatedBookmarksUi(item = null) {
    const infoEl = byId('detailRelatedBookmarksInfo');
    const listEl = byId('detailRelatedBookmarksList');
    const btn = byId('refreshRelatedBookmarksBtn');
    if (!infoEl || !listEl) return;

    syncBookmark(item);
    const hasItem = Boolean(item && item.id);
    if (btn) {
      btn.disabled = !hasItem || Boolean(item?.deletedAt) || detailAiOperationBusy();
      btn.setAttribute('aria-busy', String(Boolean(relatedState.running)));
      btn.textContent = relatedState.running ? 'AI 推荐中…' : 'AI 推荐';
    }

    if (!hasItem) {
      infoEl.textContent = '';
      listEl.innerHTML = '';
      return;
    }

    const targetId = String(item.id);
    if (String(relatedState.bookmarkId || '') !== targetId) {
      infoEl.textContent = '点击“AI 推荐”生成相关书签。';
      listEl.innerHTML = '<div class="muted">暂无推荐结果。</div>';
      return;
    }

    if (relatedState.loading || relatedState.running) {
      infoEl.textContent = 'AI 正在分析当前书签并生成相关推荐...';
      listEl.innerHTML = '<div class="muted">生成中，请稍候…</div>';
      return;
    }

    if (relatedState.error) {
      infoEl.textContent = `AI 推荐失败：${relatedState.error}`;
      listEl.innerHTML = '<div class="muted">可点击“AI 推荐”重试。</div>';
      return;
    }

    const rows = Array.isArray(relatedState.items) ? relatedState.items : [];
    const summary = String(relatedState.summary || '').trim();
    const confidence = Number(relatedState.confidence || 0);
    const bits = [];
    if (rows.length) bits.push(`${rows.length} 条推荐`);
    if (summary) bits.push(summary);
    if (confidence > 0) bits.push(`置信度 ${(confidence * 100).toFixed(0)}%`);
    infoEl.textContent = bits.join(' · ') || '暂无推荐结果';

    if (!rows.length) {
      listEl.innerHTML = '<div class="muted">AI 未找到明显相关的书签。</div>';
      return;
    }

    listEl.innerHTML = rows.map((row) => {
      const score = Number(row.score || 0);
      const host = String(row.host || hostFromUrl(row.url || '') || '');
      const bookmark = state.bookmarks.find((entry) => String(entry.id) === String(row.id))
        || state.allBookmarks.find((entry) => String(entry.id) === String(row.id));
      const timeText = bookmark ? bookmarkTimeText(bookmark) : '';
      const meta = [row.folderPath, host, timeText].filter(Boolean).join(' · ');
      return `<button type="button" class="detail-related-item" data-related-bookmark-open="${escapeHtml(String(row.id))}">
        <div class="detail-related-item-title-row">
          <span class="detail-related-item-title">${escapeHtml(row.title || '(untitled)')}</span>
          ${score > 0 ? `<span class="meta-chip info">${Math.round(score * 100)}%</span>` : ''}
        </div>
        <div class="detail-related-item-meta muted">${escapeHtml(meta)}</div>
        ${row.reason ? `<div class="detail-related-item-reason">${escapeHtml(row.reason)}</div>` : ''}
      </button>`;
    }).join('');

    listEl.querySelectorAll('[data-related-bookmark-open]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = String(el.dataset.relatedBookmarkOpen || '');
        if (!id) return;
        store.setActiveId(id);
        renderCards();
        renderDetail();
      });
    });
  }

  async function runAiRelatedBookmarksForActiveBookmark() {
    const item = state.bookmarks.find((entry) => entry.id === state.activeId)
      || state.allBookmarks.find((entry) => entry.id === state.activeId);
    if (!item || item.deletedAt || detailAiOperationBusy()) return;

    if (typeof uiConfirm === 'function' && isDetailEditMode()) {
      const ok = await uiConfirm('当前处于编辑模式，AI 相关推荐会刷新详情区域状态。是否继续？', {
        title: 'AI 相关书签推荐',
        confirmText: '继续',
        cancelText: '取消'
      });
      if (!ok) return;
    }

    const id = String(item.id);
    const sequence = ++requestSequence;
    relatedState.bookmarkId = id;
    relatedState.loading = true;
    relatedState.running = true;
    relatedState.items = [];
    relatedState.summary = '';
    relatedState.confidence = 0;
    relatedState.error = '';
    updateDetailPanelHeadUi(item);
    renderRelatedBookmarksUi(item);
    try {
      const out = await api(`/api/product/ai/related/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({ limit: 8 })
      });
      if (sequence !== requestSequence || String(state.activeId || '') !== id) return;
      relatedState.loading = false;
      relatedState.running = false;
      relatedState.items = Array.isArray(out?.items) ? out.items : [];
      relatedState.summary = String(out?.summary || '');
      relatedState.confidence = Math.max(0, Math.min(1, Number(out?.confidence) || 0));
      renderRelatedBookmarksUi(item);
      const count = Array.isArray(out?.items) ? out.items.length : 0;
      showToast(count ? `AI 已生成 ${count} 条相关书签推荐` : 'AI 未找到明显相关的书签', { timeoutMs: 3400 });
    } catch (error) {
      if (sequence !== requestSequence || String(state.activeId || '') !== id) return;
      relatedState.loading = false;
      relatedState.running = false;
      relatedState.items = [];
      relatedState.summary = '';
      relatedState.confidence = 0;
      relatedState.error = String(error.message || error);
      renderRelatedBookmarksUi(item);
      showToast(error.message || 'AI 相关书签推荐失败', { timeoutMs: 4200 });
    } finally {
      if (sequence !== requestSequence) return;
      relatedState.loading = false;
      relatedState.running = false;
      const latest = state.bookmarks.find((entry) => entry.id === state.activeId)
        || state.allBookmarks.find((entry) => entry.id === state.activeId)
        || null;
      updateDetailPanelHeadUi(latest);
      if (latest) renderRelatedBookmarksUi(latest);
    }
  }

  return {
    clearState,
    get state() { return relatedState; },
    renderRelatedBookmarksUi,
    runAiRelatedBookmarksForActiveBookmark
  };
}
