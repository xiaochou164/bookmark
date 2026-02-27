// plugin.mjs — Raindrop 同步插件独立页面逻辑

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
const SECTIONS = ['config', 'scheduler', 'run', 'history', 'audit', 'devices', 'health'];

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

// ── Plugin config ─────────────────────────────────────────────
async function loadPluginConfig() {
    try {
        const config = await api('/api/plugins/raindropSync/config');
        byId('pluginToken').value = config.raindropToken || '';
        byId('pluginTopLevel').checked = Boolean(config.topLevelAutoSync);
        byId('pluginMappings').value = JSON.stringify(config.mappings || [], null, 2);
        byId('pluginOutput').textContent = '配置已加载';
    } catch (err) {
        byId('pluginOutput').textContent = `加载失败: ${err.message}`;
    }
}

async function savePluginConfig() {
    try {
        let mappings;
        try { mappings = JSON.parse(byId('pluginMappings').value || '[]'); }
        catch (_) { throw new Error('映射 JSON 格式错误，请检查后重试'); }
        const payload = {
            raindropToken: byId('pluginToken').value.trim(),
            topLevelAutoSync: byId('pluginTopLevel').checked,
            mappings
        };
        const out = await api('/api/plugins/raindropSync/config', {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
        setStatus('配置已保存');
    } catch (err) {
        byId('pluginOutput').textContent = err.message;
        setStatus(err.message, true);
    }
}

// ── Scheduler ─────────────────────────────────────────────────
function pluginSchedulePayload() {
    return {
        enabled: byId('pluginScheduleEnabled').checked,
        paused: byId('pluginSchedulePaused').checked,
        intervalMinutes: Number(byId('pluginScheduleInterval').value || 15),
        maxConcurrent: Number(byId('pluginScheduleMaxConcurrent').value || 1),
        windowEnabled: byId('pluginScheduleWindowEnabled').checked,
        windowStartHour: Number(byId('pluginScheduleWindowStart').value || 0),
        windowEndHour: Number(byId('pluginScheduleWindowEnd').value || 24)
    };
}

function applyPluginScheduleToForm(schedule = {}) {
    byId('pluginScheduleEnabled').checked = Boolean(schedule.enabled);
    byId('pluginSchedulePaused').checked = Boolean(schedule.paused);
    byId('pluginScheduleInterval').value = String(Number(schedule.intervalMinutes || 15));
    byId('pluginScheduleMaxConcurrent').value = String(Number(schedule.maxConcurrent || 1));
    byId('pluginScheduleWindowEnabled').checked = Boolean(schedule.windowEnabled);
    byId('pluginScheduleWindowStart').value = String(Number(schedule.windowStartHour ?? 0));
    byId('pluginScheduleWindowEnd').value = String(Number(schedule.windowEndHour ?? 24));
}

async function loadPluginSchedule() {
    try {
        const schedule = await api('/api/plugins/raindropSync/schedule');
        applyPluginScheduleToForm(schedule);
        byId('pluginScheduleOutput').textContent = JSON.stringify(schedule, null, 2);
    } catch (err) {
        byId('pluginScheduleOutput').textContent = err.message;
    }
}

async function savePluginSchedule() {
    try {
        const out = await api('/api/plugins/raindropSync/schedule', {
            method: 'PUT',
            body: JSON.stringify(pluginSchedulePayload())
        });
        byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
    } catch (err) {
        byId('pluginScheduleOutput').textContent = err.message;
    }
}

// ── Task polling ──────────────────────────────────────────────
let pluginTaskPollTimer = null;
const OUTPUT_ID = 'pluginRunOutput';

function stopPluginTaskPolling() {
    if (pluginTaskPollTimer) { clearTimeout(pluginTaskPollTimer); pluginTaskPollTimer = null; }
}

async function pollPluginTask(taskId) {
    stopPluginTaskPolling();
    const tick = async () => {
        try {
            const task = await api(`/api/plugins/raindropSync/tasks/${encodeURIComponent(taskId)}`);
            byId(OUTPUT_ID).textContent = JSON.stringify({ task }, null, 2);
            if (task.status === 'queued' || task.status === 'running') {
                pluginTaskPollTimer = setTimeout(() => tick().catch((err) => {
                    byId(OUTPUT_ID).textContent = err.message;
                }), 1500);
                return;
            }
            stopPluginTaskPolling();
            await Promise.all([loadPluginAudit(), loadPluginDevices(), loadPluginHealth(), loadPluginRuns()]);
        } catch (err) {
            stopPluginTaskPolling();
            byId(OUTPUT_ID).textContent = err.message;
        }
    };
    await tick();
}

async function fetchPluginTasks(limit = 20) {
    const resp = await api(`/api/plugins/raindropSync/tasks?limit=${Number(limit) || 20}`);
    return Array.isArray(resp?.items) ? resp.items : [];
}

// ── Load helpers ──────────────────────────────────────────────
async function loadPluginRuns() {
    try {
        const [runs, tasks] = await Promise.all([
            api('/api/plugins/raindropSync/runs?limit=20'),
            api('/api/plugins/raindropSync/tasks?limit=20')
        ]);
        byId('pluginHistory').textContent = JSON.stringify({ tasks, runs }, null, 2);
    } catch (err) {
        byId('pluginHistory').textContent = err.message;
    }
}

async function loadPluginAudit() {
    try {
        const audit = await api('/api/plugins/raindropSync/audit');
        byId('pluginAudit').textContent = JSON.stringify(audit, null, 2);
    } catch (err) {
        byId('pluginAudit').textContent = err.message;
    }
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
        loadPluginConfig(),
        loadPluginSchedule(),
        loadPluginAudit(),
        loadPluginDevices(),
        loadPluginHealth(),
        loadPluginRuns()
    ]);
    setStatus('数据已刷新');
}

