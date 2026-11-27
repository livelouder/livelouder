// Live Louder messages (messages.html): private messages between friends who follow each other.
// Inbox on the left (or full screen on phones), the conversation on the right. New messages arrive live
// through Supabase Realtime, with a slow check every so often as a backup. All the rules (who can message
// whom, blocks, limits) live in the database functions in supabase/schema.sql, "Messages" section.
document.addEventListener('DOMContentLoaded', function () {
  const box = document.getElementById('msgs');
  if (!box) return;
  const root = document.body.dataset.root || '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const $ = id => document.getElementById(id);
  const purl = u => `${root}u/?u=${encodeURIComponent(u)}`;
  const first = p => String((p && (p.name || p.username)) || '').split(' ')[0];
  const list = $('mList'), pane = $('mThread');
  let convs = null, cur = null, T = null, sending = false, live = false, draft = {}, broken = false, newOpen = false, people = null, peopleQ = '';

  function face(p, cls) {
    return p.avatar ? `<span class="${cls}"><img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`
      : `<span class="${cls}" style="--h:${hue(p.username || '?')}"><b>${esc((p.name || p.username || '?')[0].toUpperCase())}</b></span>`;
  }
  function ago(t) {
    const d = new Date(t), s = (Date.now() - d) / 1000;
    if (s < 60) return 'now';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < 86400) return Math.round(s / 3600) + 'h';
    if (s < 86400 * 7) return d.toLocaleDateString('en-AU', {weekday: 'short'});
    return d.toLocaleDateString('en-AU', {day: 'numeric', month: 'short'});
  }
  const clock = t => new Date(t).toLocaleTimeString('en-AU', {hour: 'numeric', minute: '2-digit'});
  function dayLabel(t) {
    const d = new Date(t), today = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-AU', {weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric'});
  }
  const ERR = {
    not_friends: p => `You can message ${esc(first(p))} once you both follow each other.`,
    blocked_by_you: p => `You've blocked ${esc(first(p))}. Unblock them to send a message.`,
    blocked: () => "You can't message this person.",
    banned: () => 'Your messages have been switched off for breaking the rules. If you think that\'s a mistake, email <a href="mailto:hello@livelouder.com.au">hello@livelouder.com.au</a>.',
    slow_down: () => "You've sent a lot of messages in the last hour. Take a breather and try again soon.",
    new_account: () => 'New accounts can send 20 messages on their first day. You can send more tomorrow.',
    wait_reply: p => `You've sent 5 messages. Wait for ${esc(first(p))} to reply before sending more.`,
    too_long: () => 'That message is too long. Keep it under 1,000 characters.',
    empty: () => 'Type a message first.',
    not_found: () => "We couldn't find that person.",
  };
  function badge(n) {
    document.querySelectorAll('.msgcount').forEach(b => { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; });
    try { sessionStorage.setItem('llMsgN', JSON.stringify({t: Date.now(), n})); } catch (e) {}
  }

  // ------------------------------------------------ inbox
  async function loadConvs() {
    const r = await ACC.rpc('my_conversations');
    if (r.error) { broken = true; renderList(); return; }
    convs = r.data || [];
    badge(convs.reduce((n, c) => n + (c.unread || 0), 0));
    renderList();
  }
  function renderList() {
    if (broken) { list.innerHTML = '<p class="note">Messages aren\'t switched on yet. Check back soon.</p>'; return; }
    let h = `<div class="mlhead"><h1>Messages</h1><button type="button" class="btn sm" data-new>✎ New</button></div>`;
    if (!convs) h += '<p class="note">Loading…</p>';
    else if (!convs.length) h += `<div class="mlempty"><p><b>No messages yet.</b></p><p class="note">You can message friends who follow you back. Tap <b>New</b> to start, or find friends on the <a href="${root}my-gigs.html#friends">Friends</a> tab.</p></div>`;
    else h += '<ul class="mconvs">' + convs.map(c => `<li><a href="?u=${encodeURIComponent(c.username)}" data-open="${esc(c.username)}" class="${c.unread ? 'unread' : ''}" aria-current="${cur === c.username ? 'true' : 'false'}">
      ${face(c, 'fav sm')}<span class="mct"><span class="mcn"><b>${esc(c.name || c.username)}</b><time>${esc(ago(c.at))}</time></span>
      <span class="mcl">${c.mine ? 'You: ' : ''}${esc(String(c.last).slice(0, 90))}</span></span>${c.unread ? `<span class="mcu" aria-label="${c.unread} unread">${c.unread}</span>` : ''}</a></li>`).join('') + '</ul>';
    h += '<p class="note msafe">Messages are private between you and your friend. Be kind, and report anything nasty.</p>';
    list.innerHTML = h;
  }

  // ------------------------------------------------ one conversation
  async function open(uname, push) {
    if (!uname) return;
    if (cur && cur !== uname && T) { const ta = pane.querySelector('textarea'); if (ta) draft[cur] = ta.value; }
    cur = uname.toLowerCase();
    if (push) history.pushState({u: cur}, '', '?u=' + encodeURIComponent(cur));
    box.classList.add('mopen');
    if (!T || T.username !== cur) { T = null; pane.innerHTML = '<p class="note mload">Loading…</p>'; }
    renderList();
    await loadThread(true);
  }
  async function loadThread(scroll) {
    if (!cur) return;
    const want = cur;
    const r = await ACC.rpc('conversation', {uname: want});
    if (want !== cur) return;
    if (r.error || !r.data) { pane.innerHTML = `<div class="mnone"><p><b>Couldn't open this conversation.</b></p><p class="note">${r.error ? 'Check your connection and try again.' : "We couldn't find that person."}</p></div>`; return; }
    const keep = T && T.username === r.data.username ? T.messages.filter(m => m.id < (r.data.messages[0] || {id: Infinity}).id) : [];
    const wasNear = nearBottom();
    T = r.data; T.messages = keep.concat(T.messages); T.username = T.username.toLowerCase();
    renderThread(scroll || wasNear);
    // Opening it marked their messages as read, so update the inbox.
    if (convs) { const c = convs.find(x => x.username.toLowerCase() === cur); if (c && c.unread) { c.unread = 0; badge(convs.reduce((n, x) => n + (x.unread || 0), 0)); renderList(); } }
  }
  function nearBottom() { const s = pane.querySelector('.mscroll'); return !s || s.scrollHeight - s.scrollTop - s.clientHeight < 120; }
  function bubbles() {
    let h = '', lastDay = '', lastMine = null, lastAt = 0;
    const lastMineId = (T.messages.filter(m => m.mine).slice(-1)[0] || {}).id;
    for (const m of T.messages) {
      const day = new Date(m.at).toDateString();
      if (day !== lastDay) { h += `<div class="mday"><span>${esc(dayLabel(m.at))}</span></div>`; lastDay = day; lastMine = null; }
      const gap = Date.parse(m.at) - lastAt > 15 * 60 * 1000;
      h += `<div class="mb ${m.mine ? 'me' : 'them'}${lastMine === m.mine && !gap ? ' cont' : ''}" data-mid="${m.id}"><p>${esc(m.body)}</p>`
        + `<time datetime="${esc(m.at)}">${esc(clock(m.at))}${m.mine && m.id === lastMineId && m.read ? ' · Seen' : ''}</time></div>`;
      lastMine = m.mine; lastAt = Date.parse(m.at);
    }
    return h;
  }
  function renderThread(scroll) {
    if (!T) return;
    const t = pane.querySelector('textarea'), val = t ? t.value : (draft[cur] || '');
    const ok = T.can === 'ok';
    let banner = '';
    if (!ok) {
      const act = T.can === 'not_friends' && !T.i_follow && T.shared ? `<button type="button" class="followbtn" data-mfollow>${T.follows_me ? 'Follow back' : 'Follow'}</button>`
        : T.can === 'blocked_by_you' ? '<button type="button" class="followbtn" data-unblock>Unblock</button>' : '';
      banner = `<div class="mban"><p>${(ERR[T.can] || ERR.blocked)(T)}</p>${act}</div>`;
    }
    pane.innerHTML = `<header class="mth"><button type="button" class="mback" data-back aria-label="Back to messages">‹</button>
      <a class="mwho" href="${purl(T.username)}">${face(T, 'fav sm')}<span><b>${esc(T.name || T.username)}</b><span class="handle">@${esc(T.username)}</span></span></a>
      <button type="button" class="mmenu" data-menu aria-label="More options" aria-expanded="false">⋯</button>
      <div class="mpop" hidden><button type="button" data-report>⚑ Report a message</button><button type="button" data-block>${T.can === 'blocked_by_you' ? 'Unblock' : 'Block'} ${esc(first(T))}</button><button type="button" data-del>Delete conversation</button></div></header>
      <div class="mscroll" aria-live="polite">${T.more ? '<button type="button" class="linkish mmore" data-older>Show earlier messages</button>' : ''}
      ${T.messages.length ? bubbles() : `<div class="mhello">${face(T, 'fav')}<p><b>Say g'day to ${esc(first(T))}</b></p><p class="note">Plan a gig, swap record tips. Messages are private between you two.</p></div>`}</div>
      ${banner}
      <form class="mform" data-send${ok ? '' : ' hidden'}><textarea name="body" rows="1" maxlength="1000" placeholder="Message ${esc(first(T))}…" aria-label="Message">${esc(val)}</textarea>
      <button class="msend" ${sending ? 'disabled' : ''} aria-label="Send">Send</button></form><p class="note merr" id="mErr" hidden></p>`;
    const ta = pane.querySelector('textarea');
    if (ta) { grow(ta); }
    const s = pane.querySelector('.mscroll');
    if (scroll && s) s.scrollTop = s.scrollHeight;
  }
  function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; }
  function showErr(html) { const e = $('mErr'); if (!e) return; e.innerHTML = html; e.hidden = !html; }

  async function send(form) {
    const ta = form.querySelector('textarea'), body = ta.value.trim();
    if (!body || sending || !T) return;
    sending = true; form.querySelector('.msend').disabled = true; showErr('');
    const r = await ACC.rpc('send_message', {uname: T.username, body});
    sending = false;
    const b = form.querySelector('.msend'); if (b) b.disabled = false;
    if (r.error) { showErr("Couldn't send that. Check your connection and try again."); return; }
    if (r.data && r.data.error) {
      showErr((ERR[r.data.error] || (() => "Couldn't send that. Try again."))(T));
      if (['not_friends', 'blocked', 'blocked_by_you', 'banned'].includes(r.data.error)) { T.can = r.data.error; renderThread(); }
      return;
    }
    ta.value = ''; draft[cur] = '';
    T.messages.push(Object.assign({read: false}, r.data));
    renderThread(true);
    pane.querySelector('textarea').focus();
    upsertConv(r.data);
  }
  function upsertConv(m) {
    if (!convs) return;
    let c = convs.find(x => x.username.toLowerCase() === cur);
    if (!c) { c = {username: T.username, name: T.name, avatar: T.avatar, unread: 0, can: 'ok'}; }
    else convs.splice(convs.indexOf(c), 1);
    Object.assign(c, {last: m.body, at: m.at, mine: true});
    convs.unshift(c);
    renderList();
  }
  async function older() {
    if (!T || !T.messages.length) return;
    const s = pane.querySelector('.mscroll'), h0 = s.scrollHeight;
    const r = await ACC.rpc('conversation', {uname: T.username, before_id: T.messages[0].id});
    if (r.error || !r.data) return;
    T.messages = r.data.messages.concat(T.messages); T.more = r.data.more;
    renderThread();
    const s2 = pane.querySelector('.mscroll'); s2.scrollTop = s2.scrollHeight - h0;
  }
  function close(push) {
    if (cur && T) { const ta = pane.querySelector('textarea'); if (ta) draft[cur] = ta.value; }
    cur = null; T = null; box.classList.remove('mopen');
    if (push) history.pushState({}, '', location.pathname);
    pane.innerHTML = '<div class="mnone"><p><b>Your messages</b></p><p class="note">Pick a conversation, or start a new one with a friend.</p></div>';
    renderList();
  }

  // ------------------------------------------------ new message: pick a friend (people who follow each other)
  async function openNew() {
    let d = $('mNew');
    if (!d) { d = document.createElement('dialog'); d.id = 'mNew'; d.className = 'reportdlg mnew'; document.body.appendChild(d); }
    peopleQ = '';
    d.innerHTML = `<form method="dialog" class="sclose"><button aria-label="Close">×</button></form><h2>New message</h2>
      <p>You can message friends who follow you back.</p><input type="search" data-pq placeholder="Search your friends" aria-label="Search your friends"><div id="mPeople"><p class="note">Loading…</p></div>`;
    d.showModal();
    if (!people) { const r = await ACC.rpc('my_people'); people = r.data || {following: [], followers: []}; }
    paintPeople();
  }
  function mutual() {
    const back = new Set((people.followers || []).map(p => p.username));
    return (people.following || []).filter(p => p.username && back.has(p.username));
  }
  function paintPeople() {
    const el = $('mPeople'); if (!el || !people) return;
    const all = mutual(), q = peopleQ.toLowerCase();
    const shown = q ? all.filter(p => (p.username + ' ' + (p.name || '')).toLowerCase().includes(q)) : all;
    const oneWay = (people.following || []).length - all.length;
    if (!all.length) { el.innerHTML = `<p class="note">None of your friends follow you back yet.${oneWay ? ` You follow ${oneWay} ${oneWay === 1 ? 'person' : 'people'}: once they follow you back, you can message them.` : ''} Share your profile link from the <a href="${root}my-gigs.html#friends">Friends</a> tab.</p>`; return; }
    el.innerHTML = shown.length ? '<ul class="mpick">' + shown.map(p => `<li><button type="button" data-pick="${esc(p.username)}">${face(p, 'fav sm')}<span><b>${esc(p.name || p.username)}</b><span class="handle">@${esc(p.username)}</span></span></button></li>`).join('') + '</ul>'
      : '<p class="note">No friends match that.</p>';
  }

  // ------------------------------------------------ report a message
  function openReport() {
    const theirs = T.messages.filter(m => !m.mine).slice(-12).reverse();
    let d = $('mRep');
    if (!d) { d = document.createElement('dialog'); d.id = 'mRep'; d.className = 'reportdlg'; document.body.appendChild(d); }
    if (!theirs.length) { d.innerHTML = `<form method="dialog" class="sclose"><button aria-label="Close">×</button></form><h2>Report a message</h2><p>${esc(first(T))} hasn't sent you any messages to report. You can still block them from the menu.</p>`; d.showModal(); return; }
    d.innerHTML = `<form method="dialog" class="sclose"><button aria-label="Close">×</button></form>
      <h2>Report a message</h2><p>Thanks for helping keep Live Louder friendly. We'll take a look. ${esc(first(T))} won't know who reported it.</p>
      <form id="mRepForm"><fieldset><legend>Which message?</legend><div class="mreplist">${theirs.map((m, i) => `<label class="tog"><input type="radio" name="id" value="${m.id}" ${i ? '' : 'checked'}> <span>${esc(m.body.slice(0, 140))}${m.body.length > 140 ? '…' : ''}</span></label>`).join('')}</div></fieldset>
        <label>What's wrong with it?<select name="reason"><option value="spam">Spam or scam</option><option value="nasty">Nasty, threatening or bullying</option>
          <option value="sexual">Sexual or creepy</option><option value="hate">Hateful or offensive</option><option value="other">Something else</option></select></label>
        <label class="tog"><input type="checkbox" name="block" checked> Also block ${esc(first(T))}</label>
        <button class="btn">Send report</button><p class="note" id="mRepMsg"></p>
        <p class="note">If you feel unsafe, contact the police. You can also report online abuse to the <a href="https://www.esafety.gov.au/report" rel="noopener" target="_blank">eSafety Commissioner</a>.</p></form>`;
    d.querySelector('#mRepForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, b = f.querySelector('button.btn'), msg = d.querySelector('#mRepMsg');
      b.disabled = true; msg.textContent = 'Sending…';
      const r = await ACC.reportMessage(Number(f.id.value), f.reason.value, f.block.checked);
      if (r.error) { msg.textContent = r.error; b.disabled = false; return; }
      msg.textContent = f.block.checked ? `Thanks. We'll take a look, and ${first(T)} is blocked.` : "Thanks. We'll take a look.";
      if (f.block.checked) { T.can = 'blocked_by_you'; people = null; setTimeout(() => { d.close(); loadConvs(); close(true); }, 1500); }
      else setTimeout(() => d.close(), 1500);
    });
    d.showModal();
  }

  // ------------------------------------------------ clicks, typing, back button
  box.addEventListener('click', async ev => {
    const o = ev.target.closest('[data-open]');
    if (o) { ev.preventDefault(); open(o.dataset.open, true); return; }
    if (ev.target.closest('[data-new]')) { openNew(); return; }
    if (ev.target.closest('[data-back]')) { if (history.state && history.state.u) history.back(); else close(true); return; }
    if (ev.target.closest('[data-older]')) { older(); return; }
    const menu = ev.target.closest('[data-menu]'), pop = pane.querySelector('.mpop');
    if (menu && pop) { pop.hidden = !pop.hidden; menu.setAttribute('aria-expanded', String(!pop.hidden)); return; }
    if (pop && !pop.hidden && !ev.target.closest('.mpop')) pop.hidden = true;
    if (ev.target.closest('[data-report]')) { pop.hidden = true; openReport(); return; }
    if (ev.target.closest('[data-block]') || ev.target.closest('[data-unblock]')) {
      if (pop) pop.hidden = true;
      if (T.can === 'blocked_by_you') { await ACC.rpc('unblock_user', {uname: T.username}); await loadThread(); return; }
      if (!confirm(`Block ${first(T)}? They won't be able to message you or follow you, and you'll stop following each other. They aren't told.`)) return;
      await ACC.rpc('block_user', {uname: T.username}); people = null;
      await loadConvs(); await loadThread(); return;
    }
    if (ev.target.closest('[data-del]')) {
      pop.hidden = true;
      if (!confirm(`Delete this conversation? It's only removed for you. ${first(T)} still has their copy.`)) return;
      await ACC.rpc('delete_conversation', {uname: T.username});
      convs = (convs || []).filter(c => c.username.toLowerCase() !== cur);
      close(true); return;
    }
    const f = ev.target.closest('[data-mfollow]');
    if (f) { f.disabled = true; await ACC.rpc('follow_user', {uname: T.username}); people = null; await loadThread(); }
  });
  document.addEventListener('click', ev => {
    const p = ev.target.closest('[data-pick]');
    if (p) { const d = $('mNew'); if (d) d.close(); open(p.dataset.pick, true); }
  });
  document.addEventListener('input', ev => { if (ev.target.matches('[data-pq]')) { peopleQ = ev.target.value; paintPeople(); } });
  box.addEventListener('submit', ev => { if (ev.target.matches('[data-send]')) { ev.preventDefault(); send(ev.target); } });
  box.addEventListener('input', ev => { if (ev.target.matches('.mform textarea')) { grow(ev.target); showErr(ev.target.value.length > 950 ? `${1000 - ev.target.value.length} characters left` : ''); } });
  box.addEventListener('keydown', ev => {
    // Enter sends on a computer; on phones Enter makes a new line and you tap Send.
    if (ev.target.matches('.mform textarea') && ev.key === 'Enter' && !ev.shiftKey && !matchMedia('(pointer:coarse)').matches) { ev.preventDefault(); send(ev.target.form); }
  });
  window.addEventListener('popstate', () => { const u = new URLSearchParams(location.search).get('u'); if (u) open(u, false); else close(false); });

  // ------------------------------------------------ live updates
  let refreshT;
  function refresh() {
    clearTimeout(refreshT);
    refreshT = setTimeout(() => { loadConvs(); if (cur) loadThread(); }, 250);
  }
  async function listen(uid) {
    const c = await ACC.client();
    if (!c || !c.channel) return;
    c.channel('ll-msgs-' + uid)
      .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${uid}`}, refresh)
      .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender=eq.${uid}`}, () => { if (cur) loadThread(); })
      .subscribe(st => { live = st === 'SUBSCRIBED'; });
  }
  // Backup check: every 20 seconds when live updates aren't connected, every 2 minutes when they are.
  let lastPoll = Date.now();
  setInterval(() => {
    if (document.hidden || broken || !ACC.user()) return;
    if (Date.now() - lastPoll < (live ? 120000 : 20000)) return;
    lastPoll = Date.now(); refresh();
  }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ACC.user() && !broken) { lastPoll = Date.now(); refresh(); } });

  // ------------------------------------------------ start
  let started = false;
  async function start() {
    const u = await ACC.session();
    if (!u) {
      if (started) return;
      list.innerHTML = `<div class="empty"><div class="eicon" aria-hidden="true">💬</div><h3>Message your friends</h3><p>Sign in to chat with friends who follow you back: plan a gig, swap record tips.</p><button type="button" class="btn" data-signin>Sign in or create an account</button></div>`;
      pane.innerHTML = '';
      box.classList.add('signedout');
      return;
    }
    if (started) return;
    started = true;
    box.classList.remove('signedout');
    listen(u.id);
    await loadConvs();
    const want = new URLSearchParams(location.search).get('u');
    if (want && !broken) open(want, false); else close(false);
  }
  document.addEventListener('acc', () => { if (!started && ACC.user()) start(); });
  start();
});
