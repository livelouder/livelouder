// Runs automatically every time someone fills in a form on the site.
// Adds them to Kit with the right tags:
//   newsletter form -> "Live Louder Weekly", "Source: website", "City: <city>"
//   follow form     -> "Artist: <artist>", "Source: website"
import { kit, kitReady, tagId } from "../lib/kit.mjs";

const done = (msg) => { console.log(msg); return new Response(msg); };

export default async (req) => {
  if (!kitReady()) return done("KIT_API_KEY not set");
  let body = {};
  try { body = await req.json(); } catch (e) { return done("could not read body: " + e.message); }
  const payload = body.payload || body;
  console.log("form:", payload?.form_name, "fields:", Object.keys(payload?.data || {}).join(","));
  const form = payload?.form_name || payload?.data?.["form-name"];
  const data = payload?.data || {};
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
