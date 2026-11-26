// Rebuilds the site every morning so the gig guide picks up new Ticketmaster shows
// and past gigs drop off. Needs a Netlify build hook URL saved as BUILD_HOOK_URL.
export default async () => {
  const hook = process.env.BUILD_HOOK_URL;
  if (!hook) return new Response("BUILD_HOOK_URL not set", { status: 200 });
  const r = await fetch(hook, { method: "POST" });
  return new Response(`rebuild requested: ${r.status}`);
};

export const config = { schedule: "0 19 * * *" }; // 19:00 UTC = 6am AEDT / 5am AEST
