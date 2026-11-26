// Mick's review page for a profile photo, opened from the "Photo to check" email.
// GET shows the photo with Keep / Remove / Remove and block buttons; the button press (POST) does it.
// (Buttons rather than plain links, so email scanners that open links can't trigger anything.)
import { admin, sign, esc, KINDS, SITE, PUBLIC_PREFIX } from "../lib/photos.mjs";
import crypto from "node:crypto";

const page = (title, body) => new Response(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} | Live Louder</title>
<style>body{margin:0;background:#f6f5f2;color:#141414;font:16px/1.5 Helvetica,Arial,sans-serif}header{background:#141414;border-bottom:6px solid #e2391f;padding:16px 24px;font:700 24px Impact,Arial Narrow,sans-serif;color:#fff;letter-spacing:.02em}header b{color:#e2391f}
main{max-width:640px;margin:0 auto;padding:24px}img{max-width:100%;border-radius:10px;border:1px solid #ddd}form{display:inline}button{min-height:46px;padding:0 20px;margin:6px 8px 6px 0;border-radius:999px;border:2px solid #141414;background:#fff;font:700 15px Helvetica,Arial,sans-serif;cursor:pointer}
button.keep{background:#141414;color:#fff}button.rm{background:#e2391f;border-color:#e2391f;color:#fff}.note{color:#6b665e;font-size:14px}</style></head>
<body><header>LIVE <b>LOUDER</b></header><main>${body}</main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default async (req) => {
  const q = req.method === "POST" ? new URLSearchParams(await req.text()) : new URL(req.url).searchParams;
  const uid = q.get("u") || "", kind = q.get("k") || "", path = q.get("p") || "", sig = q.get("s") || "";
  if (!/^[0-9a-f-]{36}$/.test(uid) || !KINDS[kind] || !same(sig, sign(uid, kind, path))) return page("Link not valid", "<h1>That link isn't valid</h1><p>Open the review button from the email again.</p>");
  const sb = admin();
  const { data: p } = await sb.from("profiles").select(`username, ${kind}_url, ${kind}_status`).eq("id", uid).maybeSingle();
  if (!p) return page("Account gone", "<h1>This account has been deleted</h1><p>Nothing to do.</p>");
  const current = p[`${kind}_url`], curPath = current && current.startsWith(PUBLIC_PREFIX) ? current.slice(PUBLIC_PREFIX.length) : "";
  if (curPath !== path) return page("Already changed", `<h1>Already changed</h1><p>@${esc(p.username)} has changed or removed this ${KINDS[kind]} since. If the new one is a problem, it'll come through as a new email when it's checked or reported.</p>`);
  let shown = current;
  if (!shown && kind === "avatar") { const { data } = await sb.auth.admin.getUserById(uid); shown = data && data.user && data.user.user_metadata && data.user.user_metadata.avatar_url; }
  const prof = p.username ? `<a href="${SITE}/u/${esc(p.username)}">@${esc(p.username)}</a>` : "this person";

  if (req.method === "POST") {
    const a = q.get("a");
    if (a === "keep") {
      await sb.from("profiles").update({ [`${kind}_status`]: "approved" }).eq("id", uid);
      return page("Kept", `<h1>Kept ✓</h1><p>${prof}'s ${KINDS[kind]} is showing again. Future reports on it will still be emailed to you, but won't hide it.</p>`);
    }
    if (a === "remove" || a === "block") {
      if (path) await sb.storage.from("profile").remove([path]);
      await sb.from("profiles").update({ [`${kind}_url`]: null, [`${kind}_status`]: path ? "ok" : "hidden" }).eq("id", uid);
      if (a === "block") await sb.from("photo_blocks").upsert({ user_id: uid });
      return page("Removed", `<h1>Removed ✓</h1><p>${prof}'s ${KINDS[kind]} has been taken down${a === "block" ? ", and they can't upload photos any more. (To undo the block, delete their row from the photo_blocks table in Supabase.)" : "."}</p>`);
    }
  }
  const status = { ok: "Showing", approved: "Showing (you kept it before)", pending: "Waiting for you: only they can see it", hidden: "Hidden after a report" }[p[`${kind}_status`]] || "";
  const hidden = `<input type="hidden" name="u" value="${uid}"><input type="hidden" name="k" value="${kind}"><input type="hidden" name="p" value="${esc(path)}"><input type="hidden" name="s" value="${sig}">`;
  const btn = (a, cls, label) => `<form method="post">${hidden}<input type="hidden" name="a" value="${a}"><button class="${cls}">${label}</button></form>`;
  return page("Check a photo", `<h1>${prof}'s ${KINDS[kind]}</h1><p class="note">${esc(status)}</p>
${shown ? `<p><img src="${esc(shown)}" alt="" style="${kind === "avatar" ? "width:280px" : ""}"></p>` : "<p>(No photo to show.)</p>"}
${btn("keep", "keep", "Keep it")}${btn("remove", "rm", "Remove it")}${btn("block", "", "Remove and block uploads")}
<p class="note">Keep it: the photo shows to everyone. Remove it: the photo is deleted (they can upload another). Block: deleted, and they can't upload photos again.</p>`);
};
