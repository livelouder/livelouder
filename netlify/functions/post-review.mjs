// Mick's page for a reported post or reply, opened from the "Post reported" email.
// GET shows it; the buttons (POST) remove it, put it back, or stop that person posting.
// (Buttons rather than plain links, so email scanners that open links can't trigger anything.)
import { db, eq, esc, SITE } from "../lib/photos.mjs";
import { signPost } from "../lib/messages.mjs";
import crypto from "node:crypto";

const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const page = (title, body) => new Response(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} | Live Louder</title>
<style>body{margin:0;background:#f6f5f2;color:#141414;font:16px/1.5 Helvetica,Arial,sans-serif}header{background:#141414;border-bottom:6px solid #e2391f;padding:16px 24px;font:700 24px Impact,Arial Narrow,sans-serif;color:#fff;letter-spacing:.02em}header b{color:#e2391f}
main{max-width:640px;margin:0 auto;padding:24px}form{display:inline}button{min-height:46px;padding:0 20px;margin:6px 8px 6px 0;border-radius:999px;border:2px solid #141414;background:#fff;font:700 15px Helvetica,Arial,sans-serif;cursor:pointer}
button.rm{background:#e2391f;border-color:#e2391f;color:#fff}.note{color:#6b665e;font-size:14px}.msg{background:#fff;border-left:4px solid #e2391f;padding:12px 14px;white-space:pre-wrap;border-radius:4px}</style></head>
<body><header>LIVE <b>LOUDER</b></header><main>${body}</main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

export default async (req) => {
  const q = req.method === "POST" ? new URLSearchParams(await req.text()) : new URL(req.url).searchParams;
  const rid = q.get("r") || "", sig = q.get("s") || "";
  if (!/^\d+$/.test(rid) || !same(sig, signPost(rid))) return page("Link not valid", "<h1>That link isn't valid</h1><p>Open the review button from the email again.</p>");
  const { data: rep } = await db.one("post_reports", `select=kind,target,owner,body,reason&id=eq.${rid}`);
  if (!rep) return page("Gone", "<h1>This report has gone</h1><p>The post or the account was probably deleted. Nothing to do.</p>");
  const table = rep.kind === "post" ? "posts" : "post_replies";
  const [{ data: x }, { data: p }, { data: ban }] = await Promise.all([
    db.one(table, `select=id,status,body&id=eq.${rep.target}`),
    db.one("profiles", `select=username&id=${eq(rep.owner)}`),
    db.one("post_bans", `select=user_id&user_id=${eq(rep.owner)}`)]);
  const prof = p && p.username ? `<a href="${SITE}/u/${esc(p.username)}">@${esc(p.username)}</a>` : "this person";
  const hidden = `<input type="hidden" name="r" value="${rid}"><input type="hidden" name="s" value="${sig}">`;
  const btn = (a, cls, label) => `<form method="post">${hidden}<input type="hidden" name="a" value="${a}"><button class="${cls}">${label}</button></form>`;

  if (req.method === "POST") {
    const a = q.get("a");
    if (a === "remove" && x) { await db.update(table, `id=eq.${x.id}`, { status: "removed" }); return page("Removed", `<h1>Removed ✓</h1><p>Nobody can see it now, including ${prof}.</p>${ban ? "" : btn("ban", "", "Also stop them posting")}`); }
    if (a === "keep" && x) { await db.update(table, `id=eq.${x.id}`, { status: "approved" }); return page("Kept", `<h1>Put back ✓</h1><p>It's showing again, and new reports about it won't hide it.</p>`); }
    if (a === "ban") { await db.upsert("post_bans", { user_id: rep.owner }); if (x) await db.update(table, `id=eq.${x.id}`, { status: "removed" });
      return page("Stopped", `<h1>Stopped ✓</h1><p>${prof} can't post or reply any more, and this ${rep.kind} is removed. They can still use the rest of Live Louder.</p>${btn("unban", "", "Undo: let them post again")}`); }
    if (a === "unban") { await db.remove_rows("post_bans", `user_id=${eq(rep.owner)}`); return page("Allowed", `<h1>Done ✓</h1><p>${prof} can post again.</p>`); }
  }
  const { count } = await db.count("post_reports", `owner=${eq(rep.owner)}`);
  const status = !x ? "It's already been deleted." : x.status === "removed" ? "It's removed." : x.status === "approved" ? "You kept it earlier, so it's showing." : x.status === "hidden" ? "It's hidden while you decide." : "It's showing.";
  return page(`Reported ${rep.kind}`, `<h1>${rep.kind === "post" ? "Post" : "Reply"} from ${prof}</h1>
<p class="msg">${esc(rep.body)}</p><p class="note">Reason given: ${esc(rep.reason)} · ${count} ${count === 1 ? "report" : "reports"} about this person in total. ${status}</p>
${x && x.status !== "removed" ? btn("remove", "rm", "Remove it") + (x.status !== "approved" ? btn("keep", "", "It's fine, put it back") : "") : ""}
${ban ? `<p><b>They're already stopped from posting.</b></p>${btn("unban", "", "Let them post again")}` : btn("ban", "", "Remove it and stop them posting")}
<p class="note">For anything threatening, the person can also report it to the police or the eSafety Commissioner (esafety.gov.au).</p>`);
};
