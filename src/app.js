// Ticket links: same rules as link_kind() in build.py. 'tickets' = buy here, 'resale' (Tixel etc.), 'info' = listing/news page.
window.LLLINK = (() => {
  const RESALE = ['tixel.com', 'viagogo.com', 'viagogo.com.au', 'stubhub.com', 'stubhub.com.au', 'twickets.live', 'ticketswap.com'];
  const INFO = ['songkick.com', 'jambase.com', 'allevents.in', 'musick.com.au', 'tasguide.com.au', 'pubsandevents.com.au', 'russh.com',
    'bandsintown.com', 'concertarchives.org', 'setlist.fm', 'whatson.com.au', 'timeout.com', 'themusic.com.au', 'musicfeeds.com.au',
    'rollingstone.com', 'au.rollingstone.com', 'variety.com', 'au.variety.com', 'theaureview.com', 'happymag.tv', 'abc.net.au',
    'beat.com.au', 'tonedeaf.thebrag.com', 'thebrag.com', 'concertful.com', 'songkick.net', 'facebook.com', 'instagram.com',
    'visitnsw.com', 'visitvictoria.com', 'concerty.com', 'ents24.com', 'livemusic.com.au', 'gigguide.com.au'];
  const host = u => { const m = /^https?:\/\/([^/]+)/i.exec(u || ''); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; };
  const is = (h, list) => list.some(x => h === x || h.endsWith('.' + x));
  const kind = u => { const h = host(u); return !h ? 'info' : is(h, RESALE) ? 'resale' : is(h, INFO) ? 'info' : 'tickets'; };
  // Tag ticket links so sellers' and venues' own dashboards show the sale came from Live Louder (same as add_utm in build.py).
  const utm = (u, c = 'gig') => { if (!u || /utm_source=/.test(u) || kind(u) === 'info') return u;
    const [b, f] = u.split('#'); return `${b}${b.includes('?') ? '&' : '?'}utm_source=livelouder&utm_medium=referral&utm_campaign=${c}` + (f ? '#' + f : ''); };
  return {host, kind, utm};
})();

