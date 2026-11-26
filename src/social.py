"""Daily social posts for Instagram, Facebook (and TikTok by hand).

Every build makes today's post: branded 1080x1350 images in site/social/ plus a caption,
listed in site/social/today.json. The Netlify function social-post.mjs publishes it.
site/social/index.html shows today's post with a copy-caption button for TikTok.

Rotation (Sydney day of week):
  Mon  Just announced (new tours)       Tue  On sale this week (or latest news)
  Wed  Mick's picks                     Thu  This weekend, by city
  Fri  Gig of the week                  Sat  Out on vinyl this week
  Sun  Story of the week (or Most wanted)
"""
import io, json, hashlib, colorsys, datetime as dt, urllib.request
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ImportError:  # Pillow missing: skip social images, the site still builds
    Image = None

W, H = 1080, 1350
INK, RED, PAPER, GREY, WHITE = (20, 20, 20), (226, 57, 31), (246, 245, 242), (160, 160, 160), (255, 255, 255)
FONTS = Path(__file__).parent / "fonts"
TAGS = "#livemusic #gigs #australianmusic #concerts #vinyl"


def _f(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def head(size): return _f("Anton-Regular.ttf", size)
def bold(size): return _f("Inter-Bold.otf", size)
def reg(size): return _f("Inter-Regular.otf", size)


def _hue(s):
    return int(hashlib.md5(s.encode()).hexdigest()[:4], 16) % 360


def _rgb(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
    return int(r * 255), int(g * 255), int(b * 255)


_cache = {}
def _fetch(url):
    if not url:
        return None
    if url in _cache:
        return _cache[url]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "LiveLouder/1.0 +https://livelouder.com.au"})
        with urllib.request.urlopen(req, timeout=15) as r:
            im = Image.open(io.BytesIO(r.read())).convert("RGB")
    except Exception:
        im = None
    _cache[url] = im
    return im


