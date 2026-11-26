// Every Thursday morning: sends the Live Louder Weekly to everyone tagged
// "Live Louder Weekly". The content is built into the site at /email/weekly.json
// by the daily rebuild. Each week is only ever sent once.
import { kitReady, tagId, tagHasSubscribers, usedKeys, broadcast, siteJson } from "../lib/kit.mjs";

export default async () => {
  if (!kitReady()) return new Response("KIT_API_KEY not set");
  const w = await siteJson("email/weekly.json");
  if ((await usedKeys()).has(w.key)) return new Response(`${w.key} already done`);
  const id = await tagId("Live Louder Weekly");
  if (!(await tagHasSubscribers(id))) return new Response("no subscribers yet");
  const r = await broadcast({ subject: w.subject, preview: w.preview, html: w.html, description: w.key, tagIds: [id] });
  return new Response(`${w.key}: broadcast ${r.id} ${r.sent ? "sending" : "saved as draft"}`);
};

// 21:00 UTC Wednesday = 8am Thursday in Sydney during daylight saving (7am in winter)
export const config = { schedule: "0 21 * * 3" };
