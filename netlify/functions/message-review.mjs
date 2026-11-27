// Mick's page for a reported message, opened from the "Message reported" email.
// GET shows the report; the button press (POST) stops that person sending messages, or lets them carry on.
// (Buttons rather than plain links, so email scanners that open links can't trigger anything.)
import { db, eq, esc, SITE } from "../lib/photos.mjs";
import { signReport as sign } from "../lib/messages.mjs";
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
  const uid = q.get("u") || "", rid = q.get("r") || "", sig = q.get("s") || "";
  if (!/^[0-9a-f-]{36}$/.test(uid) || !/^\d+$/.test(rid) || !same(sig, sign(uid, rid))) return page("Link not valid", "<h1>That link isn't valid</h1><p>Open the review button from the email again.</p>");
  const [{ data: rep }, { data: p }, { data: ban }] = await Promise.all([
    db.one("message_reports", `select=body,reason,created_at&id=eq.${rid}`),
    db.one("profiles", `select=username&id=${eq(uid)}`),
    db.one("message_bans", `select=user_id&user_id=${eq(uid)}`)]);
  if (!p) return page("Account gone", "<h1>This account has been deleted</h1><p>Nothing to do.</p>");
  const prof = p.username ? `<a href="${SITE}/u/${esc(p.username)}">@${esc(p.username)}</a>` : "this person";

  if (req.method === "POST") {
    const a = q.get("a");
    if (a === "ban") {
      await db.upsert("message_bans", { user_id: uid });
      return page("Stopped", `<h1>Stopped ✓</h1><p>${prof} can't send messages any more. They can still use the rest of Live Louder. (To undo it, delete their row from the message_bans table in Supabase, or use the button below.)</p>
<form method="post"><input type="hidden" name="u" value="${uid}"><input type="hidden" name="r" value="${rid}"><input type="hidden" name="s" value="${sig}"><input type="hidden" name="a" value="unban"><button>Undo: let them message again</button></form>`);
    }
    if (a === "unban") {
      await db.remove_rows("message_bans", `user_id=${eq(uid)}`);
      return page("Allowed", `<h1>Done ✓</h1><p>${prof} can send messages again.</p>`);
    }
    if (a === "ok") return page("No action", `<h1>No action taken</h1><p>${prof} can keep messaging. The person who reported them can still block them.</p>`);
  }
  const { count } = await db.count("message_reports", `reported=${eq(uid)}`);
  const hidden = `<input type="hidden" name="u" value="${uid}"><input type="hidden" name="r" value="${rid}"><input type="hidden" name="s" value="${sig}">`;
  const btn = (a, cls, label) => `<form method="post">${hidden}<input type="hidden" name="a" value="${a}"><button class="${cls}">${label}</button></form>`;
  return page("Reported message", `<h1>Message from ${prof}</h1>
${rep ? `<p class="msg">${esc(rep.body)}</p><p class="note">Reason given: ${esc(rep.reason)} · ${count} ${count === 1 ? "report" : "reports"} about this person in total.</p>` : "<p>(The report has been removed.)</p>"}
${ban ? `<p><b>They're already stopped from messaging.</b></p>${btn("unban", "", "Let them message again")}` : `${btn("ban", "rm", "Stop them sending messages")}${btn("ok", "", "It's fine, no action")}`}
<p class="note">Stopping someone only turns off their messages. To remove their photos too, use the photo review emails. For anything threatening, the person can also report it to the police or the eSafety Commissioner (esafety.gov.au).</p>`);
};
