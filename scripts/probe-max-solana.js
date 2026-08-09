async function get(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "GeoffThermometer/1.0", Accept: "*/*" },
    redirect: "manual",
  });
  const text = r.status >= 300 && r.status < 400 ? "" : await r.text();
  return {
    status: r.status,
    loc: r.headers.get("location"),
    ct: r.headers.get("content-type") || "",
    text,
    url: r.url,
  };
}

async function follow(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "GeoffThermometer/1.0", Accept: "text/html" },
    redirect: "follow",
  });
  return { status: r.status, final: r.url, text: await r.text() };
}

function simpleHash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function main() {
  const routes = ["/max", "/max/solana", "/max/solana/foo", "/max/solana/portfolio", "/explore"];
  for (const p of routes) {
    const bare = await get(`https://www.geoff.ai${p}`);
    console.log(
      JSON.stringify({
        p,
        status: bare.status,
        loc: bare.loc,
      }),
    );
  }

  // Hunt route strings in home + explore bundles
  const page = await follow("https://www.geoff.ai/explore");
  const chunks = [...new Set([...page.text.matchAll(/\/_next\/static\/[^"' ]+\.js/g)].map((m) => m[0]))];
  console.log("exploreChunks", chunks.length);
  const hits = new Set();
  for (const path of chunks.slice(0, 80)) {
    try {
      const res = await follow(`https://www.geoff.ai${path}`);
      if (!res.text.includes("max") && !res.text.includes("solana")) continue;
      for (const m of res.text.matchAll(/\/max\/[A-Za-z0-9/_-]{0,80}/g)) hits.add(m[0]);
      if (res.text.includes("/max/solana")) hits.add("HAS_/max/solana");
      if (res.text.includes("max/solana/portfolio")) hits.add("HAS_portfolio_exclude");
    } catch {
      /* ignore */
    }
  }
  console.log("bundleHits", [...hits].sort());

  // Public trackable signal: auth-gate redirect targets
  const tracked = ["/max", "/max/solana", "/max/solana/portfolio"];
  const rows = [];
  for (const p of tracked) {
    const res = await follow(`https://www.geoff.ai${p}`);
    const u = new URL(res.final);
    rows.push({
      id: p.replace(/\//g, "_").replace(/^_/, "") || "max",
      path: p,
      ok: res.status === 200,
      finalPath: u.pathname,
      redirectToConnect: u.pathname === "/connect",
      redirectUrl: u.searchParams.get("redirectUrl"),
      shellHash: simpleHash(res.text.slice(0, 8000)),
    });
  }
  console.log("trackable", JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
