export function createSettingsDialogController({
  byId,
  escapeHtml,
  confirmDialogImpactHtml,
  formatDateTime,
  setStatus
}) {
  function summarizePayload(payload) {
    if (payload == null) return [];
    if (Array.isArray(payload)) return [['条目数', String(payload.length)]];
    if (typeof payload !== 'object') return [['结果', String(payload)]];
    return Object.entries(payload)
      .slice(0, 6)
      .map(([key, value]) => {
        let text = '';
        if (Array.isArray(value)) text = `${value.length} 项`;
        else if (value && typeof value === 'object') text = JSON.stringify(value).slice(0, 80);
        else text = String(value ?? '');
        return [key, text || '-'];
      });
  }

  function settingsOutputStateMeta(state) {
    const key = String(state || 'success');
    const map = {
      queued: ['info', 'queued'],
      running: ['info', 'running'],
      loading: ['info', 'running'],
      succeeded: ['success', 'succeeded'],
      success: ['success', 'succeeded'],
      failed: ['danger', 'failed'],
      error: ['danger', 'failed']
    };
    return map[key] || ['info', key];
  }

  function writeSettingsOutput(id, payload, {
    title = '执行结果',
    state = 'success',
    rawLabel = '查看原始数据',
    actionsHtml = ''
  } = {}) {
    const el = byId(id);
    if (!el) return;
    const [chipClass, stateLabel] = settingsOutputStateMeta(state);
    const fields = summarizePayload(payload);
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    el.innerHTML = `<div class="settings-output-card" data-state="${escapeHtml(state)}">
      <div class="settings-output-head">
        <strong>${escapeHtml(title)}</strong>
        <span class="meta-chip ${escapeHtml(chipClass)}">${escapeHtml(stateLabel)}</span>
      </div>
      ${fields.length ? `<div class="settings-output-grid">${fields.map(([key, value]) => `<div class="settings-output-field"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>` : ''}
      <details>
        <summary>${escapeHtml(rawLabel)}</summary>
        <pre>${escapeHtml(raw || '')}</pre>
      </details>
      ${actionsHtml ? `<div class="settings-output-actions">${actionsHtml}</div>` : ''}
    </div>`;
  }

  function settingsTaskProgress(payload, status) {
    const task = payload?.task || payload;
    const progress = task?.progress || payload?.progress || {};
    if (typeof progress.percent === 'number') return `${Math.round(progress.percent)}%`;
    const done = Number(progress.done ?? progress.processed ?? progress.succeeded ?? 0) || 0;
    const total = Number(progress.total ?? progress.count ?? 0) || 0;
    if (total) return `${done}/${total}`;
    return status === 'succeeded' ? '100%' : '等待结果';
  }

  function settingsTaskPayload(status, {
    startedAt,
    finishedAt = Date.now(),
    result = null,
    error = null
  } = {}) {
    const payload = {
      状态: status,
      进度: settingsTaskProgress(result, status),
      开始时间: formatDateTime(startedAt),
      更新时间: formatDateTime(finishedAt)
    };
    if (error) payload.错误 = String(error?.message || error);
    if (result) payload.结果 = result;
    return payload;
  }

  async function runSettingsTask({
    outputId,
    title,
    run,
    onSuccess = null,
    successStatus = '操作完成',
    errorStatus = '操作失败'
  }) {
    const startedAt = Date.now();
    writeSettingsOutput(outputId, settingsTaskPayload('running', { startedAt, finishedAt: startedAt }), {
      title,
      state: 'running'
    });
    try {
      const out = await run();
      await onSuccess?.(out);
      const status = String(out?.task?.status || out?.status || 'succeeded');
      const finalStatus = status === 'failed' ? 'failed' : status === 'queued' || status === 'running' ? status : 'succeeded';
      writeSettingsOutput(outputId, settingsTaskPayload(finalStatus, { startedAt, result: out }), {
        title,
        state: finalStatus
      });
      setStatus(typeof successStatus === 'function' ? successStatus(out) : successStatus);
      return out;
    } catch (error) {
      const retryId = `${outputId}-${Date.now()}`;
      writeSettingsOutput(outputId, settingsTaskPayload('failed', { startedAt, error }), {
        title: `${title}失败`,
        state: 'failed',
        actionsHtml: `<button type="button" class="ghost danger" data-settings-task-retry="${escapeHtml(retryId)}">重试</button>`
      });
      const selectorValue = globalThis.CSS?.escape
        ? globalThis.CSS.escape(retryId)
        : retryId.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      const retryButton = byId(outputId)?.querySelector?.(`[data-settings-task-retry="${selectorValue}"]`);
      retryButton?.addEventListener('click', () => {
        void runSettingsTask({ outputId, title, run, onSuccess, successStatus, errorStatus });
      });
      setStatus(error?.message || errorStatus, { error: true });
      return null;
    }
  }

  function confirmSettingsAction({
    title = '确认操作',
    message = '请确认是否继续。',
    impact = '该操作可能无法撤销。',
    confirmText = '确认'
  } = {}) {
    const dialog = byId('settingsConfirmDialog');
    const titleEl = byId('settingsConfirmTitle');
    const messageEl = byId('settingsConfirmMessage');
    const impactEl = byId('settingsConfirmImpact');
    const cancelBtn = byId('settingsConfirmCancelBtn');
    const okBtn = byId('settingsConfirmOkBtn');
    if (!dialog || !cancelBtn || !okBtn) return Promise.resolve(false);
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (impactEl) impactEl.innerHTML = confirmDialogImpactHtml(impact);
    okBtn.textContent = confirmText;
    return new Promise((resolve) => {
      let settled = false;
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        cancelBtn.removeEventListener('click', onCancel);
        okBtn.removeEventListener('click', onOk);
        dialog.removeEventListener('cancel', onCancel);
        dialog.removeEventListener('close', onClose);
        resolve(result);
      };
      const onCancel = () => {
        if (dialog.open) dialog.close('cancel');
        cleanup(false);
      };
      const onOk = () => {
        if (dialog.open) dialog.close('confirm');
        cleanup(true);
      };
      const onClose = () => cleanup(dialog.returnValue === 'confirm');
      cancelBtn.addEventListener('click', onCancel);
      okBtn.addEventListener('click', onOk);
      dialog.addEventListener('cancel', onCancel);
      dialog.addEventListener('close', onClose);
      dialog.showModal();
      cancelBtn.focus();
    });
  }

  return {
    confirmSettingsAction,
    runSettingsTask,
    settingsTaskPayload,
    settingsTaskProgress,
    writeSettingsOutput
  };
}
