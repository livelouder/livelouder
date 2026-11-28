"""Builds the Live Louder static site into ./site.

Content:
  data/tours.json       hand-picked tours (with notes, support acts, sources)
  data/news.json        news briefs (written fresh, each linking its source)
  data/festivals.json   festival guides
  data/releases.json    upcoming vinyl releases
  data/stories.json     stories
  Ticketmaster feed     every Australian music show (src/feed.py, needs TICKETMASTER_KEY)
  Deezer lookups        artist players and photos (src/feed.py, no key needed)

Run: python3 build.py   (Netlify runs this on every deploy)
"""
import os, json, html, re, shutil, sys, hashlib, datetime as dt
from pathlib import Path
from urllib.parse import quote_plus, quote

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "src"))
import feed  # noqa: E402
import emails  # noqa: E402
import extras  # noqa: E402
import social  # noqa: E402

OUT = ROOT / "site"
SITE = "https://livelouder.com.au"
HEATHEN = "https://heathenrecords.com.au/search?type=product&q="
CITY_CENTRE = {"Sydney": (-33.8688, 151.2093), "Melbourne": (-37.8136, 144.9631), "Brisbane": (-27.4698, 153.0251), "Perth": (-31.9523, 115.8613),
               "Adelaide": (-34.9285, 138.6007), "Canberra": (-35.2809, 149.13), "Hobart": (-42.8821, 147.3272), "Darwin": (-12.4634, 130.8456),
               "Gold Coast": (-28.0167, 153.4), "Newcastle": (-32.9283, 151.7817), "Wollongong": (-34.4278, 150.8931), "Geelong": (-38.1499, 144.3617),
               "Sunshine Coast": (-26.65, 153.0667), "Cairns": (-16.9186, 145.7781), "Townsville": (-19.259, 146.8169), "Launceston": (-41.4332, 147.1441),
               "Byron Bay": (-28.6474, 153.602), "Ballarat": (-37.5622, 143.8503), "Bendigo": (-36.757, 144.2794), "Katoomba": (-33.7148, 150.3118),
               "Springwood": (-33.6996, 150.5636), "Lithgow": (-33.4823, 150.1566), "Penrith": (-33.7507, 150.6877), "Parramatta": (-33.815, 151.0011)}
NOW_UTC = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
TODAY = NOW_UTC + dt.timedelta(hours=10)  # Australian east-coast date at build
TODAY_S = TODAY.date().isoformat()
UPDATED = TODAY.strftime("%-d %B %Y")
TZ = {"NSW": "Australia/Sydney", "ACT": "Australia/Sydney", "VIC": "Australia/Melbourne", "QLD": "Australia/Brisbane",
      "SA": "Australia/Adelaide", "WA": "Australia/Perth", "TAS": "Australia/Hobart", "NT": "Australia/Darwin"}
CITY_GEO = {m[0]: (m[2], m[3]) for m in feed.METROS}
CITY_GEO.update({"Fremantle": (-32.0569, 115.7439), "Meredith": (-37.84, 144.08), "Thirroul": (-34.32, 150.92), "Auckland": None})
CITY_STATE = {m[0]: m[1] for m in feed.METROS}
CITY_STATE.update({"Fremantle": "WA", "Meredith": "VIC", "Thirroul": "NSW"})

e = lambda s: html.escape(str(s), quote=True)
def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and").replace("'", "")).strip("-") or "x"
def d(s): return dt.date.fromisoformat(s)
def fmt(s, wd=True, yr=True):
    x = d(s)
    return (x.strftime("%a ") if wd else "") + f"{x.day} {x.strftime('%b')}" + (x.strftime(" %Y") if yr else "")
def hue(name): return int(hashlib.md5(name.encode()).hexdigest()[:4], 16) % 360
def plain(h): return re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", h)).strip()

# ---------------------------------------------------------------- data
tours = json.loads((ROOT / "data/tours.json").read_text())
rels = json.loads((ROOT / "data/releases.json").read_text())
stories = json.loads((ROOT / "data/stories.json").read_text())
news = sorted(json.loads((ROOT / "data/news.json").read_text()), key=lambda n: n["date"], reverse=True)
fests = json.loads((ROOT / "data/festivals.json").read_text())
picks_all = json.loads((ROOT / "data/picks.json").read_text()) if (ROOT / "data/picks.json").exists() else []
picks_all.sort(key=lambda x: x["date"], reverse=True)
pick = picks_all[0] if picks_all and picks_all[0]["date"] >= (TODAY.date() - dt.timedelta(days=14)).isoformat() else None
vguides = json.loads((ROOT / "data/venue_guides.json").read_text()) if (ROOT / "data/venue_guides.json").exists() else {}
tm = feed.fetch(ROOT)

shows = []
for t in tours:
    for dd, c, v in t["dates"]:
        shows.append({"id": f"c-{slug(t['artist'])}-{dd}-{slug(c)}", "artist": t["artist"], "event": t["tour"],
                      "support": [t["support"]] if t.get("support") else [], "date": dd, "time": "", "venue": v,
                      "suburb": c, "city": c, "state": CITY_STATE.get(c, ""), "url": t["source"], "image": "",
                      "genre": t.get("genre", ""), "onsale": "", "presales": [], "status": "", "src": "curated"})
# Gigs sent in through the "Submit a gig" form (pulled from Netlify Blobs by the keep-cache plugin).
# They go live automatically when the ticket link is on a real ticketing site and the details check out;
# anything else is held back.
TRUSTED_TICKETS = ("oztix.com.au", "moshtix.com.au", "ticketmaster.com.au", "ticketek.com.au", "humanitix.com", "eventbrite.com",
                   "eventbrite.com.au", "trybooking.com", "megatix.com.au", "dice.fm", "ticketebo.com.au", "stickytickets.com.au",
                   "eventfinda.com.au", "ticketfairy.com", "showclix.com", "tix.com.au", "livenation.com.au", "frontiertouring.com",
                   "teglive.com.au", "chuggentertainment.com", "secretsounds.com", "destroyalllines.com", "handsometours.com",
                   "premier.ticketek.com.au", "qtix.com.au", "ticketsearch.com", "venuetix.com.au", "tickets.oztix.com.au")
subs = json.loads((ROOT / "data/gig_submissions.json").read_text()) if (ROOT / "data/gig_submissions.json").exists() else []
sub_ok, sub_held, per_sender = [], [], {}
limit_day = (TODAY.date() + dt.timedelta(days=550)).isoformat()
for x in sorted(subs, key=lambda x: x.get("received", "")):
    url = x.get("ticket_url", "")
    host = re.sub(r"^www\.", "", (re.match(r"https://([^/]+)", url) or [None, ""])[1].lower())
    city = x.get("city", "")
    if city not in CITY_STATE:
        city = x.get("town", "").strip().title()
    state = CITY_STATE.get(city) or x.get("state", "")
    per_sender[x.get("email_hash", "")] = per_sender.get(x.get("email_hash", ""), 0) + 1
    ok = (re.fullmatch(r"\d{4}-\d{2}-\d{2}", x.get("date", "")) and TODAY_S <= x["date"] <= limit_day
          and any(host == h or host.endswith("." + h) for h in TRUSTED_TICKETS)
          and 1 < len(x.get("artist", "")) < 80 and 1 < len(x.get("venue", "")) < 100 and city and state
          and per_sender[x.get("email_hash", "")] <= 30 and not re.search(r"https?://|<|>", x["artist"] + x["venue"]))
    if not ok:
        sub_held.append(x)
        continue
    tm_time = x.get("time", "") if re.fullmatch(r"\d{2}:\d{2}", x.get("time", "")) else ""
    sub_ok.append({"id": f"s-{slug(x['artist'])}-{x['date']}-{slug(city)}", "artist": x["artist"].strip(), "event": "",
                   "support": [x["support"].strip()] if x.get("support", "").strip() else [], "date": x["date"], "time": tm_time,
                   "venue": x["venue"].strip(), "suburb": city, "city": city, "state": state, "url": url, "image": "",
                   "genre": x.get("genre", ""), "onsale": "", "presales": [], "status": "", "src": "submitted"})
tm_keys = {(slug(s["artist"]), s["date"], s["city"]) for s in tm}
shows = [s for s in shows if (slug(s["artist"]), s["date"], s["city"]) not in tm_keys] + tm
have_keys = {(slug(s["artist"]), s["date"], s["city"]) for s in shows}
shows += [s for s in sub_ok if (slug(s["artist"]), s["date"], s["city"]) not in have_keys]
# Gigs found on venue and ticketing pages by the daily venue gig finder task (data/gigs_found.json).
found = json.loads((ROOT / "data/gigs_found.json").read_text()) if (ROOT / "data/gigs_found.json").exists() else []
have_keys = {(slug(s["artist"]), s["date"], s["city"]) for s in shows}
n_found = 0
for x in found:
    try:
        if not (x.get("artist") and x.get("venue") and x.get("city") and x.get("url", "").startswith("https://")
                and re.fullmatch(r"\d{4}-\d{2}-\d{2}", x.get("date", "")) and x["date"] >= TODAY_S):
            continue
        k = (slug(x["artist"]), x["date"], x["city"])
        if k in have_keys:
            continue
        have_keys.add(k)
        shows.append({"id": f"f-{slug(x['artist'])}-{x['date']}-{slug(x['city'])}", "artist": x["artist"].strip(), "event": "",
                      "support": [x["support"].strip()] if x.get("support", "").strip() else [], "date": x["date"],
                      "time": x.get("time", "") if re.fullmatch(r"\d{2}:\d{2}", x.get("time", "")) else "", "venue": x["venue"].strip(),
                      "suburb": x.get("suburb") or x["city"], "city": x["city"], "state": x.get("state") or CITY_STATE.get(x["city"], ""),
                      "url": x["url"], "image": "", "genre": x.get("genre", ""), "onsale": "", "presales": [], "status": "", "src": "found"})
        n_found += 1
    except Exception as ex:
        print("gigs_found: skipped a row", ex)
shows = [s for s in shows if s["date"] >= TODAY_S]
shows.sort(key=lambda s: (s["date"], s["time"] or "99", s["artist"].lower()))

curated = {slug(t["artist"]): t for t in tours}
artists = {}
for s in shows:
    a = artists.setdefault(slug(s["artist"]), {"name": s["artist"], "slug": slug(s["artist"]), "shows": [], "image": "", "genre": ""})
    a["shows"].append(s)
    a["image"] = a["image"] or s["image"]
    a["genre"] = a["genre"] or s["genre"]
for k, t in curated.items():
    artists.setdefault(k, {"name": t["artist"], "slug": k, "shows": [], "image": "", "genre": t.get("genre", "")})
for a in artists.values():
    a["tour"] = curated.get(a["slug"])
    a["cities"] = sorted({s["city"] for s in a["shows"]})
    a["genre"] = a["genre"] or (a["tour"] or {}).get("genre", "")

# Deezer players and photos: hand-picked artists first, then the busiest touring artists.
ranked = [a["name"] for a in artists.values() if a["tour"]] + \
         [a["name"] for a in sorted(artists.values(), key=lambda a: -len(a["shows"])) if not a["tour"]][:150]
dz = feed.deezer_lookup(ranked, ROOT)
for a in artists.values():
    hit = dz.get(a["name"])
    a["deezer"] = hit["id"] if hit else None
    a["photo"] = a["image"] or (hit or {}).get("picture", "")

# setlist.fm and Discogs extras (only when their keys are set in Netlify)
extra_names = ranked[:80]
SETS = extras.setlists(extra_names, ROOT)
DISCOGS = extras.discogs(extra_names, ROOT)
REL_DG = extras.discogs_releases([i for i in rels["items"] if i[0] == "2027" or i[0] >= (TODAY.date() - dt.timedelta(days=28)).isoformat()], ROOT)
for a in artists.values():
    a["setlist"] = (SETS.get(a["name"]) or {}).get("set")
    a["discogs"] = DISCOGS.get(a["name"]) or {}

# Genres people browse by. An artist's genre comes from the tour data or Ticketmaster first, then Discogs tags.
GENRES = [("Metal & heavy", r"metal|hardcore|thrash|doom|deathcore|djent|nu metal"),
          ("Punk", r"(?<!post-)(?<!post )punk|\bska\b|\bemo\b"),
          ("Hip hop & R&B", r"hip.?hop|rap\b|r&b|rnb|trap\b|grime"),
          ("Electronic & dance", r"electro|dance|house|techno|edm|trance|drum n bass|dubstep|synth.?wave|disco"),
          ("Country & folk", r"country|folk|americana|bluegrass|singer.?songwriter"),
          ("Soul, blues & jazz", r"soul|blues|jazz|gospel|funk"),
          ("Indie & alternative", r"indie|alternative|post.?punk|shoegaze|grunge|dream pop|lo.?fi|garage"),
          ("Pop", r"pop"),
          ("Rock", r"rock|psychedelic|britpop")]
def genre_bucket(text):
    t = (text or "").lower()
    for name, rx in GENRES:
        if re.search(rx, t):
            return name
    return ""
for a in artists.values():
    g = genre_bucket(a["genre"])
    if not g:
        votes = {}
        for tag, n in (a["discogs"].get("tags") or []):
            b = genre_bucket(tag)
            if b:
                votes[b] = votes.get(b, 0) + n
        g = max(votes, key=votes.get) if votes else ""
    a["gb"] = g
GENRE_HUE = {g: (i * 41 + 8) % 360 for i, (g, _) in enumerate(GENRES)}
GENRE_LIST = [g for g, _ in GENRES if any(a["gb"] == g and a["shows"] for a in artists.values())]

def venue_slug(s): return slug(s["venue"] + "-" + s["city"])
def gig_path(s): return f"/gig/{slug(s['id'])}.html"
venues = {}
for s in shows:
    v = venues.setdefault(venue_slug(s), {"name": s["venue"], "city": s["city"], "suburb": s["suburb"], "state": s.get("state", ""), "shows": []})
    v["shows"].append(s)
    if s.get("lat") and not v.get("geo"):
        try: v["geo"] = [round(float(s["lat"]), 5), round(float(s["lon"]), 5)]
        except (TypeError, ValueError): pass
# Map positions for venues Ticketmaster didn't give us (OpenStreetMap lookup, cached).
_geo = extras.geocode({k: (v["name"], v["suburb"], v["city"], v["state"]) for k, v in venues.items() if not v.get("geo")}, ROOT,
                      limit=0 if os.environ.get("NO_GEOCODE") else 120)
for k, v in venues.items():
    if not v.get("geo") and _geo.get(k):
        v["geo"] = _geo[k]

city_count = {}
for s in shows:
    city_count[s["city"]] = city_count.get(s["city"], 0) + 1
MAIN_CITIES = [m[0] for m in feed.METROS if city_count.get(m[0])]
if len(MAIN_CITIES) < 5:
    MAIN_CITIES = ["Sydney", "Melbourne", "Brisbane", "Adelaide", "Perth"]
have_feed = bool(tm)

# ---------------------------------------------------------------- helpers
NAV = [("Gigs", "gigs/index.html"), ("Tours & festivals", "tours.html"), ("News", "news/index.html"), ("Vinyl", "out-soon.html")]
# Pages that live under each menu item (for highlighting the menu, and the small sub-menu under the header).
NAV_GROUP = {"this-weekend.html": "gigs/index.html", "on-sale.html": "gigs/index.html", "genres/index.html": "gigs/index.html",
             "gigs/regional.html": "gigs/index.html", "venues/index.html": "gigs/index.html", "submit-a-gig.html": "gigs/index.html",
             "festivals/index.html": "tours.html", "artists/index.html": "tours.html", "most-wanted.html": "out-soon.html", "stories/index.html": "news/index.html"}
SUBNAV = {"gigs/index.html": [("Gig guide", "gigs/index.html"), ("📍 Near me", "index.html#near"), ("This weekend", "this-weekend.html"), ("Regional", "gigs/regional.html"),
                              ("Venues", "venues/index.html"), ("On sale soon", "on-sale.html"), ("Genres", "genres/index.html"), ("Submit a gig", "submit-a-gig.html")],
          "tours.html": [("Tours", "tours.html"), ("Festivals", "festivals/index.html"), ("Artists A–Z", "artists/index.html")],
          "out-soon.html": [("Out soon on vinyl", "out-soon.html"), ("Most wanted", "most-wanted.html")],
          "news/index.html": [("News", "news/index.html"), ("Stories", "stories/index.html")]}

def gcal(s, a_name):
    day = d(s["date"])
    if s["time"]:
        h, m = map(int, s["time"].split(":"))
        st = dt.datetime(day.year, day.month, day.day, h, m)
        dates = f"{st:%Y%m%dT%H%M%S}/{st + dt.timedelta(hours=3):%Y%m%dT%H%M%S}"
    else:
        dates = f"{day:%Y%m%d}/{day + dt.timedelta(days=1):%Y%m%d}"
    q = {"action": "TEMPLATE", "text": f"{a_name} live", "dates": dates,
         "location": f"{s['venue']}, {s['suburb']}", "details": f"Tickets and info: {s['url']}"}
    tz = TZ.get(s["state"])
    if tz and s["time"]:
        q["ctz"] = tz
    return "https://calendar.google.com/calendar/render?" + "&".join(f"{k}={quote(str(v))}" for k, v in q.items())

def ics(a):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Live Louder//livelouder.com.au//EN", f"X-WR-CALNAME:{a['name']} – Live Louder"]
    for s in a["shows"]:
        day = d(s["date"])
        lines += ["BEGIN:VEVENT", f"UID:{s['id']}@livelouder.com.au", f"DTSTAMP:{NOW_UTC:%Y%m%dT%H%M%SZ}",
                  f"DTSTART;VALUE=DATE:{day:%Y%m%d}", f"DTEND;VALUE=DATE:{day + dt.timedelta(days=1):%Y%m%d}",
                  f"SUMMARY:{a['name']} live", f"LOCATION:{s['venue']}\\, {s['suburb']}", f"URL:{s['url']}", "END:VEVENT"]
    return "\r\n".join(lines + ["END:VCALENDAR"]) + "\r\n"

