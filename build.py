"""Builds the Live Louder static site into ./site.

Content comes from:
  data/tours.json     hand-picked tours (with notes, support acts, sources)
  data/releases.json  upcoming vinyl releases
  data/stories.json   stories
  Ticketmaster feed   every Australian music show (src/feed.py), when TICKETMASTER_KEY is set

Run: python3 build.py   (Netlify runs this on every deploy)
"""
import json, html, re, shutil, sys, datetime as dt
from pathlib import Path
from urllib.parse import quote_plus, quote

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "src"))
import feed  # noqa: E402

OUT = ROOT / "site"
SITE = "https://livelouder.com.au"
HEATHEN = "https://heathenrecords.com.au/search?type=product&q="
TODAY = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(hours=10)  # Australian east-coast date at build
TODAY_S = TODAY.date().isoformat()
UPDATED = TODAY.strftime("%-d %B %Y")
TZ = {"NSW": "Australia/Sydney", "ACT": "Australia/Sydney", "VIC": "Australia/Melbourne", "QLD": "Australia/Brisbane",
      "SA": "Australia/Adelaide", "WA": "Australia/Perth", "TAS": "Australia/Hobart", "NT": "Australia/Darwin"}
CITY_STATE = {m[0]: m[1] for m in feed.METROS}
CITY_STATE.update({"Fremantle": "WA", "Meredith": "VIC", "Thirroul": "NSW"})

e = lambda s: html.escape(str(s), quote=True)
def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")).strip("-") or "x"
def d(s): return dt.date.fromisoformat(s)
def fmt(s, wd=True, yr=True):
    x = d(s)
    return (x.strftime("%a ") if wd else "") + f"{x.day} {x.strftime('%b')}" + (x.strftime(" %Y") if yr else "")

# ---------------------------------------------------------------- data
tours = json.loads((ROOT / "data/tours.json").read_text())
rels = json.loads((ROOT / "data/releases.json").read_text())
stories = json.loads((ROOT / "data/stories.json").read_text())
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
for k, t in curated.items():  # curated tours with no dates yet still get a page
    artists.setdefault(k, {"name": t["artist"], "slug": k, "shows": [], "image": "", "genre": t.get("genre", "")})
for a in artists.values():
    a["tour"] = curated.get(a["slug"])
    a["cities"] = sorted({s["city"] for s in a["shows"]})

city_count = {}
for s in shows:
    city_count[s["city"]] = city_count.get(s["city"], 0) + 1
MAIN_CITIES = [m[0] for m in feed.METROS if city_count.get(m[0])]
if len(MAIN_CITIES) < 5:
    MAIN_CITIES = ["Sydney", "Melbourne", "Brisbane", "Adelaide", "Perth"]
have_feed = bool(tm)

# ---------------------------------------------------------------- helpers
NAV = [("Gig guide", "gigs/index.html"), ("Tours", "tours.html"), ("Out soon", "out-soon.html"),
       ("Stories", "stories/index.html"), ("About", "about.html")]

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
        lines += ["BEGIN:VEVENT", f"UID:{s['id']}@livelouder.com.au", f"DTSTAMP:{dt.datetime.now(dt.timezone.utc).replace(tzinfo=None):%Y%m%dT%H%M%SZ}",
                  f"DTSTART;VALUE=DATE:{day:%Y%m%d}", f"DTEND;VALUE=DATE:{day + dt.timedelta(days=1):%Y%m%d}",
                  f"SUMMARY:{a['name']} live", f"LOCATION:{s['venue']}\\, {s['suburb']}", f"URL:{s['url']}", "END:VEVENT"]
    return "\r\n".join(lines + ["END:VCALENDAR"]) + "\r\n"

