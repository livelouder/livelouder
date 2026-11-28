// Friends on Live Louder: "2 friends going" on gigs, and the friends feed on the homepage and My gigs.
// Only does anything for people who are signed in and follow someone. Data comes from the friends_going and
// friends_feed database functions (supabase/schema.sql), which only include people who share their profile.
(function () {
  const root = document.body.dataset.root || '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const gslug = x => String(x).toLowerCase().replace(/&/g, 'and').replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  const gp = g => g.p || `${root}gig/${gslug(g.id)}.html`;
  const purl = u => `${root}u/?u=${encodeURIComponent(u)}`;
  const first = p => String(p.name || p.username).split(' ')[0];
  const day = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const gdate = iso => day(iso).toLocaleDateString('en-AU', {weekday: 'short', day: 'numeric', month: 'short'});
  function ago(t) {
    const s = (Date.now() - new Date(t)) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm';
    if (s < 86400) return Math.round(s / 3600) + 'h';
    if (s < 86400 * 7) return Math.round(s / 86400) + 'd';
    return new Date(t).toLocaleDateString('en-AU', {day: 'numeric', month: 'short'});
  }
  function face(p, cls) {
    return p.avatar ? `<span class="${cls}"><img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`
      : `<span class="${cls}" style="--h:${hue(p.username || '?')}"><b>${esc((p.name || p.username || '?')[0].toUpperCase())}</b></span>`;
  }
  const signedIn = () => window.ACC && ACC.user();

  // ------------------------------------------------ "2 friends going"
  let going = null;
  function goingLine(list) {
    const names = list.length === 1 ? `${esc(first(list[0]))} is going` : list.length === 2 ? `${esc(first(list[0]))} and ${esc(first(list[1]))} are going` : `${esc(first(list[0]))} and ${list.length - 1} friends are going`;
    return `<span class="fgo" title="${esc(list.map(p => p.name || p.username).join(', '))}">${list.slice(0, 3).map(p => face(p, 'fav xs')).join('')}<span>${names}</span></span>`;
  }
  function annotate() {
    if (!going) return;
    document.querySelectorAll('.save[data-gig]:not([data-fg])').forEach(b => {
      b.dataset.fg = '1';
      let id; try { id = JSON.parse(b.dataset.gig).id; } catch (e) { return; }
      const list = going[id];
      if (!list || !list.length) return;
      const spot = b.closest('.gig') ? b.closest('.gig').querySelector('.gi') : b.closest('.gcard') ? b.closest('.gcard').querySelector('.gbody')
        : b.closest('.gp-acts') ? b.closest('.gp-acts') : b.closest('li') ? b.closest('li').querySelector('.fgtext') : null;
      if (!spot || spot.querySelector('.fgo')) return;
      if (spot.classList.contains('gp-acts')) spot.insertAdjacentHTML('afterend', `<p class="gp-friends">${goingLine(list)}</p>`);
      else spot.insertAdjacentHTML('beforeend', goingLine(list));
    });
  }
  async function loadGoing() {
    const u = signedIn();
    if (!u) return;
    try {
      const c = JSON.parse(sessionStorage.getItem('llFG') || 'null');
      if (c && c.u === u.id && Date.now() - c.t < 10 * 60 * 1000) { going = c.d; annotate(); return; }
    } catch (e) {}
    const r = await ACC.rpc('friends_going');
    going = r.data || {};
    try { sessionStorage.setItem('llFG', JSON.stringify({u: u.id, t: Date.now(), d: going})); } catch (e) {}
    annotate();
  }
  let mo;
  function watch() {
    if (mo) return;
    let t;
    mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(annotate, 150); });
    mo.observe(document.body, {childList: true, subtree: true});
  }

  // ------------------------------------------------ the feed
  const stars = n => `<span class="stars" aria-label="${n} out of 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
  const gigLink = g => g ? `<a href="${esc(gp(g))}">${esc(g.a)}</a>` : 'a gig';
  const saveBtn = g => g && g.d >= new Date().toISOString().slice(0, 10)
    ? `<button class="save" type="button" data-gig="${esc(JSON.stringify({id: g.id, d: g.d, tm: g.tm, a: g.a, s: g.s, v: g.v, c: g.c, u: g.u, vs: g.vs, p: g.p}))}" aria-pressed="false" aria-label="Save to My gigs">♡</button>` : '';
  // Group bursts: records someone added on the same day become one item, and so do photos from one gig.
  function group(items) {
    const out = [], idx = {};
    for (const it of items) {
      if (it.t === 'record' || it.t === 'photo') {
        const k = it.t + '|' + it.who.username + '|' + (it.t === 'record' ? String(it.at).slice(0, 10) : (it.gig && it.gig.id));
        if (idx[k] !== undefined) { out[idx[k]].more.push(it); continue; }
        idx[k] = out.length; out.push(Object.assign({more: [it]}, it));
      } else out.push(it);
    }
    return out;
  }
  // Artist photos, when the page has them (My gigs and profiles load data/artists.json into window.LLARTS).
  const artPic = s => { const a = window.LLARTS && window.LLARTS[s]; return a && a[1] ? String(a[1]).replace('/1000x1000-', '/250x250-') : ''; };
  function gigCard(g) {
    if (!g) return '';
    const pic = artPic(g.s);
    const face = pic ? `<span class="fgimg" style="background-image:url('${esc(pic)}')"></span>` : (window.LLPOSTER ? LLPOSTER.small(g.a, '', esc(gp(g))).replace(/^<a /, '<span ').replace(/<\/a>$/, '</span>').replace('class="gth', 'class="fgimg gth') : '');
    return `<a class="fgcard" href="${esc(gp(g))}">${face}<span><strong>${esc(g.a)}</strong><small>${esc(gdate(g.d))} · ${esc(g.v)}${g.c ? ', ' + esc(g.c) : ''}</small></span></a>`;
  }
  const linkify = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener nofollow ugc" target="_blank">$1</a>').replace(/\n/g, '<br>');
  function postBody(p) {
    const rec = p.record;
    const tag = rec ? `<span class="fgcard frec">${rec.img ? `<span class="fgimg" style="background-image:url('${esc(rec.img)}')"></span>` : ''}<span><strong>${esc(rec.t)}</strong><small>${esc(rec.a)}${[rec.col, rec.c, rec.y].filter(Boolean).length ? ' · ' + esc([rec.col, rec.c, rec.y].filter(Boolean).join(' · ')) : ''}</small></span><span class="fspin" aria-hidden="true"></span></span>`
      : p.gig ? gigCard(p.gig) : p.artist ? `<a class="fgcard" href="${root}artists/${esc(p.artist.slug)}.html">${artPic(p.artist.slug) ? `<span class="fgimg round" style="background-image:url('${esc(artPic(p.artist.slug))}')"></span>` : ''}<span><strong>${esc(p.artist.name)}</strong><small>Artist</small></span></a>` : '';
    const me = signedIn();
    return `${p.body ? `<p class="pbody">${linkify(p.body)}</p>` : ''}${tag}${p.hidden ? '<p class="note phid">Hidden while we check a report. Only you can see it.</p>' : ''}
      <div class="pacts" data-post="${p.id}"><button type="button" class="pact${p.liked ? ' on' : ''}" data-like aria-pressed="${!!p.liked}" aria-label="Like">${p.liked ? '♥' : '♡'} <span>${p.likes || ''}</span></button>
      <button type="button" class="pact" data-replies aria-expanded="false">💬 <span>${p.replies ? p.replies + ' ' + (p.replies === 1 ? 'reply' : 'replies') : 'Reply'}</span></button>
      ${me ? `<span class="pmore"><button type="button" class="pact" data-pmenu aria-label="More">⋯</button><span class="pmenu" hidden>${p.mine ? '<button type="button" data-delpost>Delete post</button>' : '<button type="button" data-report="post">Report post</button>'}</span></span>` : ''}</div>
      <div class="preplies" hidden></div>`;
  }
  function item(it) {
    const w = it.who, who = `<a class="fwho" href="${purl(w.username)}">${esc(w.name || w.username)}</a>`;
    let text = '', extra = '', act = '';
    if (it.t === 'post') {
      const p = it.post || {};
      return `<li class="fi fpost" data-pid="${p.id}"><a href="${purl(w.username)}" aria-hidden="true" tabindex="-1">${face(w, 'fav sm')}</a><div class="ft"><p>${who}${p.record ? ' is spinning' : ''} <span class="fwhen">${esc(ago(it.at))}</span></p>${postBody(p)}</div></li>`;
    }
    if (it.t === 'going') {
      const g = it.gig;
      text = `${who} is going to ${gigLink(g)}`;
      extra = g ? gigCard(g) : '';
      act = saveBtn(g);
    } else if (it.t === 'review') {
      text = `${who} rated ${gigLink(it.gig)} ${stars(it.rating)}`;
      extra = (it.gig ? `<span class="fmeta">${esc(it.gig.v)}, ${esc(day(it.gig.d).toLocaleDateString('en-AU', {day: 'numeric', month: 'short', year: 'numeric'}))}</span>` : '') + (it.review ? `<q class="frev">${esc(it.review)}</q>` : '');
    } else if (it.t === 'record') {
      const n = it.more.length;
      text = n === 1 ? `${who} added <b>${esc(it.rec.t)}</b> by ${esc(it.rec.a)} to their collection` : `${who} added ${n} records to their collection`;
      extra = `<span class="fcovers">${it.more.slice(0, 6).map(x => x.rec.img ? `<img src="${esc(x.rec.img)}" alt="${esc(x.rec.a + ' – ' + x.rec.t)}" title="${esc(x.rec.a + ' – ' + x.rec.t)}" loading="lazy">` : `<span class="rblank" style="--h:${hue(x.rec.t)}">${esc(String(x.rec.t).slice(0, 2).toUpperCase())}</span>`).join('')}${n > 6 ? `<a class="fmore" href="${purl(w.username)}#records">+${n - 6}</a>` : ''}</span>`;
    } else if (it.t === 'photo') {
      const n = it.more.length;
      text = `${who} added ${n === 1 ? 'a photo' : n + ' photos'} from ${gigLink(it.gig)}`;
      extra = `<span class="fphotos">${it.more.slice(0, 4).map(x => `<a href="${purl(w.username)}#gigs"><img src="${esc(x.photo)}" alt="" loading="lazy"></a>`).join('')}</span>`;
    }
    return `<li class="fi"><a href="${purl(w.username)}" aria-hidden="true" tabindex="-1">${face(w, 'fav sm')}</a><div class="ft"><p>${text} <span class="fwhen">${esc(ago(it.at))}</span></p>${extra}</div>${act}</li>`;
  }
  function renderFeed(items, limit) {
    const g = group(items || []);
    if (!g.length) return '';
    return `<ul class="ffeed">${g.slice(0, limit || 50).map(item).join('')}</ul>`;
  }
  let feedP = null;
  const loadFeed = () => feedP || (feedP = ACC.rpc('friends_feed').then(r => r.data || []));

  // ------------------------------------------------ posts: write one, like, reply, delete, report
  function composer() {
    const u = signedIn();
    if (!u) return '';
    const st = window.MY ? MY.get() : {gigs: {}, artists: {}}, today = new Date().toISOString().slice(0, 10);
    const gigs = Object.values(st.gigs || {}).filter(g => g.d >= today).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 30);
    const arts = Object.entries(st.artists || {}).sort((a, b) => String(a[1]).localeCompare(String(b[1]))).slice(0, 200);
    const p = ACC.profile() || {}, md = u.user_metadata || {};
    const meFace = {avatar: p.avatar_url || md.avatar_url, username: p.username || u.email, name: p.display_name || md.full_name || p.username};
    const opts = (gigs.length ? `<optgroup label="Your gigs">${gigs.map(g => `<option value="g:${esc(g.id)}">${esc(g.a)} · ${esc(gdate(g.d))}</option>`).join('')}</optgroup>` : '')
      + (arts.length ? `<optgroup label="Artists you follow">${arts.map(([sl, n]) => `<option value="a:${esc(sl)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
    const priv = !(p.share && p.username);
    return `<form class="pcomp" data-postform>${face(meFace, 'fav sm')}<div class="pcin"><textarea name="body" maxlength="500" rows="2" placeholder="What's on your mind? A gig you're hyped for, a record you just got…" aria-label="Write a post"></textarea>
      <div class="pcrow">${opts ? `<select name="tag" aria-label="Tag a gig or artist"><option value="">🎟 Tag a gig or artist</option>${opts}</select>` : ''}<span class="pccount">0/500</span><button class="btn sm">Post</button></div>
      <p class="note pcmsg">${priv ? `Your profile is private, so only you will see your posts. <a href="${root}my-gigs.html#settings">Share your profile</a> so friends can see them.` : 'Friends who follow you will see this in their feed.'}</p></div></form>`;
  }
  const postEl = el => el.closest('[data-post]');
  const pidOf = el => +postEl(el).dataset.post;
  function setCounts(box, p) {
    if (!p) return;
    const lb = box.querySelector('[data-like]');
    lb.classList.toggle('on', !!p.liked); lb.setAttribute('aria-pressed', !!p.liked); lb.innerHTML = `${p.liked ? '♥' : '♡'} <span>${p.likes || ''}</span>`;
  }
  function replyHtml(r) {
    return `<li data-rid="${r.id}">${face(r.who || {}, 'fav xs')}<div><p><a class="fwho" href="${purl((r.who || {}).username)}">${esc((r.who || {}).name || (r.who || {}).username)}</a> ${linkify(r.body)} <span class="fwhen">${esc(ago(r.at))}</span></p>
      ${r.hidden ? '<p class="note phid">Hidden while we check a report.</p>' : ''}${signedIn() ? `<span class="ract">${r.can_delete ? '<button type="button" data-delreply>Delete</button>' : ''}${!r.mine ? '<button type="button" data-report="reply">Report</button>' : ''}</span>` : ''}</div></li>`;
  }
  async function openReplies(acts) {
    const box = acts.nextElementSibling, pid = +acts.dataset.post;
    const b = acts.querySelector('[data-replies]');
    if (!box.hidden) { box.hidden = true; b.setAttribute('aria-expanded', 'false'); return; }
    box.hidden = false; b.setAttribute('aria-expanded', 'true');
    box.innerHTML = '<p class="note">Loading…</p>';
    const r = await ACC.rpc('post_replies_list', {pid});
    const list = r.data || [];
    box.innerHTML = `<ul class="rlist">${list.map(replyHtml).join('')}</ul>` + (signedIn()
      ? `<form class="rform" data-replyform><input name="body" maxlength="280" placeholder="Write a reply…" aria-label="Write a reply" autocomplete="off"><button class="btn sm">Reply</button></form>`
      : `<p class="note"><a href="${root}my-gigs.html">Sign in</a> to reply.</p>`);
  }
  const REASONS = [['spam', 'Spam or scam'], ['nasty', 'Nasty or bullying'], ['hate', 'Hateful or offensive'], ['sexual', 'Sexual or creepy'], ['other', 'Something else']];
  document.addEventListener('click', async ev => {
    const t = ev.target;
    if (!t.closest) return;
    if (!t.closest('.pmore')) document.querySelectorAll('.pmenu').forEach(m => { m.hidden = true; });
    const lk = t.closest('[data-like]');
    if (lk) {
      if (!signedIn()) { ACC.open(); return; }
      const acts = postEl(lk), on = !lk.classList.contains('on'), n = +(lk.querySelector('span').textContent || 0) + (on ? 1 : -1);
      setCounts(acts, {liked: on, likes: Math.max(0, n)});
      const r = await ACC.rpc('like_post', {pid: +acts.dataset.post, on_: on});
      if (r.data) setCounts(acts, r.data);
      return;
    }
    const rp = t.closest('[data-replies]');
    if (rp) { openReplies(postEl(rp)); return; }
    const pm = t.closest('[data-pmenu]');
    if (pm) { const m = pm.nextElementSibling; m.hidden = !m.hidden; return; }
    const dp = t.closest('[data-delpost]');
    if (dp) {
      if (!confirm('Delete this post? It can\'t be undone.')) return;
      const id = pidOf(dp);
      await ACC.rpc('delete_post', {pid: id});
      document.querySelectorAll(`[data-pid="${id}"]`).forEach(li => li.remove());
      return;
    }
    const dr = t.closest('[data-delreply]');
    if (dr) {
      if (!confirm('Delete this reply?')) return;
      const li = dr.closest('[data-rid]');
      await ACC.rpc('delete_reply', {rid: +li.dataset.rid}); li.remove();
      return;
    }
    const rep = t.closest('[data-report]');
    if (rep) {
      const kind = rep.dataset.report, holder = kind === 'reply' ? rep.closest('[data-rid]') : postEl(rep);
      const id = kind === 'reply' ? +holder.dataset.rid : +holder.dataset.post;
      const spot = kind === 'reply' ? holder.querySelector('div') : holder;
      if (spot.querySelector('.rpform')) return;
      spot.insertAdjacentHTML('beforeend', `<form class="rpform" data-reportform data-kind="${kind}" data-id="${id}"><b>Why are you reporting this?</b>${REASONS.map(([k, l], i) => `<label><input type="radio" name="reason" value="${k}"${i ? '' : ' checked'}> ${l}</label>`).join('')}<span><button class="btn sm">Report</button> <button type="button" class="linkish small" data-cancelreport>Cancel</button></span></form>`);
      return;
    }
    const cr = t.closest('[data-cancelreport]');
    if (cr) { cr.closest('form').remove(); return; }
  });
  document.addEventListener('input', ev => {
    const ta = ev.target.closest && ev.target.closest('[data-postform] textarea');
    if (ta) { const c = ta.form.querySelector('.pccount'); if (c) c.textContent = `${ta.value.length}/500`; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 260) + 'px'; }
  });
  document.addEventListener('submit', async ev => {
    const f = ev.target;
    if (f.matches('[data-postform]')) {
      ev.preventDefault();
      const body = f.body.value.trim(), msg = f.querySelector('.pcmsg'), btn = f.querySelector('button');
      if (!body) { f.body.focus(); return; }
      let gig = null, artist = null;
      const tag = f.tag ? f.tag.value : '', st = window.MY ? MY.get() : {gigs: {}, artists: {}};
      if (tag.startsWith('g:')) { const g = st.gigs[tag.slice(2)]; if (g) gig = {id: g.id, d: g.d, tm: g.tm, a: g.a, s: g.s, v: g.v, c: g.c, u: g.u, p: g.p}; }
      if (tag.startsWith('a:')) artist = {slug: tag.slice(2), name: st.artists[tag.slice(2)] || tag.slice(2)};
      btn.disabled = true; btn.textContent = 'Posting…';
      const r = await ACC.rpc('create_post', {body, gig, artist});
      btn.disabled = false; btn.textContent = 'Post';
      if (r.error) { msg.textContent = r.error.replace(/^.*?: /, ''); msg.classList.add('err'); return; }
      f.reset(); f.querySelector('.pccount').textContent = '0/500'; msg.classList.remove('err');
      feedP = null;
      document.dispatchEvent(new CustomEvent('llpost', {detail: r.data}));
      return;
    }
    if (f.matches('[data-replyform]')) {
      ev.preventDefault();
      const body = f.body.value.trim(); if (!body) return;
      const acts = f.parentNode.previousElementSibling, pid = +acts.dataset.post;
      f.querySelector('button').disabled = true;
      const r = await ACC.rpc('reply_post', {pid, body});
      f.querySelector('button').disabled = false;
      if (r.error) { alert(r.error.replace(/^.*?: /, '')); return; }
      f.body.value = '';
      f.parentNode.querySelector('.rlist').insertAdjacentHTML('beforeend', replyHtml(r.data));
      const sp = acts.querySelector('[data-replies] span'), n = f.parentNode.querySelectorAll('.rlist li').length;
      sp.textContent = `${n} ${n === 1 ? 'reply' : 'replies'}`;
      return;
    }
    if (f.matches('[data-reportform]')) {
      ev.preventDefault();
      const r = await ACC.reportPost(f.dataset.kind, +f.dataset.id, (f.querySelector('input[name=reason]:checked') || {}).value || 'other');
      f.outerHTML = `<p class="note rpdone">${r.error ? esc(r.error) : 'Thanks for letting us know. It\'s hidden for now while we take a look.'}</p>`;
    }
  });

  // Homepage: "From your friends", only for signed-in people who follow someone.
  async function homeFeed() {
    const box = document.getElementById('ffeed');
    if (!box) return;
    if (!signedIn()) { box.hidden = true; return; }
    const items = await loadFeed();
    if (items.length) {
      box.innerHTML = `<div class="wrap"><div class="shead"><h2>From your friends</h2><a href="${root}my-gigs.html#friends">See all →</a></div>${renderFeed(items, 6)}</div>`;
      box.hidden = false;
      if (window.MY) MY.paint();
      annotate();
      return;
    }
    // Nothing from friends yet: one small nudge, not a whole section.
    const st = window.MY ? MY.get() : {artists: {}};
    const fewArtists = Object.keys(st.artists || {}).length < 3;
    box.innerHTML = `<div class="wrap"><div class="fnudge"><div><b>${fewArtists ? 'Make Live Louder yours' : 'Bring your friends'}</b>
      <span>${fewArtists ? 'Follow the artists you love in one click, and see when they tour.' : 'Follow your mates to see the gigs they\'re going to and the records they\'re buying.'}</span></div>
      <a class="btn" href="${root}my-gigs.html#${fewArtists ? 'start' : 'friends'}">${fewArtists ? 'Get started' : 'Find friends'}</a></div></div>`;
    box.hidden = false;
  }

  // ------------------------------------------------ unread messages (the number on the header's Messages button)
  async function loadUnread(force) {
    if (!signedIn() || document.getElementById('msgs')) return;
    const show = n => document.querySelectorAll('.msgcount').forEach(b => { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; });
    try {
      const c = JSON.parse(sessionStorage.getItem('llMsgN') || 'null');
      if (!force && c && Date.now() - c.t < 60 * 1000) { show(c.n); return; }
    } catch (e) {}
    const r = await ACC.rpc('unread_messages');
    if (r.error) return;
    show(r.data || 0);
    try { sessionStorage.setItem('llMsgN', JSON.stringify({t: Date.now(), n: r.data || 0})); } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadUnread(); });

  function start() {
    let was = null; try { was = localStorage.getItem('llSignedIn'); } catch (e) {}
    if (!window.ACC || !was) { const b = document.getElementById('ffeed'); if (b) b.hidden = true; return; }
    ACC.session().then(u => { if (!u) { const b = document.getElementById('ffeed'); if (b) b.hidden = true; return; } loadGoing(); watch(); homeFeed(); loadUnread(); });
  }
  window.FRIENDS = {renderFeed, loadFeed: () => { feedP = null; return loadFeed(); }, annotate, face, composer, item};
  document.addEventListener('acc', () => { if (signedIn() && !going) { loadGoing(); watch(); homeFeed(); loadUnread(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