def signup_band(r):
    opts = "".join(f"<option>{e(c)}</option>" for c in MAIN_CITIES)
    return (f'<section class="band signup"><div class="wrap signwrap"><div><h2>Live Louder Weekly</h2><p>Every Thursday: what\'s been announced, '
            f'what goes on sale, what\'s out on vinyl, and one good read. Free, and easy to unsubscribe.</p></div>'
            f'<form name="newsletter" method="POST" action="{r}thanks.html" data-netlify="true" netlify-honeypot="bot-field" class="sform">'
            f'<input type="hidden" name="form-name" value="newsletter"><p hidden><label>Leave this empty <input name="bot-field"></label></p>'
            f'<input type="email" name="email" required placeholder="Your email" aria-label="Email address">'
            f'<select name="city" aria-label="Your city"><option value="">Your city (optional)</option>{opts}</select>'
            f'<button>Sign me up</button></form></div></section>')

# Every link to Heathen Records carries tracking tags, so Shopify shows how many visits and sales came from Live Louder.
HEATHEN_LINK = re.compile(r'href="(https://(?:www\.)?heathenrecords\.com\.au[^"]*)"')
def _utm(m, campaign):
    url = m.group(1)
    if "utm_source=" in url:
        return m.group(0)
    return f'href="{url}{"&" if "?" in url else "?"}utm_source=livelouder&utm_medium=referral&utm_campaign={campaign}"'

# Links to other websites open in a new tab; links within Live Louder stay in the same tab.
EXT_LINK = re.compile(r'<a ([^>]*?)href="(https?://[^"]+)"([^>]*)>')
def _new_tab(m):
    before, url, after = m.groups()
    if url.startswith(SITE) or "target=" in before + after:
        return m.group(0)
    attrs = before + 'href="' + url + '"' + after
    if "rel=" in attrs:
        attrs = re.sub(r'rel="([^"]*)"', lambda r: 'rel="' + " ".join(dict.fromkeys(r.group(1).split() + ["noopener"])) + '"', attrs)
    else:
        attrs += ' rel="noopener"'
    return f'<a {attrs} target="_blank">'

# Google Analytics 4 (property "Live Louder"). Also sends a few named events: ticket clicks, saved gigs, followed artists, form sends.
GA_ID = "G-236J3ZHG27"
GA_HEAD = ("" if not GA_ID else
    f'<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>'
    "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());"
    f"gtag('config','{GA_ID}');"
    "document.addEventListener('click',function(ev){try{var t=ev.target.closest('a,button');if(!t)return;"
    "var g=t.closest('.gig,.gp,main');var art=(g&&g.querySelector('.gname,h1')||{}).textContent||document.title;"
    "if(t.tagName==='A'&&t.host&&t.host!==location.host&&/ticket|details/i.test(t.textContent)){gtag('event','ticket_click',{artist:art.trim().slice(0,100),link_url:t.href});}"
    "else if(t.matches('button.save')){gtag('event','save_gig',{artist:art.trim().slice(0,100)});}"
    "else if(t.matches('button.saveartist')){gtag('event','follow_artist',{artist:(t.dataset.name||'').slice(0,100)});}"
    "}catch(e){}},true);"
    "document.addEventListener('submit',function(ev){try{var f=ev.target,n=f.getAttribute('name')||'';"
    "if(n==='newsletter')gtag('event','sign_up',{method:'newsletter'});else if(n)gtag('event','form_'+n);}catch(e){}},true);</script>")


def _km(a, b):
    import math
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))

# ---------------------------------------------------------------- page banners (Nov 2026)
# The top of most pages is a picture banner instead of plain red. Three safe styles, so faces are never cut off:
#   row   - whole square photos side by side (artists on that page), never cropped
#   wall  - record covers in a tilted grid (vinyl pages)
#   blur  - one photo shown whole and sharp, over a lightly blurred copy of itself (news)
#   photo - one real landscape photo: the region for city, town and venue pages; a fixed one for the rest
# Photos: Unsplash (free licence, no credit needed); artist photos and covers come from the page itself.
UNS = lambda id_, w=1800: f"https://images.unsplash.com/photo-{id_}?w={w}&q=70&auto=format&fit=crop"
REGION_PICS = {"sydney": "1506973035872-a4ec16b8e8d9", "melbourne": "1595434971780-79d5c20c5090", "brisbane": "1566734904496-9309bb1798ae",
    "perth": "1524586410818-196d249560e4", "adelaide": "1677893111398-0ebb0ed2aa85", "hobart": "1728555429641-391c49d9754a",
    "canberra": "1773821023994-bffda5c96617", "nt": "1557214997-7eae7e0e7aaa", "newcastle": "1624706495494-7a143e8ed526",
    "wollongong": "1671524916677-a51d1d1b3db6", "centralcoast": "1729581203722-e728a5ccf5d5", "byron": "1786637706242-468806f00769",
    "goldcoast": "1759222977031-234980be6ddc", "sunshine": "1607014593352-adca51a032bd", "geelong": "1511233389693-4a066f739752",
    "bluemts": "1665395492464-fa1da74d2e5c", "northqld": "1727523368539-ee9fcef8ed67", "cairns": "1688337707006-64d5a1f6582c",
    "launceston": "1675665121651-55b2cec1bcd5", "NSW": "1560160266-62102d011867", "QLD": "1775990694711-5b59dcdd9d88",
    "VIC": "1592660716806-9d25f5a0e124", "WA": "1776679768423-114637549209", "SA": "1472352327492-9765783b74e1",
    "TAS": "1701389357376-5b72922c5c8a", "NT": "1557214997-7eae7e0e7aaa", "ACT": "1773821023994-bffda5c96617"}
REGION_LABEL = {"sydney": "Sydney, NSW", "melbourne": "Melbourne, VIC", "brisbane": "Brisbane, QLD", "perth": "Perth, WA", "adelaide": "Adelaide, SA",
    "hobart": "Hobart, TAS", "canberra": "Canberra, ACT", "nt": "Northern Territory", "newcastle": "Newcastle & Hunter, NSW",
    "wollongong": "Illawarra, NSW", "centralcoast": "Central Coast, NSW", "byron": "Northern Rivers, NSW", "goldcoast": "Gold Coast, QLD",
    "sunshine": "Sunshine Coast, QLD", "geelong": "Geelong & Surf Coast, VIC", "bluemts": "Blue Mountains, NSW", "northqld": "North Queensland",
    "cairns": "Far North Queensland", "launceston": "Northern Tasmania", "NSW": "New South Wales", "QLD": "Queensland", "VIC": "Victoria",
    "WA": "Western Australia", "SA": "South Australia", "TAS": "Tasmania", "NT": "Northern Territory", "ACT": "Canberra, ACT"}
# Region centres and how far (km) each reaches. Nearest one in reach wins; otherwise the state's photo.
REGIONS = [("bluemts", -33.71, 150.31, 35), ("sydney", -33.87, 151.21, 60), ("melbourne", -37.81, 144.96, 60), ("brisbane", -27.47, 153.03, 50),
    ("perth", -31.95, 115.86, 60), ("adelaide", -34.93, 138.60, 50), ("hobart", -42.88, 147.33, 50), ("canberra", -35.28, 149.13, 40),
    ("nt", -12.46, 130.84, 2500), ("newcastle", -32.93, 151.78, 70), ("wollongong", -34.43, 150.89, 45), ("centralcoast", -33.43, 151.34, 30),
    ("byron", -28.64, 153.61, 70), ("goldcoast", -28.02, 153.40, 35), ("sunshine", -26.65, 153.07, 45), ("geelong", -38.15, 144.36, 70),
    ("northqld", -19.26, 146.82, 250), ("cairns", -16.92, 145.78, 200), ("launceston", -41.43, 147.14, 90)]
FIXED_PICS = {"venues/index.html": "1499364615650-ec38552f4f34", "festivals/index.html": "1533174072545-7a4b6ad7a6c3",
    "gigs/regional.html": "1665395492464-fa1da74d2e5c", "stories/index.html": "1603048588665-791ca8aea617"}
CROWDS = ["1470229722913-7c0e2dbbafd3", "1540039155733-5bb30b53aa14", "1499364615650-ec38552f4f34"]
PLACE = None  # set just before page() for city, town and venue pages: ((lat, lon), state)

def region_for(place):
    (c, st) = place
    best = None
    if c:
        for k, la, lo, r in REGIONS:
            dd = _km(c, (la, lo))
            if dd <= r and (best is None or dd < best[1]):
                best = (k, dd)
    k = best[0] if best else (st or "NSW")
    return k if k in REGION_PICS else "NSW"

_ROW_DEFAULT = None
def row_default():
    """Photos of artists playing soonest, for pages whose lists are drawn in the browser (the gig guide)."""
    global _ROW_DEFAULT
    if _ROW_DEFAULT is None:
        seen_, out_ = set(), []
        for s_ in shows:
            a_ = artists.get(slug(s_["artist"])) or {}
            if a_.get("photo") and a_["slug"] not in seen_:
                seen_.add(a_["slug"]); out_.append(a_["photo"])
            if len(out_) >= 10: break
        _ROW_DEFAULT = out_
    return _ROW_DEFAULT

def banner(path, body):
    """Opening tag + picture layer for the page-title banner, or None to leave it plain."""
    dz = lambda u: re.sub(r"/1000x1000-", "/500x500-", u)
    photos = list(dict.fromkeys(dz(u) for u in re.findall(r'https://cdn-images\.dzcdn\.net/images/artist/[0-9a-f]+/1000x1000-[^"&]+', body)))
    covers = list(dict.fromkeys(re.findall(r'https://i\.discogs\.com/[^"&\s]+', body)))
    def photo(id_, label="", pos="center"):
        tag = f'<span class="pbtag">{e(label)}</span>' if label else ""
        return (f'<section class="page-title pb pb-photo" style="background-image:url(&quot;{UNS(id_)}&quot;);background-position:{pos}">', tag)
    def row(list_):
        list_ = (list_ * 3)[:10]
        return ('<section class="page-title pb pb-row"><div class="pbg" aria-hidden="true">' +
                "".join(f'<span style="background-image:url(&quot;{e(u)}&quot;)"></span>' for u in list_) + '</div>', "")
    if PLACE:
        k = region_for(PLACE)
        return photo(REGION_PICS[k], REGION_LABEL[k], "center 55%")
    if path in FIXED_PICS:
        return photo(FIXED_PICS[path])
    if path in ("out-soon.html", "most-wanted.html") and len(covers) < 4:
        return photo("1603048588665-791ca8aea617")
    if path in ("out-soon.html", "most-wanted.html"):
        list_ = (covers * 4)[:16]
        return ('<section class="page-title pb pb-wall"><div class="pbg" aria-hidden="true">' +
                "".join(f'<span style="background-image:url(&quot;{e(u)}&quot;)"></span>' for u in list_) + '</div>', "")
    if path == "news/index.html" and photos:
        u = photos[0]
        return (f'<section class="page-title pb pb-blur"><div class="pbg" aria-hidden="true" style="background-image:url(&quot;{e(u)}&quot;)"></div>'
                f'<img class="pbsharp" src="{e(u)}" alt="" aria-hidden="true">', "")
    if path in ("tours.html", "on-sale.html", "this-weekend.html", "artists/index.html") or path.startswith("genres/") or path.endswith("-this-weekend.html"):
        if len(photos) >= 4: return row(photos)
        return row(row_default()) if len(row_default()) >= 4 else photo(CROWDS[0], "", "center 40%")
    if path == "gigs/index.html":
        return row(row_default()) if len(row_default()) >= 4 else photo(CROWDS[0], "", "center 40%")
    if path == "news/index.html":
        return photo(CROWDS[1], "", "center 40%")
    if path.startswith("news/") or path.startswith("artists/") or path.startswith("gig/") or path.startswith("festivals/") or path.startswith("stories/"):
        return None  # these have their own heroes
    return photo(CROWDS[hue(path) % len(CROWDS)], "", "center 40%")

def page(path, title, desc, body, active=None, extra_head="", image=""):
    global PLACE
    if '<section class="page-title">' in body:
        b_ = banner(path, body)
        if b_:
            open_, tag_ = b_
            body = body.replace('<section class="page-title"><div class="wrap">', open_ + '<div class="wrap">' + tag_, 1)
    PLACE = None
    r = "../" * path.count("/")
    group = NAV_GROUP.get(active, active)
    nav = "".join(f'<a href="{r}{h}"{" aria-current=page" if h == group else ""}>{e(n)}</a>' for n, h in NAV)
    subnav = ""
    if group in SUBNAV:
        subnav = ('<nav class="subnav" aria-label="In this section"><div class="wrap">' + "".join(
            f'<a href="{r}{h}"{" aria-current=page" if h == path else ""}>{e(n)}</a>' for n, h in SUBNAV[group]) + '</div></nav>')
    canon = SITE + "/" + ("" if path == "index.html" else path.replace("index.html", ""))
    body = body.replace('href="/', 'href="' + r).replace('src="/', 'src="' + r).replace('action="/', 'action="' + r)
    og_img = f'<meta property="og:image" content="{e(image)}">' if image.startswith("http") else ""
    credit = "Event data from Ticketmaster. Music previews from Deezer." if have_feed else "Music previews from Deezer."
    cities = " · ".join(f'<a href="{r}gigs/{slug(c)}.html">{e(c)}</a>' for c in MAIN_CITIES[:8]) + f' · <a href="{r}gigs/regional.html">Regional</a>'
    doc = f"""<!DOCTYPE html>
<html lang="en-AU"><head>{GA_HEAD}<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:site_name" content="Live Louder"><meta property="og:url" content="{canon}">{og_img}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="alternate" type="application/rss+xml" title="Live Louder news" href="{SITE}/news/feed.xml">
<link rel="icon" href="{r}favicon.ico" sizes="48x48"><link rel="icon" href="{r}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{r}apple-touch-icon.png"><link rel="manifest" href="{r}site.webmanifest"><meta name="theme-color" content="#141414">
<link rel="stylesheet" href="{r}style.css">{extra_head}</head><body data-root="{r}">
<header class="top"><div class="wrap"><a class="wm" href="{r}index.html">LIVE <span>LOUDER</span></a>
<a class="mylink" href="{r}my-gigs.html"><span aria-hidden="true">♥</span> My gigs<span class="mycount" hidden></span></a>
<a class="msglink" href="{r}messages.html" hidden aria-label="Messages" title="Messages"><span aria-hidden="true">💬</span><span class="msgcount" hidden></span></a>
<button class="menu" type="button" aria-expanded="false" aria-controls="mainnav"><span aria-hidden="true">☰</span> Menu</button><nav id="mainnav" aria-label="Main">{nav}<button class="installbtn" type="button" hidden>📲 Get the app</button></nav>
<form class="hsearch" action="{r}gigs/index.html" role="search"><input type="search" name="q" placeholder="Search gigs" aria-label="Search gigs"></form></div></header>{subnav}
<main>{body}</main>
{signup_band(r)}
<footer class="foot"><div class="wrap"><div><div class="wm">LIVE <span>LOUDER</span></div>
<p>An independent Australian music site: news, gigs, tours, festivals, new vinyl and stories, made in the Blue Mountains, NSW.</p>
<p>Dates change. Always check with the official ticket seller before you buy. Updated {UPDATED}.</p><p>{credit}</p></div>
<div><p><a href="{r}gigs/index.html">Gig guide</a> · <a href="{r}this-weekend.html">This weekend</a> · <a href="{r}on-sale.html">On sale</a> · <a href="{r}tours.html">Tours</a> · <a href="{r}festivals/index.html">Festivals</a> · <a href="{r}genres/index.html">Genres</a> · <a href="{r}gigs/regional.html">Regional gigs</a> · <a href="{r}venues/index.html">Venues</a> · <a href="{r}artists/index.html">Artists A–Z</a> · <a href="{r}news/index.html">News</a> · <a href="{r}out-soon.html">Vinyl</a> · <a href="{r}most-wanted.html">Most wanted</a> · <a href="{r}stories/index.html">Stories</a> · <a href="{r}submit-a-gig.html">Submit a gig</a> · <a href="{r}about.html">About</a> · <a href="{r}privacy.html">Privacy</a></p>
<p>Gigs by city: {cities}</p>
<p>Records for the drive to the show: our friends at <a href="https://heathenrecords.com.au">Heathen Records</a>.</p>
<p>© {TODAY.year} Live Louder</p></div></div></footer>
<script src="{r}app.js" defer></script><script src="{r}account.js" defer></script><script src="{r}friends.js" defer></script></body></html>"""
    doc = HEATHEN_LINK.sub(lambda m: _utm(m, "site"), doc)
    doc = EXT_LINK.sub(_new_tab, doc)
    p = OUT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(doc)

def art(a, cls="art"):
    """Artist picture, or a coloured poster-style card when there's no photo."""
    if a.get("photo"):
        return f'<div class="{cls}"><img src="{e(a["photo"])}" alt="{e(a["name"])}" loading="lazy"></div>'
    h = hue(a["name"])
    initials = "".join(w[0] for w in re.findall(r"[A-Za-z0-9]+", a["name"])[:2]).upper()
    return f'<div class="{cls} poster" style="--h:{h}" aria-hidden="true"><span>{e(initials)}</span></div>'

def stub(s):
    x = d(s["date"])
    return (f'<a class="stub" data-date="{s["date"]}" href="/artists/{slug(s["artist"])}.html"><div class="d"><b>{x.day}</b>'
            f'<small>{x.strftime("%b")}</small></div><div class="i"><strong>{e(s["artist"])}</strong>'
            f'<span>{e(s["city"])} · {e(s["venue"])}</span></div></a>')

def big_img(a):
    for s_ in (a or {}).get("shows", []):
        if s_.get("image_big") or s_.get("image"):
            return s_.get("image_big") or s_.get("image")
    return ""

