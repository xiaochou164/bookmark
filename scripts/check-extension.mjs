import { execFileSync } from 'node:child_process';
for (const file of ['chrome-extension/background.js', 'chrome-extension/options.js', 'chrome-extension/popup.js', 'scripts/build-safari-extension.mjs']) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
