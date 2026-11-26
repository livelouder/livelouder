// The one deploy each day (other updates push with [skip netlify]). Rebuilds the site every morning so the gig guide picks up new Ticketmaster shows
// and past gigs drop off. Needs a Netlify build hook URL saved as BUILD_HOOK_URL.
export default async () => {
  const hook = process.env.BUILD_HOOK_URL;
  if (!hook) return new Response("BUILD_HOOK_URL not set", { status: 200 });
  const r = await fetch(hook, { method: "POST" });
  return new Response(`rebuild requested: ${r.status}`);
};

export const config = { schedule: "0 20 * * *" }; // 20:00 UTC = 7am AEDT / 6am AEST. The only deploy each day.
