const CANDIDATES = [
  "/manifesto",
  "/about",
  "/blog",
  "/changelog",
  "/news",
  "/pricing",
  "/turbo",
  "/cover",
  "/widgets",
  "/agents",
  "/docs",
  "/api",
  "/sandbox",
  "/play",
  "/imagine",
  "/create",
  "/train",
  "/social",
  "/squad",
  "/swarm",
  "/max/solana/watch",
  "/max/solana/trade",
  "/max/solana/stake",
  "/hq/agents",
  "/studio/new",
  "/skills/browse",
  "/code/new",
  "/claw/new",
];

async function probe(path) {
  const res = await fetch(`https://www.geoff.ai${path}`, {
    redirect: "manual",
    headers: { "user-agent": "GeoffThermometer/1.0", accept: "text/html" },
  });
  const loc = res.headers.get("location") || "";
  const toConnect = /\/connect/i.test(loc);
  const live = res.status === 200 || (res.status >= 300 && res.status < 400 && (toConnect || loc));
  return {
    path,
    status: res.status,
    toConnect,
    live,
    loc: loc.slice(0, 100) || null,
  };
}

(async () => {
  const home = await fetch("https://docs.geoff.ai/", {
    headers: { "user-agent": "GeoffThermometer/1.0" },
  }).then((r) => r.text());
  const hrefs = [
    ...new Set(
      [...home.matchAll(/href="(\/[^"#?]{1,120})"/g)]
        .map((m) => m[1])
        .filter((h) => !h.startsWith("/_next") && !h.includes(".") && !h.includes("_props")),
    ),
  ].sort();
  console.log("docsNav", hrefs);

  console.log("\nlaneCandidates");
  for (const p of CANDIDATES) {
    console.log(JSON.stringify(await probe(p)));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