def gcard(s, extra=""):
    """Picture card for a gig (homepage): artist photo, else venue photo, else a colourful poster with initials."""
    x = d(s["date"])
    a_ = artists.get(slug(s["artist"])) or {}
    u_ = a_.get("photo") or big_img(a_) or (vguides.get(venue_slug(s)) or {}).get("photo", "")
    u_ = re.sub(r"/1000x1000-", "/500x500-", u_)
    if u_:
        face = f'<span class="gcpic" style="background-image:url(&quot;{e(u_)}&quot;)"></span>'
    else:
        ini = "".join(w[0] for w in re.findall(r"[A-Za-z0-9]+", s["artist"])[:2]).upper()
        face = f'<span class="gcpic poster" style="--h:{hue(s["artist"])}"><span>{e(ini)}</span></span>'
    return (f'<a class="gcard{extra}" data-date="{s["date"]}" href="{gig_path(s)}">{face}<span class="gcd"><b>{x.day}</b><small>{x.strftime("%b")}</small></span>'
            f'<span class="gcin"><strong>{e(s["artist"])}</strong><span>{x.strftime("%a")} · {e(s["venue"])}, {e(s["city"])}</span></span></a>')

def gthumb(s):
    """Small square picture for a gig row: artist photo, else venue photo, else a colourful poster with initials."""
    a_ = artists.get(slug(s["artist"])) or {}
    u_ = re.sub(r"/1000x1000-", "/250x250-", a_.get("photo") or big_img(a_) or (vguides.get(venue_slug(s)) or {}).get("photo", ""))
    if u_:
        return f'<a class="gth" href="{gig_path(s)}" tabindex="-1" aria-hidden="true"><img src="{e(u_)}" alt="" loading="lazy" width="58" height="58"></a>'
    ini = "".join(w[0] for w in re.findall(r"[A-Za-z0-9]+", s["artist"])[:2]).upper()
    return f'<a class="gth poster" href="{gig_path(s)}" tabindex="-1" aria-hidden="true" style="--h:{hue(s["artist"])}"><span>{e(ini)}</span></a>'

def gig_row(s, show_artist=True, show_city=True):
    who = f'<a class="gname" href="{gig_path(s)}">{e(s["artist"])}</a>' if show_artist else ""
    sup = f'<span class="gsup">with {e(", ".join(s["support"]))}</span>' if s["support"] and show_artist else ""
    where = f'<a class="vlink" href="/venues/{venue_slug(s)}.html">{e(s["venue"])}</a>' + (", " + e(s["city"]) if show_city else "")
    wd = d(s["date"]).strftime("%a")
    t = f" · {wd} {e(s['time'])}" if s["time"] else f" · {wd}"
    sale = ""
    if s["onsale"] and s["onsale"][:10] > TODAY_S:
        sale = f'<span class="tag">On sale {fmt(s["onsale"][:10], False, False)}</span>'
    label = "Tickets" if s["src"] in ("ticketmaster", "submitted", "found") else "Details"
    snap = json.dumps({"id": s["id"], "d": s["date"], "tm": s["time"], "a": s["artist"], "s": slug(s["artist"]), "v": s["venue"],
                       "c": s["city"], "u": s["url"], "vs": venue_slug(s), "p": gig_path(s)}, separators=(",", ":"))
    save = f'<button class="save" type="button" data-gig="{e(snap)}" aria-pressed="false" title="Save to My gigs" aria-label="Save to My gigs">♡</button>'
    return (f'<li class="gig{" th" if show_artist else ""}" data-date="{s["date"]}" data-city="{e(s["city"])}"><a class="gd" href="{gig_path(s)}" aria-label="Gig details"><b>{d(s["date"]).day}</b>'
            f'<small>{d(s["date"]).strftime("%b")}</small></a>{gthumb(s) if show_artist else ""}<div class="gi">{who}{sup}<span class="gw">{where}{t}</span>{sale}</div>'
            f'<div class="ga"><a href="{e(s["url"])}" rel="noopener">{label} ↗</a><span class="ga2"><a class="cal" href="{e(gcal(s, s["artist"]))}" rel="noopener">+ Calendar</a>{save}</span></div></li>')

def gig_list(items, **kw):
    out, month = "", None
    for s in items:
        m = d(s["date"]).strftime("%B %Y")
        if m != month:
            out += ("</ul>" if month else "") + f'<h3 class="month">{m}</h3><ul class="gigs">'
            month = m
        out += gig_row(s, **kw)
    return out + ("</ul>" if month else '<p class="note">No upcoming shows listed right now.</p>')

def chips(cur=None):
    return '<nav class="chips" aria-label="Cities">' + "".join(
        f'<a href="/gigs/{slug(c)}.html"{" aria-current=page" if c == cur else ""}>{e(c)}</a>' for c in MAIN_CITIES) + '<a href="/gigs/regional.html">Regional</a></nav>'

# Australia outline (lon, lat), simplified, for the tour maps.
AUS = [(142.5,-10.7),(143.5,-14.0),(145.3,-15.0),(145.9,-17.0),(146.3,-18.9),(148.8,-20.3),(150.8,-22.6),(153.0,-25.3),(153.6,-28.2),
       (153.0,-31.0),(152.0,-32.6),(151.2,-33.9),(150.1,-36.3),(149.9,-37.5),(148.2,-37.8),(146.3,-39.1),(144.9,-37.9),(143.6,-38.8),
       (141.0,-38.1),(140.0,-37.4),(139.6,-36.2),(138.1,-35.6),(138.4,-34.6),(137.5,-35.0),(136.0,-34.9),(135.8,-34.7),(134.2,-32.7),
       (131.1,-31.5),(128.9,-31.7),(126.1,-32.3),(123.5,-33.9),(120.0,-33.9),(117.9,-35.1),(115.0,-34.3),(115.7,-32.6),(115.0,-30.0),
       (114.1,-26.4),(113.4,-24.0),(114.0,-21.8),(116.7,-20.6),(118.6,-20.3),(121.0,-19.5),(122.2,-17.9),(123.6,-16.6),(125.0,-15.0),
       (127.0,-13.9),(128.3,-15.0),(129.5,-14.9),(130.3,-12.7),(131.5,-12.2),(132.6,-11.4),(135.0,-12.2),(136.7,-12.2),(135.9,-13.6),
       (135.4,-14.9),(137.6,-16.2),(139.3,-17.4),(140.8,-17.4),(141.6,-15.0),(141.6,-12.5)]
TAS = [(144.6,-40.7),(146.6,-41.1),(148.3,-40.9),(148.3,-42.2),(147.6,-43.1),(146.0,-43.6),(145.2,-42.2)]

def proj(lon, lat):
    return (lon - 112.5) * 9.0, (-lat - 9.5) * 10.0

def tour_map(cities):
    pts = [(c, CITY_GEO[c]) for c in cities if CITY_GEO.get(c)]
    if not pts:
        return ""
    poly = lambda P: " ".join(f"{proj(x, y)[0]:.1f},{proj(x, y)[1]:.1f}" for x, y in P)
    dots = ""
    for c, (la, lo) in pts:
        x, y = proj(lo, la)
        anchor, dx = ("end", -12) if x > 300 else ("start", 12)
        dots += (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="13" class="pulse"/><circle cx="{x:.1f}" cy="{y:.1f}" r="7" class="dot"/>'
                 f'<text x="{x + dx:.1f}" y="{y + 5:.1f}" text-anchor="{anchor}">{e(c)}</text>')
    label = ", ".join(c for c, _ in pts)
    return (f'<figure class="map"><svg viewBox="0 0 390 350" role="img" aria-label="Tour map: {e(label)}">'
            f'<polygon points="{poly(AUS)}" class="land"/><polygon points="{poly(TAS)}" class="land"/>{dots}</svg></figure>')

def countdown(date, label):
    return (f'<div class="count-box" data-countdown="{date}"><b class="cd-num">–</b><span class="cd-lab">days to go</span>'
            f'<small>{e(label)}</small></div>')

def news_card(n, big=False):
    a = artists.get(slug(n.get("artist", "")))
    pic = art(a, "art nart") if a else ""
    blurb = plain(n["body"]).split(". ")[0].rstrip(".") + "."
    para = f"<p>{e(blurb)}</p>" if big else ""
    return (f'<a class="ncard{" big" if big else ""}" href="/news/{n["slug"]}.html">{pic}<div class="nbody"><span class="ntag">{e(n["tag"])}</span>'
            f'<h3>{e(n["title"])}</h3>{para}<span class="ndate">{fmt(n["date"], False)}</span></div></a>')

def story_card(s):
    return f'<a class="storycard" href="/stories/{s["slug"]}.html"><h3>{e(s["title"])}</h3><p>{e(s["dek"])}</p></a>'

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()

# ---------------------------------------------------------------- ticket sales (presales and on-sales)
try:
    from zoneinfo import ZoneInfo
    SYD = ZoneInfo("Australia/Sydney")
except Exception:
    SYD = dt.timezone(dt.timedelta(hours=11))
def sale_time(v):
    """Ticketmaster sale times are UTC ('...Z'); curated ones are Sydney local 'YYYY-MM-DDTHH:MM'. Returns a Sydney datetime."""
    if not v:
        return None
    try:
        if v.endswith("Z") or "+" in v[10:]:
            return dt.datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(SYD)
        return dt.datetime.fromisoformat(v if "T" in v else v + "T09:00").replace(tzinfo=SYD)
    except ValueError:
        return None

def sale_fmt(x):
    t = x.strftime("%-I:%M%p").lower().replace(":00", "")
    return f'{x.strftime("%a %-d %b")}, {t}'

def sale_gcal(title, x, url):
    st = x.astimezone(dt.timezone.utc)
    en = st + dt.timedelta(minutes=30)
    f = lambda y: y.strftime("%Y%m%dT%H%M%SZ")
    return ("https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + quote_plus(title)
            + f"&dates={f(st)}/{f(en)}&details=" + quote_plus("Tickets: " + url))

now_syd = dt.datetime.now(SYD)
horizon = now_syd + dt.timedelta(days=21)
recent = now_syd - dt.timedelta(days=7)
sales = {}  # (artist, kind, name, start) -> info
def add_sale(artist, kind, name, when, city, url, link):
    if not when or not (recent <= when <= horizon):
        return
    k = (artist, kind, name, when.isoformat())
    x = sales.setdefault(k, {"artist": artist, "kind": kind, "name": name, "when": when, "cities": [], "url": url, "link": link})
    if city and city not in x["cities"]:
        x["cities"].append(city)
for s_ in tm:
    al = f"/artists/{slug(s_['artist'])}.html"
    add_sale(s_["artist"], "General sale", "", sale_time(s_.get("onsale", "")), s_["city"], s_["url"], al)
    for pr in s_.get("presales", []):
        add_sale(s_["artist"], "Presale", pr.get("name", "Presale"), sale_time(pr.get("start", "")), s_["city"], s_["url"], al)
for t in tours:
    al = f"/artists/{slug(t['artist'])}.html"
    cities = sorted({x[1] for x in t["dates"]})
    if t.get("onsale"):
        for c in cities:
            add_sale(t["artist"], "General sale", "", sale_time(t["onsale"]), c, t.get("tickets") or t["source"], al)
    for pr in t.get("presales", []):
        for c in cities:
            add_sale(t["artist"], "Presale", pr.get("name", "Presale"), sale_time(pr.get("start", "")), c, t.get("tickets") or t["source"], al)
upcoming_sales = sorted([x for x in sales.values() if x["when"] >= now_syd], key=lambda x: x["when"])
just_sales = sorted([x for x in sales.values() if x["when"] < now_syd and x["kind"] == "General sale"], key=lambda x: x["when"], reverse=True)

def sale_row(x, past=False):
    label = (f'{e(x["name"])} presale' if x["kind"] == "Presale" and x["name"] and "presale" not in x["name"].lower()
             else e(x["name"]) if x["kind"] == "Presale" else "General public on-sale")
    rem = "" if past else f'<a class="cal" href="{e(sale_gcal(x["artist"] + " tickets: " + (x["name"] or "on sale"), x["when"], x["url"]))}" rel="noopener">⏰ Remind me</a>'
    cls = "presale" if x["kind"] == "Presale" else "general"
    return (f'<li class="sale {cls}"><div class="sw"><b>{x["when"].day}</b><small>{x["when"].strftime("%b")}</small></div>'
            f'<div class="si"><a class="gname" href="{x["link"]}">{e(x["artist"])}</a><span class="stype">{label}</span>'
            f'<span class="gw">{e(sale_fmt(x["when"]))} {e(x["when"].tzname() or "")} · {e(", ".join(x["cities"][:6]))}</span></div>'
            f'<div class="ga"><a href="{e(x["url"])}" rel="noopener">{"Tickets" if past else "Ticket page"} ↗</a>{rem}</div></li>')

# ---------------------------------------------------------------- home
featured = [s for s in shows if slug(s["artist"]) in curated] or shows
# "Big shows coming up": one card per artist (soonest show first), with their date range and cities,
# linking to the artist's page where every date is listed.
def tour_stub(a_name, ss):
    a_ = artists.get(slug(a_name)) or {}
    first, last = d(ss[0]["date"]), d(ss[-1]["date"])
    u_ = re.sub(r"/1000x1000-", "/500x500-", a_.get("photo") or big_img(a_) or (vguides.get(venue_slug(ss[0])) or {}).get("photo", ""))
    if u_:
        face = f'<span class="gcpic" style="background-image:url(&quot;{e(u_)}&quot;)"></span>'
    else:
        ini = "".join(w[0] for w in re.findall(r"[A-Za-z0-9]+", a_name)[:2]).upper()
        face = f'<span class="gcpic poster" style="--h:{hue(a_name)}"><span>{e(ini)}</span></span>'
    if len(ss) == 1:
        when = f'{first.strftime("%a")} {first.day} {first.strftime("%b")}'
        where = f'{e(ss[0]["venue"])}, {e(ss[0]["city"])}'
        href = gig_path(ss[0])
    else:
        when = f'{first.day} {first.strftime("%b")} – {last.day} {last.strftime("%b")}'
        cities = list(dict.fromkeys(x["city"] for x in ss))
        where = e(", ".join(cities[:4]) + (f" + {len(cities) - 4} more" if len(cities) > 4 else ""))
        href = f'/artists/{slug(a_name)}.html'
    n = f'<span class="gcn">{len(ss)} shows</span>' if len(ss) > 1 else ""
    return (f'<a class="gcard big" data-date="{ss[-1]["date"]}" href="{href}">{face}<span class="gcd"><b>{first.day}</b><small>{first.strftime("%b")}</small></span>{n}'
            f'<span class="gcin"><strong>{e(a_name)}</strong><span><b>{when}</b> · {where}</span></span></a>')

by_artist = {}
for s in featured:
    by_artist.setdefault(s["artist"], []).append(s)
stubs = [tour_stub(a_n, ss) for a_n, ss in sorted(by_artist.items(), key=lambda kv: kv[1][0]["date"])[:14]]
week_end = (TODAY.date() + dt.timedelta(days=7)).isoformat()
this_week = [s for s in shows if s["date"] < week_end][:12]
onsale = {}
for s in tm:
    if s["onsale"] and TODAY_S < s["onsale"][:10] <= (TODAY.date() + dt.timedelta(days=21)).isoformat():
        onsale.setdefault(slug(s["artist"]), s)
onsale = sorted(onsale.values(), key=lambda s: s["onsale"])[:8]
announced = sorted(tours, key=lambda t: t.get("added", ""), reverse=True)[:6]
fortnight = (TODAY.date() + dt.timedelta(days=14)).isoformat()
gotw = next((s for s in featured if s["date"] <= fortnight), featured[0] if featured else None)

def tour_card(t):
    a = artists[slug(t["artist"])]
    first = fmt(a["shows"][0]["date"]) if a["shows"] else "Dates to come"
    where = ", ".join(a["cities"]) or t.get("note", "")
    return (f'<a class="card tcard" href="/artists/{a["slug"]}.html">{art(a, "art tart")}<div class="tc"><h3>{e(t["artist"])}</h3><div class="meta">{e(t["tour"])}</div>'
            f'<div><span class="first">From {e(first)}</span><br><span class="meta">{e(where)}</span></div></div></a>')

def fest_card(f):
    places = ", ".join(x[1] for x in f["dates"])
    return (f'<a class="fcard" href="/festivals/{f["slug"]}.html"><span class="ntag">Festival guide</span><h3>{e(f["name"])}</h3>'
            f'<p>{e(f["when"])} · {e(places)}</p><p class="meta">{e(", ".join(f["headliners"]))} and more</p></a>')

disc = "".join(f'<circle r="{r}" fill="none" stroke="#333" stroke-width="1.2"/>' for r in range(96, 238, 9))
news_html = ""
if news:
    news_html = (f'<section class="band newsband"><div class="wrap"><div class="shead"><h2>Latest news</h2><span class="shlinks"><a href="/stories/index.html">Stories</a> · <a href="/news/index.html">All news →</a></span></div>'
                 f'<div class="newsgrid">{news_card(news[0], True)}<div class="nlist">{"".join(news_card(n) for n in news[1:5])}</div></div></div></section>')
gotw_html = ""
if gotw:
    ga = artists[slug(gotw["artist"])]
    blurb = (ga["tour"] or {}).get("note") or "One of the biggest shows on the calendar this fortnight."
    gotw_html = (f'<section class="band gotw"><div class="wrap gotwrap">{art(ga, "art gart")}<div class="gtext"><span class="ntag light">Gig of the week</span>'
                 f'<h2><a href="/artists/{ga["slug"]}.html">{e(ga["name"])}</a></h2><p class="gotw-where">{e(gotw["venue"])}, {e(gotw["city"])} · {fmt(gotw["date"])}</p>'
                 f'<p>{e(blurb)}</p><a class="btn" href="/artists/{ga["slug"]}.html">Dates, tickets &amp; a listen</a></div>'
                 f'{countdown(gotw["date"], gotw["city"])}</div></section>')
week_html = gig_list(this_week) if this_week else '<p class="note">Check the <a href="/gigs/index.html">gig guide</a> for what is on.</p>'
onsale_html = ""
wk_sales = [x for x in upcoming_sales if x["when"] <= now_syd + dt.timedelta(days=7)]
sales_title = "Tickets on sale this week" if wk_sales else "Tickets on sale soon"
sales_html = ""
if wk_sales or upcoming_sales:
    sales_html = (f'<section class="band salesband"><div class="wrap"><div class="shead"><h2>{sales_title}</h2><a href="/on-sale.html">Every presale &amp; on-sale →</a></div>'
                  f'<p class="note" style="margin-top:0">Presales first. Tap ⏰ Remind me and it goes straight in your calendar.</p>'
                  f'<ul class="sales">{"".join(sale_row(x) for x in (wk_sales or upcoming_sales)[:6])}</ul></div></section>')
STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]
def venue_form(town="", state="", title="Know a local venue we're missing?", intro="Tell us where the bands play near you. We'll add the venue and its gigs, usually within a day or two."):
    """"Tell us your local venues" (Netlify form "venue"): goes to the venue gig finder's list."""
    st = "".join(f'<option{" selected" if x == state else ""}>{x}</option>' for x in STATES)
    return (f'<form class="card venueform" name="venue" method="POST" action="/venue-thanks.html" data-netlify="true" netlify-honeypot="bot-field">'
            f'<h3>{e(title)}</h3><p>{e(intro)}</p><input type="hidden" name="form-name" value="venue"><p hidden><label>Leave this empty <input name="bot-field"></label></p>'
            f'<div class="vfrow"><label>Venue name<input name="venue" required maxlength="120" placeholder="e.g. The Hotel Blackheath"></label>'
            f'<label>Town or suburb<input name="town" required maxlength="80" value="{e(town)}" placeholder="e.g. Blackheath"></label>'
            f'<label>State<select name="state">{st}</select></label></div>'
            f'<label>Where they list their gigs <small>(optional: website, Oztix, Humanitix, Moshtix or Facebook page)</small><input name="url" type="url" maxlength="200" placeholder="https://"></label>'
            f'<fieldset class="vrole"><legend>You are…</legend><label><input type="radio" name="role" value="local" checked> A local who goes there</label>'
            f'<label><input type="radio" name="role" value="band"> In a band that plays there</label><label><input type="radio" name="role" value="venue"> From the venue</label></fieldset>'
            f'<label>Your email <small>(optional, only if you\'d like to hear when it\'s added)</small><input name="email" type="email" maxlength="120"></label>'
            f'<button class="btn">Add this venue</button></form>')

city_opts_near = "".join(f'<option value="{e(c)}" data-slug="{slug(c)}" data-lat="{CITY_CENTRE.get(c, ("", ""))[0]}" data-lon="{CITY_CENTRE.get(c, ("", ""))[1]}">{e(c)}</option>' for c in MAIN_CITIES)
near_c = MAIN_CITIES[0] if MAIN_CITIES else "Sydney"
near_fallback = "".join(gcard(s) for s in [s for s in shows if s["city"] == near_c][:6])
km_opts = "".join(f'<option value="{k}"{" selected" if k == 50 else ""}>Within {k} km</option>' for k in (10, 25, 50, 100, 200))
near_html = (f'<section class="band nearband" id="near"><div class="wrap"><div class="shead"><h2>Gigs near you</h2>'
             f'<div class="nearctl"><button class="locbtn" id="nearLoc" type="button" aria-expanded="false" aria-controls="locBox">📍 <span id="nearWhere">{e(near_c)}</span> <small>Change</small></button>'
             f'<select id="nearKm" aria-label="How far you\'ll travel" hidden>{km_opts}</select></div></div>'
             f'<div class="locbox" id="locBox" hidden><button class="btn" id="locGps" type="button">📍 Use my location</button>'
             f'<form id="locForm" class="locform"><input name="q" placeholder="Or type your town or postcode, e.g. Blackheath" aria-label="Your town or postcode" autocomplete="address-level2"><button class="btn ghost">Set</button></form>'
             f'<label class="citypick"><span>or a city</span><select id="nearCity" aria-label="Your city">{city_opts_near}</select></label>'
             f'<p class="note" id="locMsg">Your location stays on this device. We only use it to sort gigs by distance.</p></div>'
             f'<p class="note nearsum" id="nearSum"></p>'
             f'<div class="nearlist" id="nearList">{near_fallback}</div><div class="nearsuggest" id="nearSuggest" hidden>{venue_form()}</div>'
             f'<p class="nearlinks"><a class="btn" id="nearWk" href="/gigs/{slug(near_c)}-this-weekend.html">This weekend in&nbsp;<span class="nc">{e(near_c)}</span></a> '
             f'<a class="btn ghost" id="nearAll" href="/gigs/{slug(near_c)}.html">All&nbsp;<span class="nc">{e(near_c)}</span>&nbsp;gigs</a></p></div></section>')
genre_count = {g: sum(1 for a in artists.values() if a["gb"] == g and a["shows"]) for g in GENRE_LIST}
genre_html = ""
if GENRE_LIST:
    genre_html = ('<section class="band genreband" style="padding-top:0"><div class="wrap"><div class="shead"><h2>Browse by genre</h2><a href="/genres/index.html">All genres →</a></div>'
                  '<nav class="chips gchips" aria-label="Genres">' + "".join(f'<a href="/genres/{slug(g)}.html">{e(g)} <small>{genre_count[g]}</small></a>' for g in GENRE_LIST) + "</nav></div></section>")
fest_html = "".join(fest_card(f) for f in fests)
rel_items = [i for i in rels["items"] if i[0] == "2027" or i[0] >= TODAY_S][:8]
rel_html = "".join(f'<li><div class="when">{"TBC" if a == "2027" else d(a).strftime("%-d %b")}</div><div class="what"><strong>{e(b)} – {e(c)}</strong><span>{e(fm)}</span></div></li>' for a, b, c, fm in rel_items)
fest_h = "<h2>Festival guides</h2>"
picks_html = ""
if pick:
    g_, r_ = pick.get("gig") or {}, pick.get("record") or {}
    cards = ""
    if g_:
        ga_ = artists.get(slug(g_["artist"]))
        img_ = art(ga_, "art pk-art") if ga_ else ""
        when_ = f'{fmt(g_["date"])} · {e(g_.get("venue", ""))}, {e(g_.get("city", ""))}' if g_.get("date") else ""
        link_ = f'<a class="btn" href="/artists/{slug(g_["artist"])}.html">Dates &amp; tickets</a>' if ga_ else ""
        cards += (f'<div class="pk">{img_}<div><span class="ntag">Gig pick</span><h3>{e(g_["artist"])}</h3><p class="pk-when">{when_}</p>'
                  f'<p>{e(g_["text"])}</p>{link_}</div></div>')
    if r_:
        hit_ = (REL_DG.get(f'{r_["artist"]}|{r_["title"]}') or {}).get("hit") or {}
        cov_ = (f'<div class="art pk-art"><img src="{e(hit_["cover"])}" alt="{e(r_["artist"])} – {e(r_["title"])} cover" loading="lazy"></div>' if hit_.get("cover")
                else f'<div class="art pk-art poster" style="--h:{hue(r_["title"])}"><span>{e(r_["title"][:2].upper())}</span></div>')
        cards += (f'<div class="pk">{cov_}<div><span class="ntag">Record pick</span><h3>{e(r_["artist"])} – {e(r_["title"])}</h3>'
                  f'<p>{e(r_["text"])}</p><a class="btn" href="{HEATHEN + quote_plus(r_["artist"] + " " + r_["title"])}" rel="noopener">Find it on vinyl</a></div></div>')
    picks_html = (f'<section class="band picks"><div class="wrap"><div class="shead"><h2>Mick\'s picks</h2><span class="note">This week\'s gig and record, from the bloke who runs the place.</span></div>'
                  f'<div class="pkgrid">{cards}</div><p class="pk-sign">— Mick</p></div></section>')
# Homepage banner: up to 5 rotating slides picked from the site's own content each day.
# Pictures: Ticketmaster's wide photos when the key is set, otherwise artist photos / record covers,
# otherwise a branded design with the spinning record.
def slide(label, title, sub, href, cta, a=None, square="", seed=""):
    """One full-width slide for the homepage banner carousel: picture plus caption."""
    wide = big_img(a)
    sq = square or ((a or {}).get("photo", "") if not wide else "")
    pic = wide or sq
    kind = "wide" if wide else ("sq" if sq else "plain")
    style = (f'background-image:url(&quot;{e(pic)}&quot;)' if pic else f'--h:{hue(seed or title)}')
    ext = ' rel="noopener"' if href.startswith("http") else ""
    return (f'<a class="hxs {kind}" href="{href}"{ext} style="{style}"><span class="hxcap"><span class="ntag">{e(label)}</span>'
            f'<strong>{e(title)}</strong><span class="hsub">{e(sub)}</span><span class="hcta">{e(cta)} →</span></span></a>')
DISC_SVG = (f'<svg viewBox="-250 -250 500 500"><circle r="248" fill="#0b0b0b" stroke="#2c2c2c" stroke-width="2"/>{disc}'
            '<path d="M-230 -60 A238 238 0 0 1 -60 -230" stroke="rgba(255,255,255,.12)" stroke-width="22" fill="none"/>'
            '<circle r="86" fill="#e2391f"/><text y="-8" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#fff">LIVE</text>'
            '<text y="34" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#141414">LOUDER</text><circle r="7" fill="#141414"/></svg>')
slides, used = [], set()
if gotw:
    ga_ = artists[slug(gotw["artist"])]; used.add(ga_["slug"])
    slides.append(slide("Gig of the week", ga_["name"], f'{gotw["venue"]}, {gotw["city"]} · {fmt(gotw["date"])}', f'/artists/{ga_["slug"]}.html', "Dates & tickets", ga_))
for t in sorted(tours, key=lambda t: t.get("added", ""), reverse=True):
    a_ = artists.get(slug(t["artist"]))
    if a_ and a_["slug"] not in used and a_["shows"]:
        used.add(a_["slug"])
        slides.append(slide("Just announced", a_["name"], f'{t["tour"]} · {", ".join(a_["cities"][:5])}', f'/artists/{a_["slug"]}.html', "See the dates", a_))
        break
sale_ = next((x for x in upcoming_sales if slug(x["artist"]) not in used), None)
if sale_:
    a_ = artists.get(slug(sale_["artist"])); used.add(slug(sale_["artist"]))
    kind_ = (sale_["name"] + " presale" if sale_["name"] and "presale" not in sale_["name"].lower() else sale_["name"]) if sale_["kind"] == "Presale" else "Tickets on sale"
    slides.append(slide("On sale soon", sale_["artist"], f'{kind_}: {sale_fmt(sale_["when"])} · {", ".join(sale_["cities"][:4])}', "/on-sale.html", "Set a reminder", a_))
elif news:
    n_ = next((n for n in news if slug(n.get("artist", "")) not in used), news[0])
    a_ = artists.get(slug(n_.get("artist", "")))
    slides.append(slide("Latest news", n_["title"], (lambda t_: t_ if len(t_) <= 150 else t_[:150].rsplit(" ", 1)[0] + "…")(plain(n_["body"]).split(". ")[0]), f'/news/{n_["slug"]}.html', "Read more", a_, seed=n_["title"]))
if fests:
    f_ = fests[0]
    a_ = next((artists[slug(h_)] for h_ in f_.get("headliners", []) if artists.get(slug(h_)) and artists[slug(h_)].get("photo")), None)
    slides.append(slide("Festival guide", f_["name"], f'{f_["when"]} · {", ".join(x[1] for x in f_["dates"])}', f'/festivals/{f_["slug"]}.html', "The full guide", a_, seed=f_["name"]))
if pick and (pick.get("record") or {}).get("title"):
    r_ = pick["record"]; hit_ = (REL_DG.get(f'{r_["artist"]}|{r_["title"]}') or {}).get("hit") or {}
    slides.append(slide("Mick's record pick", f'{r_["artist"]} – {r_["title"]}', r_["text"][:150], HEATHEN + quote_plus(r_["artist"] + " " + r_["title"]), "Find it on vinyl", None, hit_.get("cover", ""), seed=r_["title"]))
elif stories:
    st_ = sorted(stories, key=lambda x: x["date"], reverse=True)[0]
    a_ = artists.get(slug(st_.get("artist", "")))
    slides.append(slide("Story", st_["title"], st_["dek"], f'/stories/{st_["slug"]}.html', "Read the story", a_, seed=st_["title"]))
if slides:
    off = TODAY.toordinal() % len(slides)  # a different slide leads each day
    slides = slides[off:] + slides[:off]
dots = "".join(f'<button type="button" class="cdot" data-i="{i}" aria-label="Show slide {i + 1}"></button>' for i in range(len(slides)))
hero_x = (f'<section class="hx" aria-roledescription="carousel" aria-label="Featured"><div class="hxtrack">{"".join(slides)}</div>'
          f'<button type="button" class="hxgo prev" data-hx="-1" aria-label="Previous">‹</button><button type="button" class="hxgo next" data-hx="1" aria-label="Next">›</button>'
          f'<div class="cdots">{dots}</div></section>') if slides else ""
home = f"""{hero_x}
<section class="hxbar"><div class="wrap">
<h1 class="hxh">Every gig near you. What your mates are going to. <span>The records to match.</span></h1>
<form class="bigsearch" action="/gigs/index.html" role="search"><input type="search" name="q" placeholder="Search an artist, venue or town" aria-label="Search gigs"><button>Find gigs</button></form>
<div class="herobtns"><a class="hbtn" href="#near" data-nearme>📍 Gigs near me</a><a class="hbtn" href="/this-weekend.html">This weekend</a><a class="hbtn" href="/on-sale.html">On sale soon</a><a class="hbtn" href="/my-gigs.html">♥ My gigs</a></div>
</div></section>
{near_html}
<section class="band ffeedband" id="ffeed" hidden></section>
<section class="band bigband"><div class="wrap">
<div class="stubs-head"><h2>Big shows coming up</h2><div class="arrows"><button data-go="-1" aria-label="Previous shows">←</button> <button data-go="1" aria-label="Next shows">→</button></div></div>
<div class="stubs" tabindex="0" aria-label="Upcoming shows">{''.join(stubs)}</div><a class="more light" href="/gigs/index.html">Full gig guide ({len(shows):,} shows) →</a> <a class="more light" href="/gigs/regional.html">Regional gigs →</a> <a class="more light" href="/venues/index.html">All venues →</a></div></section>
<section class="band"><div class="wrap"><div class="shead"><h2>Just announced</h2><a href="/tours.html">All tours →</a></div><div class="grid">{''.join(tour_card(t) for t in announced)}</div></div></section>
{sales_html}
{news_html}
{picks_html or gotw_html}
<section class="band"><div class="wrap"><div class="shead"><h2>Out soon on vinyl</h2><a href="/out-soon.html">Full release list →</a></div><ul class="rel two">{rel_html}</ul></div></section>"""
page("index.html", "Live Louder | Every gig near you, your mates' gigs, and the records to match",
     "Find gigs near you anywhere in Australia, see what your friends are going to, and keep your record collection. Tours, presales, news and new vinyl.", home)

# ---------------------------------------------------------------- news
lead = news_card(news[0], True) if news else ""
nl = f"""<section class="page-title"><div class="wrap"><h1>News</h1><p>Tour announcements, festival line-ups, new albums and Australian music news, updated daily.</p></div></section>
<section class="band"><div class="wrap"><div class="newsgrid">{lead}<div class="nlist">{''.join(news_card(n) for n in news[1:5])}</div></div>
<div class="grid ngrid">{''.join(news_card(n, True) for n in news[5:80])}</div></div></section>"""
page("news/index.html", "Australian music news | Live Louder", "The latest Australian music news: tour announcements, festival line-ups, new albums and vinyl.", nl, "news/index.html")
for n in news:
    a = artists.get(slug(n.get("artist", "")))
    side = ""
    if a:
        nxt = a["shows"][0] if a["shows"] else None
        nxt_html = f'<p>Next show: {fmt(nxt["date"])}, {e(nxt["city"])}</p>' if nxt else ""
        side = (f'<aside class="side"><div class="card">{art(a, "art sart")}<h3><a href="/artists/{a["slug"]}.html">{e(a["name"])}</a></h3>'
                f'{nxt_html}<a class="btn" href="/artists/{a["slug"]}.html">Dates, tickets &amp; a listen</a></div></aside>')
    more = "".join(news_card(m) for m in [m for m in news if m is not n][:4])
    src_name = n.get("sourceName", "original report")
    body = f"""<section class="band"><div class="wrap split"><article class="article" style="margin:0"><span class="ntag">{e(n['tag'])}</span><h1>{e(n['title'])}</h1>
<p class="note">{fmt(n['date'], False)}</p>{n['body']}<p class="note">Source: <a href="{e(n['source'])}" rel="noopener">{e(src_name)} ↗</a></p></article>{side}</div></section>
<section class="band" style="padding-top:0"><div class="wrap"><h2>More news</h2><div class="nlist cols">{more}</div></div></section>"""
    jsonld = {"@context": "https://schema.org", "@type": "NewsArticle", "headline": n["title"], "datePublished": n["date"], "publisher": {"@type": "Organization", "name": "Live Louder"}}
    page(f"news/{n['slug']}.html", f"{n['title']} | Live Louder", plain(n["body"])[:155], body, "news/index.html",
         f'<script type="application/ld+json">{json.dumps(jsonld)}</script>', (a or {}).get("photo", ""))
items = ""
for n in news[:30]:
    pub = d(n["date"]).strftime("%a, %d %b %Y") + " 06:00:00 +1000"
    items += (f"<item><title>{e(n['title'])}</title><link>{SITE}/news/{n['slug']}.html</link><guid>{SITE}/news/{n['slug']}.html</guid>"
              f"<pubDate>{pub}</pubDate><description>{e(plain(n['body']))}</description></item>")