// ── Init ──────────────────────────────────────────────────────
function bindEvents() {
    byId('savePluginCfgBtn')?.addEventListener('click', savePluginConfig);
    byId('pluginLoadConfigBtn')?.addEventListener('click', async () => {
        await loadPluginConfig();
        setStatus('配置已重新加载');
    });

    byId('pluginScheduleLoadBtn')?.addEventListener('click', loadPluginSchedule);
    byId('pluginScheduleSaveBtn')?.addEventListener('click', savePluginSchedule);

    byId('pluginSchedulePauseBtn')?.addEventListener('click', async () => {
        try {
            const out = await api('/api/plugins/raindropSync/schedule/pause', { method: 'POST', body: '{}' });
            byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
            await loadPluginSchedule();
        } catch (err) { byId('pluginScheduleOutput').textContent = err.message; }
    });

    byId('pluginScheduleResumeBtn')?.addEventListener('click', async () => {
        try {
            const out = await api('/api/plugins/raindropSync/schedule/resume', { method: 'POST', body: '{}' });
            byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
            await loadPluginSchedule();
        } catch (err) { byId('pluginScheduleOutput').textContent = err.message; }
    });

    byId('pluginScheduleTickBtn')?.addEventListener('click', async () => {
        try {
            const out = await api('/api/plugins/raindropSync/schedule/tick', {
                method: 'POST', body: JSON.stringify({ force: true })
            });
            byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
            await Promise.all([loadPluginSchedule(), loadPluginAudit(), loadPluginHealth(), loadPluginRuns()]);
            const taskId = out?.results?.[0]?.task?.id;
            if (taskId) await pollPluginTask(taskId);
        } catch (err) { byId('pluginScheduleOutput').textContent = err.message; }
    });

    byId('runPluginBtn')?.addEventListener('click', async () => {
        try {
            byId(OUTPUT_ID).textContent = '正在提交同步任务...';
            const out = await api('/api/plugins/raindropSync/tasks', {
                method: 'POST',
                body: JSON.stringify({ kind: 'run', input: {} })
            });
            byId(OUTPUT_ID).textContent = JSON.stringify(out, null, 2);
            await Promise.all([loadPluginAudit(), loadPluginDevices(), loadPluginHealth(), loadPluginRuns()]);
            if (out?.task?.id) await pollPluginTask(out.task.id);
        } catch (err) { byId(OUTPUT_ID).textContent = err.message; }
    });

    byId('previewPluginBtn')?.addEventListener('click', async () => {
        try {
            byId(OUTPUT_ID).textContent = '预演中...';
            const out = await api('/api/plugins/raindropSync/preview', { method: 'POST', body: '{}' });
            byId(OUTPUT_ID).textContent = JSON.stringify(out, null, 2);
            await Promise.all([loadPluginAudit(), loadPluginDevices(), loadPluginHealth(), loadPluginRuns()]);
        } catch (err) { byId(OUTPUT_ID).textContent = err.message; }
    });

    byId('pluginRetryBtn')?.addEventListener('click', async () => {
        try {
            const tasks = await fetchPluginTasks(30);
            const latestFailed = tasks.find((t) => t.status === 'failed');
            if (!latestFailed) { byId(OUTPUT_ID).textContent = '没有可重试的失败任务'; return; }
            const out = await api(`/api/plugins/raindropSync/tasks/${encodeURIComponent(latestFailed.id)}/retry`, {
                method: 'POST', body: '{}'
            });
            byId(OUTPUT_ID).textContent = JSON.stringify(out, null, 2);
            await Promise.all([loadPluginRuns(), loadPluginAudit(), loadPluginDevices(), loadPluginHealth()]);
            if (out?.task?.id) await pollPluginTask(out.task.id);
        } catch (err) { byId(OUTPUT_ID).textContent = err.message; }
    });

    byId('pluginReplayBtn')?.addEventListener('click', async () => {
        try {
            const tasks = await fetchPluginTasks(30);
            const latest = tasks[0];
            if (!latest) { byId(OUTPUT_ID).textContent = '没有可重放的任务'; return; }
            const out = await api(`/api/plugins/raindropSync/tasks/${encodeURIComponent(latest.id)}/replay`, {
                method: 'POST', body: '{}'
            });
            byId(OUTPUT_ID).textContent = JSON.stringify(out, null, 2);
            await Promise.all([loadPluginRuns(), loadPluginAudit(), loadPluginDevices(), loadPluginHealth()]);
            if (out?.task?.id) await pollPluginTask(out.task.id);
        } catch (err) { byId(OUTPUT_ID).textContent = err.message; }
    });

    byId('pluginHistoryBtn')?.addEventListener('click', loadPluginRuns);
    byId('pluginAuditBtn')?.addEventListener('click', loadPluginAudit);
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
    setStatus('正在加载插件配置...');
    try {
        await Promise.all([
            loadPluginConfig(),
            loadPluginSchedule(),
            loadPluginAudit(),
            loadPluginDevices(),
            loadPluginHealth(),
            loadPluginRuns()
        ]);
        setStatus('插件数据已就绪');
    } catch (err) {
        setStatus(`加载失败: ${err.message}`, true);
    }
}

init();