// Gig-poster artwork for acts with no photo, styled by genre (same rules as build.py's poster()).
window.LLPOSTER = (() => {
  const byGenre = {'rock': 'grit', 'metal-and-heavy': 'grit', 'punk': 'grit', 'country-and-folk': 'paper', 'soul-blues-and-jazz': 'paper',
    'electronic-and-dance': 'neon', 'hip-hop-and-randb': 'neon', 'pop': 'pop', 'indie-and-alternative': 'pop'};
  const hue = n => { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const style = (name, g) => byGenre[g] || ['grit', 'paper', 'pop', 'neon'][hue(name) % 4];
  const big = (name, g) => { const n = name.length, sz = n <= 9 ? 's' : n <= 18 ? 'm' : n <= 30 ? 'l' : 'xl';
    return `<span class="gcpic poster ps ps-${style(name, g)} pl-${sz}" style="--h:${hue(name)}" aria-hidden="true"><span class="pn">${esc(name)}</span><span class="plive">Live</span></span>`; };
  const small = (name, g, href) => { const ini = (name.match(/[A-Za-z0-9]+/g) || ['?']).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    return `<a class="gth poster ps ps-${style(name, g)}" href="${href}" tabindex="-1" aria-hidden="true" style="--h:${hue(name)}"><span class="pn">${esc(ini)}</span></a>`; };
  return {big, small};
})();

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
    if (el.dataset.date < today) { if (el.classList.contains('stub') || el.classList.contains('gig') || el.classList.contains('gcard')) el.remove(); else el.classList.add('past'); }
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
    let when = 'all', shown = 80, all = [], pics = {a: {}, v: {}};
    const pic = u => !u ? '' : u.startsWith('dz:') ? `https://cdn-images.dzcdn.net/images/artist/${u.slice(3)}/250x250-000000-80-0-0.jpg` : u;
    const hueOf = n => { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
    const addDays = n => { const x = new Date(now); x.setDate(x.getDate() + n); return iso(x); };
    const weekend = () => { const dow = now.getDay(); return [[5, 6, 0].includes(dow) ? today : addDays(5 - dow), addDays((7 - dow) % 7)]; };
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const longM = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const buy = (s, gp) => {
      const k = LLLINK.kind(s[7]), tk = `data-tk="${k}" data-seller="${esc(LLLINK.host(s[7]))}" data-artist="${esc(s[2])}" data-venue="${esc(s[4])}" data-city="${esc(s[6])}"`;
      const tu = LLLINK.utm(s[7]);
      if (s[18] === 'sold out') return `<span class="tag soldout">Sold out</span><a href="${esc(tu)}" rel="noopener" ${tk}>${k === 'resale' ? 'Resale' : 'Waitlist / resale'} ↗</a>`;
      if (k === 'tickets') return `<a href="${esc(tu)}" rel="noopener" ${tk}>Tickets ↗</a>`;
      if (k === 'resale') return `<a class="resale" href="${esc(tu)}" rel="noopener" ${tk}>Resale tickets ↗</a>`;
      return `<a href="${gp}">Details →</a>`;
    };
    const strip = document.querySelector('#gbar .filters') || guide.querySelector('.filters');
    const tonightEl = document.getElementById('tonight');
    // Date tiles: Any time, then the next 10 days with how many gigs each, then This weekend and Next 30 days.
    function paintStrip() {
      if (!strip || !strip.classList.contains('dstrip')) return;
      const c = city.value, n = {};
      all.forEach(s => { if (!c || s[6] === c) n[s[0]] = (n[s[0]] || 0) + 1; });
      let h = `<button data-when="all" aria-pressed="${when === 'all'}"><small>Any</small><b>All</b><small>time</small></button>`;
      for (let i = 0; i < 10; i++) {
        const dIso = addDays(i), [y, m, dd] = dIso.split('-').map(Number);
        const lab = i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow' : new Date(y, m - 1, dd).toLocaleDateString('en-AU', {weekday: 'short'});
        h += `<button data-when="d:${dIso}" aria-pressed="${when === 'd:' + dIso}"><small>${lab}</small><b>${dd}</b><small>${n[dIso] || 0} gigs</small></button>`;
      }
      h += `<button data-when="weekend" aria-pressed="${when === 'weekend'}"><small>This</small><b>Wknd</b><small>Fri–Sun</small></button>` +
        `<button data-when="month" aria-pressed="${when === 'month'}"><small>Next</small><b>30</b><small>days</small></button>`;
      strip.innerHTML = h;
    }
    // "Tonight in <city>": picture cards for today's gigs, photos first.
    const t12 = t => { let [h, mi] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + (mi ? ':' + String(mi).padStart(2, '0') : '') + ap; };
    function paintTonight(term, c, g) {
      if (!tonightEl) return;
      if (term || (when !== 'all' && when !== 'd:' + today)) { tonightEl.innerHTML = ''; return; }
      const tn = all.filter(s => s[0] === today && (!c || s[6] === c) && (!g || s[12] === g));
      const ph = s => pics.a[s[3]] || pics.v[s[11]] ? 1 : 0;
      const top = tn.slice().sort((a, b) => ph(b) - ph(a)).slice(0, 8);
      if (!top.length) { tonightEl.innerHTML = ''; return; }
      const big = u => !u ? '' : u.startsWith('dz:') ? `https://cdn-images.dzcdn.net/images/artist/${u.slice(3)}/500x500-000000-80-0-0.jpg` : u;
      tonightEl.innerHTML = `<div class="ghead"><h2>Tonight ${c ? 'in ' + esc(c) : 'around Australia'}</h2>${tn.length > top.length && when === 'all' ? `<button type="button" class="linkish" data-tonight>All ${tn.length} tonight →</button>` : ''}</div><div class="gcgrid">` +
        top.map(s => { const u = big(pics.a[s[3]] || pics.v[s[11]]); const face = u ? `<span class="gcpic" style="background-image:url(&quot;${esc(u)}&quot;)"></span>` : LLPOSTER.big(s[2], s[12]);
          return `<a class="gcard" href="${esc(s[14] || (root + 'artists/' + s[3] + '.html'))}">${face}<span class="gcd"><b>${s[1] ? t12(s[1]) : 'Today'}</b></span>` +
            `<span class="gcin"><strong>${esc(s[2])}</strong><span>${esc(s[4])}, ${esc(s[5] && s[5] !== s[6] ? s[5] : s[6])}</span></span></a>`; }).join('') + '</div>';
    }
    if (tonightEl) tonightEl.addEventListener('click', ev => { if (ev.target.closest('[data-tonight]')) { when = 'd:' + today; shown = 80; render(); } });
    function render() {
      const term = q.value.trim().toLowerCase(), c = city.value, g = genre ? genre.value : '';
      let lo = today, hi = '9999';
      if (when === 'week') hi = addDays(7); else if (when === 'month') hi = addDays(30); else if (when === 'weekend') [lo, hi] = weekend();
      else if (when.startsWith('d:')) lo = hi = when.slice(2);
      const list = all.filter(s => s[0] >= lo && s[0] <= hi && (!c || s[6] === c) && (!g || s[12] === g) &&
        (!term || (s[2] + ' ' + s[4] + ' ' + s[5] + ' ' + s[6] + ' ' + s[8]).toLowerCase().includes(term)));
      count.textContent = list.length ? `${list.length.toLocaleString()} ${list.length === 1 ? 'show' : 'shows'}` : 'No shows match. Try a different search or date.';
      let html = '', month = '';
      const perDay = {}; list.forEach(s => { perDay[s[0]] = (perDay[s[0]] || 0) + 1; });
      paintStrip(); paintTonight(term, c, g);
      for (const s of list.slice(0, shown)) {
        const [y, m, dd] = s[0].split('-').map(Number);
        const mk = s[0];
        if (mk !== month) { const lab = s[0] === today ? 'Tonight' : s[0] === addDays(1) ? 'Tomorrow' : new Date(y, m - 1, dd).toLocaleDateString('en-AU', {weekday: 'long', day: 'numeric', month: 'long'});
          html += (month ? '</ul>' : '') + `<h3 class="month gday">${lab} <span class="gdn">${perDay[s[0]]} ${perDay[s[0]] === 1 ? 'gig' : 'gigs'}</span></h3><ul class="gigs">`; month = mk; }
        const day = new Date(y, m - 1, dd).toLocaleDateString('en-AU', {weekday: 'short'});
        const u = pic(pics.a[s[3]] || pics.v[s[11]]), gp = esc(s[14] || (root + 'artists/' + s[3] + '.html'));
        const th = u ? `<a class="gth" href="${gp}" tabindex="-1" aria-hidden="true"><img src="${esc(u)}" alt="" loading="lazy" width="58" height="58"></a>`
          : LLPOSTER.small(s[2], s[12], gp);
        html += `<li class="gig th"><div class="gd"><b>${dd}</b><small>${months[m - 1]}</small></div>${th}<div class="gi"><a class="gname" href="${esc(s[14] || (root + 'artists/' + s[3] + '.html'))}">${esc(s[2])}</a>` +
          (s[8] ? `<span class="gsup">with ${esc(s[8])}</span>` : '') + `<span class="gw"><a class="vlink" href="${root}venues/${esc(s[11])}.html">${esc(s[4])}</a>, ${esc(s[6])} · ${day}${s[1] ? ' ' + esc(s[1]) : ''}</span></div>` +
          `<div class="ga">${buy(s, gp)}<span class="ga2"><a class="cal" href="${esc(s[10])}" rel="noopener">+ Calendar</a>` +
          `<button class="save" type="button" data-gig="${esc(JSON.stringify({id: s[13], d: s[0], tm: s[1], a: s[2], s: s[3], v: s[4], c: s[6], u: s[7], vs: s[11], p: s[14]}))}" aria-pressed="false" title="Save to My gigs" aria-label="Save to My gigs">♡</button></span></div></li>`;
      }
      out.innerHTML = html + (month ? '</ul>' : '');
      if (window.MY) MY.paint();
      more.hidden = list.length <= shown;
    }
    strip.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      strip.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      when = b.dataset.when; shown = 80; render();
    });
    let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { shown = 80; render(); }, 120); });
    city.addEventListener('change', () => { shown = 80; if (city.value && window.LL) LL.setCity(city.value); render(); });
    if (genre) genre.addEventListener('change', () => { shown = 80; render(); });
    more.addEventListener('click', () => { shown += 120; render(); });
    Promise.all([fetch(root + 'gigs.json').then(r => r.json()), fetch(root + 'data/pics.json').then(r => r.json()).catch(() => null)])
      .then(([d, p]) => { all = d; if (p) pics = p; render(); })
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

