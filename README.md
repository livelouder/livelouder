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

## Deploys (Netlify Personal plan, 15 credits per deploy)
- One deploy a day: the 7am rebuild (`daily-rebuild.mjs`). Scheduled content tasks push with `[skip netlify]` in the commit message, so their changes go live with the next rebuild.
- `/out-soon.html` uses Discogs for covers, labels and pressing details; `/most-wanted.html` and `/data/most-wanted.json` rank touring artists' records by Discogs wantlists.
