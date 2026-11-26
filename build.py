"""Builds the Live Louder static site from the data folder into ./site.
Run: python3 build.py
"""
import json, html, re, shutil, datetime as dt
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).parent
OUT = ROOT / "site"
UPDATED = "26 November 2026"
HEATHEN = "https://heathenrecords.com.au/search?type=product&q="

e = lambda s: html.escape(str(s), quote=True)
def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
def d(s): return dt.date.fromisoformat(s)
def fmt(s, wd=True):
    x = d(s); return (x.strftime("%a ") if wd else "") + f"{x.day} {x.strftime('%b %Y')}"

tours = json.loads((ROOT / "data/tours.json").read_text())
rels = json.loads((ROOT / "data/releases.json").read_text())
stories = json.loads((ROOT / "data/stories.json").read_text())
for t in tours:
    t["id"] = slug(t["artist"])
    t["first"] = t["dates"][0][0] if t["dates"] else "2027-04-15"
tours.sort(key=lambda t: t["first"])

NAV = [("Tours", "tours.html"), ("Out soon", "out-soon.html"), ("Stories", "stories/index.html"), ("About", "about.html")]

def page(path, title, desc, body, active=None):
    depth = path.count("/")
    r = "../" * depth
    nav = "".join(f'<a href="{r}{h}"{" aria-current=page" if h == active else ""}>{n}</a>' for n, h in NAV)
    canon = "https://livelouder.com.au/" + ("" if path == "index.html" else path)
    doc = f"""<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:site_name" content="Live Louder">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{r}style.css"></head><body>
<header class="top"><div class="wrap"><a class="wm" href="{r}index.html">LIVE <span>LOUDER</span></a><nav aria-label="Main">{nav}</nav></div></header>
<main>{body.replace('href="/', 'href="' + r)}</main>
<footer class="foot"><div class="wrap"><div><div class="wm">LIVE <span>LOUDER</span></div>
<p>An independent Australian music site: tours, new vinyl and stories, made in the Blue Mountains, NSW.</p>
<p>Dates change. Always check with the official ticket seller before you buy. Last checked {UPDATED}.</p></div>
<div><p><a href="{r}tours.html">Tours</a> · <a href="{r}out-soon.html">Out soon</a> · <a href="{r}stories/index.html">Stories</a> · <a href="{r}about.html">About</a></p>
<p>Records for the drive to the show: our friends at <a href="https://heathenrecords.com.au">Heathen Records</a>.</p>
<p>© {dt.date.today().year} Live Louder</p></div></div></footer>
<script>{{const t=new Date().toISOString().slice(0,10);
document.querySelectorAll('[data-date]').forEach(el=>{{if(el.dataset.date<t){{if(el.classList.contains('stub'))el.remove();else el.classList.add('past')}}}});
const s=document.querySelector('.stubs');if(s){{const go=n=>s.scrollBy({{left:n*s.clientWidth*.8,behavior:'smooth'}});
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(+b.dataset.go)));
s.addEventListener('keydown',ev=>{{if(ev.key==='ArrowRight')go(1);if(ev.key==='ArrowLeft')go(-1)}})}}
const f=document.querySelector('.filters');if(f){{f.addEventListener('click',ev=>{{const b=ev.target.closest('button');if(!b)return;
f.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));const c=b.dataset.city;
document.querySelectorAll('.tour').forEach(tr=>{{const rows=[...tr.querySelectorAll('tbody tr')];let any=!rows.length&&(c==='all'||tr.dataset.cities.includes(c));
rows.forEach(r=>{{const ok=c==='all'||r.dataset.city===c;r.hidden=!ok;if(ok)any=true}});tr.hidden=!any}})}})}}}}</script>
</body></html>"""
    p = OUT / path; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(doc)

def tour_card(t, link_page=True):
    first = fmt(t["first"]) if t["dates"] else "April–May 2027"
    cities = sorted({c for _, c, _ in t["dates"]})
    return f"""<article class="card"><h3>{e(t['artist'])}</h3><div class="meta">{e(t['tour'])}</div>
<div><span class="first">From {e(first)}</span><br><span class="meta">{e(', '.join(cities) or 'Dates on the tour page')}</span></div>
<a href="/tours.html#{t['id']}">All dates</a></article>"""

def rel_when(s): return "2027" if s == "2027" else d(s).strftime("%-d %b")

