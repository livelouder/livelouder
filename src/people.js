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
  let P = null, arts = {}, tab = 'activity', q = '', shown = 60;

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
    ['cv', 'cv0', 'cv1', 'cv2'].forEach(c => hb.classList.remove(c));
    if (!P.banner) hb.classList.add('cv', 'cv' + (hue(P.username) % 3));
    hb.style.backgroundImage = P.banner ? `url('${String(P.banner).replace(/'/g, '%27')}')` : '';
    $('uHandle').innerHTML = `@${esc(P.username)}${P.follows_you ? ' <span class="fyou">Follows you</span>' : ''}`;
    const bits = [P.bio ? esc(P.bio) : '', P.city ? `📍 ${esc(P.city)}` : '', !P.bio && P.since ? `On Live Louder since ${new Date(P.since).toLocaleDateString('en-AU', {month: 'long', year: 'numeric'})}` : ''].filter(Boolean);
    $('uSub').innerHTML = bits.join(' <span class="dotsep">·</span> ');
    const signedIn = window.ACC && ACC.user();
    $('uCta').innerHTML = P.me ? `<a class="btn ghost sm" href="${root}my-gigs.html#settings">Edit profile</a>`
      : `<button type="button" class="followbtn big${P.following ? ' on' : ''}" data-ufollow>${P.following ? 'Following' : signedIn ? 'Follow' : 'Follow ' + esc(first())}</button>`
        + (P.following && P.follows_you ? `<a class="btn ghost sm msgbtn" href="${root}messages.html?u=${encodeURIComponent(P.username)}">Message</a>` : '')
        + (P.avatar || P.banner ? '<button type="button" class="linkish small reportlink" data-ureport>Report a photo</button>' : '');
    const going = P.gigs.filter(g => g.going).length;
    const stat = (n, l, t) => n ? `<a href="#${t}" data-utab="${t}"><b>${Number(n).toLocaleString()}</b> ${l}</a>` : '';
    $('uStats').innerHTML = [stat(P.n_seen || P.been.length, 'seen live', 'seen'), stat(going, 'going', 'gigs'), stat(P.records, 'records', 'records'),
      stat(P.n_followers, P.n_followers === 1 ? 'follower' : 'followers', 'activity'), stat(P.n_following, 'following', 'activity')].filter(Boolean).join('');
    const tabs = [['activity', 'Activity'], ['gigs', 'Gigs'], ['seen', 'Seen live'], ['records', 'Records'], ['wantlist', 'Wantlist']];
    $('uTabs').innerHTML = tabs.map(([k, n]) => `<a href="#${k}" data-utab="${k}" aria-current="${tab === k ? 'page' : 'false'}">${n}</a>`).join('');
  }
  // ------------------------------------------------ activity: their posts, gigs, ratings, records and photos
  let act = null, actLoading = false;
  function loadAct(force) {
    if (actLoading || (act && !force)) return;
    actLoading = true;
    ACC.rpc('profile_activity', {uname: P.username}).then(r => { act = r.data || []; actLoading = false; render(); });
  }
  document.addEventListener('llpost', () => { if (P && P.me) loadAct(true); });
  function activityTab() {
    loadAct();
    let h = '';
    if (P.me && !P.shared) h += `<div class="sharebox"><div><span class="ntag">Only you can see this</span><p>Your profile is private. Switch on sharing in <a href="${root}my-gigs.html#settings">Settings</a> so friends can follow you.</p></div></div>`;
    if (P.me && window.FRIENDS) h += FRIENDS.composer();
    h += common_html();
    if (!act) return h + '<p class="note">Loading…</p>';
    const next = P.gigs.filter(g => g.going)[0];
    if (next) h += `<div class="pnext"><a href="${esc(gp(next))}">${photo(next.s, next.a).replace('class="gph', 'class="pnimg')}</a><div class="pnt"><span class="ntag">${P.me ? 'Your next gig' : esc(first()) + '\'s next gig'}</span>
      <strong><a href="${esc(gp(next))}">${esc(next.a)}</a> · ${dparts(next.d).dt.toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short'})}</strong><small>${esc(next.v)}, ${esc(next.c)}</small></div>
      <div class="pnb"><button class="save" type="button" data-gig="${esc(JSON.stringify({id: next.id, d: next.d, tm: next.tm, a: next.a, s: next.s, v: next.v, c: next.c, u: next.u, vs: next.vs, p: next.p}))}" aria-pressed="false" aria-label="Save to My gigs">♡</button></div></div>`;
    h += act.length ? (window.FRIENDS ? FRIENDS.renderFeed(act, 60) : '') : `<p class="note">${P.me ? 'Nothing here yet. Write a post, or mark a gig as going.' : esc(first()) + " hasn't posted anything yet."}</p>`;
    return h;
  }
  function common_html() {
    if (P.me || !(window.ACC && ACC.user())) return '';
    const c = common(), bits = [];
    if (c.gigs.length) bits.push(`You're both into <b>${c.gigs.length} ${c.gigs.length === 1 ? 'gig' : 'gigs'}</b>: ${c.gigs.slice(0, 3).map(g => esc(g.a)).join(', ')}`);
    if (c.both.length) bits.push(`You both own <b>${c.both.length} ${c.both.length === 1 ? 'record' : 'records'}</b>`);
    if (c.theyHaveYouWant.length) bits.push(`${esc(first())} owns <b>${c.theyHaveYouWant.length}</b> from your wantlist`);
    if (c.youHaveTheyWant.length) bits.push(`You own <b>${c.youHaveTheyWant.length}</b> from ${esc(first())}'s wantlist`);
    return bits.length ? `<div class="incommon"><span class="ntag">In common</span><ul>${bits.map(b => `<li>${b}</li>`).join('')}</ul></div>` : '';
  }
  // ------------------------------------------------ seen live wall
  let openSeen = '';
  function wallImg(slug, name) {
    const a = arts[slug], p = a && a[1];
    if (p) return `<span class="swimg" style="background-image:url('${esc(String(p).replace('/1000x1000-', '/500x500-'))}')"></span>`;
    return window.LLPOSTER ? LLPOSTER.big(name, a && a[2] ? gslug(a[2]) : '').replace('class="gcpic', 'class="swimg') : photo(slug, name);
  }
  function seenTab() {
    if (!P.been.length) return `<p class="note">${P.me ? 'Gigs you go to show up here afterwards.' : esc(first()) + " hasn't been to any gigs on Live Louder yet."}</p>`;
    let h = '';
    if (openSeen) { const x = P.been.find(g => g.id === openSeen); if (x) h += `<div class="seenpanel" id="seenpanel"><div class="shead"><h3>${esc(x.a)}</h3><button type="button" class="linkish" data-seen="">Close</button></div>${beenCard(x)}</div>`; }
    const years = {};
    P.been.forEach(x => { (years[x.d.slice(0, 4)] = years[x.d.slice(0, 4)] || []).push(x); });
    Object.keys(years).sort().reverse().forEach(y => {
      const list = years[y];
      h += head(`${list.length} ${list.length === 1 ? 'gig' : 'gigs'} seen in ${y}`);
      h += `<div class="swall">${list.map(x => { const p = dparts(x.d), n = x.rating || 0;
        return `<button type="button" class="swt${openSeen === x.id ? ' on' : ''}" data-seen="${esc(x.id)}">${wallImg(x.s, x.a)}${(x.photos || []).length ? `<span class="swph">📷 ${x.photos.length}</span>` : ''}
          <strong>${esc(x.a)}</strong><small>${p.dt.toLocaleDateString('en-AU', {day: 'numeric', month: 'short'})} · ${esc(x.v)}</small>${n ? `<span class="swstars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>` : ''}</button>`; }).join('')}</div>`;
    });
    return h;
  }
  function gigsTab() {
    let h = '';
    if (P.me && !P.shared) h += `<div class="sharebox"><div><span class="ntag">Only you can see this</span><p>Your profile is private. Switch on sharing in <a href="${root}my-gigs.html#settings">Settings</a> so friends can follow you.</p></div></div>`;
    const up = P.gigs, going = up.filter(g => g.going), inter = up.filter(g => !g.going);
    h += head('Going', going.length ? `<span class="note">${going.length}</span>` : '') + (going.length ? `<div class="ggrid">${going.map(g => gigCard(g)).join('')}</div>` : `<p class="note">${esc(first())} hasn't marked any upcoming gigs as going yet.</p>`);
    if (inter.length) h += head('Interested', `<span class="note">${inter.length}</span>`) + `<div class="ggrid">${inter.map(g => gigCard(g)).join('')}</div>`;
    if (P.been.length) h += `<p class="note" style="margin-top:24px"><a href="#seen">See the ${P.been.length} ${P.been.length === 1 ? 'gig' : 'gigs'} ${P.me ? "you've" : esc(first()) + ' has'} been to →</a></p>`;
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
    $('uBody').innerHTML = tab === 'records' ? shelf('records') : tab === 'wantlist' ? shelf('wantlist') : tab === 'seen' ? seenTab() : tab === 'gigs' ? gigsTab() : activityTab();
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
    let [r, a] = await Promise.all([ACC.rpc('public_profile_v2', {uname}), fetch(root + 'data/artists.json').then(x => x.json()).catch(() => ({}))]);
    if (r.error) r = await ACC.rpc('public_profile', {uname});
    arts = a; window.LLARTS = a;
    if (r.error) return notFound('Couldn\'t load this profile', 'Something went wrong. Try again in a minute.');
    if (!r.data) return notFound('No one here by that name', 'Check the link, or search for your friend on the Friends tab of My gigs.');
    if (r.data.private) return notFound('This profile is private', 'This person hasn\'t shared their gigs and records.');
    P = r.data;
    document.title = `${P.name || P.username} on Live Louder`;
    setTab();
  }
  function setTab() { const t = (location.hash || '#activity').slice(1); tab = ['activity', 'gigs', 'seen', 'records', 'wantlist'].includes(t) ? t : 'activity'; q = ''; shown = 60; render(); }
  window.addEventListener('hashchange', () => { setTab(); const n = document.querySelector('.ptabs'); if (n) n.scrollIntoView({block: 'nearest'}); });
  window.MYPAGE = render;
  document.addEventListener('acc', render);

  box.addEventListener('click', async ev => {
    const sw = ev.target.closest('[data-seen]');
    if (sw) { openSeen = openSeen === sw.dataset.seen ? '' : sw.dataset.seen; render(); const pnl = document.getElementById('seenpanel'); if (pnl) pnl.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
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
