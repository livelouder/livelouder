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
  function item(it) {
    const w = it.who, who = `<a class="fwho" href="${purl(w.username)}">${esc(w.name || w.username)}</a>`;
    let text = '', extra = '', act = '';
    if (it.t === 'going') {
      const g = it.gig;
      text = `${who} is going to ${gigLink(g)}`;
      extra = g ? `<span class="fmeta">${esc(gdate(g.d))} · ${esc(g.v)}, ${esc(g.c)}</span>` : '';
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

  function start() {
    let was = null; try { was = localStorage.getItem('llSignedIn'); } catch (e) {}
    if (!window.ACC || !was) { const b = document.getElementById('ffeed'); if (b) b.hidden = true; return; }
    ACC.session().then(u => { if (!u) { const b = document.getElementById('ffeed'); if (b) b.hidden = true; return; } loadGoing(); watch(); homeFeed(); });
  }
  window.FRIENDS = {renderFeed, loadFeed: () => { feedP = null; return loadFeed(); }, annotate, face};
  document.addEventListener('acc', () => { if (signedIn() && !going) { loadGoing(); watch(); homeFeed(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
