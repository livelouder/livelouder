// Powers "My gigs": loads a Discogs user's PUBLIC collection and wantlist (artist, title, year, cover),
// so the page can show which of their artists are touring. Nothing is stored.
// Called as /.netlify/functions/discogs-user?u=<discogs username>
const UA = "LiveLouder/1.0 +https://livelouder.com.au";

async function pages(path, max) {
  const token = process.env.DISCOGS_TOKEN;
  const headers = { "User-Agent": UA, ...(token ? { Authorization: `Discogs token=${token}` } : {}) };
  const out = [];
  let status = 200;
  for (let p = 1; p <= max; p++) {
    const r = await fetch(`https://api.discogs.com${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${p}`, { headers });
    status = r.status;
    if (!r.ok) break;
    const j = await r.json();
    const items = j.releases || j.wants || [];
    for (const it of items) {
      const b = it.basic_information || {};
      const artist = (b.artists || []).map((a) => (a.name || "").replace(/\s\(\d+\)$/, "").replace(/\*$/, "")).join(" & ");
      out.push({ a: artist, t: b.title || "", y: b.year || 0, img: b.thumb || "", id: b.id || it.id });
    }
    if (!j.pagination || p >= j.pagination.pages) break;
  }
  return { items: out, status };
}

export default async (req) => {
  const u = (new URL(req.url).searchParams.get("u") || "").trim();
  const json = (body, code = 200, cache = "public, max-age=1800") =>
    new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json", "cache-control": cache } });
  if (!/^[A-Za-z0-9_.\-]{1,40}$/.test(u)) return json({ error: "Enter a Discogs username (letters, numbers, dots, dashes)." }, 400, "no-store");
  try {
    const [col, wants] = await Promise.all([pages(`/users/${encodeURIComponent(u)}/collection/folders/0/releases?sort=artist`, 6),
                                            pages(`/users/${encodeURIComponent(u)}/wants`, 3)]);
    if (col.status === 404 && wants.status === 404) return json({ error: "We couldn't find that Discogs user. Check the spelling." }, 404, "no-store");
    return json({ user: u, collection: col.items, wants: wants.items,
                  collectionPrivate: col.status === 401 || col.status === 403, wantsPrivate: wants.status === 401 || wants.status === 403 });
  } catch (e) {
    return json({ error: "Discogs didn't answer. Try again in a minute." }, 502, "no-store");
  }
};
