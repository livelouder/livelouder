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
  let uploading = '', photoMsg = '', people = null, peopleLoading = false, find = {q: '', results: null, loading: false}, shareMsg = '', copied = false;
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
    const t = r.a.split(' & ').map(tour).find(Boolean);
    return `<button class="rcard" type="button" data-rec="${esc(r.rid)}" data-from="${list}">${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : `<span class="rblank" style="--h:${hue(r.t)}">${esc(r.t.slice(0, 2).toUpperCase())}</span>`}
      ${t ? '<span class="rtour">Touring</span>' : ''}<strong>${esc(r.t)}</strong><span>${esc(r.a)}${r.y ? ' · ' + r.y : ''}</span></button>`;
  }
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
          <div class="radd"><button type="button" class="addbtn" data-addrec="${j}" data-list="records">+ Collection</button><button type="button" class="addbtn" data-addrec="${j}" data-list="wants">+ Wantlist</button></div></div>`; }).join('') + '</div></div>';
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
    heroEl.classList.toggle('hasbanner', !!pr.banner_url);
    heroEl.style.backgroundImage = pr.banner_url ? `linear-gradient(180deg,rgba(20,20,20,.15) 0,rgba(20,20,20,.55) 45%,rgba(20,20,20,.96) 100%),url('${pr.banner_url.replace(/'/g, '%27')}')` : '';
    const cam = document.getElementById('pCam'), cov = document.getElementById('pCover');
    cam.hidden = cov.hidden = !u;
    cam.textContent = uploading === 'avatar' ? '…' : '📷';
    cov.textContent = uploading === 'banner' ? 'Uploading…' : pr.banner_url ? '📷 Change cover' : '📷 Add a cover photo';
    document.getElementById('pName').textContent = u ? (pr.display_name || md.full_name || (u.email || '').split('@')[0]) : 'My gigs';
    document.getElementById('pSub').innerHTML = u ? `Member since ${new Date(u.created_at).toLocaleDateString('en-AU', {month: 'long', year: 'numeric'})}`
      : 'Saved on this device. Sign in to keep it everywhere and get reminders before the show.';
    document.getElementById('pCta').innerHTML = u ? '' : '<button type="button" class="btn" data-signin>Sign in</button>';
    const stat = (n, l, t) => `<a class="stat" href="#${t}"><b>${n}</b><span>${l}</span></a>`;
    document.getElementById('pStats').innerHTML = stat(L.going.length, 'Going', 'gigs') + stat(L.saved.length, 'Saved', 'gigs') + stat(L.been.length, 'Been to', 'gigs')
      + stat(Object.keys(st.artists).length, 'Following', 'artists') + stat(recs('records').length.toLocaleString(), 'Records', 'records')
      + stat(recs('wants').length.toLocaleString(), 'Wantlist', 'wantlist');
  }
  function overview() {
    const L = lists(), st = MY.get();
    const next = L.going[0] || L.saved[0];
    let h = '';
    if (next) {
      const n = daysTo(next.d);
      h += `<div class="nextup"><a class="nimg" href="${root}artists/${esc(next.s)}.html">${art(next.s, next.a, 'nph')}</a><div class="ntext">
        <span class="ntag">${next.going ? 'Your next gig' : 'Coming up'}</span><h2><a href="${esc(gp(next))}">${esc(next.a)}</a></h2>
        <p>${esc(when(next.d))}${next.tm ? ' · ' + esc(next.tm) : ''}<br>${esc(next.v)}, ${esc(next.c)}</p>
        <div class="gact"><a class="btn" href="${esc(next.u)}" rel="noopener">Tickets &amp; details</a>${next.going ? '' : `<button class="going" type="button" data-id="${esc(next.id)}" aria-pressed="false">I'm going</button>`}</div></div>
        <div class="ncount"><b>${n <= 0 ? 'Tonight' : n}</b><span>${n <= 0 ? '' : n === 1 ? 'day to go' : 'days to go'}</span></div></div>`;
    } else {
      h += empty('🎟️', 'No gigs saved yet', 'Tap the ♡ on any gig and it lands here, with a countdown and a reminder before the show.',
        `<a class="btn" href="${root}gigs/index.html">Find a gig</a> <a class="btn ghost" href="${root}this-weekend.html">What's on this weekend</a>`);
    }
    const up = [...L.going, ...L.saved].filter(x => x !== next).slice(0, 4);
    if (up.length) h += head('Your gigs', '<a href="#gigs">See all →</a>') + `<div class="ggrid">${up.map(x => gigCard(x, true)).join('')}</div>`;
    // records
    const col = recs('records');
    if (col.length) {
      const t = touringFromRecords().slice(0, 8);
      if (t.length) h += head('Touring from your records', '<a href="#artists">See all →</a>') + `<div class="agrid">${t.map(x => artistTile(x.slug, x.name, `You own ${x.n} · ${x.shows} ${x.shows === 1 ? 'show' : 'shows'}`)).join('')}</div>`;
      const recent = col.sort((a, b) => (b.add || '').localeCompare(a.add || '')).slice(0, 12);
      h += head('Recently added to your collection', '<a href="#records">See all →</a>') + `<div class="rrow">${recent.map(r => recCard(r, 'records')).join('')}</div>`;
      const nv = newVinyl();
      if (nv.length) h += head('New on vinyl from your artists') + `<ul class="nvlist">${nv.slice(0, 6).map(r => `<li><span class="nvd">${r[0] === '2027' ? '2027' : esc(dparts(r[0]).dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short'}))}</span><strong>${esc(r[1])} – ${esc(r[2])}</strong><a href="${heathen(r[1] + ' ' + r[2])}" rel="noopener">Pre-order ↗</a></li>`).join('')}</ul>`;
    } else {
      h += `<div class="dgpromo"><div><h2>Start your record collection</h2><p>Add the records you own and the ones you're after. We'll show you which of your artists are touring and what's coming out on vinyl from them.</p>${searchForm('Search an album or artist, e.g. Powderfinger')}<p class="note">Already on Discogs? <a href="#records">Import your collection</a> in one go.</p></div><div class="dgstack" aria-hidden="true"><span></span><span></span><span></span></div></div>`;
      if (srch.results || srch.loading || srch.error) h += results();
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
  function shelf(list) {
    const items0 = recs(list), isCol = list === 'records';
    let h = `<div class="addbar">${searchForm(isCol ? 'Add to your collection: search any album or artist' : 'Add to your wantlist: search any album or artist')}
      <details class="impbox"${imp.loading || imp.msg ? ' open' : ''}><summary>Import from Discogs</summary><p class="note" style="margin-top:6px">Brings in your Discogs collection and wantlist (they need to be public). Records you already have here are kept.</p>${linkForm(false)}</details></div>`;
    h += results();
    if (!items0.length) return h + empty(isCol ? '💿' : '🔎', isCol ? 'Your collection is empty' : 'Your wantlist is empty',
      isCol ? 'Search above and tap <b>+ Collection</b> on the records you own. Or import them from Discogs in one go.' : 'Search above and tap <b>+ Wantlist</b> on the records you\'re after. We\'ll link you straight to them on vinyl.', '');
    let items = items0.slice();
    if (recQ) { const q = recQ.toLowerCase(); items = items.filter(r => (r.a + ' ' + r.t + ' ' + (r.l || '') + ' ' + (r.g || '')).toLowerCase().includes(q)); }
    if (recTouring) items = items.filter(r => r.a.split(' & ').some(tour));
    const by = {added: (a, b) => (b.add || '').localeCompare(a.add || ''), artist: (a, b) => norm(a.a).localeCompare(norm(b.a)) || a.y - b.y,
                newest: (a, b) => b.y - a.y, oldest: (a, b) => (a.y || 9999) - (b.y || 9999)};
    items.sort(by[recSort] || by.added);
    const shown = isCol ? recShown : wantShown;
    const tourN = items0.filter(r => r.a.split(' & ').some(tour)).length;
    h += `<div class="shead"><h2>${isCol ? 'Your collection' : 'Your wantlist'}</h2><span class="note">${items0.length.toLocaleString()} ${items0.length === 1 ? 'record' : 'records'}</span></div>
      <div class="rtools"><input type="search" data-rq placeholder="Filter ${isCol ? 'your records' : 'your wantlist'}" value="${esc(recQ)}" aria-label="Filter">
      <select data-rsort aria-label="Sort"><option value="added">Recently added</option><option value="artist">Artist A–Z</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
      ${tourN ? `<button type="button" class="chipbtn" data-rtour aria-pressed="${recTouring}">Touring now <small>${tourN}</small></button>` : ''}</div>
      <div class="rgrid">${items.slice(0, shown).map(r => recCard(r, list)).join('')}</div>
      ${items.length > shown ? `<button class="morebtn" type="button" data-rmore="${list}">Show more</button>` : ''}
      ${!items.length ? '<p class="note">Nothing matches that filter.</p>' : ''}`;
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
    return `<div class="ptile">${p.shared ? `<a href="${purl(p.username)}">` : '<div>'}${avatar(p, 'fav')}<strong>${esc(p.name || p.username)}</strong><span class="handle">@${esc(p.username)}</span>${p.shared ? '</a>' : '</div>'}
      <span class="anext">${esc(line)}</span><div class="pbtns">${btn}</div></div>`;
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
    h += `<form class="recsearch findform" data-findpeople role="search"><input name="q" type="search" placeholder="Find friends by name or username" aria-label="Find friends" value="${esc(find.q)}" autocomplete="off"><button class="btn">Search</button></form>`;
    if (find.loading) h += '<p class="note">Searching…</p>';
    else if (find.results) h += find.results.length ? `<div class="shead"><h3>People matching "${esc(find.q)}"</h3><button type="button" class="linkish" data-clearfind>Clear</button></div><div class="pgrid">${find.results.map(p => personTile(p, 'search')).join('')}</div>`
      : `<p class="note">No one found for "${esc(find.q)}". Only people who share their profile show up. Ask your friend for their Live Louder link.</p>`;
    if (!people) return h + '<p class="note">Loading your friends…</p>';
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
    const photos = `<div class="photorow"><div class="phbox"><span class="phav">${pic ? `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer">` : esc((p.display_name || md.full_name || u.email || '?')[0].toUpperCase())}</span>
        <div><b>Profile photo</b><div class="pbtns"><button type="button" class="btn ghost sm" data-pickphoto="avatar">${uploading === 'avatar' ? 'Uploading…' : p.avatar_url ? 'Change' : 'Upload'}</button>${p.avatar_url ? '<button type="button" class="linkish small" data-rmphoto="avatar">Remove</button>' : ''}</div></div></div>
      <div class="phbox"><span class="phban"${p.banner_url ? ` style="background-image:url('${esc(p.banner_url)}')"` : ''}></span>
        <div><b>Cover photo</b><div class="pbtns"><button type="button" class="btn ghost sm" data-pickphoto="banner">${uploading === 'banner' ? 'Uploading…' : p.banner_url ? 'Change' : 'Upload'}</button>${p.banner_url ? '<button type="button" class="linkish small" data-rmphoto="banner">Remove</button>' : ''}</div></div></div></div>
      ${photoMsg ? `<p class="note impmsg">${photoMsg}</p>` : ''}<p class="note">A wide photo works best for the cover, like a crowd shot or your favourite venue. Only post photos you took or have permission to use.</p>`;
    return `<div class="card wide" id="sharing"><h3>Your profile and friends</h3>${photos}
      <form data-shareform class="shareform">
      <label>Username<span class="uname"><i>livelouder.com.au/u/</i><input name="username" value="${esc(p.username || suggestName())}" maxlength="24" autocapitalize="off" autocomplete="off" spellcheck="false" pattern="[a-z0-9_]{3,24}" required></span></label>
      <label>Name people see<input name="display_name" value="${esc(p.display_name || md.full_name || '')}" maxlength="40" placeholder="Your name or a nickname"></label>
      <label class="tog"><input type="checkbox" name="share" ${p.share ? 'checked' : ''}> <span><b>Share my profile.</b> Anyone with your link, and people who follow you, can see the gigs you've saved and are going to, and your record collection and wantlist. Your email address is never shown.</span></label>
      <button class="btn">Save</button>${shareMsg ? `<p class="note impmsg">${shareMsg}</p>` : ''}</form>
      <p class="note">Switch sharing off any time and your profile goes private straight away.</p></div>`;
  }
  function settings() {
    const u = window.ACC && ACC.user(), p = (window.ACC && ACC.profile()) || {}, st = MY.get();
    let h = '<div class="sgrid">' + shareCard();
    h += `<div class="card"><h3>Your account</h3>${u ? `<p>Signed in as <b>${esc(u.email || '')}</b></p><p class="acts"><button type="button" class="linkish" data-act="out">Sign out</button></p>`
      : `<p>You're not signed in, so everything here is saved on this device only.</p><button type="button" class="btn" data-signin>Sign in or create an account</button><p class="note">Free. No password needed.</p>`}</div>`;
    h += `<div class="card"><h3>Emails</h3>${u ? `<label class="tog"><input type="checkbox" data-pref="remind_gigs" ${p.remind_gigs !== false ? 'checked' : ''}> A reminder a few days before gigs I've saved</label>
      <label class="tog"><input type="checkbox" data-pref="remind_presales" ${p.remind_presales !== false ? 'checked' : ''}> Presales, on-sales and new dates for artists I follow</label><p class="note">At most one email a day.</p>`
      : '<p>Sign in to get a reminder before your gigs and a heads-up when presales start for artists you follow.</p>'}</div>`;
    h += `<div class="card"><h3>Records</h3><p>${recs('records').length.toLocaleString()} in your collection, ${recs('wants').length.toLocaleString()} on your wantlist.</p><p class="note" style="margin-top:0">Import from Discogs any time. Records you already have here are kept.</p>${linkForm(false)}</div>`;
    h += `<div class="card"><h3>Your data</h3><p>See our <a href="${root}privacy.html">privacy policy</a> for what we keep.</p>${u ? '<p class="acts"><button type="button" class="linkish danger" data-act="delete">Delete my account</button></p>' : ''}</div>`;
    return h + '</div>';
  }

  // ------------------------------------------------ render
  function render() {
    hero();
    document.querySelectorAll('.ptabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
    const body = document.getElementById('pBody');
    body.innerHTML = tab === 'gigs' ? gigsTab() : tab === 'artists' ? artistsTab() : tab === 'records' ? shelf('records') : tab === 'wantlist' ? shelf('wants') : tab === 'settings' ? settings() : tab === 'friends' ? friendsTab() : overview();
    const sel = body.querySelector('[data-rsort]'); if (sel) sel.value = recSort;
    MY.paint();
  }
  window.MYPAGE = render;
  document.addEventListener('acc', render);
  function setTab() { const t = (location.hash || '#overview').slice(1); tab = ['overview', 'gigs', 'artists', 'records', 'wantlist', 'friends', 'settings'].includes(t) ? t : 'overview'; recQ = ''; recTouring = false; imp.msg = ''; render(); }
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
      <div class="radd big"><button type="button" class="addbtn" data-addrec="${j}" data-list="records">+ Collection</button><button type="button" class="addbtn" data-addrec="${j}" data-list="wants">+ Wantlist</button></div>
      <dl class="rmeta">${r.y ? `<dt>Year</dt><dd>${r.y}</dd>` : ''}${r.l ? `<dt>Label</dt><dd>${esc(r.l)}</dd>` : ''}${r.f ? `<dt>Format</dt><dd>${esc(r.f)}</dd>` : ''}${r.g ? `<dt>Style</dt><dd>${esc(r.g)}</dd>` : ''}${r.add && st.records[rid] ? `<dt>Added</dt><dd>${esc(dparts(r.add).dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'}))}</dd>` : ''}</dl>
      ${tourHtml}<div id="recMore"><p class="note">Loading tracklist…</p></div>
      <p class="ractions"><a class="btn" href="${heathen(r.a + ' ' + r.t)}" rel="noopener">Find it on vinyl at Heathen Records</a> <a class="btn ghost" href="https://www.discogs.com/${rid[0] === 'm' ? 'master' : 'release'}/${esc(rid.slice(1))}" rel="noopener">See on Discogs</a></p></div></div>`;
    MY.paint();
    d.showModal ? d.showModal() : d.setAttribute('open', '');
    try {
      const k = rid[0] === 'm' ? 'master' : 'release';
      const x = await (await fetch(`/.netlify/functions/discogs-user?${k}=${encodeURIComponent(rid.slice(1))}`)).json();
      const more = document.getElementById('recMore'); if (!more) return;
      if (x.error) { more.innerHTML = ''; return; }
      if (x.image) { const im = b.querySelector('.rcover img'); if (im) im.src = x.image; }
      more.innerHTML = (x.labels && x.labels.length ? `<p class="note" style="margin-top:0">${esc(x.labels.join(' / '))}${x.country ? ' · ' + esc(x.country) : ''}${x.released ? ' · ' + esc(x.released) : ''}</p>` : '')
        + (x.tracks && x.tracks.length ? `<h4>Tracklist</h4><ol class="tracks">${x.tracks.map(t => `<li><span>${esc(t[0])}</span>${esc(t[1])}<em>${esc(t[2])}</em></li>`).join('')}</ol>` : '')
        + (x.have ? `<p class="note">${x.have.toLocaleString()} Discogs collectors own this pressing, ${x.want.toLocaleString()} want it.</p>` : '');
    } catch (e) { const more = document.getElementById('recMore'); if (more) more.innerHTML = ''; }
  }
  document.getElementById('recDlg').addEventListener('close', () => render());

  // ------------------------------------------------ events
  box.addEventListener('click', ev => {
    const g = ev.target.closest('button.going');
    if (g) { const st = MY.get(), x = st.gigs[g.dataset.id]; if (x) { x.going = !x.going; MY.save(); MY.push('gig', 'going', x); render(); } return; }
    const fo = ev.target.closest('[data-follow]'), uf = ev.target.closest('[data-unfollow]'), rf = ev.target.closest('[data-removefollower]');
    if (fo || uf || rf) {
      const b = fo || uf || rf; b.disabled = true;
      const call = fo ? ACC.rpc('follow_user', {uname: fo.dataset.follow}) : ACC.rpc('unfollow_user', {uname: (uf || rf).dataset.unfollow || rf.dataset.removefollower, remove_follower: !!rf});
      call.then(() => { if (find.results) find.results.forEach(p => { if (p.username === b.dataset.follow) p.following = true; if (p.username === b.dataset.unfollow) p.following = false; }); loadPeople(true); });
      return;
    }
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
    const f = ev.target.closest('[data-dgform]');
    if (f) { ev.preventDefault(); const u = f.u.value.trim(); if (u && !imp.loading) importDiscogs(u); return; }
    const pf = ev.target.closest('[data-findpeople]');
    if (pf) { ev.preventDefault(); const q = pf.q.value.trim(); if (q.length < 2) return; find = {q, results: null, loading: true}; render();
      ACC.rpc('find_people', {q}).then(r => { find = {q, results: r.data || [], loading: false}; render(); }); return; }
    const shf = ev.target.closest('[data-shareform]');
    if (shf) { ev.preventDefault();
      const username = shf.username.value.trim().toLowerCase(), display_name = shf.display_name.value.trim(), share = shf.share.checked;
      if (!/^[a-z0-9_]{3,24}$/.test(username)) { shareMsg = 'Usernames are 3 to 24 lowercase letters, numbers or underscores.'; render(); return; }
      shareMsg = 'Saving…'; render();
      ACC.saveProfile({username, display_name: display_name || null, share}).then(r => { shareMsg = r.error ? esc(r.error) : share ? `Saved. Your profile is shared at <a href="${purl(username)}">livelouder.com.au/u/${esc(username)}</a>.` : 'Saved. Your profile is private.'; render(); });
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
    if (ev.target.matches('[data-pref]') && window.ACC) ACC.setPref(ev.target.dataset.pref, ev.target.checked);
  });

  // ------------------------------------------------ photos
  let pickKind = '';
  const fileIn = document.getElementById('pFile');
  function pickPhoto(kind) { if (!me()) { ACC.open(); return; } if (uploading) return; pickKind = kind; fileIn.value = ''; fileIn.click(); }
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0]; if (!f) return;
    if (f.size > 25 * 1024 * 1024) { photoMsg = 'That photo is too big. Try one under 25 MB.'; render(); return; }
    uploading = pickKind; photoMsg = ''; render();
    ACC.setPhoto(pickKind, f).then(r => { uploading = ''; photoMsg = r.error ? esc(r.error) : ''; render(); });
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
});
