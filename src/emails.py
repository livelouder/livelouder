"""Builds the email content that the Netlify functions send through Kit.

Writes two files into the site:
  site/email/weekly.json  - this week's Live Louder Weekly (subject, preview, html, key)
  site/email/alerts.json  - artist alerts for followers (one entry per artist with news)
  site/email/weekly-preview.html - the weekly email as a web page, for checking the design

The functions only send each key once, so a rebuild never sends the same email twice.
Layout uses tables and inline styles because email apps (Gmail, Outlook) ignore most CSS.
"""
import json, html, hashlib, colorsys, re, datetime as dt
from urllib.parse import quote_plus

e = lambda s: html.escape(str(s), quote=True)
RED, INK, MUTED, PAPER, LINE = "#e2391f", "#141414", "#6b6b6b", "#f2f0ec", "#e6e2dc"
FONT = "font-family:Helvetica,Arial,sans-serif"
HEAD = "font-family:Anton,Impact,Arial Narrow Bold,Helvetica Neue,Arial,sans-serif;font-weight:400"
HEATHEN = "https://heathenrecords.com.au/search?type=product&q="


def _short(s):
    return hashlib.md5(s.encode()).hexdigest()[:10]


def _fmt(s):
    x = dt.date.fromisoformat(s[:10])
    return x.strftime("%a ") + f"{x.day} {x.strftime('%b')}"


def _hue(name):
    return int(hashlib.md5(name.encode()).hexdigest()[:4], 16) % 360


