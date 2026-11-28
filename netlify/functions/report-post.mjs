// "Report" on a post or a reply. Signed-in people only, up to 10 reports a day each.
// The post or reply is hidden straight away (the person who wrote it can still see it), and Mick gets an email
// with a button to remove it for good, put it back, or stop that person posting.
import { db, eq, userFrom, json, esc, SITE } from "../lib/photos.mjs";
import { signPost } from "../lib/messages.mjs";

const REASONS = { spam: "Spam or scam", nasty: "Nasty or bullying", hate: "Hateful or offensive", sexual: "Sexual or creepy", other: "Something else" };
const FROM = "Live Louder <hello@livelouder.com.au>";
const TO = () => process.env.MODERATION_EMAIL || "mick@heathenrecords.com.au";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const user = await userFrom(req);
  if (!user) return json({ error: "Please sign in to report this." }, 401);
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const kind = body.kind === "reply" ? "reply" : "post", id = Number(body.id), reason = REASONS[body.reason] ? body.reason : "other";
  if (!id) return json({ error: "Missing details" }, 400);

  const used = await db.count("post_reports", `reporter=${eq(user.id)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}`);
  if (used.count >= 10) return json({ error: "Thanks. We've had a lot of reports from you today, so we'll look at those first." }, 429);

  const table = kind === "post" ? "posts" : "post_replies";
  const { data: x } = await db.one(table, `select=id,user_id,body,status,created_at${kind === "reply" ? ",post_id" : ""}&id=eq.${id}`);
  if (!x || x.user_id === user.id) return json({ ok: true });
  const ins = await db.insertReturn("post_reports", { reporter: user.id, kind, target: id, owner: x.user_id, body: x.body, reason });
  const reportId = ins.data && ins.data[0] && ins.data[0].id;
  // Hide it now, unless Mick has already looked at it and kept it ("approved").
  if (x.status === "ok") await db.update(table, `id=eq.${id}`, { status: "hidden" });

  const [{ data: owner }, { data: me }] = await Promise.all([
    db.one("profiles", `select=username&id=${eq(x.user_id)}`), db.one("profiles", `select=username&id=${eq(user.id)}`)]);
  const who = owner && owner.username ? `@${owner.username}` : "someone";
  if (process.env.RESEND_API_KEY && reportId) {
    const link = `${SITE}/.netlify/functions/post-review?r=${reportId}&s=${signPost(reportId)}`;
    const when = new Date(x.created_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;color:#141414">
<p style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#e2391f;font-weight:bold">Live Louder · ${kind} reported</p>
<h2 style="margin:6px 0 12px">${esc(who)}'s ${kind} reported by @${esc(me && me.username || "a member")}: ${esc(REASONS[reason])}</h2>
<p style="background:#f3f1ec;border-left:4px solid #e2391f;padding:12px 14px;white-space:pre-wrap">${esc(x.body)}</p>
<p style="color:#555;font-size:14px">Posted ${esc(when)}. ${x.status === "approved" ? "You've already kept this one after an earlier report, so it's still showing." : "It's hidden from everyone except the person who wrote it until you decide."}</p>
<p><a href="${link}" style="display:inline-block;background:#e2391f;color:#fff;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:999px">Review this report</a></p></div>`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [TO()], subject: `${kind === "post" ? "Post" : "Reply"} reported: ${who} (${REASONS[reason]})`, html }),
    }).catch(() => {});
  }
  return json({ ok: true });
};
