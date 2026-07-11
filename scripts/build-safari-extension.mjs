import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const chromeDir = path.join(root, 'chrome-extension');
const safariDir = path.join(root, 'safari-extension');

const SOURCE_FILES = [
  'background.js',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js',
  'shared.css',
  'logo.svg'
];

const SAFARI_HOST_PERMISSIONS = [
  'http://localhost/*',
  'http://127.0.0.1/*',
  'https://bookmark.sundays.ink/*'
];

const jsCompatPrefix = `// Generated Safari Web Extension compatibility wrapper.
const chrome = (() => {
  const browserApi = globalThis.browser;
  const chromeApi = globalThis.chrome;
  const api = browserApi || chromeApi;
  if (!api) throw new Error('WebExtension API is not available.');
  if (!browserApi) return api;

  const wrapper = Object.create(browserApi);
  const runtime = Object.create(browserApi.runtime);

  runtime.sendMessage = (message, callback) => {
    const promise = browserApi.runtime.sendMessage(message);
    if (typeof callback !== 'function') return promise;

    promise.then(
      (response) => callback(response),
      (error) => {
        runtime.lastError = { message: error?.message || String(error) };
        callback(undefined);
        queueMicrotask(() => {
          runtime.lastError = null;
        });
      }
    );
    return undefined;
  };

  wrapper.runtime = runtime;
  return wrapper;
})();

`;

const safariTextReplacements = [
  ['Chrome 扩展', 'Safari 扩展'],
  ['Chrome 书签', 'Safari 书签'],
  ['Chrome ↔ 云书签', 'Safari ↔ 云书签'],
  ['Chrome ↔ Rainbow', 'Safari ↔ Rainbow'],
  ['Chrome 有的会写入 Rainbow；Rainbow 有的会推送到 Chrome。', 'Safari 有的会写入 Rainbow；Rainbow 有的会推送到 Safari。'],
  ['--- Chrome 侧 ---', '--- Safari 侧 ---'],
  ['Chrome 文件夹数', 'Safari 文件夹数'],
  ['Chrome 文件夹:', 'Safari 文件夹:'],
  ['Chrome 书签总数', 'Safari 书签总数'],
  ['新增到 Chrome', '新增到 Safari'],
  ['从 Chrome 删除', '从 Safari 删除'],
  ['待同步到 Chrome:', '待同步到 Safari:'],
  ['待推送到 Chrome:', '待推送到 Safari:'],
  ['待从 Chrome 删除:', '待从 Safari 删除:'],
  ['+ Chrome:', '+ Safari:'],
  ['- Chrome->Trash:', '- Safari->Trash:'],
  ['+Chrome:', '+Safari:'],
  ['-Chrome:', '-Safari:'],
  ['Chrome sync API failed', 'Safari sync API failed'],
  ['Chrome Ext Auto Token', 'Safari Ext Auto Token']
];

function replaceAllExact(source, replacements) {
  let output = source;
  for (const [from, to] of replacements) {
    output = output.split(from).join(to);
  }
  return output;
}

function transformForSafari(fileName, source) {
  let output = replaceAllExact(source, safariTextReplacements);
  if (fileName.endsWith('.js')) output = `${jsCompatPrefix}${output}`;
  return output;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, data) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function writeManifest() {
  const chromeManifest = await readJson(path.join(chromeDir, 'manifest.json'));
  const manifest = {
    manifest_version: chromeManifest.manifest_version,
    name: 'Rainbow Sync for Safari',
    version: chromeManifest.version,
    description: 'Bidirectional sync between Safari bookmarks and Rainbow cloud bookmarks.',
    permissions: chromeManifest.permissions,
    host_permissions: SAFARI_HOST_PERMISSIONS,
    background: chromeManifest.background,
    action: {
      default_title: 'Rainbow Sync',
      default_popup: 'popup.html'
    },
    options_page: 'options.html'
  };

  await writeJson(path.join(safariDir, 'manifest.json'), manifest);
}

async function writeReadme() {
  const content = `# Safari Web Extension：Rainbow Sync

本目录由 \`npm run extension:safari:build\` 从 \`chrome-extension/\` 生成。

## 生成

\`\`\`bash
npm run extension:safari:build
\`\`\`

## 转换为 Xcode 项目

安装完整 Xcode 后执行：

\`\`\`bash
xcrun safari-web-extension-converter safari-extension --project-location output/safari --app-name "Rainbow Sync"
\`\`\`

打开生成的 Xcode 项目，设置 Team 和 Bundle Identifier，运行 macOS 容器 App，然后到 Safari 设置中启用扩展。

## 说明

- Safari 源码复用 Chrome 扩展同步逻辑，只调整 Safari 可见文案和 WebExtension API 兼容层。
- Host permissions 限制为本地开发地址和 \`https://bookmark.sundays.ink/*\`。
- Token 自动识别依赖 Safari 对 Rainbow 域名的网站访问授权。
`;

  await fs.writeFile(path.join(safariDir, 'README.md'), content, 'utf8');
}

async function copySources() {
  for (const fileName of SOURCE_FILES) {
    const source = await fs.readFile(path.join(chromeDir, fileName), 'utf8');
    await fs.writeFile(path.join(safariDir, fileName), transformForSafari(fileName, source), 'utf8');
  }
}

async function main() {
  await fs.rm(safariDir, { recursive: true, force: true });
  await fs.mkdir(safariDir, { recursive: true });
  await copySources();
  await writeManifest();
  await writeReadme();
  console.log(`Safari extension generated at ${path.relative(root, safariDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
