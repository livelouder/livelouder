// Remembers the visitor's city (on this device only) so the site shows their gigs first.
window.LL = (function () {
  const zones = {'Australia/Perth': 'Perth', 'Australia/Adelaide': 'Adelaide', 'Australia/Darwin': 'Darwin', 'Australia/Brisbane': 'Brisbane',
    'Australia/Lindeman': 'Brisbane', 'Australia/Hobart': 'Hobart', 'Australia/Melbourne': 'Melbourne', 'Australia/Sydney': 'Sydney',
    'Australia/Canberra': 'Canberra', 'Australia/ACT': 'Canberra', 'Pacific/Auckland': 'Auckland'};
  const get = () => { try { return localStorage.getItem('llCity') || ''; } catch (e) { return ''; } };
  const guess = () => { try { return zones[Intl.DateTimeFormat().resolvedOptions().timeZone] || ''; } catch (e) { return ''; } };
  return {city: get, guess: guess, setCity: c => { try { localStorage.setItem('llCity', c); } catch (e) {} }};
})();
// Mobile menu.
{
  const btn = document.querySelector('.top .menu'), top = document.querySelector('.top');
  if (btn) btn.addEventListener('click', () => { const open = top.classList.toggle('open'); btn.setAttribute('aria-expanded', open); });
}
// Pre-fill the city on the newsletter signup.
{
  const c = LL.city() || LL.guess();
  document.querySelectorAll('form[name="newsletter"] select[name="city"]').forEach(sel => {
    if (c && [...sel.options].some(o => o.value === c || o.text === c)) sel.value = c;
  });
}
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
    const genre = document.getElementById('genre');
    const count = document.getElementById('count'), more = document.getElementById('moreBtn');
    const params = new URLSearchParams(location.search);
    q.value = params.get('q') || ''; if (params.get('city')) city.value = params.get('city');
    else if (!params.get('q') && window.LL && LL.city() && [...city.options].some(o => o.value === LL.city())) city.value = LL.city();
    if (genre && params.get('genre')) genre.value = params.get('genre');
    let when = 'all', shown = 80, all = [];
    const addDays = n => { const x = new Date(now); x.setDate(x.getDate() + n); return iso(x); };
    const weekend = () => { const dow = now.getDay(); return [[5, 6, 0].includes(dow) ? today : addDays(5 - dow), addDays((7 - dow) % 7)]; };
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const longM = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    function render() {
      const term = q.value.trim().toLowerCase(), c = city.value, g = genre ? genre.value : '';
      let lo = today, hi = '9999';
      if (when === 'week') hi = addDays(7); else if (when === 'month') hi = addDays(30); else if (when === 'weekend') [lo, hi] = weekend();
      const list = all.filter(s => s[0] >= lo && s[0] <= hi && (!c || s[6] === c) && (!g || s[12] === g) &&
        (!term || (s[2] + ' ' + s[4] + ' ' + s[5] + ' ' + s[6] + ' ' + s[8]).toLowerCase().includes(term)));
      count.textContent = list.length ? `${list.length.toLocaleString()} ${list.length === 1 ? 'show' : 'shows'}` : 'No shows match. Try a different search or date.';
      let html = '', month = '';
      for (const s of list.slice(0, shown)) {
        const [y, m, dd] = s[0].split('-').map(Number);
        const mk = longM[m - 1] + ' ' + y;
        if (mk !== month) { html += (month ? '</ul>' : '') + `<h3 class="month">${mk}</h3><ul class="gigs">`; month = mk; }
        const day = new Date(y, m - 1, dd).toLocaleDateString('en-AU', {weekday: 'short'});
        html += `<li class="gig"><div class="gd"><b>${dd}</b><small>${months[m - 1]}</small></div><div class="gi"><a class="gname" href="${root}artists/${esc(s[3])}.html">${esc(s[2])}</a>` +
          (s[8] ? `<span class="gsup">with ${esc(s[8])}</span>` : '') + `<span class="gw"><a class="vlink" href="${root}venues/${esc(s[11])}.html">${esc(s[4])}</a>, ${esc(s[6])} · ${day}${s[1] ? ' ' + esc(s[1]) : ''}</span></div>` +
          `<div class="ga"><a href="${esc(s[7])}" rel="noopener">${['ticketmaster', 'submitted'].includes(s[9]) ? 'Tickets' : 'Details'} ↗</a><span class="ga2"><a class="cal" href="${esc(s[10])}" rel="noopener">+ Calendar</a>` +
          `<button class="save" type="button" data-gig="${esc(JSON.stringify({id: s[13], d: s[0], tm: s[1], a: s[2], s: s[3], v: s[4], c: s[6], u: s[7], vs: s[11]}))}" aria-pressed="false" title="Save to My gigs" aria-label="Save to My gigs">♡</button></span></div></li>`;
      }
      out.innerHTML = html + (month ? '</ul>' : '');
      if (window.MY) MY.paint();
      more.hidden = list.length <= shown;
    }
    guide.querySelector('.filters').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      guide.querySelectorAll('.filters button').forEach(x => x.setAttribute('aria-pressed', x === b));
      when = b.dataset.when; shown = 80; render();
    });
    let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { shown = 80; render(); }, 120); });
    city.addEventListener('change', () => { shown = 80; if (city.value && window.LL) LL.setCity(city.value); render(); });
    if (genre) genre.addEventListener('change', () => { shown = 80; render(); });
    more.addEventListener('click', () => { shown += 120; render(); });
    fetch(root + 'gigs.json').then(r => r.json()).then(d => { all = d; render(); })
      .catch(() => { count.textContent = 'Could not load the gig list. Try refreshing the page.'; });
  }
}
{
  // Countdowns to the next show / festival.
  const pad = n => String(n).padStart(2, '0');
  const t = new Date(); const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const [y, m, dd] = el.dataset.countdown.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, dd) - today) / 86400000);
    const num = el.querySelector('.cd-num'), lab = el.querySelector('.cd-lab');
    if (days > 1) { num.textContent = days; lab.textContent = 'days to go'; }
    else if (days === 1) { num.textContent = '1'; lab.textContent = 'day to go'; }
    else if (days === 0) { num.textContent = 'Tonight'; lab.textContent = ''; num.style.fontSize = '44px'; }
    else el.remove();
  });
}