def _hex(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


def _img(src, alt, w, h, name=""):
    if src:
        return (f'<img src="{e(src)}" alt="{e(alt)}" width="{w}" height="{h}" '
                f'style="display:block;width:{w}px;height:{h}px;object-fit:cover;border-radius:6px;border:0">')
    hue = _hue(name or alt)
    initials = "".join(x[0] for x in (name or alt).split()[:2]).upper()
    return (f'<table role="presentation" width="{w}" height="{h}" cellpadding="0" cellspacing="0" '
            f'style="width:{w}px;height:{h}px;border-radius:6px;background:{_hex(hue, .55, .35)}"><tr>'
            f'<td align="center" valign="middle" style="{HEAD};font-size:{max(18, w // 3)}px;color:#fff">{e(initials)}</td></tr></table>')


def _section(label, title):
    return (f'<tr><td style="padding:34px 32px 6px">'
            f'<div style="{FONT};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:{RED}">{e(label)}</div>'
            f'<div style="{HEAD};font-size:30px;line-height:1.1;color:{INK};text-transform:uppercase;margin-top:4px">{e(title)}</div>'
            f'</td></tr>')


def _feature(img, title, href, line1="", line2="", cta="Dates & tickets"):
    """Picture on the left, text on the right."""
    l1 = f'<div style="{FONT};font-size:14px;color:{INK};margin-top:3px">{e(line1)}</div>' if line1 else ""
    l2 = f'<div style="{FONT};font-size:13px;color:{MUTED};margin-top:3px">{e(line2)}</div>' if line2 else ""
    return (f'<tr><td style="padding:10px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
            f'<td width="96" valign="top" style="width:96px;padding-right:16px"><a href="{href}">{img}</a></td>'
            f'<td valign="middle" style="border-bottom:1px solid {LINE};padding-bottom:12px">'
            f'<a href="{href}" style="{HEAD};font-size:21px;line-height:1.15;color:{INK};text-decoration:none;text-transform:uppercase">{e(title)}</a>{l1}{l2}'
            f'<div style="margin-top:6px"><a href="{href}" style="{FONT};font-size:13px;font-weight:bold;color:{RED};text-decoration:none">{e(cta)} →</a></div>'
            f'</td></tr></table></td></tr>')


def _datelist(rows):
    """Ticket-stub style list: date block + name + where."""
    out = ""
    for day, mon, title, where, href in rows:
        out += (f'<tr><td style="padding:5px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
                f'style="border:1px solid {LINE};border-radius:6px"><tr>'
                f'<td width="64" align="center" valign="middle" style="width:64px;background:{INK};border-radius:6px 0 0 6px;padding:8px 0">'
                f'<div style="{HEAD};font-size:26px;line-height:1;color:#fff">{e(day)}</div>'
                f'<div style="{FONT};font-size:11px;font-weight:bold;letter-spacing:1px;color:{RED};text-transform:uppercase">{e(mon)}</div></td>'
                f'<td valign="middle" style="padding:8px 14px"><a href="{href}" style="{FONT};font-size:16px;font-weight:bold;color:{INK};text-decoration:none">{e(title)}</a>'
                f'<div style="{FONT};font-size:13px;color:{MUTED};margin-top:2px">{e(where)}</div></td></tr></table></td></tr>')
    return out


def _button(text, href, dark=False):
    bg = INK if dark else RED
    return (f'<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:{bg};border-radius:999px">'
            f'<a href="{href}" style="{FONT};display:inline-block;padding:14px 26px;font-size:15px;font-weight:bold;color:#fff;text-decoration:none">{e(text)}</a>'
            f'</td></tr></table>')


def _track(h, campaign):
    """Adds tracking tags to Heathen Records links so Shopify can attribute visits and sales to Live Louder emails."""
    def add(m):
        url = m.group(1)
        if "utm_source=" in url:
            return m.group(0)
        return f'href="{url}{"&" if "?" in url else "?"}utm_source=livelouder&utm_medium=email&utm_campaign={campaign}"'
    return re.sub(r'href="(https://(?:www\.)?heathenrecords\.com\.au[^"]*)"', add, h)


def _wrap(rows, preview, site, kicker):
    return (f'<div style="display:none;max-height:0;overflow:hidden;opacity:0">{e(preview)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAPER}"><tr><td align="center" style="padding:18px 8px">'
            f'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:10px;overflow:hidden">'
            # header
            f'<tr><td style="background:{INK};padding:22px 32px;border-bottom:5px solid {RED}">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
            f'<td><a href="{site}" style="{HEAD};font-size:34px;line-height:1;text-decoration:none;letter-spacing:1px"><span style="color:#fff">LIVE</span> <span style="color:{RED}">LOUDER</span></a></td>'
            f'<td align="right" style="{FONT};font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#bdbdbd">{e(kicker)}</td>'
            f'</tr></table></td></tr>'
            + rows +
            # footer
            f'<tr><td style="padding:34px 32px 0"></td></tr>'
            f'<tr><td style="background:{INK};padding:26px 32px">'
            f'<div style="{HEAD};font-size:22px;letter-spacing:1px"><span style="color:#fff">LIVE</span> <span style="color:{RED}">LOUDER</span></div>'
            f'<div style="{FONT};font-size:13px;line-height:1.6;color:#bdbdbd;margin-top:8px">Australian music news, gigs, tours, festivals and new vinyl.<br>'
            f'<a href="{site}/gigs/index.html" style="color:#fff">Gig guide</a> · <a href="{site}/tours.html" style="color:#fff">Tours</a> · '
            f'<a href="{site}/out-soon.html" style="color:#fff">Vinyl</a> · <a href="{site}/news/index.html" style="color:#fff">News</a></div>'
            f'<div style="{FONT};font-size:12px;color:#8a8a8a;margin-top:14px">You signed up at livelouder.com.au. '
            f'<a href="{{{{ unsubscribe_url }}}}" style="color:#8a8a8a">Unsubscribe</a></div>'
            f'</td></tr></table></td></tr></table>')


def _names(xs):
    xs = list(dict.fromkeys(xs))[:3]
    if not xs:
        return ""
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]


