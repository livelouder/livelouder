"""List venue pages that have no official venue website yet (run after build.py).
Prints JSON: [{"slug","name","city","gigs"}], most gigs first."""
import glob, json, re, html
done = json.load(open("data/venue_websites.json"))
out = []
for f in glob.glob("site/venues/*.html"):
    s = f.split("/")[-1][:-5]
    if s in done: continue
    t = open(f, encoding="utf-8").read()
    m = re.search(r"<title>(.*?), (.*?): gig guide", t)
    if not m: continue
    own = re.search(r'data-tk="venue_site"[^>]*>Venue website', t)
    out.append({"slug": s, "name": html.unescape(m.group(1)), "city": html.unescape(m.group(2)),
                "gigs": t.count('class="gig'), "has_own_link_already": bool(own)})
out.sort(key=lambda x: (x["has_own_link_already"], -x["gigs"]))
print(json.dumps(out, ensure_ascii=False, indent=1))
