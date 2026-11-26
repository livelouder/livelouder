// Keeps the build's lookup results (Deezer, setlist.fm, Discogs, Ticketmaster)
// between Netlify builds, so each build only looks up what's new or out of date.
// Also pulls gig submissions (from the "Submit a gig" form, stored in Netlify Blobs)
// into data/gig_submissions.json for build.py to check and publish.
const fs = require("fs");
const crypto = require("crypto");
const FILES = ["data/deezer.json", "data/setlists.json", "data/discogs.json", "data/discogs_releases.json", "data/ticketmaster.json", "data/geo.json"];

async function pullSubmissions(constants) {
  try {
    const { getStore } = await import("@netlify/blobs");
    const opts = { name: "gig-submissions" };
    if (constants.SITE_ID && constants.NETLIFY_API_TOKEN) { opts.siteID = constants.SITE_ID; opts.token = constants.NETLIFY_API_TOKEN; }
    const store = getStore(opts);
    const { blobs } = await store.list();
    const today = new Date().toISOString().slice(0, 10);
    const out = [];
    for (const b of blobs) {
      const x = await store.get(b.key, { type: "json" });
      if (!x) continue;
      if (x.date && x.date < today) { await store.delete(b.key); continue; } // show has happened: tidy up
      const { email, ...rest } = x; // emails stay private: only a hash goes to the build, for spam limits
      rest.key = b.key;
      rest.email_hash = email ? crypto.createHash("sha256").update(String(email).toLowerCase()).digest("hex").slice(0, 16) : "";
      out.push(rest);
    }
    fs.writeFileSync("data/gig_submissions.json", JSON.stringify(out));
    console.log(`gig submissions: ${out.length} pulled`);
  } catch (e) {
    console.log("gig submissions: skipped (" + e.message + ")");
  }
}

module.exports = {
  async onPreBuild({ utils, constants }) {
    for (const f of FILES) {
      if (await utils.cache.restore(f)) console.log(`keep-cache: restored ${f}`);
    }
    await pullSubmissions(constants || {});
  },
  async onPostBuild({ utils }) {
    for (const f of FILES) {
      if (await utils.cache.save(f)) console.log(`keep-cache: saved ${f}`);
    }
  },
};
