export function createHighlightsController({
  api,
  byId,
  state,
  escapeHtml,
  uiPrompt,
  uiConfirm,
  refreshAll,
  showToast
}) {
  let bookmarkId = null;
  let loadSeq = 0;

  function highlightColorLabel(color = '') {
    const value = String(color || '').toLowerCase();
    return value || '黄色';
  }

  function renderHighlightsList(highlights = [], { bookmarkId: targetBookmarkId = null } = {}) {
    const activeBookmarkId = state.activeId ? String(state.activeId) : '';
    const bid = String(targetBookmarkId || activeBookmarkId || '');
    if (!bid || (activeBookmarkId && bid !== activeBookmarkId)) return;
    const listEl = byId('detailHighlightsList');
    const infoEl = byId('detailHighlightsInfo');
    if (!listEl || !infoEl) return;

    const rows = Array.isArray(highlights) ? highlights : [];
    const totalAnnotations = rows.reduce((sum, item) => sum + (Array.isArray(item.annotations) ? item.annotations.length : 0), 0);
    infoEl.textContent = `${rows.length} 条高亮 · ${totalAnnotations} 条注释`;
    if (!rows.length) {
      listEl.innerHTML = '<div class="muted">暂无高亮。可使用“阅读模式 + 高亮选区”或手动新增高亮。</div>';
      return;
    }
    listEl.innerHTML = rows.map((item) => {
      const annotations = Array.isArray(item.annotations) ? item.annotations : [];
      const quotePreview = escapeHtml((item.quote || item.text || '').slice(0, 120) || '（无文本）');
      const updatedLabel = item.updatedAt ? new Date(Number(item.updatedAt)).toLocaleString() : '';
      return `<div class="highlight-item" data-highlight-id="${escapeHtml(item.id)}">
        <details class="highlight-card" ${annotations.length || item.note ? 'open' : ''}>
          <summary class="highlight-summary"><span class="highlight-summary-main"><span class="meta-chip type">${escapeHtml(highlightColorLabel(item.color || 'yellow'))}</span><span class="highlight-summary-quote">${quotePreview}</span></span><span class="highlight-summary-meta muted">${updatedLabel}${annotations.length ? ` · ${annotations.length} 注释` : ''}</span></summary>
          <div class="highlight-card-body"><div class="highlight-quote">${escapeHtml(item.quote || item.text || '')}</div>
            ${item.note ? `<div class="highlight-note">${escapeHtml(item.note)}</div>` : ''}
            <div class="highlight-actions"><button type="button" class="ghost" data-hl-edit="${escapeHtml(item.id)}">编辑高亮</button><button type="button" class="ghost" data-hl-annotate="${escapeHtml(item.id)}">新增注释</button><button type="button" class="ghost danger" data-hl-delete="${escapeHtml(item.id)}">删除</button></div>
            <div class="annotation-list">${annotations.length ? annotations.map((annotation) => `<div class="annotation-item" data-annotation-id="${escapeHtml(annotation.id)}"><div>${escapeHtml(annotation.text || '')}</div><div class="muted">${annotation.updatedAt ? new Date(Number(annotation.updatedAt)).toLocaleString() : ''}</div><div class="annotation-actions"><button type="button" class="ghost" data-ann-edit="${escapeHtml(item.id)}:${escapeHtml(annotation.id)}">编辑</button><button type="button" class="ghost danger" data-ann-delete="${escapeHtml(item.id)}:${escapeHtml(annotation.id)}">删除</button></div></div>`).join('') : '<div class="muted">暂无注释。</div>'}</div>
          </div>
        </details>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-hl-edit]').forEach((el) => {
      el.addEventListener('click', async () => {
        const highlightId = el.dataset.hlEdit;
        const highlight = rows.find((item) => item.id === highlightId);
        if (!highlight) return;
        const quote = await uiPrompt('编辑高亮文本/引用', { title: '编辑高亮', inputLabel: '高亮文本', defaultValue: highlight.quote || highlight.text || '', required: true, requiredMessage: '请输入高亮文本' });
        if (quote === null) return;
        const note = await uiPrompt('编辑高亮备注（可选）', { title: '编辑高亮备注', inputLabel: '备注', defaultValue: highlight.note || '', placeholder: '可选', required: false });
        if (note === null) return;
        await api(`/api/bookmarks/${bid}/highlights/${highlightId}`, { method: 'PUT', body: JSON.stringify({ quote, text: quote, note }) });
        await refreshAll();
        showToast('高亮已更新', { timeoutMs: 2500 });
      });
    });
    listEl.querySelectorAll('[data-hl-delete]').forEach((el) => {
      el.addEventListener('click', async () => {
        const highlightId = el.dataset.hlDelete;
        if (!(await uiConfirm('确认删除这条高亮？', { title: '删除高亮', confirmText: '删除', danger: true }))) return;
        await api(`/api/bookmarks/${bid}/highlights/${highlightId}`, { method: 'DELETE' });
        await refreshAll();
        showToast('高亮已删除', { timeoutMs: 2500 });
      });
    });
    listEl.querySelectorAll('[data-hl-annotate]').forEach((el) => {
      el.addEventListener('click', async () => {
        const highlightId = el.dataset.hlAnnotate;
        const text = await uiPrompt('新增注释内容', { title: '新增注释', inputLabel: '注释内容', required: true, requiredMessage: '请输入注释内容' });
        if (text === null) return;
        if (!String(text).trim()) return showToast('请输入注释内容');
        await api(`/api/bookmarks/${bid}/highlights/${highlightId}/annotations`, { method: 'POST', body: JSON.stringify({ text }) });
        await refreshAll();
        showToast('注释已添加', { timeoutMs: 2500 });
      });
    });
    listEl.querySelectorAll('[data-ann-edit]').forEach((el) => {
      el.addEventListener('click', async () => {
        const [highlightId, annotationId] = String(el.dataset.annEdit || '').split(':');
        const highlight = rows.find((item) => item.id === highlightId);
        const annotation = (highlight?.annotations || []).find((item) => item.id === annotationId);
        if (!highlight || !annotation) return;
        const text = await uiPrompt('编辑注释', { title: '编辑注释', inputLabel: '注释内容', defaultValue: annotation.text || '', required: true, requiredMessage: '请输入注释内容' });
        if (text === null) return;
        await api(`/api/bookmarks/${bid}/highlights/${highlightId}/annotations/${annotationId}`, { method: 'PUT', body: JSON.stringify({ text }) });
        await refreshAll();
        showToast('注释已更新', { timeoutMs: 2500 });
      });
    });
    listEl.querySelectorAll('[data-ann-delete]').forEach((el) => {
      el.addEventListener('click', async () => {
        const [highlightId, annotationId] = String(el.dataset.annDelete || '').split(':');
        if (!highlightId || !annotationId) return;
        if (!(await uiConfirm('确认删除这条注释？', { title: '删除注释', confirmText: '删除', danger: true }))) return;
        await api(`/api/bookmarks/${bid}/highlights/${highlightId}/annotations/${annotationId}`, { method: 'DELETE' });
        await refreshAll();
        showToast('注释已删除', { timeoutMs: 2500 });
      });
    });
  }

  async function loadHighlightsForBookmark(targetId, { force = false } = {}) {
    const bid = String(targetId || state.activeId || '');
    if (!bid) {
      renderHighlightsList([], { bookmarkId: '' });
      return [];
    }
    if (!force && bookmarkId === bid) return [];
    const seq = ++loadSeq;
    const out = await api(`/api/bookmarks/${bid}/highlights`);
    if (seq !== loadSeq) return [];
    const highlights = Array.isArray(out?.highlights) ? out.highlights : [];
    bookmarkId = bid;
    renderHighlightsList(highlights, { bookmarkId: bid });
    return highlights;
  }

  function resetHighlights() {
    bookmarkId = null;
    loadSeq += 1;
  }

  return { getBookmarkId: () => bookmarkId, loadHighlightsForBookmark, renderHighlightsList, resetHighlights };
}
