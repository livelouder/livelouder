// A shared Live Louder profile: livelouder.com.au/u/<username>.
// Shows the gigs someone is going to, their record collection and wantlist, and what you have in common.
// Data comes from the public_profile database function (supabase/schema.sql), which only answers for shared profiles.
document.addEventListener('DOMContentLoaded', function () {
  const box = document.getElementById('pub');
  if (!box) return;
  const root = document.body.dataset.root || '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const norm = s => String(s).toLowerCase().replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const dparts = iso => { const [y, m, d] = iso.split('-').map(Number); return {y, m, d, dt: new Date(y, m - 1, d)}; };
  const gslug = x => String(x).toLowerCase().replace(/&/g, 'and').replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  const gp = x => x.p || `${root}gig/${gslug(x.id)}.html`;
  const $ = id => document.getElementById(id);

  const m = location.pathname.match(/\/u\/([^/?#]+)/);
  const uname = decodeURIComponent((m && m[1] !== 'index.html' ? m[1] : new URLSearchParams(location.search).get('u')) || '').toLowerCase();
  let P = null, arts = {}, tab = 'gigs', q = '', shown = 60;

  function photo(slug, name) {
    const a = arts[slug], p = a && a[1];
    return p ? `<span class="gph" style="background-image:url('${esc(p)}')"></span>`
      : `<span class="gph poster" style="--h:${hue(name)}"><b>${esc((name.match(/[A-Za-z0-9]+/g) || ['?']).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</b></span>`;
  }
  function gigCard(x, past) {
    const p = dparts(x.d), mine = MY.get().gigs[x.id];
    return `<article class="gcard${past ? ' past' : ''}"><a class="gimg" href="${esc(gp(x))}">${photo(x.s, x.a)}<span class="gdate"><b>${p.d}</b>${MON[p.m - 1]}</span>
      ${x.going ? `<span class="gbadge on">${past ? 'Went' : 'Going'}</span>` : past ? '' : '<span class="gbadge">Interested</span>'}${mine && !past ? '<span class="gbadge you">You too</span>' : ''}</a>
      <div class="gbody"><a class="gname" href="${esc(gp(x))}">${esc(x.a)}</a>
      <span class="gwhen">${past ? p.dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'}) : p.dt.toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short'})}${x.tm && !past ? ' · ' + esc(x.tm) : ''}</span>
      <span class="gwhere">${esc(x.v)}, ${esc(x.c)}</span>
      ${past ? '' : `<div class="gact"><a class="tix" href="${esc(gp(x))}">Tickets</a><button class="save" type="button" data-gig="${esc(JSON.stringify({id: x.id, d: x.d, tm: x.tm, a: x.a, s: x.s, v: x.v, c: x.c, u: x.u, vs: x.vs, p: x.p}))}" aria-pressed="false" aria-label="Save to My gigs">♡</button></div>`}</div></article>`;
  }
  function rec(r) {
    const j = esc(JSON.stringify({rid: r.rid, a: r.a, t: r.t, y: r.y, img: r.img, g: r.g || '', f: r.f || '', l: r.l || ''}));
    return `<div class="rres"><a class="rcard" href="https://www.discogs.com/${r.rid[0] === 'm' ? 'master' : 'release'}/${esc(r.rid.slice(1))}" rel="noopener">
      ${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : `<span class="rblank" style="--h:${hue(r.t)}">${esc(String(r.t).slice(0, 2).toUpperCase())}</span>`}
      <strong>${esc(r.t)}</strong><span>${esc(r.a)}${r.y ? ' · ' + r.y : ''}</span></a>
      <div class="radd"><button type="button" class="addbtn" data-addrec="${j}" data-list="records">+ Collection</button><button type="button" class="addbtn" data-addrec="${j}" data-list="wants">+ Wantlist</button></div></div>`;
  }
  function beenCard(x) {
    const p = dparts(x.d), n = x.rating || 0;
    const photos = (x.photos || []).map(u => `<span class="dph"><a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Photo from ${esc(x.a)}" loading="lazy"></a>${!P.me && window.ACC && ACC.user() ? `<button type="button" class="dreport" data-rgph="${esc(u)}" title="Report this photo" aria-label="Report this photo">⚑</button>` : ''}</span>`).join('');
    return `<article class="dcard"><a class="gimg" href="${esc(gp(x))}">${photo(x.s, x.a)}<span class="gdate"><b>${p.d}</b>${MON[p.m - 1]}</span></a>
      <div class="dbody"><a class="gname" href="${esc(gp(x))}">${esc(x.a)}</a><span class="gwhere">${esc(x.v)}, ${esc(x.c)} · ${p.dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'})}</span>
      ${n ? `<span class="stars" aria-label="${n} out of 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>` : ''}${x.review ? `<q class="frev">${esc(x.review)}</q>` : ''}
      ${photos ? `<div class="dphotos">${photos}</div>` : ''}</div></article>`;
  }
  const head = (h, more) => `<div class="shead"><h2>${h}</h2>${more || ''}</div>`;
  const first = () => String(P.name || P.username).split(' ')[0];

  // What you have in common (only when you're signed in and looking at someone else).
  function common() {
    const st = MY.get(), key = r => norm(r.a) + '|' + norm(r.t);
    const mineRec = new Set(Object.values(st.records || {}).map(key)), mineWant = new Set(Object.values(st.wants || {}).map(key));
    const theirRec = new Set(P.collection.map(key)), theirWant = new Set(P.wants.map(key));
    return {
      gigs: P.gigs.filter(g => st.gigs[g.id]),
      both: P.collection.filter(r => mineRec.has(key(r))),
      theyHaveYouWant: P.collection.filter(r => mineWant.has(key(r))),
      youHaveTheyWant: Object.values(st.records || {}).filter(r => theirWant.has(key(r))),
    };
  }

  function hero() {
    $('uAv').innerHTML = P.avatar ? `<img src="${esc(P.avatar)}" alt="" referrerpolicy="no-referrer">` : esc((P.name || P.username)[0].toUpperCase());
    $('uName').textContent = P.name || P.username;
    const hb = $('uHero'); hb.classList.toggle('hasbanner', !!P.banner);
    $('uAv').style.setProperty('--h', hue(P.username)); hb.style.setProperty('--h', hue(P.username));
    hb.style.backgroundImage = P.banner ? `linear-gradient(180deg,rgba(20,20,20,.15) 0,rgba(20,20,20,.55) 45%,rgba(20,20,20,.96) 100%),url('${String(P.banner).replace(/'/g, '%27')}')` : '';
    $('uSub').innerHTML = `@${esc(P.username)}${P.since ? ` · On Live Louder since ${new Date(P.since).toLocaleDateString('en-AU', {month: 'long', year: 'numeric'})}` : ''}${P.follows_you ? ' · <b>Follows you</b>' : ''}`;
    const signedIn = window.ACC && ACC.user();
    $('uCta').innerHTML = P.me ? `<a class="btn" href="${root}my-gigs.html#settings">Edit my profile</a>`
      : `<button type="button" class="followbtn big${P.following ? ' on' : ''}" data-ufollow>${P.following ? 'Following' : signedIn ? 'Follow' : 'Follow ' + esc(first())}</button>`
        + (P.following && P.follows_you ? `<a class="btn msgbtn" href="${root}messages.html?u=${encodeURIComponent(P.username)}">💬 Message</a>` : '')
        + (P.avatar || P.banner ? '<button type="button" class="linkish small reportlink" data-ureport>Report a photo</button>' : '');
    const going = P.gigs.filter(g => g.going).length;
    const stat = (n, l, t) => `<a class="stat" href="#${t}" data-utab="${t}"><b>${Number(n).toLocaleString()}</b><span>${l}</span></a>`;
    $('uStats').innerHTML = stat(going, 'Going', 'gigs') + stat(P.gigs.length - going, 'Interested', 'gigs') + stat(P.been.length, 'Been to', 'gigs')
      + stat(P.records, 'Records', 'records') + stat(P.n_wants, 'Wantlist', 'wantlist') + stat(P.n_followers, P.n_followers === 1 ? 'Follower' : 'Followers', 'gigs');
    const tabs = [['gigs', 'Gigs'], ['records', 'Records'], ['wantlist', 'Wantlist']];
    $('uTabs').innerHTML = tabs.map(([k, n]) => `<a href="#${k}" data-utab="${k}" aria-current="${tab === k ? 'page' : 'false'}">${n}</a>`).join('');
  }
  function gigsTab() {
    let h = '';
    if (P.me && !P.shared) h += `<div class="sharebox"><div><span class="ntag">Only you can see this</span><p>Your profile is private. Switch on sharing in <a href="${root}my-gigs.html#settings">Settings</a> so friends can follow you.</p></div></div>`;
    if (!P.me && window.ACC && ACC.user()) {
      const c = common();
      const bits = [];
      if (c.gigs.length) bits.push(`You're both into <b>${c.gigs.length} ${c.gigs.length === 1 ? 'gig' : 'gigs'}</b>: ${c.gigs.slice(0, 3).map(g => esc(g.a)).join(', ')}`);
      if (c.both.length) bits.push(`You both own <b>${c.both.length} ${c.both.length === 1 ? 'record' : 'records'}</b>`);
      if (c.theyHaveYouWant.length) bits.push(`${esc(first())} owns <b>${c.theyHaveYouWant.length}</b> from your wantlist`);
      if (c.youHaveTheyWant.length) bits.push(`You own <b>${c.youHaveTheyWant.length}</b> from ${esc(first())}'s wantlist`);
      if (bits.length) h += `<div class="incommon"><span class="ntag">In common</span><ul>${bits.map(b => `<li>${b}</li>`).join('')}</ul></div>`;
    }
    const up = P.gigs, going = up.filter(g => g.going), inter = up.filter(g => !g.going);
    h += head('Going', going.length ? `<span class="note">${going.length}</span>` : '') + (going.length ? `<div class="ggrid">${going.map(g => gigCard(g)).join('')}</div>` : `<p class="note">${esc(first())} hasn't marked any upcoming gigs as going yet.</p>`);
    if (inter.length) h += head('Interested', `<span class="note">${inter.length}</span>`) + `<div class="ggrid">${inter.map(g => gigCard(g)).join('')}</div>`;
    if (P.been.length) h += head(P.me ? 'Your gig diary' : `${esc(first())}'s gig diary`, `<span class="note">${P.been.length} ${P.been.length === 1 ? 'gig' : 'gigs'}</span>`) + `<div class="dgrid">${P.been.map(beenCard).join('')}</div>`;
    return h;
  }
  function shelf(list) {
    const all = list === 'records' ? P.collection : P.wants, total = list === 'records' ? P.records : P.n_wants;
    if (!all.length) return `<p class="note">${list === 'records' ? `${esc(first())} hasn't added any records yet.` : 'Nothing on the wantlist yet.'}</p>`;
    let items = all;
    if (q) { const s = q.toLowerCase(); items = all.filter(r => (r.a + ' ' + r.t + ' ' + (r.l || '') + ' ' + (r.g || '')).toLowerCase().includes(s)); }
    let h = '';
    if (list === 'records' && !P.me && window.ACC && ACC.user()) {
      const c = common();
      if (c.theyHaveYouWant.length) h += head(`${esc(first())} owns these from your wantlist`) + `<div class="rrow">${c.theyHaveYouWant.slice(0, 20).map(rec).join('')}</div>`;
    }
    if (list === 'wantlist' && !P.me && window.ACC && ACC.user()) {
      const c = common();
      if (c.youHaveTheyWant.length) h += head(`You own these from ${esc(first())}'s wantlist`) + `<div class="rrow">${c.youHaveTheyWant.slice(0, 20).map(rec).join('')}</div>`;
    }
    h += head(list === 'records' ? 'Record collection' : 'Wantlist', `<span class="note">${Number(total).toLocaleString()} ${total === 1 ? 'record' : 'records'}${total > all.length ? `, latest ${all.length.toLocaleString()} shown` : ''}</span>`)
      + `<div class="rtools"><input type="search" data-uq placeholder="Filter by artist, album or label" value="${esc(q)}" aria-label="Filter"></div>`
      + `<div class="rgrid">${items.slice(0, shown).map(rec).join('')}</div>`
      + (items.length > shown ? '<button class="morebtn" type="button" data-umore>Show more</button>' : '')
      + (!items.length ? '<p class="note">Nothing matches that filter.</p>' : '');
    return h;
  }
  function render() {
    if (!P) return;
    hero();
    $('uBody').innerHTML = tab === 'records' ? shelf('records') : tab === 'wantlist' ? shelf('wantlist') : gigsTab();
    MY.paint();
  }
  function notFound(title, text) {
    document.title = title + ' | Live Louder';
    $('uName').textContent = title;
    $('uSub').textContent = '';
    $('uBody').innerHTML = `<div class="empty"><div class="eicon" aria-hidden="true">🔒</div><h3>${esc(title)}</h3><p>${text}</p><a class="btn" href="${root}my-gigs.html#friends">Find friends</a> <a class="btn ghost" href="${root}gigs/index.html">Browse gigs</a></div>`;
  }
  async function load() {
    if (!uname) return notFound('Find your friends', 'Open a friend\'s Live Louder link, or search for them on the Friends tab of My gigs.');
    await ACC.session();
    const [r, a] = await Promise.all([ACC.rpc('public_profile', {uname}), fetch(root + 'data/artists.json').then(x => x.json()).catch(() => ({}))]);
    arts = a;
    if (r.error) return notFound('Couldn\'t load this profile', 'Something went wrong. Try again in a minute.');
    if (!r.data) return notFound('No one here by that name', 'Check the link, or search for your friend on the Friends tab of My gigs.');
    if (r.data.private) return notFound('This profile is private', 'This person hasn\'t shared their gigs and records.');
    P = r.data;
    document.title = `${P.name || P.username} on Live Louder`;
    setTab();
  }
  function setTab() { const t = (location.hash || '#gigs').slice(1); tab = ['gigs', 'records', 'wantlist'].includes(t) ? t : 'gigs'; q = ''; shown = 60; render(); }
  window.addEventListener('hashchange', () => { setTab(); const n = document.querySelector('.ptabs'); if (n) n.scrollIntoView({block: 'nearest'}); });
  window.MYPAGE = render;
  document.addEventListener('acc', render);

  box.addEventListener('click', async ev => {
    const f = ev.target.closest('[data-ufollow]');
    if (f) {
      if (!ACC.user()) { ACC.open(); return; }
      f.disabled = true;
      const r = P.following ? await ACC.rpc('unfollow_user', {uname: P.username}) : await ACC.rpc('follow_user', {uname: P.username});
      if (!r.error) { P.n_followers += P.following ? -1 : 1; P.following = !P.following; }
      render();
      return;
    }
    if (ev.target.closest('[data-umore]')) { shown += 60; render(); }
    const rg = ev.target.closest('[data-rgph]');
    if (rg) { if (!confirm('Report this photo? It will be hidden while we take a look.')) return;
      const r = await ACC.reportPhoto(P.username, 'gig', 'other', rg.dataset.rgph);
      if (r.error) alert(r.error); else { P.been.forEach(g => { g.photos = (g.photos || []).filter(u => u !== rg.dataset.rgph); }); render(); } }
    if (ev.target.closest('[data-ureport]')) { if (!ACC.user()) { ACC.open(); return; } openReport(); }
  });
  let typing;
  box.addEventListener('input', ev => {
    if (!ev.target.matches('[data-uq]')) return;
    clearTimeout(typing); const pos = ev.target.selectionStart;
    typing = setTimeout(() => { q = ev.target.value; shown = 60; render(); const i = box.querySelector('[data-uq]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 200);
  });
  // Report a profile photo or cover photo (netlify/functions/report-photo.mjs).
  function openReport() {
    let d = document.getElementById('reportDlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'reportDlg'; d.className = 'reportdlg'; document.body.appendChild(d); }
    const which = [P.avatar && ['avatar', 'Profile photo'], P.banner && ['banner', 'Cover photo']].filter(Boolean);
    d.innerHTML = `<form method="dialog" class="sclose"><button aria-label="Close">×</button></form>
      <h2>Report a photo</h2><p>Thanks for helping keep Live Louder friendly. The photo is hidden straight away while we take a look.</p>
      <form id="repForm">
        ${which.length > 1 ? `<fieldset><legend>Which photo?</legend>${which.map(([k, n], i) => `<label class="tog"><input type="radio" name="kind" value="${k}" ${i ? '' : 'checked'}> ${n}</label>`).join('')}</fieldset>` : `<input type="hidden" name="kind" value="${which[0][0]}">`}
        <label>What's wrong with it?<select name="reason">
          <option value="nudity">Nudity or sexual</option><option value="violence">Violence or gore</option><option value="hate">Hateful or offensive</option>
          <option value="notmine">It's not their photo (it's mine, or someone else's)</option><option value="other">Something else</option></select></label>
        <button class="btn">Send report</button><p class="note" id="repMsg"></p></form>`;
    d.querySelector('#repForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, kind = f.kind.value, msg = d.querySelector('#repMsg'), b = f.querySelector('button');
      b.disabled = true; msg.textContent = 'Sending…';
      const r = await ACC.reportPhoto(P.username, kind, f.reason.value);
      if (r.error) { msg.textContent = r.error; b.disabled = false; return; }
      msg.textContent = "Thanks. It's hidden while we take a look.";
      P[kind] = null; render();
      setTimeout(() => d.close(), 1600);
    });
    d.showModal();
  }
  load();
});
