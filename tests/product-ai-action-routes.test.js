const test = require('node:test');
const assert = require('node:assert/strict');
const { registerProductAiActionRoutes } = require('../src/routes/productAiActionRoutes');

const callbacks = [
  'runAiTagJob', 'runAiTitleCleanJob', 'runAiSummaryJob', 'runAiTagStandardizeSuggestJob',
  'runAiTagLocalizationJob', 'runAiSearchFilterParseJob', 'runAiReaderSummaryJob',
  'runAiHighlightCandidatesJob', 'runAiHighlightDigestJob', 'runAiFolderKnowledgeSummaryJob',
  'runAiBookmarksQaJob', 'runAiRelatedBookmarksJob', 'runAiReadingPriorityJob', 'runAiFolderRecommendJob'
];

test('AI action routes forward normalized inputs to the matching product jobs', async () => {
  const routes = new Map();
  const calls = [];
  const app = { post(path, handler) { routes.set(path, handler); } };
  const deps = {
    dbRepo: {},
    badRequest: (message) => Object.assign(new Error(message), { status: 400 }),
    notFound: (message) => Object.assign(new Error(message), { status: 404 }),
    userIdOf: () => 'alice'
  };
  for (const name of callbacks) {
    deps[name] = async (_req, input) => {
      calls.push({ name, input });
      return { job: name };
    };
  }
  registerProductAiActionRoutes(app, deps);

  const invoke = async (path, params = {}, body = {}) => {
    let payload;
    let forwardedError;
    await routes.get(path)(
      { params, body },
      { json(value) { payload = value; return this; } },
      (error) => { forwardedError = error; }
    );
    if (forwardedError) throw forwardedError;
    return payload;
  };

  assert.equal(routes.size, 15);
  assert.deepEqual(await invoke('/api/product/ai/suggest/:bookmarkId', { bookmarkId: 'b1' }), { ok: true, job: 'runAiTagJob' });
  await invoke('/api/product/ai/autotag/:bookmarkId', { bookmarkId: 'b2' }, { apply: false, applyMode: 'replace' });
  await invoke('/api/product/ai/title-clean/:bookmarkId', { bookmarkId: 'b3' }, {});
  await invoke('/api/product/ai/summary/:bookmarkId', { bookmarkId: 'b4' }, { noteMode: 'always' });
  await invoke('/api/product/ai/tags/standardize', {}, { apply: true, suggestions: [{ from: 'JS', to: 'JavaScript' }] });
  await invoke('/api/product/ai/tags/localize', {}, {});
  await invoke('/api/product/ai/search-to-filters', {}, { text: 'tag:reading', current: { folderId: 'f1' } });
  await invoke('/api/product/ai/reader-summary/:bookmarkId', { bookmarkId: 'b5' }, {});
  await invoke('/api/product/ai/highlight-candidates/:bookmarkId', { bookmarkId: 'b6' });
  await invoke('/api/product/ai/highlight-digest/:bookmarkId', { bookmarkId: 'b7' }, { apply: false });
  await invoke('/api/product/ai/folder-summary/:folderId', { folderId: 'f2' }, {});
  await invoke('/api/product/ai/qa', {}, { question: 'What should I read?', bookmarkIds: ['b8'] });
  await invoke('/api/product/ai/related/:bookmarkId', { bookmarkId: 'b9' }, { limit: 8 });
  await invoke('/api/product/ai/reading-priority', {}, { view: 'inbox' });
  await invoke('/api/product/ai/folder-recommend/:bookmarkId', { bookmarkId: 'b10' }, { apply: true, recommendation: { folderId: 'f3' } });

  assert.deepEqual(calls.map((call) => call.name), [
    'runAiTagJob', 'runAiTagJob', ...callbacks.slice(1)
  ]);
  assert.deepEqual(calls[0].input, { bookmarkId: 'b1', applyTags: false, routeMode: 'suggest' });
  assert.deepEqual(calls[1].input, { bookmarkId: 'b2', applyTags: false, explicitApplyMode: 'replace', routeMode: 'autotag' });
  assert.deepEqual(calls[2].input, { bookmarkId: 'b3', apply: true });
  assert.deepEqual(calls[3].input, { bookmarkId: 'b4', apply: true, noteMode: 'always' });
  assert.equal(calls[4].input.apply, true);
  assert.equal(calls[5].input.suggestions, null);
  assert.deepEqual(calls[6].input, { text: 'tag:reading', current: { folderId: 'f1' } });
  assert.deepEqual(calls[7].input, { bookmarkId: 'b5', apply: true });
  assert.deepEqual(calls[9].input, { bookmarkId: 'b7', apply: false });
  assert.deepEqual(calls[10].input, { folderId: 'f2', apply: true });
  assert.deepEqual(calls[11].input, { question: 'What should I read?', bookmarkId: undefined, bookmarkIds: ['b8'], scope: undefined, limit: undefined });
  assert.deepEqual(calls[13].input, { view: 'inbox', folderId: undefined, onlyUnread: true, includeArchived: false, limit: undefined, candidateLimit: undefined });
  assert.deepEqual(calls[14].input, { bookmarkId: 'b10', apply: true, recommendation: { folderId: 'f3' } });
});

test('AI action routes map missing bookmarks and folders to not-found errors', async () => {
  const routes = new Map();
  const app = { post(path, handler) { routes.set(path, handler); } };
  const expected = Object.assign(new Error('folder not found'), { status: 404 });
  registerProductAiActionRoutes(app, {
    dbRepo: {},
    badRequest: (message) => new Error(message),
    notFound: (message) => Object.assign(new Error(message), { status: 404 }),
    userIdOf: () => 'alice',
    ...Object.fromEntries(callbacks.map((name) => [name, async () => { throw expected; }]))
  });
  let forwarded;
  await routes.get('/api/product/ai/folder-summary/:folderId')({ params: { folderId: 'foreign-folder' }, body: {} }, { json() { assert.fail('failed job must not return success'); } }, (error) => { forwarded = error; });
  assert.equal(forwarded.status, 404);
  assert.equal(forwarded.message, 'folder not found');
});
