// Shared bits for profile photos: the database client, signed review links, and the "photo to check" email.
// Needs SUPABASE_SECRET_KEY and RESEND_API_KEY. Review emails go to MODERATION_EMAIL (default Mick's address).
import crypto from "node:crypto";

export const SITE = "https://livelouder.com.au";
export const SB_URL = "https://qoqdouthyyaebmreavgz.supabase.co";
export const PUBLIC_PREFIX = `${SB_URL}/storage/v1/object/public/profile/`;
const FROM = "Live Louder <hello@livelouder.com.au>";
const TO = () => process.env.MODERATION_EMAIL || "mick@heathenrecords.com.au";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
// Direct calls to Supabase with the secret key in the "apikey" header (how Supabase's newer secret keys are meant to be sent).
async function call(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const rawKey = String(process.env.SUPABASE_SECRET_KEY || "");
  const key = rawKey.replace(/[^A-Za-z0-9_.-]/g, "");
  if (!call.logged) { call.logged = 1; const odd = [...rawKey].filter(c => !/[A-Za-z0-9_.-]/.test(c)).map(c => "U+" + c.codePointAt(0).toString(16)); console.log("key check: length", key.length, "(raw", rawKey.length + ")", "removed", odd.join(" ") || "nothing", "underscores at", [...key].map((c, i) => c === "_" ? i : -1).filter(i => i >= 0).join(",")); }
  const r = await fetch(SB_URL + path, { method, body, headers: Object.assign({ apikey: key }, headers) });
  if (!r.ok) { const t = await r.text(); console.log("supabase", method, path.split("?")[0], r.status, t.slice(0, 200)); return { error: t || String(r.status), status: r.status }; }
  if (raw) return { response: r };
  const t = await r.text();
  return { data: t ? JSON.parse(t) : null, count: Number((r.headers.get("content-range") || "").split("/")[1]) || 0 };
}
const J = { "content-type": "application/json" };
export const db = {
  // rows: db.select("profiles", "select=username&id=eq.123")
  select: (table, q) => call(`/rest/v1/${table}?${q}`),
  one: async (table, q) => { const r = await call(`/rest/v1/${table}?${q}&limit=1`); return { data: r.data && r.data[0] || null, error: r.error }; },
  count: (table, q) => call(`/rest/v1/${table}?select=*&${q}`, { method: "HEAD", headers: { Prefer: "count=exact" } }),
  insert: (table, row) => call(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(row), headers: { ...J, Prefer: "return=minimal" } }),
  upsert: (table, row) => call(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(row), headers: { ...J, Prefer: "return=minimal,resolution=merge-duplicates" } }),
  update: (table, q, patch) => call(`/rest/v1/${table}?${q}`, { method: "PATCH", body: JSON.stringify(patch), headers: { ...J, Prefer: "return=minimal" } }),
  upload: (path, buf) => call(`/storage/v1/object/profile/${path}`, { method: "POST", body: buf, headers: { "content-type": "image/jpeg", "cache-control": "max-age=31536000", "x-upsert": "false" } }),
  remove: (paths) => call(`/storage/v1/object/profile`, { method: "DELETE", body: JSON.stringify({ prefixes: paths }), headers: J }),
  authUser: (id) => call(`/auth/v1/admin/users/${id}`),
};
export const eq = (v) => "eq." + encodeURIComponent(v);

export const KINDS = { avatar: "profile photo", banner: "cover photo" };

// Check the person's sign-in token directly with Supabase Auth (uses the public key; the token itself proves who they are).
const PUBLISHABLE = "sb_publishable_pL0ygBPAPtoIXzMi3e1lsQ_ytrBXiNY";
export async function userFrom(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: PUBLISHABLE, authorization: `Bearer ${token}` } });
    if (!r.ok) { console.log("auth check failed", r.status); return null; }
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) { console.log("auth check error", e.message); return null; }
}

// Review links are signed, so only someone with the email can act on them. Each link is for one exact photo.
export function sign(uid, kind, path) {
  return crypto.createHmac("sha256", process.env.SUPABASE_SECRET_KEY || "x").update(`photo-review|${uid}|${kind}|${path}`).digest("hex").slice(0, 40);
}
export const reviewLink = (uid, kind, path) =>
  `${SITE}/.netlify/functions/photo-review?u=${uid}&k=${kind}&p=${encodeURIComponent(path || "")}&s=${sign(uid, kind, path)}`;

export async function emailReview({ uid, kind, path, url, username, why, detail }) {
  if (!process.env.RESEND_API_KEY) return;
  const who = username ? `@${username}` : "someone";
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;color:#141414">
<p style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#e2391f;font-weight:bold">Live Louder · photo to check</p>
<h2 style="margin:6px 0 12px">${esc(who)}'s ${KINDS[kind]}: ${esc(why)}</h2>
${detail ? `<p style="color:#555">${esc(detail)}</p>` : ""}
${url ? `<p><img src="${esc(url)}" alt="" style="max-width:100%;${kind === "avatar" ? "width:240px;" : ""}border-radius:8px;border:1px solid #ddd"></p>` : ""}
<p>${why.startsWith("Reported") ? "It's hidden from everyone else until you decide." : "Only they can see it until you decide."}</p>
<p><a href="${reviewLink(uid, kind, path)}" style="display:inline-block;background:#e2391f;color:#fff;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:999px">Review this photo</a></p>
${username ? `<p style="font-size:13px;color:#777">Profile: <a href="${SITE}/u/${esc(username)}">${SITE.replace("https://", "")}/u/${esc(username)}</a></p>` : ""}</div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [TO()], subject: `Photo to check: ${who} (${why})`, html }),
  }).catch(() => {});
}