(OUT / "news" / "feed.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Live Louder news</title><link>{SITE}/news/</link><description>Australian music news</description>{items}</channel></rss>')

# ---------------------------------------------------------------- gig guide
city_opts = "".join(f"<option>{e(c)}</option>" for c in MAIN_CITIES)
gg = f"""<section class="page-title"><div class="wrap"><h1>Gig guide</h1><p>Every show we know about, across Australia. Search, or narrow it down by city, genre and date.</p></div></section>
<section class="band"><div class="wrap" id="guide">
<div class="controls"><input id="q" type="search" placeholder="Artist, venue or suburb" aria-label="Search">
<select id="city" aria-label="City"><option value="">All cities</option>{city_opts}</select>
<select id="genre" aria-label="Genre"><option value="">All genres</option>{"".join(f'<option value="{slug(g)}">{e(g)}</option>' for g in GENRE_LIST)}</select>
<div class="filters" role="group" aria-label="When"><button data-when="all" aria-pressed="true">Any time</button><button data-when="week" aria-pressed="false">This week</button><button data-when="weekend" aria-pressed="false">This weekend</button><button data-when="month" aria-pressed="false">Next 30 days</button></div></div>
<p class="note addgig">Know a gig we're missing? <a href="/submit-a-gig.html">Add it to the guide →</a></p>
<p class="count" id="count" aria-live="polite">Loading shows…</p><div id="results"></div><button id="moreBtn" class="morebtn" hidden>Show more</button>
<noscript>{gig_list(shows[:300])}</noscript></div></section>"""
page("gigs/index.html", "Gig guide: concerts and gigs in Australia | Live Louder",
     "Search every big gig in Australia by artist, venue, city and date. Concerts in Sydney, Melbourne, Brisbane, Perth, Adelaide and more.", gg, "gigs/index.html")
# Where each gig is: the venue's map position, or the city centre (marked approximate) so "Gigs near you" can sort by distance.
def gig_geo(s):
    g = (venues.get(venue_slug(s)) or {}).get("geo") or []
    if len(g) >= 2: return [g[0], g[1]] + ([1] if len(g) > 2 else [])
    c = CITY_CENTRE.get(s["suburb"]) or CITY_CENTRE.get(s["city"])
    return [c[0], c[1], 1] if c else []
(OUT / "gigs.json").write_text(json.dumps([[s["date"], s["time"], s["artist"], slug(s["artist"]), s["venue"], s["suburb"], s["city"], s["url"],
                                           ", ".join(s["support"]), s["src"], gcal(s, s["artist"]), venue_slug(s),
                                           slug(artists[slug(s["artist"])]["gb"]) if artists.get(slug(s["artist"])) and artists[slug(s["artist"])]["gb"] else "", s["id"], gig_path(s)] + gig_geo(s) for s in shows], separators=(",", ":")))

# Pictures for the gig tiles (app.js): artist photo by artist slug, venue photo by venue slug. Deezer photos are
# stored as "dz:<id>" and asked for at 500px, which is plenty for a tile and much lighter than the 1000px original.
def _short(u):
    m_ = re.match(r"https://cdn-images\.dzcdn\.net/images/artist/([0-9a-f]+)/", u or "")
    return "dz:" + m_.group(1) if m_ else (u or "")
_pa = {}
for s in shows:
    a_ = artists.get(slug(s["artist"])) or {}
    u_ = a_.get("photo") or big_img(a_)
    if u_:
        _pa[slug(s["artist"])] = _short(u_)
_pv = {k: (g.get("photo") or "") for k, g in vguides.items() if g.get("photo")}
(OUT / "data").mkdir(exist_ok=True)
(OUT / "data" / "pics.json").write_text(json.dumps({"a": _pa, "v": _pv}, separators=(",", ":")))

for c in MAIN_CITIES:
    cs = [s for s in shows if s["city"] == c]
    counts = {}
    for s in cs:
        counts[venue_slug(s)] = (s["venue"], counts.get(venue_slug(s), ("", 0))[1] + 1)
    cv = sorted(counts.items(), key=lambda kv: -kv[1][1])[:12]
    vchips = ('<h2 style="margin-top:28px;font-size:26px">Venues</h2><nav class="chips small">' + "".join(f'<a href="/venues/{k}.html">{e(v[0])}</a>' for k, v in cv) + "</nav>") if cv else ""
    more_link = f'<p class="note">Showing the next 400. <a href="/gigs/index.html?city={quote_plus(c)}">See them all in the gig guide</a>.</p>' if len(cs) > 400 else ""
    body = f"""<section class="page-title"><div class="wrap"><h1>Gigs in {e(c)}</h1><p>{len(cs):,} upcoming shows in and around {e(c)}, soonest first.</p></div></section>
<section class="band"><div class="wrap"><p><a class="btn" href="/gigs/{slug(c)}-this-weekend.html">What\'s on in {e(c)} this weekend →</a></p>{chips(c)}{vchips}<div style="height:10px"></div>{gig_list(cs[:400], show_city=False)}{more_link}<p class="note">Playing in {e(c)}? <a href="/submit-a-gig.html">Add your gig →</a></p></div></section>"""
    PLACE = (CITY_CENTRE.get(c), CITY_STATE.get(c, ""))
    page(f"gigs/{slug(c)}.html", f"Gigs in {c}: concerts and live music | Live Louder",
         f"Upcoming gigs and concerts in {c}, updated daily: dates, venues and tickets.", body, "gigs/index.html")

# ---------------------------------------------------------------- regional towns: a page for every town with gigs
towns = {}
for s_ in shows:
    if s_["city"] in MAIN_CITIES: continue
    t = towns.setdefault(s_["city"], {"name": s_["city"], "state": s_.get("state", ""), "shows": [], "pts": []})
    t["shows"].append(s_)
    g = gig_geo(s_)
    if len(g) >= 2: t["pts"].append(g[:2])
    if not t["state"] and s_.get("state"): t["state"] = s_["state"]
for tn, t in towns.items():
    t["slug"] = slug(tn) if slug(tn) not in {slug(c) for c in MAIN_CITIES} else slug(tn) + "-" + slug(t["state"] or "au")
    c = CITY_CENTRE.get(tn) or ((sum(p[0] for p in t["pts"]) / len(t["pts"]), sum(p[1] for p in t["pts"]) / len(t["pts"])) if t["pts"] else None)
    t["centre"] = c
    near = []
    if c:
        for s_ in shows:
            if s_["city"] == tn: continue
            g = gig_geo(s_)
            if len(g) >= 2:
                k = _km(c, g)
                if k <= 80: near.append((s_, k))
    near.sort(key=lambda x: (x[0]["date"], x[1]))
    near_list = ""
    if near:
        rows = "".join(gig_row(x).replace('<span class="gw">', f'<span class="gw"><b class="kmtag">{round(k / 5) * 5 if k >= 10 else round(k)} km</b> ', 1) for x, k in near[:40])
        near_list = f'<h2>Within an hour or so of {e(tn)}</h2><p class="note">Gigs within about 80 km, soonest first.</p><ul class="gigs">{rows}</ul>'
    st = t["state"]
    body = f"""<section class="page-title"><div class="wrap"><h1>Gigs in {e(tn)}</h1><p>{len(t["shows"])} upcoming {"show" if len(t["shows"]) == 1 else "shows"} in {e(tn)}{", " + e(st) if st else ""}, plus gigs nearby. Updated daily.</p></div></section>
<section class="band"><div class="wrap split"><div>{gig_list(t["shows"], show_city=False)}{near_list}</div>
<aside class="side">{venue_form(tn, st, f"Missing a venue in {tn}?", f"Tell us where the bands play in and around {tn} and we'll add their gigs.")}
<div class="card"><h3>Playing in {e(tn)}?</h3><p>Add your show to the guide. It's free.</p><a class="btn" href="/submit-a-gig.html">Submit a gig</a></div></aside></div></section>"""
    PLACE = (t.get("centre"), t.get("state", ""))
    page(f"gigs/{t['slug']}.html", f"Gigs in {tn}{', ' + st if st else ''}: live music and concerts | Live Louder",
         f"Upcoming gigs and live music in {tn}{', ' + st if st else ''} and nearby, updated daily: dates, venues and tickets.", body, "gigs/index.html")
# Regional index: every town with gigs, by state.
by_state = {}
for t in towns.values():
    by_state.setdefault(t["state"] or "Other", []).append(t)
reg_rows = ""
for st in STATES + ["Other"]:
    ts = sorted(by_state.get(st, []), key=lambda t: -len(t["shows"]))
    if ts:
        reg_rows += f'<h2>{e(st)}</h2><nav class="chips">' + "".join(f'<a href="/gigs/{t["slug"]}.html">{e(t["name"])} <small>{len(t["shows"])}</small></a>' for t in ts) + "</nav>"
reg_body = f"""<section class="page-title"><div class="wrap"><h1>Regional gigs</h1><p>Live music outside the capital cities, town by town. More towns are added every day.</p></div></section>
<section class="band"><div class="wrap split"><div>{reg_rows or '<p class="note">Regional towns are being added now. Check back soon.</p>'}
<p class="note" style="margin-top:28px">Looking for a capital city? {" · ".join(f'<a href="/gigs/{slug(c)}.html">{e(c)}</a>' for c in MAIN_CITIES)}</p></div>
<aside class="side">{venue_form(title="Is your town missing?", intro="Tell us the venues that put on bands near you, and we'll add your town to the guide.")}</aside></div></section>"""
page("gigs/regional.html", "Regional gigs: live music across regional Australia | Live Louder",
     "Gigs and live music in regional towns across Australia, town by town, updated daily.", reg_body, "gigs/index.html")
page("venue-thanks.html", "Thanks for the venue | Live Louder", "Thanks for telling us about a venue.",
     '<section class="page-title"><div class="wrap"><h1>Thanks, legend</h1><p>We\'ll check out the venue and add its gigs, usually within a day or two. <a style="color:#fff" href="/gigs/regional.html">See regional gigs</a> or <a style="color:#fff" href="/">head home</a>.</p></div></section>')
# Venue suggestions for the venue gig finder (names and links only; never emails).
_vs = json.loads((ROOT / "data/venue_suggestions.json").read_text()) if (ROOT / "data/venue_suggestions.json").exists() else []
_known = {re.sub(r"[^a-z0-9]", "", x.get("venue", "").lower()) for x in json.loads((ROOT / "data/venue_sources.json").read_text())}
(OUT / "data").mkdir(exist_ok=True)
(OUT / "data/venue-suggestions.json").write_text(json.dumps([{k: x.get(k, "") for k in ("venue", "town", "state", "url", "role", "notes", "received")}
    for x in _vs if re.sub(r"[^a-z0-9]", "", x.get("venue", "").lower()) not in _known], ensure_ascii=False))

# ---------------------------------------------------------------- this weekend, per city
_wd = TODAY.date().weekday()  # Mon=0
wk_fri = TODAY.date() + dt.timedelta(days=(4 - _wd) if _wd <= 4 else -(_wd - 4))
wk_days = [wk_fri + dt.timedelta(days=i) for i in range(3)]
wk_iso = [x.isoformat() for x in wk_days]
wk_label = f"{wk_days[0].day} {wk_days[0].strftime('%b')} – {wk_days[2].day} {wk_days[2].strftime('%b')}"
weekend_counts = {}
for c in MAIN_CITIES:
    ws = [s for s in shows if s["city"] == c and s["date"] in wk_iso]
    weekend_counts[c] = len(ws)
    days_html = ""
    for dd in wk_days:
        ds = [s for s in ws if s["date"] == dd.isoformat()]
        if ds:
            days_html += f'<h2 style="font-size:30px;margin-top:30px">{dd.strftime("%A %-d %B")}</h2>{gig_list(ds, show_city=False)}'
    picks = [s for s in ws if slug(s["artist"]) in curated][:3]
    pick_txt = (" Big ones: " + ", ".join(e(p["artist"]) + f' at {e(p["venue"])}' for p in picks) + ".") if picks else ""
    if not days_html:
        days_html = f'<p class="lead">Nothing listed for {e(c)} this weekend yet. <a href="/gigs/{slug(c)}.html">See all upcoming gigs in {e(c)}</a>.</p>'
    others = " · ".join(f'<a href="/gigs/{slug(x)}-this-weekend.html">{e(x)}</a>' for x in MAIN_CITIES if x != c)
    body = (f'<section class="page-title"><div class="wrap"><h1>This weekend in {e(c)}</h1><p>{len(ws)} {"gig" if len(ws) == 1 else "gigs"} on {e(wk_label)}.{pick_txt}</p></div></section>'
            f'<section class="band"><div class="wrap">{days_html}'
            f'<p class="note" style="margin-top:28px"><a href="/gigs/{slug(c)}.html">All upcoming gigs in {e(c)} →</a><br>Other cities this weekend: {others}</p></div></section>')
    PLACE = (CITY_CENTRE.get(c), CITY_STATE.get(c, ""))
    page(f"gigs/{slug(c)}-this-weekend.html", f"Gigs in {c} this weekend ({wk_label}) | Live Louder",
         f"What's on in {c} this weekend, {wk_label}: every gig and concert by day, with venues and tickets.", body, "this-weekend.html")
wk_cards = "".join(f'<a class="fcard" href="/gigs/{slug(c)}-this-weekend.html"><span class="ntag">This weekend</span><h3>{e(c)}</h3>'
                   f'<p>{weekend_counts[c]} {"gig" if weekend_counts[c] == 1 else "gigs"}</p></a>' for c in MAIN_CITIES)
twp = (f'<section class="page-title"><div class="wrap"><h1>This weekend</h1><p>What\'s on around Australia, {e(wk_label)}. Pick your city.</p></div></section>'
       f'<section class="band"><div class="wrap"><div class="grid">{wk_cards}</div></div></section>')
page("this-weekend.html", f"Gigs this weekend in Australia ({wk_label}) | Live Louder",
     f"Every gig on this weekend ({wk_label}) in Sydney, Melbourne, Brisbane, Perth, Adelaide and more.", twp, "this-weekend.html")

# ---------------------------------------------------------------- venues
def venue_map(v, small=False):
    """Map, directions and a "how far is it?" button for a venue."""
    q = quote_plus(f"{v['name']}, {v['suburb']}, {v['city']}, Australia")
    geo = v.get("geo") or []
    dest = f"{geo[0]},{geo[1]}" if geo else q
    embed = f"https://maps.google.com/maps?q={dest if geo else q}&amp;z=15&amp;output=embed"
    near = (f'<button type="button" class="distbtn" data-lat="{geo[0]}" data-lon="{geo[1]}">📍 How far is it from me?</button><span class="distout" aria-live="polite"></span>'
            if geo else "")
    vg = vguides.get(slug(v["name"] + "-" + v["city"])) or {}
    photo = (f'<figure class="vphoto"><img src="{e(vg["photo"])}" alt="{e(v["name"])}" loading="lazy"><figcaption>{e(vg.get("photo_credit", ""))}</figcaption></figure>'
             if vg.get("photo") else "")
    return (f'<div class="vmap{" small" if small else ""}">{photo}<iframe title="Map of {e(v["name"])}" src="{embed}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>'
            f'<div class="vmapbar"><a class="btn" href="https://www.google.com/maps/dir/?api=1&amp;destination={dest}" rel="noopener">Directions ↗</a>{near}</div></div>')

for k, v in venues.items():
    loc = e(v["city"]) if v["suburb"] == v["city"] else f'{e(v["suburb"])}, {e(v["city"])}'
    n = len(v["shows"])
    maps = "https://www.google.com/maps/search/?api=1&amp;query=" + quote_plus(f"{v['name']}, {v['suburb']} Australia")
    g = vguides.get(k) or {}
    guide = ""
    if g:
        rows = ""
        for key, lab in (("address", "Address"), ("capacity", "Capacity"), ("age", "Age rules"), ("bags", "Bags & what to bring"),
                         ("getting_there", "Getting there"), ("parking", "Parking"), ("food", "Food & drink"), ("accessibility", "Accessibility")):
            if g.get(key):
                rows += f"<dt>{lab}</dt><dd>{e(g[key])}</dd>"
        tips = "".join(f"<li>{e(t)}</li>" for t in g.get("tips", []))
        tips = f"<h3>Good to know</h3><ul class=\"tips\">{tips}</ul>" if tips else ""
        srcs = " · ".join(f'<a href="{e(u)}" rel="noopener">source ↗</a>' for u in g.get("sources", [])[:3])
        intro = f'<p class="lead">{e(g["intro"])}</p>' if g.get("intro") else ""
        guide = (f'<div class="card vguide"><h2 style="margin-top:0">Before you go</h2>{intro}<dl class="vfacts">{rows}</dl>{tips}'
                 f'<p class="note">Checked {e(fmt(g["checked"], False)) if g.get("checked") else "recently"}. Venue rules change, so check the venue\'s website before you go. {srcs}</p></div>')
    vtitle = f"{v['name']}, {v['city']}: gig guide, " + ("bag policy, getting there and upcoming shows" if g else "upcoming gigs")
    vdesc = (f"Going to {v['name']} in {v['city']}? Getting there, bag and age rules, and every upcoming gig." if g
             else f"Upcoming concerts and gigs at {v['name']} in {v['city']}: dates and tickets.")
    body = f"""<section class="page-title"><div class="wrap"><h1>{e(v['name'])}</h1><p>{loc} · {n} upcoming {'show' if n == 1 else 'shows'}</p></div></section>
<section class="band"><div class="wrap">{venue_map(v)}
<p><a href="/gigs/{slug(v['city'])}.html">More gigs in {e(v['city'])}</a>{f' · <a href="/gigs/{slug(v["city"])}-this-weekend.html">This weekend in {e(v["city"])}</a>' if v['city'] in MAIN_CITIES else ' · <a href="/gigs/regional.html">More regional gigs</a>'} · <a href="/venues/index.html">All venues</a></p>
{guide}<h2>Upcoming gigs</h2>{gig_list(v['shows'], show_city=False)}</div></section>"""
    _g = next((gig_geo(x) for x in v["shows"] if len(gig_geo(x)) >= 2), [])
    PLACE = ((_g[0], _g[1]) if _g else CITY_CENTRE.get(v["suburb"]) or CITY_CENTRE.get(v["city"]), v.get("state") or CITY_STATE.get(v["city"], ""))
    page(f"venues/{k}.html", vtitle + " | Live Louder", vdesc, body, "gigs/index.html")
(OUT / "data").mkdir(parents=True, exist_ok=True)
(OUT / "data" / "venues.json").write_text(json.dumps(sorted(
    [{"slug": k, "name": v["name"], "suburb": v["suburb"], "city": v["city"], "shows": len(v["shows"]),
      "guide_checked": (vguides.get(k) or {}).get("checked", "")} for k, v in venues.items()], key=lambda x: -x["shows"])))

# Venues directory: every venue, grouped by state then city/town, so every venue page is one click from a list.
STATE_ORDER = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]
STATE_NAME = {"NSW": "New South Wales", "VIC": "Victoria", "QLD": "Queensland", "WA": "Western Australia", "SA": "South Australia",
              "TAS": "Tasmania", "ACT": "Australian Capital Territory", "NT": "Northern Territory"}
