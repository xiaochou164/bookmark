// plugin.mjs — Chrome ↔ Rainboard 同步页面逻辑

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
    });
}

function initNav() {
    const hash = (location.hash || '#config').replace('#', '') || 'config';
    const initial = SECTIONS.includes(hash) ? hash : 'config';
    activateSection(initial);

    document.querySelectorAll('[data-plugin-target]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-plugin-target');
            location.hash = target;
            activateSection(target);
        });
    });

    window.addEventListener('hashchange', () => {
        const h = location.hash.replace('#', '') || 'config';
        if (SECTIONS.includes(h)) activateSection(h);
    });
}

async function loadPluginDevices() {
    try {
        const devices = await api('/api/plugins/raindropSync/devices?limit=20');
        byId('pluginDevices').textContent = JSON.stringify(devices, null, 2);
    } catch (err) {
        byId('pluginDevices').textContent = err.message;
    }
}

async function loadPluginHealth() {
    try {
        const health = await api('/api/plugins/raindropSync/health');
        byId('pluginHealth').textContent = JSON.stringify(health, null, 2);
    } catch (err) {
        byId('pluginHealth').textContent = err.message;
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

    // Chrome ↔ Rainboard DB sync info panel
    byId('loadDbBookmarksBtn')?.addEventListener('click', async () => {
        const summaryEl = byId('dbBookmarksSummary');
        const outputEl = byId('dbBookmarksOutput');
        if (summaryEl) summaryEl.textContent = '正在加载...';
        try {
            const data = await api('/api/chrome-sync/bookmarks');
            const items = data?.items || [];
            // Group by folderName
            const byFolder = {};
            for (const bm of items) {
                const key = bm.folderName || 'Rainboard';
                if (!byFolder[key]) byFolder[key] = [];
                byFolder[key].push(bm);
            }
            if (summaryEl) {
                summaryEl.innerHTML = `共 <strong>${items.length}</strong> 条书签，分布在 <strong>${Object.keys(byFolder).length}</strong> 个文件夹`;
            }
            if (outputEl) {
                const lines = [];
                for (const [folder, bms] of Object.entries(byFolder)) {
                    lines.push(`📁 ${folder} (${bms.length})`);
                    for (const bm of bms.slice(0, 5)) {
                        lines.push(`   • ${bm.title} — ${bm.url}`);
                    }
                    if (bms.length > 5) lines.push(`   ... 还有 ${bms.length - 5} 条`);
                }
                outputEl.textContent = lines.join('\n');
            }
        } catch (err) {
            const errMsg = err?.message || String(err);
            if (summaryEl) summaryEl.textContent = `加载失败: ${errMsg}`;
            if (outputEl) outputEl.textContent = errMsg;
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
