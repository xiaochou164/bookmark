import fs from 'node:fs';
import path from 'node:path';
import {
  startServer,
  startChrome,
  setViewport,
  seedSession,
  prepareWorkbench,
  evaluate,
  waitForExpression,
  pressKey
} from './ui-browser-audit.mjs';

const root = path.resolve(import.meta.dirname, '..');
const reportPath = path.join(root, 'docs/screenshots/audit-2026-11-16/after/ui-e2e-report.json');

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function apiState(session, title, view = 'all') {
  return evaluate(session, `fetch('/api/bookmarks?view=${encodeURIComponent(view)}&pageSize=200', {credentials:'same-origin'})
    .then(r => r.json())
    .then(payload => (payload.items || payload).find(item => item.title === ${JSON.stringify(title)}) || null)`);
}

async function main() {
  const server = await startServer();
  const browser = await startChrome();
  const checks = [];
  const mark = (name, detail = '') => checks.push({ name, ok: true, detail });
  try {
    const { session } = browser;
    await setViewport(session, { width: 920, height: 900 });
    await seedSession(session, server.baseUrl);
    await prepareWorkbench(session, server.baseUrl, 'list');

    await evaluate(session, `document.querySelector('#addBookmarkBtn').click()`);
    await waitForExpression(session, `document.querySelector('#bookmarkDialog')?.open === true`);
    await evaluate(session, `document.querySelector('#createBookmarkBtn').click()`);
    await waitForExpression(session, `!document.querySelector('#bookmarkFormError')?.classList.contains('hidden')`);
    mark('create validation', 'required title and URL expose an inline error');

    const originalTitle = `E2E 可撤销书签 ${Date.now()}`;
    const updatedTitle = `${originalTitle}（已编辑）`;
    await evaluate(session, `(() => {
      const set = (id, value) => { const input = document.querySelector(id); input.value = value; input.dispatchEvent(new Event('input', {bubbles:true})); };
      set('#newTitle', ${JSON.stringify(originalTitle)});
      set('#newUrl', 'https://example.com/e2e-audit');
      set('#newTags', 'e2e, audit');
      set('#newNote', 'created from the browser interaction audit');
      document.querySelector('#createBookmarkBtn').click();
    })()`);
    await waitForExpression(session, `document.querySelector('#detailTitle')?.value === ${JSON.stringify(originalTitle)}`, 15000);
    const created = await apiState(session, originalTitle);
    assert(created?.id, 'created bookmark was not persisted');
    mark('create bookmark', created.id);

    await evaluate(session, `document.querySelector('#detailPanelEditModeBtn').click()`);
    await waitForExpression(session, `document.querySelector('#detailTitle')?.disabled === false`);
    await evaluate(session, `(() => {
      const title = document.querySelector('#detailTitle');
      title.value = ${JSON.stringify(updatedTitle)};
      title.dispatchEvent(new Event('input', {bubbles:true}));
      document.querySelector('#saveDetailBtn').click();
    })()`);
    await waitForExpression(session, `document.querySelector('#detailSummaryTitle')?.textContent === ${JSON.stringify(updatedTitle)}`, 15000);
    const updated = await apiState(session, updatedTitle);
    assert(updated?.id === created.id, 'edited bookmark was not persisted');
    mark('edit and save detail');

    await evaluate(session, `document.querySelector('#detailCloseBtn').click()`);
    await waitForExpression(session, `document.querySelector('#detailForm')?.classList.contains('hidden')`);
    await evaluate(session, `(() => {
      const input = document.querySelector('#searchInput');
      input.value = ${JSON.stringify('已编辑')};
      input.dispatchEvent(new Event('input', {bubbles:true}));
    })()`);
    await waitForExpression(session, `document.querySelectorAll('#cards [data-id]').length === 1`);
    mark('search filtering and result state');

    await evaluate(session, `document.querySelector('#cards [data-select]').click(); document.querySelector('#bulkFavoriteBtn').click()`);
    await waitForExpression(session, `document.querySelector('#bulkActionsBar')?.classList.contains('hidden')`, 15000);
    const favorited = await apiState(session, updatedTitle);
    assert(favorited?.favorite === true, 'bulk favorite did not persist');
    mark('bulk favorite');

    await evaluate(session, `document.querySelector('#cards [data-select]').click(); document.querySelector('#bulkDeleteBtn').click()`);
    await waitForExpression(session, `document.querySelector('#actionDialog')?.open === true`);
    const confirmationFocus = await evaluate(session, `document.querySelector('#actionDialog')?.contains(document.activeElement) === true`);
    assert(confirmationFocus, 'bulk delete confirmation did not receive focus');
    await evaluate(session, `document.querySelector('#actionDialogConfirmBtn').click()`);
    await waitForExpression(session, `document.querySelectorAll('#cards [data-id]').length === 0`, 15000);
    const deleted = await apiState(session, updatedTitle, 'trash');
    assert(Boolean(deleted?.deletedAt), 'bulk delete did not create a recoverable deletion');
    mark('bulk delete confirmation');

    await waitForExpression(session, `!document.querySelector('#toastUndoBtn')?.classList.contains('hidden')`);
    await evaluate(session, `document.querySelector('#toastUndoBtn').click()`);
    await waitForExpression(session, `document.querySelectorAll('#cards [data-id]').length === 1`, 15000);
    const restored = await apiState(session, updatedTitle);
    assert(!restored?.deletedAt, 'undo did not restore the bookmark');
    mark('bulk delete undo');

    await evaluate(session, `document.querySelector('#searchInput').value=''; document.querySelector('#searchInput').dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#askAiBtn').focus(); document.querySelector('#askAiBtn').click()`);
    await waitForExpression(session, `document.querySelector('#aiSideDrawer')?.getAttribute('aria-hidden') === 'false'`);
    await pressKey(session, 'Escape');
    await waitForExpression(session, `document.activeElement?.id === 'askAiBtn'`);
    mark('AI drawer escape and focus restore');

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ createdAt: new Date().toISOString(), checks }, null, 2));
    console.log(`ui-e2e-audit: ok (${checks.length} checks)`);
  } finally {
    browser.session.close();
    browser.stop();
    server.stop();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('ui-e2e-audit: failed');
  console.error(error);
  process.exit(1);
});
