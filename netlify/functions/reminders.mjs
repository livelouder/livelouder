// Daily reminder emails for Live Louder account holders, 8:30am Sydney time (21:30 UTC, daylight saving).
//  - "Coming up": gigs they saved that are on in the next 3 days
//  - Presales and on-sales in the next 36 hours, and newly announced tours, for artists they follow
// One email per person per day at most. Each item is only ever sent once (table sent_reminders).
// Needs SUPABASE_SECRET_KEY and RESEND_API_KEY in Netlify. People can switch each kind off on My gigs.
import { createClient } from "@supabase/supabase-js";

const SITE = "https://livelouder.com.au";
const SB_URL = "https://qoqdouthyyaebmreavgz.supabase.co";
const FROM = "Live Louder <hello@livelouder.com.au>";
const RED = "#e2391f", INK = "#141414", MUTED = "#6b665e";
const FONT = "font-family:Helvetica Neue,Helvetica,Arial,sans-serif";
const HEAD = "font-family:Anton,Impact,Arial Narrow Bold,Helvetica Neue,Arial,sans-serif;font-weight:400";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const utm = (u) => u + (u.includes("?") ? "&" : "?") + "utm_source=livelouder&utm_medium=email&utm_campaign=reminder";

function sydney(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayName = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const saleWhen = (iso) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function row(title, sub, href, label, img) {
  const thumb = img ? `<td width="88" valign="top" style="padding:12px 0 12px 12px"><img src="${esc(img)}" width="76" height="76" alt="" style="display:block;width:76px;height:76px;border-radius:4px;border:0"></td>` : "";
  return `<tr><td style="padding:6px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3dfd6;border-radius:6px;background:#fff"><tr>${thumb}
<td valign="top" style="padding:12px 16px"><div style="${FONT};font-size:16px;font-weight:bold;color:${INK}">${esc(title)}</div>
<div style="${FONT};font-size:14px;color:${MUTED};margin-top:3px">${esc(sub)}</div>
${href ? `<div style="margin-top:8px"><a href="${esc(utm(href))}" style="${FONT};font-size:14px;font-weight:bold;color:${RED};text-decoration:none">${esc(label)} →</a></div>` : ""}</td></tr></table></td></tr>`;
}
const HEATHEN = "https://heathenrecords.com.au/search?type=product&q=";
const heathen = (q) => HEATHEN + encodeURIComponent(q) + "&utm_source=livelouder&utm_medium=email&utm_campaign=reminder";
function btn(href, label, solid) {
  return `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;${FONT};font-size:14px;font-weight:bold;text-decoration:none;padding:11px 18px;border-radius:999px;${solid ? `background:${RED};color:#fff;border:2px solid ${RED}` : `background:#fff;color:${INK};border:2px solid ${INK}`}">${esc(label)}</a>`;
}
// The big card for the next gig: photo, name, when and where, buttons, then records to play before the show.
function gigHero(g, when, art) {
  const x = g.gig, page = x.p ? SITE + x.p : `${SITE}/artists/${x.s || ""}.html`;
  // Wide photos run edge to edge; square artist photos sit on a dark band (cropping isn't reliable in Gmail).
  const pic = !art?.img
    ? `<tr><td style="background:${INK};padding:34px 32px;border-bottom:6px solid ${RED}">&nbsp;</td></tr>`
    : art.wide
      ? `<tr><td style="padding:0;border-bottom:6px solid ${RED}"><a href="${esc(utm(page))}"><img src="${esc(art.img)}" width="600" alt="${esc(x.a)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>`
      : `<tr><td align="center" style="background:${INK};padding:28px 32px;border-bottom:6px solid ${RED}"><a href="${esc(utm(page))}"><img src="${esc(art.img)}" width="250" height="250" alt="${esc(x.a)}" style="display:block;width:250px;height:250px;border-radius:50%;border:0"></a></td></tr>`;
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.v}, ${x.c}`)}`;
  let recs = "";
  if (art?.recs?.length) {
    const cells = art.recs.slice(0, 4).map((r) => `<td width="25%" valign="top" style="padding:0 5px;text-align:center">
<a href="${esc(heathen(`${x.a} ${r[0]}`))}" style="text-decoration:none"><img src="${esc(r[2])}" width="122" alt="${esc(r[0])}" style="display:block;width:100%;max-width:122px;height:auto;border-radius:4px;border:0;margin:0 auto">
<div style="${FONT};font-size:12px;line-height:1.3;color:${INK};font-weight:bold;margin-top:6px">${esc(r[0])}</div>${r[1] ? `<div style="${FONT};font-size:11px;color:${MUTED}">${esc(r[1])}</div>` : ""}</a></td>`).join("");
    recs = `<tr><td style="padding:22px 27px 4px"><div style="padding:0 5px;${HEAD};font-size:22px;color:${INK};text-transform:uppercase">Before the show</div>
<div style="padding:2px 5px 12px;${FONT};font-size:14px;color:${MUTED}">Get the songs in your head. Tap a record to find it on vinyl.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr>`;
  }
  return `${pic}
<tr><td style="padding:24px 32px 0"><span style="display:inline-block;background:${RED};color:#fff;${FONT};font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border-radius:3px">${esc(when)}</span>
<div style="${HEAD};font-size:40px;line-height:1.05;color:${INK};text-transform:uppercase;margin-top:12px">${esc(x.a)}</div>
<div style="${FONT};font-size:16px;line-height:1.5;color:${INK};margin-top:8px"><b>${esc(dayName(x.d))}${x.tm ? " · " + esc(x.tm) : ""}</b><br>${esc(x.v)}, ${esc(x.c)}</div></td></tr>
<tr><td style="padding:18px 32px 0">${btn(utm(x.u || page), g.going ? "Your tickets" : "Get tickets", true)}${btn(map, "Directions")}${btn(utm(page), "Gig page")}</td></tr>
${recs}`;
}
// Smaller card for any other gigs in the same email.
function gigRow(g, when, art) {
  const x = g.gig, page = x.p ? SITE + x.p : `${SITE}/artists/${x.s || ""}.html`;
  const sq = art?.sq || (art && !art.wide ? art.img : "");
  const thumb = sq ? `<td width="76" valign="top" style="padding:12px 0 12px 12px"><img src="${esc(sq)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;border-radius:4px;border:0"></td>` : "";
  return `<tr><td style="padding:6px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3dfd6;border-radius:6px"><tr>${thumb}
<td style="padding:12px 16px"><div style="${FONT};font-size:16px;font-weight:bold;color:${INK}">${esc(x.a)}</div>
<div style="${FONT};font-size:14px;color:${MUTED};margin-top:3px">${esc(when)}${x.tm ? " · " + esc(x.tm) : ""} · ${esc(x.v)}, ${esc(x.c)}</div>
<div style="margin-top:8px"><a href="${esc(utm(x.u || page))}" style="${FONT};font-size:14px;font-weight:bold;color:${RED};text-decoration:none">${g.going ? "Tickets & details" : "Get tickets"} →</a></div></td></tr></table></td></tr>`;
}
function section(h) { return `<tr><td style="padding:24px 32px 6px"><div style="${HEAD};font-size:26px;color:${INK};text-transform:uppercase">${esc(h)}</div></td></tr>`; }
function wrap(rows, preview) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f0ede6"><div style="display:none;max-height:0;overflow:hidden">${esc(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede6"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#faf9f6;border-radius:10px;overflow:hidden">
<tr><td style="background:${INK};padding:20px 32px;border-bottom:6px solid ${RED}"><a href="${SITE}" style="${HEAD};font-size:30px;color:#fff;text-decoration:none">LIVE <span style="color:${RED}">LOUDER</span></a></td></tr>
${rows}
<tr><td style="padding:26px 32px"><a href="${utm(SITE + "/my-gigs.html")}" style="display:inline-block;background:${RED};color:#fff;${FONT};font-weight:bold;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:999px">Open My gigs</a></td></tr>
<tr><td style="padding:18px 32px 26px;border-top:1px solid #e3dfd6;${FONT};font-size:12px;line-height:1.6;color:${MUTED}">You're getting this because you have a Live Louder account.
Change which emails you get, or turn them off, on <a href="${SITE}/my-gigs.html" style="color:${MUTED}">My gigs</a>. Dates change: always check the ticket seller before you buy.<br>Live Louder · Blackheath NSW</td></tr>
</table></td></tr></table></body></html>`;
}

async function send(to, subject, html, text) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: "hello@livelouder.com.au", subject, html, text,
      headers: { "List-Unsubscribe": `<mailto:hello@livelouder.com.au?subject=unsubscribe>, <${SITE}/my-gigs.html>` } }),
  });
  if (!r.ok) throw new Error(`resend ${r.status} ${await r.text()}`);
}

export default async () => {
  // Strip anything that can't be part of a key (a pasted key once carried an invisible character).
  const key = String(process.env.SUPABASE_SECRET_KEY || "").replace(/[^A-Za-z0-9_.-]/g, "");
  if (!key || !process.env.RESEND_API_KEY) { console.log("reminders: keys not set"); return new Response("keys not set"); }
  // Newer Supabase secret keys go in the "apikey" header only, never as "Authorization: Bearer".
  const fetchKey = (url, opts = {}) => {
    const h = new Headers(opts.headers || {});
    if (h.get("authorization") === `Bearer ${key}`) h.delete("authorization");
    return fetch(url, { ...opts, headers: h });
  };
  const sb = createClient(SB_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchKey } });
  const today = sydney(), soon = addDays(today, 3);
  let feed = { sales: [], tours: [] }, artMap = {};
  try { artMap = await (await fetch(`${SITE}/data/email-art.json`)).json(); } catch (e) { console.log("no email art", e.message); }
  try { feed = await (await fetch(`${SITE}/data/alerts-feed.json`)).json(); } catch (e) { console.log("no alerts feed", e.message); }
  const now = Date.now(), until = now + 36 * 3600 * 1000;
  const sales = (feed.sales || []).filter((x) => { const t = Date.parse(x.when); return t > now && t <= until; });

  // Everyone with something to hear about.
  const [gigsR, artsR, profR, sentR] = await Promise.all([
    sb.from("saved_gigs").select("user_id,gig_id,gig,going").gte("gig->>d", today).lte("gig->>d", soon),
    sb.from("followed_artists").select("user_id,slug,name"),
    sb.from("profiles").select("id,remind_gigs,remind_presales"),
    sb.from("sent_reminders").select("user_id,key").gte("sent_at", new Date(now - 40 * 86400 * 1000).toISOString()),
  ]);
  for (const r of [gigsR, artsR, profR, sentR]) if (r.error) { console.log("reminders db error", r.error.message); return new Response("db error"); }
  const prefs = Object.fromEntries((profR.data || []).map((p) => [p.id, p]));
  const sent = new Set((sentR.data || []).map((x) => `${x.user_id}|${x.key}`));
  const todo = {}; // user -> {gigs:[], sales:[], tours:[]}
  const add = (uid, kind, k, item) => {
    if (sent.has(`${uid}|${k}`)) return;
    (todo[uid] ||= { gigs: [], sales: [], tours: [], keys: [] })[kind].push(item);
    todo[uid].keys.push(k);
  };
  for (const g of gigsR.data || []) if ((prefs[g.user_id] || {}).remind_gigs !== false) add(g.user_id, "gigs", `gig:${g.gig_id}`, g);
  for (const a of artsR.data || []) {
    if ((prefs[a.user_id] || {}).remind_presales === false) continue;
    for (const s of sales.filter((x) => x.slug === a.slug)) add(a.user_id, "sales", `sale:${s.slug}:${s.kind}:${s.name}:${s.when}`, s);
    for (const t of (feed.tours || []).filter((x) => x.slug === a.slug)) add(a.user_id, "tours", `tour:${t.slug}:${t.added}`, t);
  }
  const users = Object.keys(todo);
  if (!users.length) return new Response("nothing to send");

  let sentCount = 0;
  for (const uid of users) {
    const { data: u, error } = await sb.auth.admin.getUserById(uid);
    const email = u?.user?.email;
    if (error || !email) continue;
    const t = todo[uid];
    let rows = "";
    const subj = [];
    if (t.gigs.length) {
      t.gigs.sort((a, b) => a.gig.d.localeCompare(b.gig.d));
      const whenOf = (d) => d === today ? "Tonight" : d === addDays(today, 1) ? "Tomorrow" : dayName(d);
      const artOf = (x) => artMap[x.s] || artMap[(x.a || "").toLowerCase().replace(/&/g, "and").replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")];
      t.gigs.forEach((g, i) => { rows += i === 0 ? gigHero(g, whenOf(g.gig.d), artOf(g.gig)) : (i === 1 ? section("Also coming up") : "") + gigRow(g, whenOf(g.gig.d), artOf(g.gig)); });
      const g0 = t.gigs[0].gig;
      subj.push(g0.d === today ? `${g0.a} is tonight` : g0.d === addDays(today, 1) ? `${g0.a} is tomorrow` : `${g0.a} is coming up`);
    } else {
      rows += `<tr><td style="padding:28px 32px 0;${FONT};font-size:17px;line-height:1.55;color:${INK}">Here's what's coming up for you.</td></tr>`;
    }
    if (t.sales.length) {
      rows += section("Tickets go on sale");
      for (const s of t.sales.sort((a, b) => a.when.localeCompare(b.when))) {
        const label = s.kind === "Presale" ? (s.name && !/presale/i.test(s.name) ? `${s.name} presale` : s.name || "Presale") : "General on-sale";
        rows += row(`${s.artist}: ${label}`, `${saleWhen(s.when)} Sydney time · ${(s.cities || []).join(", ")}`, s.url, "Ticket page", s.img);
      }
      subj.push(`${t.sales[0].artist} tickets on sale soon`);
    }
    if (t.tours.length) {
      rows += section("Just announced");
      for (const x of t.tours) rows += row(`${x.artist}: ${x.tour}`, (x.cities || []).join(", "), `${SITE}/artists/${x.slug}.html`, "Dates & tickets", x.img);
      subj.push(`${t.tours[0].artist} just announced dates`);
    }
    const subject = subj.slice(0, 2).join(" · ");
    const text = [...t.gigs.map((g) => `${g.gig.a}: ${g.gig.d}, ${g.gig.v}, ${g.gig.c} ${g.gig.u}`),
                  ...t.sales.map((s) => `${s.artist} tickets: ${saleWhen(s.when)} Sydney time ${s.url}`),
                  ...t.tours.map((x) => `${x.artist} announced ${x.tour}: ${SITE}/artists/${x.slug}.html`)].join("\n")
                 + `\n\nManage your emails: ${SITE}/my-gigs.html`;
    try {
      await send(email, subject, wrap(rows, subject), text);
      await sb.from("sent_reminders").upsert(t.keys.map((key) => ({ user_id: uid, key })), { onConflict: "user_id,key", ignoreDuplicates: true });
      sentCount++;
    } catch (e) {
      console.log("reminder send failed", uid, e.message);
    }
  }
  console.log(`reminders: sent ${sentCount} of ${users.length}`);
  return new Response(`sent ${sentCount}`);
};

export const config = { schedule: "30 21 * * *" };
