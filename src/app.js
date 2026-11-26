{
  const pad = n => String(n).padStart(2, '0');
  const iso = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const now = new Date(), today = iso(now);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const root = document.body.dataset.root || '';

  // Hide shows that have already happened (the site is rebuilt daily, this covers the gap).
  document.querySelectorAll('[data-date]').forEach(el => {
    if (el.dataset.date < today) { if (el.classList.contains('stub') || el.classList.contains('gig')) el.remove(); else el.classList.add('past'); }
  });

  // Ticket-stub carousel arrows.
  const stubs = document.querySelector('.stubs');
  if (stubs) {
    const go = n => stubs.scrollBy({left: n * stubs.clientWidth * 0.8, behavior: 'smooth'});
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(+b.dataset.go)));
    stubs.addEventListener('keydown', ev => { if (ev.key === 'ArrowRight') go(1); if (ev.key === 'ArrowLeft') go(-1); });
  }

  // Tours page city filter.
  const tf = document.querySelector('.filters[aria-label="Filter by city"]');
  if (tf) tf.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    tf.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    const c = b.dataset.city;
    document.querySelectorAll('.tour').forEach(tr => {
      const rows = [...tr.querySelectorAll('tbody tr')];
      let any = !rows.length && (c === 'all' || tr.dataset.cities.includes(c));
      rows.forEach(r => { const ok = c === 'all' || r.dataset.city === c; r.hidden = !ok; if (ok) any = true; });
      tr.hidden = !any;
    });
  });

  // Gig guide: search and filter every show from gigs.json.
  const guide = document.getElementById('guide');
  if (guide) {
    const q = document.getElementById('q'), city = document.getElementById('city'), out = document.getElementById('results');
    const count = document.getElementById('count'), more = document.getElementById('moreBtn');
    const params = new URLSearchParams(location.search);
    q.value = params.get('q') || ''; if (params.get('city')) city.value = params.get('city');
    let when = 'all', shown = 80, all = [];
    const addDays = n => { const x = new Date(now); x.setDate(x.getDate() + n); return iso(x); };
    const weekend = () => { const dow = now.getDay(); return [[5, 6, 0].includes(dow) ? today : addDays(5 - dow), addDays((7 - dow) % 7)]; };
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const longM = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    function render() {
      const term = q.value.trim().toLowerCase(), c = city.value;
      let lo = today, hi = '9999';
      if (when === 'week') hi = addDays(7); else if (when === 'month') hi = addDays(30); else if (when === 'weekend') [lo, hi] = weekend();
      const list = all.filter(s => s[0] >= lo && s[0] <= hi && (!c || s[6] === c) &&
        (!term || (s[2] + ' ' + s[4] + ' ' + s[5] + ' ' + s[6] + ' ' + s[8]).toLowerCase().includes(term)));
      count.textContent = list.length ? `${list.length.toLocaleString()} ${list.length === 1 ? 'show' : 'shows'}` : 'No shows match. Try a different search or date.';
      let html = '', month = '';
      for (const s of list.slice(0, shown)) {
        const [y, m, dd] = s[0].split('-').map(Number);
        const mk = longM[m - 1] + ' ' + y;
        if (mk !== month) { html += (month ? '</ul>' : '') + `<h3 class="month">${mk}</h3><ul class="gigs">`; month = mk; }
        const day = new Date(y, m - 1, dd).toLocaleDateString('en-AU', {weekday: 'short'});
        html += `<li class="gig"><div class="gd"><b>${dd}</b><small>${months[m - 1]}</small></div><div class="gi"><a class="gname" href="${root}artists/${esc(s[3])}.html">${esc(s[2])}</a>` +
          (s[8] ? `<span class="gsup">with ${esc(s[8])}</span>` : '') + `<span class="gw">${esc(s[4])}, ${esc(s[6])} · ${day}${s[1] ? ' ' + esc(s[1]) : ''}</span></div>` +
          `<div class="ga"><a href="${esc(s[7])}" rel="noopener">${s[9] === 'ticketmaster' ? 'Tickets' : 'Details'} ↗</a><a class="cal" href="${esc(s[10])}" rel="noopener">+ Calendar</a></div></li>`;
      }
      out.innerHTML = html + (month ? '</ul>' : '');
      more.hidden = list.length <= shown;
    }
    guide.querySelector('.filters').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      guide.querySelectorAll('.filters button').forEach(x => x.setAttribute('aria-pressed', x === b));
      when = b.dataset.when; shown = 80; render();
    });
    let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { shown = 80; render(); }, 120); });
    city.addEventListener('change', () => { shown = 80; render(); });
    more.addEventListener('click', () => { shown += 120; render(); });
    fetch(root + 'gigs.json').then(r => r.json()).then(d => { all = d; render(); })
      .catch(() => { count.textContent = 'Could not load the gig list. Try refreshing the page.'; });
  }
}
