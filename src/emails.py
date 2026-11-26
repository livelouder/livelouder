"""Builds the email content that the Netlify functions send through Kit.

Writes two files into the site:
  site/email/weekly.json  - this week's Live Louder Weekly (subject, preview, html, key)
  site/email/alerts.json  - artist alerts for followers (one entry per artist with news)

The functions only send each key once, so a rebuild never sends the same email twice.
"""
import json, html, hashlib, datetime as dt

e = lambda s: html.escape(str(s), quote=True)
RED, INK, MUTED = "#e2391f", "#141414", "#6b6b6b"
FONT = "font-family:Helvetica,Arial,sans-serif"


def _short(s):
    return hashlib.md5(s.encode()).hexdigest()[:10]


def _fmt(s):
    x = dt.date.fromisoformat(s[:10])
    return x.strftime("%a ") + f"{x.day} {x.strftime('%b')}"


def _h2(t):
    return (f'<h2 style="{FONT};font-size:20px;letter-spacing:.5px;text-transform:uppercase;color:{INK};'
            f'border-top:3px solid {RED};padding-top:14px;margin:28px 0 10px">{e(t)}</h2>')


def _item(title, href, sub=""):
    s = f'<br><span style="color:{MUTED};font-size:14px">{e(sub)}</span>' if sub else ""
    return (f'<p style="{FONT};font-size:16px;line-height:1.45;margin:0 0 12px">'
            f'<a href="{href}" style="color:{INK};font-weight:bold;text-decoration:none">{e(title)}</a>{s}</p>')


def _button(text, href):
    return (f'<p style="margin:28px 0"><a href="{href}" style="{FONT};background:{RED};color:#fff;font-weight:bold;'
            f'padding:14px 22px;text-decoration:none;display:inline-block;letter-spacing:.5px">{e(text)}</a></p>')


def _wrap(inner, preview):
    return (f'<div style="display:none;max-height:0;overflow:hidden">{e(preview)}</div>'
            f'<div style="{FONT};color:{INK};max-width:600px;margin:0 auto">'
            f'<p style="{FONT};font-size:28px;font-weight:900;letter-spacing:1px;margin:0 0 4px">'
            f'<span style="color:{RED}">LIVE</span> LOUDER</p>{inner}'
            f'<p style="{FONT};font-size:12px;color:{MUTED};margin-top:36px">You signed up at livelouder.com.au. '
            f'<a href="{{{{ unsubscribe_url }}}}" style="color:{MUTED}">Unsubscribe</a></p></div>')


def _names(xs):
    xs = list(dict.fromkeys(xs))[:3]
    if not xs:
        return ""
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]


