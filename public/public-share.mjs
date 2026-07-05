const $ = (id) => document.getElementById(id);

function esc(input = '') {
  return String(input == null ? '' : input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(input = '') {
  const value = String(input || '').trim();
  if (!value) return 'about:blank';
  if (value.startsWith('/') || value.startsWith('#')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `unsafe:${value}`;
}

function hostOf(input = '') {
  try {
    return new URL(input).hostname;
  } catch {
    return '';
  }
}

function tokenFromPath() {
  const raw = window.location.pathname.replace(/^\/public\/c\//, '').replace(/\.json$/, '');
  return decodeURIComponent(raw || '');
}

function bindImageFallbacks(root) {
  root.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      const cover = img.closest('.card-cover');
      if (!cover) return;
      cover.classList.add('image-error');
      cover.textContent = '封面不可用';
    }, { once: true });
  });
}

function renderItems(items = []) {
  const list = $('pubList');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="state-block"><div class="state-block-title">这个公开集合暂无书签</div><div class="state-block-message muted">稍后再回来看看，或联系分享者更新内容。</div></div>';
    return;
  }
  list.innerHTML = items.map((item) => {
    const host = hostOf(item.url);
    const cover = String(item.cover || item.metadata?.image || '').trim();
    const tags = Array.isArray(item.tags) ? item.tags.slice(0, 4) : [];
    const excerpt = String(item.note || item.metadata?.description || '').trim();
    const title = item.title || '(未命名)';
    return `<article class="card public-share-card" data-title="${esc(title).toLowerCase()}" data-host="${esc(host).toLowerCase()}" data-tags="${esc(tags.join(' ')).toLowerCase()}" data-created="${esc(item.createdAt || 0)}">
      ${cover ? `<div class="card-cover"><img src="${esc(safeUrl(cover))}" alt="${esc(title)}" loading="lazy" /></div>` : `<div class="card-cover public-cover-fallback" aria-hidden="true">${esc((host || 'RB').slice(0, 2).toUpperCase())}</div>`}
      <div class="card-top"><a class="host" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener">${esc(host || '网页')}</a></div>
      <div class="card-body">
        <h2 class="card-title"><a class="card-title-link" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener">${esc(title)}</a></h2>
        ${excerpt ? `<div class="card-note">${esc(excerpt)}</div>` : ''}
        ${tags.length ? `<div class="card-tags">${tags.map((tag) => `<span class="card-tag">#${esc(tag)}</span>`).join('')}</div>` : ''}
        <div class="card-actions"><a class="ghost button-link" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener">打开</a></div>
      </div>
    </article>`;
  }).join('');
  bindImageFallbacks(list);
}

function renderAiGuide(guide) {
  const root = $('pubAiGuide');
  if (!root || !guide) return;
  const tags = Array.isArray(guide.tags) ? guide.tags : [];
  const faq = Array.isArray(guide.faq) ? guide.faq : [];
  const recs = Array.isArray(guide.recommendations) ? guide.recommendations : [];
  root.innerHTML = `<div class="public-ai-guide-summary">${esc(guide.summary || '')}</div>`
    + (tags.length ? `<div class="public-ai-guide-tags">${tags.slice(0, 8).map((tag) => `<span class="meta-chip">#${esc(tag.tag || tag)}</span>`).join('')}</div>` : '')
    + (faq.length ? `<div class="public-ai-guide-faq">${faq.slice(0, 3).map((row) => `<details><summary>${esc(row.q || '')}</summary><p>${esc(row.a || '')}</p></details>`).join('')}</div>` : '')
    + (recs.length ? `<div class="public-ai-guide-recs">${recs.map((rec) => `<a class="ghost button-link" href="${esc(safeUrl(rec.url))}" target="_blank" rel="noopener">${esc(rec.title || '推荐')}</a>`).join('')}</div>` : '');
}

function applyPublicFilters() {
  const list = $('pubList');
  if (!list) return;
  const q = String($('pubSearch')?.value || '').trim().toLowerCase();
  const sort = $('pubSort')?.value || 'newest';
  const cards = [...list.querySelectorAll('.public-share-card')];
  cards.forEach((card) => {
    const haystack = [card.dataset.title, card.dataset.host, card.dataset.tags].join(' ');
    card.classList.toggle('hidden', Boolean(q) && !haystack.includes(q));
  });
  const visible = cards.filter((card) => !card.classList.contains('hidden'));
  visible.sort((a, b) => {
    if (sort === 'title') return a.dataset.title.localeCompare(b.dataset.title);
    if (sort === 'host') return a.dataset.host.localeCompare(b.dataset.host);
    return Number(b.dataset.created || 0) - Number(a.dataset.created || 0);
  }).forEach((card) => list.appendChild(card));
  let empty = $('pubEmptyFiltered');
  if (!empty) {
    empty = document.createElement('div');
    empty.id = 'pubEmptyFiltered';
    empty.className = 'state-block state-block-compact hidden';
    empty.dataset.state = 'empty';
    empty.innerHTML = '<div class="state-block-title">没有匹配的书签</div><div class="state-block-message muted">换个关键词或排序方式再试试。</div>';
    list.after(empty);
  }
  empty.classList.toggle('hidden', !(q && visible.length === 0));
}

async function init() {
  const token = tokenFromPath();
  const status = $('pubStatus');
  const list = $('pubList');
  const folderBadge = $('pubFolderBadge');
  const countBadge = $('pubCountBadge');
  $('pubSearch')?.addEventListener('input', applyPublicFilters);
  $('pubSort')?.addEventListener('change', applyPublicFilters);
  $('pubBackTop')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  if (!token || !list) return;
  try {
    const resp = await fetch(`/public/c/${encodeURIComponent(token)}.json`);
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data?.error?.message || '加载失败');
    if ($('pubTitle')) $('pubTitle').textContent = data.link?.title || '共享集合';
    if ($('pubDesc')) $('pubDesc').textContent = data.link?.description || '';
    if (folderBadge) {
      folderBadge.textContent = data.folder?.name || '共享集合';
      if (data.folder?.color) {
        folderBadge.style.borderColor = data.folder.color;
        folderBadge.style.boxShadow = `inset 0 0 0 1px ${data.folder.color}33`;
      }
    }
    renderItems(data.bookmarks || []);
    renderAiGuide(data.aiGuide || null);
    if (countBadge) countBadge.textContent = `${(data.bookmarks || []).length} 条`;
    if (status) status.textContent = '已加载公开集合';
  } catch (err) {
    if (status) status.textContent = `加载共享集合失败：${err.message || err}`;
    list.innerHTML = `<div class="state-block" data-state="error"><div class="state-block-title">公开集合加载失败</div><div class="state-block-message muted">${esc(err.message || err)}</div></div>`;
  }
}

init();
