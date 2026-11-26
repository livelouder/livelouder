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
  const needed = document.getElementById('mygigs') || /access_token|error_description|type=magiclink/.test(location.hash + location.search) || lsGet('llSignedIn');
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
      await sb.from('profiles').upsert({id: user.id}, {onConflict: 'id', ignoreDuplicates: true});
      const [g, a, p] = await Promise.all([sb.from('saved_gigs').select('gig_id,gig,going'), sb.from('followed_artists').select('slug,name'),
                                           sb.from('profiles').select('*').eq('id', user.id).maybeSingle()]);
      profile = p.data || {};
      if (!profile.discogs && st.discogs) { await sb.from('profiles').update({discogs: st.discogs}).eq('id', user.id); profile.discogs = st.discogs; }
      const next = {gigs: {}, artists: {}, discogs: profile.discogs || st.discogs || ''};
      (g.data || []).forEach(r => { if (r.gig && r.gig.d >= MY.today) next.gigs[r.gig_id] = Object.assign({}, r.gig, {id: r.gig_id, going: r.going}); });
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
        <p class="note">By signing in you agree to our <a href="${root}privacy.html">privacy policy</a>.</p>`;
      document.body.appendChild(d);
      d.querySelector('#siGoogle').addEventListener('click', async () => {
        const c = await ready(); if (!c) return;
        await c.auth.signInWithOAuth({provider: 'google', options: {redirectTo: location.origin + '/my-gigs.html'}});
      });
      d.querySelector('#siEmail').addEventListener('submit', async ev => {
        ev.preventDefault();
        const msg = d.querySelector('#siMsg'), email = d.querySelector('#siAddr').value.trim();
        msg.textContent = 'Sending…';
        const c = await ready(); if (!c) { msg.textContent = "Couldn't connect. Try again in a minute."; return; }
        const {error} = await c.auth.signInWithOtp({email, options: {emailRedirectTo: location.origin + '/my-gigs.html'}});
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
    const {error} = await c.rpc('delete_my_account');
    if (error) { alert("Sorry, that didn't work. Email hello@livelouder.com.au and we'll delete it for you."); return; }
    await c.auth.signOut();
    try { localStorage.removeItem('llSignedIn'); localStorage.removeItem('llMy'); } catch (e) {}
    MY.replace({gigs: {}, artists: {}, discogs: ''});
    alert('Your account and everything in it has been deleted.');
    ui();
  }
  async function setPref(field, val) {
    if (!sb || !user) return;
    profile = Object.assign(profile || {}, {[field]: val});
    await sb.from('profiles').update({[field]: val, updated_at: new Date().toISOString()}).eq('id', user.id);
  }

  // Account panel on My gigs, and the header link.
  function ui() {
    document.querySelectorAll('.mylink').forEach(a => a.classList.toggle('in', !!user));
    const box = document.getElementById('acct');
    if (!box) return;
    if (!user) {
      box.innerHTML = `<div class="card acct out"><h3>Keep your gigs everywhere</h3><p>Sign in and your saved gigs, artists and records follow you to every device. We'll also send a reminder before the show and when presales start for artists you follow.</p>
        <button type="button" class="btn" data-signin>Sign in or create an account</button><p class="note">Free. No password needed.</p></div>`;
      return;
    }
    const p = profile || {};
    box.innerHTML = `<div class="card acct"><h3>Your account</h3><p class="note" style="margin-top:0">Signed in as <b>${esc(user.email || '')}</b></p>
      <h4>Emails</h4>
      <label class="tog"><input type="checkbox" data-pref="remind_gigs" ${p.remind_gigs !== false ? 'checked' : ''}> A reminder a few days before gigs I've saved</label>
      <label class="tog"><input type="checkbox" data-pref="remind_presales" ${p.remind_presales !== false ? 'checked' : ''}> Presales, on-sales and new dates for artists I follow</label>
      <p class="acts"><button type="button" class="linkish" id="acOut">Sign out</button> · <button type="button" class="linkish" id="acDel">Delete my account</button></p></div>`;
    box.querySelectorAll('[data-pref]').forEach(i => i.addEventListener('change', () => setPref(i.dataset.pref, i.checked)));
    box.querySelector('#acOut').addEventListener('click', signOut);
    box.querySelector('#acDel').addEventListener('click', deleteAccount);
  }

  window.ACC = {push, user: () => user, open: openSignIn};
  ui();
  if (needed) ready().then(c => c && c.auth.getSession()).then(r => {
    if (r && r.data && r.data.session) { user = r.data.session.user; ui(); merge(); }
    if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname + location.search);
  });
})();
