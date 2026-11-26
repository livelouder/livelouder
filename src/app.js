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
        html += `<li class="gig"><div class="gd"><b>${dd}</b><small>${months[m - 1]}</small></div><div class="gi"><a class="gname" href="${esc(s[14] || (root + 'artists/' + s[3] + '.html'))}">${esc(s[2])}</a>` +
          (s[8] ? `<span class="gsup">with ${esc(s[8])}</span>` : '') + `<span class="gw"><a class="vlink" href="${root}venues/${esc(s[11])}.html">${esc(s[4])}</a>, ${esc(s[6])} · ${day}${s[1] ? ' ' + esc(s[1]) : ''}</span></div>` +
          `<div class="ga"><a href="${esc(s[7])}" rel="noopener">${['ticketmaster', 'submitted', 'found'].includes(s[9]) ? 'Tickets' : 'Details'} ↗</a><span class="ga2"><a class="cal" href="${esc(s[10])}" rel="noopener">+ Calendar</a>` +
          `<button class="save" type="button" data-gig="${esc(JSON.stringify({id: s[13], d: s[0], tm: s[1], a: s[2], s: s[3], v: s[4], c: s[6], u: s[7], vs: s[11], p: s[14]}))}" aria-pressed="false" title="Save to My gigs" aria-label="Save to My gigs">♡</button></span></div></li>`;
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
  const blank = () => ({gigs: {}, artists: {}, discogs: '', records: {}, wants: {}});
  const load = () => { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return blank(); } };
  let st = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} badge(); };
  const pad = n => String(n).padStart(2, '0'), t = new Date();
  const today = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  // drop gigs that have happened
  Object.keys(st.gigs).forEach(k => { if (st.gigs[k].d < today && !st.gigs[k].going) delete st.gigs[k]; }); // gigs you went to stay, as your history
  function badge() {
    const n = Object.values(st.gigs).filter(g => g.d >= today).length + Object.keys(st.artists).length;
    document.querySelectorAll('.mycount').forEach(b => { b.textContent = n; b.hidden = !n; });
  }
  function paint() {
    document.querySelectorAll('button.save[data-gig]').forEach(b => {
      let id = ''; try { id = JSON.parse(b.dataset.gig).id; } catch (e) {}
      const on = !!st.gigs[id];
      b.setAttribute('aria-pressed', on);
      b.textContent = on ? '♥' : '♡'; b.title = on ? 'Saved to My gigs' : 'Save to My gigs';
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
  function replace(next) { st = Object.assign(blank(), next); save(); paint(); if (window.MYPAGE) MYPAGE(); }
  // Records: Live Louder's own collection and wantlist. Buttons anywhere with data-addrec='{"rid","a","t","y","img",...}' data-list="records|wants".
  function toggleRec(list, rec, force) {
    const had = !!st[list][rec.rid];
    const add = force === undefined ? !had : force;
    if (add === had) return false;
    if (add) st[list][rec.rid] = Object.assign({}, rec, {add: rec.add || new Date().toISOString().slice(0, 10)}); else delete st[list][rec.rid];
    if (add && list === 'records' && st.wants[rec.rid]) { delete st.wants[rec.rid]; push('rec', 'remove', {list: 'wants', rec}); }
    save(); push('rec', add ? 'add' : 'remove', {list, rec: add ? st[list][rec.rid] : rec});
    return true;
  }
  function paintRecs() {
    document.querySelectorAll('[data-addrec]').forEach(b => {
      let r; try { r = JSON.parse(b.dataset.addrec); } catch (e) { return; }
      const on = !!st[b.dataset.list][r.rid];
      b.setAttribute('aria-pressed', on);
      b.textContent = b.dataset.list === 'records' ? (on ? '✓ In my collection' : '+ Collection') : (on ? '✓ On wantlist' : '+ Wantlist');
    });
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-addrec]'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    toggleRec(b.dataset.list, JSON.parse(b.dataset.addrec)); paintRecs(); if (window.MYPAGE) MYPAGE();
  }, true);
  badge(); paint(); paintRecs();
  return {get: () => st, save: save, paint: () => { paint(); paintRecs(); }, today: today, replace: replace, push: push, toggleRec: toggleRec};
})();


// Homepage slideshow behind the hero: fades to the next picture every 7 seconds (unless you prefer less motion).
{
  const bgs = [...document.querySelectorAll('.hslides .hs')], caps = [...document.querySelectorAll('.hcaps .hcap')], dots = [...document.querySelectorAll('.hcaps .cdot')];
  if (bgs.length) {
    let i = 0, timer = null, paused = false;
    const show = k => { i = (k + bgs.length) % bgs.length; bgs.forEach((b, j) => b.classList.toggle('on', j === i)); caps.forEach((c, j) => c.classList.toggle('on', j === i)); dots.forEach((d, j) => d.setAttribute('aria-current', j === i)); };
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const restart = () => { clearInterval(timer); if (!still && bgs.length > 1) timer = setInterval(() => { if (!paused && !document.hidden) show(i + 1); }, 7000); };
    dots.forEach((d, j) => d.addEventListener('click', () => { show(j); restart(); }));
    const box = document.querySelector('.hcaps');
    box.addEventListener('mouseenter', () => { paused = true; }); box.addEventListener('mouseleave', () => { paused = false; });
    box.addEventListener('focusin', () => { paused = true; }); box.addEventListener('focusout', () => { paused = false; });
    show(0); restart();
  }
}

// "How far is it from me?" on venue and gig pages (uses the visitor's location only when they tap, never stored).
document.addEventListener('click', ev => {
  const b = ev.target.closest('.distbtn'); if (!b) return;
  const out = b.parentElement.querySelector('.distout');
  if (!navigator.geolocation) { out.textContent = "Your browser can't share your location."; return; }
  out.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(p => {
    const R = 6371, rad = x => x * Math.PI / 180, la1 = rad(p.coords.latitude), la2 = rad(+b.dataset.lat);
    const dLa = la2 - la1, dLo = rad(+b.dataset.lon - p.coords.longitude);
    const km = 2 * R * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2));
    out.innerHTML = `About <b>${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km</b> away, as the crow flies.`;
  }, () => { out.textContent = "Couldn't get your location. Check your browser lets this site use it."; }, {timeout: 10000, maximumAge: 600000});
});
