import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stat = (file) => fs.statSync(path.join(root, file));
const failures = [];
const notes = [];

const budgets = {
  appEntryKiB: 420,
  totalCssKiB: 190,
  indexStaticNodes: 750,
  settingsStaticNodes: 560
};

function kib(bytes) {
  return bytes / 1024;
}

function checkMax(label, actual, max, unit = '') {
  notes.push(`${label}: ${actual.toFixed(unit === 'KiB' ? 1 : 0)}${unit} / ${max}${unit}`);
  if (actual > max) failures.push(`${label} budget exceeded: ${actual.toFixed(1)}${unit} > ${max}${unit}`);
}

function htmlNodeCount(file) {
  return [...read(file).matchAll(/<([a-z][a-z0-9-]*)\b/gi)].length;
}

const cssFiles = [
  'public/styles.css',
  'public/css/tokens.css',
  'public/css/legacy.css',
  'public/css/legacy-workbench-overrides.css',
  'public/css/legacy-safety.css',
  'public/css/base.css',
  'public/css/layout.css',
  'public/css/workbench.css',
  'public/css/components.css',
  'public/css/dialogs.css',
  'public/css/states.css',
  'public/css/settings.css',
  'public/css/public.css',
  'public/css/responsive.css',
  'public/css/utilities.css'
];

checkMax('app entry', kib(stat('public/app.mjs').size), budgets.appEntryKiB, 'KiB');
checkMax('total CSS', kib(cssFiles.reduce((sum, file) => sum + stat(file).size, 0)), budgets.totalCssKiB, 'KiB');
checkMax('index static DOM nodes', htmlNodeCount('public/index.html'), budgets.indexStaticNodes);
checkMax('settings static DOM nodes', htmlNodeCount('public/settings.html'), budgets.settingsStaticNodes);

const appSource = read('public/app.mjs');
const settingsSource = read('public/settings.mjs');
if (!appSource.includes('renderIoTaskList')) failures.push('IO task list rendering must stay explicit for task performance review');
if (!settingsSource.includes('pageSize = 10')) failures.push('dedupe results must keep pagination for long-list performance');

if (failures.length) {
  console.error('ui-performance-budget: failed');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('ui-performance-budget: ok');
notes.forEach((note) => console.log(`- ${note}`));
