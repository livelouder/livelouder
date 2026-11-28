// Gigs section pages: This weekend, Regional, Venues, On sale and Submit a gig.
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const root = document.body.dataset.root || '/';
  const bar = document.querySelector('.bbar');
  const hh = () => { const h = document.querySelector('header'); if (h) document.documentElement.style.setProperty('--hh', h.offsetHeight + 'px'); };
  hh(); addEventListener('resize', hh);
  const pic = u => !u ? '' : u.startsWith('dz:') ? `https://cdn-images.dzcdn.net/images/artist/${u.slice(3)}/500x500-000000-80-0-0.jpg` : u;
  const t12 = t => { if (!t) return ''; let [h, mi] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + (mi ? ':' + String(mi).padStart(2, '0') : '') + ap; };
  const chipGroup = (el, attr, cb) => el && el.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset[attr]);
  });

  // ---------------------------------------------------------------- This weekend
  const wk = $('wk');
  if (wk) {
    const td = new Date(), tIso = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`;
    const days = wk.dataset.days.split(',').filter(x => x >= tIso), sel = $('wkcity'), gsel = $('wkgenre');
    let day = '', all = [], pics = {a: {}, v: {}};
    const c0 = (window.LL && (LL.city() || LL.guess())) || 'Sydney';
    if ([...sel.options].some(o => o.value === c0)) sel.value = c0;
    const slot = t => !t ? 1 : +t.slice(0, 2) < 17 ? 0 : +t.slice(0, 2) >= 22 ? 2 : 1;
    const slotName = ['Afternoon', 'Evening', 'Late'];
    document.querySelectorAll('#wkdays button[data-d]').forEach(b => { if (b.dataset.d && !days.includes(b.dataset.d)) b.remove(); });
    const face = s => { const u = pic(pics.a[s[3]] || pics.v[s[11]]); return u ? `<span class="gcpic" style="background-image:url(&quot;${esc(u)}&quot;)"></span>` : LLPOSTER.big(s[2], s[12]); };
    const href = s => esc(s[14] || (root + 'artists/' + s[3] + '.html'));
    function render() {
      const c = sel.value, g = gsel.value;
      const mine = all.filter(s => days.includes(s[0]) && s[6] === c && (!g || s[12] === g));
      document.querySelectorAll('#wkdays button[data-d]').forEach(b => { const n = b.querySelector('.bn'); if (n) n.textContent = '· ' + mine.filter(s => s[0] === b.dataset.d).length; });
      const list = mine.filter(s => !day || s[0] === day);
      $('wkcount').textContent = `${list.length} ${list.length === 1 ? 'gig' : 'gigs'} in ${c} ${day ? 'on ' + new Date(day + 'T12:00').toLocaleDateString('en-AU', {weekday: 'long'}) : 'this weekend (' + wk.dataset.label + ')'}`;
      // Pick of the weekend: acts with photos, busiest touring artists first.
      const cnt = {}; all.forEach(s => { cnt[s[3]] = (cnt[s[3]] || 0) + 1; });
      const seen = new Set(), picks = list.filter(s => (pics.a[s[3]]) && !seen.has(s[3]) && seen.add(s[3])).sort((a, b) => cnt[b[3]] - cnt[a[3]]).slice(0, 4);
      $('wkpicks').innerHTML = picks.length ? `<div class="ghead"><h2>Pick of the weekend</h2></div><div class="gcgrid gc4">` + picks.map(s =>
        `<a class="gcard" href="${href(s)}">${face(s)}<span class="gcd"><b>${new Date(s[0] + 'T12:00').toLocaleDateString('en-AU', {weekday: 'short'})}</b><small>${t12(s[1])}</small></span><span class="gcin"><strong>${esc(s[2])}</strong><span>${esc(s[4])}, ${esc(s[5] || s[6])}</span></span></a>`).join('') + '</div>' : '';
      const cols = (day ? [day] : days).map(dIso => {
        const ds = list.filter(s => s[0] === dIso).sort((a, b) => (a[1] || '19').localeCompare(b[1] || '19'));
        const groups = [0, 1, 2].map(k => ds.filter(s => slot(s[1]) === k)).map((xs, k) => !xs.length ? '' :
          `<h4>${slotName[k]}</h4><ul>` + xs.map(s => `<li><a href="${href(s)}">${LLPOSTER.small(s[2], s[12], href(s)).replace(/^<a /, '<span ').replace(/<\/a>$/, '</span>')}<span><strong>${esc(s[2])}</strong><small>${s[1] ? t12(s[1]) + ' · ' : ''}${esc(s[4])}${s[5] && s[5] !== s[6] ? ', ' + esc(s[5]) : ''}</small></span></a></li>`).join('') + '</ul>').join('');
        return `<div class="wkcol"><h3>${new Date(dIso + 'T12:00').toLocaleDateString('en-AU', {weekday: 'long', day: 'numeric', month: 'short'})} <span>${ds.length}</span></h3>${groups || '<p class="note">Nothing listed yet.</p>'}</div>`;
      });
      $('wkcols').innerHTML = cols.join('');
      $('wkcols').classList.toggle('one', !!day);
      $('wkcols').style.setProperty('--n', cols.length);
    }
    sel.addEventListener('change', () => { if (window.LL) LL.setCity(sel.value); render(); });
    gsel.addEventListener('change', render);
    chipGroup($('wkdays'), 'd', d => { day = d; render(); });
    Promise.all([fetch(root + 'gigs.json').then(r => r.json()), fetch(root + 'data/pics.json').then(r => r.json()).catch(() => null)])
      .then(([g, p]) => { all = g; if (p) pics = p; render(); })
      .catch(() => { $('wkcount').textContent = 'Could not load the gigs. Try the city links below.'; });
  }

  // ---------------------------------------------------------------- Regional
  const rcards = $('regcards');
  if (rcards) {
    const cards = [...rcards.querySelectorAll('.pc')], q = $('regq'), more = $('regmore');
    let st = '', open = false, map = null, layer = null;
    const data = JSON.parse(($('regdata') || {}).textContent || '[]');
    function apply() {
      const t = q.value.trim().toLowerCase(); let n = 0;
      cards.forEach(c => { const ok = (!st || c.dataset.st === st) && (!t || c.dataset.n.includes(t)); c.hidden = !ok || (!open && !t && !st && n >= 24); if (ok) n++; });
      $('regcount').textContent = `${n} ${n === 1 ? 'town' : 'towns'}`;
      more.hidden = open || t || st || n <= 24;
      if (layer) { layer.clearLayers(); pins(); }
    }
    function pins() {
      const t = q.value.trim().toLowerCase(), pts = [];
      data.forEach(([nm, sl, s, la, lo, n]) => {
        if ((st && s !== st) || (t && !nm.toLowerCase().includes(t))) return;
        const m = L.circleMarker([la, lo], {radius: Math.min(4 + Math.sqrt(n) * 1.6, 16), color: '#fff', weight: 1.5, fillColor: '#e4002b', fillOpacity: .85});
        m.bindTooltip(`<b>${esc(nm)}</b><br>${n} ${n === 1 ? 'gig' : 'gigs'}`); m.on('click', () => { location.href = `${root}gigs/${sl}.html`; });
        layer.addLayer(m); pts.push([la, lo]);
      });
      if (pts.length) map.fitBounds(pts, {padding: [24, 24], maxZoom: 9});
    }
    if (window.L && $('regmap')) {
      map = L.map('regmap', {scrollWheelZoom: false}).fitBounds([[-43.8, 112.9], [-10.5, 153.8]]);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 18, attribution: '© OpenStreetMap'}).addTo(map);
      if (matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.dataset.theme === 'dark') $('regmap').classList.add('fdark');
      layer = L.layerGroup().addTo(map); pins();
    }
    q.addEventListener('input', apply);
    chipGroup($('regst'), 'st', v => { st = v; apply(); });
    more.addEventListener('click', () => { open = true; apply(); });
  }

  // ---------------------------------------------------------------- Venues
  const vcards = $('vcards');
  if (vcards) {
    const cards = [...vcards.querySelectorAll('.pc')], q = $('vq'), sortSel = $('vsort'), more = $('vmore'), PAGE = 48;
    let c = '', lim = PAGE;
    const home = window.LL ? (LL.city() || LL.guess()) : '';
    const cb = home && document.querySelector(`#vcity button[data-c="${CSS.escape(home)}"]`);
    if (cb) { c = home; document.querySelectorAll('#vcity button').forEach(x => x.classList.toggle('on', x === cb)); }
    function apply() {
      const t = q.value.trim().toLowerCase();
      const by = sortSel.value === 'n' ? (a, b) => a.dataset.n.localeCompare(b.dataset.n) : (a, b) => b.dataset.s - a.dataset.s;
      const ok = cards.filter(x => (!c || x.dataset.c === c) && (!t || x.dataset.n.includes(t))).sort(by);
      cards.forEach(x => { x.hidden = true; });
      ok.forEach((x, i) => { vcards.appendChild(x); x.hidden = i >= lim; });
      $('vcount').textContent = `${ok.length.toLocaleString()} ${ok.length === 1 ? 'venue' : 'venues'}${c ? ' in ' + (c === 'Regional' ? 'regional areas' : c) : ''}`;
      more.hidden = ok.length <= lim;
    }
    q.addEventListener('input', () => { lim = PAGE; apply(); });
    sortSel.addEventListener('change', apply);
    chipGroup($('vcity'), 'c', v => { c = v; lim = PAGE; apply(); });
    more.addEventListener('click', () => { lim += PAGE * 2; apply(); });
    apply();
  }

  // ---------------------------------------------------------------- On sale: follow an artist
  const osf = $('alerts');
  if (osf && osf.classList.contains('osalert')) {
    osf.addEventListener('submit', ev => {
      ev.preventDefault();
      const v = $('osq').value.trim().toLowerCase();
      const o = [...document.querySelectorAll('#osartists option')].find(x => x.value.toLowerCase() === v)
        || [...document.querySelectorAll('#osartists option')].find(x => v && x.value.toLowerCase().startsWith(v));
      const m = $('osmsg'); m.hidden = false;
      if (o) location.href = `${root}artists/${o.dataset.s}.html#follow`;
      else m.textContent = "We couldn't find that artist yet. Try another spelling, or browse the tours.";
    });
  }

  // ---------------------------------------------------------------- Submit a gig: live preview
  const form = document.querySelector('form.gigform');
  if (form && $('sgcard')) {
    const f = n => form.elements[n];
    const hue = n => { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function upd() {
      const a = f('artist').value.trim() || 'Your band', ven = f('venue').value.trim() || 'Venue';
      const city = f('city').value === 'other' ? (f('town').value.trim() || 'your town') : (f('city').value || 'city');
      $('sga').textContent = a; $('sgpn').textContent = a;
      const n = a.length; $('sgpic').className = `gcpic poster ps ps-grit pl-${n <= 9 ? 's' : n <= 18 ? 'm' : n <= 30 ? 'l' : 'xl'}`;
      $('sgpic').style.setProperty('--h', hue(a));
      $('sgw').textContent = `${ven}, ${city}${f('time').value ? ' · ' + t12(f('time').value) : ''}`;
      const dv = f('date').value;
      if (dv) { const [, m, dd] = dv.split('-').map(Number); $('sgd').textContent = dd; $('sgm').textContent = mon[m - 1]; } else { $('sgd').textContent = '–'; $('sgm').textContent = ''; }
    }
    form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
  }
});