def build(out, site, today, tours, shows, tm, artists, news, stories, fests, rels, slug, rel_dg=None, pick=None):
    rel_dg = rel_dg or {}
    today_s = today.isoformat()
    week_ago = (today - dt.timedelta(days=7)).isoformat()
    week_end = (today + dt.timedelta(days=7)).isoformat()
    link = lambda p: f"{site}/{p}"
    photo = lambda name: (artists.get(slug(name)) or {}).get("photo", "")

    # ------------------------------------------------ weekly
    fresh = [t for t in tours if t.get("added", "") >= week_ago]
    fresh = sorted(fresh or tours, key=lambda t: t.get("added", ""), reverse=True)[:5]
    week = []
    for s_ in shows:
        if s_["date"] < week_end and s_["artist"] not in [w["artist"] for w in week]:
            week.append(s_)
    week = week[:8]
    onsale = {}
    for s_ in tm:
        if s_.get("onsale") and today_s < s_["onsale"][:10] <= week_end:
            onsale.setdefault(s_["artist"], s_)
    recent_news = [n for n in news if n["date"] >= week_ago][:4] or news[:3]
    rel_end = (today + dt.timedelta(days=10)).isoformat()
    vinyl = [i for i in rels["items"] if today_s <= i[0] <= rel_end][:6]
    read = sorted(stories, key=lambda s_: s_["date"], reverse=True)[:1]

    rows = (f'<tr><td style="padding:28px 32px 0;{FONT};font-size:17px;line-height:1.55;color:{INK}">'
            f'Here\'s your week in live music: the tours just announced, the gigs worth leaving the house for, and the records worth owning.</td></tr>')
    if pick:
        g_, r_ = pick.get("gig") or {}, pick.get("record") or {}
        rows += _section("From Mick", "This week's picks")
        if g_:
            rows += _feature(_img(photo(g_["artist"]), g_["artist"], 96, 96, g_["artist"]), g_["artist"], link(f"artists/{slug(g_['artist'])}.html"),
                             "Gig pick" + (f" · {_fmt(g_['date'])}, {g_.get('venue', '')}, {g_.get('city', '')}" if g_.get("date") else ""), "", "Dates & tickets")
            rows += f'<tr><td style="padding:0 32px 6px 144px;{FONT};font-size:15px;line-height:1.55;color:{INK}">{e(g_["text"])}</td></tr>'
        if r_:
            hit = (rel_dg.get(f"{r_['artist']}|{r_['title']}") or {}).get("hit") or {}
            rows += _feature(_img(hit.get("cover", ""), r_["title"], 96, 96, r_["artist"]), f"{r_['artist']} – {r_['title']}",
                             HEATHEN + quote_plus(f"{r_['artist']} {r_['title']}"), "Record pick", "", "Find it on vinyl")
            rows += f'<tr><td style="padding:0 32px 6px 144px;{FONT};font-size:15px;line-height:1.55;color:{INK}">{e(r_["text"])}</td></tr>'
        rows += f'<tr><td style="padding:4px 32px 0 144px;{FONT};font-size:15px;font-weight:bold;color:{RED}">— Mick</td></tr>'
    if fresh:
        rows += _section("Just announced", "New tours")
        for t in fresh:
            cities = ", ".join(sorted({x[1] for x in t["dates"]}))
            first = f"From {_fmt(t['dates'][0][0])}" if t["dates"] else ""
            rows += _feature(_img(photo(t["artist"]), t["artist"], 96, 96, t["artist"]), t["artist"],
                             link(f"artists/{slug(t['artist'])}.html"), t["tour"], " · ".join(x for x in (first, cities) if x))
    if recent_news:
        rows += _section("In the news", "What you missed")
        for n in recent_news:
            rows += (f'<tr><td style="padding:8px 32px"><span style="{FONT};display:inline-block;background:{RED};color:#fff;font-size:10px;font-weight:bold;'
                     f'letter-spacing:1px;text-transform:uppercase;padding:3px 7px;border-radius:3px">{e(n.get("tag", "News"))}</span>'
                     f'<div style="margin-top:5px"><a href="{link("news/" + n["slug"] + ".html")}" style="{FONT};font-size:16px;font-weight:bold;line-height:1.35;color:{INK};text-decoration:none">{e(n["title"])}</a></div></td></tr>')
    if week:
        rows += _section("On this week", "Gigs worth leaving the house for")
        rows += _datelist([(str(dt.date.fromisoformat(s_["date"]).day), dt.date.fromisoformat(s_["date"]).strftime("%b"), s_["artist"],
                            f"{s_['venue']}, {s_['city']}", link(f"artists/{slug(s_['artist'])}.html")) for s_ in week])
    if onsale:
        rows += _section("Set a reminder", "Tickets on sale this week")
        rows += _datelist([(str(dt.date.fromisoformat(s_["onsale"][:10]).day), dt.date.fromisoformat(s_["onsale"][:10]).strftime("%b"), s_["artist"],
                            f"{s_['city']} · show {_fmt(s_['date'])}", link(f"artists/{slug(s_['artist'])}.html"))
                           for s_ in sorted(onsale.values(), key=lambda x: x["onsale"])[:6]])
    if fests:
        rows += _section("Festival watch", "Plan ahead")
        for f in fests:
            places = ", ".join(x[1] for x in f["dates"])
            rows += (f'<tr><td style="padding:6px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{INK};border-radius:8px"><tr>'
                     f'<td style="padding:16px 18px"><a href="{link("festivals/" + f["slug"] + ".html")}" style="{HEAD};font-size:22px;color:#fff;text-decoration:none;text-transform:uppercase">{e(f["name"])}</a>'
                     f'<div style="{FONT};font-size:13px;color:#ffb3a6;margin-top:4px;font-weight:bold">{e(f["when"])} · {e(places)}</div>'
                     f'<div style="{FONT};font-size:13px;color:#d6d6d6;margin-top:4px">{e(", ".join(f["headliners"][:4]))} and more</div></td></tr></table></td></tr>')
    if vinyl:
        rows += _section("Out on vinyl", "New records coming")
        cells = []
        for dd, a, t, fm in vinyl:
            hit = (rel_dg.get(f"{a}|{t}") or {}).get("hit") or {}
            href = HEATHEN + quote_plus(f"{a} {t}")
            cells.append(f'<td width="33%" valign="top" style="padding:6px"><a href="{href}">{_img(hit.get("cover", ""), a + " " + t, 164, 164, a)}</a>'
                         f'<div style="{FONT};font-size:11px;font-weight:bold;color:{RED};text-transform:uppercase;letter-spacing:1px;margin-top:8px">{e(_fmt(dd))}</div>'
                         f'<div style="{FONT};font-size:14px;font-weight:bold;color:{INK};margin-top:2px">{e(a)}</div>'
                         f'<div style="{FONT};font-size:13px;color:{MUTED}">{e(t)}</div></td>')
        grid = ""
        for i in range(0, len(cells), 3):
            row = cells[i:i + 3] + ['<td width="33%"></td>'] * (3 - len(cells[i:i + 3]))
            grid += "<tr>" + "".join(row) + "</tr>"
        rows += f'<tr><td style="padding:4px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{grid}</table></td></tr>'
        rows += f'<tr><td style="padding:6px 32px"><a href="{link("out-soon.html")}" style="{FONT};font-size:13px;font-weight:bold;color:{RED};text-decoration:none">All upcoming vinyl →</a></td></tr>'
    if read:
        r = read[0]
        rows += _section("One good read", "This week's story")
        href = link("stories/" + r["slug"] + ".html")
        rows += (f'<tr><td style="padding:8px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAPER};border-radius:8px"><tr>'
                 f'<td width="150" valign="top" style="width:150px;padding:16px 0 16px 16px"><a href="{href}">{_img(photo(r.get("artist", "")), r["title"], 150, 150, r.get("artist") or r["title"])}</a></td>'
                 f'<td valign="middle" style="padding:16px 18px">'
                 f'<a href="{href}" style="{HEAD};font-size:22px;line-height:1.15;color:{INK};text-decoration:none;text-transform:uppercase">{e(r["title"])}</a>'
                 f'<div style="{FONT};font-size:14px;line-height:1.5;color:{MUTED};margin-top:6px">{e(r["dek"])}</div>'
                 f'<div style="margin-top:8px"><a href="{href}" style="{FONT};font-size:13px;font-weight:bold;color:{RED};text-decoration:none">Read it →</a></div>'
                 f'</td></tr></table></td></tr>')
    rows += (f'<tr><td align="center" style="padding:34px 32px 6px;background:#fff">'
             f'<div style="{HEAD};font-size:28px;color:{INK};text-transform:uppercase;margin-bottom:14px">What\'s on near you?</div>'
             f'{_button("Find a gig near you", link("gigs/index.html"))}</td></tr>')

    headline = [t["artist"] for t in fresh] or [s_["artist"] for s_ in week]
    subject = f"This week: {_names(headline)} hit the road" if headline else "This week on Live Louder"
    preview = "New tours, the week's big gigs, festival news and what's out on vinyl."
    iso = today.isocalendar()
    kicker = f"Week of {today.day} {today.strftime('%b')}"
    weekly = {"key": f"weekly-{iso[0]}-W{iso[1]:02d}", "subject": subject, "preview": preview,
              "html": _track(_wrap(rows, preview, site, kicker), "weekly"), "built": today_s}

    # ------------------------------------------------ artist alerts
    alerts = {}
    soon = (today - dt.timedelta(days=3)).isoformat()

    def add(name, item_id, row):
        a = alerts.setdefault(name, {"artist": name, "tag": f"Artist: {name}", "items": [], "rows": []})
        a["items"].append(_short(item_id))
        a["rows"].append(row)

    for t in tours:
        if t.get("added", "") >= soon and t["dates"]:
            where = ", ".join(sorted({x[1] for x in t["dates"]}))
            add(t["artist"], f"tour:{slug(t['artist'])}:{t['added']}",
                _datelist([(str(dt.date.fromisoformat(x[0]).day), dt.date.fromisoformat(x[0]).strftime("%b"), x[2], x[1],
                            link(f"artists/{slug(t['artist'])}.html")) for x in t["dates"][:10]]))
    for n in news:
        if n["date"] >= soon and n.get("artist"):
            add(n["artist"], f"news:{n['slug']}",
                f'<tr><td style="padding:8px 32px"><a href="{link("news/" + n["slug"] + ".html")}" style="{FONT};font-size:16px;font-weight:bold;color:{INK};text-decoration:none">{e(n["title"])}</a>'
                f'<div style="margin-top:4px"><a href="{link("news/" + n["slug"] + ".html")}" style="{FONT};font-size:13px;font-weight:bold;color:{RED};text-decoration:none">Read more →</a></div></td></tr>')
    for s_ in tm:
        if s_.get("onsale") and today_s <= s_["onsale"][:10] <= (today + dt.timedelta(days=3)).isoformat():
            add(s_["artist"], f"onsale:{s_['id']}",
                _datelist([(str(dt.date.fromisoformat(s_["onsale"][:10]).day), dt.date.fromisoformat(s_["onsale"][:10]).strftime("%b"),
                            f"Tickets on sale: {s_['city']}", f"Show {_fmt(s_['date'])} · {s_['venue']}", s_["url"] or link(f"artists/{slug(s_['artist'])}.html"))]))
    alert_list = []
    for name, a in alerts.items():
        pv = f"New {name} news on Live Louder."
        pic = photo(name)
        hero = (f'<tr><td style="padding:0"><img src="{e(pic)}" alt="{e(name)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>' if pic else "")
        rows = (hero + f'<tr><td style="padding:26px 32px 4px"><div style="{FONT};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:{RED}">You follow</div>'
                f'<div style="{HEAD};font-size:40px;line-height:1.05;color:{INK};text-transform:uppercase">{e(name)}</div>'
                f'<div style="{FONT};font-size:16px;line-height:1.5;color:{INK};margin-top:8px">There\'s news. Here\'s what\'s new:</div></td></tr>'
                + "".join(a["rows"][:6])
                + f'<tr><td style="padding:24px 32px 4px">{_button(f"See {name} dates and tickets", link(f"artists/{slug(name)}.html"))}</td></tr>')
        alert_list.append({"artist": name, "tag": a["tag"], "items": a["items"],
                           "subject": f"{name}: new on Live Louder", "preview": pv, "html": _track(_wrap(rows, pv, site, "Artist alert"), "artist-alert")})

    d = out / "email"
    d.mkdir(parents=True, exist_ok=True)
    (d / "weekly.json").write_text(json.dumps(weekly))
    (d / "alerts.json").write_text(json.dumps({"built": today_s, "alerts": alert_list}))
    page = lambda h: f'<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preview</title></head><body style="margin:0">{h}</body></html>'
    (d / "weekly-preview.html").write_text(page(weekly["html"]))
    if alert_list:
        (d / "alert-preview.html").write_text(page(alert_list[0]["html"]))
    return weekly, alert_list