def page(path, title, desc, body, active=None, extra_head=""):
    r = "../" * path.count("/")
    nav = "".join(f'<a href="{r}{h}"{" aria-current=page" if h == active else ""}>{n}</a>' for n, h in NAV)
    canon = SITE + "/" + ("" if path == "index.html" else path.replace("index.html", ""))
    body = body.replace('href="/', 'href="' + r).replace('src="/', 'src="' + r)
    doc = f"""<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:site_name" content="Live Louder"><meta property="og:url" content="{canon}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{r}style.css">{extra_head}</head><body data-root="{r}">
<header class="top"><div class="wrap"><a class="wm" href="{r}index.html">LIVE <span>LOUDER</span></a><nav aria-label="Main">{nav}</nav>
<form class="hsearch" action="{r}gigs/index.html" role="search"><input type="search" name="q" placeholder="Search artists, venues" aria-label="Search gigs"></form></div></header>
<main>{body}</main>
<footer class="foot"><div class="wrap"><div><div class="wm">LIVE <span>LOUDER</span></div>
<p>An independent Australian music site: gigs, tours, new vinyl and stories, made in the Blue Mountains, NSW.</p>
<p>Dates change. Always check with the official ticket seller before you buy. Updated {UPDATED}.</p>
{'<p>Event data from Ticketmaster.</p>' if have_feed else ''}</div>
<div><p><a href="{r}gigs/index.html">Gig guide</a> · <a href="{r}tours.html">Tours</a> · <a href="{r}out-soon.html">Out soon</a> · <a href="{r}stories/index.html">Stories</a> · <a href="{r}about.html">About</a></p>
<p>Gigs by city: {' · '.join(f'<a href="{r}gigs/{slug(c)}.html">{e(c)}</a>' for c in MAIN_CITIES[:8])}</p>
<p>Records for the drive to the show: our friends at <a href="https://heathenrecords.com.au">Heathen Records</a>.</p>
<p>© {TODAY.year} Live Louder</p></div></div></footer>
<script src="{r}app.js" defer></script></body></html>"""
    p = OUT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(doc)

def stub(s):
    x = d(s["date"])
    return (f'<a class="stub" data-date="{s["date"]}" href="/artists/{slug(s["artist"])}.html"><div class="d"><b>{x.day}</b>'
            f'<small>{x.strftime("%b")}</small></div><div class="i"><strong>{e(s["artist"])}</strong>'
            f'<span>{e(s["city"])} · {e(s["venue"])}</span></div></a>')

def gig_row(s, show_artist=True, show_city=True):
    who = f'<a class="gname" href="/artists/{slug(s["artist"])}.html">{e(s["artist"])}</a>' if show_artist else ""
    sup = f'<span class="gsup">with {e(", ".join(s["support"]))}</span>' if s["support"] and show_artist else ""
    where = f'{e(s["venue"])}{", " + e(s["city"]) if show_city else ""}'
    t = f' · {d(s["date"]).strftime("%a")} {e(s["time"])}' if s["time"] else ""
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

def chips(cur=None, r="/"):
    return '<nav class="chips" aria-label="Cities">' + "".join(
        f'<a href="{r}gigs/{slug(c)}.html"{" aria-current=page" if c == cur else ""}>{e(c)}</a>' for c in MAIN_CITIES) + "</nav>"

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
this_week = [s for s in shows if s["date"] < week_end][:16]
onsale = {}
for s in tm:
    if s["onsale"] and TODAY_S < s["onsale"][:10] <= (TODAY.date() + dt.timedelta(days=21)).isoformat():
        onsale.setdefault(slug(s["artist"]), s)
onsale = sorted(onsale.values(), key=lambda s: s["onsale"])[:8]
announced = sorted(tours, key=lambda t: t.get("added", ""), reverse=True)[:6]

def tour_card(t):
    a = artists[slug(t["artist"])]
    first = fmt(a["shows"][0]["date"]) if a["shows"] else t.get("when", "Dates to come")
    return (f'<article class="card"><h3><a href="/artists/{a["slug"]}.html">{e(t["artist"])}</a></h3><div class="meta">{e(t["tour"])}</div>'
            f'<div><span class="first">From {e(first)}</span><br><span class="meta">{e(", ".join(a["cities"]) or t.get("note", ""))}</span></div>'
            f'<a href="/artists/{a["slug"]}.html">Dates &amp; tickets</a></article>')

