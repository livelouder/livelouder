Live Louder website (livelouder.com.au)

site/      The finished website. This is the folder you drag into Netlify.
data/      The content: tours.json, releases.json, stories.json.
src/       The design (style.css).
build.py   Rebuilds site/ from data/ and src/ (python3 build.py).

To update the site, ask Claude to add tours, releases or stories. It edits data/, rebuilds site/, and you re-upload site/ to Netlify.