_byst = {}
for k, v in venues.items():
    _byst.setdefault(v.get("state") or "Other", {}).setdefault(v["city"], []).append((k, v))
_vrows = ""
for st in sorted(_byst, key=lambda x: STATE_ORDER.index(x) if x in STATE_ORDER else 99):
    _vrows += f'<h2 id="{slug(st)}">{e(STATE_NAME.get(st, st))}</h2>'
    for c in sorted(_byst[st], key=lambda c: (c not in MAIN_CITIES, c)):
        vs = sorted(_byst[st][c], key=lambda kv: kv[1]["name"].lower())
        _vrows += (f'<h3 class="month"><a href="/gigs/{slug(c)}.html">{e(c)}</a></h3><nav class="chips">'
                   + "".join(f'<a href="/venues/{k}.html">{e(v["name"])} <small>{len(v["shows"])}</small></a>' for k, v in vs) + "</nav>")
_jump = " · ".join(f'<a style="color:#fff" href="#{slug(st)}">{e(st)}</a>' for st in sorted(_byst, key=lambda x: STATE_ORDER.index(x) if x in STATE_ORDER else 99))
page("venues/index.html", "Live music venues in Australia: every venue's gig guide | Live Louder",
     f"Gig guides for {len(venues):,} live music venues across Australia, from capital city band rooms to regional pubs, clubs and theatres.",
     f"""<section class="page-title"><div class="wrap"><h1>Venues</h1><p>{len(venues):,} live music venues across Australia, with every upcoming gig. Jump to: {_jump}</p></div></section>
<section class="band"><div class="wrap split"><div>{_vrows}</div>
<aside class="side">{venue_form(title="Missing a venue?", intro="Tell us the venues that put on bands near you, and we'll add their gigs.")}</aside></div></section>""", "venues/index.html")

# ---------------------------------------------------------------- one page per gig (tickets, price, venue, map)
# Full schema.org MusicEvent for Google (all the recommended fields, so Search Console stays happy).
def event_ld(s, name=None, image=""):
    from zoneinfo import ZoneInfo
    tz = {"WA": "Australia/Perth", "SA": "Australia/Adelaide", "NT": "Australia/Darwin", "QLD": "Australia/Brisbane", "VIC": "Australia/Melbourne",
          "TAS": "Australia/Hobart", "ACT": "Australia/Sydney"}.get(s.get("state", ""), "Australia/Sydney")
    start = s["date"]
    if s["time"]:
        start = dt.datetime.fromisoformat(f'{s["date"]}T{s["time"]}').replace(tzinfo=ZoneInfo(tz)).isoformat()
    town = s["suburb"] or s["city"]
    offer = {"@type": "Offer", "url": s["url"], "availability": "https://schema.org/InStock", "priceCurrency": "AUD", "validFrom": (s.get("onsale") or TODAY.isoformat())[:10]}
    m = re.search(r"\d+(?:\.\d+)?", str(s.get("price") or ""))
    if m:
        offer["price"] = m.group(0)
    ld = {"@context": "https://schema.org", "@type": "MusicEvent", "name": name or f'{s["artist"]} at {s["venue"]}',
          "description": f'{s["artist"]} live at {s["venue"]}, {town}' + (f' with {", ".join(s["support"][:3])}' if s.get("support") else "") + f' on {d(s["date"]).strftime("%-d %B %Y")}. Tickets and details on Live Louder.',
          "startDate": start, "endDate": s["date"], "eventStatus": "https://schema.org/EventScheduled",
          "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
          "location": {"@type": "Place", "name": s["venue"], "address": {"@type": "PostalAddress", "addressLocality": town, "addressRegion": s.get("state", ""), "addressCountry": "AU"}},
          "performer": [{"@type": "MusicGroup", "name": s["artist"]}] + [{"@type": "MusicGroup", "name": x} for x in (s.get("support") or [])],
          "organizer": {"@type": "Organization", "name": s["venue"]},
          "image": [image or "https://livelouder.com.au/icon-512.png"], "offers": offer, "url": "https://livelouder.com.au" + gig_path(s)}
    return ld

for s in shows:
    a = artists.get(slug(s["artist"])) or {}
    v = venues.get(venue_slug(s)) or {}
    wd = d(s["date"]).strftime("%A")
    when = f'{wd} {fmt(s["date"], False)}' + (f' · {s["time"]}' if s["time"] else "")
    pic = big_img(a) if a else ""
    photo = a.get("photo", "") if a else ""
    hero_img = (f'<div class="gp-bg" style="background-image:url(&quot;{e(pic or photo)}&quot;)"></div>' if (pic or photo) else "")
    sold = "on sale soon" if s.get("onsale") and s["onsale"][:10] > TODAY_S else ""
    price = (f'<p class="gp-price"><b>{e(s["price"])}</b> <span>ticket prices at last check, plus fees. Check the ticket page for the latest.</span></p>' if s.get("price")
             else '<p class="gp-price"><span>Prices are on the ticket page.</span></p>')
    sale_note = f'<p class="note">Tickets on sale {fmt(s["onsale"][:10])}.</p>' if sold else ""
    snap = json.dumps({"id": s["id"], "d": s["date"], "tm": s["time"], "a": s["artist"], "s": slug(s["artist"]), "v": s["venue"],
                       "c": s["city"], "u": s["url"], "vs": venue_slug(s), "p": gig_path(s)}, separators=(",", ":"))
    others = [x for x in (a.get("shows") or []) if x["id"] != s["id"]]
    more = f'<h2>More {e(s["artist"])} dates</h2>{gig_list(others[:30])}' if others else ""
    before = ""
    dg = (a.get("discogs") or {}) if a else {}
    if dg.get("records"):
        cards = ""
        for r in dg["records"][:4]:
            hq = HEATHEN + quote_plus(f'{a["name"]} {r["title"]}') + "&utm_source=livelouder&utm_medium=referral&utm_campaign=gig-page"
            img = f'<img src="{e(r["thumb"])}" alt="{e(r["title"])} cover" loading="lazy" width="150" height="150">' if r.get("thumb") else '<span class="rec-blank"></span>'
            rj = e(json.dumps({"rid": f'm{r["master"]}', "a": a["name"], "t": r["title"], "y": r["year"], "img": r.get("thumb", "")}, separators=(",", ":"))) if r.get("master") else ""
            addb = (f'<span class="radd sm"><button type="button" class="addbtn" data-addrec="{rj}" data-list="records">+ Collection</button>'
                    f'<button type="button" class="addbtn" data-addrec="{rj}" data-list="wants">+ Wantlist</button></span>') if rj else ""
            cards += (f'<div class="rec">{img}<strong>{e(r["title"])}</strong><span class="meta">{r["year"]}</span>'
                      f'<a href="{hq}" rel="noopener">Find on vinyl ↗</a>{addb}</div>')
        before = (f'<h2>Before the show</h2><p class="note">Get to know the records before you go, or tick off the ones you own.</p>'
                  f'<div class="recs four">{cards}</div>')
    support = f'<p class="gp-sup">with {e(", ".join(s["support"]))}</p>' if s["support"] else ""
    src_label = {"ticketmaster": "Ticketmaster", "submitted": "the ticket seller", "found": "the venue / ticket seller"}.get(s["src"], "the promoter")
    ld = json.dumps(event_ld(s, image=pic or photo), ensure_ascii=False).replace("</", "<\\/")
    body = f"""<script type="application/ld+json">{ld}</script>
<section class="gp-hero">{hero_img}<div class="wrap gp-in"><div>
<span class="ntag">{e(s["city"])} · {e(d(s["date"]).strftime("%-d %B %Y"))}</span><h1>{e(s["artist"])}</h1>{support}
<p class="gp-when">{e(when)}<br><a href="/venues/{venue_slug(s)}.html">{e(s["venue"])}</a>, {e(s["suburb"] if s["suburb"] and s["suburb"] != s["city"] else s["city"])}</p>
{price}{sale_note}
<div class="gp-acts"><a class="btn big" href="{e(s["url"])}" rel="noopener">Get tickets ↗</a>
<button class="save gp-save" type="button" data-gig="{e(snap)}" aria-pressed="false" aria-label="Save to My gigs">♡</button>
<a class="btn ghost" href="{e(gcal(s, s["artist"]))}" rel="noopener">+ Calendar</a></div>
<p class="note gp-src">Tickets through {src_label}. Always buy from the official seller.</p></div>
{f'<img class="gp-photo" src="{e(photo)}" alt="{e(s["artist"])}">' if photo else ""}</div></section>
<section class="band"><div class="wrap split"><div>
{f'<p class="lead">{e(a["bio"])}</p>' if a.get("bio") else ""}
<p><a class="btn ghost" href="/artists/{slug(s["artist"])}.html">All about {e(s["artist"])} →</a></p>
{before}{more}</div>
<aside class="side"><div class="card"><h3 style="margin-top:0">The venue</h3><p><a href="/venues/{venue_slug(s)}.html"><b>{e(s["venue"])}</b></a><br>{e(s["suburb"] or s["city"])}, {e(s.get("state", ""))}</p>{venue_map(v, small=True) if v else ""}
<p><a href="/venues/{venue_slug(s)}.html">Venue guide and more gigs →</a></p></div></aside></div></section>"""
    page(gig_path(s)[1:], f'{s["artist"]} at {s["venue"]}, {s["city"]} – {fmt(s["date"], False)} | Tickets | Live Louder',
         f'{s["artist"]} live at {s["venue"]}, {s["city"]} on {fmt(s["date"])}. Tickets, times, prices and venue info.', body, "gigs/index.html")

# ---------------------------------------------------------------- festivals
fl = f"""<section class="page-title"><div class="wrap"><h1>Festivals</h1><p>Line-ups, dates, venues and tips for Australia's music festivals.</p></div></section>
<section class="band"><div class="wrap"><div class="grid">{fest_html}</div></div></section>"""
page("festivals/index.html", "Australian music festivals: line-ups and guides | Live Louder", "Guides to Australia's music festivals: line-ups, dates, venues and tips.", fl, "festivals/index.html")
def ln(n):
    a = artists.get(slug(n))
    return f'<a href="/artists/{a["slug"]}.html">{e(n)}</a>' if a else e(n)
for f in fests:
    rows = "".join(f"<tr><td>{fmt(dd)}</td><td>{e(c)}</td><td>{e(v)}</td><td>{e(x)}</td></tr>" for dd, c, v, x in f["dates"])
    first = f["dates"][0]
    heads = " · ".join(ln(n) for n in f["headliners"])
    lineup = " · ".join(ln(n) for n in f["lineup"])
    tips = "".join(f"<li>{e(t)}</li>" for t in f["tips"])
    body = f"""<section class="page-title fest"><div class="wrap"><span class="ntag light">Festival guide</span><h1>{e(f['name'])}</h1><p>{e(f['when'])}</p></div></section>
<section class="band"><div class="wrap split"><div><p class="lead">{e(f['intro'])}</p>
<h2>Dates and venues</h2><table class="ftable"><tbody>{rows}</tbody></table>
<h2>Line-up</h2><p class="headliners">{heads}</p><p class="lineup">{lineup}</p>
<h2>Good to know</h2><ul class="tips">{tips}</ul>
<p class="note">Line-up and dates from the festival announcement (<a href="{e(f['source'])}" rel="noopener">source ↗</a>). Always check the official festival site before you go.</p></div>
<aside class="side">{countdown(first[0], first[1])}{tour_map([x[1] for x in f['dates']])}</aside></div></section>"""
    page(f"festivals/{f['slug']}.html", f"{f['name']}: line-up, dates and guide | Live Louder",
         f"{f['name']} guide: full line-up, dates, venues and tips. {f['when']}.", body, "festivals/index.html")

# ---------------------------------------------------------------- artist pages
for a in artists.values():
    t = a["tour"]
    sh = a["shows"]
    title_tour = (t["tour"] if t and t["tour"] not in ("Australian tour",) else "Australian tour") + (f" {d(sh[0]['date']).year}" if sh else "")
    head = f'<p class="sup">With {e(t["support"])}</p>' if t and t.get("support") else ""
    note = f'<p class="tnote">{e(t["note"])}</p>' if t and t.get("note") else ""
    src = f'<p><a href="{e(t["source"])}" rel="noopener">Tour announcement ↗</a></p>' if t else ""
    q = quote_plus(a["name"])
    player = ""
    if a.get("deezer"):
        player = (f'<iframe title="{e(a["name"])} top tracks" src="https://widget.deezer.com/widget/auto/artist/{a["deezer"]}/top_tracks" '
                  f'width="100%" height="300" frameborder="0" allow="encrypted-media; clipboard-write" loading="lazy"></iframe>')
    listen = (f'<div class="card listen"><h3>Hear them before you go</h3>{player}'
              f'<div class="lrow"><a href="https://open.spotify.com/search/{quote(a["name"])}" rel="noopener">Spotify ↗</a>'
              f'<a href="https://music.apple.com/au/search?term={q}" rel="noopener">Apple Music ↗</a>'
              f'<a href="https://www.youtube.com/results?search_query={q}+live" rel="noopener">YouTube ↗</a></div>'
              + ("" if a.get("setlist") else f'<p class="setl"><a href="https://www.setlist.fm/search?query={q}" rel="noopener">What they\'ve been playing: recent setlists on setlist.fm ↗</a></p>') + '</div>')
    setlist_html = ""
    sl = a.get("setlist")
    if sl:
        where = ", ".join(x for x in (sl["venue"], sl["city"], sl["country"]) if x)
        songs = "".join(f"<li>{e(x)}</li>" for x in sl["songs"])
        enc = ('<p class="enc-h">Encore</p><ol class="songs enc">' + "".join(f"<li>{e(x)}</li>" for x in sl["encore"]) + "</ol>") if sl["encore"] else ""
        tour_l = f' · {e(sl["tour"])}' if sl.get("tour") else ""
        setlist_html = (f'<h2>What they\'ve been playing</h2><p class="note">Their most recent setlist: {e(fmt(sl["date"], False))}, {e(where)}{tour_l}.</p>'
                        f'<ol class="songs">{songs}</ol>{enc}'
                        f'<p class="note"><a href="{e(sl["url"])}" rel="noopener">Full setlist on setlist.fm ↗</a></p>')
    records_html = ""
    dg = a.get("discogs") or {}
    if dg.get("records"):
        cards = ""
        for r in dg["records"]:
            hq = HEATHEN + quote_plus(f'{a["name"]} {r["title"]}')
            img = f'<img src="{e(r["thumb"])}" alt="{e(r["title"])} cover" loading="lazy" width="150" height="150">' if r.get("thumb") else '<span class="rec-blank"></span>'
            rj = e(json.dumps({"rid": f'm{r["master"]}', "a": a["name"], "t": r["title"], "y": r["year"], "img": r.get("thumb", "")}, separators=(",", ":"))) if r.get("master") else ""
            addb = (f'<span class="radd sm"><button type="button" class="addbtn" data-addrec="{rj}" data-list="records">+ Collection</button>'
                    f'<button type="button" class="addbtn" data-addrec="{rj}" data-list="wants">+ Wantlist</button></span>') if rj else ""
            cards += (f'<div class="rec">{img}<strong>{e(r["title"])}</strong><span class="meta">{r["year"]}</span>'
                      f'<a href="{hq}" rel="noopener">Find on vinyl ↗</a>{addb}</div>')
        records_html = (f'<h2>Essential records</h2><div class="recs">{cards}</div>'
                        f'<p class="note">Record data from <a href="{e(dg.get("url") or "https://www.discogs.com")}" rel="noopener">Discogs ↗</a></p>')
    follow = (f'<form class="card follow" name="follow" method="POST" action="/thanks.html" data-netlify="true" netlify-honeypot="bot-field">'
              f'<h3>Never miss {e(a["name"])} tickets</h3><p>Get presale alerts: we\'ll email you when new Australian dates are announced, and when presales and tickets go on sale.</p>'
              f'<input type="hidden" name="form-name" value="follow"><input type="hidden" name="artist" value="{e(a["name"])}">'
              f'<p hidden><label>Leave this empty <input name="bot-field"></label></p>'
              f'<input type="email" name="email" required placeholder="Your email" aria-label="Email address"><button class="btn">Get presale alerts</button></form>')
    extra_cards = "".join(story_card(s) for s in stories if slug(s.get("artist", "")) == a["slug"]) + \
        "".join(news_card(n) for n in [n for n in news if slug(n.get("artist", "")) == a["slug"]][:3])
    cd = countdown(sh[0]["date"], f'{sh[0]["venue"]}, {sh[0]["city"]}') if sh else ""
    genre = f' · <a class="glink" href="/genres/{slug(a["gb"])}.html">{e(a["gb"])}</a>' if a["gb"] else (" · " + e(a["genre"]) if a["genre"] else "")
    dates_html = gig_list(sh, show_artist=False) if sh else '<p class="note">Dates to be announced. Check the tour announcement.</p>'
    cal = f'<a class="btn ghost" href="/artists/{a["slug"]}.ics">Add all dates to calendar</a>' if sh else ""
    vinyl = HEATHEN + quote_plus(a["name"].split(" & ")[0])
    body = f"""<section class="page-title artist"><div class="wrap ahead"><div><h1>{e(a['name'])}</h1><p>{e(title_tour)}{genre}</p><button class="saveartist" type="button" data-artist="{e(a['slug'])}" data-name="{e(a['name'])}" aria-pressed="false"><span aria-hidden="true">♡</span> Follow</button>{cd}</div>{art(a, 'art hart')}</div></section>
<section class="band"><div class="wrap split"><div>{head}{note}
<h2>{len(sh)} {'show' if len(sh) == 1 else 'shows'} in Australia</h2>{dates_html}{tour_map(a['cities'])}{setlist_html}{records_html}</div>
<aside class="side">{listen}{follow}<div class="card"><h3>Before the show</h3><a class="btn" href="{vinyl}" rel="noopener">Find {e(a['name'])} on vinyl ↗</a>{cal}{src}</div>{extra_cards}</aside></div></section>"""
    desc = (f"{a['name']} {title_tour}: dates, venues and tickets for " + ", ".join(a["cities"]) + ".") if sh else f"{a['name']} Australian tour news."
    jsonld = [event_ld(s, f"{a['name']} live at {s['venue']}", a.get("photo", "")) for s in sh[:20]]
    extra = f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False).replace("</", "<\\/")}</script>' if jsonld else ""
    page(f"artists/{a['slug']}.html", f"{a['name']} {title_tour}: dates & tickets | Live Louder", desc, body, "tours.html", extra, a.get("photo", ""))
    if sh:
        (OUT / "artists" / f"{a['slug']}.ics").write_text(ics(a))

