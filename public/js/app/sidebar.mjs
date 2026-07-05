export const SIDEBAR_TAGS_UI_STORAGE_KEY = 'rainbow.sidebarTagsUi';

export function loadSidebarTagsUi() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SIDEBAR_TAGS_UI_STORAGE_KEY) || '{}');
    return {
      expanded: Boolean(raw.expanded),
      sort: raw && raw.sort === 'name' ? 'name' : 'count'
    };
  } catch (_err) {
    return { expanded: false, sort: 'count' };
  }
}

export function persistSidebarTagsUi(sidebarTagsUi) {
  try {
    window.localStorage.setItem(SIDEBAR_TAGS_UI_STORAGE_KEY, JSON.stringify(sidebarTagsUi));
  } catch (_err) {
    // ignore
  }
}
