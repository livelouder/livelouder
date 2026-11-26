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
  const daysTo = iso => Math.round((dparts(iso).dt - dparts(today).dt) / 86400000);
  const when = iso => { const n = daysTo(iso); return n === 0 ? 'Tonight' : n === 1 ? 'Tomorrow' : n > 1 && n < 7 ? 'This ' + dparts(iso).dt.toLocaleDateString('en-AU', {weekday: 'long'}) : dparts(iso).dt.toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short'}); };

  let gigsAll = [], arts = {}, rels = [], dg = null, dgLoading = false, tab = 'overview';
  let recQ = '', recSort = 'added', recTouring = false, recShown = 60, wantShown = 60;
  const touring = {};
  const tour = name => touring[norm(name)];

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
    const save = `<button class="save" type="button" data-gig="${esc(JSON.stringify({id: x.id, d: x.d, tm: x.tm, a: x.a, s: x.s, v: x.v, c: x.c, u: x.u, vs: x.vs}))}" aria-pressed="false" aria-label="Save">♡</button>`;
    return `<article class="gcard${past ? ' past' : ''}"><a class="gimg" href="${root}artists/${esc(x.s)}.html">${art(x.s, x.a, 'gph')}
      <span class="gdate"><b>${p.d}</b>${MON[p.m - 1]}</span>${past ? '<span class="gbadge">Been there</span>' : x.going ? '<span class="gbadge on">Going</span>' : ''}</a>
      <div class="gbody"><a class="gname" href="${root}artists/${esc(x.s)}.html">${esc(x.a)}</a>
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
  function recCard(r, i, kind) {
    const t = r.a.split(' & ').map(tour).find(Boolean);
    return `<button class="rcard" type="button" data-rec="${kind}:${i}">${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : `<span class="rblank" style="--h:${hue(r.t)}">${esc(r.t.slice(0, 2).toUpperCase())}</span>`}
      ${t ? '<span class="rtour">Touring</span>' : ''}<strong>${esc(r.t)}</strong><span>${esc(r.a)}${r.y ? ' · ' + r.y : ''}</span></button>`;
  }
  const empty = (icon, title, text, btn) => `<div class="empty"><div class="eicon" aria-hidden="true">${icon}</div><h3>${title}</h3><p>${text}</p>${btn || ''}</div>`;
  const head = (h, more) => `<div class="shead"><h2>${h}</h2>${more || ''}</div>`;
  const linkForm = big => `<form class="dgform${big ? ' big' : ''}" data-dgform><input name="u" placeholder="Your Discogs username" aria-label="Discogs username" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(MY.get().discogs || '')}"><button class="btn">Link my records</button></form>`;

  // ------------------------------------------------ sections
  function lists() {
    const all = Object.values(MY.get().gigs).sort((a, b) => a.d.localeCompare(b.d));
    return {all, going: all.filter(x => x.going && x.d >= today), saved: all.filter(x => !x.going && x.d >= today), been: all.filter(x => x.d < today).reverse()};
  }
  function hero() {
    const u = window.ACC && ACC.user(), md = (u && u.user_metadata) || {}, L = lists(), st = MY.get();
    const av = document.getElementById('pAv');
    if (md.avatar_url) av.innerHTML = `<img src="${esc(md.avatar_url)}" alt="" referrerpolicy="no-referrer">`;
    else av.textContent = u ? (md.full_name || u.email || '?')[0].toUpperCase() : '♥';
    document.getElementById('pName').textContent = u ? (md.full_name || (u.email || '').split('@')[0]) : 'My gigs';
    document.getElementById('pSub').innerHTML = u ? `Member since ${new Date(u.created_at).toLocaleDateString('en-AU', {month: 'long', year: 'numeric'})}${st.discogs ? ` · Discogs: <b>${esc(st.discogs)}</b>` : ''}`
      : 'Saved on this device. Sign in to keep it everywhere and get reminders before the show.';
    document.getElementById('pCta').innerHTML = u ? '' : '<button type="button" class="btn" data-signin>Sign in</button>';
    const stat = (n, l, t) => `<a class="stat" href="#${t}"><b>${n}</b><span>${l}</span></a>`;
    document.getElementById('pStats').innerHTML = stat(L.going.length, 'Going', 'gigs') + stat(L.saved.length, 'Saved', 'gigs') + stat(L.been.length, 'Been to', 'gigs')
      + stat(Object.keys(st.artists).length, 'Following', 'artists') + stat(dg && !dg.error ? dg.collection.length.toLocaleString() : '–', 'Records', 'records')
      + stat(dg && !dg.error ? dg.wants.length.toLocaleString() : '–', 'Wantlist', 'wantlist');
  }
  function overview() {
    const L = lists(), st = MY.get();
    const next = L.going[0] || L.saved[0];
    let h = '';
    if (next) {
      const n = daysTo(next.d);
      h += `<div class="nextup"><a class="nimg" href="${root}artists/${esc(next.s)}.html">${art(next.s, next.a, 'nph')}</a><div class="ntext">
        <span class="ntag">${next.going ? 'Your next gig' : 'Coming up'}</span><h2><a href="${root}artists/${esc(next.s)}.html">${esc(next.a)}</a></h2>
        <p>${esc(when(next.d))}${next.tm ? ' · ' + esc(next.tm) : ''}<br>${esc(next.v)}, ${esc(next.c)}</p>
        <div class="gact"><a class="btn" href="${esc(next.u)}" rel="noopener">Tickets &amp; details</a>${next.going ? '' : `<button class="going" type="button" data-id="${esc(next.id)}" aria-pressed="false">I'm going</button>`}</div></div>
        <div class="ncount"><b>${n <= 0 ? 'Tonight' : n}</b><span>${n <= 0 ? '' : n === 1 ? 'day to go' : 'days to go'}</span></div></div>`;
    } else {
      h += empty('🎟️', 'No gigs saved yet', 'Tap the ♡ on any gig and it lands here, with a countdown and a reminder before the show.',
        `<a class="btn" href="${root}gigs/index.html">Find a gig</a> <a class="btn ghost" href="${root}this-weekend.html">What's on this weekend</a>`);
    }
    const up = [...L.going, ...L.saved].filter(x => x !== next).slice(0, 4);
    if (up.length) h += head('Your gigs', '<a href="#gigs">See all →</a>') + `<div class="ggrid">${up.map(x => gigCard(x, true)).join('')}</div>`;
    // touring from your records
    if (dg && !dg.error) {
      const t = touringFromRecords().slice(0, 8);
      if (t.length) h += head('Touring from your records', '<a href="#artists">See all →</a>') + `<div class="agrid">${t.map(x => artistTile(x.slug, x.name, `You own ${x.n} · ${x.shows} ${x.shows === 1 ? 'show' : 'shows'}`)).join('')}</div>`;
      const recent = dg.collection.slice(0, 12);
      if (recent.length) h += head('Recently added to your collection', '<a href="#records">See all →</a>') + `<div class="rrow">${recent.map((r, i) => recCard(r, i, 'c')).join('')}</div>`;
      const nv = newVinyl();
      if (nv.length) h += head('New on vinyl from your artists') + `<ul class="nvlist">${nv.slice(0, 6).map(r => `<li><span class="nvd">${r[0] === '2027' ? '2027' : esc(dparts(r[0]).dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short'}))}</span><strong>${esc(r[1])} – ${esc(r[2])}</strong><a href="${heathen(r[1] + ' ' + r[2])}" rel="noopener">Pre-order ↗</a></li>`).join('')}</ul>`;
    } else if (!dgLoading) {
      h += `<div class="dgpromo"><div><h2>Bring your records</h2><p>Link your Discogs collection to see your records on Live Louder, which artists you own are touring, and what's coming out on vinyl from them.</p>${linkForm(false)}${dg && dg.error ? `<p class="err">${esc(dg.error)}</p>` : ''}</div><div class="dgstack" aria-hidden="true"><span></span><span></span><span></span></div></div>`;
    }
    const fa = Object.entries(st.artists);
    if (fa.length) h += head('Artists you follow', '<a href="#artists">See all →</a>') + `<div class="arow">${fa.slice(0, 10).map(([s, n]) => `<a class="achip" href="${root}artists/${esc(s)}.html">${art(s, n, 'aph sm')}<span>${esc(n)}</span></a>`).join('')}</div>`;
    return h;
  }
  function gigsTab() {
    const L = lists();
    if (!L.all.length) return empty('🎟️', 'No gigs yet', 'Save gigs from the gig guide, city pages or any artist page. Mark the ones you\'re going to, and they become your gig history afterwards.', `<a class="btn" href="${root}gigs/index.html">Browse the gig guide</a>`);
    let h = '';
    h += head('Going', L.going.length ? `<span class="note">${L.going.length}</span>` : '') + (L.going.length ? `<div class="ggrid">${L.going.map(x => gigCard(x, true)).join('')}</div>` : '<p class="note">Tap "I\'m going" on a saved gig to put it here.</p>');
    h += head('Saved') + (L.saved.length ? `<div class="ggrid">${L.saved.map(x => gigCard(x, true)).join('')}</div>` : '<p class="note">Nothing saved right now.</p>');
    if (L.been.length) h += head('Been to', `<span class="note">${L.been.length} ${L.been.length === 1 ? 'gig' : 'gigs'}</span>`) + `<div class="ggrid">${L.been.map(x => gigCard(x, true)).join('')}</div>`;
    return h;
  }
  function touringFromRecords() {
    if (!dg || dg.error) return [];
    const by = {};
    dg.collection.forEach(r => r.a.split(' & ').forEach(a => { const t = tour(a); if (t) { const k = t.slug; (by[k] = by[k] || {slug: k, name: t.name, n: 0, shows: t.shows}).n++; } }));
    return Object.values(by).sort((a, b) => b.n - a.n);
  }
  function newVinyl() {
    if (!dg || dg.error) return [];
    const mine = new Set([...dg.collection, ...dg.wants].flatMap(r => r.a.split(' & ').map(norm)));
    return rels.filter(r => mine.has(norm(r[1])));
  }
  function artistsTab() {
    const st = MY.get(), fa = Object.entries(st.artists);
    let h = head('Artists you follow', fa.length ? `<span class="note">${fa.length}</span>` : '');
    h += fa.length ? `<div class="agrid">${fa.map(([s, n]) => artistTile(s, n)).join('')}</div>`
      : '<p class="note">Tap Follow on any artist page. You\'ll see their next show here, and with an account we\'ll email you when presales start.</p>';
    const t = touringFromRecords().filter(x => !st.artists[x.slug]);
    if (t.length) h += head('Touring from your records', '<span class="note">Artists you own records by, with Australian dates</span>') + `<div class="agrid">${t.map(x => artistTile(x.slug, x.name, `You own ${x.n} · ${x.shows} ${x.shows === 1 ? 'show' : 'shows'}`)).join('')}</div>`;
    else if (!dg) h += `<p class="note" style="margin-top:28px">Link your Discogs records on the <a href="#records">Records</a> tab and we'll show which artists you own are touring.</p>`;
    return h;
  }
  function shelf(kind) {
    if (dgLoading) return `<div class="loading"><span></span><span></span><span></span><p>Loading your records from Discogs…</p></div>`;
    if (!dg || dg.error) return `<div class="dgpromo big"><div><h2>Link your Discogs collection</h2><p>See your whole collection here as a wall of covers. Tap any record for the tracklist and pressing details, see which of your artists are touring, and find what's on your wantlist.</p>${linkForm(true)}${dg && dg.error ? `<p class="err">${esc(dg.error)}</p>` : ''}<p class="note">Your collection needs to be public on Discogs (it is by default). We only read it.</p></div><div class="dgstack" aria-hidden="true"><span></span><span></span><span></span></div></div>`;
    const list = kind === 'c' ? dg.collection : dg.wants;
    if (kind === 'c' && dg.collectionPrivate) return empty('🔒', 'Your collection is private', 'Make it public in your Discogs privacy settings and it will show here.', '');
    if (!list.length) return empty('💿', kind === 'c' ? 'Nothing in your collection yet' : 'Your wantlist is empty', kind === 'c' ? 'Add records on Discogs and they show up here.' : 'Add records to your Discogs wantlist and they show up here, with a link to find them on vinyl.', '');
    let items = list.map((r, i) => [r, i]);
    if (recQ) { const q = recQ.toLowerCase(); items = items.filter(([r]) => (r.a + ' ' + r.t + ' ' + r.l + ' ' + r.g).toLowerCase().includes(q)); }
    if (recTouring) items = items.filter(([r]) => r.a.split(' & ').some(tour));
    const by = {added: (a, b) => (b[0].add || '').localeCompare(a[0].add || ''), artist: (a, b) => norm(a[0].a).localeCompare(norm(b[0].a)) || a[0].y - b[0].y,
                newest: (a, b) => b[0].y - a[0].y, oldest: (a, b) => (a[0].y || 9999) - (b[0].y || 9999)};
    items.sort(by[recSort] || by.added);
    const shown = kind === 'c' ? recShown : wantShown;
    const tourN = list.filter(r => r.a.split(' & ').some(tour)).length;
    return `<div class="rtools"><input type="search" data-rq placeholder="Search ${kind === 'c' ? 'your records' : 'your wantlist'}" value="${esc(recQ)}" aria-label="Search">
      <select data-rsort aria-label="Sort"><option value="added">Recently added</option><option value="artist">Artist A–Z</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
      ${tourN ? `<button type="button" class="chipbtn" data-rtour aria-pressed="${recTouring}">Touring now <small>${tourN}</small></button>` : ''}
      <span class="note">${items.length.toLocaleString()} ${items.length === 1 ? 'record' : 'records'}</span></div>
      <div class="rgrid">${items.slice(0, shown).map(([r, i]) => recCard(r, i, kind)).join('')}</div>
      ${items.length > shown ? `<button class="morebtn" type="button" data-rmore="${kind}">Show more</button>` : ''}`;
  }
  function settings() {
    const u = window.ACC && ACC.user(), p = (window.ACC && ACC.profile()) || {}, st = MY.get();
    let h = '<div class="sgrid">';
    h += `<div class="card"><h3>Your account</h3>${u ? `<p>Signed in as <b>${esc(u.email || '')}</b></p><p class="acts"><button type="button" class="linkish" data-act="out">Sign out</button></p>`
      : `<p>You're not signed in, so everything here is saved on this device only.</p><button type="button" class="btn" data-signin>Sign in or create an account</button><p class="note">Free. No password needed.</p>`}</div>`;
    h += `<div class="card"><h3>Emails</h3>${u ? `<label class="tog"><input type="checkbox" data-pref="remind_gigs" ${p.remind_gigs !== false ? 'checked' : ''}> A reminder a few days before gigs I've saved</label>
      <label class="tog"><input type="checkbox" data-pref="remind_presales" ${p.remind_presales !== false ? 'checked' : ''}> Presales, on-sales and new dates for artists I follow</label><p class="note">At most one email a day.</p>`
      : '<p>Sign in to get a reminder before your gigs and a heads-up when presales start for artists you follow.</p>'}</div>`;
    h += `<div class="card"><h3>Discogs</h3>${st.discogs ? `<p>Linked to <b>${esc(st.discogs)}</b></p><p class="acts"><button type="button" class="linkish" data-act="unlink">Unlink</button></p>` : `<p>Link your collection to see your records here.</p>${linkForm(false)}`}</div>`;
    h += `<div class="card"><h3>Your data</h3><p>See our <a href="${root}privacy.html">privacy policy</a> for what we keep.</p>${u ? '<p class="acts"><button type="button" class="linkish danger" data-act="delete">Delete my account</button></p>' : ''}</div>`;
    return h + '</div>';
  }

  // ------------------------------------------------ render
  function render() {
    hero();
    document.querySelectorAll('.ptabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
    const body = document.getElementById('pBody');
    body.innerHTML = tab === 'gigs' ? gigsTab() : tab === 'artists' ? artistsTab() : tab === 'records' ? shelf('c') : tab === 'wantlist' ? shelf('w') : tab === 'settings' ? settings() : overview();
    const sel = body.querySelector('[data-rsort]'); if (sel) sel.value = recSort;
    MY.paint();
  }
  window.MYPAGE = render;
  document.addEventListener('acc', render);
  function setTab() { const t = (location.hash || '#overview').slice(1); tab = ['overview', 'gigs', 'artists', 'records', 'wantlist', 'settings'].includes(t) ? t : 'overview'; recQ = ''; recTouring = false; render(); }
  window.addEventListener('hashchange', () => { setTab(); document.querySelector('.ptabs').scrollIntoView({block: 'nearest'}); });

  // ------------------------------------------------ Discogs
  let lastDg = '';
  function loadDiscogs(u) {
    lastDg = u; dgLoading = true; render();
    fetch('/.netlify/functions/discogs-user?u=' + encodeURIComponent(u)).then(r => r.json()).then(j => {
      dg = j; dgLoading = false;
      if (!j.error && MY.get().discogs !== u) { MY.get().discogs = u; MY.save(); MY.push('discogs', 'set', u); }
      render();
    }).catch(() => { dg = {error: "Couldn't reach Discogs. Try again in a minute."}; dgLoading = false; render(); });
  }
  async function openRecord(kind, i) {
    const r = (kind === 'c' ? dg.collection : dg.wants)[i]; if (!r) return;
    const d = document.getElementById('recDlg'), b = document.getElementById('recBody');
    const t = r.a.split(' & ').map(tour).find(Boolean);
    const tourHtml = t ? `<div class="rtourbox"><b>${esc(t.name)} is touring Australia</b><span>${t.shows} ${t.shows === 1 ? 'show' : 'shows'}, next in ${esc(t.city)}</span><a class="btn" href="${root}artists/${esc(t.slug)}.html">Dates &amp; tickets</a></div>` : '';
    b.innerHTML = `<div class="rview"><div class="rcover">${r.img ? `<img src="${esc(r.img)}" alt="${esc(r.a)} – ${esc(r.t)} cover">` : `<span class="rblank big" style="--h:${hue(r.t)}">${esc(r.t.slice(0, 2).toUpperCase())}</span>`}</div>
      <div class="rinfo"><span class="ntag">${kind === 'c' ? 'In your collection' : 'On your wantlist'}</span><h2>${esc(r.t)}</h2><p class="rart">${esc(r.a)}</p>
      <dl class="rmeta">${r.y ? `<dt>Year</dt><dd>${r.y}</dd>` : ''}${r.l ? `<dt>Label</dt><dd>${esc(r.l)}</dd>` : ''}${r.f ? `<dt>Format</dt><dd>${esc(r.f)}${r.fd ? ', ' + esc(r.fd) : ''}</dd>` : ''}${r.g ? `<dt>Style</dt><dd>${esc(r.g)}</dd>` : ''}${r.add && kind === 'c' ? `<dt>Added</dt><dd>${esc(dparts(r.add).dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'}))}</dd>` : ''}</dl>
      ${tourHtml}<div id="recMore"><p class="note">Loading tracklist…</p></div>
      <p class="ractions"><a class="btn" href="${heathen(r.a + ' ' + r.t)}" rel="noopener">${kind === 'c' ? 'Find another copy' : 'Find it on vinyl'} at Heathen Records</a> <a class="btn ghost" href="https://www.discogs.com/release/${esc(r.id)}" rel="noopener">See on Discogs</a></p></div></div>`;
    d.showModal ? d.showModal() : d.setAttribute('open', '');
    try {
      const j = await (await fetch('/.netlify/functions/discogs-user?release=' + encodeURIComponent(r.id))).json();
      const more = document.getElementById('recMore'); if (!more) return;
      if (j.error) { more.innerHTML = ''; return; }
      if (j.image) { const im = b.querySelector('.rcover img'); if (im) im.src = j.image; }
      more.innerHTML = (j.labels.length ? `<p class="note" style="margin-top:0">${esc(j.labels.join(' / '))}${j.country ? ' · ' + esc(j.country) : ''}${j.released ? ' · ' + esc(j.released) : ''}</p>` : '')
        + (j.tracks.length ? `<h4>Tracklist</h4><ol class="tracks">${j.tracks.map(t => `<li><span>${esc(t[0])}</span>${esc(t[1])}<em>${esc(t[2])}</em></li>`).join('')}</ol>` : '')
        + (j.have ? `<p class="note">${j.have.toLocaleString()} Discogs collectors own this pressing, ${j.want.toLocaleString()} want it.</p>` : '');
    } catch (e) { const more = document.getElementById('recMore'); if (more) more.innerHTML = ''; }
  }

  // ------------------------------------------------ events
  box.addEventListener('click', ev => {
    const g = ev.target.closest('button.going');
    if (g) { const st = MY.get(), x = st.gigs[g.dataset.id]; if (x) { x.going = !x.going; MY.save(); MY.push('gig', 'going', x); render(); } return; }
    const rc = ev.target.closest('[data-rec]');
    if (rc) { const [k, i] = rc.dataset.rec.split(':'); openRecord(k, +i); return; }
    if (ev.target.closest('[data-rtour]')) { recTouring = !recTouring; render(); return; }
    const more = ev.target.closest('[data-rmore]');
    if (more) { if (more.dataset.rmore === 'c') recShown += 120; else wantShown += 120; render(); return; }
    const act = ev.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'out' && window.ACC) ACC.signOut();
      if (a === 'delete' && window.ACC) ACC.deleteAccount();
      if (a === 'unlink') { MY.get().discogs = ''; MY.save(); MY.push('discogs', 'set', ''); dg = null; render(); }
    }
  });
  box.addEventListener('submit', ev => {
    const f = ev.target.closest('[data-dgform]'); if (!f) return;
    ev.preventDefault(); const u = f.u.value.trim(); if (u) loadDiscogs(u);
  });
  let typing;
  box.addEventListener('input', ev => {
    if (ev.target.matches('[data-rq]')) { clearTimeout(typing); const pos = ev.target.selectionStart; typing = setTimeout(() => { recQ = ev.target.value; render(); const i = box.querySelector('[data-rq]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 200); }
  });
  box.addEventListener('change', ev => {
    if (ev.target.matches('[data-rsort]')) { recSort = ev.target.value; render(); }
    if (ev.target.matches('[data-pref]') && window.ACC) ACC.setPref(ev.target.dataset.pref, ev.target.checked);
  });

  // ------------------------------------------------ start
  setTab();
  Promise.all([fetch(root + 'gigs.json').then(r => r.json()).catch(() => []), fetch(root + 'data/artists.json').then(r => r.json()).catch(() => ({})),
               fetch(root + 'data/releases.json').then(r => r.json()).catch(() => [])])
    .then(([g, a, r]) => {
      gigsAll = g; arts = a; rels = r;
      for (const [slug, x] of Object.entries(arts)) if (x[3]) touring[norm(x[0])] = {slug, name: x[0], shows: x[5], city: x[4]};
      render();
    });
  const checkDg = () => { const u = MY.get().discogs; if (u && u !== lastDg) { lastDg = u; loadDiscogs(u); } };
  checkDg();
  document.addEventListener('acc', () => setTimeout(checkDg, 500));
});
