import { byId, escapeHtml, hostFromUrl } from '../utils.mjs';
import { api } from '../api.mjs';
import { readAiDrawerHistory, writeAiDrawerHistory } from './aiDrawerHistory.mjs';

function loadHistory() {
  try {
    return readAiDrawerHistory(window.localStorage);
  } catch (_err) {
    return [];
  }
}

function persistHistory(history) {
  try {
    writeAiDrawerHistory(window.localStorage, history);
  } catch (_err) {
    // Storage may be unavailable in restricted browser contexts.
  }
}

export let aiSideDrawerState = {
  open: false,
  loading: false,
  question: '',
  answer: '',
  sources: [],
  scope: 'auto',
  limit: 6,
  error: '',
  history: loadHistory()
};

let deps = {};
let returnFocus = null;

export function initializeAiDrawer(dependencies = {}) {
  deps = dependencies;
}

function contextBookmark() {
  return deps.getContextBookmark?.() || null;
}

function renderSuggestions(item = contextBookmark()) {
  const root = byId('aiDrawerSuggestions');
  if (!root) return;
  if (!item) {
    root.innerHTML = '<div class="muted">选择书签后显示建议。</div>';
    return;
  }
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 8) : [];
  const summary = String(item.aiSuggestions?.summary || item.note || item.excerpt || '').trim();
  root.innerHTML = `
    ${tags.length ? `<div class="ai-drawer-suggestion-tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : '<div class="muted">暂无标签建议。</div>'}
    ${summary ? `<div>${escapeHtml(summary.slice(0, 220))}${summary.length > 220 ? '…' : ''}</div>` : '<div class="muted">暂无摘要建议。</div>'}
  `;
}

function renderHistory() {
  const root = byId('aiDrawerHistory');
  if (!root) return;
  const history = Array.isArray(aiSideDrawerState.history) ? aiSideDrawerState.history : [];
  root.innerHTML = history.length
    ? history.map((item, idx) => `<button type="button" class="ghost" data-ai-drawer-history="${idx}">${escapeHtml(String(item.question || '').slice(0, 80))}</button>`).join('')
    : '<div class="muted">暂无历史提问。</div>';
  root.querySelectorAll('[data-ai-drawer-history]').forEach((el) => {
    el.addEventListener('click', () => {
      const item = history[Number(el.dataset.aiDrawerHistory || 0)] || null;
      if (!item) return;
      aiSideDrawerState = {
        ...aiSideDrawerState,
        question: String(item.question || ''),
        answer: String(item.answer || ''),
        sources: Array.isArray(item.sources) ? item.sources : [],
        scope: String(item.scope || 'auto'),
        limit: Math.max(1, Math.min(10, Number(item.limit || 6) || 6)),
        error: ''
      };
      renderAiSideDrawer();
    });
  });
}

export function renderAiSideDrawer() {
  const drawer = byId('aiSideDrawer');
  if (!drawer) return;
  const questionEl = byId('aiDrawerQuestion');
  const scopeEl = byId('aiDrawerScope');
  const limitEl = byId('aiDrawerLimit');
  const askBtn = byId('aiDrawerAskBtn');
  const answerEl = byId('aiDrawerAnswer');
  const sourcesEl = byId('aiDrawerSources');
  const contextMeta = byId('aiDrawerContextMeta');
  const item = contextBookmark();

  if (questionEl && questionEl.value !== String(aiSideDrawerState.question || '')) questionEl.value = String(aiSideDrawerState.question || '');
  if (scopeEl) scopeEl.value = ['auto', 'all', 'current_only'].includes(String(aiSideDrawerState.scope || 'auto')) ? String(aiSideDrawerState.scope || 'auto') : 'auto';
  if (limitEl) limitEl.value = String(Math.max(1, Math.min(10, Number(aiSideDrawerState.limit || 6) || 6)));
  if (askBtn) {
    askBtn.disabled = Boolean(aiSideDrawerState.loading);
    askBtn.textContent = aiSideDrawerState.loading ? '提问中…' : '提问';
    askBtn.setAttribute('aria-busy', String(Boolean(aiSideDrawerState.loading)));
  }
  if (contextMeta) contextMeta.textContent = item ? `当前书签：${item.title || item.id}` : '当前视图';
  renderSuggestions(item);

  if (answerEl) {
    const answer = String(aiSideDrawerState.answer || '');
    answerEl.textContent = aiSideDrawerState.loading
      ? 'AI 正在分析，请稍候…'
      : (aiSideDrawerState.error ? `失败：${aiSideDrawerState.error}` : (answer || '暂无回答。'));
    answerEl.classList.toggle('muted', !answer);
  }
  const sources = Array.isArray(aiSideDrawerState.sources) ? aiSideDrawerState.sources : [];
  if (sourcesEl) {
    sourcesEl.innerHTML = sources.length
      ? sources.slice(0, 6).map((src, idx) => `<button type="button" class="ai-qa-source-item" data-ai-drawer-source="${escapeHtml(String(src.id || ''))}">
          <div class="ai-qa-source-row"><span class="ai-qa-source-index">${idx + 1}</span><span class="ai-qa-source-title">${escapeHtml(String(src.title || src.id || '出处'))}</span></div>
          <div class="ai-qa-source-meta muted">${escapeHtml([src.folderPath, src.host || hostFromUrl(src.url || '')].filter(Boolean).join(' · '))}</div>
        </button>`).join('')
      : '<div class="muted">暂无出处。</div>';
    sourcesEl.querySelectorAll('[data-ai-drawer-source]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = String(el.dataset.aiDrawerSource || '');
        if (!id) return;
        deps.store?.setActiveId(id);
        deps.renderCards?.();
        deps.renderDetail?.();
        renderAiSideDrawer();
      });
    });
  }
  renderHistory();
}

async function runAiSideDrawerAsk() {
  const question = String(byId('aiDrawerQuestion')?.value || aiSideDrawerState.question || '').trim();
  if (!question) {
    deps.showToast?.('请输入问题', { timeoutMs: 2500 });
    byId('aiDrawerQuestion')?.focus?.();
    return;
  }
  const scope = String(byId('aiDrawerScope')?.value || 'auto');
  const limit = Math.max(1, Math.min(10, Number(byId('aiDrawerLimit')?.value || 6) || 6));
  const item = contextBookmark();
  if (scope === 'current_only' && !item) {
    deps.showToast?.('仅当前书签需要先选择一条书签', { timeoutMs: 3000 });
    return;
  }
  aiSideDrawerState = { ...aiSideDrawerState, loading: true, question, scope, limit, error: '', answer: '', sources: [] };
  renderAiSideDrawer();
  try {
    const body = { question, scope, limit };
    if (item && scope !== 'all') body.bookmarkId = item.id;
    const out = await api('/api/product/ai/qa', { method: 'POST', body: JSON.stringify(body) });
    const answer = String(out?.answer || '');
    const sources = Array.isArray(out?.sources) ? out.sources : [];
    const nextHistory = [{ question, answer, sources, scope, limit, createdAt: Date.now() }, ...aiSideDrawerState.history].slice(0, 12);
    aiSideDrawerState = { ...aiSideDrawerState, loading: false, answer, sources, error: '', history: nextHistory };
    persistHistory(nextHistory);
    renderAiSideDrawer();
    deps.showToast?.(sources.length ? `AI 已回答（${sources.length} 条出处）` : 'AI 已回答', { timeoutMs: 3200 });
  } catch (err) {
    aiSideDrawerState = { ...aiSideDrawerState, loading: false, error: String(err.message || err) };
    renderAiSideDrawer();
    deps.showToast?.(err.message || 'AI 提问失败', { timeoutMs: 4200 });
  }
}

export function setAiSideDrawerOpen(open) {
  if (open && !aiSideDrawerState.open) returnFocus = document.activeElement;
  aiSideDrawerState.open = Boolean(open);
  const drawer = byId('aiSideDrawer');
  const backdrop = byId('aiSideDrawerBackdrop');
  drawer?.classList.toggle('hidden', !aiSideDrawerState.open);
  drawer?.setAttribute('aria-hidden', String(!aiSideDrawerState.open));
  backdrop?.classList.toggle('hidden', !aiSideDrawerState.open);
  document.body.classList.toggle('ai-side-drawer-open', aiSideDrawerState.open);
  renderAiSideDrawer();
  deps.syncOverlayAccessibility?.();
  if (!open) {
    returnFocus?.focus?.();
    returnFocus = null;
  }
}

export function bindAiDrawerEvents() {
  byId('askAiBtn')?.addEventListener('click', () => {
    setAiSideDrawerOpen(true);
    queueMicrotask(() => byId('aiDrawerQuestion')?.focus?.());
  });
  byId('aiSideDrawerBackdrop')?.addEventListener('click', () => setAiSideDrawerOpen(false));
  byId('aiDrawerCloseBtn')?.addEventListener('click', () => setAiSideDrawerOpen(false));
  byId('aiDrawerAskBtn')?.addEventListener('click', runAiSideDrawerAsk);
  byId('aiDrawerOpenDialogBtn')?.addEventListener('click', () => {
    deps.openAiQaDialog?.({
      bookmarkId: deps.getActiveBookmarkId?.() || null,
      question: String(byId('aiDrawerQuestion')?.value || aiSideDrawerState.question || ''),
      scope: String(byId('aiDrawerScope')?.value || aiSideDrawerState.scope || 'auto')
    });
  });
  byId('aiDrawerQuestion')?.addEventListener('input', (event) => { aiSideDrawerState.question = String(event.target?.value || ''); });
  byId('aiDrawerScope')?.addEventListener('change', (event) => {
    aiSideDrawerState.scope = String(event.target?.value || 'auto');
    renderAiSideDrawer();
  });
  byId('aiDrawerLimit')?.addEventListener('change', (event) => {
    aiSideDrawerState.limit = Math.max(1, Math.min(10, Number(event.target?.value || 6) || 6));
    renderAiSideDrawer();
  });
  document.querySelectorAll('[data-ai-drawer-action]').forEach((el) => {
    el.addEventListener('click', async () => {
      const action = String(el.dataset.aiDrawerAction || '');
      if (action === 'autotag') await deps.runAiAutoTagForActiveBookmark?.();
      if (action === 'summary') await deps.runAiSummaryForActiveBookmark?.();
      if (action === 'folder-summary') deps.openAiFolderSummaryDialog?.();
      renderAiSideDrawer();
    });
  });
}
