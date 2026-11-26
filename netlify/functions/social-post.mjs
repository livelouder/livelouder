// Posts today's Live Louder social post to Instagram and Facebook, every evening.
// The post (images + caption) is made by the 7am build: /social/today.json.
// Needs in Netlify Keys and secrets: META_PAGE_TOKEN (Facebook Page access token),
// META_PAGE_ID, IG_USER_ID. Optional: META_GRAPH_VERSION (default v23.0).
const SITE = "https://livelouder.com.au";
const V = () => process.env.META_GRAPH_VERSION || "v23.0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function graph(path, params = {}, method = "POST") {
  const body = new URLSearchParams({ ...params, access_token: process.env.META_PAGE_TOKEN });
  const url = `https://graph.facebook.com/${V()}/${path}` + (method === "GET" ? `?${body}` : "");
  const r = await fetch(url, method === "GET" ? {} : { method, body });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(`${path}: ${JSON.stringify(data.error || data).slice(0, 300)}`);
  return data;
}

async function waitReady(id) {
  for (let i = 0; i < 20; i++) {
    const s = await graph(id, { fields: "status_code" }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR") throw new Error(`media ${id} failed`);
    await sleep(3000);
  }
}

async function postInstagram(ig, post) {
  // Skip if something was already posted in the last 18 hours (so a re-run can't double post)
  const recent = await graph(`${ig}/media`, { fields: "timestamp", limit: "1" }, "GET");
  const last = recent.data?.[0]?.timestamp;
  if (last && Date.now() - Date.parse(last) < 18 * 3600 * 1000) return "instagram: already posted today";
  let creation;
  if (post.images.length === 1) {
    creation = (await graph(`${ig}/media`, { image_url: post.images[0], caption: post.caption })).id;
  } else {
    const kids = [];
    for (const url of post.images.slice(0, 10)) kids.push((await graph(`${ig}/media`, { image_url: url, is_carousel_item: "true" })).id);
    for (const k of kids) await waitReady(k);
    creation = (await graph(`${ig}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption: post.caption })).id;
  }
  await waitReady(creation);
  const pub = await graph(`${ig}/media_publish`, { creation_id: creation });
  return `instagram: posted ${pub.id}`;
}

async function postFacebook(page, post) {
  const recent = await graph(`${page}/posts`, { fields: "created_time", limit: "1" }, "GET");
  const last = recent.data?.[0]?.created_time;
  if (last && Date.now() - Date.parse(last) < 18 * 3600 * 1000) return "facebook: already posted today";
  const msg = post.caption.replace(/\(link in bio\)/g, "").replace(/livelouder\.com\.au(?!\/)/, "https://livelouder.com.au");
  if (post.images.length === 1) {
    const r = await graph(`${page}/photos`, { url: post.images[0], message: msg });
    return `facebook: posted ${r.post_id || r.id}`;
  }
  const ids = [];
  for (const url of post.images.slice(0, 10)) ids.push((await graph(`${page}/photos`, { url, published: "false" })).id);
  const params = { message: msg };
  ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  const r = await graph(`${page}/feed`, params);
  return `facebook: posted ${r.id}`;
}

export default async () => {
  const { META_PAGE_TOKEN, META_PAGE_ID, IG_USER_ID } = process.env;
  if (!META_PAGE_TOKEN) return new Response("META_PAGE_TOKEN not set");
  const post = await (await fetch(`${SITE}/social/today.json?v=${Date.now()}`)).json();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  if (post.date !== today) return new Response(`today.json is for ${post.date}, not ${today}; skipping`);
  const log = [];
  for (const [name, fn] of [["instagram", () => IG_USER_ID && postInstagram(IG_USER_ID, post)], ["facebook", () => META_PAGE_ID && postFacebook(META_PAGE_ID, post)]]) {
    try { log.push((await fn()) || `${name}: not set up`); } catch (e) { log.push(`${name} error: ${e.message}`); }
  }
  console.log(log.join("\n"));
  return new Response(log.join("\n"));
};

// 07:30 UTC = 6:30pm in Sydney during daylight saving (5:30pm in winter), a good time for music posts
export const config = { schedule: "30 7 * * *" };
