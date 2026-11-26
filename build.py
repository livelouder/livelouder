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
import json, html, re, shutil, sys, hashlib, datetime as dt
from pathlib import Path
from urllib.parse import quote_plus, quote

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "src"))
import feed  # noqa: E402
import emails  # noqa: E402
import extras  # noqa: E402

OUT = ROOT / "site"
SITE = "https://livelouder.com.au"
HEATHEN = "https://heathenrecords.com.au/search?type=product&q="
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
tm = feed.fetch(ROOT)

shows = []
for t in tours:
    for dd, c, v in t["dates"]:
        shows.append({"id": f"c-{slug(t['artist'])}-{dd}-{slug(c)}", "artist": t["artist"], "event": t["tour"],
                      "support": [t["support"]] if t.get("support") else [], "date": dd, "time": "", "venue": v,
                      "suburb": c, "city": c, "state": CITY_STATE.get(c, ""), "url": t["source"], "image": "",
                      "genre": t.get("genre", ""), "onsale": "", "presales": [], "status": "", "src": "curated"})
tm_keys = {(slug(s["artist"]), s["date"], s["city"]) for s in tm}
shows = [s for s in shows if (slug(s["artist"]), s["date"], s["city"]) not in tm_keys] + tm
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

def venue_slug(s): return slug(s["venue"] + "-" + s["city"])
venues = {}
for s in shows:
    v = venues.setdefault(venue_slug(s), {"name": s["venue"], "city": s["city"], "suburb": s["suburb"], "shows": []})
    v["shows"].append(s)

city_count = {}
for s in shows:
    city_count[s["city"]] = city_count.get(s["city"], 0) + 1
MAIN_CITIES = [m[0] for m in feed.METROS if city_count.get(m[0])]
if len(MAIN_CITIES) < 5:
    MAIN_CITIES = ["Sydney", "Melbourne", "Brisbane", "Adelaide", "Perth"]
have_feed = bool(tm)

# ---------------------------------------------------------------- helpers
NAV = [("News", "news/index.html"), ("Gig guide", "gigs/index.html"), ("Tours", "tours.html"),
       ("Festivals", "festivals/index.html"), ("Vinyl", "out-soon.html"), ("Stories", "stories/index.html")]

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

def page(path, title, desc, body, active=None, extra_head="", image=""):
    r = "../" * path.count("/")
    nav = "".join(f'<a href="{r}{h}"{" aria-current=page" if h == active else ""}>{n}</a>' for n, h in NAV)
    canon = SITE + "/" + ("" if path == "index.html" else path.replace("index.html", ""))
    body = body.replace('href="/', 'href="' + r).replace('src="/', 'src="' + r).replace('action="/', 'action="' + r)
    og_img = f'<meta property="og:image" content="{e(image)}">' if image.startswith("http") else ""
    credit = "Event data from Ticketmaster. Music previews from Deezer." if have_feed else "Music previews from Deezer."
    cities = " · ".join(f'<a href="{r}gigs/{slug(c)}.html">{e(c)}</a>' for c in MAIN_CITIES[:8])
    doc = f"""<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:site_name" content="Live Louder"><meta property="og:url" content="{canon}">{og_img}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="alternate" type="application/rss+xml" title="Live Louder news" href="{SITE}/news/feed.xml">
<link rel="stylesheet" href="{r}style.css">{extra_head}</head><body data-root="{r}">
<header class="top"><div class="wrap"><a class="wm" href="{r}index.html">LIVE <span>LOUDER</span></a><nav aria-label="Main">{nav}</nav>
<form class="hsearch" action="{r}gigs/index.html" role="search"><input type="search" name="q" placeholder="Search artists, venues" aria-label="Search gigs"></form></div></header>
<main>{body}</main>
{signup_band(r)}
<footer class="foot"><div class="wrap"><div><div class="wm">LIVE <span>LOUDER</span></div>
<p>An independent Australian music site: news, gigs, tours, festivals, new vinyl and stories, made in the Blue Mountains, NSW.</p>
<p>Dates change. Always check with the official ticket seller before you buy. Updated {UPDATED}.</p><p>{credit}</p></div>
<div><p><a href="{r}news/index.html">News</a> · <a href="{r}gigs/index.html">Gig guide</a> · <a href="{r}tours.html">Tours</a> · <a href="{r}festivals/index.html">Festivals</a> · <a href="{r}out-soon.html">Vinyl</a> · <a href="{r}stories/index.html">Stories</a> · <a href="{r}about.html">About</a></p>
<p>Gigs by city: {cities}</p>
<p>Records for the drive to the show: our friends at <a href="https://heathenrecords.com.au">Heathen Records</a>.</p>
<p>© {TODAY.year} Live Louder</p></div></div></footer>
<script src="{r}app.js" defer></script></body></html>"""
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