# Artists A–Z: every artist page linked from one list.
_letters = {}
for a in sorted(artists.values(), key=lambda a: re.sub(r"^the\s+", "", a["name"].lower())):
    ch = re.sub(r"^the\s+", "", a["name"].lower())[:1].upper()
    _letters.setdefault(ch if ch.isalpha() else "#", []).append(a)
_order = sorted(_letters, key=lambda x: (x == "#", x))
_arows = "".join(f'<h2 id="l-{slug(L) or "num"}">{e(L)}</h2><nav class="chips">' + "".join(
    f'<a href="/artists/{a["slug"]}.html">{e(a["name"])}' + (f' <small>{len(a["shows"])}</small>' if a["shows"] else "") + "</a>" for a in _letters[L]) + "</nav>" for L in _order)
page("artists/index.html", "Artists A–Z: tour dates and upcoming gigs in Australia | Live Louder",
     f"{len(artists):,} artists with Australian tour dates and gigs, from A to Z.",
     f"""<section class="page-title"><div class="wrap"><h1>Artists A–Z</h1><p>{' · '.join(f'<a style="color:#fff" href="#l-{slug(L) or "num"}">{e(L)}</a>' for L in _order)}</p></div></section>
<section class="band"><div class="wrap">{_arows}</div></section>""", "artists/index.html")

# ---------------------------------------------------------------- tours
def tour_block(t):
    a = artists[slug(t["artist"])]
    rows = "".join(f'<tr data-date="{s["date"]}" data-city="{e(s["city"])}"><td>{fmt(s["date"])}</td><td>{e(s["city"])}</td><td>{e(s["venue"])}</td></tr>' for s in a["shows"])
    tbl = f"<table><tbody>{rows}</tbody></table>" if rows else ""
    cities = " ".join(a["cities"]) or "Sydney Melbourne Brisbane Adelaide Perth"
    sup = f'<p class="sup">With {e(t["support"])}</p>' if t.get("support") else ""
    note = f'<p class="tnote">{e(t["note"])}</p>' if t.get("note") else ""
    vinyl = HEATHEN + quote_plus(t["artist"].split(" & ")[0])
    return (f'<article class="tour" id="{a["slug"]}" data-cities="{e(cities)}"><header>{art(a, "art mini")}<h3><a href="/artists/{a["slug"]}.html">{e(t["artist"])}</a></h3>'
            f'<span class="tn">{e(t["tour"])}</span></header>{sup}{note}{tbl}'
            f'<footer><a href="/artists/{a["slug"]}.html">All dates, tickets &amp; a listen</a><a href="{e(t["source"])}" rel="noopener">Announcement ↗</a>'
            f'<a class="rec" href="{vinyl}" rel="noopener">Get the records ↗</a></footer></article>')
big = [t for t in tours if artists[slug(t["artist"])]["shows"] or not t["dates"]]
big.sort(key=lambda t: (artists[slug(t["artist"])]["shows"] or [{"date": "9999"}])[0]["date"])
def sortname(n): return re.sub(r"^the\s+", "", n.lower())
letters = {}
for a in sorted(artists.values(), key=lambda a: sortname(a["name"])):
    if a["shows"]:
        ch = sortname(a["name"])[:1].upper()
        letters.setdefault(ch if ch.isalpha() else "#", []).append(a)
az_html = ""
if have_feed:
    jump = "".join(f'<a href="#az-{k}">{k}</a>' for k in letters)
    blocks = ""
    for k, v in letters.items():
        lis = "".join(f'<li><a href="/artists/{a["slug"]}.html">{e(a["name"])}</a> <span>{len(a["shows"])} · {e(", ".join(a["cities"][:3]))}</span></li>' for a in v)
        blocks += f'<h3 class="month" id="az-{k}">{k}</h3><ul class="az">{lis}</ul>'
    az_html = f'<section class="band" style="padding-top:0"><div class="wrap"><h2>Every artist touring</h2><nav class="chips">{jump}</nav>{blocks}</div></section>'
tbtns = "".join(f'<button data-city="{e(c)}" aria-pressed="false">{e(c)}</button>' for c in ["Sydney", "Melbourne", "Brisbane", "Adelaide", "Perth"])
tp = f"""<section class="page-title"><div class="wrap"><h1>Tours</h1><p>The big tours coming to Australia, plus every artist with shows booked.</p></div></section>
<section class="band"><div class="wrap"><h2>The big ones</h2><div class="filters" role="group" aria-label="Filter by city"><button data-city="all" aria-pressed="true">All cities</button>{tbtns}</div>
{''.join(tour_block(t) for t in big)}</div></section>{az_html}"""
page("tours.html", "Australian tours: every artist touring Australia | Live Louder",
     "The biggest tours coming to Australia, with dates, venues and tickets, plus every artist with Australian shows booked.", tp, "tours.html")

# ---------------------------------------------------------------- releases
def rel_card(a, b, c, fm):
    hit = (REL_DG.get(f"{b}|{c}") or {}).get("hit") or {}
    cover = (f'<img src="{e(hit["cover"])}" alt="{e(b)} – {e(c)} cover" loading="lazy">' if hit.get("cover")
             else f'<span class="vc-blank" style="--h:{hue(b + c)}"><b>{e(b)}</b></span>')
    when = "Date TBC" if a == "2027" else ("Out now" if a < TODAY_S else d(a).strftime("%a %-d %b"))
    details = " · ".join(x for x in (fm, hit.get("formats", ""), hit.get("label", "")) if x)
    links = f'<a href="{HEATHEN + quote_plus(b + " " + c)}" rel="noopener">Find it on vinyl ↗</a>'
    if hit.get("url"):
        links += f' <a class="dg" href="{e(hit["url"])}" rel="noopener">Discogs ↗</a>'
    return (f'<div class="vcard">{cover}<div class="vtext"><span class="vwhen">{e(when)}</span><strong>{e(b)}</strong>'
            f'<span class="vtitle">{e(c)}</span><span class="meta">{e(details)}</span><span class="vlinks">{links}</span></div></div>')

groups = {}
for a, b, c, fm in rels["items"]:
    groups.setdefault(a, []).append((a, b, c, fm))
rp = ('<section class="page-title"><div class="wrap"><h1>Out soon on vinyl</h1><p>New albums, reissues and box sets coming out on vinyl. '
      'Also: <a style="color:#fff" href="/most-wanted.html">the most-wanted records from artists touring Australia →</a></p></div></section><section class="band"><div class="wrap">')
for k in sorted(groups, key=lambda k: "9999" if len(k) == 4 else k):
    past = len(k) > 4 and k < TODAY_S
    head = "Coming in 2027, date to be confirmed" if len(k) == 4 else ("Out now · " if past else "") + d(k).strftime("%A %-d %B %Y")
    rp += f'<h2 style="font-size:28px;margin-top:28px">{e(head)}</h2><div class="vgrid">{"".join(rel_card(*x) for x in groups[k])}</div>'
rp += f'<p class="note">International release dates. Australian stock often lands a week or two later. Pressing details from Discogs where listed. Updated {UPDATED}.</p></div></section>'
page("out-soon.html", "New vinyl releases: what's coming out soon | Live Louder",
     "Upcoming vinyl releases, reissues and box sets, with covers, formats, labels and release dates.", rp, "out-soon.html")

# ---------------------------------------------------------------- most wanted (Discogs want counts, artists touring Australia)
wanted = []
for a in artists.values():
    if not a["shows"]:
        continue
    recs = sorted([r for r in (a.get("discogs") or {}).get("records", []) if r.get("want")], key=lambda r: -r["want"])[:2]
    for r in recs:
        wanted.append(dict(r, artist=a["name"], slug=a["slug"], first=a["shows"][0]["date"], cities=a["cities"]))
wanted.sort(key=lambda r: -r["want"])
wanted = wanted[:30]
(OUT / "data").mkdir(parents=True, exist_ok=True)
(OUT / "data" / "most-wanted.json").write_text(json.dumps({"updated": TODAY_S, "records": wanted}))
if wanted:
    rows = ""
    for i, r in enumerate(wanted, 1):
        img = f'<img src="{e(r["thumb"])}" alt="{e(r["title"])} cover" loading="lazy">' if r.get("thumb") else f'<span class="vc-blank" style="--h:{hue(r["title"])}"></span>'
        rows += (f'<li><span class="mw-n">{i}</span>{img}<div><strong>{e(r["title"])}</strong> <span class="meta">({r["year"]})</span><br>'
                 f'<a href="/artists/{r["slug"]}.html">{e(r["artist"])}</a> <span class="meta">· touring from {e(fmt(r["first"], False, False))}: {e(", ".join(r["cities"][:4]))}</span><br>'
                 f'<span class="meta">{r["want"]:,} collectors want it · {r["owned"]:,} own it</span> · '
                 f'<a href="{HEATHEN + quote_plus(r["artist"] + " " + r["title"])}" rel="noopener">Find it on vinyl ↗</a></div></li>')
    mw = (f'<section class="page-title"><div class="wrap"><h1>Most wanted</h1><p>The records collectors want most, from artists playing Australia soon. Ranked by Discogs wantlists. Updated {UPDATED}.</p></div></section>'
          f'<section class="band"><div class="wrap" style="max-width:860px"><ol class="mw">{rows}</ol>'
          f'<p class="note">"Want" counts are how many Discogs users have the record on their wantlist. Data from <a href="https://www.discogs.com" rel="noopener">Discogs</a>.</p></div></section>')
else:
    mw = '<section class="page-title"><div class="wrap"><h1>Most wanted</h1><p>Check back soon: we\'re pulling in collector data.</p></div></section>'
page("most-wanted.html", "Most wanted records from artists touring Australia | Live Louder",
     "The vinyl records collectors want most from artists playing Australia soon, ranked by Discogs wantlists.", mw, "out-soon.html")

# ---------------------------------------------------------------- on-sale & presale tracker

if upcoming_sales:
    pre = [x for x in upcoming_sales if x["kind"] == "Presale"]
    gen = [x for x in upcoming_sales if x["kind"] != "Presale"]
    up_html = ""
    if pre:
        up_html += '<h2>Presales</h2><p class="note">Presales usually need a code or sign-up (artist fan club, card holder, venue or promoter list). Check the ticket page for how to get access.</p><ul class="sales">' + "".join(sale_row(x) for x in pre) + "</ul>"
    if gen:
        up_html += '<h2>General on-sales</h2><ul class="sales">' + "".join(sale_row(x) for x in gen) + "</ul>"
else:
    up_html = ('<p class="lead">No on-sales are listed for the next three weeks just yet. We add them as tours are announced, '
               'so check back, or <a href="/tours.html">follow an artist</a> and we\'ll email you when their tickets go on sale.</p>')
just_html = ('<h2 style="margin-top:36px">On sale in the last week</h2><ul class="sales">' + "".join(sale_row(x, True) for x in just_sales[:20]) + "</ul>") if just_sales else ""
osp = (f'<section class="page-title"><div class="wrap"><h1>On sale soon</h1><p>Every presale and general on-sale for the next three weeks, in Sydney time. '
       f'Tap "Remind me" to put it in your calendar.</p></div></section><section class="band"><div class="wrap" style="max-width:920px">{up_html}{just_html}'
       f'<p class="note">Times shown in Sydney time (AEDT/AEST). Sale times can change: always check the ticket page. Updated {UPDATED}.</p></div></section>')
page("on-sale.html", "Tickets on sale soon: presales and on-sale times in Australia | Live Louder",
     "When tickets go on sale for concerts and tours in Australia: presale and general on-sale dates and times, with calendar reminders.", osp, "on-sale.html")

# ---------------------------------------------------------------- my gigs (saved on the visitor's device)
mg = """<div id="profile">
<section class="phero" id="pHero"><button type="button" class="pcover" id="pCover" hidden>📷 Add a cover photo</button>
<input type="file" accept="image/*" id="pFile" hidden>
<div class="wrap phero-in"><div class="pavwrap"><div class="pav" id="pAv" aria-hidden="true">♥</div><button type="button" class="pcam" id="pCam" hidden aria-label="Change profile photo">📷</button></div>
<div class="pwho"><h1 id="pName">My gigs</h1><p id="pSub">Your gigs, your artists and your records, all in one place.</p></div>
<div id="pCta"></div></div><div class="wrap"><div class="pstats" id="pStats"></div></div></section>
<nav class="ptabs" aria-label="My gigs sections"><div class="wrap">
<a href="#overview" data-tab="overview">Overview</a><a href="#gigs" data-tab="gigs">Gigs</a><a href="#artists" data-tab="artists">Artists</a>
<a href="#records" data-tab="records">Records</a><a href="#wantlist" data-tab="wantlist">Wantlist</a><a href="#friends" data-tab="friends">Friends</a><a href="#settings" data-tab="settings">Settings</a></div></nav>
<section class="band pbody"><div class="wrap" id="pBody"><p class="note">Loading…</p></div></section>
<dialog id="recDlg" aria-label="Record details"><form method="dialog" class="sclose"><button aria-label="Close">×</button></form><div id="recBody"></div></dialog>
</div>
<script src="/profile.js" defer></script>"""
page("my-gigs.html", "My gigs | Live Louder", "Your saved gigs, followed artists and record collection on Live Louder.", mg)

# ---------------------------------------------------------------- messages (between friends who follow each other, filled in by messages.js)
msgp = """<div id="msgs" class="msgs"><div class="wrap msgwrap">
<aside class="mlist" id="mList" aria-label="Your conversations"><p class="note">Loading…</p></aside>
<section class="mthread" id="mThread" aria-label="Conversation"></section></div></div>
<script src="/messages.js" defer></script>"""
page("messages.html", "Messages | Live Louder", "Chat with your friends on Live Louder.", msgp, extra_head='<meta name="robots" content="noindex">')

# ---------------------------------------------------------------- shared profiles (/u/<username>, filled in by people.js)
pub = """<div id="pub">
<section class="phero" id="uHero"><div class="wrap phero-in"><div class="pav" id="uAv" aria-hidden="true">♥</div>
<div class="pwho"><h1 id="uName">Loading…</h1><p id="uSub"></p></div><div id="uCta" class="pbtns"></div></div>
<div class="wrap"><div class="pstats" id="uStats"></div></div></section>
<nav class="ptabs" aria-label="Profile sections"><div class="wrap" id="uTabs"></div></nav>
<section class="band pbody"><div class="wrap" id="uBody"><p class="note">Loading…</p></div></section>
</div>
<script src="/people.js" defer></script>"""
page("u/index.html", "A Live Louder profile | Live Louder", "Gigs they're going to and their record collection, on Live Louder.", pub,
     extra_head='<meta name="robots" content="noindex">')
(OUT / "data").mkdir(exist_ok=True)
(OUT / "data" / "artists.json").write_text(json.dumps({a["slug"]: [a["name"], a.get("photo", ""), a["gb"],
    a["shows"][0]["date"] if a["shows"] else "", a["shows"][0]["city"] if a["shows"] else "", len(a["shows"])] for a in artists.values()}, separators=(",", ":")))
(OUT / "data" / "releases.json").write_text(json.dumps([i for i in rels["items"] if i[0] == "2027" or i[0] >= TODAY_S], separators=(",", ":")))
# Pictures for the reminder emails: the artist's best photo and up to 4 records, for artists playing in the next 10 days.
_soon = (TODAY + dt.timedelta(days=10)).date().isoformat()
_art = {}
for a_ in artists.values():
    if not any(TODAY_S <= x["date"] <= _soon for x in a_.get("shows", [])):
        continue
    recs_ = [[r["title"], r.get("year", ""), r["thumb"]] for r in ((a_.get("discogs") or {}).get("records") or [])[:4] if r.get("thumb")]
    img_ = big_img(a_) or a_.get("photo", "")
    if img_ or recs_:
        _art[a_["slug"]] = {"img": img_, "wide": bool(big_img(a_)), "sq": a_.get("photo", ""), "recs": recs_}
(OUT / "data" / "email-art.json").write_text(json.dumps(_art, separators=(",", ":")))

