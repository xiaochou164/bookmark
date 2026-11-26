export function createAiFolderSummaryController({
  api,
  byId,
  state,
  escapeHtml,
  getFolderById,
  folderName,
  store,
  renderCards,
  renderDetail,
  refreshAll,
  showToast
}) {
  const summaryState = {
    loading: false,
    folderId: '',
    result: null,
    error: '',
    suppressPersisted: false
  };
  let requestSequence = 0;

  function currentCollection() {
    const folderId = String(state.filters.folderId || 'all');
    if (!folderId || folderId === 'all') return null;
    return getFolderById(folderId);
  }

  function formatSummaryText(result = null) {
    const summary = result && typeof result === 'object' ? result : null;
    if (!summary) return '';
    const lines = [];
    if (summary.folderPath || summary.folderName) lines.push(`集合：${summary.folderPath || summary.folderName}`);
    if (summary.summary) {
      lines.push('');
      lines.push('摘要');
      lines.push(String(summary.summary));
    }
    if (Array.isArray(summary.themes) && summary.themes.length) {
      lines.push('');
      lines.push(`主题：${summary.themes.join(' / ')}`);
    }
    if (Array.isArray(summary.commonTags) && summary.commonTags.length) {
      lines.push(`常见标签：${summary.commonTags.join(', ')}`);
    }
    if (Array.isArray(summary.representativeSources) && summary.representativeSources.length) {
      lines.push(`代表来源：${summary.representativeSources.join(', ')}`);
    }
    if (Array.isArray(summary.keyInsights) && summary.keyInsights.length) {
      lines.push('');
      lines.push('关键洞见');
      summary.keyInsights.forEach((x) => lines.push(`- ${x}`));
    }
    if (Array.isArray(summary.notableBookmarks) && summary.notableBookmarks.length) {
      lines.push('');
      lines.push('代表书签');
      summary.notableBookmarks.forEach((x) => lines.push(`- ${x.title || x.bookmarkId}${x.reason ? `：${x.reason}` : ''}`));
    }
    return lines.join('\n').trim();
  }

  function renderUi() {
    const dialog = byId('aiFolderSummaryDialog');
    if (!dialog) return;
    const subtitleEl = byId('aiFolderSummarySubtitle');
    const metaEl = byId('aiFolderSummaryMeta');
    const contentEl = byId('aiFolderSummaryContent');
    const runBtn = byId('aiFolderSummaryRunBtn');
    const copyBtn = byId('aiFolderSummaryCopyBtn');
    const clearBtn = byId('aiFolderSummaryClearBtn');
    if (!subtitleEl || !metaEl || !contentEl || !runBtn || !copyBtn || !clearBtn) return;

    const folder = currentCollection();
    const folderId = String(folder?.id || summaryState.folderId || '');
    const folderPath = folder?.path || folderName(folderId) || String(folder?.name || '');
    const persisted = folder?.aiSuggestions?.collectionSummary && typeof folder.aiSuggestions.collectionSummary === 'object'
      ? folder.aiSuggestions.collectionSummary
      : null;
    const result = summaryState.result && String(summaryState.folderId || '') === String(folderId)
      ? summaryState.result
      : (summaryState.suppressPersisted ? null : persisted);
    const loading = Boolean(summaryState.loading);
    const error = String(summaryState.error || '');
    const hasFolder = Boolean(folder && folderId);

    subtitleEl.textContent = hasFolder
      ? `对集合「${folderPath || folder.name || folderId}」生成主题总结、常见标签与代表来源。`
      : '请先在左侧选择一个集合，然后点击生成。';

    const metaBits = [];
    if (loading) metaBits.push('AI 正在分析集合内容...');
    if (hasFolder) metaBits.push(`集合：${folderPath || folder.name || folderId}`);
    if (result?.bookmarkCount) metaBits.push(`${Number(result.bookmarkCount)} 条书签`);
    if (result?.descendantFolderCount) metaBits.push(`${Number(result.descendantFolderCount)} 个子集合`);
    if (result?.generatedAt) metaBits.push(`生成于：${new Date(Number(result.generatedAt)).toLocaleString()}`);
    if (result?.provider?.providerType) {
      metaBits.push(`模型：${result.provider.providerType}${result.provider.model ? `/${result.provider.model}` : ''}`);
    }
    if (error) metaBits.unshift(`失败：${error}`);
    metaEl.textContent = metaBits.join(' · ') || '暂无结果。';

    runBtn.disabled = !hasFolder || loading;
    runBtn.textContent = loading ? '生成中…' : '生成摘要';
    runBtn.setAttribute('aria-busy', String(loading));
    copyBtn.disabled = !String(formatSummaryText(result)).trim();
    clearBtn.disabled = loading && !result;

    if (loading && !result) {
      contentEl.innerHTML = '<div class="muted">AI 正在整理该集合的主题与来源结构，请稍候…</div>';
      return;
    }
    if (error && !result) {
      contentEl.innerHTML = `<div class="muted">生成失败：${escapeHtml(error)}</div>`;
      return;
    }
    if (!result) {
      contentEl.innerHTML = '<div class="muted">暂无结果。</div>';
      return;
    }

    const themes = Array.isArray(result.themes) ? result.themes : [];
    const commonTags = Array.isArray(result.commonTags) ? result.commonTags : [];
    const sources = Array.isArray(result.representativeSources) ? result.representativeSources : [];
    const notable = Array.isArray(result.notableBookmarks) ? result.notableBookmarks : [];
    const topTags = Array.isArray(result.topTags) ? result.topTags : [];
    const topHosts = Array.isArray(result.topHosts) ? result.topHosts : [];

    contentEl.innerHTML = `
      <section class="ai-folder-summary-panel">
        <div class="ai-folder-summary-panel-title">主题摘要</div>
        <div class="ai-folder-summary-text">${escapeHtml(String(result.summary || '暂无摘要'))}</div>
      </section>
      ${themes.length ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">主题</div><div class="tag-list">${themes.map((x) => `<span class="tag">${escapeHtml(String(x))}</span>`).join('')}</div></section>` : ''}
      ${commonTags.length ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">常见标签</div><div class="tag-list">${commonTags.map((x) => `<span class="tag">${escapeHtml(String(x))}</span>`).join('')}</div></section>` : ''}
      ${sources.length ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">代表来源</div><div class="ai-folder-summary-chip-list">${sources.map((x) => `<span class="meta-chip type">${escapeHtml(String(x))}</span>`).join('')}</div></section>` : ''}
      ${notable.length ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">代表书签</div><div class="ai-folder-summary-list">${notable.map((x) => `<button type="button" class="ai-folder-summary-item" data-ai-folder-summary-open="${escapeHtml(String(x.bookmarkId || ''))}"><div class="ai-folder-summary-item-title">${escapeHtml(String(x.title || x.bookmarkId || ''))}</div>${x.reason ? `<div class="ai-folder-summary-item-reason muted">${escapeHtml(String(x.reason))}</div>` : ''}</button>`).join('')}</div></section>` : ''}
      ${(topTags.length || topHosts.length) ? `<section class="ai-folder-summary-panel"><div class="ai-folder-summary-panel-title">统计参考</div>
        ${topTags.length ? `<div class="ai-folder-summary-stat-block"><div class="muted">Top 标签</div><div class="ai-folder-summary-chip-list">${topTags.slice(0, 8).map((x) => `<span class="meta-chip">${escapeHtml(String(x.tag || ''))} · ${Number(x.count || 0)}</span>`).join('')}</div></div>` : ''}
        ${topHosts.length ? `<div class="ai-folder-summary-stat-block"><div class="muted">Top 来源</div><div class="ai-folder-summary-chip-list">${topHosts.slice(0, 8).map((x) => `<span class="meta-chip">${escapeHtml(String(x.host || ''))} · ${Number(x.count || 0)}</span>`).join('')}</div></div>` : ''}
      </section>` : ''}
    `;

    contentEl.querySelectorAll('[data-ai-folder-summary-open]').forEach((el) => {
      el.addEventListener('click', () => {
        const bookmarkId = String(el.getAttribute('data-ai-folder-summary-open') || '').trim();
        if (!bookmarkId) return;
        store.setActiveId(bookmarkId);
        renderCards();
        renderDetail();
        showToast('已定位到代表书签', { timeoutMs: 1800 });
      });
    });
  }

  function open() {
    const dialog = byId('aiFolderSummaryDialog');
    if (!dialog) return;
    requestSequence += 1;
    const folder = currentCollection();
    summaryState.folderId = String(folder?.id || '');
    summaryState.error = '';
    summaryState.suppressPersisted = false;
    summaryState.result = folder?.aiSuggestions?.collectionSummary && typeof folder.aiSuggestions.collectionSummary === 'object'
      ? folder.aiSuggestions.collectionSummary
      : null;
    renderUi();
    if (!dialog.open) dialog.showModal();
    if (folder && !summaryState.result) void run();
  }

  function close() {
    const dialog = byId('aiFolderSummaryDialog');
    if (dialog?.open) dialog.close();
  }

  function clearResult() {
    requestSequence += 1;
    summaryState.loading = false;
    summaryState.result = null;
    summaryState.error = '';
    summaryState.suppressPersisted = true;
    renderUi();
  }

  function handleDialogClose() {
    requestSequence += 1;
    summaryState.loading = false;
    summaryState.error = '';
    renderUi();
  }

  async function run() {
    const folder = currentCollection();
    if (!folder) {
      showToast('请先在左侧选择一个集合', { timeoutMs: 2600 });
      return;
    }
    if (summaryState.loading && String(summaryState.folderId) === String(folder.id)) return;
    const sequence = ++requestSequence;
    summaryState.folderId = String(folder.id);
    summaryState.loading = true;
    summaryState.error = '';
    summaryState.suppressPersisted = false;
    renderUi();
    try {
      const out = await api(`/api/product/ai/folder-summary/${encodeURIComponent(String(folder.id))}`, {
        method: 'POST',
        body: JSON.stringify({ apply: true })
      });
      if (sequence !== requestSequence || String(state.filters.folderId || '') !== String(folder.id)) return;
      summaryState.loading = false;
      summaryState.folderId = String(folder.id);
      summaryState.result = out?.collectionSummary || out?.folder?.aiSuggestions?.collectionSummary || null;
      summaryState.error = '';
      renderUi();
      await refreshAll();
      const summary = String(summaryState.result?.summary || '').trim();
      showToast(summary ? `AI 集合摘要已生成：${summary.slice(0, 60)}${summary.length > 60 ? '…' : ''}` : 'AI 集合摘要已生成', { timeoutMs: 3800 });
    } catch (err) {
      if (sequence !== requestSequence || String(state.filters.folderId || '') !== String(folder.id)) return;
      summaryState.loading = false;
      summaryState.error = String(err.message || err);
      renderUi();
      showToast(err.message || 'AI 集合知识摘要失败', { timeoutMs: 4200 });
    }
  }

  return {
    get state() { return summaryState; },
    formatSummaryText,
    renderUi,
    open,
    close,
    clearResult,
    handleDialogClose,
    run
  };
}
