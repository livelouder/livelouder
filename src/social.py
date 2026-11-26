"""Daily social posts for Instagram, Facebook (and TikTok by hand).

Every build makes today's post: branded 1080x1350 images in site/social/ plus a caption,
listed in site/social/today.json. The Netlify function social-post.mjs publishes it.
site/social/index.html shows today's post with a copy-caption button for TikTok.

Built for what grows an Instagram account: shares/sends, saves and comments.
Every post opens with a hook slide, asks a question, and ends with a "send this
to a mate" or "save this" slide.

Rotation (Sydney day of week), unless data/social_queue.json has a post for today:
  Mon  Tours that just dropped ("which one are you buying?")
  Tue  Tickets on sale this week ("save this")
  Wed  Mick's picks
  Thu  This weekend in your city ("send to your gig crew")
  Fri  This or that? (two albums from touring artists, comment 1 or 2)
  Sat  Albums turning 30/25/20 this year (nostalgia), or new on vinyl
  Sun  Most wanted records / story of the week
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
        y += int(f.size * 1.12)
    y += 30
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
        y += int(f.size * 1.14)
    y += 30
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



def slide_hook(kicker, big, sub="", photo_url="", photo_name="", red=True, page=None):
    """Bold opening slide. The text is the hook, so it's huge and short."""
    im, d = _frame(kicker, page)
    if red:
        d.rectangle([0, 128, W, H - 96], fill=RED)
    top, y = 128, 300
    if photo_url or photo_name:
        ph = _pic(photo_url, photo_name or big, W, 560)
        im.paste(ph, (0, top))
        d.rectangle([0, top + 560, W, top + 568], fill=INK)
        y = top + 610
    f, lines = _fit(d, big.upper(), [150, 132, 116, 100, 88, 76], W - 120, 4 if not (photo_url or photo_name) else 3)
    for ln in lines:
        d.text((60, y), ln, font=f, fill=WHITE)
        y += int(f.size * 1.12)
    if sub:
        y += 34
        for ln in _wrap(d, sub, bold(42), W - 120)[:3]:
            d.text((60, y), ln, font=bold(42), fill=INK if red else (255, 179, 166))
            y += 56
    sw = "SWIPE →"
    d.text((W - 60 - d.textlength(sw, font=bold(30)), H - 150), sw, font=bold(30), fill=WHITE if red else GREY)
    return im


def slide_photo(kicker, label, title, lines, photo_url="", photo_name="", page=None):
    """Big picture, big name, two short lines. One artist or record per slide."""
    im, d = _frame(kicker, page)
    ph = _pic(photo_url, photo_name or title, W, 760)
    im.paste(ph, (0, 128))
    y = 128 + 790
    y = _label(d, 60, y, label) + 20
    f, tl = _fit(d, title.upper(), [104, 92, 80, 68], W - 120, 2)
    for ln in tl:
        d.text((60, y), ln, font=f, fill=WHITE)
        y += int(f.size * 1.14)
    y += 18
    for ln in lines[:2]:
        for w_ in _wrap(d, ln, bold(34), W - 120)[:1]:
            d.text((60, y), w_, font=bold(34), fill=(255, 179, 166))
            y += 46
    return im


def slide_vs(kicker, left, right, page=None):
    """left/right: (title, sub, image_url, name). 'This or that?' debate slide."""
    im, d = _frame(kicker, page)
    d.text((60, 160), "THIS OR THAT?", font=head(110), fill=WHITE)
    side = (W - 60 * 2 - 40) // 2
    for i, (title, sub, url, name) in enumerate((left, right)):
        x = 60 + i * (side + 40)
        im.paste(_pic(url, name or title, side, side), (x, 330))
        d.rounded_rectangle([x + 18, 348, x + 82, 412], radius=32, fill=RED)
        n = str(i + 1)
        d.text((x + 50 - d.textlength(n, font=head(44)) / 2, 352), n, font=head(44), fill=WHITE)
        y = 330 + side + 24
        f, tl = _fit(d, title.upper(), [56, 48, 42, 36], side, 2)
        for ln in tl:
            d.text((x, y), ln, font=f, fill=WHITE)
            y += int(f.size * 1.16)
        for ln in _wrap(d, sub, reg(28), side)[:2]:
            d.text((x, y + 12), ln, font=reg(28), fill=(200, 200, 200))
            y += 36
    vs_f = head(90)
    d.ellipse([W / 2 - 70, 330 + side / 2 - 70, W / 2 + 70, 330 + side / 2 + 70], fill=INK, outline=RED, width=8)
    d.text((W / 2 - d.textlength("VS", font=vs_f) / 2, 330 + side / 2 - 56), "VS", font=vs_f, fill=WHITE)
    d.text((60, H - 170), "Comment 1 or 2 below", font=bold(44), fill=RED)
    return im


