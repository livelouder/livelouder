// Small helper for the Kit (ConvertKit) v4 API. Needs KIT_API_KEY in Netlify's
// Keys and secrets. Emails are only sent for real when KIT_AUTO_SEND is "yes";
// otherwise they are saved as drafts in Kit so you can check them first.
const API = "https://api.kit.com/v4";
export const SITE = "https://livelouder.com.au";

export function kitReady() {
  return Boolean(process.env.KIT_API_KEY);
}
export function autoSend() {
  return (process.env.KIT_AUTO_SEND || "").toLowerCase() === "yes";
}

export async function kit(path, { method = "GET", body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: {
      "X-Kit-Api-Key": process.env.KIT_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(`Kit ${method} ${path} -> ${r.status}: ${text.slice(0, 300)}`);
  return data;
}

// Finds a tag by name, creating it if needed. Returns its id.
export async function tagId(name, create = true) {
  let after = "";
  for (let i = 0; i < 20; i++) {
    const page = await kit(`/tags?per_page=1000${after ? "&after=" + encodeURIComponent(after) : ""}`);
    const hit = (page.tags || []).find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit.id;
    if (!page.pagination?.has_next_page) break;
    after = page.pagination.end_cursor;
  }
  if (!create) return null;
  const made = await kit("/tags", { method: "POST", body: { name } });
  return made.tag.id;
}

export async function tagHasSubscribers(id) {
  const r = await kit(`/tags/${id}/subscribers?per_page=1`);
  return (r.subscribers || []).length > 0;
}

// Every broadcast description we've used, so nothing is ever sent twice.
export async function usedKeys() {
  const keys = new Set();
  let after = "";
  for (let i = 0; i < 20; i++) {
    const page = await kit(`/broadcasts?per_page=1000&slim=true${after ? "&after=" + encodeURIComponent(after) : ""}`);
    for (const b of page.broadcasts || []) {
      for (const k of (b.description || "").split(/[\s,]+/)) if (k) keys.add(k);
    }
    if (!page.pagination?.has_next_page) break;
    after = page.pagination.end_cursor;
  }
  return keys;
}

// Creates the broadcast. Sends in two minutes when auto-send is on, otherwise saves a draft.
export async function broadcast({ subject, preview, html, description, tagIds }) {
  const send_at = autoSend() ? new Date(Date.now() + 2 * 60 * 1000).toISOString() : null;
  const r = await kit("/broadcasts", {
    method: "POST",
    body: {
      subject,
      preview_text: preview,
      content: html,
      description,
      public: false,
      send_at,
      subscriber_filter: [{ all: [{ type: "tag", ids: tagIds }] }],
    },
  });
  return { id: r.broadcast?.id, sent: Boolean(send_at) };
}

export async function siteJson(path) {
  const r = await fetch(`${SITE}/${path}?v=${Date.now()}`);
  if (!r.ok) throw new Error(`fetch ${path} -> ${r.status}`);
  return r.json();
}