# ---------- home ----------
shows = sorted(((dd, t, c, v) for t in tours for dd, c, v in t["dates"]), key=lambda x: x[0])
seen, stubs = set(), []
for dd, t, c, v in shows:
    if (t["artist"], c) in seen: continue
    seen.add((t["artist"], c)); x = d(dd)
    stubs.append(f'<a class="stub" data-date="{dd}" href="tours.html#{t["id"]}"><div class="d"><b>{x.day}</b><small>{x.strftime("%b")}</small></div><div class="i"><strong>{e(t["artist"])}</strong><span>{e(c)} · {e(v)}</span></div></a>')
    if len(stubs) >= 14: break
disc = "".join(f'<circle r="{r}" fill="none" stroke="#2a2a2a" stroke-width="1.2"/>' for r in range(96, 238, 9))
home = f"""<section class="hero"><svg class="disc" viewBox="-250 -250 500 500" aria-hidden="true"><circle r="248" fill="#141414"/>{disc}
<path d="M-230 -60 A238 238 0 0 1 -60 -230" stroke="rgba(255,255,255,.18)" stroke-width="22" fill="none"/>
<circle r="86" fill="#f6f5f2"/><text y="-8" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#e2391f">LIVE</text>
<text y="34" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="40" fill="#141414">LOUDER</text><circle r="7" fill="#e2391f"/></svg><div class="wrap">
<h1 class="big wm">LIVE<span>LOUDER</span></h1>
<p class="lede">Who's touring Australia, what's coming out on vinyl, and the stories behind the records.</p>
<div class="stubs-head"><h2>Next big shows</h2><div class="arrows"><button data-go="-1" aria-label="Previous shows">←</button> <button data-go="1" aria-label="Next shows">→</button></div></div>
<div class="stubs" tabindex="0" aria-label="Upcoming shows">{''.join(stubs)}</div></div></section>
<section class="band"><div class="wrap"><h2>On tour in Australia</h2><div class="grid">{''.join(tour_card(t) for t in tours[:6])}</div>
<a class="more" href="/tours.html">See all {len(tours)} tours →</a></div></section>
<section class="band" style="padding-top:0"><div class="wrap split">
<div><h2>Out soon on vinyl</h2><ul class="rel">{''.join(f'<li><div class="when">{rel_when(a)}</div><div class="what"><strong>{e(b)} – {e(c)}</strong><span>{e(fm)}</span></div></li>' for a,b,c,fm in rels['items'][:7])}</ul>
<a class="more" href="/out-soon.html">Full release list →</a></div>
<div><h2>Stories</h2>{''.join(f'<a class="storycard" href="/stories/{s["slug"]}.html"><h3>{e(s["title"])}</h3><p>{e(s["dek"])}</p></a>' for s in stories)}</div>
</div></section>"""
page("index.html", "Live Louder | Australian tours, new vinyl and music stories",
     "Who's touring Australia, what's coming out on vinyl and the stories behind the records. An independent Australian music site.", home)

# ---------- tours ----------
allc = ["Sydney", "Melbourne", "Brisbane", "Adelaide", "Perth"]
def tour_block(t):
    rows = "".join(f'<tr data-date="{dd}" data-city="{e(c)}"><td>{fmt(dd)}</td><td>{e(c)}</td><td>{e(v)}</td></tr>' for dd, c, v in t["dates"])
    tbl = f"<table><tbody>{rows}</tbody></table>" if rows else ""
    cities = " ".join(sorted({c for _, c, _ in t["dates"]}) or ["Sydney Melbourne Adelaide Perth"])
    return f"""<article class="tour" id="{t['id']}" data-cities="{e(cities)}"><header><h3>{e(t['artist'])}</h3><span class="tn">{e(t['tour'])}</span></header>
{f'<p class="sup">With {e(t["support"])}</p>' if t['support'] else ''}{f'<p class="tnote">{e(t["note"])}</p>' if t['note'] else ''}{tbl}
<footer><a href="{e(t['source'])}" rel="noopener">Tour details &amp; tickets ↗</a><a class="rec" href="{HEATHEN}{quote_plus(t['artist'].split(' & ')[0])}" rel="noopener">Get their records before the show ↗</a></footer></article>"""
tp = f"""<section class="page-title"><div class="wrap"><h1>On tour</h1><p>Australian tour dates for 2027, newest announcements added as they land.</p></div></section>
<section class="band"><div class="wrap"><div class="filters" role="group" aria-label="Filter by city"><button data-city="all" aria-pressed="true">All cities</button>{''.join(f'<button data-city="{c}" aria-pressed="false">{c}</button>' for c in allc)}</div>
{''.join(tour_block(t) for t in tours)}<p class="note">Dates come from tour announcements and can change. Check with the official ticket seller before you buy. Last checked {UPDATED}.</p></div></section>"""
page("tours.html", "Australian tours 2027: dates, venues and cities | Live Louder",
     "Every big tour coming to Australia in 2027, with dates, venues and cities: System of a Down, Bruno Mars, Powderfinger, Empire of the Sun and more.", tp, "tours.html")