def gig_row(s, show_artist=True, show_city=True):
    who = f'<a class="gname" href="/artists/{slug(s["artist"])}.html">{e(s["artist"])}</a>' if show_artist else ""
    sup = f'<span class="gsup">with {e(", ".join(s["support"]))}</span>' if s["support"] and show_artist else ""
    where = f'<a class="vlink" href="/venues/{venue_slug(s)}.html">{e(s["venue"])}</a>' + (", " + e(s["city"]) if show_city else "")
    wd = d(s["date"]).strftime("%a")
    t = f" · {wd} {e(s['time'])}" if s["time"] else f" · {wd}"
    sale = ""
    if s["onsale"] and s["onsale"][:10] > TODAY_S:
        sale = f'<span class="tag">On sale {fmt(s["onsale"][:10], False, False)}</span>'
    label = "Tickets" if s["src"] == "ticketmaster" else "Details"
    return (f'<li class="gig" data-date="{s["date"]}" data-city="{e(s["city"])}"><div class="gd"><b>{d(s["date"]).day}</b>'
            f'<small>{d(s["date"]).strftime("%b")}</small></div><div class="gi">{who}{sup}<span class="gw">{where}{t}</span>{sale}</div>'
            f'<div class="ga"><a href="{e(s["url"])}" rel="noopener">{label} ↗</a><a class="cal" href="{e(gcal(s, s["artist"]))}" rel="noopener">+ Calendar</a></div></li>')

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
        f'<a href="/gigs/{slug(c)}.html"{" aria-current=page" if c == cur else ""}>{e(c)}</a>' for c in MAIN_CITIES) + "</nav>"

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

