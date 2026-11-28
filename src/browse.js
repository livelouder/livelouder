/* Tours page and Artists A–Z: city picker (shared with the rest of the site via window.LL), search and filters. */
document.addEventListener('DOMContentLoaded', function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var root = document.body.dataset.root || '/';
  var getCity = function () { return (window.LL && window.LL.city()) || ''; };
  var setCity = function (c) { if (window.LL) window.LL.setCity(c); };
  // Keep the filter bar just under the site header.
  var top = document.querySelector('.top');
  var setH = function () { if (top) document.documentElement.style.setProperty('--hh', top.offsetHeight + 'px'); };
  setH(); window.addEventListener('resize', setH);
  var thisYear = new Date().getFullYear();
  var D = function (s) { return new Date(s + 'T12:00:00'); };
  var dShort = function (s) { return D(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); };
  var dLong = function (s) { return D(s).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }); };
  var mLabel = function (k, short) {
    if (k === '9999-99') return short ? 'TBA' : 'Dates to be announced';
    var d = new Date(+k.slice(0, 4), +k.slice(5) - 1, 1);
    if (short) return d.toLocaleDateString('en-AU', { month: 'short' }) + (d.getFullYear() !== thisYear ? ' ' + String(d.getFullYear()).slice(2) : '');
    return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  };
  var chipGroup = function (el, attr, cb) {
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      el.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      cb(b.dataset[attr] || '', b);
    });
  };

  /* ---------------- Tours ---------------- */
  var tdata = document.getElementById('tourdata');
  if (tdata) {
    var T = JSON.parse(tdata.textContent);
    var list = document.getElementById('tlist'), sel = document.getElementById('tcity'), q = document.getElementById('tq');
    var months = document.getElementById('tmonths'), count = document.getElementById('tcount');
    var genre = '';
    var c0 = getCity();
    if (c0 && [].some.call(sel.options, function (o) { return o.value === c0; })) sel.value = c0;
    var card = function (x, city) {
      var my = city ? x.d.filter(function (r) { return r[1] === city; }) : [];
      var img = x.p ? '<a class="tc2i" href="' + root + 'artists/' + x.s + '.html" style="background-image:url(&quot;' + esc(x.p) + '&quot;)" aria-hidden="true" tabindex="-1"></a>'
        : '<a class="tc2i tc2n" href="' + root + 'artists/' + x.s + '.html" aria-hidden="true" tabindex="-1">' + (window.LLPOSTER ? LLPOSTER.big(x.n, x.gs) : '') + '</a>';
      var cs = []; x.d.forEach(function (r) { if (cs.indexOf(r[1]) < 0) cs.push(r[1]); });
      var when, more, btn;
      if (my.length) {
        when = '<b>' + esc(dLong(my[0][0])) + '</b> · ' + esc(my[0][2]) + (my.length > 1 ? ' <span class="tc2x">+' + (my.length - 1) + ' more ' + (my.length === 2 ? 'show' : 'shows') + '</span>' : '');
        var others = cs.filter(function (c) { return c !== city; });
        more = others.length ? 'Also ' + others.slice(0, 3).join(', ') + (others.length > 3 ? ' +' + (others.length - 3) : '') : 'Only ' + city + ' show';
        btn = my[0][3] ? '<a class="tc2btn" href="' + esc(my[0][3]) + '" rel="noopener" data-tk="tickets" data-artist="' + esc(x.n) + '" data-venue="' + esc(my[0][2]) + '" data-city="' + esc(city) + '">Tickets ↗</a>'
          : '<a class="tc2btn" href="' + root + 'artists/' + x.s + '.html">Dates &amp; tickets</a>';
      } else {
        when = x.d.length ? '<b>' + esc(dShort(x.d[0][0]) + (x.d[x.d.length - 1][0] !== x.d[0][0] ? ' – ' + dShort(x.d[x.d.length - 1][0]) : '')) + '</b>' : '<b>Dates to be announced</b>';
        more = x.d.length ? cs.length + (cs.length === 1 ? ' city: ' : ' cities: ') + cs.slice(0, 3).join(', ') + (cs.length > 3 ? ' +' + (cs.length - 3) : '') : '';
        btn = '<a class="tc2btn" href="' + root + 'artists/' + x.s + '.html">Dates &amp; tickets</a>';
      }
      return '<article class="tc2">' + img + '<div class="tc2b"><h3><a href="' + root + 'artists/' + x.s + '.html">' + esc(x.n) + '</a></h3><p class="tc2t">' + esc(x.t) +
        '</p><p class="tc2d">' + when + (x.so ? '<span class="tc2so">Sold out</span>' : '') + '</p><p class="tc2m">' + esc(more) + '</p>' + btn + '</div></article>';
    };
    var render = function () {
      var city = sel.value, text = q.value.trim().toLowerCase(), groups = {}, n = 0;
      T.forEach(function (x) {
        if (genre && x.g !== genre) return;
        var rows = city ? x.d.filter(function (r) { return r[1] === city; }) : x.d;
        if (city && !rows.length) return;
        if (text && (x.n + ' ' + x.t + ' ' + x.d.map(function (r) { return r[1] + ' ' + r[2]; }).join(' ')).toLowerCase().indexOf(text) < 0) return;
        var k = rows.length ? rows[0][0].slice(0, 7) : '9999-99';
        (groups[k] = groups[k] || []).push({ x: x, k: rows.length ? rows[0][0] : '9999' });
        n++;
      });
      var keys = Object.keys(groups).sort();
      list.innerHTML = keys.map(function (k) {
        var g = groups[k].sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; });
        return '<section class="tmon" id="m-' + k + '"><h2>' + mLabel(k) + '</h2><div class="tgrid">' + g.map(function (o) { return card(o.x, city); }).join('') + '</div></section>';
      }).join('') || '<p class="note">No tours match. Try another city or search.</p>';
      months.innerHTML = keys.map(function (k) { return '<button type="button" data-k="' + k + '">' + mLabel(k, true) + '</button>'; }).join('');
      count.textContent = n + (n === 1 ? ' tour' : ' tours') + (city ? ' coming to ' + city : ' coming to Australia') + (city ? ' · we’ll remember your city' : '');
    };
    sel.addEventListener('change', function () { setCity(sel.value); render(); });
    q.addEventListener('input', render);
    chipGroup(document.getElementById('tgen'), 'g', function (g) { genre = g; render(); });
    months.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var s = document.getElementById('m-' + b.dataset.k);
      if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    render();
  }

  /* ---------------- Artists A–Z ---------------- */
  var azbar = document.getElementById('azbar');
  if (azbar) {
    var tiles = [].slice.call(document.querySelectorAll('.azt')), secs = [].slice.call(document.querySelectorAll('.azsec'));
    var aq = document.getElementById('azq'), acount = document.getElementById('azcount'), none = document.getElementById('aznone');
    var soon = azbar.dataset.soon, today = new Date().toISOString().slice(0, 10), mode = '', ag = '';
    var nearBtn = azbar.querySelector('[data-f="near"]');
    var nearCity = function () { return getCity() || (window.LL && window.LL.guess()) || ''; };
    if (nearCity()) nearBtn.textContent = '📍 ' + nearCity(); else nearBtn.hidden = true;
    var apply = function () {
      var text = aq.value.trim().toLowerCase(), city = nearCity(), n = 0;
      tiles.forEach(function (t) {
        var ok = true, nx = t.dataset.next;
        if (text && t.dataset.n.indexOf(text) < 0) ok = false;
        if (ok && mode === 'soon') ok = !!nx && nx >= today && nx <= soon;
        if (ok && mode === 'tour') ok = t.dataset.tour === '1';
        if (ok && mode === 'near') ok = !!city && ('|' + t.dataset.c + '|').indexOf('|' + city + '|') >= 0;
        if (ok && ag) ok = t.dataset.g === ag;
        t.hidden = !ok; if (ok) n++;
      });
      secs.forEach(function (s) { s.hidden = !s.querySelector('.azt:not([hidden])'); });
      azbar.querySelectorAll('.azl a').forEach(function (a) { var s = document.querySelector(a.getAttribute('href')); a.classList.toggle('off', !s || s.hidden); });
      acount.textContent = n.toLocaleString() + (n === 1 ? ' artist' : ' artists') + (mode === 'near' && city ? ' playing ' + city : '');
      none.hidden = n > 0;
    };
    azbar.querySelector('#azf').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      azbar.querySelectorAll('#azf button').forEach(function (x) { x.classList.toggle('on', x === b); });
      mode = b.dataset.f || ''; ag = b.dataset.g || '';
      if (b.dataset.g) mode = '';
      apply();
    });
    aq.addEventListener('input', apply);
  }
});
