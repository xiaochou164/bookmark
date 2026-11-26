function activeItemFromState(state, getActiveBookmark) {
  if (typeof getActiveBookmark === 'function') return getActiveBookmark();
  const id = String(state?.activeId || '');
  if (!id) return null;
  return (state?.bookmarks || []).find((item) => String(item?.id) === id)
    || (state?.allBookmarks || []).find((item) => String(item?.id) === id)
    || null;
}

export function createDetailActionsController({
  byId,
  state,
  getActiveBookmark,
  isEditMode = () => false,
  setEditMode,
  saveDetail,
  deleteDetail,
  restoreDetail,
  openLink,
  openPreview,
  openReader,
  copyLink,
  runAiAutoTag,
  runAiTitleClean,
  runAiSummary,
  runAiReaderSummary,
  runAiHighlightDigest,
  runAiFolderRecommend,
  openAiQa,
  runAiRelated,
  moveActiveBookmark,
  closeDetail,
  toggleDetailSection,
  isMoreMenuOpen = () => false,
  setMoreMenuOpen,
  showToast
}) {
  const getItem = () => activeItemFromState(state, getActiveBookmark);
  const hasItem = () => Boolean(getItem()?.id);
  const runIfActive = (handler, ...args) => {
    if (!hasItem() || typeof handler !== 'function') return undefined;
    return handler(...args);
  };

  async function runDetailPanelMoreAction(action) {
    const item = getItem();
    if (!item) return;
    const act = String(action || '');
    const actions = {
      'open-current': () => runIfActive(openLink, { item, target: '_self', markOpened: false }),
      'open-new': () => runIfActive(openLink, { item, target: '_blank', markOpened: false }),
      'copy-link': () => runIfActive(copyLink, item),
      'ai-autotag': () => runIfActive(runAiAutoTag),
      'ai-title-clean': () => runIfActive(runAiTitleClean),
      'ai-summary': () => runIfActive(runAiSummary),
      'ai-reader-summary': () => runIfActive(runAiReaderSummary),
      'ai-highlight-digest': () => runIfActive(runAiHighlightDigest),
      'ai-folder-recommend': () => runIfActive(runAiFolderRecommend),
      'ai-qa': () => runIfActive(openAiQa, { bookmarkId: item.id, scope: 'auto' }),
      'ai-related': () => runIfActive(runAiRelated),
      'preview-web': () => runIfActive(openPreview, item.id),
      'preview-reader': () => runIfActive(openReader, item.id),
      'toggle-edit': () => runIfActive(setEditMode, !isEditMode()),
      'delete': () => runIfActive(deleteDetail),
      'restore': () => runIfActive(restoreDetail)
    };
    const handler = actions[act];
    if (typeof handler !== 'function') return;
    await handler();
  }

  function bind() {
    byId('saveDetailBtn')?.addEventListener('click', () => runIfActive(saveDetail));
    byId('enableDetailEditBtn')?.addEventListener('click', () => runIfActive(setEditMode, true));
    byId('cancelDetailEditBtn')?.addEventListener('click', () => runIfActive(setEditMode, false));
    byId('detailHeaderEditBtn')?.addEventListener('click', () => runIfActive(setEditMode, true));
    byId('detailHeaderCancelEditBtn')?.addEventListener('click', () => runIfActive(setEditMode, false));

    byId('deleteDetailBtn')?.addEventListener('click', () => runIfActive(deleteDetail));
    byId('detailHeaderDeleteBtn')?.addEventListener('click', () => runIfActive(deleteDetail));
    byId('restoreDetailBtn')?.addEventListener('click', () => runIfActive(restoreDetail));
    byId('detailHeaderRestoreBtn')?.addEventListener('click', () => runIfActive(restoreDetail));

    byId('openLinkBtn')?.addEventListener('click', () => runIfActive(openLink, { item: getItem(), target: '_blank' }));
    byId('detailHeaderOpenBtn')?.addEventListener('click', () => runIfActive(openLink, { item: getItem(), target: '_blank' }));
    byId('openPreviewBtn')?.addEventListener('click', () => runIfActive(openPreview, getItem()?.id));
    byId('detailHeaderPreviewBtn')?.addEventListener('click', () => runIfActive(openPreview, getItem()?.id));
    byId('detailHeaderAiTagBtn')?.addEventListener('click', () => runIfActive(runAiAutoTag));
    byId('refreshRelatedBookmarksBtn')?.addEventListener('click', () => runIfActive(runAiRelated));

    byId('detailPrevBtn')?.addEventListener('click', () => runIfActive(moveActiveBookmark, -1));
    byId('detailNextBtn')?.addEventListener('click', () => runIfActive(moveActiveBookmark, 1));
    byId('detailPanelViewModeBtn')?.addEventListener('click', () => runIfActive(setEditMode, false));
    byId('detailPanelEditModeBtn')?.addEventListener('click', () => runIfActive(setEditMode, true));
    byId('detailPanelWebBtn')?.addEventListener('click', () => runIfActive(openPreview, getItem()?.id));
    byId('detailPanelReaderBtn')?.addEventListener('click', () => runIfActive(openReader, getItem()?.id));
    byId('detailPanelMoreBtn')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!hasItem()) return;
      setMoreMenuOpen?.(!isMoreMenuOpen());
    });
    byId('detailPanelMoreMenu')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-detail-panel-more-action]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const action = String(button.getAttribute('data-detail-panel-more-action') || '');
      setMoreMenuOpen?.(false);
      runDetailPanelMoreAction(action).catch((error) => {
        showToast?.(error?.message || '详情菜单操作失败', { timeoutMs: 4000 });
      });
    });
    byId('detailCloseBtn')?.addEventListener('click', () => closeDetail?.());
    byId('detailPanelBackdrop')?.addEventListener('click', () => closeDetail?.());
    byId('detailForm')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-detail-section-toggle]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const key = String(button.getAttribute('data-detail-section-toggle') || '');
      if (key) toggleDetailSection?.(key);
    });
  }

  return { bind, runDetailPanelMoreAction };
}