def slide_cta(main, sub="Follow @livelouderau for every gig, tour and record worth knowing about."):
    """Last slide: ask for the share or the save."""
    im, d = _frame("livelouder.com.au")
    d.rectangle([0, 128, W, H - 96], fill=INK)
    y = 380
    f, lines = _fit(d, main.upper(), [124, 108, 96, 84], W - 120, 4)
    for ln in lines:
        d.text((60, y), ln, font=f, fill=WHITE)
        y += int(f.size * 1.12)
    y += 40
    d.rectangle([60, y, 260, y + 10], fill=RED)
    y += 50
    for ln in _wrap(d, sub, bold(38), W - 120)[:3]:
        d.text((60, y), ln, font=bold(38), fill=(220, 220, 220))
        y += 52
    d.text((60, H - 170), "Every gig in Australia → livelouder.com.au", font=bold(32), fill=RED)
    return im


TAGS = {"tours": "#australiantour #livemusic #gigs", "sale": "#tickets #presale #livemusic", "picks": "#vinyl #livemusic #australianmusic",
        "weekend": "#gigs #livemusic", "vs": "#vinyl #vinylcommunity #music", "nostalgia": "#vinyl #90smusic #albumanniversary",
        "vinyl": "#vinyl #newvinyl #nowspinning", "wanted": "#vinylcommunity #vinylcollection #recordcollector", "news": "#musicnews #australianmusic"}

def _fmt(s):
    x = dt.date.fromisoformat(s[:10])
    return x.strftime("%a ") + f"{x.day} {x.strftime('%b')}"


def _queue_slides(post, photo):
    """Render a post written by the weekly social task (data/social_queue.json)."""
    out = []
    for i, sl in enumerate(post.get("slides", [])[:10], 1):
        t = sl.get("type")
        if t == "hook":
            out.append(slide_hook(post.get("kicker", "Live Louder"), sl["text"], sl.get("sub", ""), sl.get("image", "") or photo(sl.get("artist", "")),
                                  sl.get("artist", ""), sl.get("red", True)))
        elif t == "photo":
            out.append(slide_photo(post.get("kicker", "Live Louder"), sl.get("label", ""), sl["title"], sl.get("lines", []),
                                   sl.get("image", "") or photo(sl.get("artist", "")), sl.get("artist", "") or sl["title"]))
        elif t == "list":
            out.append(slide_list(post.get("kicker", "Live Louder"), sl["title"], [(r[0], r[1] if len(r) > 1 else "", None, "") for r in sl.get("rows", [])][:6]))
        elif t == "text":
            out.append(slide_text(post.get("kicker", "Live Louder"), sl.get("label", ""), sl["title"], sl.get("body", ""),
                                  None, sl.get("image", "") or photo(sl.get("artist", "")), sl.get("artist", "")))
        elif t == "vs":
            L, R = sl["left"], sl["right"]
            out.append(slide_vs(post.get("kicker", "This or that"), (L["title"], L.get("sub", ""), L.get("image", "") or photo(L.get("artist", "")), L.get("artist", "")),
                                (R["title"], R.get("sub", ""), R.get("image", "") or photo(R.get("artist", "")), R.get("artist", ""))))
        elif t == "cta":
            out.append(slide_cta(sl["text"], sl.get("sub", "Follow @livelouderau for every gig, tour and record worth knowing about.")))
    return out


