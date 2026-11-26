export function createAiQaController({
  api,
  byId,
  state,
  escapeHtml,
  hostFromUrl,
  detailAiOperationBusy,
  setDetailAiQaRunning,
  updateDetailPanelHeadUi,
  renderRelatedBookmarksUi,
  store,
  renderCards,
  renderDetail,
  showToast
}) {
  const qaState = {
    loading: false,
    bookmarkId: '',
    question: '',
    scope: 'auto',
    limit: 6,
    answer: '',
    sources: [],
    insufficient: false,
    confidence: 0,
    error: ''
  };
  let requestSequence = 0;

  function getContextBookmark() {
    const scope = String(qaState.scope || 'auto');
    if (scope === 'all') return null;
    const preferredId = String(qaState.bookmarkId || state.activeId || '').trim();
    if (!preferredId) return null;
    return state.bookmarks.find((x) => String(x.id) === preferredId)
      || state.allBookmarks.find((x) => String(x.id) === preferredId)
      || null;
  }

  function drawerContextBookmark() {
    const preferredId = String(state.activeId || qaState.bookmarkId || '').trim();
    if (!preferredId) return null;
    return state.bookmarks.find((x) => String(x.id) === preferredId)
      || state.allBookmarks.find((x) => String(x.id) === preferredId)
      || null;
  }

  function renderUi() {
    const dialog = byId('aiQaDialog');
    if (!dialog) return;
    const questionEl = byId('aiQaQuestion');
    const scopeEl = byId('aiQaScope');
    const limitEl = byId('aiQaLimit');
    const askBtn = byId('aiQaAskBtn');
    const copyBtn = byId('aiQaCopyAnswerBtn');
    const clearBtn = byId('aiQaClearBtn');
    const metaEl = byId('aiQaMeta');
    const answerEl = byId('aiQaAnswer');
    const sourcesEl = byId('aiQaSources');
    if (!questionEl || !scopeEl || !limitEl || !askBtn || !copyBtn || !clearBtn || !metaEl || !answerEl || !sourcesEl) return;

    if (questionEl.value !== String(qaState.question || '')) questionEl.value = String(qaState.question || '');
    scopeEl.value = ['auto', 'all', 'current_only'].includes(String(qaState.scope || 'auto')) ? String(qaState.scope || 'auto') : 'auto';
    limitEl.value = String(Math.max(1, Math.min(10, Number(qaState.limit) || 6)));

    const ctx = getContextBookmark();
    const scope = String(qaState.scope || 'auto');
    const loading = Boolean(qaState.loading);
    const canAsk = !loading && !detailAiOperationBusy() && String(questionEl.value || '').trim().length > 0;
    askBtn.disabled = !canAsk;
    askBtn.setAttribute('aria-busy', String(loading));
    askBtn.textContent = loading ? '问答中…' : '开始问答';
    copyBtn.disabled = !String(qaState.answer || '').trim();
    clearBtn.disabled = loading && !String(qaState.answer || '').trim();

    const metaBits = [];
    if (scope === 'all') metaBits.push('范围：全部书签');
    else if (scope === 'current_only') metaBits.push(ctx ? `范围：仅当前书签（${ctx.title || ctx.id}）` : '范围：仅当前书签（未选中）');
    else metaBits.push(ctx ? `范围：当前书签优先（${ctx.title || ctx.id}）` : '范围：全部书签（当前未选中书签）');
    if (Number(qaState.confidence || 0) > 0) metaBits.push(`置信度 ${(Number(qaState.confidence) * 100).toFixed(0)}%`);
    if (qaState.insufficient) metaBits.push('信息可能不足');
    if (loading) metaBits.unshift('AI 正在分析书签内容...');
    else if (qaState.error) metaBits.unshift(`失败：${qaState.error}`);
    metaEl.textContent = metaBits.filter(Boolean).join(' · ') || '输入问题后点击“开始问答”。';

    if (qaState.answer) {
      answerEl.textContent = String(qaState.answer || '');
      answerEl.classList.remove('muted');
    } else if (loading) {
      answerEl.textContent = '正在生成回答，请稍候…';
      answerEl.classList.add('muted');
    } else if (qaState.error) {
      answerEl.textContent = `问答失败：${qaState.error}`;
      answerEl.classList.add('muted');
    } else {
      answerEl.textContent = '暂无回答。';
      answerEl.classList.add('muted');
    }

    const sources = Array.isArray(qaState.sources) ? qaState.sources : [];
    if (!sources.length) {
      sourcesEl.innerHTML = `<div class="muted">${loading ? '等待 AI 返回出处…' : '暂无出处。'}</div>`;
      return;
    }
    sourcesEl.innerHTML = sources.map((src, idx) => {
      const id = String(src?.id || '');
      const title = String(src?.title || '(untitled)');
      const host = String(src?.host || hostFromUrl(src?.url || '') || '');
      const folderPath = String(src?.folderPath || '');
      const score = Math.max(0, Math.min(1, Number(src?.score) || 0));
      const reason = String(src?.reason || '');
      const excerpt = String(src?.excerpt || '').trim();
      const meta = [folderPath, host].filter(Boolean).join(' · ');
      return `<button type="button" class="ai-qa-source-item" data-ai-qa-source-open="${escapeHtml(id)}">
        <div class="ai-qa-source-row"><span class="ai-qa-source-index">${idx + 1}</span><span class="ai-qa-source-title">${escapeHtml(title)}</span>${score > 0 ? `<span class="meta-chip info">${Math.round(score * 100)}%</span>` : ''}</div>
        ${meta ? `<div class="ai-qa-source-meta muted">${escapeHtml(meta)}</div>` : ''}
        ${reason ? `<div class="ai-qa-source-reason">${escapeHtml(reason)}</div>` : ''}
        ${excerpt ? `<div class="ai-qa-source-excerpt">${escapeHtml(excerpt)}</div>` : ''}
      </button>`;
    }).join('');
    sourcesEl.querySelectorAll('[data-ai-qa-source-open]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = String(el.dataset.aiQaSourceOpen || '').trim();
        if (!id) return;
        store.setActiveId(id);
        qaState.bookmarkId = id;
        renderCards();
        renderDetail();
        renderUi();
      });
    });
  }

  function open({ bookmarkId = null, question = '', scope = null } = {}) {
    const dialog = byId('aiQaDialog');
    if (!dialog) return;
    const prevBookmarkId = String(qaState.bookmarkId || '');
    const prevScope = String(qaState.scope || 'auto');
    const incomingBookmarkId = String(bookmarkId || state.activeId || '').trim();
    if (incomingBookmarkId) qaState.bookmarkId = incomingBookmarkId;
    if (typeof question === 'string' && question) qaState.question = question;
    if (scope) qaState.scope = String(scope);
    if (!String(qaState.scope || '').trim()) qaState.scope = 'auto';
    const currentBookmarkId = String(qaState.bookmarkId || '');
    const currentScope = String(qaState.scope || 'auto');
    if (currentBookmarkId !== prevBookmarkId || currentScope !== prevScope) {
      requestSequence += 1;
      Object.assign(qaState, { answer: '', sources: [], insufficient: false, confidence: 0, error: '' });
    }
    renderUi();
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => byId('aiQaQuestion')?.focus?.());
  }

  function close() {
    const dialog = byId('aiQaDialog');
    if (dialog?.open) dialog.close();
  }

  function clearResult({ preserveQuestion = true } = {}) {
    requestSequence += 1;
    Object.assign(qaState, {
      loading: false,
      question: preserveQuestion ? String(qaState.question || '') : '',
      answer: '',
      sources: [],
      insufficient: false,
      confidence: 0,
      error: ''
    });
    renderUi();
  }

  async function run() {
    if (detailAiOperationBusy()) return;
    const question = String(byId('aiQaQuestion')?.value || '').trim();
    if (!question) {
      showToast('请输入问题', { timeoutMs: 2500 });
      byId('aiQaQuestion')?.focus?.();
      return;
    }
    const scope = String(byId('aiQaScope')?.value || 'auto');
    const limit = Math.max(1, Math.min(10, Number(byId('aiQaLimit')?.value || 6) || 6));
    const currentCtxId = String(qaState.bookmarkId || state.activeId || '').trim();
    if (scope === 'current_only' && !currentCtxId) {
      showToast('“仅当前书签”需要先选中一条书签', { timeoutMs: 3000 });
      return;
    }
    if (qaState.loading) return;
    const sequence = ++requestSequence;
    Object.assign(qaState, {
      loading: true,
      question,
      scope,
      limit,
      error: '',
      answer: '',
      sources: [],
      insufficient: false,
      confidence: 0,
      bookmarkId: currentCtxId || qaState.bookmarkId || ''
    });
    setDetailAiQaRunning(true);
    renderUi();
    updateDetailPanelHeadUi(state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null);
    try {
      const body = { question, scope, limit };
      if (scope === 'current_only' && currentCtxId) {
        body.bookmarkId = currentCtxId;
        body.bookmarkIds = [currentCtxId];
      } else if (scope === 'auto' && currentCtxId) body.bookmarkId = currentCtxId;
      const out = await api('/api/product/ai/qa', { method: 'POST', body: JSON.stringify(body) });
      if (sequence !== requestSequence) return;
      Object.assign(qaState, {
        loading: false,
        answer: String(out?.answer || ''),
        sources: Array.isArray(out?.sources) ? out.sources : [],
        insufficient: Boolean(out?.insufficient),
        confidence: Math.max(0, Math.min(1, Number(out?.confidence) || 0)),
        error: ''
      });
      renderUi();
      const sourcesCount = Array.isArray(out?.sources) ? out.sources.length : 0;
      showToast(sourcesCount ? `AI 已生成回答（引用 ${sourcesCount} 条出处）` : 'AI 已生成回答', { timeoutMs: 3400 });
    } catch (err) {
      if (sequence !== requestSequence) return;
      Object.assign(qaState, { loading: false, error: String(err.message || err), answer: '', sources: [], insufficient: false, confidence: 0 });
      renderUi();
      showToast(err.message || 'AI 书签问答失败', { timeoutMs: 4200 });
    } finally {
      setDetailAiQaRunning(false);
      if (sequence === requestSequence) {
        const latest = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId) || null;
        updateDetailPanelHeadUi(latest);
        renderRelatedBookmarksUi(latest);
      }
    }
  }

  return {
    get state() { return qaState; },
    getContextBookmark,
    drawerContextBookmark,
    renderUi,
    open,
    close,
    clearResult,
    run
  };
}
