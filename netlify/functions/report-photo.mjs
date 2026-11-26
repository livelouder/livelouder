// "Report" on someone's profile photo or cover photo. Signed-in people only, up to 10 reports a day each.
// The photo is hidden from everyone else straight away and emailed to Mick to keep or remove,
// unless Mick has already reviewed and kept it (then he's just emailed).
import { admin, userFrom, json, emailReview, PUBLIC_PREFIX } from "../lib/photos.mjs";

const REASONS = { nudity: "Nudity or sexual", violence: "Violence or gore", hate: "Hateful or offensive", notmine: "Not their photo", other: "Something else" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const sb = admin();
  const user = await userFrom(req, sb);
  if (!user) return json({ error: "Please sign in to report a photo." }, 401);
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const kind = body.kind, reason = REASONS[body.reason] ? body.reason : "other";
  if (!["avatar", "banner"].includes(kind) || !body.username) return json({ error: "Missing details" }, 400);

  const { count } = await sb.from("photo_reports").select("id", { count: "exact", head: true })
    .eq("reporter", user.id).gte("created_at", new Date(Date.now() - 864e5).toISOString());
  if ((count || 0) >= 10) return json({ error: "Thanks. We've had a lot of reports from you today, so we'll look at those first." }, 429);

  const { data: p } = await sb.from("profiles").select(`id, username, ${kind}_url, ${kind}_status`).ilike("username", String(body.username).replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (!p || p.id === user.id) return json({ ok: true });
  await sb.from("photo_reports").insert({ reporter: user.id, owner: p.id, kind, reason });
  const url = p[`${kind}_url`];
  const path = url && url.startsWith(PUBLIC_PREFIX) ? url.slice(PUBLIC_PREFIX.length) : "";
  const kept = p[`${kind}_status`] === "approved";
  if (!kept) await sb.from("profiles").update({ [`${kind}_status`]: "hidden" }).eq("id", p.id);
  let photoUrl = url;
  if (!photoUrl && kind === "avatar") { const { data } = await sb.auth.admin.getUserById(p.id); photoUrl = data && data.user && data.user.user_metadata && data.user.user_metadata.avatar_url; }
  await emailReview({ uid: p.id, kind, path, url: photoUrl, username: p.username, why: `Reported: ${REASONS[reason]}`,
    detail: kept ? "You approved this photo before, so it's still showing. Remove it if you've changed your mind." : (body.note ? `Note from the reporter: ${String(body.note).slice(0, 300)}` : "") });
  return json({ ok: true });
};
