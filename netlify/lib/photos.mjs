// Shared bits for profile photos: the database client, signed review links, and the "photo to check" email.
// Needs SUPABASE_SECRET_KEY and RESEND_API_KEY. Review emails go to MODERATION_EMAIL (default Mick's address).
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const SITE = "https://livelouder.com.au";
export const SB_URL = "https://qoqdouthyyaebmreavgz.supabase.co";
export const PUBLIC_PREFIX = `${SB_URL}/storage/v1/object/public/profile/`;
const FROM = "Live Louder <hello@livelouder.com.au>";
const TO = () => process.env.MODERATION_EMAIL || "mick@heathenrecords.com.au";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const admin = () => createClient(SB_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
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
