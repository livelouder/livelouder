// Powers the record shelves on My gigs. Reads a Discogs user's PUBLIC collection and wantlist,
// or one release's details for the record view. Nothing is stored.
//   /.netlify/functions/discogs-user?u=<discogs username>
//   /.netlify/functions/discogs-user?release=<release id>
//   /.netlify/functions/discogs-user?master=<master id>        (an album: all its pressings share one master)
//   /.netlify/functions/discogs-user?q=<search>                 (find records to add to a Live Louder collection)
const UA = "LiveLouder/1.0 +https://livelouder.com.au";
const headers = () => ({ "User-Agent": UA, ...(process.env.DISCOGS_TOKEN ? { Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}` } : {}) });
const clean = (n) => (n || "").replace(/\s\(\d+\)$/, "").replace(/\*$/, "");

async function pages(path, max) {
  const out = [];
  let status = 200;
  for (let p = 1; p <= max; p++) {
    const r = await fetch(`https://api.discogs.com${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${p}`, { headers: headers() });
    status = r.status;
    if (!r.ok) break;
    const j = await r.json();
    for (const it of j.releases || j.wants || []) {
      const b = it.basic_information || {};
      out.push({
        a: (b.artists || []).map((a) => clean(a.name)).join(" & "),
        t: b.title || "", y: b.year || 0,
        img: b.cover_image || b.thumb || "", th: b.thumb || "",
        id: b.id || it.id, rid: "r" + (b.id || it.id),
        l: ((b.labels || [])[0] || {}).name || "",
        f: [...new Set((b.formats || []).map((f) => f.name))].join(", "),
        fd: ((b.formats || [])[0] || {}).descriptions?.slice(0, 3).join(", ") || "",
        g: (b.styles && b.styles.length ? b.styles : b.genres || []).slice(0, 2).join(", "),
        add: (it.date_added || "").slice(0, 10),
      });
    }
    if (!j.pagination || p >= j.pagination.pages) break;
  }
  return { items: out, status };
}

const json = (body, code = 200, cache = "public, max-age=1800") =>
  new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json", "cache-control": cache } });

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const search = (q.get("q") || "").trim().slice(0, 100);
  if (search) {
    const params = new URLSearchParams({ q: search, type: "master", per_page: "30" });
    const r = await fetch(`https://api.discogs.com/database/search?${params}`, { headers: headers() });
    if (!r.ok) return json({ error: "Search isn't working right now. Try again in a minute." }, 502, "no-store");
    const j = await r.json();
    const seen = new Set();
    const results = (j.results || []).map((x) => {
      const [artist, ...rest] = (x.title || "").split(" - ");
      return { rid: "m" + x.id, a: clean(artist), t: rest.join(" - ") || x.title, y: +x.year || 0, img: x.cover_image || x.thumb || "",
               g: [...(x.style || []), ...(x.genre || [])].slice(0, 2).join(", "), f: (x.format || []).slice(0, 2).join(", "),
               have: x.community?.have || 0 };
    }).filter((x) => { const k = (x.a + "|" + x.t).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.have - a.have);
    return json({ results }, 200, "public, max-age=3600");
  }
  const mid = (q.get("master") || "").trim();
  if (mid) {
    if (!/^\d{1,12}$/.test(mid)) return json({ error: "Bad master" }, 400, "no-store");
    const r = await fetch(`https://api.discogs.com/masters/${mid}`, { headers: headers() });
    if (!r.ok) return json({ error: "Couldn't load that record from Discogs." }, r.status, "no-store");
    const j = await r.json();
    return json({
      id: j.id, title: j.title, artist: (j.artists || []).map((a) => clean(a.name)).join(" & "), year: j.year || 0, country: "", released: "",
      labels: [], formats: [], genres: [...(j.genres || []), ...(j.styles || [])].slice(0, 5),
      image: ((j.images || []).find((i) => i.type === "primary") || (j.images || [])[0] || {}).uri || "",
      tracks: (j.tracklist || []).filter((t) => t.type_ !== "heading").map((t) => [t.position || "", t.title || "", t.duration || ""]).slice(0, 40),
      have: 0, want: 0, url: j.uri || `https://www.discogs.com/master/${j.id}`, versions: j.num_for_sale || 0,
    }, 200, "public, max-age=86400");
  }
  const rel = (q.get("release") || "").trim();
  if (rel) {
    if (!/^\d{1,12}$/.test(rel)) return json({ error: "Bad release" }, 400, "no-store");
    const r = await fetch(`https://api.discogs.com/releases/${rel}`, { headers: headers() });
    if (!r.ok) return json({ error: "Couldn't load that record from Discogs." }, r.status, "no-store");
    const j = await r.json();
    return json({
      id: j.id, title: j.title, artist: (j.artists || []).map((a) => clean(a.name)).join(" & "), year: j.year || 0,
      country: j.country || "", released: j.released_formatted || "",
      labels: (j.labels || []).map((l) => `${l.name}${l.catno && l.catno !== "none" ? " · " + l.catno : ""}`).slice(0, 3),
      formats: (j.formats || []).map((f) => [f.qty && f.qty !== "1" ? f.qty + "×" : "", f.name, (f.descriptions || []).join(", "), f.text || ""].filter(Boolean).join(" ")).slice(0, 3),
      genres: [...(j.genres || []), ...(j.styles || [])].slice(0, 5),
      image: ((j.images || []).find((i) => i.type === "primary") || (j.images || [])[0] || {}).uri || "",
      tracks: (j.tracklist || []).filter((t) => t.type_ !== "heading").map((t) => [t.position || "", t.title || "", t.duration || ""]).slice(0, 40),
      have: j.community?.have || 0, want: j.community?.want || 0,
      url: j.uri || `https://www.discogs.com/release/${j.id}`,
    }, 200, "public, max-age=86400");
  }
  const u = (q.get("u") || "").trim();
  if (!/^[A-Za-z0-9_.\-]{1,40}$/.test(u)) return json({ error: "Enter a Discogs username (letters, numbers, dots, dashes)." }, 400, "no-store");
  try {
    const [col, wants] = await Promise.all([
      pages(`/users/${encodeURIComponent(u)}/collection/folders/0/releases?sort=added&sort_order=desc`, 10),
      pages(`/users/${encodeURIComponent(u)}/wants`, 4),
    ]);
    if (col.status === 404 && wants.status === 404) return json({ error: "We couldn't find that Discogs user. Check the spelling." }, 404, "no-store");
    return json({ user: u, collection: col.items, wants: wants.items,
                  collectionPrivate: col.status === 401 || col.status === 403, wantsPrivate: wants.status === 401 || wants.status === 403 });
  } catch (e) {
    return json({ error: "Discogs didn't answer. Try again in a minute." }, 502, "no-store");
  }
};