// Links to other websites (including ones added by the gig guide) open in a new tab.
document.addEventListener("click", function (ev) {
  var a = ev.target.closest && ev.target.closest("a[href]");
  if (!a || a.target || ev.defaultPrevented) return;
  if (a.host && a.host !== location.host && /^https?:/.test(a.protocol)) {
    a.target = "_blank";
    a.rel = (a.rel ? a.rel + " " : "") + "noopener";
  }
});

// Homepage: gigs near you.
{
  const sel = document.getElementById('nearCity'), list = document.getElementById('nearList');
  if (sel && list) {
    const root = document.body.dataset.root || '';
    const has = c => [...sel.options].some(o => o.value === c);
    const start = [LL.city(), LL.guess()].find(c => c && has(c));
    if (start) sel.value = start;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const t = new Date(), pad = n => String(n).padStart(2, '0');
    const today = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    let all = null;
    function render() {
      const c = sel.value, sl = sel.selectedOptions[0].dataset.slug;
      document.querySelectorAll('#near .nc').forEach(x => x.textContent = c);
      document.getElementById('nearWk').href = `${root}gigs/${sl}-this-weekend.html`;
      document.getElementById('nearAll').href = `${root}gigs/${sl}.html`;
      if (!all) return;
      const rows = all.filter(s => s[6] === c && s[0] >= today).slice(0, 8);
      list.innerHTML = rows.length ? rows.map(s => {
        const [y, m, d] = s[0].split('-').map(Number);
        const day = new Date(y, m - 1, d).toLocaleDateString('en-AU', {weekday: 'short'});
        return `<a class="stub" href="${root}artists/${esc(s[3])}.html"><div class="d"><b>${d}</b><small>${months[m - 1]}</small></div>` +
          `<div class="i"><strong>${esc(s[2])}</strong><span>${day} · ${esc(s[4])}</span></div></a>`;
      }).join('') : `<p class="note">No shows listed in ${esc(c)} right now. Try another city.</p>`;
    }
    sel.addEventListener('change', () => { LL.setCity(sel.value); render(); });
    render();
    fetch(root + 'gigs.json').then(r => r.json()).then(d => { all = d; render(); }).catch(() => {});
  }
}

