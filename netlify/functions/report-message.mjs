// "Report" on a message someone sent you. Signed-in people only, up to 10 reports a day each.
// Emails Mick the message with a button to stop that person sending messages. Can also block them for you.
import { db, eq, userFrom, json, esc, SITE } from "../lib/photos.mjs";
import { reviewLink } from "../lib/messages.mjs";

const REASONS = { spam: "Spam or scam", nasty: "Nasty, threatening or bullying", sexual: "Sexual or creepy", hate: "Hateful or offensive", other: "Something else" };
const FROM = "Live Louder <hello@livelouder.com.au>";
const TO = () => process.env.MODERATION_EMAIL || "mick@heathenrecords.com.au";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const user = await userFrom(req);
  if (!user) return json({ error: "Please sign in to report a message." }, 401);
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const id = Number(body.id), reason = REASONS[body.reason] ? body.reason : "other";
  if (!id) return json({ error: "Missing details" }, 400);

  const used = await db.count("message_reports", `reporter=${eq(user.id)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}`);
  if (used.count >= 10) return json({ error: "Thanks. We've had a lot of reports from you today, so we'll look at those first." }, 429);

  // Only messages sent to you can be reported.
  const { data: m } = await db.one("messages", `select=id,sender,body,created_at&id=eq.${id}&recipient=${eq(user.id)}`);
  if (!m) return json({ ok: true });
  const [{ data: sender }, { data: me }] = await Promise.all([
    db.one("profiles", `select=username&id=${eq(m.sender)}`), db.one("profiles", `select=username&id=${eq(user.id)}`)]);
  const ins = await db.insertReturn("message_reports", { reporter: user.id, reported: m.sender, message_id: m.id, body: m.body, reason });
  const reportId = ins.data && ins.data[0] && ins.data[0].id;

  if (body.block) {
    await db.upsert("user_blocks", { blocker: user.id, blocked: m.sender });
    await db.remove_rows("follows", `follower=${eq(user.id)}&followee=${eq(m.sender)}`);
    await db.remove_rows("follows", `follower=${eq(m.sender)}&followee=${eq(user.id)}`);
  }

  // Their other recent messages to this person, so Mick has the context.
  const { data: recent } = await db.select("messages", `select=body,created_at&sender=${eq(m.sender)}&recipient=${eq(user.id)}&order=id.desc&limit=8`);
  const who = sender && sender.username ? `@${sender.username}` : "someone";
  if (process.env.RESEND_API_KEY && reportId) {
    const when = (t) => new Date(t).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;color:#141414">
<p style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#e2391f;font-weight:bold">Live Louder · message reported</p>
<h2 style="margin:6px 0 12px">${esc(who)} reported by @${esc(me && me.username || "a member")}: ${esc(REASONS[reason])}</h2>
<p style="background:#f3f1ec;border-left:4px solid #e2391f;padding:12px 14px;white-space:pre-wrap">${esc(m.body)}</p>
<p style="color:#555;font-size:14px">Sent ${esc(when(m.created_at))}.${body.block ? " The reporter has also blocked them." : ""}</p>
${recent && recent.length > 1 ? `<p style="font-size:14px;margin-bottom:4px"><b>Their latest messages to this person:</b></p><ul style="font-size:14px;color:#444;padding-left:18px">${recent.map((r) => `<li>${esc(r.body.slice(0, 200))} <span style="color:#999">(${esc(when(r.created_at))})</span></li>`).join("")}</ul>` : ""}
<p><a href="${reviewLink(m.sender, reportId)}" style="display:inline-block;background:#e2391f;color:#fff;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:999px">Review this report</a></p>
${sender && sender.username ? `<p style="font-size:13px;color:#777">Profile: <a href="${SITE}/u/${esc(sender.username)}">${SITE.replace("https://", "")}/u/${esc(sender.username)}</a></p>` : ""}</div>`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [TO()], subject: `Message reported: ${who} (${REASONS[reason]})`, html }),
    }).catch(() => {});
  }
  return json({ ok: true });
};
