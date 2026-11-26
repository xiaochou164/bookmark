export const AI_DRAWER_HISTORY_STORAGE_KEY = 'rainbow.aiDrawerHistory';
export const AI_DRAWER_HISTORY_LIMIT = 12;

export function readAiDrawerHistory(storage) {
  try {
    const raw = JSON.parse(storage.getItem(AI_DRAWER_HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(0, AI_DRAWER_HISTORY_LIMIT) : [];
  } catch (_err) {
    return [];
  }
}

export function writeAiDrawerHistory(storage, history) {
  try {
    const entries = Array.isArray(history) ? history : [];
    storage.setItem(AI_DRAWER_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, AI_DRAWER_HISTORY_LIMIT)));
  } catch (_err) {
    // History is a convenience; storage failures must not block the drawer.
  }
}
