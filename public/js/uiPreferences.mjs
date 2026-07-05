const THEME_KEY = 'rainbow.ui.theme';
const DENSITY_KEY = 'rainbow.ui.density';
const THEMES = new Set(['light', 'dark', 'system']);
const DENSITIES = new Set(['comfortable', 'compact']);

function storedValue(key, fallback, allowed) {
  const value = localStorage.getItem(key) || fallback;
  return allowed.has(value) ? value : fallback;
}

export function getUiPreferences() {
  return {
    theme: storedValue(THEME_KEY, 'light', THEMES),
    density: storedValue(DENSITY_KEY, 'comfortable', DENSITIES)
  };
}

export function applyUiPreferences(preferences = getUiPreferences()) {
  const theme = THEMES.has(preferences.theme) ? preferences.theme : 'light';
  const density = DENSITIES.has(preferences.density) ? preferences.density : 'comfortable';
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.density = density;
  return { theme, density };
}

export function saveUiPreferences(preferences) {
  const next = applyUiPreferences(preferences);
  localStorage.setItem(THEME_KEY, next.theme);
  localStorage.setItem(DENSITY_KEY, next.density);
  return next;
}

export function initUiPreferenceControls({ onChange } = {}) {
  const themeEl = document.getElementById('uiThemeSelect');
  const densityEl = document.getElementById('uiDensitySelect');
  if (!themeEl || !densityEl) return;
  const current = applyUiPreferences();
  themeEl.value = current.theme;
  densityEl.value = current.density;
  const commit = () => {
    const next = saveUiPreferences({
      theme: themeEl.value,
      density: densityEl.value
    });
    onChange?.(next);
  };
  themeEl.addEventListener('change', commit);
  densityEl.addEventListener('change', commit);
}

applyUiPreferences();
