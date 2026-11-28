/* Festivals page: list on the left, map on the right (Leaflet + CARTO tiles).
   Moving the map filters the list to what's on screen; month chips filter both; state chips zoom. */
(function () {
  var el = document.getElementById('fmap'), dataEl = document.getElementById('festdata');
  if (!el || !dataEl || !window.L) return;
  var fests = JSON.parse(dataEl.textContent), L = window.L;
  var dark = document.documentElement.dataset.theme === 'dark' ||
    (document.documentElement.dataset.theme !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  var map = L.map(el, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: false, minZoom: 3 });
  // OpenStreetMap's own tiles (no key needed); darkened with a CSS filter in dark mode.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  if (dark) el.classList.add('fdark');
  el.addEventListener('click', function () { map.scrollWheelZoom.enable(); }, { once: true });

  var AU = L.latLngBounds([-43.8, 112.5], [-10.5, 154]);
  var STATES = { NSW: [[-37.6, 141], [-28.1, 153.7]], VIC: [[-39.2, 140.9], [-33.9, 150]], QLD: [[-29.2, 137.9], [-10.6, 153.6]],
    WA: [[-35.2, 112.9], [-13.6, 129]], SA: [[-38.1, 129], [-25.9, 141]], TAS: [[-43.7, 144.5], [-39.5, 148.5]],
    ACT: [[-35.95, 148.75], [-35.1, 149.4]], NT: [[-26, 129], [-10.9, 138]] };

  var items = {}, markers = {}, month = '';
  document.querySelectorAll('.flist .fxi').forEach(function (li) { items[li.dataset.slug] = li; });
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var root = document.body.dataset.root || '/';

  fests.forEach(function (f) {
    markers[f.slug] = [];
    f.places.forEach(function (p) {
      if (!p.ll) return;
      var m = L.circleMarker(p.ll, { radius: 8, color: '#fff', weight: 2, fillColor: '#e2391f', fillOpacity: 1 });
      var d = new Date(p.date + 'T12:00:00');
      m.bindPopup('<a class="fpop" href="' + root + 'festivals/' + f.slug + '.html"><strong>' + esc(f.name) + '</strong><br>' +
        esc(p.site) + ', ' + esc(p.town) + '<br>' + d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) +
        '<br><span>Line-up &amp; guide →</span></a>');
      m.bindTooltip(f.name, { direction: 'top', offset: [0, -6] });
      m.on('click', function () { pick(f.slug, false); });
      m.on('mouseover', function () { hi(f.slug, true); });
      m.on('mouseout', function () { hi(f.slug, false); });
      m.addTo(map);
      markers[f.slug].push(m);
    });
  });

  function hi(slug, on) {
    (markers[slug] || []).forEach(function (m) { m.setStyle({ radius: on ? 12 : 8, fillColor: on ? '#141414' : '#e2391f' }); if (on) m.bringToFront(); });
    if (items[slug]) items[slug].classList.toggle('hot', on);
  }
  function pick(slug, fly) {
    var li = items[slug];
    if (li) { li.classList.add('hot'); li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setTimeout(function () { li.classList.remove('hot'); }, 1600); }
    var ms = markers[slug] || [];
    if (fly && ms.length) {
      if (ms.length === 1) map.flyTo(ms[0].getLatLng(), 9, { duration: 0.8 });
      else map.flyToBounds(L.latLngBounds(ms.map(function (m) { return m.getLatLng(); })).pad(0.3), { duration: 0.8 });
      ms[0].openPopup();
    }
  }
  function visible(f) {
    if (month && f.first.slice(0, 7) !== month) return false;
    var b = map.getBounds();
    var ms = markers[f.slug] || [];
    return !ms.length || ms.some(function (m) { return b.contains(m.getLatLng()); });
  }
  var count = document.querySelector('.fcount');
  function update() {
    var n = 0, total = 0;
    fests.forEach(function (f) {
      var inMonth = !month || f.first.slice(0, 7) === month;
      if (inMonth) total++;
      var v = visible(f);
      if (v) n++;
      if (items[f.slug]) items[f.slug].hidden = !v;
      (markers[f.slug] || []).forEach(function (m) { m.setStyle({ opacity: inMonth ? 1 : 0, fillOpacity: inMonth ? 1 : 0 }); });
    });
    var zoomedIn = n < total;
    count.innerHTML = n + (n === 1 ? ' festival' : ' festivals') + (zoomedIn ? ' in this area · <button type="button" class="linkish" data-z="AU">Show all ' + total + '</button>' : '');
  }
  map.on('moveend', update);
  map.fitBounds(AU);

  document.querySelectorAll('.fctl [data-m]').forEach(function (b) {
    b.addEventListener('click', function () {
      month = b.dataset.m;
      document.querySelectorAll('.fctl [data-m]').forEach(function (x) { x.classList.toggle('on', x === b); });
      update();
    });
  });
  document.addEventListener('click', function (ev) {
    var z = ev.target.closest && ev.target.closest('[data-z]');
    if (z) { var s = STATES[z.dataset.z]; map.flyToBounds(s ? L.latLngBounds(s) : AU, { duration: 0.7 }); return; }
    var pin = ev.target.closest && ev.target.closest('.fxpin');
    if (pin) { var li = pin.closest('.fxi'); pick(li.dataset.slug, true); if (window.innerWidth < 900) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  Object.keys(items).forEach(function (slug) {
    items[slug].addEventListener('mouseenter', function () { hi(slug, true); });
    items[slug].addEventListener('mouseleave', function () { hi(slug, false); });
  });
  update();
})();
