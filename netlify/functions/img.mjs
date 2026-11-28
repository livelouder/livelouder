// Passes a record cover or artist photo through Live Louder so the browser can draw it into a
// "Share my crate" picture (Discogs and Deezer images can't be used in a canvas directly).
// Only these image hosts are allowed. Kept for at most 6 hours, as Discogs asks.
const HOSTS = ["i.discogs.com", "cdn-images.dzcdn.net", "cdn.shopify.com", "heathenrecords.com.au"];
export default async (req) => {
  const u = new URL(req.url).searchParams.get("u") || "";
  let t;
  try { t = new URL(u); } catch (e) { return new Response("bad url", { status: 400 }); }
  if (t.protocol !== "https:" || !HOSTS.includes(t.hostname)) return new Response("not allowed", { status: 403 });
  const r = await fetch(t, { headers: { "User-Agent": "LiveLouder/1.0 (+https://livelouder.com.au)" } });
  const type = r.headers.get("content-type") || "";
  if (!r.ok || !type.startsWith("image/")) return new Response("not found", { status: 404 });
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 3 * 1024 * 1024) return new Response("too big", { status: 413 });
  return new Response(buf, { headers: { "content-type": type, "cache-control": "public, max-age=21600", "access-control-allow-origin": "*" } });
};