// Submit a gig: show town and state when the city isn't in the list.
{
  const c = document.getElementById('gcity'), o = document.getElementById('gother');
  if (c && o) c.addEventListener('change', () => { o.hidden = c.value !== 'other'; o.querySelector('input').required = c.value === 'other'; });
}

// ---------------------------------------------------------------- My gigs (saved on this device only)
window.MY = (function () {
  const KEY = 'llMy';
  const load = () => { try { return Object.assign({gigs: {}, artists: {}, discogs: ''}, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return {gigs: {}, artists: {}, discogs: ''}; } };
  let st = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} badge(); };
  const pad = n => String(n).padStart(2, '0'), t = new Date();
  const today = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  // drop gigs that have happened
  Object.keys(st.gigs).forEach(k => { if (st.gigs[k].d < today) delete st.gigs[k]; });
  function badge() {
    const n = Object.keys(st.gigs).length + Object.keys(st.artists).length;
    document.querySelectorAll('.mycount').forEach(b => { b.textContent = n; b.hidden = !n; });
  }
  function paint() {
    document.querySelectorAll('button.save[data-gig]').forEach(b => {
      let id = ''; try { id = JSON.parse(b.dataset.gig).id; } catch (e) {}
      const on = !!st.gigs[id];
      b.setAttribute('aria-pressed', on);
      if (b.closest('#mygigs')) b.innerHTML = on ? '♥ Saved' : '♡ Save'; else b.textContent = on ? '♥' : '♡';
    });
    document.querySelectorAll('button.saveartist').forEach(b => {
      const on = !!st.artists[b.dataset.artist];
      b.setAttribute('aria-pressed', on); b.innerHTML = on ? '<span aria-hidden="true">♥</span> Following' : '<span aria-hidden="true">♡</span> Follow';
    });
  }
  document.addEventListener('click', ev => {
    const g = ev.target.closest('button.save[data-gig]'), a = ev.target.closest('button.saveartist');
    if (g) {
      const x = JSON.parse(g.dataset.gig), had = !!st.gigs[x.id];
      if (had) delete st.gigs[x.id]; else st.gigs[x.id] = Object.assign(x, {going: false});
      save(); paint(); if (window.MYPAGE) MYPAGE(); push('gig', had ? 'remove' : 'add', had ? x : st.gigs[x.id]);
    }
    if (a) {
      const had = !!st.artists[a.dataset.artist];
      if (had) delete st.artists[a.dataset.artist]; else st.artists[a.dataset.artist] = a.dataset.name;
      save(); paint(); if (window.MYPAGE) MYPAGE(); push('artist', had ? 'remove' : 'add', {slug: a.dataset.artist, name: a.dataset.name});
    }
  });
  // Changes go to the visitor's account too, when they're signed in (account.js).
  function push(kind, op, item) { if (window.ACC) ACC.push(kind, op, item); else if (op === 'add') nudge(); }
  function nudge() {}
  function replace(next) { st = Object.assign({gigs: {}, artists: {}, discogs: ''}, next); save(); paint(); if (window.MYPAGE) MYPAGE(); }
  badge(); paint();
  return {get: () => st, save: save, paint: paint, today: today, replace: replace, push: push};
})();

