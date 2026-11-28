// My gigs: a visual profile page. Gigs (going, saved, been to), artists, record collection and wantlist (Discogs), settings.
// Data comes from MY (this device, app.js) and, when signed in, the account (account.js keeps MY in sync).
document.addEventListener('DOMContentLoaded', function () {
  const box = document.getElementById('profile');
  if (!box) return;
  const root = document.body.dataset.root || '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const norm = s => String(s).toLowerCase().replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const heathen = q => 'https://heathenrecords.com.au/search?type=product&q=' + encodeURIComponent(q) + '&utm_source=livelouder&utm_medium=referral&utm_campaign=my-gigs';
  const dparts = iso => { const [y, m, d] = iso.split('-').map(Number); return {y, m, d, dt: new Date(y, m - 1, d)}; };
  const today = MY.today;
  const gslug = x => String(x).toLowerCase().replace(/&/g, 'and').replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  const gp = x => x.p || `${root}gig/${gslug(x.id)}.html`;
  const daysTo = iso => Math.round((dparts(iso).dt - dparts(today).dt) / 86400000);
  const when = iso => { const n = daysTo(iso); return n === 0 ? 'Tonight' : n === 1 ? 'Tomorrow' : n > 1 && n < 7 ? 'This ' + dparts(iso).dt.toLocaleDateString('en-AU', {weekday: 'long'}) : dparts(iso).dt.toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short'}); };

  let gigsAll = [], arts = {}, rels = [], tab = 'overview';
  let srch = {q: '', loading: false, results: null, error: ''}, imp = {loading: false, msg: ''};
  const recs = list => Object.values(MY.get()[list] || {});
  let recQ = '', recSort = 'added', recTouring = false, recShown = 60, wantShown = 60;
  const touring = {};
  let startOpen = false, lfm = {loading: false, msg: '', found: null}, dia = null, diaLoading = false, gigUp = '', gigMsg = {}, feed = null, uploading = '', photoMsg = '', people = null, peopleLoading = false, find = {q: '', results: null, loading: false}, shareMsg = '', copied = false;
  const tour = name => touring[norm(name)];

  // ------------------------------------------------ Discogs: pressings and rarity
  // Have/want counts come live from Discogs (straight from the visitor's browser) and are kept for at most
  // 6 hours, as Discogs asks, so badges are always current. Rarity is worked out from how many Discogs
  // collectors own that exact pressing; "in demand" means more people want it than own it.
  const DG = 'https://api.discogs.com', SIX = 6 * 3600 * 1000, sleep = ms => new Promise(r => setTimeout(r, ms));
  let RC = {}; try { RC = JSON.parse(localStorage.getItem('llRare') || '{}'); } catch (e) {}
  const saveRC = () => { try { const now = Date.now(); for (const k in RC) if (now - RC[k].t > SIX) delete RC[k]; localStorage.setItem('llRare', JSON.stringify(RC)); } catch (e) {} };
  const fresh = rid => RC[rid] && Date.now() - RC[rid].t < SIX ? RC[rid] : null;
  async function dg(path) {
    let r;
    try { r = await fetch(DG + path); } catch (e) { r = null; }
    if (r && r.status === 429) throw new Error('slow');
    if (r && r.ok) return r.json();
    // Fallback through our own function (it has a Discogs key) for single releases.
    const m = path.match(/^\/releases\/(\d+)$/);
    if (m) { try { const x = await (await fetch('/.netlify/functions/discogs-user?release=' + m[1])).json(); if (!x.error) return {_lite: x}; } catch (e) {} }
    return null;
  }
  const colourOf = t => { const b = (String(t).match(/\[([^\]]+)\]/) || [])[1]; return (b || String(t).split(',')[0] || '').trim(); };
  function relInfo(j) {
    if (j._lite) { const x = j._lite; return {t: Date.now(), h: x.have, w: x.want, c: x.country, col: '', d: (x.formats || [])[0] || '', l: String((x.labels || [])[0] || '').split(' · ')[0], cat: String((x.labels || [])[0] || '').split(' · ')[1] || '', m: x.master || 0, y: x.year, im: x.image}; }
    const f = (j.formats || []).find(x => x.name === 'Vinyl') || (j.formats || [])[0] || {}, lab = (j.labels || [])[0] || {};
    return {t: Date.now(), h: (j.community || {}).have || 0, w: (j.community || {}).want || 0, c: j.country || '', col: colourOf(f.text || ''), d: (f.descriptions || []).join(', '),
      l: lab.name || '', cat: lab.catno && lab.catno !== 'none' ? lab.catno : '', m: j.master_id || 0, y: j.year || 0, im: ((j.images || [])[0] || {}).uri || ''};
  }
  const TIERS = [['Common', 'c'], ['Uncommon', 'u'], ['Rare', 'r'], ['Very rare', 'vr']];
  const tierOf = h => h < 250 ? 3 : h < 1000 ? 2 : h < 5000 ? 1 : 0;
  // Pressings from this year haven't had time to find their level, so they're "New" rather than rare.
  const THISY = new Date().getFullYear();
  const isNew = (h, y) => +y >= THISY && h < 1000;
  const tierName = (h, y) => isNew(h, y) ? 'New pressing' : TIERS[tierOf(h)][0];
  const rareBadges = (h, w, y) => `<span class="vb vb-${isNew(h, y) ? 'c' : TIERS[tierOf(h)][1]}">${tierName(h, y)}</span>${w > h && h > 0 ? '<span class="vb vb-hot">🔥 In demand</span>' : ''}`;
  // Where a pressing sits on the Common → Very rare bar (each tier gets a quarter).
  const meterPos = h => { const L = Math.log10, x = Math.max(1, h);
    if (x < 250) return 75 + 25 * (1 - L(x) / L(250));
    if (x < 1000) return 50 + 25 * (1 - (L(x) - L(250)) / (L(1000) - L(250)));
    if (x < 5000) return 25 + 25 * (1 - (L(x) - L(1000)) / (L(5000) - L(1000)));
    return 25 * (1 - Math.min(1, (L(x) - L(5000)) / (L(500000) - L(5000)))); };
  const FLAG = {Australia: '🇦🇺', Japan: '🇯🇵', US: '🇺🇸', UK: '🇬🇧', Europe: '🇪🇺', Germany: '🇩🇪', Canada: '🇨🇦', 'New Zealand': '🇳🇿', France: '🇫🇷', Netherlands: '🇳🇱'};
  const flag = c => '';  // flag emoji show as letters on Windows, so country names only
  const n0 = x => Number(x || 0).toLocaleString('en-AU');
  const discogsNote = rid => `<p class="dgnote">Data provided by <a href="https://www.discogs.com/${rid && rid[0] === 'm' ? 'master' : 'release'}/${rid ? esc(rid.slice(1)) : ''}" rel="noopener">Discogs</a>. Live Louder uses Discogs' API but isn't affiliated with, sponsored or endorsed by Discogs.</p>`;
  // Background queue: checks records' rarity a few at a time (Discogs allows about 25 lookups a minute).
  let rq = [], running = false, qTotal = 0;
  function needRarity(list) {
    let added = 0;
    list.forEach(r => { if (r.rid && r.rid[0] === 'r' && !fresh(r.rid) && !rq.includes(r.rid)) { rq.push(r.rid); added++; } });
    if (added) { qTotal = Math.max(qTotal, rq.length); runQ(); }
  }
  async function runQ() {
    if (running) return; running = true;
    while (rq.length) {
      const rid = rq[0];
      try { const j = await dg('/releases/' + rid.slice(1)); if (j) { RC[rid] = relInfo(j); saveRC(); } rq.shift(); bump(); }
      catch (e) { await sleep(65000); continue; }
      await sleep(2500);
    }
    running = false; qTotal = 0; bump();
  }
  let bt;
  function bump() {
    clearTimeout(bt);
    bt = setTimeout(() => {
      const a = document.activeElement;
      if (a && (a.matches('input,textarea,select'))) return;
      if (document.querySelector('dialog[open]')) return;
      if (['records', 'wantlist', 'recstats'].includes(tab)) { const y = scrollY; render(); scrollTo(0, y); }
    }, 900);
  }
  const rareKnown = list => list.map(r => [r, fresh(r.rid)]).filter(x => x[1]);

  // ------------------------------------------------ choose your pressing (all the vinyl versions of an album)
  let pk = null;
  function pickerDlg() {
    let d = document.getElementById('pickDlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'pickDlg'; d.className = 'pickdlg'; box.appendChild(d); d.addEventListener('close', () => { pk = null; render(); }); }
    return d;
  }
  async function openPicker(base, opts) {
    pk = Object.assign({base, versions: null, f: 'all', sort: 'rare', err: '', swap: '', list: 'records', loadingCol: false}, opts || {});
    const d = pickerDlg(); paintPicker(); d.showModal ? d.showModal() : d.setAttribute('open', '');
    const mid = String(base.rid).slice(1);
    try {
      let j = await dg(`/masters/${mid}/versions?per_page=100&format=Vinyl&sort=released`);
      if (j && !(j.versions || []).length) j = await dg(`/masters/${mid}/versions?per_page=100&sort=released`);
      pk.versions = ((j && j.versions) || []).map(v => ({id: v.id, title: v.title, fmt: v.format || '', label: v.label || '', c: v.country || '', y: /^[12]\d{3}/.test(String(v.released || '')) ? String(v.released).slice(0, 4) : '',
        cat: String(v.catno || '').split(',')[0].trim(), thumb: v.thumb || '', h: ((v.stats || {}).community || {}).in_collection || 0, w: ((v.stats || {}).community || {}).in_wantlist || 0}));
      if (!pk.versions.length) pk.err = "Discogs doesn't list separate pressings for this one. Add the album instead.";
    } catch (e) { pk.err = 'Discogs is busy. Give it a minute and try again.'; pk.versions = []; }
    paintPicker(); colours();
  }
  function pkList() {
    if (!pk || !pk.versions) return [];
    const odd = x => /Test Pressing|Promo|White Label|Unofficial/i.test(x.fmt);
    let v = pk.f === 'odd' ? pk.versions.filter(odd) : pk.versions.filter(x => !odd(x));
    if (pk.f === 'ltd') v = v.filter(x => /Limited/i.test(x.fmt));
    else if (pk.f === 'orig') v = v.filter(x => !/Reissue|Repress/i.test(x.fmt));
    else if (pk.f.startsWith('c:')) v = v.filter(x => x.c === pk.f.slice(2));
    const by = {rare: (a, b) => a.h - b.h, old: (a, b) => (a.y || '9999').localeCompare(b.y || '9999'), new: (a, b) => (b.y || '').localeCompare(a.y || ''), pop: (a, b) => b.h - a.h};
    return v.sort(by[pk.sort]);
  }
  async function colours() {
    // Colour names (e.g. "Portofino Orange Glitter") are on each pressing's own page: look up the first dozen.
    if (!pk || pk.loadingCol) return; pk.loadingCol = true;
    const me0 = pk;
    for (const v of pkList().slice(0, 12)) {
      if (pk !== me0) return;
      const rid = 'r' + v.id;
      if (fresh(rid)) continue;
      try { const j = await dg('/releases/' + v.id); if (j) { RC[rid] = relInfo(j); saveRC(); paintPicker(); } } catch (e) { break; }
      await sleep(2500);
    }
    if (pk === me0) pk.loadingCol = false;
  }
  function pressRec(v) {
    const b = pk.base, i = fresh('r' + v.id) || {};
    return {rid: 'r' + v.id, a: b.a, t: b.t, y: +v.y || b.y || 0, img: i.im || v.thumb || b.img, g: b.g || '', f: v.fmt, l: v.label, c: v.c, cat: v.cat, col: i.col || ''};
  }
  function paintPicker() {
    const d = document.getElementById('pickDlg'); if (!d || !pk) return;
    const b = pk.base, st = MY.get(), list = pkList();
    const countries = pk.versions ? Object.entries(pk.versions.filter(v => v.c).reduce((o, v) => (o[v.c] = (o[v.c] || 0) + 1, o), {})).sort((a, c) => c[1] - a[1]).slice(0, 5) : [];
    const chip = (k, label) => `<button type="button" class="${pk.f === k ? 'on' : ''}" data-pkf="${esc(k)}">${label}</button>`;
    const addBtns = (rec, primary) => pk.swap ? `<button type="button" class="vbtn sm red" data-pkswap='${esc(JSON.stringify(rec))}'>Use this one</button>`
      : `<button type="button" class="addbtn" data-addrec="${esc(JSON.stringify(rec))}" data-list="records">+ Collection</button><button type="button" class="addbtn" data-addrec="${esc(JSON.stringify(rec))}" data-list="wants">+ Wantlist</button>`;
    const albumRec = {rid: b.rid, a: b.a, t: b.t, y: b.y, img: b.img, g: b.g || '', f: b.f || ''};
    const rows = list.map(v => { const i = fresh('r' + v.id) || {}, rec = pressRec(v), mine = st.records['r' + v.id] ? 'In your collection' : st.wants['r' + v.id] ? 'On your wantlist' : '';
      return `<li><img src="${esc(i.im || v.thumb || b.img)}" alt="" loading="lazy"><div class="vi"><b>${i.col ? esc(i.col) : esc(v.fmt.replace(/^LP, Album,? ?/, '') || 'Standard black vinyl')}</b>
        <small>${flag(v.c)}${esc(v.c)} · ${esc(v.label)}${v.cat ? ' · ' + esc(v.cat) : ''}${v.y ? ' · ' + esc(v.y) : ''}${/Limited/i.test(v.fmt) ? ' · Limited' : ''}${/Reissue|Repress/i.test(v.fmt) ? ' · Repress' : ''}</small>
        ${rareBadges(v.h, v.w, v.y)}<small class="hw">${n0(v.h)} have · ${n0(v.w)} want</small>${mine ? `<small class="mine">✓ ${mine}</small>` : ''}</div><div class="vbt">${addBtns(rec)}</div></li>`; }).join('');
    d.innerHTML = `<form method="dialog" class="sclose"><button aria-label="Close">×</button></form>
      <div class="vsh">${b.img ? `<img src="${esc(b.img)}" alt="">` : ''}<div><h2>${esc(b.t)}</h2><p>${esc(b.a)}${b.y ? ' · ' + b.y : ''}${pk.versions ? ` · <b>${pk.versions.length} ${pk.versions.length === 1 ? 'version' : 'versions'}</b> on Discogs` : ''}</p>
        <p class="note" style="margin-top:4px">${pk.swap ? 'Which pressing do you have?' : 'Pick the exact pressing you have or want.'}</p></div></div>
      ${pk.versions && pk.versions.length > 1 ? `<div class="vfil">${chip('all', 'All ' + pk.versions.length)}${pk.versions.some(v => /Limited/i.test(v.fmt)) ? chip('ltd', 'Limited') : ''}${chip('orig', 'Original pressings')}${countries.length > 1 ? countries.map(([c]) => chip('c:' + c, flag(c) + esc(c))).join('') : ''}${pk.versions.some(x => /Test Pressing|Promo|White Label|Unofficial/i.test(x.fmt)) ? chip('odd', 'Promos &amp; test pressings') : ''}
        <select data-pksort aria-label="Sort"><option value="rare"${pk.sort === 'rare' ? ' selected' : ''}>Rarest first</option><option value="pop"${pk.sort === 'pop' ? ' selected' : ''}>Most common first</option><option value="old"${pk.sort === 'old' ? ' selected' : ''}>Oldest first</option><option value="new"${pk.sort === 'new' ? ' selected' : ''}>Newest first</option></select></div>` : ''}
      <ul class="vlist">${pk.swap ? '' : `<li class="any"><img src="${esc(b.img)}" alt=""><div class="vi"><b>Not sure which one? Just add the album</b><small>You can pick the exact pressing later. We'll still show their tours and new vinyl.</small></div><div class="vbt">${addBtns(albumRec)}</div></li>`}
        ${pk.versions === null ? '<li><p class="note">Loading the pressings from Discogs…</p></li>' : rows}${pk.err ? `<li><p class="note">${esc(pk.err)}</p></li>` : ''}</ul>
      ${discogsNote(b.rid)}`;
    MY.paint();
  }

  // ------------------------------------------------ Heathen Records stock (data/heathen.json, refreshed every build)
  let HS = null, HSi = {};
  const hkey = (a, t) => norm(a) + '|' + norm(String(t).replace(/\s*\([^)]*\)\s*$/, ''));
  function loadStock() {
    if (HS) return; HS = [];
    fetch(root + 'data/heathen.json').then(r => r.ok ? r.json() : []).catch(() => []).then(j => { HS = j || []; HS.forEach(x => { HSi[hkey(x[0], x[1])] = x; }); if (HS.length) render(); });
  }
  const stockFor = r => r && HSi[hkey(String(r.a).split(' & ')[0], r.t)];
  const shopUrl = (x, camp) => `https://heathenrecords.com.au/products/${encodeURIComponent(x[2])}?utm_source=livelouder&utm_medium=referral&utm_campaign=${camp || 'wantlist'}`;

  // ------------------------------------------------ now spinning: plays (from your "Now spinning" posts)
  let plays = null;
  function loadPlays(force) { if (!me() || (plays && !force)) return Promise.resolve(); return ACC.rpc('my_plays').then(r => { plays = r.data || {}; }); }
  const ago2 = t => { const d = Math.round((Date.now() - new Date(t)) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? d + ' days ago' : new Date(t).toLocaleDateString('en-AU', {day: 'numeric', month: 'short'}); };

  // ------------------------------------------------ scan a barcode (phone camera), then pick the pressing
  let scan = null;
  async function openScanner() {
    let d = document.getElementById('scanDlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'scanDlg'; d.className = 'scandlg'; box.appendChild(d); d.addEventListener('close', stopScan); }
    scan = {stream: null, done: false, timer: 0, reader: null};
    d.innerHTML = `<form method="dialog" class="sclose"><button aria-label="Close">×</button></form>
      <div class="scanview"><video id="scanVid" playsinline muted></video><div class="scanframe"><i></i></div><p class="scanhint">Point your camera at the barcode on the back of the sleeve</p></div>
      <form class="scanman" data-scanman><input name="bc" inputmode="numeric" placeholder="Or type the barcode numbers" aria-label="Barcode number" autocomplete="off"><button class="btn sm">Look up</button></form>
      <div id="scanRes"></div>${discogsNote('')}`;
    d.showModal ? d.showModal() : d.setAttribute('open', '');
    const vid = document.getElementById('scanVid');
    try {
      scan.stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment', width: {ideal: 1280}}, audio: false});
      vid.srcObject = scan.stream; await vid.play();
    } catch (e) { d.querySelector('.scanview').innerHTML = '<p class="note scanno">We couldn\'t open your camera. Check the browser has permission, or type the barcode numbers below.</p>'; return; }
    if ('BarcodeDetector' in window) {
      const det = new BarcodeDetector({formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e']});
      const tick = async () => { if (!scan || scan.done) return; try { const c = await det.detect(vid); if (c.length) return found(c[0].rawValue); } catch (e) {} scan.timer = setTimeout(tick, 250); };
      tick();
    } else {
      // iPhone and some other browsers: a small barcode reader, loaded only when someone scans.
      try {
        if (!window.ZXing) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
        const hints = new Map(); hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_E]);
        scan.reader = new ZXing.BrowserMultiFormatReader(hints);
        scan.reader.decodeFromVideoElementContinuously(vid, res => { if (res && scan && !scan.done) found(res.getText()); });
      } catch (e) { const h = d.querySelector('.scanhint'); if (h) h.textContent = 'Scanning isn\'t available in this browser. Type the barcode numbers below instead.'; }
    }
  }
  function stopScan() {
    if (!scan) return; scan.done = true; clearTimeout(scan.timer);
    try { if (scan.reader) scan.reader.reset(); } catch (e) {}
    if (scan.stream) scan.stream.getTracks().forEach(t => t.stop());
    scan = null;
  }
  async function found(code) {
    if (scan) { scan.done = true; if (navigator.vibrate) navigator.vibrate(60); }
    const res = document.getElementById('scanRes'); if (!res) return;
    res.innerHTML = `<p class="note">Looking up ${esc(code)} on Discogs…</p>`;
    let j = {};
    try { j = await (await fetch('/.netlify/functions/discogs-user?barcode=' + encodeURIComponent(code))).json(); } catch (e) { j = {error: "Couldn't reach Discogs. Try again."}; }
    if (j.error || !(j.results || []).length) { res.innerHTML = `<p class="note">${j.error ? esc(j.error) : `Nothing on Discogs with barcode ${esc(code)}. Try searching by name instead.`}</p><button type="button" class="vbtn sm" data-rescan>Scan again</button>`; return; }
    const list = j.results.slice(0, 8), st = MY.get();
    res.innerHTML = `<p class="scanok">✓ Found ${list.length === 1 ? 'it' : list.length + ' pressings with that barcode'}</p><ul class="vlist">${list.map(x => {
      const rec = {rid: x.rid, a: x.a, t: x.t, y: x.y, img: x.img, g: x.g, f: x.f, l: x.l, c: x.c, cat: x.cat}, j2 = esc(JSON.stringify(rec)), tr = x.a.split(' & ').map(tour).find(Boolean);
      return `<li><img src="${esc(x.img)}" alt=""><div class="vi"><b>${esc(x.t)}</b><small>${esc(x.a)} · ${esc([x.c, x.l, x.cat, x.y || ''].filter(Boolean).join(' · '))}</small>${rareBadges(x.have, x.want, x.y)}<small class="hw">${n0(x.have)} have · ${n0(x.want)} want</small>${tr ? `<small class="mine">🎟 ${esc(tr.name)} ${tr.shows === 1 ? 'has a show' : 'are touring'}: next in ${esc(tr.city)}</small>` : ''}</div>
        <div class="vbt"><button type="button" class="addbtn" data-addrec="${j2}" data-list="records">+ Collection</button><button type="button" class="addbtn" data-addrec="${j2}" data-list="wants">+ Wantlist</button></div></li>`; }).join('')}</ul><button type="button" class="vbtn sm" data-rescan style="margin:10px 0 0">Scan another</button>`;
    MY.paint();
  }

  // ------------------------------------------------ share my crate: a picture sized for Instagram stories
  async function shareCrate() {
    const col = recs('records'); if (!col.length) return;
    const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(W * .3, H * .1, 50, W * .5, H * .5, H * .9); g.addColorStop(0, '#e2391f'); g.addColorStop(.45, '#5a1208'); g.addColorStop(1, '#120606');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    try { await document.fonts.load('400 120px Anton'); } catch (e) {}
    const pr = prof(), u = me(), md = (u && u.user_metadata) || {};
    const name = (pr.display_name || md.full_name || pr.username || 'My').split(' ')[0];
    x.fillStyle = '#fff'; x.font = '400 110px Anton, Impact, sans-serif'; x.textBaseline = 'top';
    x.fillText((name + "'s crate").toUpperCase(), 80, 90);
    const known = rareKnown(col).filter(([, i]) => !isNew(i.h, i.y)).sort((a, b) => a[1].h - b[1].h);
    const picks = [...known.map(k => k[0]), ...col.slice().sort((a, b) => (b.add || '').localeCompare(a.add || ''))].filter((r, i, arr) => r.img && arr.indexOf(r) === i).slice(0, 9);
    const load = src => new Promise(ok => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => ok(null); im.src = '/.netlify/functions/img?u=' + encodeURIComponent(src); });
    const ims = await Promise.all(picks.map(r => load(r.img)));
    const S = 296, G = 16, X0 = 80, Y0 = 260;
    ims.forEach((im, i) => { const cx = X0 + (i % 3) * (S + G), cy = Y0 + Math.floor(i / 3) * (S + G); x.fillStyle = '#222'; x.fillRect(cx, cy, S, S); if (im) x.drawImage(im, cx, cy, S, S); });
    const yB = Y0 + 3 * (S + G) + 40;
    x.font = '400 230px Anton, Impact, sans-serif'; x.fillText(col.length.toLocaleString(), 80, yB);
    x.font = '700 50px Archivo, Arial, sans-serif'; x.fillText(col.length === 1 ? 'record' : 'records', 90, yB + 250);
    const dec = {}; col.forEach(r => { if (r.y > 1900) { const k = Math.floor(r.y / 10) * 10; dec[k] = (dec[k] || 0) + 1; } });
    const topDec = Object.entries(dec).sort((a, b) => b[1] - a[1])[0];
    const lines = [];
    if (topDec) lines.push(`Mostly the ${topDec[0]}s (${Math.round(topDec[1] / col.length * 100)}%)`);
    if (known[0]) lines.push(`Rarest: ${known[0][0].t}`);
    const seenA = [...new Set(lists().been.map(z => norm(z.a)))].filter(a => col.some(r => norm(r.a) === a));
    if (seenA.length) lines.push(`Seen ${seenA.length} of these artists live`);
    const topArt = Object.entries(col.reduce((o, r) => (o[r.a] = (o[r.a] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1])[0];
    if (topArt && topArt[1] > 1) lines.push(`Most collected: ${topArt[0]}`);
    x.font = '600 46px Archivo, Arial, sans-serif'; x.fillStyle = 'rgba(255,255,255,.92)';
    lines.slice(0, 4).forEach((l, i) => x.fillText(l.length > 38 ? l.slice(0, 37) + '…' : l, 80, yB + 350 + i * 66));
    x.font = '400 64px Anton, Impact, sans-serif'; x.fillStyle = '#fff'; x.fillText('LIVE', 80, H - 150);
    const lw = x.measureText('LIVE ').width; x.fillStyle = '#ff8a73'; x.fillText('LOUDER', 80 + lw, H - 150);
    x.font = '600 34px Archivo, Arial, sans-serif'; x.fillStyle = 'rgba(255,255,255,.75)'; x.fillText('livelouder.com.au' + (pr.username && pr.share ? '/u/' + pr.username : ''), 80, H - 70);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
    const file = new File([blob], 'my-crate.png', {type: 'image/png'});
    if (navigator.canShare && navigator.canShare({files: [file]})) { try { await navigator.share({files: [file], title: 'My crate on Live Louder'}); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-crate.png'; document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------ pieces
  const photo = (slug, name) => { const a = arts[slug]; return a && a[1] ? a[1] : ''; };
  function art(slug, name, cls) {
    const p = photo(slug, name);
    return p ? `<span class="${cls}" style="background-image:url('${esc(p)}')"></span>`
             : `<span class="${cls} poster" style="--h:${hue(name)}"><b>${esc((name.match(/[A-Za-z0-9]+/g) || ['?']).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</b></span>`;
  }
  function gigCard(x, mine) {
    const p = dparts(x.d), past = x.d < today;
    const going = mine && !past ? `<button class="going" type="button" data-id="${esc(x.id)}" aria-pressed="${!!x.going}">${x.going ? '✓ Going' : "I'm going"}</button>` : '';
    const save = `<button class="save" type="button" data-gig="${esc(JSON.stringify({id: x.id, d: x.d, tm: x.tm, a: x.a, s: x.s, v: x.v, c: x.c, u: x.u, vs: x.vs, p: x.p}))}" aria-pressed="false" aria-label="Save">♡</button>`;
    return `<article class="gcard${past ? ' past' : ''}"><a class="gimg" href="${esc(gp(x))}">${art(x.s, x.a, 'gph')}
      <span class="gdate"><b>${p.d}</b>${MON[p.m - 1]}</span>${past ? '<span class="gbadge">Been there</span>' : x.going ? '<span class="gbadge on">Going</span>' : ''}</a>
      <div class="gbody"><a class="gname" href="${esc(gp(x))}">${esc(x.a)}</a>
      <span class="gwhen">${past ? p.dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'}) : esc(when(x.d))}${x.tm && !past ? ' · ' + esc(x.tm) : ''}</span>
      <span class="gwhere">${esc(x.v)}, ${esc(x.c)}</span>
      <div class="gact">${past ? '' : `<a class="tix" href="${esc(x.u)}" rel="noopener">Tickets</a>`}${going}${save}</div></div></article>`;
  }
  function artistTile(slug, name, extra) {
    const a = arts[slug], following = !!MY.get().artists[slug];
    const next = a && a[3] ? `${esc(a[4])} · ${esc(dparts(a[3]).dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short'}))}${a[5] > 1 ? ` · ${a[5]} shows` : ''}` : 'No Australian dates yet';
    return `<div class="atile"><a href="${root}artists/${esc(slug)}.html">${art(slug, name, 'aph')}<strong>${esc(name)}</strong></a>
      <span class="anext${a && a[3] ? ' on' : ''}">${extra || next}</span>
      <button class="saveartist" type="button" data-artist="${esc(slug)}" data-name="${esc(name)}" aria-pressed="${following}">${following ? '♥ Following' : '♡ Follow'}</button></div>`;
  }
  function recCard(r, list) {
    const t = r.a.split(' & ').map(tour).find(Boolean), i = fresh(r.rid), seen = seenBy(r.a);
    return `<button class="rcard" type="button" data-rec="${esc(r.rid)}" data-from="${list}"><span class="rcv">${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : `<span class="rblank" style="--h:${hue(r.t)}">${esc(r.t.slice(0, 2).toUpperCase())}</span>`}
      <span class="rtags">${i ? rareBadges(i.h, i.w, i.y || r.y) : ''}</span><span class="rtl">${list === 'wants' && stockFor(r) ? '<span class="vpill g">✓ In stock at Heathen</span>' : ''}${seen ? `<span class="vpill r">Seen live${seen > 1 ? ' ×' + seen : ''}</span>` : ''}${t ? '<span class="vpill">🎟 Touring</span>' : ''}</span></span>
      <strong>${esc(r.t)}</strong><span>${esc(r.a)}</span><span class="rsub">${i && i.c ? flag(i.c) + esc(i.c) + ' · ' : r.c ? flag(r.c) + esc(r.c) + ' · ' : ''}${r.y ? r.y : ''}${r.rid[0] === 'm' && list !== 'search' ? '<em class="rpick">Pick pressing</em>' : ''}</span></button>`;
  }
  // How many times you've been to see this artist (from your gig history).
  function seenBy(a) { const k = norm(a); return lists().been.filter(x => norm(x.a) === k).length; }
  const empty = (icon, title, text, btn) => `<div class="empty"><div class="eicon" aria-hidden="true">${icon}</div><h3>${title}</h3><p>${text}</p>${btn || ''}</div>`;
  const head = (h, more) => `<div class="shead"><h2>${h}</h2>${more || ''}</div>`;
  const linkForm = big => `<form class="dgform${big ? ' big' : ''}" data-dgform><input name="u" placeholder="Your Discogs username" aria-label="Discogs username" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(MY.get().discogs || '')}"><button class="btn ghost">${imp.loading ? 'Importing…' : 'Import from Discogs'}</button></form>${imp.msg ? `<p class="note impmsg">${imp.msg}</p>` : ''}`;
  const searchForm = (ph) => `<form class="recsearch" data-recsearch role="search"><input name="q" type="search" placeholder="${ph || 'Search any album or artist to add it'}" aria-label="Search records" value="${esc(srch.q)}" autocomplete="off"><button class="btn">Search</button></form>`;
  function results() {
    if (srch.loading) return `<div class="loading"><span></span><span></span><span></span><span></span><p>Searching…</p></div>`;
    if (srch.error) return `<p class="err">${esc(srch.error)}</p>`;
    if (!srch.results) return '';
    if (!srch.results.length) return `<p class="note">No records found for "${esc(srch.q)}". Try the artist name, or artist and album.</p>`;
    return `<div class="sres"><div class="shead"><h3>Results for "${esc(srch.q)}"</h3><button type="button" class="linkish" data-clearsearch>Clear</button></div><div class="rgrid">` +
      srch.results.map(r => { const j = esc(JSON.stringify({rid: r.rid, a: r.a, t: r.t, y: r.y, img: r.img, g: r.g, f: r.f}));
        return `<div class="rres"><button class="rcard" type="button" data-rec="${esc(r.rid)}" data-from="search">${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : `<span class="rblank" style="--h:${hue(r.t)}">${esc(r.t.slice(0, 2).toUpperCase())}</span>`}
          ${r.a.split(' & ').map(tour).find(Boolean) ? '<span class="rtour">Touring</span>' : ''}<strong>${esc(r.t)}</strong><span>${esc(r.a)}${r.y ? ' · ' + r.y : ''}</span></button>
          <div class="radd">${r.rid[0] === 'm' ? `<button type="button" class="addbtn on" data-pickfor="${j}">+ Add · choose pressing</button>` : `<button type="button" class="addbtn" data-addrec="${j}" data-list="records">+ Collection</button><button type="button" class="addbtn" data-addrec="${j}" data-list="wants">+ Wantlist</button>`}</div></div>`; }).join('') + '</div></div>';
  }

  // ------------------------------------------------ sections
  function lists() {
    const all = Object.values(MY.get().gigs).sort((a, b) => a.d.localeCompare(b.d));
    return {all, going: all.filter(x => x.going && x.d >= today), saved: all.filter(x => !x.going && x.d >= today), been: all.filter(x => x.d < today).reverse()};
  }
  function hero() {
    const u = window.ACC && ACC.user(), md = (u && u.user_metadata) || {}, L = lists(), st = MY.get();
    const av = document.getElementById('pAv'), pr = prof(), pic = pr.avatar_url || md.avatar_url;
    if (pic) av.innerHTML = `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer">`;
    else av.textContent = u ? (pr.display_name || md.full_name || u.email || '?')[0].toUpperCase() : '♥';
    const heroEl = document.getElementById('pHero');
    // Their own colour for the default cover and the photo circle (same colour friends see), from their username.
    const seed = pr.username || (u && u.email) || 'live louder';
    av.style.setProperty('--h', hue(seed)); heroEl.style.setProperty('--h', hue(seed));
    heroEl.classList.toggle('hasbanner', !!pr.banner_url);
    ['cv', 'cv0', 'cv1', 'cv2'].forEach(c => heroEl.classList.remove(c));
    if (!pr.banner_url) heroEl.classList.add('cv', 'cv' + (hue(seed) % 3));
    heroEl.style.backgroundImage = pr.banner_url ? `url('${pr.banner_url.replace(/'/g, '%27')}')` : '';
    const cam = document.getElementById('pCam'), cov = document.getElementById('pCover');
    cam.hidden = cov.hidden = !u;
    cam.textContent = uploading === 'avatar' ? '…' : '📷';
    cov.textContent = uploading === 'banner' ? 'Uploading…' : pr.banner_url ? '📷 Change cover' : '📷 Add a cover photo';
    document.getElementById('pName').textContent = u ? (pr.display_name || md.full_name || (u.email || '').split('@')[0]) : 'My gigs';
    document.getElementById('pHandle').innerHTML = u && pr.username ? `@${esc(pr.username)}${pr.share ? '' : ' · <span class="ppriv">🔒 Private profile</span>'}` : '';
    const bits = [pr.bio ? esc(pr.bio) : '', pr.city ? `📍 ${esc(pr.city)}` : ''].filter(Boolean);
    document.getElementById('pSub').innerHTML = u ? (bits.length ? bits.join(' <span class="dotsep">·</span> ') : '<a href="#settings">+ Add a short bio</a>')
      : 'Saved on this device. Sign in to keep it everywhere, post updates and see what your friends are going to.';
    document.getElementById('pCta').innerHTML = u ? `<a class="btn ghost sm" href="#settings">Edit profile</a>${pr.share && pr.username ? `<button type="button" class="btn ghost sm" data-sharelink>${copied ? 'Link copied ✓' : 'Share'}</button>` : ''}`
      : '<button type="button" class="btn" data-signin>Sign in</button>';
    const stat = (n, l, t) => n ? `<a href="#${t}"><b>${Number(n).toLocaleString()}</b> ${l}</a>` : '';
    document.getElementById('pStats').innerHTML = [stat(L.been.length, 'seen live', 'seen'), stat(L.going.length, 'going', 'gigs'), stat(L.saved.length, 'saved', 'gigs'),
      stat(Object.keys(st.artists).length, Object.keys(st.artists).length === 1 ? 'artist' : 'artists', 'artists'), stat(recs('records').length, 'records', 'records'),
      stat(people ? people.following.length : 0, 'following', 'friends'), stat(people ? (people.followers || []).length + (people.private_followers || 0) : 0, 'followers', 'friends')].filter(Boolean).join('');
  }

  // ------------------------------------------------ one-click start
  const followed = () => Object.keys(MY.get().artists || {}).length;
  function followMany(list) {
    const st = MY.get(), add = [];
    list.forEach(x => { if (!st.artists[x.slug]) { st.artists[x.slug] = x.name; add.push(x); } });
    MY.save(); MY.paint();
    if (add.length && window.ACC) ACC.push('artists', 'add', add);
    return add.length;
  }
  function popular() {
    return Object.entries(arts).filter(([, a]) => a[3]).sort((a, b) => (!!b[1][1] - !!a[1][1]) || b[1][5] - a[1][5]).slice(0, 18);
  }
  function startCard() {
    const n = followed();
    if (!startOpen && (n >= 3 || localStorage.getItem('llStartDone'))) return '';
    const chips = popular().map(([sl, a]) => {
      const on = !!MY.get().artists[sl];
      return `<button class="pickart${on ? ' on' : ''}" type="button" data-pick="${esc(sl)}" data-name="${esc(a[0])}" aria-pressed="${on}">${art(sl, a[0], 'paph')}<span>${esc(a[0])}</span></button>`;
    }).join('');
    return `<div class="startcard" id="start"><div class="shead"><h2>Make Live Louder yours</h2><button type="button" class="linkish" data-startdone>${n ? 'Done' : 'Not now'}</button></div>
      <p class="note">Follow your artists and we'll show their gigs first, and email you when they announce a tour or tickets go on sale.</p>
      <div class="startgrid">
        <div class="startbox"><h3>① Bring your music</h3>
          <form class="dgform" data-lfm><input name="u" placeholder="Your Last.fm username" aria-label="Last.fm username" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn ghost">${lfm.loading ? 'Looking…' : 'Follow my top artists'}</button></form>
          ${lfm.msg ? `<p class="note impmsg">${lfm.msg}</p>` : '<p class="note">Uses your Last.fm listening history (works with Spotify and Apple Music if you scrobble).</p>'}
          ${linkForm()}</div>
        <div class="startbox"><h3>② Or tap who you love</h3><div class="pickgrid">${chips}</div></div>
      </div>${n ? `<p class="note"><b>You're following ${n} ${n === 1 ? 'artist' : 'artists'}.</b> <a href="#artists">See them →</a></p>` : ''}</div>`;
  }
  async function importLastfm(u) {
    lfm = {loading: true, msg: '', found: null}; render();
    let j = {};
    try { j = await (await fetch('/.netlify/functions/lastfm?u=' + encodeURIComponent(u))).json(); } catch (e) { j = {error: "Couldn't reach Last.fm. Try again."}; }
    if (j.error) { lfm = {loading: false, msg: esc(j.error)}; render(); return; }
    const byName = {};
    Object.entries(arts).forEach(([sl, a]) => { byName[norm(a[0])] = sl; });
    const list = j.artists.slice(0, 150).map(a => ({slug: byName[norm(a.name)] || gslug(a.name), name: a.name}));
    const touringN = list.filter(x => arts[x.slug] && arts[x.slug][3]).length;
    const added = followMany(list);
    lfm = {loading: false, msg: `Done! Following ${added} new ${added === 1 ? 'artist' : 'artists'} from your Last.fm. <b>${touringN} of them ${touringN === 1 ? 'has' : 'have'} Australian dates coming up.</b> We'll tell you when the others tour.`};
    render();
  }

  // ------------------------------------------------ gig diary (rate the gigs you went to, add photos)
  function loadDiary(force) {
    if (!me() || diaLoading || (dia && !force)) return;
    diaLoading = true;
    ACC.diary().then(d => { dia = d || {}; diaLoading = false; render(); });
  }
  const starBtns = (id, n) => `<span class="rate" role="group" aria-label="Rate this gig">${[1, 2, 3, 4, 5].map(i => `<button type="button" class="${i <= n ? 'on' : ''}" data-rate="${i}" data-id="${esc(id)}" aria-label="${i} star${i > 1 ? 's' : ''}">★</button>`).join('')}</span>`;
  function diaryCard(x) {
    const p = dparts(x.d), d = (dia && dia[x.id]) || {photos: []};
    const photos = (d.photos || []).map(ph => `<span class="dph"><img src="${esc(ph.url)}" alt="" loading="lazy">${ph.status === 'pending' ? '<i>Checking</i>' : ph.status === 'hidden' ? '<i>Hidden</i>' : ''}<button type="button" data-rmgph="${esc(ph.id)}" aria-label="Remove photo">×</button></span>`).join('');
    const canAdd = me() && (d.photos || []).length < 4;
    return `<article class="dcard"><a class="gimg" href="${esc(gp(x))}">${art(x.s, x.a, 'gph')}<span class="gdate"><b>${p.d}</b>${MON[p.m - 1]}</span></a>
      <div class="dbody"><a class="gname" href="${esc(gp(x))}">${esc(x.a)}</a><span class="gwhere">${esc(x.v)}, ${esc(x.c)} · ${p.dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'})}</span>
      ${me() ? `${starBtns(x.id, d.rating || 0)}
        <form class="dnote" data-note="${esc(x.id)}"><input name="t" maxlength="280" placeholder="${d.review ? '' : 'How was it? One line for your gig diary'}" value="${esc(d.review || '')}" aria-label="Note about this gig"><button class="linkish small">${gigMsg[x.id] || 'Save'}</button></form>
        <div class="dphotos">${photos}${canAdd ? `<button type="button" class="addph" data-addgph="${esc(x.id)}">${gigUp === x.id ? 'Uploading…' : '+ Photo'}</button>` : ''}</div>
        <a class="setl" href="https://www.setlist.fm/search?query=${encodeURIComponent(x.a + ' ' + x.v)}" rel="noopener">Find the setlist ↗</a>`
        : '<p class="note"><button type="button" class="linkish" data-signin>Sign in</button> to rate it and add your photos.</p>'}</div></article>`;
  }
  function rateNudge(L) {
    if (!me() || !dia) return '';
    const recent = L.been.filter(x => daysTo(x.d) >= -14 && !(dia[x.id] && dia[x.id].rating)).slice(0, 2);
    return recent.map(x => `<div class="ratenudge">${art(x.s, x.a, 'nph sm')}<div><span class="ntag">How was it?</span><p><b>${esc(x.a)}</b> at ${esc(x.v)}</p>${starBtns(x.id, 0)}</div><a class="linkish small" href="#gigs">Add photos →</a></div>`).join('');
  }
  function phoneCard() {
    if (!window.LLAPP || LLAPP.installed()) return '';
    const how = LLAPP.canPrompt() ? '<button type="button" class="btn installbtn">📲 Install Live Louder</button>'
      : LLAPP.ios() ? '<p>On iPhone: tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.</p>'
      : '<p>In Chrome on Android, open the ⋮ menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>';
    return `<div class="card"><h3>Live Louder on your phone</h3><p>Put it on your home screen and it opens like an app, full screen, with My gigs ready to go even with no signal at the venue.</p>${how}</div>`;
  }
  // ------------------------------------------------ activity: what you (and your friends) have been up to
  let act = {mode: '', mine: null, friends: null, loading: false, err: ''};
  function loadActivity(force) {
    if (!me() || act.loading || (act.mine && !force)) return;
    act.loading = true;
    Promise.all([ACC.rpc('profile_activity', {uname: prof().username || ''}), window.FRIENDS ? FRIENDS.loadFeed().catch(() => []) : Promise.resolve([])])
      .then(([m, f]) => { act.mine = m.data || []; act.friends = Array.isArray(f) ? f : []; act.err = m.error ? 'soon' : ''; act.loading = false; render(); });
  }
  document.addEventListener('llpost', () => { loadActivity(true); });
  function feedItems() {
    const mine = act.mine || [], myName = prof().username;
    if ((act.mode || 'all') === 'me') return mine;
    const seen = new Set(mine.filter(x => x.t === 'post').map(x => x.post && x.post.id));
    const fr = (act.friends || []).filter(x => !(x.t === 'post' && x.post && seen.has(x.post.id)) && !(myName && x.who && x.who.username === myName && x.t !== 'post'));
    return [...mine, ...fr].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function sideBox(title, inner, more) { return inner ? `<div class="sbox"><div class="shead"><h3>${title}</h3>${more || ''}</div>${inner}</div>` : ''; }
  function mostSeen(L) {
    const by = {};
    L.been.forEach(x => { (by[x.s] = by[x.s] || {s: x.s, a: x.a, n: 0}).n++; });
    const top = Object.values(by).sort((a, b) => b.n - a.n).slice(0, 3);
    return top.length ? `<div class="topseen">${top.map(x => `<a href="${root}artists/${esc(x.s)}.html">${art(x.s, x.a, 'tsimg')}<span>${esc(x.a)}</span><small>${x.n} ${x.n === 1 ? 'time' : 'times'}</small></a>`).join('')}</div>` : '';
  }
  function overview() {
    const L = lists();
    const next = L.going[0] || L.saved[0];
    if (L.been.length) loadDiary();
    if (me()) { loadPeople(); loadActivity(); }
    let h = startCard() + rateNudge(L);
    if (next) {
      h += `<div class="pnext"><a href="${esc(gp(next))}">${art(next.s, next.a, 'pnimg')}</a><div class="pnt"><span class="ntag">${next.going ? 'Your next gig' : 'Coming up'}</span>
        <strong><a href="${esc(gp(next))}">${esc(next.a)}</a> · ${esc(when(next.d))}${next.tm ? ', ' + esc(next.tm) : ''}</strong><small>${esc(next.v)}, ${esc(next.c)}</small></div>
        <div class="pnb">${next.going ? '' : `<button class="going" type="button" data-id="${esc(next.id)}" aria-pressed="false">I'm going</button>`}<a class="btn sm" href="${esc(next.u)}" rel="noopener">Tickets</a></div></div>`;
    }
    // main column: write a post, then the feed
    let main = '';
    if (me()) {
      main += window.FRIENDS ? FRIENDS.composer() : '';
      const following = people && people.following.length;
      if (!act.mode && people) act.mode = following ? 'all' : 'me';
      main += `<div class="shead fhead"><h2>${act.mode === 'me' ? 'Your activity' : 'Your feed'}</h2><div class="bchips fmodes"><button type="button" data-amode="all" class="${act.mode === 'all' ? 'on' : ''}">You &amp; friends</button><button type="button" data-amode="me" class="${act.mode === 'me' ? 'on' : ''}">Just you</button></div></div>`;
      if (!act.mine) main += '<p class="note">Loading…</p>';
      else {
        const items = feedItems();
        main += items.length ? FRIENDS.renderFeed(items, 60)
          : empty('🎸', act.mode === 'me' ? 'Nothing here yet' : 'Your feed is quiet', act.mode === 'me' ? 'Write a post above, mark a gig as going, or add a record. It all shows up here.'
            : 'Follow your friends to see their posts, the gigs they\'re going to and the records they\'re buying.', `<a class="btn ghost" href="#friends">Find friends</a>`);
      }
    } else {
      main += empty('👋', 'Sign in to post and follow friends', 'Your saved gigs work on this device already. Sign in to keep them everywhere, post updates, and see what your friends are going to.',
        '<button type="button" class="btn" data-signin>Sign in or create an account</button>');
      const up = [...L.going, ...L.saved].filter(x => x !== next).slice(0, 4);
      if (up.length) main += head('Your gigs', '<a href="#gigs">See all →</a>') + `<div class="ggrid">${up.map(x => gigCard(x, true)).join('')}</div>`;
    }
    // side column
    let side = sideBox('Most seen live', mostSeen(L), L.been.length ? '<a href="#seen">All →</a>' : '');
    const fg = me() && people ? friendsGoing().slice(0, 4) : [];
    side += sideBox('Friends going soon', fg.length ? `<ul class="sgo">${fg.map(({g, who}) => `<li>${avatar(who[0], 'fav sm')}<div><a href="${esc(gp(g))}"><b>${esc(g.a)}</b></a><small>${esc(who.length === 1 ? who[0].name : who[0].name + ' +' + (who.length - 1))} · ${esc(when(g.d))}</small></div></li>`).join('')}</ul>` : '', '<a href="#friends">All →</a>');
    const col = recs('records');
    if (col.length) {
      const recent = col.slice().sort((a, b) => (b.add || '').localeCompare(a.add || '')).slice(0, 6);
      side += sideBox('Recently added', `<div class="srecs">${recent.map(r => recCard(r, 'records')).join('')}</div>`, '<a href="#records">All →</a>');
      const t = touringFromRecords().slice(0, 4);
      if (t.length) side += sideBox('Touring from your records', `<ul class="sgo">${t.map(x => `<li>${art(x.slug, x.name, 'fav sm')}<div><a href="${root}artists/${esc(x.slug)}.html"><b>${esc(x.name)}</b></a><small>You own ${x.n} · ${x.shows} ${x.shows === 1 ? 'show' : 'shows'}</small></div></li>`).join('')}</ul>`);
      const nv = newVinyl();
      if (nv.length) side += sideBox('New on vinyl from your artists', `<ul class="nvlist">${nv.slice(0, 4).map(r => `<li><span class="nvd">${r[0] === '2027' ? '2027' : esc(dparts(r[0]).dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short'}))}</span><strong>${esc(r[1])} – ${esc(r[2])}</strong><a href="${heathen(r[1] + ' ' + r[2])}" rel="noopener">Pre-order ↗</a></li>`).join('')}</ul>`);
    } else {
      side += sideBox('Your record collection', `<p class="note" style="margin-top:0">Add the records you own and we'll tell you when those artists tour.</p><a class="btn sm" href="#records">+ Add records</a>`);
    }
    const fa = Object.entries(MY.get().artists);
    if (fa.length) side += sideBox('Artists you follow', `<div class="sarts">${fa.slice(0, 8).map(([sl, n]) => `<a href="${root}artists/${esc(sl)}.html" title="${esc(n)}">${art(sl, n, 'aph sm')}</a>`).join('')}</div>`, '<a href="#artists">All →</a>');
    return h + `<div class="pgrid2"><div class="pmain">${main}</div><aside class="pside">${side}</aside></div>`;
  }
  function gigsTab() {
    const L = lists();
    if (!L.all.length) return empty('🎟️', 'No gigs yet', 'Save gigs from the gig guide, city pages or any artist page. Mark the ones you\'re going to, and they become your gig history afterwards.', `<a class="btn" href="${root}gigs/index.html">Browse the gig guide</a>`);
    let h = '';
    h += head('Going', L.going.length ? `<span class="note">${L.going.length}</span>` : '') + (L.going.length ? `<div class="ggrid">${L.going.map(x => gigCard(x, true)).join('')}</div>` : '<p class="note">Tap "I\'m going" on a saved gig to put it here.</p>');
    h += head('Saved') + (L.saved.length ? `<div class="ggrid">${L.saved.map(x => gigCard(x, true)).join('')}</div>` : '<p class="note">Nothing saved right now.</p>');
    if (L.been.length) h += `<p class="note" style="margin-top:28px">You've been to ${L.been.length} ${L.been.length === 1 ? 'gig' : 'gigs'}. <a href="#seen">Rate them and add photos on Seen live →</a></p>`;
    return h;
  }
  // ------------------------------------------------ seen live: a wall of every gig you've been to
  let openSeen = '';
  const stars = n => n ? `<span class="swstars" aria-label="${n} out of 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>` : '';
  function bigArt(slug, name, cls) {
    const ph = photo(slug, name);
    if (ph) return `<span class="${cls}" style="background-image:url('${esc(String(ph).replace('/1000x1000-', '/500x500-'))}')"></span>`;
    const a = arts[slug];
    return window.LLPOSTER ? LLPOSTER.big(name, a && a[2] ? gslug(a[2]) : '').replace('class="gcpic', `class="${cls}`) : art(slug, name, cls);
  }
  function seenTab() {
    const L = lists();
    if (!L.been.length) return empty('🎫', 'Your gig wall starts here', 'Mark a gig as "I\'m going". After the night it moves here, where you can rate it and add your photos.', `<a class="btn" href="${root}gigs/index.html">Find a gig</a>`);
    loadDiary();
    const years = {};
    L.been.forEach(x => { (years[x.d.slice(0, 4)] = years[x.d.slice(0, 4)] || []).push(x); });
    let h = '';
    if (openSeen) { const x = L.been.find(g => g.id === openSeen); if (x) h += `<div class="seenpanel" id="seenpanel"><div class="shead"><h3>Your gig diary</h3><button type="button" class="linkish" data-seen="">Close</button></div>${diaryCard(x)}</div>`; }
    Object.keys(years).sort().reverse().forEach(y => {
      const list = years[y];
      h += head(`${list.length} ${list.length === 1 ? 'gig' : 'gigs'} seen in ${y}`, y === Object.keys(years).sort().reverse()[0] && me() ? '<span class="note">Tap a gig to rate it or add photos</span>' : '');
      h += `<div class="swall">${list.map(x => { const d = (dia && dia[x.id]) || {}, p = dparts(x.d);
        return `<button type="button" class="swt${openSeen === x.id ? ' on' : ''}" data-seen="${esc(x.id)}">${bigArt(x.s, x.a, 'swimg')}${(d.photos || []).length ? `<span class="swph">📷 ${(d.photos || []).length}</span>` : ''}
          <strong>${esc(x.a)}</strong><small>${p.dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short'})} · ${esc(x.v)}</small>${stars(d.rating || 0)}</button>`; }).join('')}</div>`;
    });
    return h;
  }
  function touringFromRecords() {
    const by = {};
    recs('records').forEach(r => r.a.split(' & ').forEach(a => { const t = tour(a); if (t) { const k = t.slug; (by[k] = by[k] || {slug: k, name: t.name, n: 0, shows: t.shows}).n++; } }));
    return Object.values(by).sort((a, b) => b.n - a.n);
  }
  function newVinyl() {
    const mine = new Set([...recs('records'), ...recs('wants')].flatMap(r => r.a.split(' & ').map(norm)));
    return rels.filter(r => mine.has(norm(r[1])));
  }
  function artistsTab() {
    const st = MY.get(), fa = Object.entries(st.artists);
    let h = head('Artists you follow', fa.length ? `<span class="note">${fa.length}</span>` : '');
    h += fa.length ? `<div class="agrid">${fa.map(([s, n]) => artistTile(s, n)).join('')}</div>`
      : '<p class="note">Tap Follow on any artist page. You\'ll see their next show here, and with an account we\'ll email you when presales start.</p>';
    const t = touringFromRecords().filter(x => !st.artists[x.slug]);
    if (t.length) h += head('Touring from your records', '<span class="note">Artists you own records by, with Australian dates</span>') + `<div class="agrid">${t.map(x => artistTile(x.slug, x.name, `You own ${x.n} · ${x.shows} ${x.shows === 1 ? 'show' : 'shows'}`)).join('')}</div>`;
    else if (!recs('records').length) h += `<p class="note" style="margin-top:28px">Add your records on the <a href="#records">Records</a> tab and we'll show which artists you own are touring.</p>`;
    return h;
  }
  const switches = on => `<div class="bchips subt"><a class="bchip${on === 'records' ? ' on' : ''}" href="#records">Collection <span class="bn">${recs('records').length.toLocaleString()}</span></a><a class="bchip${on === 'wantlist' ? ' on' : ''}" href="#wantlist">Wantlist <span class="bn">${recs('wants').length.toLocaleString()}</span></a><a class="bchip${on === 'recstats' ? ' on' : ''}" href="#recstats">Stats</a></div>`;
  function shelf(list) {
    const items0 = recs(list), isCol = list === 'records';
    needRarity(items0); loadStock();
    let h = switches(isCol ? 'records' : 'wantlist') + `<div class="addbar">${searchForm(isCol ? 'Add to your collection: search any album or artist' : 'Add to your wantlist: search any album or artist')}${navigator.mediaDevices ? '<button type="button" class="vbtn scanbtn" data-scan>📷 Scan a barcode</button>' : ''}
      <details class="impbox"${imp.loading || imp.msg ? ' open' : ''}><summary>Import from Discogs</summary><p class="note" style="margin-top:6px">Brings in your Discogs collection and wantlist (they need to be public). Records you already have here are kept.</p>${linkForm(false)}</details></div>`;
    h += results();
    if (!items0.length) return h + empty(isCol ? '💿' : '🔎', isCol ? 'Your collection is empty' : 'Your wantlist is empty',
      isCol ? 'Search above, choose your pressing and tap <b>+ Collection</b>. Or import your records from Discogs in one go.' : 'Search above and tap <b>+ Wantlist</b> on the records you\'re after.', '');
    // Wantlist: what's in stock at Heathen Records right now
    const inStock = isCol ? [] : items0.map(r => [r, stockFor(r)]).filter(x => x[1]);
    if (inStock.length && !recQ) h += `<div class="valert"><div class="vacov">${inStock.slice(0, 4).map(([r, x]) => `<a href="${esc(shopUrl(x))}" rel="noopener"><img src="${esc(x[3] || r.img)}" alt="${esc(r.a + ' – ' + r.t)}"></a>`).join('')}</div>
      <div class="vatext"><b>${inStock.length} ${inStock.length === 1 ? 'record' : 'records'} on your wantlist ${inStock.length === 1 ? 'is' : 'are'} in stock at Heathen Records</b><small>${inStock.slice(0, 3).map(([r, x]) => `<a href="${esc(shopUrl(x))}" rel="noopener">${esc(r.t)}</a>`).join(' · ')}${me() ? ". We'll email you when anything else on your wantlist comes in." : ''}</small></div>
      <a class="vbtn red" href="${esc(shopUrl(inStock[0][1]))}" rel="noopener">Get ${inStock.length === 1 ? 'it' : 'them'} →</a></div>`;
    // Your rarest records (once we know enough of them)
    const known = rareKnown(items0);
    if (isCol && known.filter(([, i]) => !isNew(i.h, i.y)).length >= 3 && !recQ) {
      const top = known.filter(([, i]) => !isNew(i.h, i.y)).sort((a, b) => a[1].h - b[1].h).slice(0, 3);
      h += head('Your rarest records', '<button type="button" class="linkish" data-rsortset="rare">See all by rarity →</button>') + `<div class="vrare">${top.map(([r, i], k) => `<button type="button" class="vrc" data-rec="${esc(r.rid)}" data-from="records"><span class="vrank">${k + 1}</span>${r.img ? `<img src="${esc(r.img)}" alt="">` : `<span class="rblank" style="--h:${hue(r.t)}">${esc(r.t.slice(0, 2).toUpperCase())}</span>`}<span><b>${esc(r.t)}</b><small>${esc(r.a)} · ${flag(i.c)}${esc(i.c)} ${i.y || ''} pressing</small>${rareBadges(i.h, i.w, i.y)}<small>${n0(i.h)} collectors own this pressing · ${n0(i.w)} want it</small></span></button>`).join('')}</div>`;
    }
    let items = items0.slice();
    if (recQ) { const q = recQ.toLowerCase(); items = items.filter(r => (r.a + ' ' + r.t + ' ' + (r.l || '') + ' ' + (r.g || '')).toLowerCase().includes(q)); }
    if (recTouring) items = items.filter(r => r.a.split(' & ').some(tour));
    const rh = r => { const i = fresh(r.rid); return i ? i.h : 1e12; };
    const by = {added: (a, b) => (b.add || '').localeCompare(a.add || ''), artist: (a, b) => norm(a.a).localeCompare(norm(b.a)) || a.y - b.y,
                newest: (a, b) => b.y - a.y, oldest: (a, b) => (a.y || 9999) - (b.y || 9999), rare: (a, b) => rh(a) - rh(b)};
    items.sort(by[recSort] || by.added);
    const shown = isCol ? recShown : wantShown;
    const tourN = items0.filter(r => r.a.split(' & ').some(tour)).length;
    const left = rq.filter(x => items0.some(r => r.rid === x)).length;
    h += `<div class="shead"><h2>${isCol ? 'Your collection' : 'Your wantlist'}</h2><span class="note">${items0.length.toLocaleString()} ${items0.length === 1 ? 'record' : 'records'}${left ? ` · checking rarity on Discogs, ${left} to go` : ''}</span></div>
      <div class="rtools"><input type="search" data-rq placeholder="Filter ${isCol ? 'your records' : 'your wantlist'}" value="${esc(recQ)}" aria-label="Filter">
      <select data-rsort aria-label="Sort"><option value="added">Recently added</option><option value="rare">Rarest first</option><option value="artist">Artist A–Z</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
      ${tourN ? `<button type="button" class="chipbtn" data-rtour aria-pressed="${recTouring}">Touring now <small>${tourN}</small></button>` : ''}</div>
      <div class="rgrid">${items.slice(0, shown).map(r => recCard(r, list)).join('')}</div>
      ${items.length > shown ? `<button class="morebtn" type="button" data-rmore="${list}">Show more</button>` : ''}
      ${!items.length ? '<p class="note">Nothing matches that filter.</p>' : ''}${discogsNote('')}`;
    return h;
  }
  // ------------------------------------------------ stats: your crate in numbers
  function recStats() {
    const col = recs('records');
    needRarity(col);
    let h = switches('recstats');
    if (!col.length) return h + empty('📊', 'Nothing to count yet', 'Add some records to your collection and this page fills up: decades, genres, your rarest pressings and more.', '<a class="btn" href="#records">Add records</a>');
    const known = rareKnown(col), artists = new Set(col.map(r => norm(r.a))), labels = new Set(col.map(r => (fresh(r.rid) || {}).l || r.l).filter(Boolean));
    const aus = known.filter(([, i]) => i.c === 'Australia').length, rare = known.filter(([, i]) => tierOf(i.h) >= 2 && !isNew(i.h, i.y)).length;
    const seenArtists = [...new Set(lists().been.map(x => norm(x.a)))].filter(a => artists.has(a));
    const box = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
    h += head('Your crate in numbers', '<button type="button" class="vbtn red" data-sharecrate>Share my crate</button>') + `<div class="vst">${box(col.length.toLocaleString(), col.length === 1 ? 'record' : 'records')}${box(artists.size, 'artists')}${box(labels.size || '–', 'labels')}${box(known.length ? aus : '–', '🇦🇺 Aussie pressings')}${box(known.length ? rare : '–', 'rare or very rare')}${box(seenArtists.length, 'artists seen live')}</div>`;
    const bars = (rows, colr) => { const mx = Math.max(1, ...rows.map(x => x[1])); return rows.map(([k, v]) => `<div class="vbar"><span>${esc(k)}</span><i style="width:${v / mx * 100}%${colr ? ';background:' + colr : ''}"></i><em>${v}</em></div>`).join(''); };
    const dec = {}; col.forEach(r => { if (r.y > 1900) { const d = Math.floor(r.y / 10) * 10 + 's'; dec[d] = (dec[d] || 0) + 1; } });
    const gen = {}; col.forEach(r => { const g = String(r.g || '').split(',')[0].trim(); if (g) gen[g] = (gen[g] || 0) + 1; });
    const ctry = {}; known.forEach(([, i]) => { if (i.c) ctry[i.c] = (ctry[i.c] || 0) + 1; });
    const topArt = Object.entries(col.reduce((o, r) => (o[r.a] = (o[r.a] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const hi = [];
    const rarest = known.filter(([, i]) => !isNew(i.h, i.y)).sort((a, b) => a[1].h - b[1].h)[0];
    if (rarest) hi.push(`🏆 <span>Rarest: <b>${esc(rarest[0].t)}</b> by ${esc(rarest[0].a)}, ${flag(rarest[1].c)}${esc(rarest[1].c)} ${rarest[1].y || ''} pressing. Only ${n0(rarest[1].h)} Discogs collectors have it.</span>`);
    const wanted = known.filter(([, i]) => i.w > i.h).sort((a, b) => b[1].w / Math.max(1, b[1].h) - a[1].w / Math.max(1, a[1].h))[0];
    if (wanted) hi.push(`🔥 <span>Most in demand: <b>${esc(wanted[0].t)}</b>. ${n0(wanted[1].w)} people want that pressing, ${n0(wanted[1].h)} have it.</span>`);
    const oldest = col.filter(r => r.y > 1900).sort((a, b) => a.y - b.y)[0];
    if (oldest) hi.push(`📼 <span>Oldest: <b>${esc(oldest.t)}</b> by ${esc(oldest.a)} (${oldest.y}).</span>`);
    if (seenArtists.length) hi.push(`🎤 <span>Seen live and on your shelf: <b>${seenArtists.slice(0, 4).map(k => esc((col.find(r => norm(r.a) === k) || {}).a || k)).join(', ')}</b>.</span>`);
    const tr = touringFromRecords();
    if (tr.length) hi.push(`🎟 <span>${tr.length} ${tr.length === 1 ? 'artist' : 'artists'} from your crate ${tr.length === 1 ? 'is' : 'are'} touring: <b>${tr.slice(0, 4).map(x => esc(x.name)).join(', ')}</b>. <a href="#artists">See dates →</a></span>`);
    h += `<div class="vtwo"><div class="vpanel"><h3>By decade</h3>${bars(Object.entries(dec).sort())}${Object.keys(gen).length ? `<h3 style="margin-top:20px">By style</h3>${bars(Object.entries(gen).sort((a, b) => b[1] - a[1]).slice(0, 8), '#7fb0e8')}` : ''}</div>
      <div class="vpanel"><h3>Highlights</h3>${hi.map(x => `<div class="vlink">${x}</div>`).join('') || '<p class="note">Checking your records on Discogs…</p>'}
        ${Object.keys(ctry).length ? `<h3 style="margin-top:20px">Where they were pressed</h3>${bars(Object.entries(ctry).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [flag(k) + k, v]), '#d7b5ff')}` : ''}
        <h3 style="margin-top:20px">Most collected artists</h3><div class="topart">${topArt.map(([a, v]) => `<span>${esc(a)} <b>${v}</b></span>`).join('')}</div></div></div>
      ${(() => { const press = col.filter(r => r.rid[0] === 'r').length, albums = col.length - press, left = press - known.length;
        return (left > 0 ? `<p class="note">Rarity and pressing countries are checked live on Discogs: ${left} still to check.</p>` : '')
          + (albums ? `<p class="note">${albums} ${albums === 1 ? 'record is' : 'records are'} saved as the album only. Open ${albums === 1 ? 'it' : 'them'} and choose your pressing to see how rare ${albums === 1 ? 'it is' : 'they are'}.</p>` : ''); })()}${discogsNote('')}`;
    return h;
  }

  // ------------------------------------------------ friends
  const me = () => (window.ACC && ACC.user()) || null;
  const prof = () => (window.ACC && ACC.profile()) || {};
  const shareUrl = u => `https://livelouder.com.au/u/${encodeURIComponent(u)}`;
  const purl = u => `${root}u/?u=${encodeURIComponent(u)}`;
  function avatar(p, cls) {
    return p.avatar ? `<span class="${cls}"><img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`
      : `<span class="${cls}" style="--h:${hue(p.username || '?')}"><b>${esc((p.name || p.username || '?')[0].toUpperCase())}</b></span>`;
  }
  function personTile(p, kind) {
    const going = (p.going || []).length;
    const line = !p.shared ? 'Profile is private now' : [going ? `Going to ${going}${going === 6 ? '+' : ''} ${going === 1 ? 'gig' : 'gigs'}` : '', p.records ? `${Number(p.records).toLocaleString()} ${p.records === 1 ? 'record' : 'records'}` : ''].filter(Boolean).join(' · ') || 'Nothing shared yet';
    const btn = kind === 'following' ? `<button type="button" class="followbtn on" data-unfollow="${esc(p.username)}">Following</button>`
      : kind === 'follower' ? (p.following ? `<button type="button" class="followbtn on" data-unfollow="${esc(p.username)}">Following</button>` : `<button type="button" class="followbtn" data-follow="${esc(p.username)}">Follow back</button>`)
        + `<button type="button" class="linkish small" data-removefollower="${esc(p.username)}">Remove</button>`
      : p.following ? `<button type="button" class="followbtn on" data-unfollow="${esc(p.username)}">Following</button>` : `<button type="button" class="followbtn" data-follow="${esc(p.username)}">Follow</button>`;
    const mutual = kind === 'follower' ? p.following : kind === 'following' && people && (people.followers || []).some(f => f.username === p.username);
    const msg = mutual ? `<a class="followbtn on msgmini" href="${root}messages.html?u=${encodeURIComponent(p.username)}" aria-label="Message ${esc(p.name || p.username)}">💬</a>` : '';
    return `<div class="ptile">${p.shared ? `<a href="${purl(p.username)}">` : '<div>'}${avatar(p, 'fav')}<strong>${esc(p.name || p.username)}</strong><span class="handle">@${esc(p.username)}</span>${p.shared ? '</a>' : '</div>'}
      <span class="anext">${esc(line)}</span><div class="pbtns">${btn}${msg}</div></div>`;
  }
  function loadPeople(force) {
    if (!me() || peopleLoading || (people && !force)) return;
    peopleLoading = true;
    ACC.rpc('my_people').then(r => { people = r.data || {following: [], followers: [], private_followers: 0}; peopleLoading = false; render(); });
  }
  function shareBox() {
    const p = prof();
    if (p.share && p.username) {
      return `<div class="sharebox on"><div><span class="ntag">Your profile is shared</span><p class="shareurl">${esc(shareUrl(p.username).replace('https://', ''))}</p>
        <p class="note">Send this link to your mates so they can follow you. Change what's shared in <a href="#settings">Settings</a>.</p></div>
        <div class="pbtns"><button type="button" class="btn" data-sharelink>${copied ? 'Link copied ✓' : navigator.share ? 'Share my profile' : 'Copy my link'}</button><a class="btn ghost" href="${purl(p.username)}">View my profile</a></div></div>`;
    }
    return `<div class="sharebox"><div><span class="ntag">Your profile is private</span><h3>Let your friends follow you</h3>
      <p>Switch sharing on and your friends can see the gigs you're going to and your records. You can still follow people while yours is private.</p></div>
      <div class="pbtns"><a class="btn" href="#settings">Set up sharing</a></div></div>`;
  }
  function friendsGoing() {
    const by = {};
    ((people && people.following) || []).filter(p => p.shared).forEach(p => (p.going || []).forEach(g => {
      if (g.d < today) return;
      (by[g.id] = by[g.id] || {g, who: []}).who.push(p);
    }));
    return Object.values(by).sort((a, b) => a.g.d.localeCompare(b.g.d)).slice(0, 12);
  }
  function friendsTab() {
    if (!me()) return empty('👋', 'Follow your friends', 'Sign in, then follow your friends to see which gigs they\'re going to and what\'s in their record collection.', '<button type="button" class="btn" data-signin>Sign in or create an account</button>');
    loadPeople();
    let h = shareBox();
    let unread = 0; try { unread = (JSON.parse(sessionStorage.getItem('llMsgN') || 'null') || {}).n || 0; } catch (e) {}
    h += `<a class="msgcta" href="${root}messages.html"><span aria-hidden="true">💬</span><span><b>Messages</b><span class="note">Chat with friends who follow you back</span></span><span class="msgcount"${unread ? '' : ' hidden'}>${unread || ''}</span><span aria-hidden="true">→</span></a>`;
    h += `<form class="recsearch findform" data-findpeople role="search"><input name="q" type="search" placeholder="Find friends by name or username" aria-label="Find friends" value="${esc(find.q)}" autocomplete="off"><button class="btn">Search</button></form>`;
    if (find.loading) h += '<p class="note">Searching…</p>';
    else if (find.results) h += find.results.length ? `<div class="shead"><h3>People matching "${esc(find.q)}"</h3><button type="button" class="linkish" data-clearfind>Clear</button></div><div class="pgrid">${find.results.map(p => personTile(p, 'search')).join('')}</div>`
      : `<p class="note">No one found for "${esc(find.q)}". Only people who share their profile show up. Ask your friend for their Live Louder link.</p>`;
    if (!people) return h + '<p class="note">Loading your friends…</p>';
    if (feed === null && window.FRIENDS) { feed = false; FRIENDS.loadFeed().then(f => { feed = f; render(); }); }
    if (feed && feed.length) h += head('Latest from friends') + FRIENDS.renderFeed(feed, 30);
    const fg = friendsGoing();
    if (fg.length) h += head('Your friends are going') + `<ul class="fgoing">${fg.map(({g, who}) => { const p = dparts(g.d);
      return `<li><span class="fgd"><b>${p.d}</b>${MON[p.m - 1]}</span><div class="fgtext"><a class="gname" href="${esc(gp(g))}">${esc(g.a)}</a><span class="gwhere">${esc(g.v)}, ${esc(g.c)}</span>
        <span class="fgwho">${who.slice(0, 4).map(x => avatar(x, 'fav xs')).join('')}${esc(who.length === 1 ? who[0].name + ' is going' : who[0].name + ' and ' + (who.length - 1) + (who.length === 2 ? ' other' : ' others') + ' are going')}</span></div>
        <button class="save" type="button" data-gig="${esc(JSON.stringify({id: g.id, d: g.d, tm: g.tm, a: g.a, s: g.s, v: g.v, c: g.c, u: g.u, vs: g.vs, p: g.p}))}" aria-pressed="false" aria-label="Save">♡</button></li>`; }).join('')}</ul>`;
    h += head('Following', people.following.length ? `<span class="note">${people.following.length}</span>` : '');
    h += people.following.length ? `<div class="pgrid">${people.following.map(p => personTile(p, 'following')).join('')}</div>` : '<p class="note">You\'re not following anyone yet. Search for a friend above, or open a friend\'s Live Louder link and tap Follow.</p>';
    const fl = people.followers || [];
    h += head('Followers', fl.length + people.private_followers ? `<span class="note">${fl.length + people.private_followers}</span>` : '');
    h += fl.length ? `<div class="pgrid">${fl.map(p => personTile(p, 'follower')).join('')}</div>` : '';
    if (people.private_followers) h += `<p class="note">${fl.length ? 'Plus ' : ''}${people.private_followers} ${people.private_followers === 1 ? 'person' : 'people'} with a private profile ${people.private_followers === 1 ? 'follows' : 'follow'} you.</p>`;
    if (!fl.length && !people.private_followers) h += '<p class="note">No followers yet. Share your link and they\'ll show up here.</p>';
    return h;
  }
  function suggestName() {
    const u = me(), md = (u && u.user_metadata) || {};
    return String(md.full_name || (u && u.email || '').split('@')[0] || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  }
  function shareCard() {
    const u = me(), p = prof();
    if (!u) return '';
    const md = u.user_metadata || {};
    const pic = p.avatar_url || md.avatar_url;
    const photos = `<div class="photorow"><div class="phbox"><span class="phav" style="--h:${hue(p.username || u.email || '?')}">${pic ? `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer">` : esc((p.display_name || md.full_name || u.email || '?')[0].toUpperCase())}</span>
        <div><b>Profile photo</b><div class="pbtns"><button type="button" class="btn ghost sm" data-pickphoto="avatar">${uploading === 'avatar' ? 'Uploading…' : p.avatar_url ? 'Change' : 'Upload'}</button>${p.avatar_url ? '<button type="button" class="linkish small" data-rmphoto="avatar">Remove</button>' : ''}</div></div></div>
      <div class="phbox"><span class="phban${p.banner_url ? '' : ' def'}" style="--h:${hue(p.username || u.email || '?')}${p.banner_url ? `;background-image:url('${esc(p.banner_url)}')` : ''}"></span>
        <div><b>Cover photo</b><div class="pbtns"><button type="button" class="btn ghost sm" data-pickphoto="banner">${uploading === 'banner' ? 'Uploading…' : p.banner_url ? 'Change' : 'Upload'}</button>${p.banner_url ? '<button type="button" class="linkish small" data-rmphoto="banner">Remove</button>' : ''}</div></div></div></div>
      ${photoMsg ? `<p class="note impmsg">${photoMsg}</p>` : ''}${['avatar', 'banner'].map(k => ({pending: `Your ${k === 'avatar' ? 'profile' : 'cover'} photo is waiting for a quick check. Only you can see it until then, usually within a day.`, hidden: `Your ${k === 'avatar' ? 'profile' : 'cover'} photo has been reported and is hidden while we take a look.`})[p[k + '_status']]).filter(Boolean).map(t => `<p class="note phstat">${t}</p>`).join('')}
      <p class="note rules"><b>Photo rules:</b> keep it friendly. No nudity, hate or violence, and only photos you took or have permission to use. Photos are checked automatically, and ones that break the rules are removed. A wide photo works best for the cover, like a crowd shot or your favourite venue.</p>`;
    return `<div class="card wide" id="sharing"><h3>Your profile and friends</h3>${photos}
      <form data-shareform class="shareform">
      <label>Username<span class="uname"><i>livelouder.com.au/u/</i><input name="username" value="${esc(p.username || suggestName())}" maxlength="24" autocapitalize="off" autocomplete="off" spellcheck="false" pattern="[a-z0-9_]{3,24}" required></span></label>
      <label>Name people see<input name="display_name" value="${esc(p.display_name || md.full_name || '')}" maxlength="40" placeholder="Your name or a nickname"></label>
      <label>Short bio <small>(optional)</small><input name="bio" value="${esc(p.bio || '')}" maxlength="120" placeholder="e.g. 90s grunge, Aussie rock, front row at the Enmore"></label>
      <label class="tog"><input type="checkbox" name="share" ${p.share ? 'checked' : ''}> <span><b>Share my profile.</b> Anyone with your link, and people who follow you, can see your photos, the gigs you've saved and are going to, and your record collection and wantlist. Your email address is never shown. Untick to make your profile private.</span></label>
      <button class="btn">Save</button>${shareMsg ? `<p class="note impmsg">${shareMsg}</p>` : ''}</form>
      <p class="note">Private profiles can't be seen or followed, and don't show up in search.</p></div>`;
  }
  function settings() {
    const u = window.ACC && ACC.user(), p = (window.ACC && ACC.profile()) || {}, st = MY.get();
    let h = '<div class="sgrid">' + shareCard() + phoneCard();
    h += `<div class="card"><h3>Your account</h3>${u ? `<p>Signed in as <b>${esc(u.email || '')}</b></p><p class="acts"><button type="button" class="linkish" data-act="out">Sign out</button></p>`
      : `<p>You're not signed in, so everything here is saved on this device only.</p><button type="button" class="btn" data-signin>Sign in or create an account</button><p class="note">Free. No password needed.</p>`}</div>`;
    h += `<div class="card"><h3>Emails</h3>${u ? `<label class="tog"><input type="checkbox" data-pref="remind_gigs" ${p.remind_gigs !== false ? 'checked' : ''}> A reminder a few days before gigs I've saved</label>
      <label class="tog"><input type="checkbox" data-pref="remind_presales" ${p.remind_presales !== false ? 'checked' : ''}> Presales, on-sales and new dates for artists I follow</label>
      <label class="tog"><input type="checkbox" data-pref="remind_messages" ${p.remind_messages !== false ? 'checked' : ''}> A friend sent me a message (if I haven't seen it)</label>
      <label class="tog"><input type="checkbox" data-pref="remind_wants" ${p.remind_wants !== false ? 'checked' : ''}> Something on my wantlist is in stock at Heathen Records</label><p class="note">Gig and presale reminders come at most once a day. Message emails come at most every few hours.</p>`
      : '<p>Sign in to get a reminder before your gigs and a heads-up when presales start for artists you follow.</p>'}</div>`;
    h += `<div class="card"><h3>Records</h3><p>${recs('records').length.toLocaleString()} in your collection, ${recs('wants').length.toLocaleString()} on your wantlist.</p><p class="note" style="margin-top:0">Import from Discogs any time. Records you already have here are kept.</p>${linkForm(false)}</div>`;
    h += `<div class="card"><h3>Your data</h3><p>See our <a href="${root}privacy.html">privacy policy</a> for what we keep.</p>${u ? '<p class="acts"><button type="button" class="linkish danger" data-act="delete">Delete my account</button></p>' : ''}</div>`;
    return h + '</div>';
  }

  // ------------------------------------------------ render
  function render() {
    hero();
    document.querySelectorAll('.ptabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === (tab === 'wantlist' || tab === 'recstats' ? 'records' : tab) ? 'page' : 'false'));
    const body = document.getElementById('pBody');
    body.innerHTML = tab === 'gigs' ? gigsTab() : tab === 'artists' ? artistsTab() : tab === 'records' ? shelf('records') : tab === 'wantlist' ? shelf('wants') : tab === 'settings' ? settings() : tab === 'friends' ? friendsTab() : tab === 'seen' ? seenTab() : tab === 'recstats' ? recStats() : overview();
    const sel = body.querySelector('[data-rsort]'); if (sel) sel.value = recSort;
    MY.paint();
  }
  window.MYPAGE = render;
  document.addEventListener('acc', render);
  function setTab() { const t0 = (location.hash || '#overview').slice(1); if (t0 === 'start') startOpen = true; const t = t0 === 'start' ? 'overview' : t0; tab = ['overview', 'gigs', 'seen', 'artists', 'records', 'wantlist', 'recstats', 'friends', 'settings'].includes(t) ? t : 'overview'; recQ = ''; recTouring = false; imp.msg = ''; render(); }
  window.addEventListener('hashchange', () => { setTab(); document.querySelector('.ptabs').scrollIntoView({block: 'nearest'}); });

  // ------------------------------------------------ search, import, record view
  function doSearch(q) {
    srch = {q, loading: true, results: null, error: ''}; render();
    fetch('/.netlify/functions/discogs-user?q=' + encodeURIComponent(q)).then(r => r.json()).then(j => {
      srch = {q, loading: false, results: j.results || [], error: j.error || ''}; render();
      const el = box.querySelector('.sres'); if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
    }).catch(() => { srch = {q, loading: false, results: null, error: "Couldn't search right now. Try again in a minute."}; render(); });
  }
  function importDiscogs(u) {
    imp = {loading: true, msg: ''}; render();
    fetch('/.netlify/functions/discogs-user?u=' + encodeURIComponent(u)).then(r => r.json()).then(j => {
      if (j.error) { imp = {loading: false, msg: esc(j.error)}; render(); return; }
      const st = MY.get(), rows = [];
      let nc = 0, nw = 0;
      const slim = r => ({rid: r.rid || 'r' + r.id, a: r.a, t: r.t, y: r.y, img: r.img, g: r.g, f: r.f, l: r.l, add: r.add || MY.today});
      (j.collection || []).forEach(r => { const x = slim(r); if (!st.records[x.rid]) { st.records[x.rid] = x; rows.push({list: 'collection', rec: x}); nc++; } });
      (j.wants || []).forEach(r => { const x = slim(r); if (!st.wants[x.rid] && !st.records[x.rid]) { st.wants[x.rid] = x; rows.push({list: 'wantlist', rec: x}); nw++; } });
      st.discogs = u; MY.save(); MY.push('discogs', 'set', u);
      if (rows.length) MY.push('recs', 'bulk', {rows});
      imp = {loading: false, msg: `Imported <b>${nc.toLocaleString()}</b> ${nc === 1 ? 'record' : 'records'} to your collection and <b>${nw.toLocaleString()}</b> to your wantlist${j.collectionPrivate ? ' (your Discogs collection is private, so only the wantlist came across)' : ''}.`};
      render();
    }).catch(() => { imp = {loading: false, msg: "Couldn't reach Discogs. Try again in a minute."}; render(); });
  }
  async function openRecord(rid, from) {
    const st = MY.get();
    const r = from === 'search' ? (srch.results || []).find(x => x.rid === rid) : (st.records[rid] || st.wants[rid]);
    if (!r) return;
    const d = document.getElementById('recDlg'), b = document.getElementById('recBody');
    const t = r.a.split(' & ').map(tour).find(Boolean);
    const j = esc(JSON.stringify({rid: r.rid, a: r.a, t: r.t, y: r.y, img: r.img, g: r.g || '', f: r.f || '', l: r.l || ''}));
    const where = st.records[rid] ? 'In your collection' : st.wants[rid] ? 'On your wantlist' : 'Record';
    const tourHtml = t ? `<div class="rtourbox"><b>${esc(t.name)} is touring Australia</b><span>${t.shows} ${t.shows === 1 ? 'show' : 'shows'}, next in ${esc(t.city)}</span><a class="btn" href="${root}artists/${esc(t.slug)}.html">Dates &amp; tickets</a></div>` : '';
    b.innerHTML = `<div class="rview"><div class="rcover">${r.img ? `<img src="${esc(r.img)}" alt="${esc(r.a)} – ${esc(r.t)} cover">` : `<span class="rblank big" style="--h:${hue(r.t)}">${esc(r.t.slice(0, 2).toUpperCase())}</span>`}</div>
      <div class="rinfo"><span class="ntag">${where}</span><h2>${esc(r.t)}</h2><p class="rart">${esc(r.a)}</p>
      <div id="recRare">${rid[0] === 'm' ? `<div class="vlink">💿 <span>This is the album, not a particular pressing. <button type="button" class="linkish" data-pickfor="${j}"${st.records[rid] || st.wants[rid] ? ` data-swapfrom="${esc(rid)}"` : ''}>Choose your pressing</button> to see how rare yours is.</span></div>` : '<p class="note">Checking rarity on Discogs…</p>'}</div>
      ${seenBy(r.a) ? `<div class="vlink">🎤 <span><b>You've seen ${esc(r.a)} live${seenBy(r.a) > 1 ? ' ' + seenBy(r.a) + ' times' : ''}.</b> <a href="#seen">Your Seen live wall →</a></span></div>` : ''}
      <div class="radd big"><button type="button" class="addbtn" data-addrec="${j}" data-list="records">+ Collection</button><button type="button" class="addbtn" data-addrec="${j}" data-list="wants">+ Wantlist</button></div>
      <dl class="rmeta">${r.y ? `<dt>Year</dt><dd>${r.y}</dd>` : ''}${r.l ? `<dt>Label</dt><dd>${esc(r.l)}</dd>` : ''}${r.f ? `<dt>Format</dt><dd>${esc(r.f)}</dd>` : ''}${r.g ? `<dt>Style</dt><dd>${esc(r.g)}</dd>` : ''}${r.add && st.records[rid] ? `<dt>Added</dt><dd>${esc(dparts(r.add).dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'}))}</dd>` : ''}</dl>
      ${tourHtml}<div id="recMore"><p class="note">Loading tracklist…</p></div>
      ${st.records[rid] && me() ? `<div class="spinbox" id="spinBox"><button type="button" class="vbtn red spinbtn" data-spinopen>▶ Now spinning</button><span class="note" id="playLine"></span>
        <form class="spinform" data-spin="${esc(rid)}" hidden><textarea name="body" maxlength="500" rows="2" placeholder="Add a comment (optional): pre-gig warm-up, first spin, Sunday morning…"></textarea><div class="pcrow"><span class="note">Posts to your feed and counts a play</span><button class="btn sm">Post</button></div></form></div>` : ''}
      <p class="ractions">${stockFor(r) ? `<a class="btn" href="${esc(shopUrl(stockFor(r), 'record'))}" rel="noopener">In stock at Heathen Records →</a>` : `<a class="btn" href="${heathen(r.a + ' ' + r.t)}" rel="noopener">Find it on vinyl at Heathen Records</a>`} <a class="btn ghost" href="https://www.discogs.com/${rid[0] === 'm' ? 'master' : 'release'}/${esc(rid.slice(1))}" rel="noopener">See on Discogs ↗</a></p>${discogsNote(rid)}</div></div>`;
    MY.paint();
    d.showModal ? d.showModal() : d.setAttribute('open', '');
    if (st.records[rid] && me()) loadPlays().then(() => { const pl = document.getElementById('playLine'), p0 = plays && plays[rid]; if (pl && p0) pl.textContent = `Spun ${p0[0]} ${p0[0] === 1 ? 'time' : 'times'} · last ${ago2(p0[1])}`; });
    if (rid[0] === 'r') {
      let i = fresh(rid);
      if (!i) { try { const x = await dg('/releases/' + rid.slice(1)); if (x) { RC[rid] = i = relInfo(x); saveRC(); } } catch (e) {} }
      const box2 = document.getElementById('recRare');
      if (box2) box2.innerHTML = !i ? '' : `<div class="vmeter"><div class="row"><b>${tierName(i.h, i.y)}${i.w > i.h && i.h ? ' · 🔥 In demand' : ''}</b><span>${n0(i.h)} Discogs collectors have this pressing · ${n0(i.w)} want it</span></div>
          <div class="vtrack"><i style="left:calc(${Math.max(1, Math.min(99, meterPos(i.h)))}% - 9px)"></i></div><div class="row vlabels"><span>Common</span><span>Uncommon</span><span>Rare</span><span>Very rare</span></div></div>
        <p class="rpress">${flag(i.c)}${esc(i.c || '')}${i.l ? ' · ' + esc(i.l) : ''}${i.cat ? ' · ' + esc(i.cat) : ''}${i.y ? ' · ' + i.y : ''}${i.col ? ' · <b>' + esc(i.col) + '</b>' : ''}${i.d ? ' · ' + esc(i.d) : ''}</p>
        ${i.m && (st.records[rid] || st.wants[rid]) ? `<button type="button" class="linkish small" data-changepress="${esc(rid)}" data-mid="${i.m}">Not your pressing? Change it</button>` : ''}`;
    }
    try {
      const k = rid[0] === 'm' ? 'master' : 'release';
      const x = await (await fetch(`/.netlify/functions/discogs-user?${k}=${encodeURIComponent(rid.slice(1))}`)).json();
      const more = document.getElementById('recMore'); if (!more) return;
      if (x.error) { more.innerHTML = ''; return; }
      if (x.image) { const im = b.querySelector('.rcover img'); if (im) im.src = x.image; }
      more.innerHTML = (x.labels && x.labels.length ? `<p class="note" style="margin-top:0">${esc(x.labels.join(' / '))}${x.country ? ' · ' + esc(x.country) : ''}${x.released ? ' · ' + esc(x.released) : ''}</p>` : '')
        + (x.tracks && x.tracks.length ? `<h4>Tracklist</h4><ol class="tracks">${x.tracks.map(t => `<li><span>${esc(t[0])}</span>${esc(t[1])}<em>${esc(t[2])}</em></li>`).join('')}</ol>` : '')
        + '';
    } catch (e) { const more = document.getElementById('recMore'); if (more) more.innerHTML = ''; }
  }
  document.getElementById('recDlg').addEventListener('close', () => render());

  // ------------------------------------------------ events
  box.addEventListener('click', ev => {
    if (ev.target.closest('[data-scan]')) { openScanner(); return; }
    if (ev.target.closest('[data-rescan]')) { const rs = document.getElementById('scanRes'); if (rs) rs.innerHTML = ''; stopScan(); document.getElementById('scanDlg').close(); openScanner(); return; }
    const shc = ev.target.closest('[data-sharecrate]');
    if (shc) { shc.disabled = true; shc.textContent = 'Making your picture…'; shareCrate().finally(() => { shc.disabled = false; shc.textContent = 'Share my crate'; }); return; }
    const so = ev.target.closest('[data-spinopen]');
    if (so) { const f = so.parentNode.querySelector('.spinform'); f.hidden = !f.hidden; if (!f.hidden) f.body.focus(); return; }
    const pf = ev.target.closest('[data-pickfor]');
    if (pf) { const rd = document.getElementById('recDlg'); if (rd.open) rd.close(); const sf = pf.dataset.swapfrom, st0 = MY.get();
      openPicker(JSON.parse(pf.dataset.pickfor), sf ? {swap: sf, list: st0.records[sf] ? 'records' : 'wants'} : {}); return; }
    const pkf = ev.target.closest('[data-pkf]');
    if (pkf && pk) { pk.f = pkf.dataset.pkf; paintPicker(); colours(); return; }
    const psw = ev.target.closest('[data-pkswap]');
    if (psw && pk) { const nr = JSON.parse(psw.dataset.pkswap), list = pk.list, old = MY.get()[list][pk.swap];
      if (old) { nr.add = old.add; MY.toggleRec(list, nr, true); MY.toggleRec(list, old, false); }
      document.getElementById('pickDlg').close(); return; }
    const rss = ev.target.closest('[data-rsortset]');
    if (rss) { recSort = rss.dataset.rsortset; render(); return; }
    const chp = ev.target.closest('[data-changepress]');
    if (chp) { const st = MY.get(), list = st.records[chp.dataset.changepress] ? 'records' : 'wants', r = st[list][chp.dataset.changepress]; const mid = chp.dataset.mid;
      document.getElementById('recDlg').close(); if (r && mid) openPicker({rid: 'm' + mid, a: r.a, t: r.t, y: r.y, img: r.img, g: r.g}, {swap: r.rid, list}); return; }
    const sw = ev.target.closest('[data-seen]');
    if (sw) { openSeen = openSeen === sw.dataset.seen ? '' : sw.dataset.seen; render(); const pnl = document.getElementById('seenpanel'); if (pnl) pnl.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
    const am = ev.target.closest('[data-amode]');
    if (am) { act.mode = am.dataset.amode; render(); return; }
    const g = ev.target.closest('button.going');
    if (g) { const st = MY.get(), x = st.gigs[g.dataset.id]; if (x) { x.going = !x.going; MY.save(); MY.push('gig', 'going', x); render(); } return; }
    const fo = ev.target.closest('[data-follow]'), uf = ev.target.closest('[data-unfollow]'), rf = ev.target.closest('[data-removefollower]');
    if (fo || uf || rf) {
      const b = fo || uf || rf; b.disabled = true;
      const call = fo ? ACC.rpc('follow_user', {uname: fo.dataset.follow}) : ACC.rpc('unfollow_user', {uname: (uf || rf).dataset.unfollow || rf.dataset.removefollower, remove_follower: !!rf});
      call.then(() => { if (find.results) find.results.forEach(p => { if (p.username === b.dataset.follow) p.following = true; if (p.username === b.dataset.unfollow) p.following = false; }); loadPeople(true); });
      return;
    }
    const pa = ev.target.closest('[data-pick]');
    if (pa) { const st = MY.get(), sl = pa.dataset.pick; if (st.artists[sl]) { delete st.artists[sl]; MY.save(); MY.push('artist', 'remove', {slug: sl, name: pa.dataset.name}); } else followMany([{slug: sl, name: pa.dataset.name}]); MY.paint(); render(); return; }
    if (ev.target.closest('[data-startdone]')) { try { localStorage.setItem('llStartDone', '1'); } catch (e) {} startOpen = false; render(); return; }
    const rt = ev.target.closest('[data-rate]');
    if (rt) { const id = rt.dataset.id, n = +rt.dataset.rate; dia = dia || {}; dia[id] = Object.assign(dia[id] || {photos: []}, {rating: n}); render();
      ACC.rateGig(id, n, dia[id].review).then(r => { if (r.error) { gigMsg[id] = 'Not saved'; render(); } }); return; }
    const ag = ev.target.closest('[data-addgph]');
    if (ag) { if (gigUp) return; pickKind = 'gig'; pickGig = ag.dataset.addgph; fileIn.value = ''; fileIn.click(); return; }
    const rg = ev.target.closest('[data-rmgph]');
    if (rg) { if (!confirm('Remove this photo?')) return; const id = +rg.dataset.rmgph;
      for (const k in dia) { const ph = (dia[k].photos || []).find(p => p.id === id); if (ph) { dia[k].photos = dia[k].photos.filter(p => p !== ph); render(); ACC.removeGigPhoto(ph); break; } } return; }
    const pk = ev.target.closest('[data-pickphoto]');
    if (pk) { pickPhoto(pk.dataset.pickphoto); return; }
    const rm = ev.target.closest('[data-rmphoto]');
    if (rm) { if (confirm('Remove this photo?')) ACC.removePhoto(rm.dataset.rmphoto).then(() => { photoMsg = ''; render(); }); return; }
    if (ev.target.closest('#pCam')) { pickPhoto('avatar'); return; }
    if (ev.target.closest('#pCover')) { pickPhoto('banner'); return; }
    if (ev.target.closest('[data-clearfind]')) { find = {q: '', results: null, loading: false}; render(); return; }
    if (ev.target.closest('[data-sharelink]')) {
      const url = shareUrl(prof().username);
      if (navigator.share) navigator.share({title: 'My gigs and records on Live Louder', url}).catch(() => {});
      else navigator.clipboard.writeText(url).then(() => { copied = true; render(); setTimeout(() => { copied = false; render(); }, 2500); });
      return;
    }
    const rc = ev.target.closest('[data-rec]');
    if (rc) { openRecord(rc.dataset.rec, rc.dataset.from); return; }
    if (ev.target.closest('[data-clearsearch]')) { srch = {q: '', loading: false, results: null, error: ''}; render(); return; }
    if (ev.target.closest('[data-rtour]')) { recTouring = !recTouring; render(); return; }
    const more = ev.target.closest('[data-rmore]');
    if (more) { if (more.dataset.rmore === 'records') recShown += 120; else wantShown += 120; render(); return; }
    const act = ev.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'out' && window.ACC) ACC.signOut();
      if (a === 'delete' && window.ACC) ACC.deleteAccount();

    }
  });
  box.addEventListener('submit', ev => {
    const sm = ev.target.closest('[data-scanman]');
    if (sm) { ev.preventDefault(); const v = sm.bc.value.replace(/[^0-9]/g, ''); if (v) { stopScan(); found(v); } return; }
    const sp = ev.target.closest('[data-spin]');
    if (sp) { ev.preventDefault(); const r = MY.get().records[sp.dataset.spin]; if (!r) return; const i = fresh(r.rid) || {}, b = sp.querySelector('button'); b.disabled = true; b.textContent = 'Posting…';
      ACC.rpc('create_post', {body: sp.body.value.trim(), gig: null, artist: null, record: {rid: r.rid, a: r.a, t: r.t, y: String(r.y || ''), img: r.img, c: i.c || r.c || '', l: i.l || r.l || '', col: i.col || r.col || ''}}).then(res => {
        if (res.error) { b.disabled = false; b.textContent = 'Post'; alert(res.error.replace(/^.*?: /, '')); return; }
        document.dispatchEvent(new CustomEvent('llpost', {detail: res.data}));
        sp.outerHTML = '<p class="note spunok">✓ Posted to your feed. Enjoy the spin!</p>'; loadPlays(true).then(() => { const pl = document.getElementById('playLine'), p0 = plays && plays[r.rid]; if (pl && p0) pl.textContent = `Spun ${p0[0]} ${p0[0] === 1 ? 'time' : 'times'} · last ${ago2(p0[1])}`; });
      }); return; }
    const f = ev.target.closest('[data-dgform]');
    if (f) { ev.preventDefault(); const u = f.u.value.trim(); if (u && !imp.loading) importDiscogs(u); return; }
    const nf = ev.target.closest('[data-note]');
    if (nf) { ev.preventDefault(); const id = nf.dataset.note, t = nf.t.value.trim(); dia = dia || {}; dia[id] = Object.assign(dia[id] || {photos: []}, {review: t});
      gigMsg[id] = 'Saving…'; render(); ACC.rateGig(id, dia[id].rating || null, t).then(r => { gigMsg[id] = r.error ? 'Not saved' : 'Saved ✓'; render(); setTimeout(() => { gigMsg[id] = ''; render(); }, 2000); }); return; }
    const lf = ev.target.closest('[data-lfm]');
    if (lf) { ev.preventDefault(); const u = lf.u.value.trim(); if (u) importLastfm(u); return; }
    const pf = ev.target.closest('[data-findpeople]');
    if (pf) { ev.preventDefault(); const q = pf.q.value.trim(); if (q.length < 2) return; find = {q, results: null, loading: true}; render();
      ACC.rpc('find_people', {q}).then(r => { find = {q, results: r.data || [], loading: false}; render(); }); return; }
    const shf = ev.target.closest('[data-shareform]');
    if (shf) { ev.preventDefault();
      const username = shf.username.value.trim().toLowerCase(), display_name = shf.display_name.value.trim(), share = shf.share.checked;
      if (!/^[a-z0-9_]{3,24}$/.test(username)) { shareMsg = 'Usernames are 3 to 24 lowercase letters, numbers or underscores.'; render(); return; }
      shareMsg = 'Saving…'; render();
      const bio = shf.bio ? shf.bio.value.trim() : '';
      ACC.saveProfile({username, display_name: display_name || null, share}).then(async r => {
        if (!r.error && bio !== (prof().bio || '')) { const b = await ACC.rpc('set_bio', {bio}); if (b.error) r = {error: b.error.replace(/^.*?: /, '')}; else Object.assign(ACC.profile() || {}, {bio: bio || null}); } shareMsg = r.error ? esc(r.error) : share ? `Saved. Your profile is shared at <a href="${purl(username)}">livelouder.com.au/u/${esc(username)}</a>.` : 'Saved. Your profile is private.'; render(); });
      return; }
    const sf = ev.target.closest('[data-recsearch]');
    if (sf) { ev.preventDefault(); const q = sf.q.value.trim(); if (q) doSearch(q); }
  });
  let typing;
  box.addEventListener('input', ev => {
    if (ev.target.matches('[data-rq]')) { clearTimeout(typing); const pos = ev.target.selectionStart; typing = setTimeout(() => { recQ = ev.target.value; render(); const i = box.querySelector('[data-rq]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 200); }
  });
  box.addEventListener('change', ev => {
    if (ev.target.matches('[data-rsort]')) { recSort = ev.target.value; render(); }
    if (ev.target.matches('[data-pksort]') && pk) { pk.sort = ev.target.value; paintPicker(); colours(); }
    if (ev.target.matches('[data-pref]') && window.ACC) ACC.setPref(ev.target.dataset.pref, ev.target.checked);
  });

  // ------------------------------------------------ photos
  let pickKind = '', pickGig = '';
  const fileIn = document.getElementById('pFile');
  function pickPhoto(kind) { if (!me()) { ACC.open(); return; } if (uploading) return; pickKind = kind; fileIn.value = ''; fileIn.click(); }
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0]; if (!f) return;
    if (f.size > 25 * 1024 * 1024) { photoMsg = 'That photo is too big. Try one under 25 MB.'; render(); return; }
    if (pickKind === 'gig') {
      const id = pickGig; gigUp = id; gigMsg[id] = ''; render();
      ACC.setPhoto('gig', f, id).then(r => { gigUp = '';
        if (r.error) alert(r.error);
        else { dia = dia || {}; (dia[id] = dia[id] || {photos: []}).photos.push({id: r.id, url: r.url, status: r.status, path: r.url.split('/object/public/profile/')[1]}); if (r.status === 'pending') alert('Thanks! Your photo is waiting for a quick check. Only you can see it until then.'); }
        render(); });
      return;
    }
    uploading = pickKind; photoMsg = ''; render();
    ACC.setPhoto(pickKind, f).then(r => { uploading = ''; photoMsg = r.error ? esc(r.error) : r.status === 'pending' ? 'Thanks. Your photo is waiting for a quick check, and only you can see it until then.' : ''; if (r.error || r.status === 'pending') location.hash = '#settings'; render(); });
  });

  // ------------------------------------------------ start
  setTab();
  Promise.all([fetch(root + 'gigs.json').then(r => r.json()).catch(() => []), fetch(root + 'data/artists.json').then(r => r.json()).catch(() => ({})),
               fetch(root + 'data/releases.json').then(r => r.json()).catch(() => [])])
    .then(([g, a, r]) => {
      gigsAll = g; arts = a; rels = r; window.LLARTS = a;
      for (const [slug, x] of Object.entries(arts)) if (x[3]) touring[norm(x[0])] = {slug, name: x[0], shows: x[5], city: x[4]};
      render();
    });
});