// Homepage: gigs near you. Set your spot (location, a town/postcode, or a city) and see gigs by distance.
// Your spot is kept on this device only (localStorage "llLoc"); town lookups use OpenStreetMap.
{
  const sel = document.getElementById('nearCity'), list = document.getElementById('nearList');
  if (sel && list) {
    const root = document.body.dataset.root || '';
    const $ = id => document.getElementById(id);
    const box = $('locBox'), btn = $('nearLoc'), km = $('nearKm'), sum = $('nearSum'), msg = $('locMsg');
    const has = c => [...sel.options].some(o => o.value === c);
    const startCity = [LL.city(), LL.guess()].find(c => c && has(c));
    if (startCity) sel.value = startCity;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const t = new Date(), pad = n => String(n).padStart(2, '0');
    const today = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    const rad = x => x * Math.PI / 180;
    const dist = (a, b, c, d) => { const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
    let all = null, loc = null;
    try { loc = JSON.parse(localStorage.getItem('llLoc') || 'null'); } catch (e) {}
    try { const k = localStorage.getItem('llKm'); if (k) km.value = k; } catch (e) {}
    const saveLoc = l => { loc = l; try { l ? localStorage.setItem('llLoc', JSON.stringify(l)) : localStorage.removeItem('llLoc'); } catch (e) {} };
    // The nearest big city, for the "This weekend in…" links and for other pages.
    function nearestCity(l) {
      let best = null, bd = 1e9;
      [...sel.options].forEach(o => { if (!o.dataset.lat) return; const dd = dist(l.lat, l.lon, +o.dataset.lat, +o.dataset.lon); if (dd < bd) { bd = dd; best = o.value; } });
      return best;
    }
    // Picture cards: the artist's photo, else the venue's photo, else a colourful poster with their initials.
    let pics = {a: {}, v: {}};
    const pic = u => !u ? '' : u.startsWith('dz:') ? `https://cdn-images.dzcdn.net/images/artist/${u.slice(3)}/500x500-000000-80-0-0.jpg` : u;
    const hueOf = n => { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
    function stub(s, d, approx) {
      const [y, m, dd] = s[0].split('-').map(Number);
      const day = new Date(y, m - 1, dd).toLocaleDateString('en-AU', {weekday: 'short'});
      const far = d == null ? '' : `<em class="km">${approx ? 'about ' : ''}${d < 1 ? 'under 1' : d < 10 ? d.toFixed(0) : Math.round(d / 5) * 5} km</em>`;
      const town = s[5] && s[5] !== s[6] ? s[5] : s[6];
      const u = pic(pics.a[s[3]] || pics.v[s[11]]);
      const face = u ? `<span class="gcpic" style="background-image:url(&quot;${esc(u)}&quot;)"></span>` : LLPOSTER.big(s[2], s[12]);
      return `<a class="gcard" href="${esc(s[14] || (root + 'artists/' + s[3] + '.html'))}">${face}<span class="gcd"><b>${dd}</b><small>${months[m - 1]}</small></span>` +
        `<span class="gcin"><strong>${esc(s[2])}</strong><span>${day} · ${esc(s[4])}${loc ? ', ' + esc(town) : ''}</span>${far}</span></a>`;
    }
    function links(c) {
      const o = [...sel.options].find(x => x.value === c) || sel.options[0];
      document.querySelectorAll('#near .nc').forEach(x => x.textContent = o.value);
      $('nearWk').href = `${root}gigs/${o.dataset.slug}-this-weekend.html`;
      $('nearAll').href = `${root}gigs/${o.dataset.slug}.html`;
    }
    function render() {
      km.hidden = !loc;
      $('nearWhere').textContent = loc ? loc.label : sel.value;
      links(loc ? (loc.city || sel.value) : sel.value);
      if (!all) return;
      if (!loc) {
        sum.textContent = ''; if ($('nearSuggest')) $('nearSuggest').hidden = true;
        const rows = all.filter(s => s[6] === sel.value && s[0] >= today).slice(0, 8);
        list.innerHTML = rows.length ? rows.map(s => stub(s)).join('') : `<p class="note">No shows listed in ${esc(sel.value)} right now. Try another city.</p>`;
        return;
      }
      const sug = $('nearSuggest');
      const R = +km.value, soon = all.filter(s => s[0] >= today && s.length > 16 && s[15] != null)
        .map(s => ({s, d: dist(loc.lat, loc.lon, s[15], s[16]), a: !!s[17]}));
      const near = soon.filter(x => x.d <= R).sort((a, b) => a.s[0].localeCompare(b.s[0]) || a.d - b.d);
      if (sug) {
        sug.hidden = near.length >= 3;
        const tIn = sug.querySelector('input[name=town]');
        if (tIn && !tIn.dataset.touched && loc.label !== 'you') tIn.value = loc.label;
        if (tIn) tIn.oninput = () => { tIn.dataset.touched = '1'; };
      }
      if (near.length >= 3) {
        sum.textContent = `${near.length} ${near.length === 1 ? 'gig' : 'gigs'} within ${R} km of ${loc.label}, soonest first.`;
        list.innerHTML = near.slice(0, innerWidth < 600 ? 6 : 12).map(x => stub(x.s, x.d, x.a)).join('');
      } else {
        const in60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
        const pool = soon.filter(x => x.s[0] <= in60).length >= 8 ? soon.filter(x => x.s[0] <= in60) : soon;
        // Nearest first, but treat venues within ~15 km of each other as the same distance and show the soonest of those first.
        const close = pool.sort((a, b) => (Math.round(a.d / 15) - Math.round(b.d / 15)) || a.s[0].localeCompare(b.s[0])).slice(0, innerWidth < 600 ? 6 : 8);
        sum.textContent = near.length ? `Only ${near.length} within ${R} km of ${loc.label} so far, so here are the closest gigs.` : `Nothing listed within ${R} km of ${loc.label} yet, so here are the closest gigs. More local venues are being added every day.`;
        list.innerHTML = close.map(x => stub(x.s, x.d, x.a)).join('');
      }
    }
    function setLoc(l) { l.city = nearestCity(l); saveLoc(l); if (l.city) { sel.value = l.city; LL.setCity(l.city); } box.hidden = true; btn.setAttribute('aria-expanded', 'false'); render(); }
    btn.addEventListener('click', () => { box.hidden = !box.hidden; btn.setAttribute('aria-expanded', String(!box.hidden)); });
    // "📍 Gigs near me" in the top banner: jump down, and ask where you are if we don't know yet.
    document.querySelectorAll('[data-nearme]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('near').scrollIntoView({behavior: 'smooth', block: 'start'});
      if (!loc) { box.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    }));
    if (location.hash === '#near' && !loc) { box.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    km.addEventListener('change', () => { try { localStorage.setItem('llKm', km.value); } catch (e) {} render(); });
    sel.addEventListener('change', () => { saveLoc(null); LL.setCity(sel.value); box.hidden = true; render(); });
    $('locGps').addEventListener('click', () => {
      if (!navigator.geolocation) { msg.textContent = "Your browser can't share your location. Type your town instead."; return; }
      msg.textContent = 'Finding you…';
      navigator.geolocation.getCurrentPosition(async p => {
        const l = {lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3), label: 'you'};
        try {
          const r = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&lat=${l.lat}&lon=${l.lon}`)).json();
          const a = r.address || {};
          l.label = a.suburb || a.town || a.village || a.city || a.hamlet || 'you';
        } catch (e) {}
        msg.textContent = 'Your location stays on this device. We only use it to sort gigs by distance.';
        setLoc(l);
      }, () => { msg.textContent = "We couldn't get your location. Type your town or postcode instead."; }, {timeout: 10000, maximumAge: 600000});
    });
    $('locForm').addEventListener('submit', async e => {
      e.preventDefault();
      const q = e.target.q.value.trim();
      if (!q) return;
      msg.textContent = 'Looking that up…';
      try {
        const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=au&addressdetails=1&q=${encodeURIComponent(q)}`)).json();
        if (!r.length) { msg.textContent = `We couldn't find "${q}". Try a town name or a 4-digit postcode.`; return; }
        const a = r[0].address || {};
        const label = /^\d{4}$/.test(q) ? (a.suburb || a.town || a.village || a.city || q) : (a.suburb || a.town || a.village || a.city || q.replace(/\b\w/g, c => c.toUpperCase()));
        msg.textContent = 'Your location stays on this device. We only use it to sort gigs by distance.';
        e.target.q.value = '';
        setLoc({lat: +(+r[0].lat).toFixed(3), lon: +(+r[0].lon).toFixed(3), label});
      } catch (err) { msg.textContent = "Couldn't look that up right now. Try again in a moment."; }
    });
    render();
    Promise.all([fetch(root + 'gigs.json').then(r => r.json()), fetch(root + 'data/pics.json').then(r => r.json()).catch(() => null)])
      .then(([d, p]) => { all = d; if (p) pics = p; render(); }).catch(() => {});
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
    const n = Object.values(st.gigs).filter(g => g.d >= today).length;  // upcoming saved gigs (shown in the account menu)
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
  // Saving needs an account. Signed out: open the sign-in box, remember what they tapped, and save it
  // for them as soon as they're signed in (see "pending" below).
  function gate(el, pending, title) {
    if (!window.ACC || ACC.user()) return false;
    let was = null; try { was = localStorage.getItem('llSignedIn'); } catch (e) {}
    if (was && !el.dataset.gated) { el.dataset.gated = '1'; ACC.session().then(u => { if (u) el.click(); else gate(el, pending, title); delete el.dataset.gated; }); return true; }
    try { localStorage.setItem('llPending', JSON.stringify(pending)); } catch (e) {}
    ACC.open({title, text: 'Create a free account (or sign in) and we\'ll save it for you. Your gigs and records stay on all your devices, and you get a reminder before the show.'});
    return true;
  }
  function toast(html) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html; document.body.appendChild(t);
    setTimeout(() => t.classList.add('on'), 20); setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, 5000);
  }
  function runPending() {
    if (!window.ACC || !ACC.user()) return;
    let p = null; try { p = JSON.parse(localStorage.getItem('llPending') || 'null'); localStorage.removeItem('llPending'); } catch (e) {}
    if (!p) return;
    const root = document.body.dataset.root || '';
    if (p.k === 'gig' && p.x && !st.gigs[p.x.id]) { st.gigs[p.x.id] = Object.assign(p.x, {going: false}); save(); push('gig', 'add', st.gigs[p.x.id]); toast(`♥ Saved <b>${String(p.x.a).replace(/</g, '&lt;')}</b> to <a href="${root}my-gigs.html#gigs">your gigs</a>.`); }
    if (p.k === 'artist' && p.slug && !st.artists[p.slug]) { st.artists[p.slug] = p.name; save(); push('artist', 'add', {slug: p.slug, name: p.name}); toast(`♥ You're following <b>${String(p.name).replace(/</g, '&lt;')}</b>.`); }
    if (p.k === 'rec' && p.rec) { toggleRec(p.list, p.rec, true); toast(`✓ Added <b>${String(p.rec.t).replace(/</g, '&lt;')}</b> to your <a href="${root}my-gigs.html#${p.list === 'records' ? 'records' : 'wantlist'}">${p.list === 'records' ? 'collection' : 'wantlist'}</a>.`); }
    paint(); paintRecs(); if (window.MYPAGE) MYPAGE();
  }
  document.addEventListener('acc', () => setTimeout(runPending, 50));
  document.addEventListener('click', ev => {
    const g = ev.target.closest('button.save[data-gig]'), a = ev.target.closest('button.saveartist');
    if (g) { let x0 = {}; try { x0 = JSON.parse(g.dataset.gig); } catch (e) {} if (gate(g, {k: 'gig', x: x0}, `Save ${x0.a || 'this gig'} to your gigs`)) return; }
    if (a && gate(a, {k: 'artist', slug: a.dataset.artist, name: a.dataset.name}, `Follow ${a.dataset.name}`)) return;
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
    if (window.ACC && !ACC.user()) { let r0 = {}; try { r0 = JSON.parse(b.dataset.addrec); } catch (e) {}
      if (gate(b, {k: 'rec', list: b.dataset.list, rec: r0}, b.dataset.list === 'records' ? `Add ${r0.t || 'this record'} to your collection` : `Add ${r0.t || 'this record'} to your wantlist`)) return; }
    toggleRec(b.dataset.list, JSON.parse(b.dataset.addrec)); paintRecs(); if (window.MYPAGE) MYPAGE();
  }, true);
  badge(); paint(); paintRecs();
  return {get: () => st, save: save, paint: () => { paint(); paintRecs(); }, today: today, replace: replace, push: push, toggleRec: toggleRec};
})();