week_html = gig_list(this_week) if this_week else '<p class="note">Check the <a href="/gigs/index.html">gig guide</a> for what is on.</p>'
disc = "".join(f'<circle r="{r}" fill="none" stroke="#2a2a2a" stroke-width="1.2"/>' for r in range(96, 238, 9))
home = f"""<section class="hero"><svg class="disc" viewBox="-250 -250 500 500" aria-hidden="true"><circle r="248" fill="#141414"/>{disc}
<path d="M-230 -60 A238 238 0 0 1 -60 -230" stroke="rgba(255,255,255,.18)" stroke-width="22" fill="none"/>
<circle r="86" fill="#f6f5f2"/><text y="-8" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#e2391f">LIVE</text>
<text y="34" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#141414">LOUDER</text><circle r="7" fill="#e2391f"/></svg><div class="wrap">
<h1 class="big wm">LIVE<span>LOUDER</span></h1>
<p class="lede">Every big gig and tour in Australia, what's coming out on vinyl, and the stories behind the records.</p>
<form class="bigsearch" action="/gigs/index.html" role="search"><input type="search" name="q" placeholder="Search an artist, venue or city" aria-label="Search gigs"><button>Find gigs</button></form>
<div class="stubs-head"><h2>Big shows coming up</h2><div class="arrows"><button data-go="-1" aria-label="Previous shows">←</button> <button data-go="1" aria-label="Next shows">→</button></div></div>
<div class="stubs" tabindex="0" aria-label="Upcoming shows">{''.join(stubs)}</div></div></section>
<section class="band citiesband"><div class="wrap"><h2>Gigs near you</h2>{chips()}</div></section>
<section class="band"><div class="wrap split">
<div><h2>This week</h2>{week_html}
<a class="more" href="/gigs/index.html">Full gig guide ({len(shows):,} shows) →</a></div>
<div>{'<h2>On sale soon</h2><ul class="rel">' + ''.join(f'<li><div class="when">{fmt(s["onsale"][:10], False, False)}</div><div class="what"><strong><a href="/artists/{slug(s["artist"])}.html">{e(s["artist"])}</a></strong><span>{e(s["city"])} · {e(s["venue"])}</span></div></li>' for s in onsale) + '</ul>' if onsale else ''}
<h2{' style="margin-top:36px"' if onsale else ''}>Stories</h2>{''.join(f'<a class="storycard" href="/stories/{s["slug"]}.html"><h3>{e(s["title"])}</h3><p>{e(s["dek"])}</p></a>' for s in stories[:3])}</div>
</div></section>
<section class="band" style="padding-top:0"><div class="wrap"><h2>Just announced</h2><div class="grid">{''.join(tour_card(t) for t in announced)}</div>
<a class="more" href="/tours.html">All the big tours →</a></div></section>
<section class="band" style="padding-top:0"><div class="wrap"><h2>Out soon on vinyl</h2><ul class="rel two">{''.join(f'<li><div class="when">{"TBC" if a == "2027" else d(a).strftime("%-d %b")}</div><div class="what"><strong>{e(b)} – {e(c)}</strong><span>{e(fm)}</span></div></li>' for a, b, c, fm in [i for i in rels['items'] if i[0] == '2027' or i[0] >= TODAY_S][:8])}</ul>
<a class="more" href="/out-soon.html">Full release list →</a></div></section>"""
page("index.html", "Live Louder | Australian gig guide, tours and new vinyl",
     "Every big gig and tour in Australia by city, what's coming out on vinyl, and the stories behind the records.", home)

# ---------------------------------------------------------------- gig guide (client-side filters over gigs.json)
gg = f"""<section class="page-title"><div class="wrap"><h1>Gig guide</h1><p>Every show we know about, across Australia. Search, or narrow it down by city and date.</p></div></section>
<section class="band"><div class="wrap" id="guide">
<div class="controls"><input id="q" type="search" placeholder="Artist, venue or suburb" aria-label="Search">
<select id="city" aria-label="City"><option value="">All cities</option>{''.join(f'<option>{e(c)}</option>' for c in MAIN_CITIES)}</select>
<div class="filters" role="group" aria-label="When"><button data-when="all" aria-pressed="true">Any time</button><button data-when="week" aria-pressed="false">This week</button><button data-when="weekend" aria-pressed="false">This weekend</button><button data-when="month" aria-pressed="false">Next 30 days</button></div></div>
<p class="count" id="count" aria-live="polite">Loading shows…</p><div id="results"></div><button id="moreBtn" class="morebtn" hidden>Show more</button>
<noscript>{gig_list(shows[:300])}</noscript></div></section>"""
page("gigs/index.html", "Gig guide: concerts and gigs in Australia | Live Louder",
     "Search every big gig in Australia by artist, venue, city and date. Concerts in Sydney, Melbourne, Brisbane, Perth, Adelaide and more.", gg, "gigs/index.html")
