const test = require('node:test');
const assert = require('node:assert/strict');

function memoryStorage(initial = '') {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, 'rainbow.aiDrawerHistory');
      return value;
    },
    setItem(key, next) {
      assert.equal(key, 'rainbow.aiDrawerHistory');
      value = next;
    },
    value: () => value
  };
}

test('AI drawer history tolerates malformed, unavailable and non-array storage', async () => {
  const { readAiDrawerHistory, writeAiDrawerHistory } = await import('../public/js/app/aiDrawerHistory.mjs');
  assert.deepEqual(readAiDrawerHistory(memoryStorage('{broken')), []);
  assert.deepEqual(readAiDrawerHistory(memoryStorage('{}')), []);
  assert.deepEqual(readAiDrawerHistory({ getItem() { throw new Error('blocked'); } }), []);
  assert.doesNotThrow(() => writeAiDrawerHistory({ setItem() { throw new Error('blocked'); } }, []));
});

test('AI drawer history persists only the newest supported number of entries', async () => {
  const { AI_DRAWER_HISTORY_LIMIT, readAiDrawerHistory, writeAiDrawerHistory } = await import('../public/js/app/aiDrawerHistory.mjs');
  const storage = memoryStorage();
  const history = Array.from({ length: AI_DRAWER_HISTORY_LIMIT + 3 }, (_, index) => ({ id: index }));
  writeAiDrawerHistory(storage, history);
  assert.deepEqual(readAiDrawerHistory(storage), history.slice(0, AI_DRAWER_HISTORY_LIMIT));
});