# ---------------------------------------------------------------- home
featured = [s for s in shows if slug(s["artist"]) in curated] or shows
seen, stubs = set(), []
for s in featured:
    k = (s["artist"], s["city"])
    if k in seen:
        continue
    seen.add(k)
    stubs.append(stub(s))
    if len(stubs) >= 14:
        break
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
    news_html = (f'<section class="band newsband"><div class="wrap"><div class="shead"><h2>Latest news</h2><a href="/news/index.html">All news →</a></div>'
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
if onsale:
    onsale_html = '<h2>On sale soon</h2><ul class="rel">' + "".join(
        f'<li><div class="when">{fmt(s["onsale"][:10], False, False)}</div><div class="what"><strong><a href="/artists/{slug(s["artist"])}.html">{e(s["artist"])}</a></strong><span>{e(s["city"])} · {e(s["venue"])}</span></div></li>' for s in onsale) + "</ul>"
fest_html = "".join(fest_card(f) for f in fests)
rel_items = [i for i in rels["items"] if i[0] == "2027" or i[0] >= TODAY_S][:8]
rel_html = "".join(f'<li><div class="when">{"TBC" if a == "2027" else d(a).strftime("%-d %b")}</div><div class="what"><strong>{e(b)} – {e(c)}</strong><span>{e(fm)}</span></div></li>' for a, b, c, fm in rel_items)
fest_h = '<h2 style="margin-top:36px">Festival guides</h2>' if onsale else "<h2>Festival guides</h2>"
home = f"""<section class="hero"><svg class="disc" viewBox="-250 -250 500 500" aria-hidden="true"><circle r="248" fill="#0b0b0b" stroke="#2c2c2c" stroke-width="2"/>{disc}
<path d="M-230 -60 A238 238 0 0 1 -60 -230" stroke="rgba(255,255,255,.12)" stroke-width="22" fill="none"/>
<circle r="86" fill="#e2391f"/><text y="-8" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#fff">LIVE</text>
<text y="34" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#141414">LOUDER</text><circle r="7" fill="#141414"/></svg><div class="wrap">
<h1 class="big wm">LIVE<span>LOUDER</span></h1>
<p class="lede">Australian music news, every big gig and tour, festival guides, and what's coming out on vinyl.</p>
<form class="bigsearch" action="/gigs/index.html" role="search"><input type="search" name="q" placeholder="Search an artist, venue or city" aria-label="Search gigs"><button>Find gigs</button></form>
<div class="stubs-head"><h2>Big shows coming up</h2><div class="arrows"><button data-go="-1" aria-label="Previous shows">←</button> <button data-go="1" aria-label="Next shows">→</button></div></div>
<div class="stubs" tabindex="0" aria-label="Upcoming shows">{''.join(stubs)}</div></div></section>
{news_html}{gotw_html}
<section class="band citiesband"><div class="wrap"><h2>Gigs near you</h2>{chips()}</div></section>
<section class="band"><div class="wrap split">
<div><h2>This week</h2>{week_html}<a class="more" href="/gigs/index.html">Full gig guide ({len(shows):,} shows) →</a></div>
<div>{onsale_html}{fest_h}{fest_html}<h2 style="margin-top:36px">Stories</h2>{''.join(story_card(s) for s in stories[:3])}</div>
</div></section>
<section class="band" style="padding-top:0"><div class="wrap"><div class="shead"><h2>Just announced</h2><a href="/tours.html">All the big tours →</a></div><div class="grid">{''.join(tour_card(t) for t in announced)}</div></div></section>
<section class="band" style="padding-top:0"><div class="wrap"><div class="shead"><h2>Out soon on vinyl</h2><a href="/out-soon.html">Full release list →</a></div><ul class="rel two">{rel_html}</ul></div></section>"""
page("index.html", "Live Louder | Australian music news, gigs, tours and new vinyl",
     "Australian music news, every big gig and tour by city, festival guides, and what's coming out on vinyl.", home)

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
gg = f"""<section class="page-title"><div class="wrap"><h1>Gig guide</h1><p>Every show we know about, across Australia. Search, or narrow it down by city and date.</p></div></section>
<section class="band"><div class="wrap" id="guide">
<div class="controls"><input id="q" type="search" placeholder="Artist, venue or suburb" aria-label="Search">
<select id="city" aria-label="City"><option value="">All cities</option>{city_opts}</select>
<div class="filters" role="group" aria-label="When"><button data-when="all" aria-pressed="true">Any time</button><button data-when="week" aria-pressed="false">This week</button><button data-when="weekend" aria-pressed="false">This weekend</button><button data-when="month" aria-pressed="false">Next 30 days</button></div></div>
<p class="count" id="count" aria-live="polite">Loading shows…</p><div id="results"></div><button id="moreBtn" class="morebtn" hidden>Show more</button>
<noscript>{gig_list(shows[:300])}</noscript></div></section>"""
page("gigs/index.html", "Gig guide: concerts and gigs in Australia | Live Louder",
     "Search every big gig in Australia by artist, venue, city and date. Concerts in Sydney, Melbourne, Brisbane, Perth, Adelaide and more.", gg, "gigs/index.html")
(OUT / "gigs.json").write_text(json.dumps([[s["date"], s["time"], s["artist"], slug(s["artist"]), s["venue"], s["suburb"], s["city"], s["url"],
                                           ", ".join(s["support"]), s["src"], gcal(s, s["artist"]), venue_slug(s)] for s in shows], separators=(",", ":")))

for c in MAIN_CITIES:
    cs = [s for s in shows if s["city"] == c]
    counts = {}
    for s in cs:
        counts[venue_slug(s)] = (s["venue"], counts.get(venue_slug(s), ("", 0))[1] + 1)
    cv = sorted(counts.items(), key=lambda kv: -kv[1][1])[:12]
    vchips = ('<h2 style="margin-top:28px;font-size:26px">Venues</h2><nav class="chips small">' + "".join(f'<a href="/venues/{k}.html">{e(v[0])}</a>' for k, v in cv) + "</nav>") if cv else ""
    more_link = f'<p class="note">Showing the next 400. <a href="/gigs/index.html?city={quote_plus(c)}">See them all in the gig guide</a>.</p>' if len(cs) > 400 else ""
    body = f"""<section class="page-title"><div class="wrap"><h1>Gigs in {e(c)}</h1><p>{len(cs):,} upcoming shows in and around {e(c)}, soonest first.</p></div></section>
<section class="band"><div class="wrap">{chips(c)}{vchips}<div style="height:10px"></div>{gig_list(cs[:400], show_city=False)}{more_link}</div></section>"""
    page(f"gigs/{slug(c)}.html", f"Gigs in {c}: concerts and live music | Live Louder",
         f"Upcoming gigs and concerts in {c}, updated daily: dates, venues and tickets.", body, "gigs/index.html")

# ---------------------------------------------------------------- venues
for k, v in venues.items():
    loc = e(v["city"]) if v["suburb"] == v["city"] else f'{e(v["suburb"])}, {e(v["city"])}'
    n = len(v["shows"])
    maps = "https://www.google.com/maps/search/?api=1&amp;query=" + quote_plus(f"{v['name']}, {v['suburb']} Australia")
    body = f"""<section class="page-title"><div class="wrap"><h1>{e(v['name'])}</h1><p>{loc} · {n} upcoming {'show' if n == 1 else 'shows'}</p></div></section>
<section class="band"><div class="wrap"><p><a href="{maps}" rel="noopener">Find it on Google Maps ↗</a> · <a href="/gigs/{slug(v['city'])}.html">More gigs in {e(v['city'])}</a></p>
{gig_list(v['shows'], show_city=False)}</div></section>"""
    page(f"venues/{k}.html", f"{v['name']}, {v['city']}: upcoming gigs | Live Louder",
         f"Upcoming concerts and gigs at {v['name']} in {v['city']}: dates and tickets.", body, "gigs/index.html")

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
            cards += (f'<div class="rec">{img}<strong>{e(r["title"])}</strong><span class="meta">{r["year"]}</span>'
                      f'<a href="{hq}" rel="noopener">Find on vinyl ↗</a></div>')
        records_html = (f'<h2>Essential records</h2><div class="recs">{cards}</div>'
                        f'<p class="note">Record data from <a href="{e(dg.get("url") or "https://www.discogs.com")}" rel="noopener">Discogs ↗</a></p>')
    follow = (f'<form class="card follow" name="follow" method="POST" action="/thanks.html" data-netlify="true" netlify-honeypot="bot-field">'
              f'<h3>Follow {e(a["name"])}</h3><p>Get an email when new Australian dates are announced or tickets go on sale.</p>'
              f'<input type="hidden" name="form-name" value="follow"><input type="hidden" name="artist" value="{e(a["name"])}">'
              f'<p hidden><label>Leave this empty <input name="bot-field"></label></p>'
              f'<input type="email" name="email" required placeholder="Your email" aria-label="Email address"><button class="btn">Follow</button></form>')
    extra_cards = "".join(story_card(s) for s in stories if slug(s.get("artist", "")) == a["slug"]) + \
        "".join(news_card(n) for n in [n for n in news if slug(n.get("artist", "")) == a["slug"]][:3])
    cd = countdown(sh[0]["date"], f'{sh[0]["venue"]}, {sh[0]["city"]}') if sh else ""
    genre = " · " + e(a["genre"]) if a["genre"] else ""
    dates_html = gig_list(sh, show_artist=False) if sh else '<p class="note">Dates to be announced. Check the tour announcement.</p>'
    cal = f'<a class="btn ghost" href="/artists/{a["slug"]}.ics">Add all dates to calendar</a>' if sh else ""
    vinyl = HEATHEN + quote_plus(a["name"].split(" & ")[0])
    body = f"""<section class="page-title artist"><div class="wrap ahead"><div><h1>{e(a['name'])}</h1><p>{e(title_tour)}{genre}</p>{cd}</div>{art(a, 'art hart')}</div></section>
<section class="band"><div class="wrap split"><div>{head}{note}
<h2>{len(sh)} {'show' if len(sh) == 1 else 'shows'} in Australia</h2>{dates_html}{tour_map(a['cities'])}{setlist_html}{records_html}</div>
<aside class="side">{listen}{follow}<div class="card"><h3>Before the show</h3><a class="btn" href="{vinyl}" rel="noopener">Find {e(a['name'])} on vinyl ↗</a>{cal}{src}</div>{extra_cards}</aside></div></section>"""
    desc = (f"{a['name']} {title_tour}: dates, venues and tickets for " + ", ".join(a["cities"]) + ".") if sh else f"{a['name']} Australian tour news."
    jsonld = [{"@context": "https://schema.org", "@type": "MusicEvent", "name": f"{a['name']} live", "startDate": s["date"] + (f"T{s['time']}" if s["time"] else ""),
               "location": {"@type": "Place", "name": s["venue"], "address": {"@type": "PostalAddress", "addressLocality": s["suburb"], "addressRegion": s["state"], "addressCountry": "AU"}},
               "performer": {"@type": "MusicGroup", "name": a["name"]}, "url": s["url"]} for s in sh[:20]]
    extra = f'<script type="application/ld+json">{json.dumps(jsonld)}</script>' if jsonld else ""
    page(f"artists/{a['slug']}.html", f"{a['name']} {title_tour}: dates & tickets | Live Louder", desc, body, "tours.html", extra, a.get("photo", ""))
    if sh:
        (OUT / "artists" / f"{a['slug']}.ics").write_text(ics(a))

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

# ---------------------------------------------------------------- about, thanks, 404, assets, sitemap
ab = """<section class="page-title"><div class="wrap"><h1>About</h1></div></section><section class="band"><div class="article">
<p>Live Louder is an independent Australian music site. We keep track of who's playing where, the big tours heading our way, the festivals worth the trip, what's coming out on vinyl, and the stories behind the records worth owning.</p>
<p>The news and gig guide update every day. Our news briefs are written by us and always link to the original report. We're based in the Blue Mountains, NSW, and we're music fans first. If you're a band, a venue or a label with a tour or release we should know about, get in touch.</p>
<p>Live Louder is supported by <a href="https://heathenrecords.com.au">Heathen Records</a>, an independent online record store. Where we link to records, that's usually where the link goes.</p></div></section>"""
page("about.html", "About Live Louder", "Live Louder is an independent Australian music site: news, gigs, tours, festivals, new vinyl and stories.", ab)
page("thanks.html", "Thanks | Live Louder", "Thanks for signing up.",
     '<section class="page-title"><div class="wrap"><h1>You\'re in</h1><p>Thanks! We\'ll be in touch. In the meantime, <a style="color:#fff" href="/gigs/index.html">find a gig</a> or catch up on the <a style="color:#fff" href="/news/index.html">latest news</a>.</p></div></section>')
page("404.html", "Page not found | Live Louder", "Page not found.",
     '<section class="page-title"><div class="wrap"><h1>Wrong stage</h1><p>That page isn\'t here. Try the <a style="color:#fff" href="/gigs/index.html">gig guide</a>, <a style="color:#fff" href="/news/index.html">news</a> or <a style="color:#fff" href="/tours.html">tours</a>.</p></div></section>')
shutil.copy(ROOT / "src/style.css", OUT / "style.css")
shutil.copy(ROOT / "src/app.js", OUT / "app.js")
urls = ["", "news/", "gigs/", "tours.html", "festivals/", "out-soon.html", "most-wanted.html", "stories/", "about.html"] \
    + [f"news/{n['slug']}.html" for n in news] + [f"gigs/{slug(c)}.html" for c in MAIN_CITIES] \
    + [f"festivals/{f['slug']}.html" for f in fests] + [f"artists/{a['slug']}.html" for a in artists.values()] \
    + [f"venues/{k}.html" for k in venues] + [f"stories/{s['slug']}.html" for s in stories]
(OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                                 + "".join(f"<url><loc>{SITE}/{u}</loc><lastmod>{TODAY_S}</lastmod></url>" for u in urls) + "</urlset>")
(OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
weekly_mail, alert_mail = emails.build(OUT, SITE, TODAY.date(), tours, shows, tm, artists, news, stories, fests, rels, slug)
players = sum(1 for a in artists.values() if a.get("deezer"))
print(f"built: {len(news)} news, {len(shows)} shows, {len(artists)} artists, {len(venues)} venues, {len(fests)} festivals, feed={'on' if have_feed else 'off'}, players={players}, alerts={len(alert_mail)}")