// Homepage banner carousel: the slide nearest the middle is "on" (bright) and the next ones peek in either side.
// It loops: copies of the last two slides sit before the first and copies of the first two after the last, and
// when you land on a copy it quietly jumps to the real one. Swipe, arrows, dots, and it moves on every 7 seconds.
{
  const track = document.querySelector('.hxtrack');
  if (track) {
    const real = [...track.children], n = real.length, dots = [...document.querySelectorAll('.hx .cdot')];
    if (n > 1) {
      const copy = el => { const c = el.cloneNode(true); c.classList.add('copy'); c.setAttribute('aria-hidden', 'true'); c.tabIndex = -1; return c; };
      real.slice(-2).reverse().forEach(el => track.prepend(copy(el)));
      real.slice(0, 2).forEach(el => track.append(copy(el)));
    }
    const all = [...track.children], off = n > 1 ? 2 : 0;
    let cur = off, timer = null, paused = false;
    const left = el => el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2;
    const jump = k => { track.style.scrollBehavior = 'auto'; track.scrollLeft = left(all[k]); track.style.scrollBehavior = ''; };
    const nearest = () => { const mid = track.scrollLeft + track.clientWidth / 2; let best = 0, bd = Infinity;
      all.forEach((s, j) => { const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = j; } }); return best; };
    const mark = () => {
      cur = nearest();
      const r = ((cur - off) % n + n) % n;
      all.forEach((s, j) => { const on = j === cur || (s.classList.contains('copy') && ((j - off) % n + n) % n === r && j === cur); s.classList.toggle('on', on); if (!s.classList.contains('copy')) s.tabIndex = j === cur ? 0 : -1; });
      dots.forEach((d, j) => d.setAttribute('aria-current', j === r));
    };
    // After scrolling stops on a copy, swap to the real slide (looks identical, so you don't notice).
    const settle = () => { mark(); if (all[cur].classList.contains('copy')) { const r = ((cur - off) % n + n) % n; jump(off + r); mark(); } };
    let raf, st;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); clearTimeout(st); st = setTimeout(settle, 140); }, {passive: true});
    const go = k => track.scrollTo({left: left(all[k])});
    document.querySelectorAll('.hxgo').forEach(b => b.addEventListener('click', () => { go(cur + +b.dataset.hx); restart(); }));
    dots.forEach((d, j) => d.addEventListener('click', () => { go(off + j); restart(); }));
    // Tapping a dimmed side slide brings it to the middle instead of opening it.
    all.forEach((s, j) => s.addEventListener('click', ev => { if (j !== cur) { ev.preventDefault(); go(j); restart(); } }));
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const restart = () => { clearInterval(timer); if (!still && n > 1) timer = setInterval(() => { if (!paused && !document.hidden) go(cur + 1); }, 7000); };
    const box = document.querySelector('.hx');
    ['mouseenter', 'focusin', 'touchstart'].forEach(e => box.addEventListener(e, () => { paused = true; }, {passive: true}));
    ['mouseleave', 'focusout'].forEach(e => box.addEventListener(e, () => { paused = false; }));
    box.addEventListener('touchend', () => setTimeout(() => { paused = false; }, 4000), {passive: true});
    jump(off); mark();
    addEventListener('resize', () => { jump(cur); });
    restart();
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

