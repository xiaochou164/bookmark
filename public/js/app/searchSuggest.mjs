export function createSearchSuggestController({
  byId,
  state,
  store,
  escapeHtml,
  iconSvg,
  tokenSuggestions,
  recentLimit,
  recentStorageKey,
  loadBookmarks,
  renderSidebar,
  clearAdvancedSavedSearch
}) {
  let closeTimer = null;
  let recentCommitTimer = null;
  const suggestState = {
    open: false,
    activeIndex: -1,
    items: [],
    recent: loadRecentQueries()
  };

  function loadRecentQueries() {
    try {
      const raw = JSON.parse(globalThis.localStorage?.getItem(recentStorageKey) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.map((item) => String(item || '').trim()).filter(Boolean).slice(0, recentLimit);
    } catch (_error) {
      return [];
    }
  }

  function persistRecentQueries() {
    try {
      globalThis.localStorage?.setItem(recentStorageKey, JSON.stringify(suggestState.recent.slice(0, recentLimit)));
    } catch (_error) {
      // Ignore unavailable storage (private mode or sandboxed iframe).
    }
  }

  function rememberRecentSearch(term, { immediate = false } = {}) {
    const value = String(term || '').trim();
    if (!value || value.length < 2) return;
    const commit = () => {
      const current = String(byId('searchInput')?.value || '').trim();
      if (!immediate && current !== value) return;
      suggestState.recent = [value, ...suggestState.recent.filter((item) => item !== value)].slice(0, recentLimit);
      persistRecentQueries();
      if (suggestState.open) renderSearchSuggestPopover();
    };
    if (immediate) {
      if (recentCommitTimer) clearTimeout(recentCommitTimer);
      recentCommitTimer = null;
      commit();
      return;
    }
    if (recentCommitTimer) clearTimeout(recentCommitTimer);
    recentCommitTimer = setTimeout(() => {
      recentCommitTimer = null;
      commit();
    }, 800);
  }

  function clearSearchSuggestCloseTimer() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  }

  function scheduleClose(delay = 150) {
    clearSearchSuggestCloseTimer();
    closeTimer = setTimeout(() => {
      closeTimer = null;
      setSearchSuggestOpen(false);
    }, Math.max(0, Number(delay) || 0));
  }

  function setSearchSuggestOpen(open) {
    suggestState.open = Boolean(open);
    if (!suggestState.open) suggestState.activeIndex = -1;
    const popover = byId('searchSuggestPopover');
    const input = byId('searchInput');
    if (popover) popover.classList.toggle('hidden', !suggestState.open);
    if (input) {
      input.setAttribute('aria-expanded', String(suggestState.open));
      if (!suggestState.open) input.removeAttribute('aria-activedescendant');
    }
    if (suggestState.open) renderSearchSuggestPopover();
  }

  function normalizedSearchQuery() {
    return String(byId('searchInput')?.value || state.filters.q || '').trim();
  }

  function buildSearchSuggestItems() {
    const query = normalizedSearchQuery();
    const lower = query.toLowerCase();
    const items = [];
    const matchedTokens = tokenSuggestions.filter((item) => {
      if (!lower) return true;
      return item.token.toLowerCase().includes(lower) || item.label.toLowerCase().includes(lower) || String(item.desc || '').toLowerCase().includes(lower);
    }).slice(0, 8);
    if (matchedTokens.length) {
      items.push({ kind: 'section', label: '建议的' });
      matchedTokens.forEach((item) => items.push({ kind: 'token', ...item }));
    }
    const recent = suggestState.recent.filter((item) => !lower || item.toLowerCase().includes(lower)).slice(0, 6);
    if (recent.length) {
      items.push({ kind: 'section', label: '最近使用的' });
      recent.forEach((value) => items.push({ kind: 'recent', value }));
    }
    items.push({ kind: 'help' });
    return items;
  }

  function selectableIndices() {
    return suggestState.items.reduce((out, item, index) => {
      if (item.kind === 'token' || item.kind === 'recent') out.push(index);
      return out;
    }, []);
  }

  function setSearchSuggestActiveIndex(nextIndex) {
    const selectable = new Set(selectableIndices());
    if (!selectable.size) {
      suggestState.activeIndex = -1;
      renderSearchSuggestPopover();
      return;
    }
    const index = Number(nextIndex);
    suggestState.activeIndex = Number.isFinite(index) && selectable.has(index) ? index : -1;
    renderSearchSuggestPopover();
  }

  function moveSearchSuggestActive(delta) {
    const selectable = selectableIndices();
    if (!selectable.length) return;
    if (!suggestState.open) setSearchSuggestOpen(true);
    const currentPos = selectable.indexOf(suggestState.activeIndex);
    const base = currentPos >= 0 ? currentPos : (delta > 0 ? -1 : 0);
    let nextPos = base + (delta > 0 ? 1 : -1);
    if (nextPos < 0) nextPos = selectable.length - 1;
    if (nextPos >= selectable.length) nextPos = 0;
    setSearchSuggestActiveIndex(selectable[nextPos]);
  }

  function searchSuggestItemHtml(item, index) {
    if (item.kind === 'section') return `<div class="search-suggest-section">${escapeHtml(item.label || '')}</div>`;
    if (item.kind === 'help') {
      return `<div class="search-suggest-help"><div class="search-suggest-help-icon">${iconSvg('help')}</div><div class="search-suggest-help-text"><div class="search-suggest-help-title">提示</div><div class="muted">输入 token（如 <code>tag:</code> / <code>type:</code>）可快速构造搜索，复杂组合推荐用右侧高级搜索。</div></div></div>`;
    }
    const active = suggestState.activeIndex === index ? ' active' : '';
    if (item.kind === 'token') {
      return `<button type="button" id="searchSuggestOption-${index}" class="search-suggest-item${active}" role="option" aria-selected="${active ? 'true' : 'false'}" data-search-suggest-index="${index}"><span class="search-suggest-item-icon" aria-hidden="true">${iconSvg(item.icon || 'search')}</span><span class="search-suggest-item-main"><span class="search-suggest-item-title">${escapeHtml(item.label || item.token || '')}</span><span class="search-suggest-item-desc muted">${escapeHtml(item.desc || '')}</span></span><span class="search-suggest-item-token">${escapeHtml(item.token || '')}</span></button>`;
    }
    return `<button type="button" id="searchSuggestOption-${index}" class="search-suggest-item${active}" role="option" aria-selected="${active ? 'true' : 'false'}" data-search-suggest-index="${index}"><span class="search-suggest-item-icon" aria-hidden="true">${iconSvg('search')}</span><span class="search-suggest-item-main"><span class="search-suggest-item-title">${escapeHtml(item.value || '')}</span><span class="search-suggest-item-desc muted">最近使用的搜索</span></span></button>`;
  }

  function renderSearchSuggestPopover() {
    const list = byId('searchSuggestList');
    const popover = byId('searchSuggestPopover');
    const input = byId('searchInput');
    if (!list || !popover || !input) return;
    if (!suggestState.open) {
      popover.classList.add('hidden');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      return;
    }
    suggestState.items = buildSearchSuggestItems();
    if (!selectableIndices().includes(suggestState.activeIndex)) suggestState.activeIndex = -1;
    list.innerHTML = suggestState.items.map(searchSuggestItemHtml).join('');
    popover.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
    if (suggestState.activeIndex >= 0) {
      input.setAttribute('aria-activedescendant', `searchSuggestOption-${suggestState.activeIndex}`);
      byId(`searchSuggestOption-${suggestState.activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  async function applySearchQueryValue(nextValue, { closeSuggest = true, remember = true } = {}) {
    const value = String(nextValue || '').trim();
    const input = byId('searchInput');
    if (input) input.value = value;
    store.setFilter('q', value);
    clearAdvancedSavedSearch();
    store.setFilter('page', 1);
    await loadBookmarks();
    renderSidebar();
    if (remember) rememberRecentSearch(value, { immediate: true });
    if (closeSuggest) setSearchSuggestOpen(false);
  }

  async function activateSearchSuggestItem(index) {
    const item = suggestState.items[Number(index)];
    if (!item) return false;
    if (item.kind === 'recent') {
      await applySearchQueryValue(item.value, { closeSuggest: true, remember: true });
      return true;
    }
    if (item.kind !== 'token') return false;
    const input = byId('searchInput');
    if (!input) return false;
    const current = String(input.value || '').trim();
    const separator = current && !/\s$/.test(current) ? ' ' : '';
    const next = `${current}${separator}${item.token}`.trimStart();
    input.value = next;
    store.setFilter('q', next.trim());
    clearAdvancedSavedSearch();
    store.setFilter('page', 1);
    await loadBookmarks();
    renderSidebar();
    setSearchSuggestOpen(true);
    input.focus();
    try { input.setSelectionRange(next.length, next.length); } catch (_error) { /* ignore */ }
    return true;
  }

  return {
    activateSearchSuggestItem,
    applySearchQueryValue,
    clearSearchSuggestCloseTimer,
    get state() { return suggestState; },
    moveSearchSuggestActive,
    rememberRecentSearch,
    renderSearchSuggestPopover,
    scheduleClose,
    setSearchSuggestActiveIndex,
    setSearchSuggestOpen
  };
}
