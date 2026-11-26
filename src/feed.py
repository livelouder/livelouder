"""Fetches Australian music events from the Ticketmaster Discovery API.

Runs at build time when the TICKETMASTER_KEY environment variable is set.
If the key is missing or the API fails, the last good copy in
data/ticketmaster.json is used, so a failed fetch never breaks the site.
"""
import json, math, os, time, urllib.parse, urllib.request
from pathlib import Path

API = "https://app.ticketmaster.com/discovery/v2/events.json"

# Metro areas: (name, state, lat, lng, search radius km). Shows are assigned
# to the nearest metro by venue location.
METROS = [
    ("Sydney", "NSW", -33.8688, 151.2093, 55),
    ("Melbourne", "VIC", -37.8136, 144.9631, 55),
    ("Brisbane", "QLD", -27.4698, 153.0251, 40),
    ("Gold Coast", "QLD", -28.0167, 153.4000, 35),
    ("Perth", "WA", -31.9523, 115.8613, 50),
    ("Adelaide", "SA", -34.9285, 138.6007, 40),
    ("Canberra", "ACT", -35.2809, 149.1300, 30),
    ("Hobart", "TAS", -42.8821, 147.3272, 30),
    ("Newcastle", "NSW", -32.9283, 151.7817, 35),
    ("Wollongong", "NSW", -34.4278, 150.8931, 20),
    ("Geelong", "VIC", -38.1499, 144.3617, 20),
    ("Sunshine Coast", "QLD", -26.6500, 153.0667, 35),
    ("Cairns", "QLD", -16.9186, 145.7781, 40),
    ("Townsville", "QLD", -19.2590, 146.8169, 40),
    ("Darwin", "NT", -12.4634, 130.8456, 40),
    ("Launceston", "TAS", -41.4332, 147.1441, 30),
]


def _km(a, b, c, d):
    p = math.pi / 180
    h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def nearest_metro(lat, lng, fallback_city, fallback_state):
    best = None
    for name, st, la, lo, r in METROS:
        dist = _km(lat, lng, la, lo)
        if dist <= r + 25 and (best is None or dist < best[0]):
            best = (dist, name, st)
    return (best[1], best[2]) if best else (fallback_city, fallback_state)


def _get(params, key):
    params = dict(params, apikey=key)
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "livelouder.com.au build"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def _image(ev, width=640):
    imgs = [i for i in ev.get("images", []) if i.get("ratio") == "16_9" and not i.get("fallback")]
    imgs.sort(key=lambda i: abs(i.get("width", 0) - width))
    return imgs[0]["url"] if imgs else ""


def _price(ev):
    """Ticketmaster's price range, e.g. "$89.90–$159.90" (it changes, so the site says "at last check")."""
    pr = [p for p in ev.get("priceRanges", []) if p.get("min")]
    if not pr:
        return ""
    lo, hi = min(p["min"] for p in pr), max(p.get("max") or p["min"] for p in pr)
    f = lambda x: f"${x:,.0f}" if float(x).is_integer() else f"${x:,.2f}"
    return f(lo) if hi == lo else f"{f(lo)}–{f(hi)}"


