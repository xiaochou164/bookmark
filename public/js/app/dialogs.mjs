import { byId } from '../utils.mjs';

let actionDialogSession = null;

export function setFormBannerError(errorId, message = '') {
  const el = byId(errorId);
  if (!el) return;
  const text = String(message || '').trim();
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}

export function clearFormFieldError(input) {
  if (!input) return;
  input.classList.remove('is-invalid');
  input.removeAttribute('aria-invalid');
  const label = input.closest('.form-field');
  if (label && label.dataset && 'error' in label.dataset) {
    delete label.dataset.error;
  }
}

export function setFormFieldError(input, message) {
  if (!input) return false;
  const text = String(message || '').trim();
  if (!text) {
    clearFormFieldError(input);
    return true;
  }
  input.classList.add('is-invalid');
  input.setAttribute('aria-invalid', 'true');
  const label = input.closest('.form-field');
  if (label) label.dataset.error = text;
  return false;
}

export function clearFormValidation(formId, errorId = null) {
  const form = byId(formId);
  if (form) {
    form.querySelectorAll('.is-invalid').forEach((el) => clearFormFieldError(el));
    form.querySelectorAll('.form-field[data-error]').forEach((el) => {
      delete el.dataset.error;
    });
  }
  if (errorId) setFormBannerError(errorId, '');
}

export function bindInlineValidation(formId, { errorId = null } = {}) {
  const form = byId(formId);
  if (!form || form.dataset.inlineValidationBound === '1') return;
  form.dataset.inlineValidationBound = '1';
  const onChange = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('input, textarea, select')) {
      clearFormFieldError(target);
      if (errorId) setFormBannerError(errorId, '');
    }
  };
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);
  form.addEventListener('close', () => clearFormValidation(formId, errorId));
}

export function bindActionDialog() {
  const dlg = byId('actionDialog');
  if (!dlg || dlg.dataset.bound === '1') return;
  dlg.dataset.bound = '1';
  const cancelBtn = byId('actionDialogCancelBtn');
  const confirmBtn = byId('actionDialogConfirmBtn');
  const input = byId('actionDialogInput');
  const closeWith = (result) => {
    const session = actionDialogSession;
    if (!session) return;
    actionDialogSession = null;
    try {
      dlg.close();
    } catch (_err) {
      // ignore
    }
    session.resolve(result);
  };
  cancelBtn?.addEventListener('click', () => closeWith({ ok: false, cancelled: true, value: null }));
  confirmBtn?.addEventListener('click', () => {
    const session = actionDialogSession;
    if (!session) return;
    const mode = session.mode;
    const rawValue = String(input?.value ?? '');
    if (mode === 'prompt') {
      const trimmed = session.options?.trim === false ? rawValue : rawValue.trim();
      const required = Boolean(session.options?.required);
      if (required && !trimmed) {
        setFormBannerError('actionDialogError', session.options?.requiredMessage || '请输入内容后再继续。');
        if (input) setFormFieldError(input, session.options?.requiredMessage || '必填');
        input?.focus();
        return;
      }
      if (typeof session.options?.validate === 'function') {
        const errMsg = session.options.validate(trimmed);
        if (errMsg) {
          setFormBannerError('actionDialogError', errMsg);
          if (input) setFormFieldError(input, errMsg);
          input?.focus();
          return;
        }
      }
      closeWith({ ok: true, cancelled: false, value: trimmed });
      return;
    }
    closeWith({ ok: true, cancelled: false, value: true });
  });
  input?.addEventListener('input', () => {
    clearFormFieldError(input);
    setFormBannerError('actionDialogError', '');
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeWith({ ok: false, cancelled: true, value: null });
  });
}

export function openActionDialog({
  mode = 'confirm',
  title = '确认操作',
  message = '请确认继续。',
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  inputLabel = '输入',
  placeholder = '',
  defaultValue = '',
  trim = true,
  required = false,
  requiredMessage = '',
  validate = null
} = {}) {
  bindActionDialog();
  const dlg = byId('actionDialog');
  if (!dlg) return Promise.resolve({ ok: false, cancelled: true, value: null });
  if (actionDialogSession) {
    actionDialogSession.resolve({ ok: false, cancelled: true, value: null });
    actionDialogSession = null;
  }
  if (dlg.open) {
    try {
      dlg.close();
    } catch (_err) {
      // ignore
    }
  }
  const inputWrap = byId('actionDialogInputWrap');
  const input = byId('actionDialogInput');
  const titleEl = byId('actionDialogTitle');
  const msgEl = byId('actionDialogMessage');
  const inputLabelEl = byId('actionDialogInputLabel');
  const confirmBtn = byId('actionDialogConfirmBtn');
  const cancelBtn = byId('actionDialogCancelBtn');
  clearFormValidation('actionDialog', 'actionDialogError');
  if (titleEl) titleEl.textContent = String(title || '确认操作');
  if (msgEl) msgEl.textContent = String(message || '');
  if (confirmBtn) {
    confirmBtn.textContent = String(confirmText || '确定');
    confirmBtn.classList.toggle('danger', Boolean(danger));
  }
  if (cancelBtn) cancelBtn.textContent = String(cancelText || '取消');
  if (inputWrap) inputWrap.classList.toggle('hidden', mode !== 'prompt');
  if (inputLabelEl) inputLabelEl.textContent = String(inputLabel || '输入');
  if (input) {
    input.value = String(defaultValue ?? '');
    input.placeholder = String(placeholder || '');
    clearFormFieldError(input);
  }
  const promise = new Promise((resolve) => {
    actionDialogSession = {
      resolve,
      mode,
      options: { trim, required, requiredMessage, validate }
    };
  });
  if (!dlg.open) dlg.showModal();
  queueMicrotask(() => {
    if (mode === 'prompt') input?.focus();
    else confirmBtn?.focus();
  });
  return promise;
}

export async function uiConfirm(message, options = {}) {
  const out = await openActionDialog({ ...options, mode: 'confirm', message });
  return Boolean(out?.ok);
}

export async function uiPrompt(message, options = {}) {
  const out = await openActionDialog({ ...options, mode: 'prompt', message });
  if (!out?.ok) return null;
  return out.value;
}
