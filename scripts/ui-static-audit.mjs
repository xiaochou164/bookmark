import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const notes = [];

function hexToRgb(hex) {
  const value = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`invalid hex color: ${hex}`);
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

const requiredCssImports = [
  './css/tokens.css',
  './css/legacy.css',
  './css/legacy-workbench-overrides.css',
  './css/legacy-safety.css',
  './css/base.css',
  './css/layout.css',
  './css/workbench.css',
  './css/components.css',
  './css/dialogs.css',
  './css/states.css',
  './css/settings.css',
  './css/public.css',
  './css/responsive.css',
  './css/utilities.css'
];
const entryCss = read('public/styles.css');
for (const cssImport of requiredCssImports) {
  if (!entryCss.includes(cssImport)) failures.push(`styles.css is missing ${cssImport}`);
}
if (!entryCss.includes('@layer tokens, legacy, base, layout, workbench, components, dialogs, states, settings, public, responsive, utilities;')) {
  failures.push('styles.css layer order is not the canonical UI/UX order');
}

const legacyAppEntry = read('public/app.js');
const legacyAppEntryLines = legacyAppEntry.trim().split(/\r?\n/).length;
if (legacyAppEntryLines > 8 || !legacyAppEntry.includes('moved to /app.mjs')) {
  failures.push('public/app.js must stay a tiny legacy shim; put application code in public/app.mjs');
}

