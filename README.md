# Live Louder (livelouder.com.au)

Independent Australian gig guide, tours, new vinyl and stories.

- `data/tours.json` – hand-picked big tours (artist, tour, support, note, source, dates, added)
- `data/releases.json` – upcoming vinyl releases
- `data/stories.json` – stories (HTML body)
- `src/feed.py` – Ticketmaster Discovery API feed (needs `TICKETMASTER_KEY` env var in Netlify)
- `src/style.css`, `src/app.js` – design and page scripts
- `build.py` – builds everything into `site/` (Netlify runs it on each deploy)
- `netlify/functions/daily-rebuild.mjs` – triggers a rebuild every morning (needs `BUILD_HOOK_URL`)

Every push to `main` publishes automatically.