def _placeholder(name, w, h):
    hu = _hue(name)
    im = Image.new("RGB", (w, h), _rgb(hu, .55, .35))
    d = ImageDraw.Draw(im)
    for i in range(0, w + h, 36):  # grooves
        d.line([(i, h), (i + h // 2, 0)], fill=_rgb(hu, .55, .30), width=8)
    initials = "".join(x[0] for x in name.split()[:2]).upper() or "LL"
    f = head(int(min(w, h) * .38))
    tw = d.textlength(initials, font=f)
    d.text(((w - tw) / 2, h * .28), initials, font=f, fill=WHITE)
    return im


def _pic(url, name, w, h):
    im = _fetch(url)
    return ImageOps.fit(im, (w, h), method=Image.LANCZOS) if im else _placeholder(name, w, h)


def _wrap(d, text, font, width):
    words, lines, cur = text.split(), [], ""
    for wd in words:
        t = (cur + " " + wd).strip()
        if d.textlength(t, font=font) <= width:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def _fit(d, text, sizes, width, max_lines, fn=head):
    """Largest font size that fits the text in max_lines."""
    for s in sizes:
        f = fn(s)
        lines = _wrap(d, text, f, width)
        if len(lines) <= max_lines:
            return f, lines
    f = fn(sizes[-1])
    return f, _wrap(d, text, f, width)[:max_lines]


def _frame(kicker, page=None):
    im = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(im)
    for x in range(0, W, 90):
        d.line([(x, 0), (x, H)], fill=(26, 26, 26), width=2)
    d.rectangle([0, 0, W, 120], fill=(14, 14, 14))
    d.text((60, 34), "LIVE", font=head(52), fill=WHITE)
    d.text((60 + d.textlength("LIVE ", font=head(52)), 34), "LOUDER", font=head(52), fill=RED)
    kw = d.textlength(kicker.upper(), font=bold(26))
    d.text((W - 60 - kw, 50), kicker.upper(), font=bold(26), fill=GREY)
    d.rectangle([0, 120, W, 128], fill=RED)
    d.rectangle([0, H - 96, W, H], fill=(14, 14, 14))
    d.text((60, H - 66), "livelouder.com.au", font=bold(30), fill=WHITE)
    if page:
        pw = d.textlength(page, font=bold(28))
        d.text((W - 60 - pw, H - 64), page, font=bold(28), fill=GREY)
    return im, d


def _label(d, x, y, text, fill=RED):
    f = bold(26)
    tw = d.textlength(text.upper(), font=f)
    d.rounded_rectangle([x, y, x + tw + 32, y + 48], radius=6, fill=fill)
    d.text((x + 16, y + 9), text.upper(), font=f, fill=WHITE)
    return y + 48


def slide_cover(kicker, label, title, sub, photo_url="", photo_name="", page=None):
    im, d = _frame(kicker, page)
    top = 128
    if photo_url or photo_name:
        ph = _pic(photo_url, photo_name or title, W, 640)
        im.paste(ph, (0, top))
        grad = Image.new("L", (1, 640))
        for y in range(640):
            grad.putpixel((0, y), int(255 * max(0, (y - 380) / 260)))
        shade = Image.new("RGB", (W, 640), INK)
        im.paste(shade, (0, top), grad.resize((W, 640)))
        y = top + 600
    else:
        y = 300
    y = _label(d, 60, y, label) + 28
    f, lines = _fit(d, title.upper(), [130, 112, 96, 84, 72, 62], W - 120, 3)
    for ln in lines:
        d.text((60, y), ln, font=f, fill=WHITE)
        y += int(f.size * 1.08)
    y += 14
    for ln in _wrap(d, sub, bold(36), W - 120)[:4]:
        d.text((60, y), ln, font=bold(36), fill=(255, 179, 166))
        y += 48
    return im


def slide_list(kicker, title, rows, page=None):
    """rows: [(big, small, photo_url_or_None, name)]"""
    im, d = _frame(kicker, page)
    y = 170
    f, lines = _fit(d, title.upper(), [96, 84, 72], W - 120, 2)
    for ln in lines:
        d.text((60, y), ln, font=f, fill=WHITE)
        y += int(f.size * 1.08)
    y += 24
    rh = min(200, (H - 140 - y) // max(1, len(rows)))
    for big, small, url, name in rows:
        x = 60
        if url is not None:
            im.paste(_pic(url, name or big, rh - 24, rh - 24), (60, y))
            x = 60 + rh
        bf, bl = _fit(d, big.upper(), [56, 48, 42, 36], W - x - 60, 1)
        d.text((x, y + 4), bl[0], font=bf, fill=WHITE)
        for i, ln in enumerate(_wrap(d, small, reg(30), W - x - 60)[:2]):
            d.text((x, y + 8 + bf.size + 6 + i * 38), ln, font=reg(30), fill=(200, 200, 200))
        d.line([(60, y + rh - 8), (W - 60, y + rh - 8)], fill=(50, 50, 50), width=2)
        y += rh
    return im


def slide_text(kicker, label, title, body, page=None, photo_url="", photo_name=""):
    im, d = _frame(kicker, page)
    y = 180
    if photo_url or photo_name:
        im.paste(_pic(photo_url, photo_name or title, 360, 360), (60, y))
        y += 400
    y = _label(d, 60, y, label) + 26
    f, lines = _fit(d, title.upper(), [96, 84, 72, 62], W - 120, 3)
    for ln in lines:
        d.text((60, y), ln, font=f, fill=WHITE)
        y += int(f.size * 1.08)
    y += 20
    for ln in _wrap(d, body, reg(40), W - 120)[:9]:
        d.text((60, y), ln, font=reg(40), fill=PAPER)
        y += 56
    return im


def slide_end(cta):
    im, d = _frame("livelouder.com.au")
    f, lines = _fit(d, cta.upper(), [120, 100, 88], W - 120, 3)
    y = 460
    for ln in lines:
        d.text((60, y), ln, font=f, fill=WHITE)
        y += int(f.size * 1.08)
    y += 30
    d.text((60, y), "Link in bio  ·  livelouder.com.au", font=bold(40), fill=RED)
    y += 80
    for ln in _wrap(d, "Every gig, tour and festival in Australia, plus what's out on vinyl. Free weekly email every Thursday.", reg(36), W - 120):
        d.text((60, y), ln, font=reg(36), fill=(200, 200, 200))
        y += 50
    return im


def _fmt(s):
    x = dt.date.fromisoformat(s[:10])
    return x.strftime("%a ") + f"{x.day} {x.strftime('%b')}"


def build(out, site, today, ctx):
    """ctx: dict with tours, shows, artists, news, stories, rels, rel_dg, pick, upcoming_sales, gotw, wanted, slug, curated, main_cities, wk_days"""
    if Image is None:
        print("social: Pillow not installed, skipped")
        return None
    slug = ctx["slug"]
    photo = lambda n: (ctx["artists"].get(slug(n)) or {}).get("photo", "")
    import os
    wd = int(os.environ["SOCIAL_WEEKDAY"]) if os.environ.get("SOCIAL_WEEKDAY") else today.weekday()
    slides, caption, kind = [], "", ""
    week_ago = (today - dt.timedelta(days=7)).isoformat()

    def news_post():
        n = ctx["news"][0]
        return ([slide_cover("News", n.get("tag", "News"), n["title"], n["date"] and _fmt(n["date"]), photo(n.get("artist", "")), n.get("artist", ""))],
                f"{n['title']}\n\nFull story on livelouder.com.au (link in bio).\n\n{TAGS}", "news")

    if wd == 0:  # Monday: just announced
        fresh = sorted([t for t in ctx["tours"] if t.get("added", "") >= week_ago and t["dates"]] or ctx["tours"][:5],
                       key=lambda t: t.get("added", ""), reverse=True)[:6]
        if fresh:
            n = len(fresh) + 2
            slides.append(slide_cover("Just announced", "New tours", "Just announced", f"{len(fresh)} new Australian tours this week. Swipe →",
                                      photo(fresh[0]["artist"]), fresh[0]["artist"], f"1/{n}"))
            for i, t in enumerate(fresh, 2):
                cities = ", ".join(sorted({x[1] for x in t["dates"]}))
                slides.append(slide_cover("Just announced", t["tour"][:40], t["artist"], f"From {_fmt(t['dates'][0][0])} · {cities}",
                                          photo(t["artist"]), t["artist"], f"{i}/{n}"))
            slides.append(slide_end("Dates & tickets on Live Louder"))
            names = ", ".join(t["artist"] for t in fresh)
            caption = (f"Just announced: new Australian tours from {names} 🎟️\n\nAll the dates, venues and ticket links are on livelouder.com.au (link in bio). "
                       f"Follow an artist on the site and we'll email you when tickets drop.\n\n{TAGS} #tourannouncement")
            kind = "just-announced"
    elif wd == 1:  # Tuesday: on sale
        ups = ctx["upcoming_sales"][:6]
        if ups:
            rows = [(x["artist"], f'{"Presale" if x["kind"] == "Presale" else "On sale"} {x["when"].strftime("%a %-d %b, %-I:%M%p").lower().replace(":00", "")} · {", ".join(x["cities"][:3])}',
                     photo(x["artist"]), x["artist"]) for x in ups]
            slides = [slide_list("On sale soon", "Tickets on sale this week", rows), slide_end("Set a reminder on Live Louder")]
            caption = ("Tickets on sale this week ⏰ Presales and general on-sales, in Sydney time.\n\n"
                       + "\n".join(f"• {r[0]}: {r[1]}" for r in rows)
                       + f"\n\nTimes and reminders at livelouder.com.au/on-sale (link in bio).\n\n{TAGS} #presale #tickets")
            kind = "on-sale"
    elif wd == 2:  # Wednesday: Mick's picks
        p = ctx["pick"]
        if p:
            g, r = p.get("gig") or {}, p.get("record") or {}
            if g:
                slides.append(slide_text("Mick's picks", "Gig pick", g["artist"], g["text"] + "  — Mick", "1/3", photo(g["artist"]), g["artist"]))
            if r:
                hit = (ctx["rel_dg"].get(f"{r['artist']}|{r['title']}") or {}).get("hit") or {}
                slides.append(slide_text("Mick's picks", "Record pick", f"{r['artist']} – {r['title']}", r["text"] + "  — Mick", "2/3", hit.get("cover", ""), r["artist"]))
            slides.append(slide_end("This week's picks"))
            caption = (f"Mick's picks this week 🎸💿\n\nGig: {g.get('artist', '')}" + (f" · {_fmt(g['date'])}, {g.get('venue', '')}, {g.get('city', '')}" if g.get("date") else "")
                       + f"\nRecord: {r.get('artist', '')} – {r.get('title', '')}\n\n{g.get('text', '')}\n\nMore on livelouder.com.au (link in bio).\n\n{TAGS}")
            kind = "picks"
    elif wd == 3:  # Thursday: this weekend
        days = [x.isoformat() for x in ctx["wk_days"]]
        cities = [c for c in ctx["main_cities"] if any(s["city"] == c and s["date"] in days for s in ctx["shows"])][:4]
        if cities:
            n = len(cities) + 2
            lab = f"{ctx['wk_days'][0].day}–{ctx['wk_days'][2].day} {ctx['wk_days'][2].strftime('%b')}"
            slides.append(slide_cover("This weekend", lab, "What's on this weekend", "Gigs by city. Swipe →", "", "", f"1/{n}"))
            for i, c in enumerate(cities, 2):
                ss = [s for s in ctx["shows"] if s["city"] == c and s["date"] in days]
                ss.sort(key=lambda s: (slug(s["artist"]) not in ctx["curated"], s["date"]))
                rows = [(s["artist"], f"{_fmt(s['date'])} · {s['venue']}", None, "") for s in ss[:6]]
                slides.append(slide_list("This weekend", c, rows, f"{i}/{n}"))
            slides.append(slide_end("Every gig, every city"))
            caption = (f"This weekend ({lab}) 🔥 What's on in {', '.join(cities)}.\n\nThe full list for your city is on livelouder.com.au (link in bio).\n\n{TAGS} "
                       + " ".join("#" + c.lower().replace(" ", "") + "gigs" for c in cities))
            kind = "this-weekend"
    elif wd == 4:  # Friday: gig of the week
        g = ctx["gotw"]
        if g:
            slides = [slide_cover("Gig of the week", f"{_fmt(g['date'])} · {g['city']}", g["artist"], f"{g['venue']}, {g['city']}", photo(g["artist"]), g["artist"])]
            caption = f"Gig of the week: {g['artist']} at {g['venue']}, {g['city']} on {_fmt(g['date'])} 🎤\n\nDates and tickets on livelouder.com.au (link in bio).\n\n{TAGS}"
            kind = "gig-of-the-week"
    elif wd == 5:  # Saturday: vinyl
        end = (today + dt.timedelta(days=10)).isoformat()
        items = [i for i in ctx["rels"]["items"] if today.isoformat() <= i[0] <= end][:5] or [i for i in ctx["rels"]["items"] if i[0] >= today.isoformat()][:5]
        if items:
            rows = []
            for dd, a, t, fm in items:
                hit = (ctx["rel_dg"].get(f"{a}|{t}") or {}).get("hit") or {}
                rows.append((a, f"{t} · {_fmt(dd) if len(dd) > 4 else 'Date TBC'}", hit.get("cover", ""), a))
            slides = [slide_list("Out on vinyl", "New on vinyl", rows), slide_end("What's coming out on vinyl")]
            caption = ("New on vinyl 💿\n\n" + "\n".join(f"• {r[0]}: {r[1]}" for r in rows)
                       + f"\n\nFull list with covers and pressing details on livelouder.com.au (link in bio).\n\n{TAGS} #vinylcollection #nowspinning #newmusic")
            kind = "vinyl"
    else:  # Sunday: story or most wanted
        st = sorted(ctx["stories"], key=lambda s: s["date"], reverse=True)
        if st and st[0]["date"] >= week_ago:
            s = st[0]
            slides = [slide_cover("Stories", "Story", s["title"], s["dek"], photo(s.get("artist", "")), s.get("artist", "") or s["title"])]
            caption = f"{s['title']}\n\n{s['dek']}\n\nRead it on livelouder.com.au (link in bio).\n\n{TAGS}"
            kind = "story"
        elif ctx["wanted"]:
            w = ctx["wanted"][:5]
            rows = [(r["title"], f"{r['artist']} · {r['want']:,} collectors want it", r.get("thumb", ""), r["artist"]) for r in w]
            slides = [slide_list("Most wanted", "Most wanted on vinyl", rows), slide_end("The full most-wanted list")]
            caption = ("The records collectors want most, from artists touring Australia soon 💿\n\n" + "\n".join(f"{i}. {r[1].split(' · ')[0]} – {r[0]}" for i, r in enumerate(rows, 1))
                       + f"\n\nFull list on livelouder.com.au (link in bio).\n\n{TAGS} #vinylcommunity")
            kind = "most-wanted"
    if not slides and ctx["news"]:
        slides, caption, kind = news_post()
    if not slides:
        return None

    d = out / "social"
    d.mkdir(parents=True, exist_ok=True)
    key = today.isoformat()
    urls = []
    for i, im in enumerate(slides[:10], 1):
        name = f"{key}-{kind}-{i}.jpg"
        im.save(d / name, "JPEG", quality=88, optimize=True)
        urls.append(f"{site}/social/{name}")
    post = {"date": key, "kind": kind, "caption": caption[:2100], "images": urls}
    (d / "today.json").write_text(json.dumps(post))
    imgs = "".join(f'<img src="{u}" alt="" style="width:100%;max-width:420px;border-radius:8px;margin:0 8px 8px 0">' for u in urls)
    (d / "index.html").write_text(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Today\'s post</title></head><body style="font-family:Helvetica,Arial,sans-serif;background:#141414;color:#f6f5f2;padding:20px">'
        f'<h1 style="margin:0 0 6px">Today\'s post ({key})</h1><p style="color:#aaa">Posted automatically to Instagram and Facebook. For TikTok: save the images '
        '(press and hold on a phone), open TikTok, tap + → Photo, pick them in order, paste the caption.</p>'
        f'<div>{imgs}</div><textarea id="c" style="width:100%;max-width:860px;height:220px;font-size:15px">{caption.replace("<", "&lt;")}</textarea><br>'
        '<button onclick="navigator.clipboard.writeText(document.getElementById(\'c\').value);this.textContent=\'Copied!\'" '
        'style="font-size:18px;padding:12px 22px;background:#e2391f;color:#fff;border:0;border-radius:999px;margin-top:10px">Copy caption</button></body></html>')
    return post
