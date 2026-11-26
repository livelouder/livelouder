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

## Emails (Kit)
- `netlify/functions/submission-created.mjs` adds every site signup to Kit with tags.
- `netlify/functions/weekly-email.mjs` sends the Live Louder Weekly on Thursday mornings.
- `netlify/functions/artist-alerts.mjs` emails artist followers about new tours, news and on-sales.
- Content comes from `site/email/weekly.json` and `site/email/alerts.json`, built by `src/emails.py`.
- Needs `KIT_API_KEY` in Netlify. Emails stay as Kit drafts until `KIT_AUTO_SEND` is set to `yes`.

## Artist page extras
- `SETLISTFM_KEY` (free, setlist.fm/settings/api): adds "What they've been playing", the latest setlist.
- `DISCOGS_TOKEN` (free, discogs.com/settings/developers): adds "Essential records" with covers and Heathen links.
- Both are optional and cached for a week; `netlify/plugins/keep-cache` keeps the caches between builds.