# ---------- releases ----------
groups = {}
for a, b, c, fm in rels["items"]: groups.setdefault(a, []).append((b, c, fm))
rp = '<section class="page-title"><div class="wrap"><h1>Out soon</h1><p>New albums, reissues and box sets coming out on vinyl.</p></div></section><section class="band"><div class="wrap" style="max-width:860px">'
for k, items in groups.items():
    head = "Coming in 2027, date to be confirmed" if k == "2027" else d(k).strftime("%A %-d %B %Y")
    rp += f'<h2 style="font-size:28px;margin-top:28px">{e(head)}</h2><ul class="rel">' + "".join(
        f'<li><div class="when">{"TBC" if k=="2027" else d(k).strftime("%-d %b")}</div><div class="what"><strong>{e(b)} – {e(c)}</strong><span>{e(fm)}</span></div></li>' for b, c, fm in items) + "</ul>"
rp += f'<p class="note">These are international release dates. Australian stock often lands a week or two later. Sourced from label announcements via <a href="{e(rels["source"])}" rel="noopener">Ultimate Classic Rock</a>. Last checked {UPDATED}.</p></div></section>'
page("out-soon.html", "New vinyl releases: what's coming out soon | Live Louder",
     "Upcoming vinyl releases, reissues and box sets for December 2026 and 2027, with formats and release dates.", rp, "out-soon.html")

# ---------- stories ----------
si = '<section class="page-title"><div class="wrap"><h1>Stories</h1><p>Albums, artists and the shows worth catching.</p></div></section><section class="band"><div class="wrap" style="max-width:860px">'
si += "".join(f'<a class="storycard" href="/stories/{s["slug"]}.html"><h3>{e(s["title"])}</h3><p>{e(s["dek"])}</p></a>' for s in stories) + "</div></section>"
page("stories/index.html", "Music stories | Live Louder", "Album guides, artist primers and stories from Australian music.", si, "stories/index.html")
for s in stories:
    body = f"""<section class="band"><article class="article"><h1>{e(s['title'])}</h1><p class="dek">{e(s['dek'])}</p>
<p class="note">{fmt(s['date'], False)}</p>{s['body']}
<p class="note"><a href="{HEATHEN}{quote_plus(s['artist'])}" rel="noopener">Find {e(s['artist'])} on vinyl at Heathen Records ↗</a></p></article></section>"""
    page(f"stories/{s['slug']}.html", f"{s['title']} | Live Louder", s["dek"], body, "stories/index.html")

# ---------- about + 404 ----------
ab = """<section class="page-title"><div class="wrap"><h1>About</h1></div></section><section class="band"><div class="article">
<p>Live Louder is an independent Australian music site. We keep track of who's touring the country, what's coming out on vinyl, and the stories behind the records worth owning.</p>
<p>We're based in the Blue Mountains, NSW, and we're music fans first. If you're a band, a venue or a label with a tour or release we should know about, get in touch.</p>
<p>Live Louder is supported by <a href="https://heathenrecords.com.au">Heathen Records</a>, an independent online record store. Where we link to records, that's usually where the link goes.</p></div></section>"""
page("about.html", "About Live Louder", "Live Louder is an independent Australian music site: tours, new vinyl and music stories.", ab, "about.html")
page("404.html", "Page not found | Live Louder", "Page not found.",
     '<section class="page-title"><div class="wrap"><h1>Wrong stage</h1><p>That page isn\'t here. Try the <a style="color:#fff" href="/tours.html">tours</a>, <a style="color:#fff" href="/out-soon.html">new releases</a> or <a style="color:#fff" href="/stories/index.html">stories</a>.</p></div></section>')

shutil.copy(ROOT / "src/style.css", OUT / "style.css")
# sitemap
urls = ["", "tours.html", "out-soon.html", "stories/index.html", "about.html"] + [f"stories/{s['slug']}.html" for s in stories]
(OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>https://livelouder.com.au/{u}</loc></url>" for u in urls) + "</urlset>")
(OUT / "robots.txt").write_text("User-agent: *\nAllow: /\nSitemap: https://livelouder.com.au/sitemap.xml\n")
print("built", sorted(str(p.relative_to(OUT)) for p in OUT.rglob("*") if p.is_file()))
