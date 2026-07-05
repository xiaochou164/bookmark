export const DETAIL_SECTIONS_UI_STORAGE_KEY = 'rainbow.detailSectionsUi';

export function loadDetailSectionsUi() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DETAIL_SECTIONS_UI_STORAGE_KEY) || '{}');
    const value = (key, fallback) => Object.prototype.hasOwnProperty.call(raw, key) ? Boolean(raw[key]) : fallback;
    return {
      basic: value('basic', false),
      status: value('status', false),
      fetch: value('fetch', true),
      highlights: value('highlights', true),
      related: value('related', true)
    };
  } catch (_err) {
    return {
      basic: false,
      status: false,
      fetch: true,
      highlights: true,
      related: true
    };
  }
}

export function persistDetailSectionsUi(detailSectionsUi) {
  try {
    window.localStorage.setItem(DETAIL_SECTIONS_UI_STORAGE_KEY, JSON.stringify(detailSectionsUi));
  } catch (_err) {
    // ignore
  }
}
