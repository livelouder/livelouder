// "Report" on someone's profile photo or cover photo. Signed-in people only, up to 10 reports a day each.
// The photo is hidden from everyone else straight away and emailed to Mick to keep or remove,
// unless Mick has already reviewed and kept it (then he's just emailed).
import { db, eq, userFrom, json, emailReview, PUBLIC_PREFIX } from "../lib/photos.mjs";

const REASONS = { nudity: "Nudity or sexual", violence: "Violence or gore", hate: "Hateful or offensive", notmine: "Not their photo", other: "Something else" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const user = await userFrom(req);
  if (!user) return json({ error: "Please sign in to report a photo." }, 401);
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const kind = body.kind, reason = REASONS[body.reason] ? body.reason : "other";
  if (!["avatar", "banner"].includes(kind) || !body.username) return json({ error: "Missing details" }, 400);

  const used = await db.count("photo_reports", `reporter=${eq(user.id)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}`);
  if (used.count >= 10) return json({ error: "Thanks. We've had a lot of reports from you today, so we'll look at those first." }, 429);

  const uname = String(body.username).toLowerCase().replace(/[^a-z0-9_]/g, "");
  const { data: p } = await db.one("profiles", `select=id,username,${kind}_url,${kind}_status&username=ilike.${encodeURIComponent(uname)}`);
  if (!p || p.id === user.id) return json({ ok: true });
  await db.insert("photo_reports", { reporter: user.id, owner: p.id, kind, reason });
  const url = p[`${kind}_url`];
  const path = url && url.startsWith(PUBLIC_PREFIX) ? url.slice(PUBLIC_PREFIX.length) : "";
  const kept = p[`${kind}_status`] === "approved";
  if (!kept) await db.update("profiles", `id=${eq(p.id)}`, { [`${kind}_status`]: "hidden" });
  let photoUrl = url;
  if (!photoUrl && kind === "avatar") { const r = await db.authUser(p.id); photoUrl = r.data && r.data.user_metadata && r.data.user_metadata.avatar_url; }
  await emailReview({ uid: p.id, kind, path, url: photoUrl, username: p.username, why: `Reported: ${REASONS[reason]}`,
    detail: kept ? "You approved this photo before, so it's still showing. Remove it if you've changed your mind." : "" });
  return json({ ok: true });
};
