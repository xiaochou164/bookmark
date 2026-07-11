import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'README.md',
  'docs/README.md',
  'docs/ARCHITECTURE.md',
  'docs/CHROME_EXTENSION_SYNC.md',
  'docs/openapi.json',
  'chrome-extension/README.md',
  'safari-extension/README.md'
];

const failures = [];
for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`missing required document: ${relative}`);
}

function collectMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const markdownFiles = [
  path.join(root, 'README.md'),
  ...collectMarkdown(path.join(root, 'docs')),
  path.join(root, 'chrome-extension', 'README.md'),
  path.join(root, 'safari-extension', 'README.md')
].filter((file, index, list) => fs.existsSync(file) && list.indexOf(file) === index);

const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
for (const file of markdownFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(linkPattern)) {
    const raw = String(match[1] || '').trim().replace(/^<|>$/g, '');
    if (!raw || /^(?:https?:|mailto:|#)/i.test(raw) || raw.startsWith('/')) continue;
    const targetPart = raw.split('#')[0].split('?')[0];
    if (!targetPart) continue;
    const target = path.resolve(path.dirname(file), decodeURIComponent(targetPart));
    if (!fs.existsSync(target)) {
      failures.push(`${path.relative(root, file)}: broken relative link ${raw}`);
    }
  }
}

let openapi;
try {
  openapi = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'openapi.json'), 'utf8'));
} catch (error) {
  failures.push(`docs/openapi.json: ${error.message}`);
}

if (openapi) {
  if (openapi.openapi !== '3.1.0') failures.push('docs/openapi.json: expected OpenAPI 3.1.0');
  for (const requiredPath of [
    '/api/health',
    '/api/auth/tokens',
    '/api/chrome-sync',
    '/api/chrome-sync/bookmarks',
    '/api/plugins/raindropSync/devices/register',
    '/api/plugins/raindropSync/devices/{deviceId}/status'
  ]) {
    if (!openapi.paths?.[requiredPath]) failures.push(`docs/openapi.json: missing ${requiredPath}`);
  }
}

if (failures.length) {
  console.error('docs-audit: failed');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('docs-audit: ok');
console.log(`- markdown files checked: ${markdownFiles.length}`);
console.log(`- required documents: ${requiredFiles.length}`);
console.log(`- OpenAPI paths: ${Object.keys(openapi?.paths || {}).length}`);
