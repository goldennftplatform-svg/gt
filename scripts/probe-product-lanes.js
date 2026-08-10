const LANES = [
  "/max",
  "/max/solana",
  "/max/solana/portfolio",
  "/hq",
  "/studio",
  "/skills",
  "/code",
  "/claw",
  "/explore",
  "/connect",
];

async function probe(path) {
  const res = await fetch(`https://www.geoff.ai${path}`, {
    redirect: "manual",
    headers: { "user-agent": "GeoffThermometer/1.0", accept: "text/html" },
  });
  const loc = res.headers.get("location") || "";
  const toConnect = /\/connect/i.test(loc);
  return {
    path,
    status: res.status,
    toConnect,
    live: res.status === 200 || (res.status >= 300 && res.status < 400 && toConnect),
    location: loc.slice(0, 120) || null,
  };
}

(async () => {
  for (const p of LANES) {
    console.log(JSON.stringify(await probe(p)));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
