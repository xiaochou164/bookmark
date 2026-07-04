import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const notes = [];

const requiredCssImports = [
  './css/tokens.css',
  './css/legacy.css',
  './css/base.css',
  './css/components.css',
  './css/utilities.css'
];
const entryCss = read('public/styles.css');
for (const cssImport of requiredCssImports) {
  if (!entryCss.includes(cssImport)) failures.push(`styles.css is missing ${cssImport}`);
}

const htmlFiles = [
  'public/index.html',
  'public/login.html',
  'public/settings.html',
  'public/plugin.html',
  'chrome-extension/popup.html',
  'chrome-extension/options.html'
];
for (const file of htmlFiles) {
  const html = read(file);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) failures.push(`${file} has duplicate ids: ${[...new Set(duplicates)].join(', ')}`);
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
if (repeatedSelectors.length > 200) failures.push(`legacy duplicate selector count exceeded the migration baseline (200): ${repeatedSelectors.length}`);

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

if (failures.length) {
  console.error('ui-static-audit: failed');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('ui-static-audit: ok');
notes.forEach((note) => console.log(`- ${note}`));
