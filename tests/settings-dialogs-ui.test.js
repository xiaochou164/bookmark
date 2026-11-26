const test = require('node:test');
const assert = require('node:assert/strict');

class FakeElement {
  constructor() {
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.open = false;
    this.returnValue = '';
    this.listeners = new Map();
  }

  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type) { return this.listeners.get(type)?.({}); }
  showModal() { this.open = true; }
  close(value = '') { this.returnValue = value; this.open = false; this.listeners.get('close')?.({}); }
  focus() {}
  querySelector() { return null; }
}

function makeController() {
  const elements = {
    settingsConfirmDialog: new FakeElement(),
    settingsConfirmTitle: new FakeElement(),
    settingsConfirmMessage: new FakeElement(),
    settingsConfirmImpact: new FakeElement(),
    settingsConfirmCancelBtn: new FakeElement(),
    settingsConfirmOkBtn: new FakeElement(),
    taskOutput: new FakeElement()
  };
  const status = [];
  return import('../public/js/settingsDialogs.mjs').then(({ createSettingsDialogController }) => ({
    controller: createSettingsDialogController({
      byId: (id) => elements[id] || null,
      escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
      confirmDialogImpactHtml: (value) => `<p>${String(value)}</p>`,
      formatDateTime: (value) => String(value),
      setStatus: (value, options) => status.push([value, options])
    }),
    elements,
    status
  }));
}

test('settings dialog controller escapes task output and reports success', async () => {
  const { controller, elements, status } = await makeController();
  const result = await controller.runSettingsTask({
    outputId: 'taskOutput',
    title: '任务 <测试>',
    run: async () => ({ status: 'succeeded', result: '<unsafe>' }),
    successStatus: '完成'
  });

  assert.equal(result.status, 'succeeded');
  assert.match(elements.taskOutput.innerHTML, /任务 &lt;测试&gt;/);
  assert.doesNotMatch(elements.taskOutput.innerHTML, /<unsafe>/);
  assert.deepEqual(status, [['完成', undefined]]);
});

test('settings dialog controller confirms and cleans up cancel listeners', async () => {
  const { controller, elements } = await makeController();
  const pending = controller.confirmSettingsAction({
    title: '危险操作',
    message: '确认？',
    impact: '会删除数据',
    confirmText: '继续'
  });
  assert.equal(elements.settingsConfirmDialog.open, true);
  assert.equal(elements.settingsConfirmTitle.textContent, '危险操作');
  assert.match(elements.settingsConfirmImpact.innerHTML, /会删除数据/);
  await elements.settingsConfirmCancelBtn.dispatch('click');
  assert.equal(await pending, false);
  assert.equal(elements.settingsConfirmDialog.open, false);
  assert.equal(elements.settingsConfirmCancelBtn.listeners.size, 0);
});

test('settings dialog controller exposes task progress and failed status', async () => {
  const { controller, elements, status } = await makeController();
  const payload = controller.settingsTaskPayload('running', {
    startedAt: 1,
    finishedAt: 2,
    result: { task: { progress: { done: 2, total: 5 } } }
  });
  assert.equal(payload.进度, '2/5');

  const result = await controller.runSettingsTask({
    outputId: 'taskOutput',
    title: '失败任务',
    run: async () => { throw new Error('服务不可用'); },
    errorStatus: '失败'
  });
  assert.equal(result, null);
  assert.match(elements.taskOutput.innerHTML, /服务不可用/);
  assert.deepEqual(status.at(-1), ['服务不可用', { error: true }]);
});
