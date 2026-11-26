// Keeps the build's lookup results (Deezer, setlist.fm, Discogs, Ticketmaster)
// between Netlify builds, so each build only looks up what's new or out of date.
const FILES = ["data/deezer.json", "data/setlists.json", "data/discogs.json", "data/discogs_releases.json", "data/ticketmaster.json"];

module.exports = {
  async onPreBuild({ utils }) {
    for (const f of FILES) {
      if (await utils.cache.restore(f)) console.log(`keep-cache: restored ${f}`);
    }
  },
  async onPostBuild({ utils }) {
    for (const f of FILES) {
      if (await utils.cache.save(f)) console.log(`keep-cache: saved ${f}`);
    }
  },
};