def normalise(ev):
    """Turns one Ticketmaster event into Live Louder's show record (or None)."""
    emb = ev.get("_embedded", {})
    venues = emb.get("venues") or [{}]
    v = venues[0]
    atts = emb.get("attractions") or []
    artist = atts[0]["name"] if atts else ev.get("name", "")
    start = ev.get("dates", {}).get("start", {})
    date = start.get("localDate")
    if not date or not artist:
        return None
    status = ev.get("dates", {}).get("status", {}).get("code", "")
    if status in ("cancelled", "canceled"):
        return None
    loc = v.get("location") or {}
    city = (v.get("city") or {}).get("name", "")
    state = (v.get("state") or {}).get("stateCode", "")
    try:
        metro, mstate = nearest_metro(float(loc["latitude"]), float(loc["longitude"]), city, state)
    except (KeyError, ValueError, TypeError):
        metro, mstate = city, state
    cls = (ev.get("classifications") or [{}])[0]
    genre = (cls.get("genre") or {}).get("name", "")
    if genre in ("Undefined", "Other"):
        genre = ""
    sales = ev.get("sales", {})
    onsale = (sales.get("public") or {}).get("startDateTime", "")
    presales = [{"name": p.get("name", "Presale"), "start": p.get("startDateTime", "")} for p in sales.get("presales", []) if p.get("startDateTime")]
    return {
        "id": "tm-" + ev["id"], "artist": artist, "event": ev.get("name", ""),
        "support": [a["name"] for a in atts[1:4]],
        "date": date, "time": (start.get("localTime") or "")[:5],
        "venue": v.get("name", ""), "suburb": city, "city": metro, "state": mstate,
        "url": ev.get("url", ""), "image": _image(ev), "image_big": _image(ev, 2048), "genre": genre,
        "onsale": onsale, "presales": presales[:3], "status": status, "src": "ticketmaster",
        "lat": loc.get("latitude", ""), "lon": loc.get("longitude", ""), "price": _price(ev),
    }


def fetch(root):
    cache = Path(root) / "data" / "ticketmaster.json"
    key = os.environ.get("TICKETMASTER_KEY", "").strip()
    if not key:
        print("feed: no TICKETMASTER_KEY, using cache" if cache.exists() else "feed: no key and no cache")
        return json.loads(cache.read_text()) if cache.exists() else []
    seen, shows = set(), []
    try:
        for name, st, la, lo, r in METROS:
            for page in range(5):  # API allows size*page < 1000
                data = _get({"countryCode": "AU", "segmentName": "Music", "latlong": f"{la},{lo}",
                             "radius": r, "unit": "km", "size": 199, "page": page, "sort": "date,asc"}, key)
                evs = data.get("_embedded", {}).get("events", [])
                for ev in evs:
                    if ev["id"] in seen:
                        continue
                    seen.add(ev["id"])
                    s = normalise(ev)
                    if s:
                        shows.append(s)
                total = data.get("page", {}).get("totalPages", 0)
                time.sleep(0.25)
                if page + 1 >= total:
                    break
        print(f"feed: {len(shows)} shows from Ticketmaster")
        if shows:
            cache.write_text(json.dumps(shows, indent=0))
        return shows
    except Exception as e:  # network or API problem: fall back to last good copy
        print("feed: fetch failed:", e)
        return json.loads(cache.read_text()) if cache.exists() else []


def deezer_lookup(names, root, limit=120):
    """Finds Deezer artist ids and photos for the given artist names (for the
    'Hear them before you go' player). Results are cached in data/deezer.json.
    Missing or failed lookups just mean no player for that artist."""
    cache_p = Path(root) / "data" / "deezer.json"
    cache = json.loads(cache_p.read_text()) if cache_p.exists() else {}
    todo = [n for n in names if n not in cache][:limit]
    for n in todo:
        try:
            url = "https://api.deezer.com/search/artist?" + urllib.parse.urlencode({"q": n, "limit": 3})
            req = urllib.request.Request(url, headers={"User-Agent": "livelouder.com.au build"})
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read().decode()).get("data", [])
            norm = lambda s: "".join(c for c in s.lower() if c.isalnum())
            hit = next((a for a in data if norm(a.get("name", "")) == norm(n)), None)
            cache[n] = {"id": hit["id"], "picture": hit.get("picture_xl") or hit.get("picture_big", ""), "fans": hit.get("nb_fan", 0)} if hit else None
            time.sleep(0.12)
        except Exception as e:
            print("deezer: lookup failed for", n, e)
            break  # probably no network; try again next build
    try:
        cache_p.write_text(json.dumps(cache))
    except OSError:
        pass
    return cache
