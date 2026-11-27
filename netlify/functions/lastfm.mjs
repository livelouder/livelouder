// One-click start: a person's most-played artists from Last.fm (?u=<Last.fm username>), so they can follow them all at once.
// Needs LASTFM_API_KEY in Netlify (free key from https://www.last.fm/api/account/create). Public listening data only.
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });

export default async (req) => {
  const u = (new URL(req.url).searchParams.get("u") || "").trim();
  if (!/^[A-Za-z][\w-]{1,30}$/.test(u)) return json({ error: "That doesn't look like a Last.fm username." }, 400);
  const key = String(process.env.LASTFM_API_KEY || "").replace(/[^A-Za-z0-9]/g, "");
  if (!key) return json({ error: "Last.fm import isn't switched on yet. Try again soon." }, 503);
  const fetchTop = async (period) => {
    const r = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${encodeURIComponent(u)}&period=${period}&limit=150&format=json&api_key=${key}`,
      { headers: { "user-agent": "LiveLouder/1.0 (livelouder.com.au)" } });
    const j = await r.json().catch(() => ({}));
    if (j.error) throw new Error(j.error === 6 ? "We couldn't find that Last.fm user." : "Last.fm didn't answer. Try again in a minute.");
    return ((j.topartists || {}).artist || []).map((a) => ({ name: a.name, plays: Number(a.playcount) || 0 }));
  };
  try {
    const [all, recent] = await Promise.all([fetchTop("overall"), fetchTop("6month")]);
    const seen = new Set(), out = [];
    for (const a of [...recent, ...all]) { const k = a.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(a); } }
    return json({ user: u, artists: out.slice(0, 200) });
  } catch (e) {
    return json({ error: e.message }, 404);
  }
};