(OUT / "gigs.json").write_text(json.dumps([[s["date"], s["time"], s["artist"], slug(s["artist"]), s["venue"], s["suburb"], s["city"], s["url"],
                                           ", ".join(s["support"]), s["src"], gcal(s, s["artist"])] for s in shows], separators=(",", ":")))

# ---------------------------------------------------------------- city pages
for c in MAIN_CITIES:
    cs = [s for s in shows if s["city"] == c]
    body = f"""<section class="page-title"><div class="wrap"><h1>Gigs in {e(c)}</h1><p>{len(cs):,} upcoming shows in and around {e(c)}, soonest first.</p></div></section>
<section class="band"><div class="wrap">{chips(c)}<div style="height:18px"></div>{gig_list(cs[:400], show_city=False)}
{f'<p class="note">Showing the next 400. <a href="/gigs/index.html?city={quote_plus(c)}">See them all in the gig guide</a>.</p>' if len(cs) > 400 else ''}</div></section>"""
    page(f"gigs/{slug(c)}.html", f"Gigs in {c}: concerts and live music | Live Louder",
         f"Upcoming gigs and concerts in {c}, updated daily: dates, venues and tickets.", body, "gigs/index.html")

# ---------------------------------------------------------------- artist pages
for a in artists.values():
    t = a["tour"]
    sh = a["shows"]
    title_tour = (t["tour"] if t and t["tour"] not in ("Australian tour",) else "Australian tour") + (f" {d(sh[0]['date']).year}" if sh else "")
    head = f'<p class="sup">With {e(t["support"])}</p>' if t and t.get("support") else ""
    note = f'<p class="tnote">{e(t["note"])}</p>' if t and t.get("note") else ""
    img = f'<img class="aimg" src="{e(a["image"])}" alt="" loading="lazy">' if a["image"] else ""
    src = f'<p><a href="{e(t["source"])}" rel="noopener">Tour announcement ↗</a></p>' if t else ""
    story = [s for s in stories if slug(s.get("artist", "")) == a["slug"]]
    story_html = "".join(f'<a class="storycard" href="/stories/{s["slug"]}.html"><h3>{e(s["title"])}</h3><p>{e(s["dek"])}</p></a>' for s in story)
    body = f"""<section class="page-title artist"><div class="wrap ahead"><div><h1>{e(a['name'])}</h1><p>{e(title_tour)}{' · ' + e(a['genre']) if a['genre'] else ''}</p></div>{img}</div></section>
<section class="band"><div class="wrap split"><div>{head}{note}
<h2>{len(sh)} {'show' if len(sh) == 1 else 'shows'} in Australia</h2>{gig_list(sh, show_artist=False) if sh else '<p class="note">Dates to be announced. Check the tour announcement below.</p>'}</div>
<aside class="side"><div class="card"><h3>Before the show</h3><p>Get to know the records first.</p>
<a class="btn" href="{HEATHEN}{quote_plus(a['name'].split(' & ')[0])}" rel="noopener">Find {e(a['name'])} on vinyl ↗</a>
{f'<a class="btn ghost" href="/artists/{a["slug"]}.ics">Add all dates to calendar</a>' if sh else ''}{src}</div>{story_html}</aside></div></section>"""
    desc = (f"{a['name']} {title_tour}: dates, venues and tickets for " + ", ".join(a["cities"]) + ".") if sh else f"{a['name']} Australian tour news."
    jsonld = [{"@context": "https://schema.org", "@type": "MusicEvent", "name": f"{a['name']} live", "startDate": s["date"] + (f"T{s['time']}" if s["time"] else ""),
               "location": {"@type": "Place", "name": s["venue"], "address": {"@type": "PostalAddress", "addressLocality": s["suburb"], "addressRegion": s["state"], "addressCountry": "AU"}},
               "performer": {"@type": "MusicGroup", "name": a["name"]}, "url": s["url"]} for s in sh[:20]]
    extra = f'<script type="application/ld+json">{json.dumps(jsonld)}</script>' if jsonld else ""
    page(f"artists/{a['slug']}.html", f"{a['name']} {title_tour}: dates & tickets | Live Louder", desc, body, "tours.html", extra)
    if sh:
        (OUT / "artists" / f"{a['slug']}.ics").write_text(ics(a))

