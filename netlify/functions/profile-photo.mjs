// Profile photo and cover photo uploads (POST a JPEG, ?kind=avatar|banner, with the person's sign-in token).
// 1. Blocked accounts and more than 6 uploads a day are turned away.
// 2. Google Cloud Vision SafeSearch checks the photo (needs GOOGLE_VISION_KEY):
//    clearly explicit or violent photos are rejected; borderline ones, or any photo when the check can't run,
//    go live for the owner only and are emailed to Mick to approve or remove (see photo-review.mjs).
// 3. The photo is saved to Supabase Storage and the profile updated. The old photo is deleted.
import { admin, userFrom, json, emailReview, PUBLIC_PREFIX } from "../lib/photos.mjs";

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
  const kind = new URL(req.url).searchParams.get("kind");
  if (!["avatar", "banner"].includes(kind)) return json({ error: "Unknown photo type" }, 400);
  const sb = admin();
  const user = await userFrom(req, sb);
  if (!user) return json({ error: "Please sign in again." }, 401);

  const [{ data: blocked }, { count }, { data: prof }] = await Promise.all([
    sb.from("photo_blocks").select("user_id").eq("user_id", user.id).maybeSingle(),
    sb.from("photo_log").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", new Date(Date.now() - 864e5).toISOString()),
    sb.from("profiles").select("username, avatar_url, banner_url").eq("id", user.id).maybeSingle(),
  ]);
  if (blocked) return json({ error: "Photo uploads are switched off for this account. Email hello@livelouder.com.au if you think that's a mistake." }, 403);
  if ((count || 0) >= DAILY) return json({ error: "That's a lot of photo changes for one day. Try again tomorrow." }, 429);

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 500 || buf.length > 3 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return json({ error: "That photo couldn't be read. Try a different one." }, 400);

  const check = await safeSearch(buf);
  const path = `${user.id}/${kind}-${Date.now()}.jpg`;
  await sb.from("photo_log").insert({ user_id: user.id, kind, path: check.verdict === "reject" ? null : path, result: check.verdict, scores: check.scores || null });
  if (check.verdict === "reject") return json({ error: "That photo can't be used on Live Louder. Please choose a different one." }, 422);

  const up = await sb.storage.from("profile").upload(path, buf, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (up.error) return json({ error: "Couldn't upload that photo. Try again." }, 500);
  const url = PUBLIC_PREFIX + path;
  const status = check.verdict === "ok" ? "ok" : "pending";
  const { error } = await sb.from("profiles").update({ [`${kind}_url`]: url, [`${kind}_status`]: status, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) { await sb.storage.from("profile").remove([path]); return json({ error: "Couldn't save that photo. Try again." }, 500); }
  const old = prof && prof[`${kind}_url`];
  if (old && old.startsWith(PUBLIC_PREFIX)) await sb.storage.from("profile").remove([old.slice(PUBLIC_PREFIX.length)]);
  if (status === "pending") await emailReview({ uid: user.id, kind, path, url, username: prof && prof.username, why: check.why });
  return json({ url, status });
};