def build(out, site, today, ctx):
    """ctx: dict with tours, shows, artists, news, stories, rels, rel_dg, pick, upcoming_sales, gotw, wanted, slug, curated, main_cities, wk_days"""
    if Image is None:
        print("social: Pillow not installed, skipped")
        return None
    import os
    slug = ctx["slug"]
    photo = lambda n: (ctx["artists"].get(slug(n)) or {}).get("photo", "") if n else ""
    wd = int(os.environ["SOCIAL_WEEKDAY"]) if os.environ.get("SOCIAL_WEEKDAY") else today.weekday()
    week_ago = (today - dt.timedelta(days=7)).isoformat()
    slides, caption, kind = [], "", ""
    follow = "Follow @livelouderau so you never miss a tour announcement."

    # 1. A hand-written post from the weekly social task wins, if there's one for today
    queue = ctx.get("social_queue") or []
    q = next((x for x in queue if x.get("date") == today.isoformat()), None)
    if q:
        slides = _queue_slides(q, photo)
        caption, kind = q.get("caption", ""), q.get("kind", "special")

    elif wd == 0:  # Monday: tours that just dropped
        fresh = sorted([t for t in ctx["tours"] if t.get("added", "") >= week_ago and t["dates"]] or [t for t in ctx["tours"] if t["dates"]][:5],
                       key=lambda t: t.get("added", ""), reverse=True)[:6]
        if fresh:
            n = len(fresh) + 2
            slides.append(slide_hook("Just announced", f"{len(fresh)} tours just dropped", "Which one are you buying tickets for?", page=f"1/{n}"))
            for i, t in enumerate(fresh, 2):
                cities = ", ".join(sorted({x[1] for x in t["dates"]}))
                slides.append(slide_photo("Just announced", t["tour"][:38], t["artist"], [f"From {_fmt(t['dates'][0][0])}", cities],
                                          photo(t["artist"]), t["artist"], f"{i}/{n}"))
            slides.append(slide_cta("Send this to the mate you're going with"))
            names = ", ".join(t["artist"] for t in fresh[:-1]) + (" and " + fresh[-1]["artist"] if len(fresh) > 1 else fresh[0]["artist"])
            caption = (f"{len(fresh)} tours just dropped 🎟️ Which one are you buying tickets for? Tell us below 👇\n\n{names}.\n\n"
                       f"Send this to whoever you're dragging along. Dates and tickets at livelouder.com.au (link in bio).\n\n{follow}\n\n{TAGS['tours']}")
            kind = "just-announced"

    elif wd == 1:  # Tuesday: on sale (save-bait)
        ups = ctx["upcoming_sales"][:6]
        if ups:
            rows = [(x["artist"], f'{"Presale" if x["kind"] == "Presale" else "On sale"} {x["when"].strftime("%a %-d %b, %-I:%M%p").lower().replace(":00", "")} · {", ".join(x["cities"][:3])}',
                     photo(x["artist"]), x["artist"]) for x in ups]
            slides = [slide_hook("On sale this week", "Don't get stuck in the queue", "Tickets that drop this week. Save this so you don't miss them.", page="1/3"),
                      slide_list("On sale this week", "Set your alarms", rows, "2/3"), slide_cta("Save this and set a reminder")]
            caption = ("⏰ Tickets that drop this week. SAVE this so you don't miss out.\n\n" + "\n".join(f"• {r[0]}: {r[1]}" for r in rows)
                       + f"\n\nWhich one are you queuing for? 👇\n\nTimes and calendar reminders at livelouder.com.au/on-sale (link in bio).\n\n{TAGS['sale']}")
            kind = "on-sale"

    elif wd == 2:  # Wednesday: Mick's picks
        p = ctx["pick"]
        if p:
            g, r = p.get("gig") or {}, p.get("record") or {}
            slides.append(slide_hook("Mick's picks", "What I'd spend my money on this week", "One gig. One record. — Mick", page="1/4"))
            if g:
                slides.append(slide_text("Mick's picks", "Gig pick", g["artist"], g["text"], "2/4", photo(g["artist"]), g["artist"]))
            if r:
                hit = (ctx["rel_dg"].get(f"{r['artist']}|{r['title']}") or {}).get("hit") or {}
                slides.append(slide_text("Mick's picks", "Record pick", f"{r['artist']} – {r['title']}", r["text"], "3/4", hit.get("cover", ""), r["artist"]))
            slides.append(slide_cta("What's your pick this week?", "Tell me in the comments. — Mick"))
            caption = (f"What I'd spend my money on this week 🎸💿\n\nGig: {g.get('artist', '')}" + (f" ({_fmt(g['date'])}, {g.get('city', '')})" if g.get("date") else "")
                       + f"\nRecord: {r.get('artist', '')} – {r.get('title', '')}\n\nWhat's yours? Drop it below 👇 — Mick\n\n{TAGS['picks']}")
            kind = "picks"

    elif wd == 3:  # Thursday: this weekend (send-bait)
        days = [x.isoformat() for x in ctx["wk_days"]]
        cities = [c for c in ctx["main_cities"] if any(s["city"] == c and s["date"] in days for s in ctx["shows"])][:4]
        if cities:
            n = len(cities) + 2
            lab = f"{ctx['wk_days'][0].day}–{ctx['wk_days'][2].day} {ctx['wk_days'][2].strftime('%b')}"
            slides.append(slide_hook("This weekend", "Your weekend, sorted", f"The best gigs on {lab}. Find your city →", page=f"1/{n}"))
            for i, c in enumerate(cities, 2):
                ss = [s for s in ctx["shows"] if s["city"] == c and s["date"] in days]
                ss.sort(key=lambda s: (slug(s["artist"]) not in ctx["curated"], s["date"]))
                rows = [(s["artist"], f"{_fmt(s['date'])} · {s['venue']}", photo(s["artist"]), s["artist"]) for s in ss[:5]]
                slides.append(slide_list("This weekend", c, rows, f"{i}/{n}"))
            slides.append(slide_cta("Send this to your gig crew"))
            caption = (f"Your weekend, sorted 🔥 The best gigs on {lab} in {', '.join(cities)}.\n\nSend this to whoever you're going out with 👀 "
                       f"Every gig in your city at livelouder.com.au (link in bio).\n\n{TAGS['weekend']} " + " ".join("#" + c.lower().replace(" ", "") for c in cities))
            kind = "this-weekend"

    elif wd == 4:  # Friday: this or that?
        wanted = [w for w in ctx["wanted"] if w.get("thumb")] or ctx["wanted"]
        pair = None
        for a in wanted:
            for b in wanted:
                if a["artist"] != b["artist"] and abs(a["year"] - b["year"]) <= 12 and (a["title"], b["title"]) != (b["title"], a["title"]):
                    pair = (a, b)
                    break
            if pair:
                break
        if pair:
            a, b = pair
            pick_i = (today.toordinal() // 7) % max(1, len(wanted) - 1)
            slides = [slide_vs("This or that", (a["title"], f"{a['artist']} · {a['year']}", a.get("thumb", ""), a["artist"]),
                               (b["title"], f"{b['artist']} · {b['year']}", b.get("thumb", ""), b["artist"])),
                      slide_cta("Only one goes on the turntable. Which one?", "Comment 1 or 2. Both artists are touring Australia soon.")]
            caption = (f"This or that? 👇 Comment 1 or 2.\n\n1. {a['artist']} – {a['title']} ({a['year']})\n2. {b['artist']} – {b['title']} ({b['year']})\n\n"
                       f"Both are touring Australia soon. Dates at livelouder.com.au (link in bio).\n\n{TAGS['vs']}")
            kind = "this-or-that"
        elif ctx["gotw"]:
            g = ctx["gotw"]
            slides = [slide_photo("Gig of the week", f"{_fmt(g['date'])} · {g['city']}", g["artist"], [f"{g['venue']}, {g['city']}"], photo(g["artist"]), g["artist"]),
                      slide_cta("Tag who you'd take")]
            caption = f"Gig of the week: {g['artist']} at {g['venue']}, {g['city']} ({_fmt(g['date'])}) 🎤\n\nTag who you'd take 👇\n\n{TAGS['tours']}"
            kind = "gig-of-the-week"

    elif wd == 5:  # Saturday: nostalgia, else new vinyl
        yr = today.year
        anniv = []
        for a in ctx["artists"].values():
            for r in (a.get("discogs") or {}).get("records", []):
                if yr - r["year"] in (30, 25, 20):
                    anniv.append(dict(r, artist=a["name"], age=yr - r["year"]))
        anniv.sort(key=lambda r: (-r["age"], -r.get("have", 0)))
        if len(anniv) >= 2:
            age = anniv[0]["age"]
            sel = [r for r in anniv if r["age"] == age][:6] or anniv[:6]
            n = len(sel) + 2
            slides.append(slide_hook("Feel old yet?", f"These albums turn {age} in {yr}", "Feel old yet?", page=f"1/{n}"))
            for i, r in enumerate(sel, 2):
                slides.append(slide_photo(f"Turning {r['age']}", str(r["year"]), r["title"], [r["artist"]], r.get("thumb", ""), r["artist"], f"{i}/{n}"))
            slides.append(slide_cta("Which one still lives on your turntable?"))
            caption = (f"These albums turn {age} in {yr}. Feel old yet? 😅\n\n" + "\n".join(f"• {r['artist']} – {r['title']} ({r['year']})" for r in sel)
                       + f"\n\nWhich one still gets a spin at your place? 👇 Send this to someone who had it on repeat.\n\n{TAGS['nostalgia']}")
            kind = "nostalgia"
        else:
            end = (today + dt.timedelta(days=10)).isoformat()
            items = [i for i in ctx["rels"]["items"] if today.isoformat() <= i[0] <= end][:5] or [i for i in ctx["rels"]["items"] if i[0] >= today.isoformat()][:5]
            if items:
                n = len(items) + 2
                slides.append(slide_hook("Out on vinyl", "New on vinyl this week", "Which one's going on your shelf?", page=f"1/{n}"))
                for i, (dd, a, t, fm) in enumerate(items, 2):
                    hit = (ctx["rel_dg"].get(f"{a}|{t}") or {}).get("hit") or {}
                    slides.append(slide_photo("Out on vinyl", _fmt(dd) if len(dd) > 4 else "Coming soon", t, [a, fm], hit.get("cover", ""), a, f"{i}/{n}"))
                slides.append(slide_cta("Which one's going on your shelf?"))
                caption = ("New on vinyl 💿 Which one's going on your shelf? 👇\n\n" + "\n".join(f"• {a} – {t} ({fm})" for _, a, t, fm in items)
                           + f"\n\nFull list with pressing details at livelouder.com.au (link in bio).\n\n{TAGS['vinyl']}")
                kind = "vinyl"

    else:  # Sunday: most wanted ("how many do you own?")
        w = ctx["wanted"][:6]
        if len(w) >= 3:
            n = len(w) + 2
            slides.append(slide_hook("Most wanted", "The records everyone's hunting for", "How many do you own?", page=f"1/{n}"))
            for i, r in enumerate(w, 2):
                slides.append(slide_photo("Most wanted", f"#{i - 1}", r["title"], [f"{r['artist']} · {r['year']}", f"{r['want']:,} collectors want it"],
                                          r.get("thumb", ""), r["artist"], f"{i}/{n}"))
            slides.append(slide_cta("How many do you own? Be honest."))
            caption = ("The records collectors are hunting for, from artists touring Australia soon 🔍\n\nHow many are in your collection? 👇\n\n"
                       + "\n".join(f"{i}. {r['artist']} – {r['title']}" for i, r in enumerate(w, 1))
                       + f"\n\nFull list at livelouder.com.au (link in bio).\n\n{TAGS['wanted']}")
            kind = "most-wanted"
        else:
            st = sorted(ctx["stories"], key=lambda s: s["date"], reverse=True)
            if st:
                s = st[0]
                slides = [slide_hook("Story", s["title"], s["dek"], photo(s.get("artist", "")), s.get("artist", "")), slide_cta("Read the full story")]
                caption = f"{s['title']}\n\n{s['dek']}\n\nRead it at livelouder.com.au (link in bio).\n\n{TAGS['news']}"
                kind = "story"

    if not slides and ctx["news"]:
        n = ctx["news"][0]
        slides = [slide_hook("News", n["title"], "", photo(n.get("artist", "")), n.get("artist", "")), slide_cta("More news on Live Louder")]
        caption = f"{n['title']}\n\nWhat do you reckon? 👇 Full story at livelouder.com.au (link in bio).\n\n{TAGS['news']}"
        kind = "news"
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
    fb_message = caption.replace(" (link in bio)", "").replace("livelouder.com.au", "https://livelouder.com.au", 1)
    post = {"date": key, "kind": kind, "caption": caption[:2100], "images": urls,
            # ready-made lists in the shapes Make's Instagram carousel and Facebook photo modules expect
            "ig_files": [{"media_type": "IMAGE", "image_url": u} for u in urls],
            "fb_photos": [{"type": "url", "url": u} for u in urls],
            "fb_message": fb_message[:5000]}
    (d / "today.json").write_text(json.dumps(post))
    imgs = "".join(f'<img src="{u}" alt="" style="width:100%;max-width:420px;border-radius:8px;margin:0 8px 8px 0">' for u in urls)
    (d / "index.html").write_text(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Today\'s post</title></head><body style="font-family:Helvetica,Arial,sans-serif;background:#141414;color:#f6f5f2;padding:20px">'
        f'<h1 style="margin:0 0 6px">Today\'s post ({key})</h1><p style="color:#aaa">Posted automatically to Instagram and Facebook. For TikTok: save the images '
        '(press and hold on a phone), open TikTok, tap + → Photo, pick them in order, add a trending sound, paste the caption.</p>'
        f'<div>{imgs}</div><textarea id="c" style="width:100%;max-width:860px;height:220px;font-size:15px">{caption.replace("<", "&lt;")}</textarea><br>'
        '<button onclick="navigator.clipboard.writeText(document.getElementById(\'c\').value);this.textContent=\'Copied!\'" '
        'style="font-size:18px;padding:12px 22px;background:#e2391f;color:#fff;border:0;border-radius:999px;margin-top:10px">Copy caption</button></body></html>')
    return post
