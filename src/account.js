// Live Louder accounts (Supabase). Signing in keeps My gigs on every device and turns on reminder emails.
// Without an account, everything still works and is saved on the visitor's device (app.js, "MY").
// The publishable key below is meant to be public: the database only lets people see and change their own rows.
(function () {
  const SB_URL = 'https://qoqdouthyyaebmreavgz.supabase.co';
  const SB_KEY = 'sb_publishable_pL0ygBPAPtoIXzMi3e1lsQ_ytrBXiNY';
  const root = document.body.dataset.root || '';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  let sb = null, user = null, profile = null, merging = false;
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  // Only load the sign-in library when it's needed: on My gigs, when coming back from a sign-in link,
  // or when this browser has signed in before.
  const needed = document.getElementById('profile') || document.getElementById('pub') || /access_token|error_description|type=magiclink/.test(location.hash + location.search) || lsGet('llSignedIn');
  let readyP = null;
  function ready() {
    if (!readyP) readyP = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(m => {
      sb = m.createClient(SB_URL, SB_KEY, {auth: {flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
      sb.auth.onAuthStateChange((event, session) => {
        const was = user && user.id;
        user = session ? session.user : null;
        if (user) lsSet('llSignedIn', '1');
        if (user && was !== user.id) setTimeout(merge, 0);
        if (!user) profile = null;
        ui();
      });
      return sb;
    }).catch(() => null);
    return readyP;
  }

  // First time signed in on this device: add this device's saves to the account, then show the account's saves.
  async function merge() {
    if (!sb || !user || merging) return;
    merging = true;
    try {
      const st = MY.get();
      const gigs = Object.values(st.gigs).map(x => ({user_id: user.id, gig_id: x.id, gig: x, going: !!x.going}));
      const arts = Object.entries(st.artists).map(([slug, name]) => ({user_id: user.id, slug, name}));
      if (gigs.length) await sb.from('saved_gigs').upsert(gigs, {onConflict: 'user_id,gig_id', ignoreDuplicates: true});
      if (arts.length) await sb.from('followed_artists').upsert(arts, {onConflict: 'user_id,slug', ignoreDuplicates: true});
      const recs = [...Object.values(st.records || {}).map(r => ({user_id: user.id, list: 'collection', rid: r.rid, rec: r})),
                    ...Object.values(st.wants || {}).map(r => ({user_id: user.id, list: 'wantlist', rid: r.rid, rec: r}))];
      for (let i = 0; i < recs.length; i += 500) await sb.from('user_records').upsert(recs.slice(i, i + 500), {onConflict: 'user_id,list,rid', ignoreDuplicates: true});
      await sb.from('profiles').upsert({id: user.id}, {onConflict: 'id', ignoreDuplicates: true});
      const [g, a, p] = await Promise.all([sb.from('saved_gigs').select('gig_id,gig,going'), sb.from('followed_artists').select('slug,name'),
                                           sb.from('profiles').select('*').eq('id', user.id).maybeSingle()]);
      const recRows = [];
      for (let from = 0; ; from += 1000) {
        const {data} = await sb.from('user_records').select('list,rid,rec').range(from, from + 999);
        if (!data || !data.length) break;
        recRows.push(...data); if (data.length < 1000) break;
      }
      profile = p.data || {};
      if (!profile.discogs && st.discogs) { await sb.from('profiles').update({discogs: st.discogs}).eq('id', user.id); profile.discogs = st.discogs; }
      const next = {gigs: {}, artists: {}, discogs: profile.discogs || st.discogs || '', records: {}, wants: {}};
      recRows.forEach(r => { next[r.list === 'collection' ? 'records' : 'wants'][r.rid] = r.rec; });
      (g.data || []).forEach(r => { if (r.gig && (r.gig.d >= MY.today || r.going)) next.gigs[r.gig_id] = Object.assign({}, r.gig, {id: r.gig_id, going: r.going}); });
      (a.data || []).forEach(r => { next.artists[r.slug] = r.name; });
      MY.replace(next);
    } catch (e) { console.log('account sync', e); }
    merging = false;
    ui();
  }

  async function push(kind, op, item) {
    if (!user) { if (op === 'add') nudge(); return; }
    if (!sb) return;
    try {
      if (kind === 'gig' && op === 'add') await sb.from('saved_gigs').upsert({user_id: user.id, gig_id: item.id, gig: item, going: !!item.going});
      if (kind === 'gig' && op === 'remove') await sb.from('saved_gigs').delete().eq('gig_id', item.id);
      if (kind === 'gig' && op === 'going') await sb.from('saved_gigs').update({going: !!item.going}).eq('gig_id', item.id);
      if (kind === 'artist' && op === 'add') await sb.from('followed_artists').upsert({user_id: user.id, slug: item.slug, name: item.name});
      if (kind === 'artist' && op === 'remove') await sb.from('followed_artists').delete().eq('slug', item.slug);
      if (kind === 'discogs') await sb.from('profiles').update({discogs: item || null}).eq('id', user.id);
      if (kind === 'rec' && op === 'add') await sb.from('user_records').upsert({user_id: user.id, list: item.list === 'records' ? 'collection' : 'wantlist', rid: item.rec.rid, rec: item.rec});
      if (kind === 'rec' && op === 'remove') await sb.from('user_records').delete().eq('list', item.list === 'records' ? 'collection' : 'wantlist').eq('rid', item.rec.rid);
      if (kind === 'recs' && op === 'bulk') {
        for (let i = 0; i < item.rows.length; i += 500) await sb.from('user_records').upsert(item.rows.slice(i, i + 500).map(x => ({user_id: user.id, list: x.list, rid: x.rec.rid, rec: x.rec})), {onConflict: 'user_id,list,rid', ignoreDuplicates: true});
      }
    } catch (e) { console.log('account save', e); }
  }

  // A one-off hint after the first save, for people who aren't signed in.
  function nudge() {
    if (lsGet('llNudged')) return;
    lsSet('llNudged', '1');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>Saved to <a href="${root}my-gigs.html">My gigs</a> on this device.</span> <button type="button" class="linkish" data-signin>Sign in</button> to keep it on all your devices and get a reminder before the show.`;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('on'), 20);
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, 9000);
  }

  // Sign-in box.
  function openSignIn() {
    let d = document.getElementById('signin');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'signin';
      d.innerHTML = `<form method="dialog" class="sclose"><button aria-label="Close">×</button></form>
        <h2>Sign in to Live Louder</h2><p>Keep your gigs and artists on all your devices, and get a reminder before the show and when presales start.</p>
        <button type="button" class="gbtn" id="siGoogle"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg> Continue with Google</button>
        <div class="or"><span>or</span></div>
        <form id="siEmail"><label>Your email <input type="email" required autocomplete="email" id="siAddr"></label><button class="btn">Email me a sign-in link</button></form>
        <p class="note" id="siMsg">No password needed. We'll email you a link that signs you in.</p>
        <p class="note">New accounts get a public profile that friends can follow, showing your gigs and records (never your email). You can make it private any time in Settings. By signing in you agree to our <a href="${root}privacy.html">privacy policy</a>.</p>`;
      document.body.appendChild(d);
      d.querySelector('#siGoogle').addEventListener('click', async () => {
        const c = await ready(); if (!c) return;
        await c.auth.signInWithOAuth({provider: 'google', options: {redirectTo: document.getElementById('pub') ? location.href.split('#')[0] : location.origin + '/my-gigs.html'}});
      });
      d.querySelector('#siEmail').addEventListener('submit', async ev => {
        ev.preventDefault();
        const msg = d.querySelector('#siMsg'), email = d.querySelector('#siAddr').value.trim();
        msg.textContent = 'Sending…';
        const c = await ready(); if (!c) { msg.textContent = "Couldn't connect. Try again in a minute."; return; }
        const {error} = await c.auth.signInWithOtp({email, options: {emailRedirectTo: document.getElementById('pub') ? location.href.split('#')[0] : location.origin + '/my-gigs.html'}});
        msg.innerHTML = error ? esc(error.message.includes('rate') ? 'Too many tries. Wait a few minutes and try again.' : error.message)
                              : `<b>Check your email.</b> We've sent a sign-in link to ${esc(email)}. It can take a minute to arrive, and might land in spam.`;
      });
    }
    ready();
    d.showModal ? d.showModal() : d.setAttribute('open', '');
  }
  document.addEventListener('click', ev => {
    if (ev.target.closest('[data-signin]')) { ev.preventDefault(); openSignIn(); }
  });

  async function signOut() { const c = await ready(); if (c) await c.auth.signOut(); try { localStorage.removeItem('llSignedIn'); } catch (e) {} ui(); }
  async function deleteAccount() {
    if (!confirm('Delete your Live Louder account and everything saved in it? This can\'t be undone.')) return;
    const c = await ready(); if (!c) return;
    try { const {data} = await c.storage.from('profile').list(user.id); if (data && data.length) await c.storage.from('profile').remove(data.map(f => `${user.id}/${f.name}`)); } catch (e) {}
    const {error} = await c.rpc('delete_my_account');
    if (error) { alert("Sorry, that didn't work. Email hello@livelouder.com.au and we'll delete it for you."); return; }
    await c.auth.signOut();
    try { localStorage.removeItem('llSignedIn'); localStorage.removeItem('llMy'); } catch (e) {}
    MY.replace({});
    alert('Your account and everything in it has been deleted.');
    ui();
  }
  async function setPref(field, val) {
    if (!sb || !user) return;
    profile = Object.assign(profile || {}, {[field]: val});
    await sb.from('profiles').update({[field]: val, updated_at: new Date().toISOString()}).eq('id', user.id);
  }

  // Friends: profile details (username, display name, sharing) and the database functions in supabase/schema.sql.
  async function saveProfile(fields) {
    const c = await ready();
    if (!c || !user) return {error: 'Sign in first'};
    const {error} = await c.from('profiles').update(Object.assign({}, fields, {updated_at: new Date().toISOString()})).eq('id', user.id);
    if (error) return {error: /profiles_username_key|duplicate/.test(error.message) ? 'That username is taken. Try another.' : /username_ok/.test(error.message) ? 'Usernames are 3 to 24 letters, numbers or underscores.' : "Couldn't save that. Try again."};
    profile = Object.assign(profile || {}, fields);
    ui();
    return {};
  }
  async function rpc(fn, args) {
    const c = await ready();
    if (!c) return {error: 'offline'};
    const {data, error} = await c.rpc(fn, args || {});
    return error ? {error: error.message} : {data};
  }
  // Profile photo and cover banner. Pictures are cropped and shrunk in the browser, then stored in the
  // "profile" bucket in a folder named after the account (only the owner can change it).
  const SIZES = {avatar: [480, 480], banner: [1800, 600]};
  function shrink(file, kind) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const [W, H] = SIZES[kind], r = Math.max(W / img.width, H / img.height);
        const w = Math.min(W, Math.round(img.width * r)), h = Math.min(H, Math.round(img.height * r));
        const sw = w / r, sh = h / r, c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file isn\'t a photo we can read. Try a JPG or PNG.')); };
      img.src = url;
    });
  }
  const pathOf = u => u && u.split('/object/public/profile/')[1];
  async function token() {
    const c = await ready();
    const r = c && await c.auth.getSession();
    return r && r.data && r.data.session && r.data.session.access_token;
  }
  // Uploads go through the site's server code, which checks the photo before it goes live (netlify/functions/profile-photo.mjs).
  async function setPhoto(kind, file) {
    if (!user) return {error: 'Sign in first'};
    let blob;
    try { blob = await shrink(file, kind); } catch (e) { return {error: e.message === 'blob' ? "Couldn't read that photo." : e.message}; }
    const t = await token();
    if (!t) return {error: 'Please sign in again.'};
    let r, j = {};
    try {
      r = await fetch('/.netlify/functions/profile-photo?kind=' + kind, {method: 'POST', headers: {authorization: 'Bearer ' + t, 'content-type': 'image/jpeg'}, body: blob});
      j = await r.json();
    } catch (e) { return {error: "Couldn't upload that photo. Check your connection and try again."}; }
    if (!r.ok) return {error: j.error || "Couldn't upload that photo. Try again."};
    profile = Object.assign(profile || {}, {[kind + '_url']: j.url, [kind + '_status']: j.status});
    ui();
    return j;
  }
  async function reportPhoto(username, kind, reason) {
    const t = await token();
    if (!t) return {error: 'Please sign in to report a photo.'};
    try {
      const r = await fetch('/.netlify/functions/report-photo', {method: 'POST', headers: {authorization: 'Bearer ' + t, 'content-type': 'application/json'}, body: JSON.stringify({username, kind, reason})});
      const j = await r.json().catch(() => ({}));
      return r.ok ? {} : {error: j.error || "Couldn't send that. Try again."};
    } catch (e) { return {error: "Couldn't send that. Try again."}; }
  }
  async function removePhoto(kind) {
    const c = await ready();
    if (!c || !user) return {};
    const old = pathOf((profile || {})[kind + '_url']);
    const r = await saveProfile({[kind + '_url']: null});
    if (!r.error && old) await c.storage.from('profile').remove([old]);
    return r;
  }

  // Wait until we know whether this visitor is signed in.
  let sessionP = null;
  const session = () => sessionP || (sessionP = ready().then(c => c && c.auth.getSession()).then(r => { if (r && r.data && r.data.session && !user) user = r.data.session.user; return user; }).catch(() => null));

  // Header dot, and tell the My gigs page to redraw.
  function ui() {
    document.querySelectorAll('.mylink').forEach(a => a.classList.toggle('in', !!user));
    document.dispatchEvent(new CustomEvent('acc'));
  }

  window.ACC = {push, user: () => user, profile: () => profile, open: openSignIn, signOut, deleteAccount, setPref,
                syncing: () => merging, ready: () => !!sb, saveProfile, rpc, session, setPhoto, removePhoto, reportPhoto};
  ui();
  if (needed) ready().then(c => c && c.auth.getSession()).then(r => {
    if (r && r.data && r.data.session) { user = r.data.session.user; ui(); merge(); }
    if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname + location.search);
  });
})();