# ---------------------------------------------------------------- tours
def tour_block(t):
    a = artists[slug(t["artist"])]
    rows = "".join(f'<tr data-date="{s["date"]}" data-city="{e(s["city"])}"><td>{fmt(s["date"])}</td><td>{e(s["city"])}</td><td>{e(s["venue"])}</td></tr>' for s in a["shows"])
    tbl = f"<table><tbody>{rows}</tbody></table>" if rows else ""
    cities = " ".join(a["cities"]) or "Sydney Melbourne Brisbane Adelaide Perth"
    return f"""<article class="tour" id="{a['slug']}" data-cities="{e(cities)}"><header><h3><a href="/artists/{a['slug']}.html">{e(t['artist'])}</a></h3><span class="tn">{e(t['tour'])}</span></header>
{f'<p class="sup">With {e(t["support"])}</p>' if t.get('support') else ''}{f'<p class="tnote">{e(t["note"])}</p>' if t.get('note') else ''}{tbl}
<footer><a href="/artists/{a['slug']}.html">All dates &amp; tickets</a><a href="{e(t['source'])}" rel="noopener">Announcement ↗</a><a class="rec" href="{HEATHEN}{quote_plus(t['artist'].split(' & ')[0])}" rel="noopener">Get the records ↗</a></footer></article>"""
big = sorted(tours, key=lambda t: (artists[slug(t["artist"])]["shows"] or [{"date": "9999"}])[0]["date"])
def sortname(n): return re.sub(r"^the\s+", "", n.lower())
az = sorted(artists.values(), key=lambda a: sortname(a["name"]))
letters = {}
for a in az:
    if a["shows"]:
        ch = sortname(a["name"])[:1].upper()
        letters.setdefault(ch if ch.isalpha() else "#", []).append(a)
az_html = ""
if have_feed:
    jump = "".join(f'<a href="#az-{k}">{k}</a>' for k in letters)
    blocks = ""
    for k, v in letters.items():
        items = "".join(f'<li><a href="/artists/{a["slug"]}.html">{e(a["name"])}</a> <span>{len(a["shows"])} · {e(", ".join(a["cities"][:3]))}</span></li>' for a in v)
        blocks += f'<h3 class="month" id="az-{k}">{k}</h3><ul class="az">{items}</ul>'
    az_html = f'<section class="band" style="padding-top:0"><div class="wrap"><h2>Every artist touring</h2><nav class="chips">{jump}</nav>{blocks}</div></section>'
tp = f"""<section class="page-title"><div class="wrap"><h1>Tours</h1><p>The big tours coming to Australia, plus every artist with shows booked.</p></div></section>
<section class="band"><div class="wrap"><h2>The big ones</h2><div class="filters" role="group" aria-label="Filter by city"><button data-city="all" aria-pressed="true">All cities</button>{''.join(f'<button data-city="{e(c)}" aria-pressed="false">{e(c)}</button>' for c in ["Sydney", "Melbourne", "Brisbane", "Adelaide", "Perth"])}</div>
{''.join(tour_block(t) for t in big)}</div></section>
{az_html}"""
page("tours.html", "Australian tours: every artist touring Australia | Live Louder",
     "The biggest tours coming to Australia, with dates, venues and tickets, plus every artist with Australian shows booked.", tp, "tours.html")

# ---------------------------------------------------------------- releases
groups = {}
for a, b, c, fm in rels["items"]:
    groups.setdefault(a, []).append((b, c, fm))
rp = '<section class="page-title"><div class="wrap"><h1>Out soon</h1><p>New albums, reissues and box sets coming out on vinyl.</p></div></section><section class="band"><div class="wrap" style="max-width:860px">'
for k in sorted(groups, key=lambda k: "9999" if len(k) == 4 else k):
    past = len(k) > 4 and k < TODAY_S
    head = "Coming in 2027, date to be confirmed" if len(k) == 4 else ("Out now · " if past else "") + d(k).strftime("%A %-d %B %Y")
    rp += f'<h2 style="font-size:28px;margin-top:28px">{e(head)}</h2><ul class="rel">' + "".join(
        f'<li><div class="when">{"TBC" if len(k) == 4 else d(k).strftime("%-d %b")}</div><div class="what"><strong>{e(b)} – {e(c)}</strong><span>{e(fm)}</span></div></li>' for b, c, fm in groups[k]) + "</ul>"
