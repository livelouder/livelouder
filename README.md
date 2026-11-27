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

## On sale, weekends, venues, tracking
- `/on-sale.html`: presales and general on-sales for the next 3 weeks (Ticketmaster data, plus `onsale` / `presales` / `tickets` fields on tours in data/tours.json; curated times are Sydney local "YYYY-MM-DDTHH:MM").
- `/this-weekend.html` and `/gigs/<city>-this-weekend.html`: rebuilt daily for the coming Fri–Sun.
- Venue guides: data/venue_guides.json keyed by venue slug (see site/data/venues.json for slugs, ranked by upcoming shows). Filled by the weekly venue-guide task.
- All heathenrecords.com.au links get utm_source=livelouder (utm_medium=referral on the site, email in emails).

## Social posts
- `src/social.py` makes one post a day (images + caption) at the 7am build → site/social/today.json; Make.com publishes it to Instagram and Facebook at 6:30pm.
- Posts are built for shares, saves and comments: hook slide, a question, and a "send this to a mate" / "save this" slide.
- `data/social_queue.json`: hand-written posts for a given date (written weekly by the social writer task) replace the automatic one for that day.

## Finding gigs (Nov 2026)
- **Gigs near you** (homepage): remembers the visitor's city on their device, or guesses it from their time zone, and shows their next gigs from `gigs.json`. The newsletter city and gig guide default to it too.
- **Genres**: `genres/` pages. An artist's genre comes from the tour `genre` field or Ticketmaster first, then Discogs style tags (`data/discogs.json` `tags`), mapped to the buckets in `GENRES` in build.py. The gig guide has a genre filter (`gigs.json` column 12).
- **Presales**: homepage "Tickets on sale this week", the weekly email and artist alerts all use `upcoming_sales` (Ticketmaster plus tour `onsale`/`presales`). Artist alerts send when a presale or on-sale is within 3 days.
- **Mobile menu**: the header collapses into a Menu button under 760px.
- **Submit a gig** (`submit-a-gig.html`): the "gig" form is saved to Netlify Blobs by `submission-created`; the keep-cache plugin pulls submissions into `data/gig_submissions.json` (emails replaced by a hash) and build.py publishes those with a ticket link on a trusted ticketing site (`TRUSTED_TICKETS`). Past ones are deleted automatically.
- **My gigs** (`my-gigs.html`): ♡ save on gig rows, Follow on artist pages, "I'm going". Stored in the visitor's browser (`localStorage` key `llMy`). Discogs username → `/.netlify/functions/discogs-user` reads their public collection and wantlist; the page matches them to touring artists (`gigs.json`) and upcoming vinyl (`data/releases.json`).

## Accounts (Supabase, Nov 2026)
- Supabase project `livelouder` (Sydney), ref `qoqdouthyyaebmreavgz`. Schema in `supabase/schema.sql` (profiles, saved_gigs, followed_artists, sent_reminders; row level security so people only see their own rows; `delete_my_account()`).
- Browser: `src/account.js` (publishable key is public by design). Sign in with Google or an emailed link; first sign-in merges this device's saves into the account. Signed-out saves still live in `localStorage`.
- Emails: Supabase sends sign-in links through Resend SMTP (hello@livelouder.com.au); `netlify/functions/reminders.mjs` sends one daily email (8:30am Sydney) per person with saved gigs in the next 3 days, presales/on-sales in the next 36 hours and new tours for followed artists, using `site/data/alerts-feed.json`. Each item is sent once (`sent_reminders`).
- Netlify env: `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`. Google sign-in: Google Cloud project "Live Louder" (OAuth client "Live Louder website").
- Privacy policy: `privacy.html`.

