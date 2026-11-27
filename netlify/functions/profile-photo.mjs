// Profile photo, cover photo and gig photo uploads (POST a JPEG, ?kind=avatar|banner, or ?kind=gig&gig=<gig id>, with the person's sign-in token).
// Gig photos: only for gigs the person marked as going, up to 4 per gig, stored in the gig_photos table.
// 1. Blocked accounts and more than 6 uploads a day are turned away.
// 2. Google Cloud Vision SafeSearch checks the photo (needs GOOGLE_VISION_KEY):
//    clearly explicit or violent photos are rejected; borderline ones, or any photo when the check can't run,
//    go live for the owner only and are emailed to Mick to approve or remove (see photo-review.mjs).
// 3. The photo is saved to Supabase Storage and the profile updated. The old photo is deleted.
import { db, eq, userFrom, json, emailReview, PUBLIC_PREFIX } from "../lib/photos.mjs";

const DAILY = 6;
const LEVEL = { UNKNOWN: 0, VERY_UNLIKELY: 1, UNLIKELY: 2, POSSIBLE: 3, LIKELY: 4, VERY_LIKELY: 5 };

async function safeSearch(buf) {
  const key = process.env.GOOGLE_VISION_KEY;
  if (!key) return { verdict: "pending", why: "Automatic check not set up yet" };
  try {
    const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ requests: [{ image: { content: buf.toString("base64") }, features: [{ type: "SAFE_SEARCH_DETECTION" }] }] }),
    });
    if (!r.ok) return { verdict: "pending", why: `Automatic check failed (${r.status})` };
    const s = (((await r.json()).responses || [])[0] || {}).safeSearchAnnotation;
    if (!s) return { verdict: "pending", why: "Automatic check gave no answer" };
    const L = (k) => LEVEL[s[k]] || 0;
    if (L("adult") >= 4 || L("violence") >= 4 || L("racy") >= 5) return { verdict: "reject", scores: s };
    if (L("adult") >= 3 || L("violence") >= 3 || L("racy") >= 4) return { verdict: "pending", why: "Automatic check wasn't sure", scores: s };
    return { verdict: "ok", scores: s };
  } catch (e) {
    return { verdict: "pending", why: "Automatic check failed" };
  }
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const params = new URL(req.url).searchParams;
  const kind = params.get("kind"), gigId = params.get("gig") || "";
  if (!["avatar", "banner", "gig"].includes(kind)) return json({ error: "Unknown photo type" }, 400);
  if (kind === "gig" && !/^[\w.:-]{1,160}$/.test(gigId)) return json({ error: "Which gig is this photo from?" }, 400);
  const user = await userFrom(req);
  if (!user) return json({ error: "Please sign in again." }, 401);

  const since = new Date(Date.now() - 864e5).toISOString();
  const [blocked, used, prof] = await Promise.all([
    db.one("photo_blocks", `select=user_id&user_id=${eq(user.id)}`),
    db.count("photo_log", `user_id=${eq(user.id)}&created_at=gte.${encodeURIComponent(since)}`),
    db.one("profiles", `select=username,avatar_url,banner_url&id=${eq(user.id)}`),
  ]);
  if (blocked.error || used.error || prof.error) return json({ error: "Couldn't upload that photo right now. Try again soon." }, 500);
  if (blocked.data) return json({ error: "Photo uploads are switched off for this account. Email hello@livelouder.com.au if you think that's a mistake." }, 403);
  if (used.count >= (kind === "gig" ? DAILY * 3 : DAILY)) return json({ error: "That's a lot of photos for one day. Try again tomorrow." }, 429);
  if (kind === "gig") {
    const [saved, have] = await Promise.all([
      db.one("saved_gigs", `select=going&user_id=${eq(user.id)}&gig_id=${eq(gigId)}`),
      db.count("gig_photos", `user_id=${eq(user.id)}&gig_id=${eq(gigId)}`),
    ]);
    if (!saved.data || !saved.data.going) return json({ error: "Mark this gig as one you went to first." }, 400);
    if (have.count >= 4) return json({ error: "You can add up to 4 photos per gig. Remove one to add another." }, 400);
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 500 || buf.length > 3 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return json({ error: "That photo couldn't be read. Try a different one." }, 400);

  const check = await safeSearch(buf);
  const path = kind === "gig" ? `${user.id}/gig-${gigId.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}-${Date.now()}.jpg` : `${user.id}/${kind}-${Date.now()}.jpg`;
  await db.insert("photo_log", { user_id: user.id, kind: kind === "gig" ? "gig:" + gigId : kind, path: check.verdict === "reject" ? null : path, result: check.verdict, scores: check.scores || null });
  if (check.verdict === "reject") return json({ error: "That photo can't be used on Live Louder. Please choose a different one." }, 422);

  const up = await db.upload(path, buf);
  if (up.error) return json({ error: "Couldn't upload that photo. Try again." }, 500);
  const url = PUBLIC_PREFIX + path;
  const status = check.verdict === "ok" ? "ok" : "pending";
  if (kind === "gig") {
    const row = await db.insertReturn("gig_photos", { user_id: user.id, gig_id: gigId, url, path, status });
    if (row.error) { await db.remove([path]); return json({ error: "Couldn't save that photo. Try again." }, 500); }
    if (status === "pending") await emailReview({ uid: user.id, kind, path, url, username: prof.data && prof.data.username, why: check.why });
    return json({ url, status, id: row.data && row.data[0] && row.data[0].id });
  }
  const saved = await db.update("profiles", `id=${eq(user.id)}`, { [`${kind}_url`]: url, [`${kind}_status`]: status, updated_at: new Date().toISOString() });
  if (saved.error) { await db.remove([path]); return json({ error: "Couldn't save that photo. Try again." }, 500); }
  const old = prof.data && prof.data[`${kind}_url`];
  if (old && old.startsWith(PUBLIC_PREFIX)) await db.remove([old.slice(PUBLIC_PREFIX.length)]);
  if (status === "pending") await emailReview({ uid: user.id, kind, path, url, username: prof.data && prof.data.username, why: check.why });
  return json({ url, status });
};
