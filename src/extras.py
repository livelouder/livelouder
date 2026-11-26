"""Optional extras for artist pages, fetched at build time.

- setlist.fm: the artist's most recent setlist ("What they've been playing").
  Needs SETLISTFM_KEY. Free key from https://www.setlist.fm/settings/api
- Discogs: the artist's best-known records, with cover art ("Essential records on vinyl").
  Needs DISCOGS_TOKEN. Free token from https://www.discogs.com/settings/developers

Without a key, or if a lookup fails, the section is simply left off the page.
Results are cached in data/setlists.json and data/discogs.json for a week.
"""
import json, os, re, time, datetime as dt, urllib.parse, urllib.request
from pathlib import Path

UA = "LiveLouder/1.0 +https://livelouder.com.au"
TTL_DAYS = 7


def _norm(s):
    return "".join(c for c in re.sub(r"\s*\(\d+\)$", "", s or "").lower().replace("&", "and") if c.isalnum())


def _get(url, headers):
    req = urllib.request.Request(url, headers=dict({"User-Agent": UA, "Accept": "application/json"}, **headers))
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def _load(p):
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}


def _fresh(entry, today):
    return entry and entry.get("checked", "") >= (today - dt.timedelta(days=TTL_DAYS)).isoformat()


def setlists(names, root, limit=40):
    key = os.environ.get("SETLISTFM_KEY", "").strip()
    p = Path(root) / "data" / "setlists.json"
    cache = _load(p)
    if not key:
        return cache
    today = dt.date.today()
    done = 0
    for n in names:
        if done >= limit:
            break
        if _fresh(cache.get(n), today):
            continue
        done += 1
        try:
            q = urllib.parse.urlencode({"artistName": n, "p": 1})
            data = _get("https://api.setlist.fm/rest/1.0/search/setlists?" + q, {"x-api-key": key})
            hit = None
            for s in data.get("setlist", []):
                if _norm(s.get("artist", {}).get("name")) != _norm(n):
                    continue
                songs, encore = [], []
                for st in (s.get("sets") or {}).get("set", []):
                    names_ = [x.get("name", "") for x in st.get("song", []) if x.get("name")]
                    (encore if st.get("encore") else songs).extend(names_)
                if len(songs) + len(encore) < 5:
                    continue
                v = s.get("venue") or {}
                c = v.get("city") or {}
                dd, mm, yy = (s.get("eventDate") or "01-01-1970").split("-")
                hit = {"date": f"{yy}-{mm}-{dd}", "venue": v.get("name", ""), "city": c.get("name", ""),
                       "country": (c.get("country") or {}).get("name", ""), "tour": (s.get("tour") or {}).get("name", ""),
                       "songs": songs[:30], "encore": encore[:8], "url": s.get("url", "")}
                break
            cache[n] = {"checked": today.isoformat(), "set": hit}
            time.sleep(0.6)  # setlist.fm allows about 2 requests a second
        except urllib.error.HTTPError as e:
            if e.code == 404:  # no setlists for this artist
                cache[n] = {"checked": today.isoformat(), "set": None}
                continue
            print("setlist.fm: stopped at", n, e)
            break
        except Exception as e:
            print("setlist.fm: stopped at", n, e)
            break
    try:
        p.write_text(json.dumps(cache))
    except OSError:
        pass
    return cache


def discogs(names, root, limit=40):
    token = os.environ.get("DISCOGS_TOKEN", "").strip()
    p = Path(root) / "data" / "discogs.json"
    cache = _load(p)
    if not token:
        return cache
    auth = {"Authorization": f"Discogs token={token}"}
    today = dt.date.today()
    done = 0
    for n in names:
        if done >= limit:
            break
        if _fresh(cache.get(n), today) and cache[n].get("v") == 2:
            continue
        done += 1
        try:
            q = urllib.parse.urlencode({"artist": n, "type": "master", "format": "album", "per_page": 100})
            res = _get("https://api.discogs.com/database/search?" + q, auth).get("results", [])
            records, seen = [], set()
            for r in res:
                artist, _, title = (r.get("title") or "").partition(" - ")
                fmts = {f.lower() for f in (r.get("format") or [])}
                if _norm(artist) != _norm(n) or not r.get("year") or not title:
                    continue
                if fmts & {"single", "compilation", "ep", "mini-album", "promo", "maxi-single"}:
                    continue
                if _norm(title) in seen or re.search(r"\b(live|remix|demo|bootleg|greatest hits|best of)\b", title, re.I):
                    continue
                seen.add(_norm(title))
                c = r.get("community") or {}
                records.append({"title": title.strip(), "year": int(r["year"]), "thumb": r.get("cover_image") or r.get("thumb", ""),
                                "url": "https://www.discogs.com" + r.get("uri", ""), "have": c.get("have", 0) + c.get("want", 0)})
            records.sort(key=lambda x: -x["have"])
            records = sorted(records[:8], key=lambda x: x["year"])
            artist_url = "https://www.discogs.com/search/?" + urllib.parse.urlencode({"q": n, "type": "artist"})
            cache[n] = {"checked": today.isoformat(), "v": 2, "url": artist_url, "records": records}
            time.sleep(1.1)  # Discogs allows 60 requests a minute with a token
        except Exception as e:
            print("discogs: stopped at", n, e)
            break
    try:
        p.write_text(json.dumps(cache))
    except OSError:
        pass
    return cache