const indexHtml = read('public/index.html');
const appSource = read('public/app.mjs');
const sidebarModuleSource = read('public/js/app/sidebar.mjs');
const layoutCss = read('public/css/layout.css');
const responsiveCssSource = read('public/css/responsive.css');
if (!indexHtml.includes('id="sidebarTopNewBtn"') || !indexHtml.includes('id="sidebarResizeHandle"') || !indexHtml.includes('id="detailResizeHandle"')) {
  failures.push('RA-DOM split view controls must include sidebar top new button and sidebar/detail resize handles');
}
if (!appSource.includes('rainbow.sidebarWidth') || !appSource.includes('rainbow.detailWidth') || !appSource.includes('bindSplitResizeHandle')) {
  failures.push('RA-DOM split view widths must be persisted and bound through resize handles');
}
if (!sidebarModuleSource.includes('rainbow.sidebarTagsUi') || !appSource.includes('rainbow.collapsedFolders')) {
  failures.push('RA-FE-001 sidebar collections/tags must persist collapsed folders and tag preferences');
}
if (!appSource.includes('sidebarSyncHealthState') || !appSource.includes('loadSidebarSyncHealth') || !appSource.includes('/api/plugins/raindropSync/health')) {
  failures.push('RA-FE-001 sidebar must surface cloud sync health from the raindropSync plugin');
}
for (const id of ['searchModeBadge', 'askAiModeBadge', 'bulkModeHint', 'toolbarShortcutHints']) {
  if (!indexHtml.includes(`id="${id}"`)) failures.push(`RA-FE-002 toolbar semantic hint DOM missing #${id}`);
}
if (!appSource.includes('renderToolbarSemanticHints') || !appSource.includes('高级搜索、语义搜索与 AI 重排已启用')) {
  failures.push('RA-FE-002 toolbar badges and sticky shortcut hints must be rendered from app state');
}
const componentsCss = read('public/css/components.css');
if (!componentsCss.includes('.toolbar-mode-badge') || !componentsCss.includes('.bulk-mode-hint') || !componentsCss.includes('.toolbar-shortcut-hints')) {
  failures.push('RA-FE-002 toolbar semantic hints must have bounded component styles');
}
if (!appSource.includes('renderSidebarVirtualList') || !appSource.includes('scheduleSidebarAuxiliaryVirtualRender') || !appSource.includes('SIDEBAR_AUX_VIRTUAL_THRESHOLD')) {
  failures.push('RA-FE-003 auxiliary sidebar lists must use shared virtual scrolling helpers');
}
for (const marker of ['quickNav', 'quickFiltersList', 'tagsList']) {
  if (!appSource.includes(marker)) failures.push(`RA-FE-003 virtualized sidebar list missing ${marker}`);
}
if (!componentsCss.includes('.sidebar-aux-virtual-spacer') || !componentsCss.includes('.tags.is-virtualized')) {
  failures.push('RA-FE-003 auxiliary sidebar virtualization must have stable spacer styles');
}
for (const id of ['realtimeNotificationsBtn', 'realtimeNotificationsBadge', 'realtimeNotificationsMenu']) {
  if (!indexHtml.includes(`id="${id}"`)) failures.push(`RA-FE-005 realtime notification center missing #${id}`);
}
if (!appSource.includes('new EventSource') || !appSource.includes('/api/events') || !appSource.includes('startRealtimePolling') || !appSource.includes('handleRealtimeSnapshot')) {
  failures.push('RA-FE-005 workbench must subscribe to realtime SSE with polling fallback');
}
const systemRoutesSource = read('src/routes/systemRoutes.js');
const workerSource = read('src/worker.mjs');
const aiProviderSource = read('src/services/aiProviderService.js');
if (!systemRoutesSource.includes('/api/events') || !systemRoutesSource.includes('text/event-stream') || !systemRoutesSource.includes('buildRealtimeSnapshot')) {
  failures.push('RA-FE-005 Node API must expose realtime SSE snapshots');
}
if (!workerSource.includes('/api/events') || !workerSource.includes('text/event-stream') || !workerSource.includes('buildRealtimeSnapshot')) {
  failures.push('RA-FE-005 Worker API must expose realtime event-stream snapshots');
}
if (!componentsCss.includes('.realtime-notifications-menu') || !componentsCss.includes('.realtime-notification-item')) {
  failures.push('RA-FE-005 realtime notification center must have bounded styles');
}
for (const id of ['aiSideDrawer', 'aiDrawerQuestion', 'aiDrawerHistory', 'aiDrawerSuggestions']) {
  if (!indexHtml.includes(`id="${id}"`)) failures.push(`RA-FE-006 AI side drawer missing #${id}`);
}
if (!appSource.includes('rainbow.aiDrawerHistory') || !appSource.includes('runAiSideDrawerAsk') || !appSource.includes('setAiSideDrawerOpen') || !appSource.includes('data-ai-drawer-action')) {
  failures.push('RA-FE-006 workbench must provide AI side drawer history, ask flow, suggestions, and shortcuts');
}
if (!componentsCss.includes('.ai-side-drawer') || !componentsCss.includes('.ai-drawer-history') || !componentsCss.includes('.ai-drawer-shortcuts')) {
  failures.push('RA-FE-006 AI side drawer must have bounded drawer styles');
}
if (!indexHtml.includes('id="exportDialog"') || !indexHtml.includes('id="ioTaskList"') || !indexHtml.includes('id="ioTaskOutput"')) {
  failures.push('RA-FE-007 import/export task panel DOM must be available in the main workbench');
}
if (!appSource.includes('openIoTaskPanel') || !appSource.includes('data-io-download') || !appSource.includes('data-io-report') || !appSource.includes('data-io-retry')) {
  failures.push('RA-FE-007 import/export tasks must use unified panel with download, log, retry, and error details');
}
if (!aiProviderSource.includes('providerRouting') || !aiProviderSource.includes('preferCloudflareFree') || !aiProviderSource.includes('fallbackChain') || !aiProviderSource.includes('providerFailures')) {
  failures.push('AI-403 provider routing must support Cloudflare preference and fallback failure chains');
}
const productRoutesSource = read('src/routes/productRoutes.js');
const collabRoutesSource = read('src/routes/collabRoutes.js');
if (!productRoutesSource.includes('aiCallsPerDay') || !productRoutesSource.includes('aiBatchItemsPerTask') || !productRoutesSource.includes('AI_QUOTA_EXCEEDED') || !productRoutesSource.includes('AI_BATCH_LIMIT_EXCEEDED')) {
  failures.push('AI-404 AI quota guardrails must enforce daily calls and batch-size limits');
}
if (!productRoutesSource.includes('DEFAULT_AI_PROMPT_TEMPLATES') || !productRoutesSource.includes('/api/product/ai/prompts') || !productRoutesSource.includes('version = Number(item.version || 0) + 1')) {
  failures.push('AI-405 prompt templates must be configurable and versioned through product routes');
}
const settingsSource = read('public/settings.mjs');
if (!settingsSource.includes('renderAiAuditPanel') || !settingsSource.includes('模型分布') || !settingsSource.includes('平均耗时') || !settingsSource.includes('/api/product/ai/jobs')) {
  failures.push('AI-406 settings must render AI job audit status, duration, failure, and model distribution');
}
if (!collabRoutesSource.includes('aiGuide') || !collabRoutesSource.includes('renderAiGuide') || !read('public/css/public.css').includes('.public-ai-guide')) {
  failures.push('AI-501 public collection page must expose AI guide summary, tags, FAQ, and recommendations');
}
if (!read('public/public-share.mjs').includes('renderAiGuide') || !collabRoutesSource.includes('src="/public-share.mjs"') || !workerSource.includes('src="/public-share.mjs"')) {
  failures.push('public collection pages must use the external public-share.mjs module for CSP-safe behavior');
}
if (/<script>\s*\(async function|<script>\s*\(function/.test(collabRoutesSource) || /<script>\s*\(async function|<script>\s*\(function/.test(workerSource)) {
  failures.push('public collection pages must not reintroduce executable inline scripts');
}
for (const marker of ['/api/collab/ai/change-summary', '/api/collab/ai/tag-guidance/:folderId', '/api/collab/ai/comment-assist']) {
  if (!collabRoutesSource.includes(marker)) failures.push(`AI collaboration route missing ${marker}`);
}
if (!productRoutesSource.includes('DEFAULT_AI_EVAL_SAMPLES') || !productRoutesSource.includes('/api/product/ai/evals/run') || !settingsSource.includes('aiEvalRunBtn')) {
  failures.push('AI-601 prompt/eval baseline must expose samples, eval run API, and settings action');
}
if (!workerSource.includes('DEFAULT_AI_EVAL_SAMPLES') || !workerSource.includes('/api/product/ai/evals/run')) {
  failures.push('AI-601 Worker path must expose prompt/eval baseline APIs');
}
if (!productRoutesSource.includes('aiFeedbackItems') || !productRoutesSource.includes('/api/product/ai/feedback') || !settingsSource.includes('aiFeedbackSendBtn')) {
  failures.push('AI-602 AI output quality feedback must persist accepted/rejected/edited/rated feedback');
}
if (!workerSource.includes('ai_feedback_items') || !workerSource.includes('/api/product/ai/feedback')) {
  failures.push('AI-602 Worker path must persist AI output quality feedback');
}
if (!aiProviderSource.includes('sanitizeAiModelInput') || !productRoutesSource.includes('aiPrivacyPolicies') || !settingsSource.includes('aiPrivacyAnonymizeSelect')) {
  failures.push('AI-603 AI privacy policy must sanitize model input and expose anonymization policy controls');
}
if (!workerSource.includes('sanitizeAiModelInput') || !workerSource.includes('/api/product/ai/privacy-policy')) {
  failures.push('AI-603 Worker path must expose AI privacy policy and sanitization');
}
if (!productRoutesSource.includes('aiProviderHealthChecks') || !productRoutesSource.includes('/api/product/ai/health/probe') || !settingsSource.includes('aiHealthProbeBtn')) {
  failures.push('AI-604 provider health checks must record probes and expose a settings health panel');
}
if (!workerSource.includes('ai_provider_health_checks') || !workerSource.includes('/api/product/ai/health/probe')) {
  failures.push('AI-604 Worker path must record provider health checks');
}
if (!productRoutesSource.includes('aiFeaturePolicies') || !productRoutesSource.includes('AI_FEATURE_DISABLED') || !settingsSource.includes('aiFeatureEnabledSelect')) {
  failures.push('AI-605 AI feature switches and permissions must gate write APIs and expose settings controls');
}
if (!workerSource.includes('ai_feature_policy') || !workerSource.includes('AI_FEATURE_DISABLED')) {
  failures.push('AI-605 Worker path must gate AI write APIs through feature policy');
}
if (!layoutCss.includes('grid-template-columns: var(--sidebar-width) minmax(560px, 1fr)') || !layoutCss.includes('minmax(360px, var(--detail-width))')) {
  failures.push('RA-DOM desktop split view must use persisted sidebar/detail width variables');
}
if (!responsiveCssSource.includes('body.detail-drawer-open') || !responsiveCssSource.includes('.shell.detail-panel-open .detail-panel-backdrop:not(.hidden)')) {
  failures.push('RA-DOM mobile detail drawer must lock body scroll and show a backdrop');
}

const htmlFiles = [
  'public/index.html',
  'public/login.html',
  'public/settings.html',
  'public/plugin.html',
  'chrome-extension/popup.html',
  'chrome-extension/options.html',
  'safari-extension/popup.html',
  'safari-extension/options.html'
];
for (const file of htmlFiles) {
  const html = read(file);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) failures.push(`${file} has duplicate ids: ${[...new Set(duplicates)].join(', ')}`);
  if ((file.startsWith('chrome-extension/') || file.startsWith('safari-extension/')) && /<style\b|style\s*=/.test(html)) {
    failures.push(`${file} must use shared extension CSS instead of inline styles`);
  }
}

const extensionFiles = [
  'chrome-extension/background.js',
  'chrome-extension/options.js',
  'chrome-extension/popup.js',
  'chrome-extension/options.html',
  'chrome-extension/popup.html',
  'safari-extension/background.js',
  'safari-extension/options.js',
  'safari-extension/popup.js',
  'safari-extension/options.html',
  'safari-extension/popup.html'
];
for (const file of extensionFiles) {
  const source = read(file);
  if (/api\.raindrop\.io/i.test(source)) {
    failures.push(`${file} must not call api.raindrop.io directly; use Rainbow cloud plugin APIs`);
  }
}

const requiredLiveRegions = [
  ['public/index.html', 'toast'],
  ['public/index.html', 'detailMetaTaskInfo'],
  ['public/index.html', 'ioTaskList'],
  ['public/index.html', 'ioTaskOutput'],
  ['public/login.html', 'loginStatus'],
  ['public/settings.html', 'settingsStatus'],
  ['public/settings.html', 'dedupeResults'],
  ['public/settings.html', 'dedupeOutput'],
  ['public/settings.html', 'aiOutput'],
  ['public/plugin.html', 'pluginPageStatus'],
  ['public/plugin.html', 'pluginDevices'],
  ['public/plugin.html', 'pluginHealth']
];
for (const [file, id] of requiredLiveRegions) {
  const html = read(file);
  const elementMatch = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`, 'm'));
  if (!elementMatch) {
    failures.push(`${file} is missing live region #${id}`);
    continue;
  }
  const element = elementMatch[0];
  if (!/\baria-live=/.test(element) && !/\brole="(?:status|alert)"/.test(element)) {
    failures.push(`${file} #${id} must declare aria-live or role=status/alert`);
  }
}

const legacyCss = read('public/css/legacy.css');
const selectorCounts = new Map();
for (const line of legacyCss.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('/*') || !trimmed.endsWith('{')) continue;
  const selector = trimmed.slice(0, -1).trim().replace(/\s+/g, ' ');
  selectorCounts.set(selector, (selectorCounts.get(selector) || 0) + 1);
}
const repeatedSelectors = [...selectorCounts.entries()].filter(([, count]) => count > 1);
notes.push(`legacy repeated selectors: ${repeatedSelectors.length}`);
if (repeatedSelectors.length > 40) failures.push(`legacy duplicate selector count exceeded the migration baseline (40): ${repeatedSelectors.length}`);

const allowedBreakpoints = new Set(['640', '920', '1180', '1280', '1281']);
const breakpointMatches = [...legacyCss.matchAll(/@media\s*\(\s*(?:min|max)-width\s*:\s*(\d+)px\s*\)/g)];
const offMatrixBreakpoints = [...new Set(breakpointMatches.map((match) => match[1]).filter((value) => !allowedBreakpoints.has(value)))];
notes.push(`off-matrix legacy breakpoints: ${offMatrixBreakpoints.join(', ') || 'none'}`);
if (offMatrixBreakpoints.length) failures.push(`off-matrix breakpoints are not allowed: ${offMatrixBreakpoints.join(', ')}`);

const allCss = ['public/styles.css', ...requiredCssImports.map((item) => `public/${item.replace('./', '')}`)]
  .map(read)
  .join('\n');
if (/html\s*\{[^}]*overflow-x\s*:\s*hidden/s.test(allCss)) {
  failures.push('CSS must not hide page-level horizontal overflow');
}

const tokenCss = read('public/css/tokens.css');
for (const token of ['--control-h-xs: 28px', '--control-h-sm: 32px', '--control-h-md: 36px', '--control-h-lg: 40px']) {
  if (!tokenCss.includes(token)) failures.push(`tokens.css missing size token ${token}`);
}
for (const token of ['--layer-sticky', '--layer-popover', '--layer-drawer-backdrop', '--layer-drawer', '--layer-dialog-backdrop', '--layer-dialog', '--layer-toast']) {
  if (!tokenCss.includes(token)) failures.push(`tokens.css missing layer token ${token}`);
}
if (!tokenCss.includes(':root[data-theme="system"]') || !tokenCss.includes(':root[data-theme="dark"]') || !tokenCss.includes(':root[data-density="compact"]')) {
  failures.push('tokens.css must define dark/system theme and compact density token overrides');
}
const settingsHtml = read('public/settings.html');
for (const id of ['uiThemeSelect', 'uiDensitySelect']) {
  if (!settingsHtml.includes(`id="${id}"`)) failures.push(`settings.html missing UI preference control #${id}`);
}

const uiComponents = read('public/js/uiComponents.mjs');
for (const exportName of [
  'uiButtonHtml',
  'uiIconButtonHtml',
  'statusBadgeHtml',
  'emptyStateHtml',
  'taskProgressHtml',
  'dataListHtml',
  'confirmDialogImpactHtml'
]) {
  if (!uiComponents.includes(`export function ${exportName}`)) {
    failures.push(`uiComponents.mjs missing reusable component export ${exportName}`);
  }
}
for (const [file, marker] of [
  ['public/app.mjs', './js/uiComponents.mjs'],
  ['public/settings.mjs', './js/uiComponents.mjs'],
  ['public/plugin.mjs', './js/uiComponents.mjs'],
  ['public/css/components.css', '.task-progress']
]) {
  if (!read(file).includes(marker)) failures.push(`${file} must consume the shared UI component layer`);
}

const appEntry = read('public/app.mjs');
for (const moduleName of ['a11y', 'auth', 'bookmarks', 'detail', 'dialogs', 'preview', 'search', 'sidebar', 'tasks']) {
  const file = `public/js/app/${moduleName}.mjs`;
  const source = read(file);
  if (!appEntry.includes(`./js/app/${moduleName}.mjs`)) failures.push(`public/app.mjs must import ${file}`);
  const lineCount = source.trim().split(/\r?\n/).length;
  if (lineCount > 1000) failures.push(`${file} exceeds the 1000-line app module budget: ${lineCount}`);
}

const contrastPairs = [
  ['muted on surface', '#687080', '#ffffff'],
  ['muted on subtle surface', '#687080', '#f7f8fa'],
  ['default chip', '#4a5568', '#f4f7fb'],
  ['type chip', '#344256', '#f1f5f9'],
  ['success chip', '#166534', '#ecfdf3'],
  ['danger chip', '#b42318', '#fff1f2'],
  ['warning chip', '#9a3412', '#fff7ed'],
  ['info chip', '#1d4ed8', '#eff6ff'],
  ['danger text on danger bg', '#c9364f', '#fff1f2']
];
for (const [label, foreground, background] of contrastPairs) {
  const ratio = contrastRatio(foreground, background);
  if (ratio < 4.5) failures.push(`${label} contrast ratio ${ratio.toFixed(2)} is below WCAG AA`);
}
notes.push(`contrast pairs checked: ${contrastPairs.length}`);

const responsiveCss = read('public/css/responsive.css');
if (!/@media\s*\(\s*max-width\s*:\s*640px\s*\)[\s\S]*min-height\s*:\s*44px/.test(responsiveCss)) {
  failures.push('responsive.css must keep a 44px mobile touch-target rule');
}

const migratedCssFiles = requiredCssImports
  .map((item) => `public/${item.replace('./', '')}`)
  .filter((file) => !file.endsWith('/legacy.css') && !file.endsWith('/tokens.css'));
for (const file of migratedCssFiles) {
  const css = read(file);
  const rawZIndexes = [...css.matchAll(/z-index\s*:\s*(?!\s*var\()[^;\n]+/g)]
    .map((match) => match[0])
    .filter((rule) => !/z-index\s*:\s*1\b/.test(rule));
  if (rawZIndexes.length) failures.push(`${file} uses raw z-index values: ${rawZIndexes.join(', ')}`);
}

if (failures.length) {
  console.error('ui-static-audit: failed');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('ui-static-audit: ok');
notes.forEach((note) => console.log(`- ${note}`));
