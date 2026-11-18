import { esc, sanitizePublicUrl } from './bookmarkPresentation.mjs';

export function renderPublicCollectionHtml(payload = {}) {
  const bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(payload.link.title || '共享集合')}</title>
  <meta name="theme-color" content="#1194ff" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.svg" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="auth-page">
  <main class="public-share-shell">
    <section class="public-share-hero">
      <div class="brand"><div class="brand-dot"></div><div><strong>Rainbow</strong><small>公开收藏页</small></div></div>
      <h1>${esc(payload.link.title || '共享集合')}</h1>
      <p class="muted">${esc(payload.link.description || '')}</p>
      <div class="public-share-meta">
        <span class="meta-chip type">${esc(payload.folder.name || '集合')}</span>
        <span class="meta-chip">${bookmarks.length} 条</span>
      </div>
      <div class="public-ai-guide">
        <div class="public-ai-guide-summary">${esc(payload.aiGuide.summary || '')}</div>
        ${payload.aiGuide.tags.length ? `<div class="public-ai-guide-tags">${payload.aiGuide.tags.slice(0, 8).map((tag) => `<span class="meta-chip">#${esc(tag.tag)}</span>`).join('')}</div>` : ''}
        ${payload.aiGuide.faq.length ? `<div class="public-ai-guide-faq">${payload.aiGuide.faq.slice(0, 2).map((row) => `<details><summary>${esc(row.q)}</summary><p>${esc(row.a)}</p></details>`).join('')}</div>` : ''}
      </div>
    </section>
    <section class="public-share-content">
      <div class="public-share-toolbar">
        <input id="pubSearch" type="search" placeholder="搜索公开书签" aria-label="搜索公开书签" />
        <select id="pubSort" aria-label="公开书签排序">
          <option value="newest">最新收藏</option>
          <option value="title">标题 A-Z</option>
          <option value="host">域名 A-Z</option>
        </select>
      </div>
      <div id="pubList" class="cards public-share-grid">
        ${bookmarks.length ? bookmarks.map((item) => {
          const cover = String(item.cover || item.metadata?.image || '').trim();
          const tags = Array.isArray(item.tags) ? item.tags.slice(0, 4) : [];
          const host = (() => { try { return new URL(item.url).hostname; } catch { return '网页'; } })();
          const title = item.title || '(未命名)';
          return `<article class="card public-share-card" data-title="${esc(title).toLowerCase()}" data-host="${esc(host).toLowerCase()}" data-tags="${esc(tags.join(' ')).toLowerCase()}" data-created="${esc(item.createdAt || 0)}">
            ${cover ? `<div class="card-cover"><img src="${esc(sanitizePublicUrl(cover))}" alt="${esc(title)}" loading="lazy" /></div>` : `<div class="card-cover public-cover-fallback" aria-hidden="true">${esc((host || 'RB').slice(0, 2).toUpperCase())}</div>`}
            <div class="card-top"><a class="host" href="${esc(sanitizePublicUrl(item.url))}" target="_blank" rel="noopener">${esc(host)}</a></div>
            <div class="card-body">
              <h2 class="card-title"><a class="card-title-link" href="${esc(sanitizePublicUrl(item.url))}" target="_blank" rel="noopener">${esc(title)}</a></h2>
              ${item.note ? `<div class="card-note">${esc(item.note)}</div>` : ''}
              ${tags.length ? `<div class="card-tags">${tags.map((tag) => `<span class="card-tag">#${esc(tag)}</span>`).join('')}</div>` : ''}
              <div class="card-actions"><a class="ghost button-link" href="${esc(sanitizePublicUrl(item.url))}" target="_blank" rel="noopener">打开</a></div>
            </div>
          </article>`;
        }).join('') : '<div class="state-block"><div class="state-block-title">这个公开集合暂无书签</div><div class="state-block-message muted">稍后再回来看看。</div></div>'}
      </div>
      <div id="pubEmptyFiltered" class="state-block state-block-compact hidden" data-state="empty">
        <div class="state-block-title">没有匹配的书签</div>
        <div class="state-block-message muted">换个关键词或排序方式再试试。</div>
      </div>
      <button type="button" id="pubBackTop" class="ghost public-share-backtop">返回顶部</button>
    </section>
  </main>
  <script type="application/json" id="pubLegacyInlineDisabled">
    (function(){
      var list = document.getElementById('pubList');
      var empty = document.getElementById('pubEmptyFiltered');
      var search = document.getElementById('pubSearch');
      var sort = document.getElementById('pubSort');
      if (!list || !search || !sort) return;
      list.querySelectorAll('img').forEach(function(img){
        img.addEventListener('error', function(){
          var cover = img.closest('.card-cover');
          if (cover) {
            cover.classList.add('image-error');
            cover.textContent = '封面不可用';
          }
        }, { once: true });
      });
      function apply(){
        var q = String(search.value || '').trim().toLowerCase();
        var mode = sort.value || 'newest';
        var cards = Array.prototype.slice.call(list.querySelectorAll('.public-share-card'));
        cards.forEach(function(card){
          var haystack = [card.dataset.title, card.dataset.host, card.dataset.tags].join(' ');
          card.classList.toggle('hidden', q && haystack.indexOf(q) === -1);
        });
        var visible = cards.filter(function(card){ return !card.classList.contains('hidden'); });
        visible.sort(function(a, b){
          if (mode === 'title') return a.dataset.title.localeCompare(b.dataset.title);
          if (mode === 'host') return a.dataset.host.localeCompare(b.dataset.host);
          return Number(b.dataset.created || 0) - Number(a.dataset.created || 0);
        }).forEach(function(card){ list.appendChild(card); });
        if (empty) empty.classList.toggle('hidden', q && visible.length === 0);
      }
      search.addEventListener('input', apply);
      sort.addEventListener('change', apply);
      document.getElementById('pubBackTop')?.addEventListener('click', function(){ window.scrollTo({ top: 0, behavior: 'smooth' }); });
    })();
  </script>
  <script type="module" src="/public-share.mjs"></script>
</body>
</html>`;
}
