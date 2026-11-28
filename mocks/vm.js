// Vinyl mock-ups for Live Louder (not part of the site). Injected into live pages for screenshots.
(function () {
  const D = JSON.parse(sessionStorage.getItem('mkdata') || '{}');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const n = x => Number(x).toLocaleString('en-AU');
  const tier = (h, w) => h < 250 ? ['Very rare', 'vr'] : h < 1000 ? ['Rare', 'r'] : h < 5000 ? ['Uncommon', 'u'] : ['Common', 'c'];
  const hot = (h, w) => w > h;
  const badge = (h, w) => { const [t, k] = tier(h, w); return `<span class="vb vb-${k}">${t}</span>${hot(h, w) ? '<span class="vb vb-hot">🔥 In demand</span>' : ''}`; };
  const flag = c => c === 'Australia' ? '🇦🇺 ' : c === 'Japan' ? '🇯🇵 ' : c === 'US' ? '🇺🇸 ' : c === 'UK' ? '🇬🇧 ' : '';
  const R = D.recs || [];
  const col = R.filter(r => !['Soundgarden', 'Hole'].includes(r.a));
  const wants = R.filter(r => ['Soundgarden', 'Hole'].includes(r.a));
  const seenLive = {Powderfinger: 2, 'Spacey Jane': 1, 'The Chats': 3, 'You Am I': 1};
  const touring = {'Spacey Jane': 'Sydney · 12 Dec', 'The Chats': 'Melbourne · 6 Feb'};
  const ex = t => `<span class="vex">${t || 'Example'}</span>`;

  const css = `
  .vb{display:inline-block;font:700 11px/1 Archivo,sans-serif;text-transform:uppercase;letter-spacing:.04em;padding:4px 7px;border-radius:99px;margin:0 4px 4px 0;white-space:nowrap}
  .vb-c{background:#2a2a2a;color:#bbb}.vb-u{background:#1f3a5f;color:#9cc8ff}.vb-r{background:#4a2a6b;color:#d7b5ff}.vb-vr{background:linear-gradient(90deg,#b8860b,#f5d36b);color:#1a1300}.vb-hot{background:#4a1b12;color:#ff9a7a}
  .vex{display:inline-block;background:#333;color:#bbb;font:600 11px Archivo,sans-serif;border-radius:99px;padding:2px 8px;margin-left:8px;vertical-align:middle;text-transform:none;letter-spacing:0}
  .vsub{display:flex;gap:6px;margin:0 0 16px}.vsub a{padding:9px 15px;border-radius:99px;border:1px solid var(--line);color:var(--ink);font:700 14px Archivo,sans-serif;text-decoration:none}.vsub a.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}.vsub a span{opacity:.6;font-weight:500;margin-left:4px}
  .vadd{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:22px}.vadd input{flex:1 1 320px;font:16px Archivo,sans-serif;padding:12px 18px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
  .vbtn{display:inline-flex;align-items:center;gap:6px;min-height:42px;padding:0 16px;border-radius:99px;border:1.5px solid var(--ink);background:transparent;color:var(--ink);font:700 14px Archivo,sans-serif;white-space:nowrap}.vbtn.red{background:var(--red);border-color:var(--red);color:#fff}.vbtn.sm{min-height:34px;padding:0 12px;font-size:13px}
  .vrare{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:26px}
  .vrc{position:relative;display:flex;gap:14px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}.vrc img{width:92px;height:92px;border-radius:6px;object-fit:cover;box-shadow:6px 0 0 -2px #0c0c0c,7px 0 0 -1px #444}
  .vrc b{display:block;font:400 18px/1.1 Anton,Impact,sans-serif;text-transform:uppercase;color:var(--ink)}.vrc small{display:block;color:var(--muted);font-size:12.5px;margin:3px 0 6px}
  .vrank{position:absolute;top:-8px;left:-8px;width:26px;height:26px;border-radius:50%;background:var(--red);color:#fff;font:700 13px Archivo;display:grid;place-items:center}
  .vtools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}.vtools .chip{padding:8px 12px;border-radius:99px;border:1px solid var(--line);font:600 13px Archivo,sans-serif;color:var(--ink)}.vtools .chip.on{background:var(--ink);color:var(--bg)}.vtools select{font:600 13px Archivo;padding:8px 12px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink);margin-left:auto}
  .vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:18px}
  .vcard{position:relative;color:var(--ink)}.vcard .cv{position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;background:#222;box-shadow:0 6px 16px rgba(0,0,0,.35)}.vcard .cv img{width:100%;height:100%;object-fit:cover;display:block}
  .vcard .tags{position:absolute;left:6px;bottom:6px;display:flex;flex-wrap:wrap}.vcard .tags .vb{margin:2px 3px 0 0;box-shadow:0 2px 6px rgba(0,0,0,.4)}
  .vcard .tl{position:absolute;top:6px;right:6px;display:flex;flex-direction:column;gap:4px;align-items:flex-end}.vpill{background:rgba(0,0,0,.75);color:#fff;font:700 11px Archivo;padding:4px 7px;border-radius:99px}.vpill.g{background:#1d7a3a}.vpill.r{background:var(--red)}
  .vcard strong{display:block;margin-top:8px;font-size:14.5px;line-height:1.25}.vcard span.m{display:block;color:var(--muted);font-size:12.5px}
  /* pressing picker */
  .vmodal{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}
  .vsheet{width:min(760px,100%);background:var(--card);color:var(--ink);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden}
  .vsh{display:flex;gap:16px;align-items:center;padding:18px 20px;border-bottom:1px solid var(--line)}.vsh img{width:84px;height:84px;border-radius:6px}.vsh h2{font-size:28px;margin:0;line-height:1}.vsh p{margin:4px 0 0;color:var(--muted)}
  .vsh .x{margin-left:auto;align-self:flex-start;font-size:22px;color:var(--muted)}
  .vfil{display:flex;gap:6px;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid var(--line)}.vfil span{padding:7px 12px;border-radius:99px;border:1px solid var(--line);font:600 13px Archivo}.vfil span.on{background:var(--ink);color:var(--bg)}
  .vlist{list-style:none;margin:0;padding:0;max-height:none}.vlist li{display:flex;gap:14px;align-items:center;padding:12px 20px;border-bottom:1px solid var(--line)}
  .vlist li img{width:60px;height:60px;border-radius:5px;flex:none}.vlist .vi{flex:1;min-width:0}.vlist .vi b{display:block;font-size:15px}.vlist .vi small{display:block;color:var(--muted);font-size:12.5px;margin:2px 0 5px}
  .vlist .vbt{display:flex;flex-direction:column;gap:6px}.vdot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:-1px;border:1px solid rgba(255,255,255,.3)}
  .vlist li.any{background:var(--bg)}.vlist li.any .vi b{font-size:15px}
  .vfoot{padding:10px 20px;color:var(--muted);font-size:12px}.vfoot a{color:var(--muted)}
  /* stats */
  .vst{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:20px}.vst div{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}.vst b{display:block;font:400 34px/1 Anton,Impact;color:var(--ink)}.vst span{color:var(--muted);font-size:13px}
  .vtwo{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 300px;gap:16px;align-items:start}
  .vpanel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}.vpanel h3{font-size:20px;margin:0 0 12px}
  .vbar{display:grid;grid-template-columns:62px 1fr 34px;gap:8px;align-items:center;font-size:13px;margin:7px 0}.vbar i{display:block;height:12px;border-radius:99px;background:var(--red)}.vbar em{font-style:normal;color:var(--muted);text-align:right}
  .vshare{aspect-ratio:9/16;border-radius:16px;padding:18px;background:radial-gradient(circle at 30% 10%,#e2391f 0,#5a1208 45%,#120606 100%);color:#fff;display:flex;flex-direction:column;gap:10px;box-shadow:0 20px 40px rgba(0,0,0,.5)}
  .vshare h4{font:400 30px/1 Anton,Impact;margin:0;text-transform:uppercase}.vshare .covers{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.vshare .covers img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:3px}
  .vshare .big{font:400 54px/1 Anton,Impact}.vshare p{margin:0;font-size:13px;opacity:.9}.vshare .wm{margin-top:auto;font:400 16px Anton;letter-spacing:.02em}.vshare .wm span{color:#ff8a73}
  /* record sheet */
  .vrec{display:grid;grid-template-columns:300px minmax(0,1fr);gap:24px;padding:22px}.vrec .cvr img{width:100%;border-radius:6px;box-shadow:0 14px 30px rgba(0,0,0,.5)}
  .vrec h2{font-size:34px;margin:0;line-height:1}.vrec .ar{font-size:18px;margin:4px 0 10px;color:var(--muted)}
  .vmeter{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:12px 0}.vmeter .row{display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px}.vtrack{height:10px;border-radius:99px;background:linear-gradient(90deg,#2a2a2a,#1f3a5f,#4a2a6b,#b8860b);position:relative}.vtrack i{position:absolute;top:-4px;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid var(--red)}
  .vacts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
  .vlink{display:flex;gap:10px;align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0;font-size:14px}.vlink b{color:var(--ink)}
  .vattr{font-size:12px;color:var(--muted);margin-top:12px}.vattr a{color:var(--muted)}
  /* wantlist */
  .vstock{background:#1d7a3a;color:#fff}
  .valert{display:flex;gap:16px;align-items:center;background:var(--card);border:1px solid var(--line);border-left:5px solid #1d7a3a;border-radius:14px;padding:14px 16px;margin-bottom:20px}.valert img{width:70px;height:70px;border-radius:5px}.valert b{display:block;font-size:16px}.valert small{color:var(--muted)}
  .vmail{background:#f6f5f2;color:#141414;border-radius:12px;overflow:hidden;font-family:Helvetica,Arial;box-shadow:0 10px 30px rgba(0,0,0,.4)}.vmail .hd{background:#141414;color:#fff;font:700 20px Impact;padding:12px 16px;border-bottom:5px solid #e2391f}.vmail .hd span{color:#e2391f}.vmail .bd{padding:16px}.vmail img{width:100%;border-radius:6px}.vmail .btn2{display:inline-block;background:#e2391f;color:#fff;font-weight:700;border-radius:99px;padding:10px 18px;margin-top:10px}
  /* taste match */
  .vmatch{display:flex;gap:18px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-bottom:18px}
  .vring{--p:72;width:96px;height:96px;border-radius:50%;background:conic-gradient(var(--red) calc(var(--p)*1%),#2c2c2c 0);display:grid;place-items:center;flex:none}.vring div{width:76px;height:76px;border-radius:50%;background:var(--card);display:grid;place-items:center;text-align:center}.vring b{font:400 28px/1 Anton;color:var(--ink)}.vring small{display:block;font-size:10px;color:var(--muted);text-transform:uppercase}
  .vmatch ul{margin:6px 0 0;padding:0;list-style:none;display:flex;gap:18px;flex-wrap:wrap;font-size:14px}.vmatch li b{color:var(--ink);font-size:16px}
  .vcov{display:flex;gap:6px;margin-top:10px}.vcov img{width:46px;height:46px;border-radius:4px}
  /* gig page block */
  .vshelf{background:#1c1b19;border:1px solid #2e2c29;border-radius:14px;padding:14px 16px;margin:16px 0;color:#f1eee8}.vshelf h3{font-size:20px;margin:0 0 8px;color:#fff}.vshelf .row{display:flex;gap:12px;align-items:center}.vshelf img{width:64px;height:64px;border-radius:5px}
  .vshelf small{color:#a9a49c}
  @media(max-width:700px){.vrare{grid-template-columns:1fr}.vst{grid-template-columns:repeat(3,1fr)}.vtwo{grid-template-columns:1fr}.vrec{grid-template-columns:1fr}.vgrid{grid-template-columns:repeat(2,1fr);gap:12px}}
  `;
  if (!document.getElementById('vmcss')) { const s = document.createElement('style'); s.id = 'vmcss'; s.textContent = css; document.head.appendChild(s); }
  const body = () => document.getElementById('pBody') || document.getElementById('uBody');
  const tabs = on => { document.querySelectorAll('.ptabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === on ? 'page' : 'false')); };
  const sub = on => `<div class="vsub"><a class="${on === 'c' ? 'on' : ''}">Collection<span>${col.length}</span></a><a class="${on === 'w' ? 'on' : ''}">Wantlist<span>${wants.length + 1}</span></a><a class="${on === 's' ? 'on' : ''}">Stats</a></div>`;
  const card = r => `<div class="vcard"><div class="cv"><img src="${esc(r.img)}" alt=""><div class="tags">${badge(r.have, r.want)}</div><div class="tl">${seenLive[r.a] ? `<span class="vpill r">Seen live ×${seenLive[r.a]}</span>` : ''}${touring[r.a] ? '<span class="vpill">🎟 Touring</span>' : ''}</div></div>
    <strong>${esc(r.t)}</strong><span class="m">${esc(r.a)}</span><span class="m">${flag(r.country)}${esc(r.country || '')} · ${esc(r.year || '')}</span></div>`;

  window.VM = {
    records() {
      tabs('records');
      const rare = col.slice().sort((a, b) => a.have - b.have).slice(0, 3);
      body().innerHTML = sub('c') + `<div class="vadd"><input placeholder="Add a record: search any album, artist or catalogue number"><span class="vbtn">📷 Scan barcode</span><span class="vbtn">Import from Discogs</span></div>
        <div class="shead"><h2>Your rarest records ${ex()}</h2><a>See all by rarity →</a></div>
        <div class="vrare">${rare.map((r, i) => `<div class="vrc"><span class="vrank">${i + 1}</span><img src="${esc(r.img)}" alt=""><div><b>${esc(r.t)}</b><small>${esc(r.a)} · ${flag(r.country)}${esc(r.year)} pressing</small>${badge(r.have, r.want)}<small>${n(r.have)} collectors own this pressing · ${n(r.want)} want it</small></div></div>`).join('')}</div>
        <div class="vtools"><span class="chip on">All ${col.length}</span><span class="chip">🎟 Touring now 2</span><span class="chip">Seen live 4</span><span class="chip">🇦🇺 Aussie pressings 6</span><span class="chip">Colour vinyl 3</span><select><option>Sort: Rarest first</option></select></div>
        <div class="vgrid">${col.slice().sort((a, b) => a.have - b.have).map(card).join('')}</div>`;
    },
    pressing() {
      const V = (D.vers || []).slice();
      const top = V[0] || {};
      const m = document.createElement('div'); m.className = 'vmodal'; m.id = 'vmodal';
      const colour = t => { const x = (t.match(/\[([^\]]+)\]/) || [])[1] || t.split(',')[0]; return x; };
      const dot = t => /orange/i.test(t) ? '#f08a24' : /green/i.test(t) ? '#2f9e6a' : /violet|magenta/i.test(t) ? '#a03cc8' : /pink/i.test(t) ? '#f4a6c8' : /blue/i.test(t) ? '#2f7fd6' : /yellow|golden/i.test(t) ? '#e8c14a' : /red|clear/i.test(t) ? '#e04848' : /cream|pearl/i.test(t) ? '#efe6d2' : '#888';
      const rows = V.sort((a, b) => a.have - b.have).map(v => `<li><img src="${esc(v.thumb)}" alt=""><div class="vi"><b><span class="vdot" style="background:${dot(v.text)}"></span>${esc(colour(v.text))}</b>
        <small>${flag(v.country)}${esc(v.country)} · ${esc(v.label)} · ${esc(String(v.catno).split(',')[0])} · ${esc(v.year)}${/Limited/.test(v.desc) ? ' · Limited' : ''}${/Reissue/.test(v.desc) ? ' · Repress' : ''}</small>${badge(v.have, v.want)}<small style="display:inline">${n(v.have)} have · ${n(v.want)} want</small></div>
        <div class="vbt"><span class="vbtn sm red">+ Collection</span><span class="vbtn sm">+ Wantlist</span></div></li>`).join('');
      m.innerHTML = `<div class="vsheet"><div class="vsh"><img src="${esc(top.img)}" alt=""><div><h2>The Life Of A Showgirl</h2><p>Taylor Swift · 2025 · <b>${V.length} vinyl versions</b> on Discogs</p></div><span class="x">×</span></div>
        <div class="vfil"><span class="on">All ${V.length}</span><span>Limited</span><span>Colour vinyl</span><span>🇺🇸 US</span><span>Europe</span><span>🇯🇵 Japan</span><span>Sort: Rarest first ▾</span></div>
        <ul class="vlist"><li class="any"><img src="${esc(top.img)}" alt="" style="opacity:.8"><div class="vi"><b>Not sure which one? Just add the album</b><small>You can pick your exact pressing later. We'll still show tours and new vinyl from Taylor Swift.</small></div><div class="vbt"><span class="vbtn sm red">+ Collection</span><span class="vbtn sm">+ Wantlist</span></div></li>${rows}</ul>
        <div class="vfoot">Data provided by <a>Discogs</a>. Live Louder uses Discogs' API but isn't affiliated with, sponsored or endorsed by Discogs.</div></div>`;
      document.body.appendChild(m);
    },
    stats() {
      tabs('records');
      const dec = [['1980s', 1], ['1990s', 4], ['2000s', 1], ['2010s', 1], ['2020s', 3]], g = [['Rock', 5], ['Alternative', 3], ['Punk', 1], ['Indie', 1]];
      const mx = 5;
      body().innerHTML = sub('s') + `<div class="shead"><h2>Your crate in numbers ${ex()}</h2><span class="vbtn red">Share my crate</span></div>
        <div class="vst"><div><b>${col.length}</b><span>records</span></div><div><b>8</b><span>artists</span></div><div><b>7</b><span>labels</span></div><div><b>6</b><span>🇦🇺 Aussie pressings</span></div><div><b>3</b><span>rare or very rare</span></div><div><b>4</b><span>artists seen live</span></div></div>
        <div class="vtwo"><div class="vpanel"><h3>By decade</h3>${dec.map(([k, v]) => `<div class="vbar"><span>${k}</span><i style="width:${v / mx * 100}%"></i><em>${v}</em></div>`).join('')}
          <h3 style="margin-top:20px">By genre</h3>${g.map(([k, v]) => `<div class="vbar"><span>${k}</span><i style="width:${v / mx * 100}%;background:#9cc8ff"></i><em>${v}</em></div>`).join('')}</div>
        <div class="vpanel"><h3>Highlights</h3>
          <div class="vlink">🏆 <span>Rarest: <b>Odyssey Number Five</b>, Australian 2025 pressing. Only 31 collectors have it.</span></div>
          <div class="vlink">🔥 <span>Most wanted: <b>Frogstomp</b>, 1995 Murmur pressing. 1,329 people want it, 542 have it.</span></div>
          <div class="vlink">📼 <span>Oldest pressing: <b>Diesel And Dust</b>, 1987 CBS Australia.</span></div>
          <div class="vlink">🎤 <span>Seen live and on your shelf: <b>The Chats</b> (3 times), <b>Powderfinger</b> (2).</span></div>
          <div class="vlink">🎟 <span>2 artists in your crate are touring: <b>Spacey Jane</b>, <b>The Chats</b>.</span></div></div>
        <div><div class="vshare"><h4>Mick's crate</h4><div class="covers">${col.slice(0, 6).map(r => `<img src="${esc(r.img)}" alt="">`).join('')}</div><div class="big">${col.length}</div><p>records · 50% 90s · 6 Aussie pressings</p><p>Rarest: Odyssey Number Five (AU)</p><p>Seen live most: The Chats ×3</p><div class="wm">LIVE <span>LOUDER</span></div></div><p class="note" style="text-align:center">Share card, sized for Instagram stories</p></div></div>`;
    },
    record() {
      const r = col.find(x => x.a === 'Silverchair') || col[0];
      const m = document.createElement('div'); m.className = 'vmodal'; m.id = 'vmodal';
      const pos = Math.min(96, 100 - Math.log10(r.have) / 5.6 * 100);
      m.innerHTML = `<div class="vsheet" style="width:min(900px,100%)"><div class="vrec"><div class="cvr"><img src="${esc(r.img)}" alt=""><div class="vacts" style="margin-top:14px"><span class="vbtn red" style="flex:1;justify-content:center">▶ Now spinning</span></div><p class="note" style="text-align:center;margin:0">Posts to your feed, logs a play</p></div>
        <div><span class="ntag">In your collection</span><h2>${esc(r.t)}</h2><p class="ar">${esc(r.a)}</p>
        <p style="margin:0;font-size:14px">${flag(r.country)}${esc(r.country)} · ${esc(r.label)} · ${esc(r.year)} · ${esc(r.fmt)}</p>
        <div class="vmeter"><div class="row"><b>${tier(r.have, r.want)[0]}${hot(r.have, r.want) ? ' · 🔥 In demand' : ''}</b><span>${n(r.have)} collectors have this pressing · ${n(r.want)} want it</span></div><div class="vtrack"><i style="left:calc(${pos}% - 9px)"></i></div><div class="row" style="margin:6px 0 0;color:var(--muted);font-size:11px"><span>Common</span><span>Uncommon</span><span>Rare</span><span>Very rare</span></div></div>
        <div class="vlink">🎤 <span><b>You've seen Silverchair live</b> · Enmore Theatre, 1999 (from your gig diary)</span></div>
        <div class="vlink">▶ <span>You've spun this <b>4 times</b> · last on Thursday</span></div>
        <div class="vlink">🛒 <span>Want a fresh copy? <b>Frogstomp is at Heathen Records</b> →</span></div>
        <div class="vacts"><span class="vbtn">Change pressing</span><span class="vbtn">Add note or condition</span><span class="vbtn">See on Discogs ↗</span></div>
        <div class="vattr">Data provided by <a>Discogs</a>. Live Louder uses Discogs' API but isn't affiliated with, sponsored or endorsed by Discogs.</div></div></div></div>`;
      document.body.appendChild(m);
    },
    spinPost() {
      const r = col.find(x => x.a === 'Silverchair') || col[0];
      const u = (window.ACC && ACC.profile()) || {}; const av = u.avatar_url || '';
      return `<ul class="ffeed"><li class="fi fpost"><span class="fav sm"><img src="${esc(av)}" alt=""></span><div class="ft"><p><a class="fwho">Mick01</a> is spinning <span class="fwhen">2m</span></p>
        <p class="pbody">Pre-gig warm up 🤘</p><a class="fgcard"><span class="fgimg" style="background-image:url('${esc(r.img)}')"></span><span><strong>${esc(r.t)}</strong><small>${esc(r.a)} · ${flag(r.country)}${esc(r.year)} ${esc(r.label)} pressing</small></span></a>
        <div class="pacts"><span class="pact on">♥ <span>5</span></span><span class="pact">💬 2 replies</span></div></div></li></ul>`;
    },
    wants() {
      tabs('records');
      const sw = (D.vers || []).find(v => v.country === 'Japan');
      body().innerHTML = sub('w') + `<div class="valert"><img src="${esc(wants[0].img)}" alt=""><div style="flex:1"><b>2 records on your wantlist are in stock at Heathen Records ${ex()}</b><small>We'll email you when anything else on your wantlist comes in.</small></div><span class="vbtn red">Shop them →</span></div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;align-items:start"><div class="vgrid">${wants.map(r => `<div class="vcard"><div class="cv"><img src="${esc(r.img)}" alt=""><div class="tags"><span class="vb vstock">✓ In stock at Heathen</span></div></div><strong>${esc(r.t)}</strong><span class="m">${esc(r.a)}</span><span class="m">New pressing · ships today</span></div>`).join('')}
          ${sw ? `<div class="vcard"><div class="cv"><img src="${esc(sw.img)}" alt=""><div class="tags">${badge(sw.have, sw.want)}</div></div><strong>The Life Of A Showgirl</strong><span class="m">Taylor Swift</span><span class="m">🇯🇵 Japan · 2025 · Your grail</span></div>` : ''}</div>
        <div><div class="vmail"><div class="hd">LIVE <span>LOUDER</span></div><div class="bd"><p style="margin:0 0 8px;font-size:13px;color:#e2391f;font-weight:700;text-transform:uppercase">On your wantlist</p><h3 style="margin:0 0 10px;font:700 22px Helvetica">Superunknown is in stock</h3><img src="${esc(wants[0].img)}" alt=""><p style="font-size:14px">Good news, Mick. Soundgarden's <b>Superunknown</b> just landed at Heathen Records.</p><span class="btn2">Get it before it's gone</span></div></div><p class="note" style="text-align:center">The email they get</p></div></div>`;
    },
    match() {
      const u = (window.ACC && ACC.profile()) || {};
      const box = document.getElementById('uBody') || document.getElementById('pBody');
      box.insertAdjacentHTML('afterbegin', `<div class="vmatch"><div class="vring"><div><span><b>72%</b><small>match</small></span></div></div><div style="flex:1"><b style="font-size:18px">You and Sam are a 72% match ${ex('Example friend')}</b>
        <ul><li><b>18</b> records you both own</li><li><b>6</b> artists you've both seen live</li><li><b>3</b> records you both want</li><li><b>2</b> gigs you're both going to</li></ul>
        <div class="vcov">${col.slice(0, 7).map(r => `<img src="${esc(r.img)}" alt="">`).join('')}</div></div><span class="vbtn">See what you share →</span></div>`);
    },
    close() { const m = document.getElementById('vmodal'); if (m) m.remove(); },
  };
})();
