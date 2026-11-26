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
        if _fresh(cache.get(n), today):
            continue
        done += 1
        try:
            q = urllib.parse.urlencode({"q": n, "type": "artist", "per_page": 10})
            res = _get("https://api.discogs.com/database/search?" + q, auth).get("results", [])
            art = next((r for r in res if _norm(r.get("title")) == _norm(n)), None)
            records = []
            if art:
                time.sleep(1.1)
                rel = _get(f"https://api.discogs.com/artists/{art['id']}/releases?sort=year&sort_order=asc&per_page=100", auth)
                seen = set()
                for r in rel.get("releases", []):
                    if r.get("role") != "Main" or r.get("type") != "master" or not r.get("year"):
                        continue
                    t = r.get("title", "")
                    if _norm(t) in seen or re.search(r"\b(live|remix|single|edit|demo|bootleg)\b", t, re.I):
                        continue
                    seen.add(_norm(t))
                    st = (r.get("stats") or {}).get("community") or {}
                    records.append({"title": t, "year": r["year"], "thumb": r.get("thumb", ""),
                                    "url": f"https://www.discogs.com/master/{r['id']}",
                                    "have": st.get("in_collection", 0) + st.get("in_wantlist", 0)})
                if any(x["have"] for x in records):
                    records.sort(key=lambda x: -x["have"])
                records = sorted(records[:8], key=lambda x: x["year"])
            cache[n] = {"checked": today.isoformat(), "id": art["id"] if art else None,
                        "url": f"https://www.discogs.com/artist/{art['id']}" if art else "", "records": records}
            time.sleep(1.1)  # Discogs allows 60 requests a minute with a token
        except Exception as e:
            print("discogs: stopped at", n, e)
            break
    try:
        p.write_text(json.dumps(cache))
    except OSError:
        pass
    return cache
