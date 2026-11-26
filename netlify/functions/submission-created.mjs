// Runs automatically every time someone fills in a form on the site.
// Adds them to Kit with the right tags:
//   newsletter form -> "Live Louder Weekly", "Source: website", "City: <city>"
//   follow form     -> "Artist: <artist>", "Source: website"
// The "gig" form (Submit a gig) is different: it's saved to Netlify Blobs, and the next
// daily build checks it and puts it in the gig guide. Gig submitters are NOT added to Kit.
import { kit, kitReady, tagId } from "../lib/kit.mjs";
import { getStore } from "@netlify/blobs";

const FIELDS = ["role", "artist", "date", "time", "venue", "city", "town", "state", "ticket_url", "support", "genre", "notes", "email"];

async function saveGig(data) {
  const clean = {};
  for (const f of FIELDS) clean[f] = String(data[f] || "").trim().slice(0, f === "notes" ? 600 : 200);
  if (!clean.artist || !/^\d{4}-\d{2}-\d{2}$/.test(clean.date) || !clean.venue) return "gig: missing artist, date or venue";
  clean.received = new Date().toISOString();
  const key = `${clean.date}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await getStore("gig-submissions").setJSON(key, clean);
  return `gig saved: ${clean.artist} ${clean.date} ${clean.venue}`;
}

const done = (msg) => { console.log(msg); return new Response(msg); };

export default async (req) => {
  let body = {};
  try { body = await req.json(); } catch (e) { return done("could not read body: " + e.message); }
  const payload = body.payload || body;
  console.log("form:", payload?.form_name, "fields:", Object.keys(payload?.data || {}).join(","));
  const form = payload?.form_name || payload?.data?.["form-name"];
  const data = payload?.data || {};
  if (form === "gig") {
    try { return done(await saveGig(data)); } catch (e) { return done("gig save error: " + e.message); }
  }
  if (!kitReady()) return done("KIT_API_KEY not set");
  const email = (data.email || payload?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return done("no email");

  try {
    const sub = await kit("/subscribers", { method: "POST", body: { email_address: email, state: "active" } });
    console.log("kit subscriber", sub?.subscriber?.id, sub?.subscriber?.state);
  } catch (e) {
    return done("kit subscriber error: " + e.message);
  }

  const tags = ["Source: website"];
  if (form === "newsletter") {
    tags.push("Live Louder Weekly");
    const city = (data.city || "").trim();
    if (city && city.length < 40) tags.push(`City: ${city}`);
  } else if (form === "follow") {
    const artist = (data.artist || "").trim();
    if (artist && artist.length < 80) tags.push(`Artist: ${artist}`);
  } else {
    return done(`ignored form ${form}`);
  }
  try {
    for (const name of tags) {
      const id = await tagId(name);
      await kit(`/tags/${id}/subscribers`, { method: "POST", body: { email_address: email } });
    }
  } catch (e) {
    return done("kit tag error: " + e.message);
  }
  return done(`added to Kit with ${tags.join(", ")}`);
};
