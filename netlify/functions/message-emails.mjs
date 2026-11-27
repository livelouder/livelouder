// "You've got a message" emails. Runs every 20 minutes. Someone gets an email when a message has sat unread
// for 10 minutes, at most one every 3 hours, and never with the message itself in it (just who it's from).
// People can switch these off on My gigs → Settings (profiles.remind_messages). Needs SUPABASE_SECRET_KEY and RESEND_API_KEY.
import { db, eq, esc, SITE } from "../lib/photos.mjs";

const FROM = "Live Louder <hello@livelouder.com.au>";
const RED = "#e2391f", INK = "#141414", MUTED = "#6b665e";
const FONT = "font-family:Helvetica Neue,Helvetica,Arial,sans-serif";
const HEAD = "font-family:Anton,Impact,Arial Narrow Bold,Helvetica Neue,Arial,sans-serif;font-weight:400";

// One sender: their photo big and round. Several: a row of smaller photos. No photo: their initial in a red circle.
function face(p, size) {
  const name = p.name || "A friend";
  if (p.img) return `<img src="${esc(p.img)}" width="${size}" height="${size}" alt="${esc(name)}" style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;border:3px solid #fff;vertical-align:middle">`;
  const ch = (name.replace(/^@/, "")[0] || "?").toUpperCase();
  return `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;border-radius:50%;border:3px solid #fff;background:${RED};color:#fff;text-align:center;${HEAD};font-size:${Math.round(size * 0.45)}px;vertical-align:middle">${esc(ch)}</span>`;
}
function email(people, n) {
  const names = people.map((p) => p.name);
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${names.length - 2} more`;
  const subject = names.length === 1 ? `${names[0]} sent you ${n === 1 ? "a message" : n + " messages"} on Live Louder` : `New messages from ${who} on Live Louder`;
  const link = `${SITE}/messages.html?utm_source=livelouder&utm_medium=email&utm_campaign=messages`;
  const one = people.length === 1;
  const faces = one ? face(people[0], 96) : people.slice(0, 5).map((p) => face(p, 64)).join("&nbsp;");
  const handle = one && people[0].username ? `<div style="${FONT};font-size:14px;color:#bdb7ad;margin-top:6px">@${esc(people[0].username)}</div>` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f0ede6"><div style="display:none;max-height:0;overflow:hidden">${esc(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede6"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#faf9f6;border-radius:10px;overflow:hidden">
<tr><td style="background:${INK};padding:20px 32px"><a href="${SITE}" style="${HEAD};font-size:30px;color:#fff;text-decoration:none">LIVE <span style="color:${RED}">LOUDER</span></a></td></tr>
<tr><td align="center" style="background:${INK};padding:10px 32px 30px;border-bottom:6px solid ${RED}">${faces}
<div style="${HEAD};font-size:30px;line-height:1.1;color:#fff;text-transform:uppercase;margin-top:14px">${esc(who)}</div>${handle}</td></tr>
<tr><td align="center" style="padding:30px 32px 6px;${FONT};font-size:18px;line-height:1.55;color:${INK}">sent you <b>${n === 1 ? "a message" : n + " messages"}</b> on Live Louder.</td></tr>
<tr><td align="center" style="padding:6px 32px 0;${FONT};font-size:14px;line-height:1.55;color:${MUTED}">Gig plans? Record swap? Open it up and see.</td></tr>
<tr><td align="center" style="padding:22px 32px 30px"><a href="${link}" style="display:inline-block;background:${RED};color:#fff;${FONT};font-weight:bold;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:999px">Read and reply</a></td></tr>
<tr><td style="padding:18px 32px 26px;border-top:1px solid #e3dfd6;${FONT};font-size:12px;line-height:1.6;color:${MUTED}">You're getting this because you have a Live Louder account. We never put the message itself in an email.
Turn off message emails on <a href="${SITE}/my-gigs.html#settings" style="color:${MUTED}">My gigs → Settings</a>.<br>Live Louder · Blackheath NSW</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${who} sent you ${n === 1 ? "a message" : n + " messages"} on Live Louder.\n\nRead and reply: ${link}\n\nTurn off message emails on My gigs → Settings: ${SITE}/my-gigs.html#settings`;
  return { subject, html, text };
}

export default async () => {
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.RESEND_API_KEY) return new Response("keys not set");
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: msgs, error } = await db.select("messages", `select=id,sender,recipient&read_at=is.null&notified=eq.false&hidden_for_recipient=eq.false&created_at=lt.${encodeURIComponent(cutoff)}&order=id&limit=2000`);
  if (error) return new Response("db error");
  if (!msgs || !msgs.length) return new Response("nothing to send");

  const by = {};
  for (const m of msgs) (by[m.recipient] ||= []).push(m);
  const ids = [...new Set(msgs.flatMap((m) => [m.sender, m.recipient]))];
  const { data: profs } = await db.select("profiles", `select=id,username,display_name,avatar_url,avatar_status,remind_messages,last_message_email&id=in.(${ids.join(",")})`);
  const P = Object.fromEntries((profs || []).map((p) => [p.id, p]));
  const recent = Date.now() - 3 * 3600 * 1000;
  let sent = 0;

  for (const [uid, list] of Object.entries(by)) {
    const p = P[uid] || {};
    const done = () => db.update("messages", `id=in.(${list.map((m) => m.id).join(",")})`, { notified: true });
    if (p.remind_messages === false) { await done(); continue; }
    // Emailed in the last 3 hours: wait (these stay un-notified and go in the next email if still unread).
    if (p.last_message_email && Date.parse(p.last_message_email) > recent) continue;
    const r = await db.authUser(uid);
    const to = r.data && r.data.email;
    if (!to) { await done(); continue; }
    const people = [...new Set(list.map((m) => m.sender))].map((s) => { const q = P[s] || {};
      return { name: q.display_name || (q.username ? "@" + q.username : "A friend"), username: q.username || "",
               img: q.avatar_url && ["ok", "approved"].includes(q.avatar_status || "ok") ? q.avatar_url : "" }; });
    const { subject, html, text } = email(people, list.length);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: "hello@livelouder.com.au", subject, html, text,
        headers: { "List-Unsubscribe": `<mailto:hello@livelouder.com.au?subject=unsubscribe>, <${SITE}/my-gigs.html#settings>` } }),
    }).catch(() => null);
    if (!res || !res.ok) { console.log("message email failed", res && res.status); continue; }
    await done();
    await db.update("profiles", `id=${eq(uid)}`, { last_message_email: new Date().toISOString() });
    sent++;
  }
  console.log(`message emails: sent ${sent}`);
  return new Response(`sent ${sent}`);
};

export const config = { schedule: "*/20 * * * *" };
