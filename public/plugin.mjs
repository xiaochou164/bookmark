import './js/uiPreferences.mjs';
import { escapeHtml, safeUrl } from './js/utils.mjs';
import { emptyStateHtml, statusBadgeHtml } from './js/uiComponents.mjs';

// plugin.mjs — Chrome ↔ Rainbow 同步页面逻辑

const BASE = '';

async function api(path, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(BASE + path, { ...opts, headers });
    if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
            const j = await resp.json();
            // Backend returns { error: { code, message } } or { message }
            if (j?.error?.message) msg = j.error.message;
            else if (typeof j?.error === 'string') msg = j.error;
            else if (j?.message) msg = j.message;
        } catch (_) { }
        throw new Error(msg);
    }
    const text = await resp.text();
    if (!text) return null;
    return JSON.parse(text);
}

function getToken() {
    try { return JSON.parse(sessionStorage.getItem('rb_session') || '{}').token || ''; } catch (_) { return ''; }
}

function byId(id) { return document.getElementById(id); }

function setStatus(msg, isError = false) {
    const el = byId('pluginPageStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = `settings-status-banner ${isError ? 'danger-banner' : 'muted'}`;
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.setAttribute('aria-live', isError ? 'assertive' : 'polite');
}

function setLastUpdated() {
    const el = byId('pluginLastUpdated');
    if (el) el.textContent = `最后刷新：${new Date().toLocaleTimeString()}`;
}

function stateBlock(title, message, state = 'empty') {
    return emptyStateHtml({
        state,
        eyebrow: '插件状态',
        title,
        message,
        compact: true
    });
}

function asList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.devices)) return payload.devices;
    return [];
}

function renderDevices(payload) {
    const devices = asList(payload);
    const raw = byId('pluginDevicesRaw');
    if (raw) raw.textContent = JSON.stringify(payload, null, 2);
    if (!devices.length) return stateBlock('暂无设备', 'Chrome 扩展注册后会显示设备 ID、名称和最近活跃时间。');
    return devices.map((device) => {
        const name = device.name || device.deviceName || device.id || '未命名设备';
        const status = device.status || device.state || 'unknown';
        const updatedAt = device.lastSeenAt || device.updatedAt || device.createdAt;
        return `<div class="plugin-data-item">
            <div class="plugin-data-item-main">
                <strong>${escapeHtml(name)}</strong>
                <span class="muted">${escapeHtml(device.id || device.deviceId || '')}</span>
            </div>
            ${statusBadgeHtml(status, status === 'online' || status === 'active' ? 'success' : 'neutral')}
            <span class="muted">${updatedAt ? escapeHtml(new Date(Number(updatedAt)).toLocaleString()) : '暂无时间'}</span>
        </div>`;
    }).join('');
}

function renderHealth(payload) {
    const raw = byId('pluginHealthRaw');
    if (raw) raw.textContent = JSON.stringify(payload, null, 2);
    if (!payload || typeof payload !== 'object') return stateBlock('暂无健康数据', '刷新后会显示插件任务队列与调度器状态。');
    const entries = Object.entries(payload).slice(0, 8);
    if (!entries.length) return stateBlock('暂无健康数据', '刷新后会显示插件任务队列与调度器状态。');
    return entries.map(([key, value]) => {
        const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
        const tone = /ok|ready|healthy|true/i.test(text) ? 'success' : /fail|error|false/i.test(text) ? 'danger' : 'neutral';
        return `<div class="plugin-health-card">
            <span class="muted">${escapeHtml(key)}</span>
            <strong>${escapeHtml(text.slice(0, 120))}</strong>
            ${statusBadgeHtml(tone === 'success' ? '正常' : tone === 'danger' ? '异常' : '状态', tone)}
        </div>`;
    }).join('');
}

function renderBookmarkPreview(data) {
    const items = data?.items || [];
    if (!items.length) return stateBlock('暂无云端书签', '同步或导入书签后，这里会按文件夹展示最近条目。');
    const byFolder = {};
    for (const bm of items) {
        const key = Array.isArray(bm.folderPath) && bm.folderPath.length
            ? bm.folderPath.join(' / ')
            : (bm.folderName || 'Rainbow');
        if (!byFolder[key]) byFolder[key] = [];
        byFolder[key].push(bm);
    }
    return Object.entries(byFolder).map(([folder, bms]) => `<section class="plugin-data-group">
        <div class="plugin-data-group-head">
            <strong>${escapeHtml(folder)}</strong>
            ${statusBadgeHtml(String(bms.length), 'neutral')}
        </div>
        ${bms.slice(0, 5).map((bm) => `<a class="plugin-bookmark-link" href="${escapeHtml(safeUrl(bm.url || '#'))}" target="_blank" rel="noreferrer">
            <span>${escapeHtml(bm.title || bm.url || '未命名书签')}</span>
            <small class="muted">${escapeHtml(bm.url || '')}</small>
        </a>`).join('')}
        ${bms.length > 5 ? `<div class="muted">还有 ${bms.length - 5} 条未显示</div>` : ''}
    </section>`).join('');
}