// ---------------------------------------------------------------- app install (phones and desktops)
// The service worker (sw.js) makes the site installable and keeps My gigs working with no signal.
(function () {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  let prompt = null;
  const show = on => document.querySelectorAll('.installbtn').forEach(b => { b.hidden = !on; });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; show(true); });
  window.addEventListener('appinstalled', () => { prompt = null; show(false); try { localStorage.setItem('llApp', '1'); } catch (x) {} });
  document.addEventListener('click', async e => {
    const b = e.target.closest('.installbtn');
    if (!b || !prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
    prompt = null; show(false);
  });
  window.LLAPP = {
    installed: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    canPrompt: () => !!prompt,
    ios: () => /iphone|ipad|ipod/i.test(navigator.userAgent),
  };
})();

// Gig pages: "On your shelf". For people with a record collection on Live Louder: the records they own by
// this artist, wantlist records that are in stock at Heathen Records, and what's missing from their shelf.
document.addEventListener('DOMContentLoaded', () => {
  const acts = document.querySelector('.gp-acts'), b = acts && acts.querySelector('.save[data-gig]');
  if (!b || !window.MY) return;
  let g; try { g = JSON.parse(b.dataset.gig); } catch (e) { return; }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const norm = s => String(s).toLowerCase().replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const root = document.body.dataset.root || '';
  function paint() {
    const st = MY.get(), ka = norm(g.a), by = r => String(r.a || '').split(' & ').some(x => norm(x) === ka);
    const all = Object.values(st.records || {}), mine = all.filter(by), wants = Object.values(st.wants || {}).filter(by);
    const old = document.getElementById('gpShelf'); if (old) old.remove();
    if (!all.length && !wants.length) return;   // only for people who keep their records here
    const seen = Object.values(st.gigs || {}).filter(x => x.going && x.d < MY.today && norm(x.a) === ka).length;
    fetch(root + 'data/heathen.json').then(r => r.ok ? r.json() : []).catch(() => []).then(hs => {
      const key = (a, t) => norm(a) + '|' + norm(String(t).replace(/\s*\([^)]*\)\s*$/, ''));
      const owned = new Set([...mine, ...wants].map(r => key(String(r.a).split(' & ')[0], r.t)));
      const shop = x => `https://heathenrecords.com.au/products/${encodeURIComponent(x[2])}?utm_source=livelouder&utm_medium=referral&utm_campaign=gig-shelf`;
      const stock = (hs || []).filter(x => norm(x[0]) === ka);
      const wantIn = wants.map(r => [r, stock.find(x => key(x[0], x[1]) === key(String(r.a).split(' & ')[0], r.t))]).filter(x => x[1]);
      const missing = stock.filter(x => !owned.has(key(x[0], x[1]))).slice(0, 2);
      if (!mine.length && !wantIn.length && !missing.length) return;
      const row = (img, html, btn) => `<div class="gsrow">${img ? `<img src="${esc(img)}" alt="">` : '<span class="gsno">💿</span>'}<div>${html}</div>${btn || ''}</div>`;
      let h = '';
      if (mine.length) h += row(mine[0].img, `<b>You own ${mine.slice(0, 3).map(r => esc(r.t)).join(', ')}${mine.length > 3 ? ` and ${mine.length - 3} more` : ''}</b><small>${seen ? `You've seen ${esc(g.a)} live${seen > 1 ? ' ' + seen + ' times' : ''} · ` : ''}<a href="${root}my-gigs.html#records">Your collection</a></small>`);
      wantIn.slice(0, 2).forEach(([r, x]) => { h += row(x[3] || r.img, `<b>On your wantlist: ${esc(r.t)}</b><small>In stock at Heathen Records</small>`, `<a class="gsbtn" href="${esc(shop(x))}" rel="noopener">Get it →</a>`); });
      missing.forEach(x => { h += row(x[3], `<b>${mine.length ? 'Missing from your shelf' : 'For your shelf'}: ${esc(x[1])}</b><small>${esc(x[5] || x[1])} · in stock at Heathen Records</small>`, `<a class="gsbtn" href="${esc(shop(x))}" rel="noopener">Get it →</a>`); });
      acts.insertAdjacentHTML('afterend', `<div class="gpshelf" id="gpShelf"><h3>On your shelf</h3>${h}</div>`);
    });
  }
  paint();
  document.addEventListener('acc', () => setTimeout(paint, 300));
});