## My gigs profile and venue gig finder (Nov 2026)
- `my-gigs.html` + `src/profile.js`: profile header with stats, tabs (Overview, Gigs, Artists, Records, Wantlist, Settings). Gigs you marked "going" stay after the date as "Been to". Records and wantlist come from Discogs (`discogs-user` function, `?u=` for shelves, `?release=` for the record view). Artist photos and next shows from `site/data/artists.json`.
- Venue gig finder: `data/venue_sources.json` (venues to watch; a daily scheduled task fills in each venue's gig page, checks ~15 venues a run, and adds new venues over time) writes `data/gigs_found.json`, which build.py merges into the guide (`src: "found"`).
- Records (Nov 2026): Live Louder keeps its own collection and wantlist (`MY.records` / `MY.wants` on the device; Supabase table `user_records` when signed in). Search any album through `discogs-user?q=` (Discogs masters), add with `data-addrec` buttons (My gigs search results, record view, artist pages' Essential records). "Import from Discogs" copies a public Discogs collection and wantlist in. Record view loads `?master=` or `?release=` for the tracklist.
- Gig pages (Nov 2026): every show has `/gig/<id>.html` with a big Get tickets button, price when Ticketmaster gives one ("at last check"), venue map, directions and "How far is it from me?" (browser location, only on tap), more dates, and MusicEvent schema for Google. Venue pages have the same map. Venue positions come from Ticketmaster or an OpenStreetMap lookup (`extras.geocode`, cached in `data/geo.json`, 40 new a build; `NO_GEOCODE=1` skips it locally). A venue photo shows when `data/venue_guides.json` has `photo` + `photo_credit`.

## Friends (added 27 Nov 2026)
- One-way follows, like Instagram. Profiles are **private until the person switches sharing on** (My gigs → Settings → "Your profile and friends": username, name, Share my profile).
- Shared profiles live at `livelouder.com.au/u/<username>` (`u/index.html` + `src/people.js`; the `/u/*` rule is in `netlify.toml`). They show upcoming gigs (going and interested), gigs been to, the record collection and wantlist, plus "In common" for signed-in visitors.
- My gigs → Friends tab (`src/profile.js`): share link, find friends, "Your friends are going", following and followers (follow back or remove).
- Database (`supabase/schema.sql`, Friends section): `profiles.username/display_name/share`, `follows` table, and functions `public_profile`, `find_people`, `my_people`, `follow_user`, `unfollow_user`. Other people only see a profile through these functions, which return nothing for private profiles and never return emails.
- Profile photo and cover banner (27 Nov 2026): uploaded from My gigs (camera button on the photo, "Add a cover photo" on the header, or Settings). Cropped and shrunk in the browser (photo 480×480, cover 1800×600 JPEG), stored in the Supabase Storage bucket `profile` under `<user id>/`. Only the owner can change their folder. URLs saved in `profiles.avatar_url` / `banner_url`. Old files are removed on change, and all of them on account deletion.
- Sharing is ON by default for accounts made from 27 Nov 2026 (they get a username from their name, never their email, e.g. `gigfan4821`). Older accounts keep their own setting.
- Photo safety (27 Nov 2026): uploads go through `netlify/functions/profile-photo.mjs`, which turns away blocked accounts and more than 6 uploads a day, then runs Google Cloud Vision SafeSearch (`GOOGLE_VISION_KEY` in Netlify). Clearly explicit or violent photos are rejected and never stored. Borderline ones, or every photo while the key isn't set, go live for the owner only and are emailed to Mick. `report-photo.mjs` hides a reported photo straight away and emails Mick (signed-in reporters, 10 a day). `photo-review.mjs` is the page the email links to: Keep / Remove / Remove and block. The database trigger `guard_profile_photos` stops anyone setting a photo except through the server. Review emails go to `MODERATION_EMAIL` (default mick@heathenrecords.com.au).

## Friends feed, gig diary, one-click start, app install (27 Nov 2026)
- `src/friends.js` (every page, only for signed-in people): "Sam and Jess are going" on any gig row, card or gig page (`friends_going`), and the homepage "From your friends" feed (`friends_feed`), which falls back to a small "Make Live Louder yours" / "Find friends" nudge. Records added the same day and photos from one gig are grouped into one feed item.
- Gig diary (My gigs → Gigs → Your gig diary): rate gigs you went to (1–5 stars), a one-line note, up to 4 photos per gig (checked by SafeSearch through `profile-photo.mjs?kind=gig`, table `gig_photos`), setlist.fm link. A "How was it?" prompt shows on the overview for gigs in the last two weeks. Shared profiles show the diary (`gig_diary`), and friends can report a gig photo.
- One-click start (My gigs overview, or /my-gigs.html#start): follow your top Last.fm artists (`netlify/functions/lastfm.mjs`, needs `LASTFM_API_KEY`), import Discogs, or tap from the most-toured artists.
- Gig pages: "Before the show" with four of the artist's essential records (+ Collection / + Wantlist / Find on vinyl at Heathen).
- App install: `src/sw.js` service worker (network first, offline fallback to cached pages and My gigs) and the manifest make the site installable; "Get the app" button in the menu when the browser offers it, and a "Live Louder on your phone" card in Settings with iPhone instructions.
- Gig finder now runs twice a day (1:37am and 1:37pm), 40 venues and up to 10 new venues each run.