# ---------------------------------------------------------------- submit a gig
metro_opts = "".join(f"<option>{e(m[0])}</option>" for m in feed.METROS)
state_opts = "".join(f"<option>{x}</option>" for x in ("NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"))
genre_opts = "".join(f"<option>{e(g)}</option>" for g, _ in GENRES)
sg = f"""<section class="page-title"><div class="wrap"><h1>Submit a gig</h1><p>Playing a show, running a venue or putting on a night? Add it to the Live Louder gig guide. It's free.</p></div></section>
<section class="band"><div class="wrap split"><form class="gigform" name="gig" method="POST" action="/gig-thanks.html" data-netlify="true" netlify-honeypot="bot-field">
<input type="hidden" name="form-name" value="gig"><p hidden><label>Leave this empty <input name="bot-field"></label></p>
<fieldset><legend>The show</legend>
<label>Artist or band <input name="artist" required maxlength="80" autocomplete="off"></label>
<label>Support acts <small>(optional)</small> <input name="support" maxlength="160"></label>
<div class="two"><label>Date <input type="date" name="date" required min="{TODAY_S}"></label><label>Start time <small>(optional)</small> <input type="time" name="time"></label></div>
<label>Genre <select name="genre"><option value="">Pick one</option>{genre_opts}</select></label></fieldset>
<fieldset><legend>Where</legend>
<label>Venue <input name="venue" required maxlength="100"></label>
<label>City <select name="city" id="gcity" required><option value="">Pick a city</option>{metro_opts}<option value="other">Somewhere else</option></select></label>
<div class="two" id="gother" hidden><label>Town or suburb <input name="town" maxlength="60"></label><label>State <select name="state"><option value="">State</option>{state_opts}</select></label></div></fieldset>
<fieldset><legend>Tickets</legend>
<label>Ticket or event link <input type="url" name="ticket_url" required placeholder="https://" maxlength="300"></label>
<p class="note" style="margin-top:4px">Use the link from your ticketing site: Oztix, Moshtix, Ticketmaster, Ticketek, Humanitix, Eventbrite, TryBooking, DICE and the like. That's how we know the gig is real. Free gig? A free ticket page on Humanitix, Eventbrite or TryBooking works too.</p></fieldset>
<fieldset><legend>About you</legend>
<label>You are <select name="role"><option>In the band</option><option>From the venue</option><option>The promoter</option><option>A fan</option></select></label>
<label>Your email <input type="email" name="email" required autocomplete="email"></label>
<p class="note" style="margin-top:4px">Only used if we need to check something. It's never shown on the site and we won't add you to any lists.</p>
<label>Anything else? <small>(optional)</small> <textarea name="notes" rows="3" maxlength="600"></textarea></label></fieldset>
<button class="btn">Add my gig</button></form>
<aside class="side"><div class="card"><h3>How it works</h3><ol class="steps"><li>Fill in the show details and a ticket link.</li><li>It gets checked overnight.</li><li>It goes up in the gig guide, the city page and the artist page, usually by 7am the next morning.</li></ol></div>
<div class="card"><h3>Got a whole tour?</h3><p>Send each date separately. It only takes a minute each, and every show gets its own spot in the right city.</p></div>
{venue_form(title="Run a venue? Add it once", intro="Tell us your venue and where you list your gigs (website, Oztix, Humanitix, Moshtix). We'll check it regularly and add every show automatically, so you don't have to send each one.")}</aside></div></section>"""
page("submit-a-gig.html", "Submit a gig: add your show to the gig guide | Live Louder",
     "Add your gig to the Live Louder gig guide for free. Bands, venues and promoters across Australia.", sg, "gigs/index.html")
page("gig-thanks.html", "Thanks for your gig | Live Louder", "Thanks for sending in your gig.",
     '<section class="page-title"><div class="wrap"><h1>Got it, thanks</h1><p>We\'ll check your gig overnight and it should be in the gig guide by 7am tomorrow. Got another date? <a style="color:#fff" href="/submit-a-gig.html">Add another gig</a>.</p></div></section>')

# ---------------------------------------------------------------- genres
def genre_tiles(gs):
    return '<div class="gtiles">' + "".join(
        f'<a class="gtile" href="/genres/{slug(g)}.html" style="--h:{GENRE_HUE.get(g, 0)}"><strong>{e(g)}</strong><span>{genre_count[g]} {"artist" if genre_count[g] == 1 else "artists"} touring</span></a>' for g in gs) + "</div>"
gi = (f'<section class="page-title"><div class="wrap"><h1>Browse by genre</h1><p>Find the tours and gigs that are your kind of thing.</p></div></section>'
      f'<section class="band"><div class="wrap">{genre_tiles(GENRE_LIST)}<p class="note">Genres are a rough guide. Plenty of artists fit more than one.</p></div></section>')
page("genres/index.html", "Gigs by genre: rock, indie, pop, metal and more | Live Louder",
     "Browse Australian tours and gigs by genre: rock, indie, pop, metal, hip hop, electronic, country and more.", gi, "genres/index.html")
for g in GENRE_LIST:
    ga_list = sorted([a for a in artists.values() if a["gb"] == g and a["shows"]], key=lambda a: a["shows"][0]["date"])
    gshows = sorted([s for a in ga_list for s in a["shows"]], key=lambda s: (s["date"], s["time"]))
    tcards = "".join(
        f'<a class="card tcard" href="/artists/{a["slug"]}.html">{art(a, "art tart")}<div class="tc"><h3>{e(a["name"])}</h3>'
        f'<div class="meta">{e((a["tour"] or {}).get("tour", ""))}</div><div><span class="first">From {e(fmt(a["shows"][0]["date"]))}</span><br><span class="meta">{e(", ".join(a["cities"]))}</span></div></div></a>'
        for a in ga_list[:24])
    others = [x for x in GENRE_LIST if x != g]
    body = (f'<section class="page-title"><div class="wrap"><h1>{e(g)} gigs</h1><p>{len(ga_list)} {"artist" if len(ga_list) == 1 else "artists"} '
            f'touring Australia, {len(gshows):,} {"show" if len(gshows) == 1 else "shows"} coming up.</p></div></section>'
            f'<section class="band"><div class="wrap"><h2>Who\'s touring</h2><div class="grid">{tcards}</div>'
            f'<h2 style="margin-top:40px">Every {e(g.lower())} show</h2>{gig_list(gshows[:300])}'
            f'<h2 style="margin-top:40px;font-size:26px">Other genres</h2><nav class="chips small">' + "".join(f'<a href="/genres/{slug(x)}.html">{e(x)}</a>' for x in others) + "</nav></div></section>")
    page(f"genres/{slug(g)}.html", f"{g} gigs and tours in Australia | Live Louder",
         f"Upcoming {g.lower()} gigs and tours in Australia: dates, venues and tickets, updated daily.", body, "genres/index.html")

# ---------------------------------------------------------------- stories
si = '<section class="page-title"><div class="wrap"><h1>Stories</h1><p>Albums, artists and the shows worth catching.</p></div></section><section class="band"><div class="wrap" style="max-width:860px">'
si += "".join(f'<a class="storycard" href="/stories/{s["slug"]}.html"><h3>{e(s["title"])}</h3><p>{e(s["dek"])}</p><p class="note">{fmt(s["date"], False)}</p></a>' for s in sorted(stories, key=lambda s: s["date"], reverse=True)) + "</div></section>"
page("stories/index.html", "Music stories | Live Louder", "Album guides, artist primers and stories from Australian music.", si, "stories/index.html")
for s in stories:
    a = artists.get(slug(s.get("artist", "")))
    link = f'<p class="note"><a href="/artists/{a["slug"]}.html">{e(a["name"])} tour dates →</a></p>' if a and a["shows"] else ""
    vinyl = HEATHEN + quote_plus(s.get("artist", ""))
    body = f"""<section class="band"><article class="article"><h1>{e(s['title'])}</h1><p class="dek">{e(s['dek'])}</p>
<p class="note">{fmt(s['date'], False)}</p>{s['body']}{link}
<p class="note"><a href="{vinyl}" rel="noopener">Find {e(s.get('artist', ''))} on vinyl at Heathen Records ↗</a></p></article></section>"""
    page(f"stories/{s['slug']}.html", f"{s['title']} | Live Louder", s["dek"], body, "stories/index.html", "", (a or {}).get("photo", ""))

# ---------------------------------------------------------------- privacy
pv = """<section class="page-title"><div class="wrap"><h1>Privacy</h1><p>What we keep, why, and how to get rid of it.</p></div></section>
<section class="band"><div class="article">
<p>Live Louder is run by Mick Wells in the Blue Mountains, NSW. This page explains what we collect when you use the site and what we do with it. The short version: we keep as little as we can, we never sell it, and you can delete it any time.</p>
<h2>If you just browse</h2>
<p>You don't need an account to use Live Louder. If you save gigs or follow artists without signing in, that list is kept in your own browser on your device. It isn't sent to us.</p>
<p>Like every website, our host (Netlify) keeps standard server logs, such as IP addresses and the pages requested, to keep the site running and secure.</p>
<h2>Site statistics</h2>
<p>We use Google Analytics to understand how people use Live Louder: which pages get visited, roughly where visitors are (country and city), what device they use, how they found us, and actions like clicking through to buy tickets or saving a gig. Google Analytics uses cookies to do this. We use it only to make the site better, we don't use it to identify you, and we never sell it. You can opt out with Google's <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener">opt-out browser add-on</a>, or by blocking cookies in your browser.</p>
<h2>If you create an account</h2>
<p>When you sign in (with an email link or with Google) we keep:</p>
<ul><li>your email address, and your name if you sign in with Google</li><li>the gigs you save, whether you're going, and the artists you follow</li><li>the records in your collection and wantlist</li><li>your username, the name you choose to show, and the profile and cover photos you upload, if you add them</li><li>the people you follow and who follows you, and anyone you've blocked</li><li>messages you send and receive</li><li>your Discogs username, if you link it</li><li>your email settings (gig reminders, presale alerts)</li></ul>
<p>We use these only to run your account: showing your gigs on every device and sending the reminder emails you've switched on. Accounts are stored with Supabase in their Sydney data centre.</p>
<p>If you import from Discogs, we copy your public collection and wantlist into your Live Louder collection. You can remove records any time.</p><h2>Sharing your profile</h2><p>New accounts get a shared profile, so friends can find and follow you. You can make yours private any time: untick "Share my profile" in My gigs, Settings. (Accounts made before 27 November 2026 stay private unless the person switches sharing on.) When sharing is on, anyone with your link (livelouder.com.au/u/your-username) and people who follow you can see your name, username, photos, the gigs you've saved and are going to, and your record collection and wantlist. Your email address is never shown. Switch sharing off and your profile goes private straight away. Photos you upload are checked automatically by Google's SafeSearch service to keep the site friendly. They're stored at a web address that isn't listed anywhere, and are deleted when you remove them or delete your account. Anyone signed in can report a photo, and reported photos are hidden until we've looked at them.</p>
<h2>Messages</h2>
<p>You can send private messages to friends when you both follow each other. Messages are only shown to you and the person you're talking to. We don't read them, except when one is reported to us: then we see the reported message and that person's recent messages to the reporter, so we can decide whether to stop them messaging. Anyone can block someone, which stops them messaging or following you. "Delete conversation" removes it for you; the other person keeps their copy. When an account is deleted, every message it sent or received is deleted too. If a message isn't read within a few minutes, we may email you to say who it's from (never what it says). You can switch these emails off in Settings.</p>
<h2>Emails</h2>
<p>Sign-in links and reminder emails are sent through Resend. If you sign up to the Live Louder Weekly newsletter or to artist alerts, your email (and the city or artists you picked) is kept by Kit, our newsletter service. Every newsletter has an unsubscribe link, and reminder emails can be switched off on the My gigs page.</p>
<h2>Gig submissions</h2>
<p>If you send in a gig, we keep the gig details to publish them, and your email in case we need to check something. Your email is never shown on the site, and we don't add you to any mailing list. Submissions are deleted after the gig has happened.</p>
<h2>Links and tracking</h2>
<p>Links to Heathen Records (Mick's record shop) include a tag so the shop can see visits came from Live Louder. We don't use advertising trackers on this site.</p>
<h2>Who we share it with</h2>
<p>Only the services that run the site: Netlify (hosting), Supabase (accounts), Resend (account emails), Kit (newsletter) and Google (if you choose to sign in with Google). We don't sell or rent your details to anyone.</p>
<h2>Deleting your data</h2>
<p>Signed in? Go to <a href="/my-gigs.html">My gigs</a> and choose "Delete my account". Your account and everything saved in it is deleted straight away. Newsletter subscribers can unsubscribe from any email. For anything else, or a copy of what we hold about you, email <a href="mailto:hello@livelouder.com.au">hello@livelouder.com.au</a>.</p>
<p class="note">Last updated 27 November 2026.</p></div></section>"""
page("privacy.html", "Privacy | Live Louder", "What Live Louder collects, why, and how to delete it.", pv)

# Data for the daily reminder emails (netlify/functions/reminders.mjs): presales and on-sales, and newly announced tours.
(OUT / "data").mkdir(parents=True, exist_ok=True)
def _pic(name):
    a_ = artists.get(slug(name)) or {}
    return a_.get("photo", "") or big_img(a_)
(OUT / "data" / "alerts-feed.json").write_text(json.dumps({
    "built": TODAY_S,
    "sales": [{"artist": x["artist"], "slug": slug(x["artist"]), "kind": x["kind"], "name": x["name"], "when": x["when"].isoformat(),
               "cities": x["cities"][:6], "url": x["url"], "img": _pic(x["artist"])} for x in upcoming_sales],
    "tours": [{"artist": t["artist"], "slug": slug(t["artist"]), "tour": t["tour"], "added": t.get("added", ""),
               "cities": sorted({x[1] for x in t["dates"]}), "first": t["dates"][0][0] if t["dates"] else "", "img": _pic(t["artist"])}
              for t in tours if t.get("added", "") >= (TODAY.date() - dt.timedelta(days=3)).isoformat()]}, separators=(",", ":")))

# ---------------------------------------------------------------- about, thanks, 404, assets, sitemap
ab = """<section class="page-title"><div class="wrap"><h1>About</h1></div></section><section class="band"><div class="article">
<p>Live Louder is an independent Australian music site. We keep track of who's playing where, the big tours heading our way, the festivals worth the trip, what's coming out on vinyl, and the stories behind the records worth owning.</p>
<p>The news and gig guide update every day. Our news briefs are written by us and always link to the original report. We're based in the Blue Mountains, NSW, and we're music fans first. If you're a band, a venue or a label with a tour or release we should know about, get in touch.</p>
<h2>Who's behind it</h2>
<p>G'day, I'm Mick Wells. I run Live Louder, and I also run <a href="https://heathenrecords.com.au">Heathen Records</a>, an independent online record store in Blackheath, up in the Blue Mountains. I spend most of my days around records and the people who love them, and I wanted one place that tells you who's coming, what's worth seeing and which records to grab before the show.</p>
<p>Every week I pick one gig and one record worth your time. You'll find them on the homepage and in the Live Louder Weekly. If you've got a tour, a release or a tip I should know about, email me at <a href="mailto:hello@livelouder.com.au">hello@livelouder.com.au</a>.</p>
<p>Where we link to records, that link usually goes to Heathen Records. That's how the site pays its way.</p></div></section>"""
page("about.html", "About Live Louder", "Live Louder is an independent Australian music site: news, gigs, tours, festivals, new vinyl and stories.", ab)
page("thanks.html", "Thanks | Live Louder", "Thanks for signing up.",
     '<section class="page-title"><div class="wrap"><h1>You\'re in</h1><p>Thanks! We\'ll be in touch. In the meantime, <a style="color:#fff" href="/gigs/index.html">find a gig</a> or catch up on the <a style="color:#fff" href="/news/index.html">latest news</a>.</p></div></section>')
page("404.html", "Page not found | Live Louder", "Page not found.",
     '<section class="page-title"><div class="wrap"><h1>Wrong stage</h1><p>That page isn\'t here. Try the <a style="color:#fff" href="/gigs/index.html">gig guide</a>, <a style="color:#fff" href="/news/index.html">news</a> or <a style="color:#fff" href="/tours.html">tours</a>.</p></div></section>')
shutil.copy(ROOT / "src/style.css", OUT / "style.css")
shutil.copy(ROOT / "src/app.js", OUT / "app.js")
shutil.copy(ROOT / "src/account.js", OUT / "account.js")
shutil.copy(ROOT / "src/profile.js", OUT / "profile.js")
shutil.copy(ROOT / "src/people.js", OUT / "people.js")
shutil.copy(ROOT / "src/friends.js", OUT / "friends.js")
shutil.copy(ROOT / "src/messages.js", OUT / "messages.js")
shutil.copy(ROOT / "src/sw.js", OUT / "sw.js")
shutil.copy(ROOT / "src/crowd.svg", OUT / "crowd.svg")
for icon in (ROOT / "src/icons").iterdir():
    shutil.copy(icon, OUT / icon.name)
(OUT / "site.webmanifest").write_text(json.dumps({"id": "/", "name": "Live Louder", "short_name": "Live Louder", "start_url": "/?app=1", "scope": "/", "display": "standalone",
    "description": "Australian gigs, your friends, and your records in one place.", "background_color": "#141414", "theme_color": "#141414",
    "shortcuts": [{"name": "My gigs", "url": "/my-gigs.html"}, {"name": "Messages", "url": "/messages.html"}, {"name": "Gig guide", "url": "/gigs/index.html"}, {"name": "This weekend", "url": "/this-weekend.html"}],
    "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}]}))
urls = ["", "news/", "gigs/", "on-sale.html", "this-weekend.html", "tours.html", "festivals/", "genres/", "out-soon.html", "most-wanted.html", "stories/", "submit-a-gig.html", "about.html", "privacy.html"] \
    + [f"genres/{slug(g)}.html" for g in GENRE_LIST] \
    + [gig_path(x)[1:] for x in shows] \
    + [f"news/{n['slug']}.html" for n in news] + [f"gigs/{slug(c)}.html" for c in MAIN_CITIES] + [f"gigs/{slug(c)}-this-weekend.html" for c in MAIN_CITIES] \
    + [f"festivals/{f['slug']}.html" for f in fests] + [f"artists/{a['slug']}.html" for a in artists.values()] \
    + [f"venues/{k}.html" for k in venues] + [f"stories/{s['slug']}.html" for s in stories] \
    + ["gigs/regional.html", "venues/", "artists/"] + [f"gigs/{t['slug']}.html" for t in towns.values()]
(OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                                 + "".join(f"<url><loc>{SITE}/{u}</loc><lastmod>{TODAY_S}</lastmod></url>" for u in urls) + "</urlset>")
(OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
weekly_mail, alert_mail = emails.build(OUT, SITE, TODAY.date(), tours, shows, tm, artists, news, stories, fests, rels, slug, REL_DG, pick, upcoming_sales)
social_post = social.build(OUT, SITE, TODAY.date(), {
    "tours": tours, "shows": shows, "artists": artists, "news": news, "stories": stories, "rels": rels, "rel_dg": REL_DG,
    "pick": pick, "upcoming_sales": upcoming_sales, "gotw": gotw, "wanted": wanted, "slug": slug, "curated": curated,
    "main_cities": MAIN_CITIES, "wk_days": wk_days,
    "social_queue": json.loads((ROOT / "data/social_queue.json").read_text()) if (ROOT / "data/social_queue.json").exists() else []})
players = sum(1 for a in artists.values() if a.get("deezer"))
print(f"gig submissions: {len(sub_ok)} live, {len(sub_held)} held back; venue finder gigs: {n_found}")
print(f"built: {len(news)} news, {len(shows)} shows, {len(artists)} artists, {len(venues)} venues, {len(fests)} festivals, feed={'on' if have_feed else 'off'}, players={players}, alerts={len(alert_mail)}, social={(social_post or {}).get('kind', 'none')}")
