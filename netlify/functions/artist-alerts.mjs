// Every morning after the rebuild: emails people who follow an artist when that
// artist has a new tour, news story or tickets going on sale. Each item is only
// ever sent once, and nothing is sent to artists nobody follows.
import { kitReady, tagId, tagHasSubscribers, usedKeys, broadcast, siteJson } from "../lib/kit.mjs";

export default async () => {
  if (!kitReady()) return new Response("KIT_API_KEY not set");
  const { alerts } = await siteJson("email/alerts.json");
  const used = await usedKeys();
  const log = [];
  for (const a of alerts || []) {
    const fresh = a.items.filter((k) => !used.has(k));
    if (!fresh.length) continue;
    const id = await tagId(a.tag, false);
    if (!id || !(await tagHasSubscribers(id))) continue;
    const r = await broadcast({ subject: a.subject, preview: a.preview, html: a.html, description: a.items.join(","), tagIds: [id] });
    a.items.forEach((k) => used.add(k));
    log.push(`${a.artist}: ${r.id} ${r.sent ? "sending" : "draft"}`);
  }
  return new Response(log.join("\n") || "no alerts today");
};

// 20:30 UTC = 7:30am in Sydney during daylight saving, after the 6am rebuild
export const config = { schedule: "30 20 * * *" };