def build(out, site, today, tours, shows, tm, artists, news, stories, fests, rels, slug):
    today_s = today.isoformat()
    week_ago = (today - dt.timedelta(days=7)).isoformat()
    week_end = (today + dt.timedelta(days=7)).isoformat()
    link = lambda p: f"{site}/{p}"

    # ------------------------------------------------ weekly
    fresh = [t for t in tours if t.get("added", "") >= week_ago]
    fresh = sorted(fresh or tours, key=lambda t: t.get("added", ""), reverse=True)[:5]
    week = []
    for s in shows:
        if s["date"] < week_end and s["artist"] not in [w["artist"] for w in week]:
            week.append(s)
    week = week[:8]
    onsale = {}
    for s in tm:
        if s.get("onsale") and today_s < s["onsale"][:10] <= week_end:
            onsale.setdefault(s["artist"], s)
    recent_news = [n for n in news if n["date"] >= week_ago][:4] or news[:3]
    rel_end = (today + dt.timedelta(days=10)).isoformat()
    vinyl = [i for i in rels["items"] if today_s <= i[0] <= rel_end][:6]
    read = sorted(stories, key=lambda s: s["date"], reverse=True)[:1]

    parts = []
    if fresh:
        parts.append(_h2("Just announced") + "".join(
            _item(t["artist"], link(f"artists/{slug(t['artist'])}.html"),
                  t["tour"] + (" · " + ", ".join(sorted({x[1] for x in t["dates"]})) if t["dates"] else "")) for t in fresh))
    if recent_news:
        parts.append(_h2("In the news") + "".join(_item(n["title"], link(f"news/{n['slug']}.html")) for n in recent_news))
    if week:
        parts.append(_h2("On this week") + "".join(
            _item(s["artist"], link(f"artists/{slug(s['artist'])}.html"), f"{_fmt(s['date'])} · {s['venue']}, {s['city']}") for s in week))
    if onsale:
        parts.append(_h2("Tickets on sale this week") + "".join(
            _item(s["artist"], link(f"artists/{slug(s['artist'])}.html"), f"On sale {_fmt(s['onsale'])} · {s['city']}")
            for s in sorted(onsale.values(), key=lambda s: s["onsale"])[:6]))
    if fests:
        parts.append(_h2("Festival watch") + "".join(
            _item(f["name"], link(f"festivals/{f['slug']}.html"), f"{f['when']} · " + ", ".join(f["headliners"][:3]) + " and more") for f in fests))
    if vinyl:
        parts.append(_h2("Out on vinyl soon") + "".join(
            f'<p style="{FONT};font-size:16px;margin:0 0 10px"><strong>{e(a)}</strong> – {e(t)}'
            f'<br><span style="color:{MUTED};font-size:14px">{e(_fmt(dd))} · {e(fm)}</span></p>' for dd, a, t, fm in vinyl))
    if read:
        parts.append(_h2("One good read") + _item(read[0]["title"], link(f"stories/{read[0]['slug']}.html"), read[0]["dek"]))

    headline = [t["artist"] for t in fresh] or [s["artist"] for s in week]
    subject = f"This week: {_names(headline)} hit the road" if headline else "This week on Live Louder"
    preview = "New tours, the week's big gigs, festival news and what's out on vinyl."
    intro = (f'<p style="{FONT};font-size:17px;line-height:1.5">Here\'s your week in live music: the tours just announced, '
             f'the gigs worth leaving the house for, and the records worth owning.</p>')
    body = intro + "".join(parts) + _button("Find a gig near you", link("gigs/index.html"))
    iso = today.isocalendar()
    weekly = {"key": f"weekly-{iso[0]}-W{iso[1]:02d}", "subject": subject, "preview": preview,
              "html": _wrap(body, preview), "built": today_s}

    # ------------------------------------------------ artist alerts
    alerts = {}
    soon = (today - dt.timedelta(days=3)).isoformat()

    def add(name, item_id, line):
        a = alerts.setdefault(name, {"artist": name, "tag": f"Artist: {name}", "items": [], "lines": []})
        a["items"].append(_short(item_id))
        a["lines"].append(line)

    for t in tours:
        if t.get("added", "") >= soon and t["dates"]:
            where = ", ".join(sorted({x[1] for x in t["dates"]}))
            add(t["artist"], f"tour:{slug(t['artist'])}:{t['added']}",
                _item(f"{t['tour']} announced", link(f"artists/{slug(t['artist'])}.html"), f"From {_fmt(t['dates'][0][0])} · {where}"))
    for n in news:
        if n["date"] >= soon and n.get("artist"):
            add(n["artist"], f"news:{n['slug']}", _item(n["title"], link(f"news/{n['slug']}.html")))
    for s in tm:
        if s.get("onsale") and today_s <= s["onsale"][:10] <= (today + dt.timedelta(days=3)).isoformat():
            add(s["artist"], f"onsale:{s['id']}",
                _item(f"{s['city']}: tickets on sale {_fmt(s['onsale'])}", s["url"] or link(f"artists/{slug(s['artist'])}.html"),
                      f"{_fmt(s['date'])} · {s['venue']}"))
    alert_list = []
    for name, a in alerts.items():
        pv = f"New {name} news on Live Louder."
        inner = (f'<p style="{FONT};font-size:17px;line-height:1.5">You asked us to tell you when there\'s news about '
                 f'<strong>{e(name)}</strong>. Here it is.</p>' + "".join(a["lines"][:8])
                 + _button(f"See {name} tour dates", link(f"artists/{slug(name)}.html")))
        alert_list.append({"artist": name, "tag": a["tag"], "items": a["items"],
                           "subject": f"{name}: new on Live Louder", "preview": pv, "html": _wrap(inner, pv)})

    d = out / "email"
    d.mkdir(parents=True, exist_ok=True)
    (d / "weekly.json").write_text(json.dumps(weekly))
    (d / "alerts.json").write_text(json.dumps({"built": today_s, "alerts": alert_list}))
    return weekly, alert_list