rp += f'<p class="note">International release dates. Australian stock often lands a week or two later. Updated {UPDATED}.</p></div></section>'
page("out-soon.html", "New vinyl releases: what's coming out soon | Live Louder",
     "Upcoming vinyl releases, reissues and box sets, with formats and release dates.", rp, "out-soon.html")

# ---------------------------------------------------------------- stories
si = '<section class="page-title"><div class="wrap"><h1>Stories</h1><p>Albums, artists and the shows worth catching.</p></div></section><section class="band"><div class="wrap" style="max-width:860px">'
si += "".join(f'<a class="storycard" href="/stories/{s["slug"]}.html"><h3>{e(s["title"])}</h3><p>{e(s["dek"])}</p><p class="note">{fmt(s["date"], False)}</p></a>' for s in sorted(stories, key=lambda s: s["date"], reverse=True)) + "</div></section>"
page("stories/index.html", "Music stories | Live Louder", "Album guides, artist primers and stories from Australian music.", si, "stories/index.html")
for s in stories:
    a = artists.get(slug(s.get("artist", "")))
    link = f'<p class="note"><a href="/artists/{a["slug"]}.html">{e(a["name"])} tour dates →</a></p>' if a and a["shows"] else ""
    body = f"""<section class="band"><article class="article"><h1>{e(s['title'])}</h1><p class="dek">{e(s['dek'])}</p>
<p class="note">{fmt(s['date'], False)}</p>{s['body']}{link}
<p class="note"><a href="{HEATHEN}{quote_plus(s.get('artist', ''))}" rel="noopener">Find {e(s.get('artist', ''))} on vinyl at Heathen Records ↗</a></p></article></section>"""
    page(f"stories/{s['slug']}.html", f"{s['title']} | Live Louder", s["dek"], body, "stories/index.html")

# ---------------------------------------------------------------- about, 404, assets, sitemap
ab = """<section class="page-title"><div class="wrap"><h1>About</h1></div></section><section class="band"><div class="article">
<p>Live Louder is an independent Australian music site. We keep track of who's playing where, the big tours heading our way, what's coming out on vinyl, and the stories behind the records worth owning.</p>
<p>The gig guide updates every day. We're based in the Blue Mountains, NSW, and we're music fans first. If you're a band, a venue or a label with a tour or release we should know about, get in touch.</p>
<p>Live Louder is supported by <a href="https://heathenrecords.com.au">Heathen Records</a>, an independent online record store. Where we link to records, that's usually where the link goes.</p></div></section>"""
page("about.html", "About Live Louder", "Live Louder is an independent Australian music site: gigs, tours, new vinyl and music stories.", ab, "about.html")
page("404.html", "Page not found | Live Louder", "Page not found.",
     '<section class="page-title"><div class="wrap"><h1>Wrong stage</h1><p>That page isn\'t here. Try the <a style="color:#fff" href="/gigs/index.html">gig guide</a>, <a style="color:#fff" href="/tours.html">tours</a> or <a style="color:#fff" href="/stories/index.html">stories</a>.</p></div></section>')
shutil.copy(ROOT / "src/style.css", OUT / "style.css")
shutil.copy(ROOT / "src/app.js", OUT / "app.js")
urls = ["", "gigs/", "tours.html", "out-soon.html", "stories/", "about.html"] + [f"gigs/{slug(c)}.html" for c in MAIN_CITIES] \
    + [f"artists/{a['slug']}.html" for a in artists.values()] + [f"stories/{s['slug']}.html" for s in stories]
(OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                                 + "".join(f"<url><loc>{SITE}/{u}</loc><lastmod>{TODAY_S}</lastmod></url>" for u in urls) + "</urlset>")
(OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
print(f"built: {len(shows)} shows, {len(artists)} artists, {len(MAIN_CITIES)} cities, feed={'on' if have_feed else 'off'}")
