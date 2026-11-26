// Runs automatically every time someone fills in a form on the site.
// Adds them to Kit with the right tags:
//   newsletter form -> "Live Louder Weekly", "Source: website", "City: <city>"
//   follow form     -> "Artist: <artist>", "Source: website"
import { kit, kitReady, tagId } from "../lib/kit.mjs";

export default async (req) => {
  if (!kitReady()) return new Response("KIT_API_KEY not set");
  const { payload } = await req.json();
  const form = payload?.form_name || payload?.data?.["form-name"];
  const data = payload?.data || {};
  const email = (data.email || payload?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return new Response("no email");

  await kit("/subscribers", { method: "POST", body: { email_address: email, state: "active" } });

  const tags = ["Source: website"];
  if (form === "newsletter") {
    tags.push("Live Louder Weekly");
    const city = (data.city || "").trim();
    if (city && city.length < 40) tags.push(`City: ${city}`);
  } else if (form === "follow") {
    const artist = (data.artist || "").trim();
    if (artist && artist.length < 80) tags.push(`Artist: ${artist}`);
  } else {
    return new Response(`ignored form ${form}`);
  }
  for (const name of tags) {
    const id = await tagId(name);
    await kit(`/tags/${id}/subscribers`, { method: "POST", body: { email_address: email } });
  }
  return new Response(`added ${email} with ${tags.join(", ")}`);
};