// The My gigs page itself.
{
  const box = document.getElementById('mygigs');
  if (box) {
    const root = document.body.dataset.root || '';
    const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const norm = s => String(s).toLowerCase().replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
    const heathen = q => 'https://heathenrecords.com.au/search?type=product&q=' + encodeURIComponent(q) + '&utm_source=livelouder&utm_medium=referral&utm_campaign=my-gigs';
    let gigs = [], rels = [], dg = null;
    const row = (x, mine) => {
      const [y, m, d] = x.d.split('-').map(Number);
      const day = new Date(y, m - 1, d).toLocaleDateString('en-AU', {weekday: 'short'});
      const going = mine ? `<button class="going" type="button" data-id="${esc(x.id)}" aria-pressed="${!!x.going}">${x.going ? '✓ Going' : "I'm going"}</button>` : '';
      const saveBtn = `<button class="save" type="button" data-gig="${esc(JSON.stringify({id: x.id, d: x.d, tm: x.tm, a: x.a, s: x.s, v: x.v, c: x.c, u: x.u, vs: x.vs}))}" aria-pressed="false"><span aria-hidden="true">♡</span> Save</button>`;
      return `<li class="gig"><div class="gd"><b>${d}</b><small>${months[m - 1]}</small></div><div class="gi"><a class="gname" href="${root}artists/${esc(x.s)}.html">${esc(x.a)}</a>` +
        `<span class="gw"><a class="vlink" href="${root}venues/${esc(x.vs)}.html">${esc(x.v)}</a>, ${esc(x.c)} · ${day}${x.tm ? ' ' + esc(x.tm) : ''}</span></div>` +
        `<div class="ga"><a href="${esc(x.u)}" rel="noopener">Tickets ↗</a><span class="ga2">${going}${saveBtn}</span></div></li>`;
    };
    const fromRow = s => ({id: s[13], d: s[0], tm: s[1], a: s[2], s: s[3], v: s[4], c: s[6], u: s[7], vs: s[11]});
    function render() {
      const st = MY.get();
      const all = Object.values(st.gigs).sort((a, b) => a.d.localeCompare(b.d));
      const going = all.filter(x => x.going), saved = all.filter(x => !x.going);
      document.getElementById('myGoing').innerHTML = going.length ? `<ul class="gigs">${going.map(x => row(x, true)).join('')}</ul>` : `<p class="note">Nothing yet. Save a gig, then tap "I'm going".</p>`;
      document.getElementById('mySaved').innerHTML = saved.length ? `<ul class="gigs">${saved.map(x => row(x, true)).join('')}</ul>` :
        `<p class="note">${all.length ? 'Everything you saved is in Going.' : 'Tap <b>♡ Save</b> on any gig in the <a href="' + root + 'gigs/index.html">gig guide</a> and it lands here.'}</p>`;
      const arts = Object.entries(st.artists);
      document.getElementById('myArtists').innerHTML = arts.length ? '<ul class="myart">' + arts.map(([sl, name]) => {
        const next = gigs.filter(g => g[3] === sl);
        const nx = next[0] ? `Next: ${esc(next[0][6])}, ${new Date(next[0][0] + 'T00:00').toLocaleDateString('en-AU', {day: 'numeric', month: 'short'})}${next.length > 1 ? ` · ${next.length} shows` : ''}` : (gigs.length ? 'No Australian dates right now' : '');
        return `<li><a class="gname" href="${root}artists/${esc(sl)}.html">${esc(name)}</a><span class="gw">${nx}</span>` +
          `<button class="saveartist" type="button" data-artist="${esc(sl)}" data-name="${esc(name)}" aria-pressed="true">♥ Following</button></li>`;
      }).join('') + '</ul><p class="note">Want an email when they announce dates or presales? Hit "Get presale alerts" on their artist page.</p>' :
        `<p class="note">Tap <b>♡ Follow</b> on an artist page to keep an eye on their dates.</p>`;
      MY.paint();
      renderDiscogs();
    }
    function renderDiscogs() {
      const out = document.getElementById('dgOut');
      if (!dg) { out.innerHTML = ''; return; }
      if (dg.error) { out.innerHTML = `<p class="note err">${esc(dg.error)}</p>`; return; }
      const touring = {}, byArtist = {};
      gigs.forEach(g => { (touring[norm(g[2])] = touring[norm(g[2])] || []).push(g); });
      dg.collection.forEach(r => r.a.split(' & ').forEach(a => { (byArtist[norm(a)] = byArtist[norm(a)] || {name: a, n: 0}).n++; }));
      const matches = Object.entries(byArtist).filter(([k]) => touring[k]).sort((a, b) => b[1].n - a[1].n);
      const wantMatches = dg.wants.filter(w => w.a.split(' & ').some(a => touring[norm(a)]));
      const relMatch = rels.filter(r => byArtist[norm(r[1])] || dg.wants.some(w => norm(w.a) === norm(r[1])));
      let h = `<p class="dgsum"><b>${esc(dg.user)}</b>: ${dg.collection.length.toLocaleString()} records${dg.collectionPrivate ? ' (collection is private)' : ''}, ${dg.wants.length.toLocaleString()} on the wantlist. <button type="button" class="linkish" id="dgUnlink">Unlink</button></p>`;
      if (matches.length) {
        h += `<h4>Touring from your collection</h4><ul class="dglist">` + matches.slice(0, 20).map(([k, v]) => {
          const g = touring[k][0], sl = g[3];
          const followed = !!MY.get().artists[sl];
          return `<li><a class="gname" href="${root}artists/${esc(sl)}.html">${esc(g[2])}</a><span class="gw">You own ${v.n} · ${touring[k].length} ${touring[k].length === 1 ? 'show' : 'shows'}, next ${esc(g[6])}</span>` +
            `<button class="saveartist" type="button" data-artist="${esc(sl)}" data-name="${esc(g[2])}" aria-pressed="${followed}">${followed ? '♥ Following' : '♡ Follow'}</button></li>`;
        }).join('') + '</ul>';
      } else if (gigs.length) h += `<p class="note">None of the artists in your collection have Australian dates listed right now. We'll show them here when they do.</p>`;
      if (wantMatches.length) h += `<h4>On your wantlist, and touring</h4><ul class="dglist">` + wantMatches.slice(0, 10).map(w =>
        `<li><span class="gname">${esc(w.a)} – ${esc(w.t)}</span><a class="act" href="${heathen(w.a + ' ' + w.t)}" rel="noopener">Find it on vinyl ↗</a></li>`).join('') + '</ul>';
      if (relMatch.length) h += `<h4>New on vinyl from your artists</h4><ul class="dglist">` + relMatch.slice(0, 10).map(r =>
        `<li><span class="gname">${esc(r[1])} – ${esc(r[2])}</span><span class="gw">${r[0] === '2027' ? 'Coming 2027' : new Date(r[0] + 'T00:00').toLocaleDateString('en-AU', {day: 'numeric', month: 'short'})}</span><a class="act" href="${heathen(r[1] + ' ' + r[2])}" rel="noopener">Pre-order ↗</a></li>`).join('') + '</ul>';
      out.innerHTML = h;
      const un = document.getElementById('dgUnlink');
      if (un) un.addEventListener('click', () => { const st = MY.get(); st.discogs = ''; MY.save(); MY.push('discogs', 'set', ''); dg = null; document.getElementById('dgUser').value = ''; renderDiscogs(); });
      MY.paint();
    }
    function loadDiscogs(u) {
      document.getElementById('dgOut').innerHTML = '<p class="note">Loading your records…</p>';
      fetch('/.netlify/functions/discogs-user?u=' + encodeURIComponent(u)).then(r => r.json()).then(j => {
        dg = j; if (!j.error) { MY.get().discogs = u; MY.save(); MY.push('discogs', 'set', u); } renderDiscogs();
      }).catch(() => { dg = {error: "Couldn't reach Discogs. Try again in a minute."}; renderDiscogs(); });
    }
    box.addEventListener('click', ev => {
      const b = ev.target.closest('button.going');
      if (b) { const st = MY.get(); const g = st.gigs[b.dataset.id]; if (g) { g.going = !g.going; MY.save(); MY.push('gig', 'going', g); render(); } }
    });
    document.getElementById('dgForm').addEventListener('submit', ev => {
      ev.preventDefault(); const u = document.getElementById('dgUser').value.trim(); if (u) loadDiscogs(u);
    });
    window.MYPAGE = render;
    render();
    Promise.all([fetch(root + 'gigs.json').then(r => r.json()).catch(() => []), fetch(root + 'data/releases.json').then(r => r.json()).catch(() => [])])
      .then(([g, r]) => { gigs = g; rels = r; render(); });
    const u0 = MY.get().discogs;
    if (u0) { document.getElementById('dgUser').value = u0; loadDiscogs(u0); }
  }
}