// ── Section navigation ───────────────────────────────────────
const SECTIONS = ['run', 'devices', 'health'];

function activateSection(target) {
    SECTIONS.forEach((key) => {
        const sec = document.querySelector(`[data-plugin-section="${key}"]`);
        const btn = document.querySelector(`[data-plugin-target="${key}"]`);
        const active = key === target;
        if (sec) sec.classList.toggle('settings-section-hidden', !active);
        if (btn) btn.classList.toggle('active', active);
        if (btn) btn.setAttribute('aria-current', active ? 'page' : 'false');
    });
}

function initNav() {
    const hash = (location.hash || '#run').replace('#', '') || 'run';
    const initial = SECTIONS.includes(hash) ? hash : 'run';
    activateSection(initial);

    document.querySelectorAll('[data-plugin-target]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-plugin-target');
            location.hash = target;
            activateSection(target);
        });
    });

    window.addEventListener('hashchange', () => {
        const h = location.hash.replace('#', '') || 'run';
        if (SECTIONS.includes(h)) activateSection(h);
    });
}

async function loadPluginDevices() {
    try {
        byId('pluginDevices').innerHTML = stateBlock('正在刷新设备', '正在读取 Chrome 扩展注册设备。', 'loading');
        const devices = await api('/api/plugins/raindropSync/devices?limit=20');
        byId('pluginDevices').innerHTML = renderDevices(devices);
        setLastUpdated();
    } catch (err) {
        byId('pluginDevices').innerHTML = stateBlock('设备加载失败', err.message, 'error');
    }
}

async function loadPluginHealth() {
    try {
        byId('pluginHealth').innerHTML = stateBlock('正在刷新健康状态', '正在读取任务队列与调度器状态。', 'loading');
        const health = await api('/api/plugins/raindropSync/health');
        byId('pluginHealth').innerHTML = renderHealth(health);
        setLastUpdated();
    } catch (err) {
        byId('pluginHealth').innerHTML = stateBlock('健康状态加载失败', err.message, 'error');
    }
}

async function refreshAll() {
    setStatus('正在刷新全部数据...');
    await Promise.all([
        loadPluginDevices(),
        loadPluginHealth()
    ]);
    setStatus('数据已刷新');
}

// ── Init ──────────────────────────────────────────────────────
function bindEvents() {
    byId('pluginDevicesBtn')?.addEventListener('click', loadPluginDevices);
    byId('pluginHealthBtn')?.addEventListener('click', loadPluginHealth);
    byId('pluginRefreshAllBtn')?.addEventListener('click', refreshAll);

    // Chrome ↔ Rainbow DB sync info panel
    byId('loadDbBookmarksBtn')?.addEventListener('click', async () => {
        const summaryEl = byId('dbBookmarksSummary');
        const outputEl = byId('dbBookmarksOutput');
        if (summaryEl) summaryEl.textContent = '正在加载...';
        if (outputEl) outputEl.innerHTML = stateBlock('正在读取云端书签', '正在按文件夹整理最近的同步数据。', 'loading');
        try {
            const data = await api('/api/chrome-sync/bookmarks');
            const items = data?.items || [];
            if (summaryEl) {
                const folderCount = new Set(items.map((bm) => Array.isArray(bm.folderPath) && bm.folderPath.length ? bm.folderPath.join(' / ') : (bm.folderName || 'Rainbow'))).size;
                summaryEl.innerHTML = `共 <strong>${items.length}</strong> 条书签，分布在 <strong>${folderCount}</strong> 个文件夹`;
            }
            if (outputEl) outputEl.innerHTML = renderBookmarkPreview(data);
            setLastUpdated();
        } catch (err) {
            const errMsg = err?.message || String(err);
            if (summaryEl) summaryEl.textContent = `加载失败: ${errMsg}`;
            if (outputEl) outputEl.innerHTML = stateBlock('云端书签加载失败', errMsg, 'error');
        }
    });

}

async function init() {
    initNav();
    bindEvents();
    setStatus('正在加载同步页面...');
    try {
        await Promise.all([
            loadPluginDevices(),
            loadPluginHealth()
        ]);
        setStatus('同步页面已就绪');
    } catch (err) {
        setStatus(`加载失败: ${err.message}`, true);
    }
}

init();
