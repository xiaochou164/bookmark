import { previewStateLabel } from './preview.mjs';

export function createPreviewController({
  api,
  byId,
  state,
  store,
  safeUrl,
  kindLabel,
  setIconButtonLabel,
  renderDetail,
  refreshAll,
  renderDetailFetchStatusSummary,
  showToast
}) {
  const previewState = {
    activeBookmarkId: null,
    payload: null,
    mode: 'auto',
    uiState: 'idle'
  };
  let loadSequence = 0;

  function setPreviewUiState(stateName, message = '') {
    const next = String(stateName || 'idle');
    previewState.uiState = next;
    const badge = byId('previewStateBadge');
    const note = byId('previewStateNote');
    const loading = byId('previewLoading');
    const surface = byId('previewDialog')?.querySelector('.preview-surface');
    if (badge) {
      badge.dataset.state = next;
      badge.textContent = previewStateLabel(next);
    }
    if (note) note.textContent = String(message || '');
    if (loading) loading.classList.toggle('hidden', next !== 'loading');
    if (surface) surface.classList.toggle('is-loading', next === 'loading');
    if (state.activeId && previewState.activeBookmarkId && String(state.activeId) === String(previewState.activeBookmarkId)) {
      renderDetail();
    }
  }

  function hydratePreviewToolbarIcons() {
    const mappings = [
      ['previewRefreshBtn', 'refresh', '刷新预览'],
      ['previewExtractArticleBtn', 'edit', '提取正文'],
      ['previewReaderBtn', 'preview', '阅读模式'],
      ['previewAddHighlightBtn', 'favorite', '高亮选区'],
      ['previewOriginalBtn', 'open', '打开原文'],
      ['previewCloseBtn', 'close', '关闭预览']
    ];
    mappings.forEach(([id, icon, label]) => {
      const btn = byId(id);
      if (!btn || btn.dataset.iconHydrated) return;
      setIconButtonLabel(btn, icon, btn.textContent || label);
      btn.dataset.iconHydrated = '1';
    });
  }

  function resetPreviewSurface() {
    byId('previewFrame')?.classList.add('hidden');
    byId('previewImage')?.classList.add('hidden');
    byId('previewVideo')?.classList.add('hidden');
    byId('previewFallback')?.classList.add('hidden');
    byId('previewError')?.classList.add('hidden');
    const error = byId('previewError');
    if (error) error.textContent = '';
    const frame = byId('previewFrame');
    if (frame) frame.src = 'about:blank';
    const image = byId('previewImage');
    if (image) image.src = '';
    const video = byId('previewVideo');
    if (video) {
      video.removeAttribute('src');
      video.load?.();
    }
    setPreviewUiState('idle', '选择一个书签以查看预览。');
  }

  function getReaderSelectionPayload() {
    const frame = byId('previewFrame');
    if (!frame || !frame.contentWindow) throw new Error('预览框架尚未就绪');
    let selection;
    try {
      selection = frame.contentWindow.getSelection();
    } catch (_error) {
      throw new Error('仅可在阅读模式中选区高亮');
    }
    if (!selection || !selection.rangeCount) throw new Error('未选择文本');
    const text = String(selection.toString() || '').trim();
    if (!text) throw new Error('未选择文本');
    const range = selection.getRangeAt(0);
    let prefix = '';
    let suffix = '';
    let startOffset = 0;
    let endOffset = 0;
    try {
      const node = range.startContainer;
      if (node && node.nodeType === 3) {
        const source = String(node.textContent || '');
        startOffset = Number(range.startOffset || 0);
        endOffset = Number(range.endOffset || startOffset + text.length);
        prefix = source.slice(Math.max(0, startOffset - 32), startOffset);
        suffix = source.slice(endOffset, Math.min(source.length, endOffset + 32));
      }
    } catch (_error) {
      // Cross-document or non-text selection; keep anchors minimal.
    }
    return {
      text,
      quote: text,
      anchors: {
        exact: text,
        prefix,
        suffix,
        startOffset,
        endOffset,
        selector: ''
      }
    };
  }

  function renderPreviewDialog() {
    hydratePreviewToolbarIcons();
    const titleEl = byId('previewDialogTitle');
    const metaEl = byId('previewDialogMeta');
    const payloadEl = byId('previewPayload');
    const readerBtn = byId('previewReaderBtn');
    const extractBtn = byId('previewExtractArticleBtn');
    const originalBtn = byId('previewOriginalBtn');
    const addHighlightBtn = byId('previewAddHighlightBtn');
    resetPreviewSurface();

    if (!previewState.payload) {
      if (titleEl) titleEl.textContent = '预览';
      if (metaEl) metaEl.textContent = '尚未加载预览。';
      if (payloadEl) payloadEl.textContent = '';
      setIconButtonLabel(readerBtn, 'preview', '阅读模式');
      setIconButtonLabel(addHighlightBtn, 'favorite', '高亮选区');
      if (readerBtn) {
        readerBtn.disabled = true;
        readerBtn.setAttribute('aria-pressed', 'false');
      }
      if (extractBtn) extractBtn.disabled = true;
      if (originalBtn) originalBtn.disabled = true;
      if (addHighlightBtn) {
        addHighlightBtn.disabled = true;
        addHighlightBtn.classList.remove('active');
      }
      byId('previewFallback')?.classList.remove('hidden');
      if (previewState.uiState !== 'error' && previewState.uiState !== 'loading') {
        setPreviewUiState('idle', '尚未加载预览。');
      }
      return;
    }

    const p = previewState.payload.preview || previewState.payload;
    const summary = p.summary || {};
    if (titleEl) titleEl.textContent = p.title || '预览';
    if (metaEl) {
      metaEl.textContent = [kindLabel(p.kind), summary.siteName, summary.contentType, summary.articleStatus, summary.metadataStatus]
        .filter(Boolean)
        .join(' · ');
    }
    if (payloadEl) payloadEl.textContent = JSON.stringify(p, null, 2);
    if (originalBtn) originalBtn.disabled = !p?.fallback?.openUrl && !p?.sourceUrl;
    if (readerBtn) {
      readerBtn.disabled = !Boolean(p?.reader?.available);
      setIconButtonLabel(readerBtn, previewState.mode === 'reader' ? 'open' : 'preview', previewState.mode === 'reader' ? '网页模式' : '阅读模式');
      readerBtn.setAttribute('aria-pressed', String(previewState.mode === 'reader'));
    }
    if (extractBtn) extractBtn.disabled = String(p?.kind || '') !== 'web';
    if (addHighlightBtn) {
      addHighlightBtn.disabled = !(previewState.mode === 'reader' && p?.reader?.available);
      addHighlightBtn.classList.toggle('active', previewState.mode === 'reader' && p?.reader?.available);
    }

    const useReader = previewState.mode === 'reader' && p?.reader?.available;
    const mode = useReader ? 'iframe' : String(p?.render?.mode || 'iframe');
    const url = useReader ? String(p.reader.renderUrl || '') : String(p?.render?.url || '');
    if (!url || Boolean(p?.render?.frameRestricted)) {
      byId('previewFallback')?.classList.remove('hidden');
      setPreviewUiState('fallback', !url ? '当前条目没有可嵌入预览，已降级为打开原文。' : '目标网站的安全策略（X-Frame-Options / CSP）禁止嵌入展示，请直接打开原文。');
      return;
    }

    setPreviewUiState('ready', useReader ? '阅读模式已就绪。' : '预览已加载。');
    if (mode === 'image') {
      const image = byId('previewImage');
      if (image) {
        image.src = safeUrl(url);
        image.classList.remove('hidden');
      }
      return;
    }
    if (mode === 'video') {
      const video = byId('previewVideo');
      if (video) {
        video.src = safeUrl(url);
        video.classList.remove('hidden');
      }
      return;
    }
    const frame = byId('previewFrame');
    if (frame) {
      frame.src = safeUrl(url);
      frame.classList.remove('hidden');
    }
  }

  async function loadPreviewForBookmark(bookmarkId, { preferredMode = 'auto' } = {}) {
    const id = String(bookmarkId || state.activeId || '');
    if (!id) return;
    const sequence = ++loadSequence;
    previewState.activeBookmarkId = id;
    if (preferredMode) previewState.mode = preferredMode;
    const meta = byId('previewDialogMeta');
    if (meta) meta.textContent = '正在加载预览...';
    byId('previewError')?.classList.add('hidden');
    setPreviewUiState('loading', '正在请求预览内容…');
    try {
      const payload = await api(`/api/bookmarks/${encodeURIComponent(id)}/preview`);
      if (sequence !== loadSequence || previewState.activeBookmarkId !== id) return;
      previewState.payload = payload;
      renderPreviewDialog();
    } catch (error) {
      if (sequence !== loadSequence || previewState.activeBookmarkId !== id) return;
      previewState.payload = null;
      renderPreviewDialog();
      const errorEl = byId('previewError');
      if (errorEl) {
        errorEl.textContent = `预览加载失败：${error.message}`;
        errorEl.classList.remove('hidden');
      }
      byId('previewFallback')?.classList.remove('hidden');
      setPreviewUiState('error', '预览请求失败，可尝试刷新或打开原文。');
    }
  }

  async function openPreviewDialog(bookmarkId, { preferredMode = 'auto' } = {}) {
    const dialog = byId('previewDialog');
    if (dialog && !dialog.open) dialog.showModal();
    await loadPreviewForBookmark(bookmarkId, { preferredMode });
    if (state.activeId && String(state.activeId) === String(previewState.activeBookmarkId || '')) renderDetail();
  }

  async function extractArticleForActiveBookmark({ openReaderAfter = false } = {}) {
    const id = String(state.activeId || previewState.activeBookmarkId || '');
    if (!id) return;
    try {
      const detailInfo = byId('detailArticleInfo');
      if (detailInfo) detailInfo.textContent = '正文：提取中...';
      renderDetailFetchStatusSummary({
        item: state.bookmarks.find((item) => item.id === id) || state.allBookmarks.find((item) => item.id === id) || null
      });
      const out = await api(`/api/bookmarks/${encodeURIComponent(id)}/article/extract`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      await refreshAll();
      if (byId('previewDialog')?.open && String(previewState.activeBookmarkId || '') === id) {
        if (openReaderAfter) previewState.mode = 'reader';
        await loadPreviewForBookmark(id, { preferredMode: previewState.mode });
      }
      showToast(`正文已提取${out?.article?.title ? `: ${out.article.title}` : ''}`, { timeoutMs: 3500 });
    } catch (error) {
      const detailInfo = byId('detailArticleInfo');
      if (detailInfo) detailInfo.textContent = `article: failed · ${error.message}`;
      renderDetailFetchStatusSummary({
        item: state.bookmarks.find((item) => item.id === id) || state.allBookmarks.find((item) => item.id === id) || null,
        task: { status: 'failed' }
      });
      if (byId('previewDialog')?.open) {
        const errorEl = byId('previewError');
        if (errorEl) {
          errorEl.textContent = `正文提取失败：${error.message}`;
          errorEl.classList.remove('hidden');
        }
        setPreviewUiState('error', '正文提取失败，预览仍可继续使用。');
      }
      showToast(error.message || '正文提取失败', { timeoutMs: 5000 });
    }
  }

  function closePreviewDialog() {
    const closingBookmarkId = String(previewState.activeBookmarkId || '');
    loadSequence += 1;
    previewState.activeBookmarkId = null;
    previewState.payload = null;
    previewState.mode = 'auto';
    setPreviewUiState('idle', '选择一个书签以查看预览。');
    resetPreviewSurface();
    if (closingBookmarkId && state.activeId && String(state.activeId) === closingBookmarkId) renderDetail();
  }

  return {
    closePreviewDialog,
    extractArticleForActiveBookmark,
    getReaderSelectionPayload,
    get state() { return previewState; },
    loadPreviewForBookmark,
    openPreviewDialog,
    renderPreviewDialog,
    resetPreviewSurface,
    setPreviewUiState
  };
}
