import { escapeHtml as esc, safeUrl } from './utils.mjs';

function attrsHtml(attrs = {}) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== false && value != null)
    .map(([key, value]) => value === true ? ` ${esc(key)}` : ` ${esc(key)}="${esc(value)}"`)
    .join('');
}

function classesHtml(parts = []) {
  return parts.filter(Boolean).map((x) => String(x).trim()).filter(Boolean).join(' ');
}

export function uiButtonHtml({
  label,
  type = 'button',
  className = 'ghost',
  id = '',
  attrs = {},
  iconHtml = '',
  iconOnly = false,
  danger = false,
  hidden = false
} = {}) {
  const text = String(label || '');
  const classes = classesHtml([className, iconOnly ? 'icon-action-btn' : '', danger ? 'danger' : '', hidden ? 'hidden' : '']);
  const idAttr = id ? ` id="${esc(id)}"` : '';
  const aria = iconOnly && text ? { 'aria-label': text, title: text, ...attrs } : attrs;
  const body = iconOnly
    ? `${iconHtml}<span class="sr-only">${esc(text)}</span>`
    : `${iconHtml}${esc(text)}`;
  return `<button type="${esc(type)}"${idAttr} class="${esc(classes)}"${attrsHtml(aria)}>${body}</button>`;
}

export function uiIconButtonHtml(options = {}) {
  return uiButtonHtml({ ...options, iconOnly: true });
}

export function statusBadgeHtml(label, tone = 'neutral', className = '') {
  if (!label) return '';
  const toneClass = {
    success: 'success',
    danger: 'danger',
    warning: 'warn',
    warn: 'warn',
    info: 'info',
    neutral: 'neutral'
  }[String(tone || 'neutral')] || 'neutral';
  return `<span class="${esc(classesHtml(['meta-chip', className, toneClass]))}">${esc(label)}</span>`;
}

export function emptyStateHtml({
  state = 'empty',
  eyebrow = '',
  title = '',
  message = '',
  hints = [],
  actions = '',
  compact = false,
  className = ''
} = {}) {
  const hintList = Array.isArray(hints) ? hints.filter(Boolean) : [];
  return `<div class="${esc(classesHtml(['state-block', 'empty-state', compact ? 'state-block-compact' : '', state === 'error' ? 'error' : '', className]))}" data-state="${esc(state)}">
    ${eyebrow ? `<div class="state-block-eyebrow empty-state-eyebrow">${esc(eyebrow)}</div>` : ''}
    ${title ? `<div class="state-block-title empty-state-title">${esc(title)}</div>` : ''}
    ${message ? `<div class="state-block-message muted">${esc(message)}</div>` : ''}
    ${hintList.length ? `<div class="empty-state-hints">${hintList.map((hint) => `<span class="empty-state-hint">${esc(hint)}</span>`).join('')}</div>` : ''}
    ${actions ? `<div class="state-block-actions empty-state-actions">${actions}</div>` : ''}
  </div>`;
}

export function taskProgressHtml({
  status = 'queued',
  progress = '',
  startedAt = '',
  updatedAt = '',
  detail = '',
  actions = ''
} = {}) {
  const fields = [
    ['状态', statusBadgeHtml(String(status || 'unknown'), status === 'succeeded' ? 'success' : status === 'failed' ? 'danger' : status === 'running' ? 'info' : 'neutral')],
    ['进度', esc(progress || '-')],
    startedAt ? ['开始', esc(startedAt)] : null,
    updatedAt ? ['更新', esc(updatedAt)] : null
  ].filter(Boolean);
  return `<div class="task-progress" data-task-status="${esc(status)}">
    ${fields.map(([label, value]) => `<div class="task-progress-field"><span class="muted">${esc(label)}</span><strong>${value}</strong></div>`).join('')}
    ${detail ? `<div class="task-progress-detail muted">${esc(detail)}</div>` : ''}
    ${actions ? `<div class="task-progress-actions">${actions}</div>` : ''}
  </div>`;
}

export function dataListCopyButton(value, label = '内容') {
  if (!value) return '';
  return uiButtonHtml({
    label: '复制',
    className: 'ghost settings-data-copy',
    attrs: {
      'data-settings-copy': value,
      'data-settings-copy-label': label
    }
  });
}

export function dataListHtml(items, { empty = '暂无数据。' } = {}) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="settings-data-empty muted">${esc(empty)}</div>`;
  }
  return items.map((item = {}) => {
    const fields = Array.isArray(item.fields) ? item.fields : [];
    return `<article class="settings-data-item">
      <div class="settings-data-head">
        <div>
          <strong>${esc(item.title || '未命名')}</strong>
          ${item.subtitle ? `<div class="muted">${esc(item.subtitle)}</div>` : ''}
        </div>
        ${statusBadgeHtml(item.status, item.statusTone, 'settings-data-status')}
      </div>
      ${fields.length ? `<div class="settings-data-grid">${fields.map((field = {}) => {
        const label = String(field.label || '');
        const value = field.value == null || field.value === '' ? '-' : String(field.value);
        const content = field.href
          ? `<a href="${esc(safeUrl(field.href))}" target="_blank" rel="noopener">${esc(value)}</a>`
          : `<span class="settings-data-value">${esc(value)}</span>`;
        return `<div class="settings-data-field"><span>${esc(label)}</span><strong>${content}${field.copy ? dataListCopyButton(value, label) : ''}</strong></div>`;
      }).join('')}</div>` : ''}
      ${item.details ? `<details class="settings-data-details"><summary>${esc(item.detailsLabel || '查看详情')}</summary>${item.details}</details>` : ''}
      ${item.actions ? `<div class="settings-data-actions">${item.actions}</div>` : ''}
    </article>`;
  }).join('');
}

export function confirmDialogImpactHtml(impact) {
  if (!impact) return '';
  return `<div class="state-block-title">影响范围</div><div class="state-block-message muted">${esc(impact)}</div>`;
}
