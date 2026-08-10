/** Probe the live docs.geoff.ai nav + watched surface pages. */
const WATCHED = [
  "/introduction/overview",
  "/introduction/quickstart",
  "/introduction/authentication",
  "/introduction/models",
  "/token-plan/overview",
  "/token-plan/pricing",
  "/token-plan/usage",
  "/mcp/overview",
  "/mcp/tools",
  "/mcp/examples",
  "/mcp/transports",
  "/features/hq",
  "/features/agent-mode",
  "/features/codev3",
  "/features/content-types",
  "/features/elements",
  "/features/skills",
  "/features/social",
  "/features/stacknet-proxy",
  "/features/studio-mode",
  "/features/tool-catalog",
  "/geoff-code/getting-started",
  "/api-reference/overview",
  "/cookbook/overview",
  "/docs/overview",
  "/docs/agents",
  "/docs/security",
  "/docs/billing",
];

async function probe(path) {
  const url = `https://docs.geoff.ai${path}`;
  const res = await fetch(url, {
    headers: { "user-agent": "GeoffThermometer/1.0", accept: "text/html" },
    redirect: "follow",
  });
  const text = await res.text();
  const title = (text.match(/<title>([^<]+)/i) || [])[1] || "";
  const main = (text.match(/<main[\s\S]*?<\/main>/i) || [])[0] || "";
  const bodyLen = main
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
  const ok = res.status === 200 && !/page could not be found|NOT_FOUND/i.test(text.slice(0, 200));
  return {
    path,
    status: res.status,
    title: title.replace(/\s+/g, " ").slice(0, 80),
    bodyLen,
    ok,
  };
}

async function main() {
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
  console.log("homeNav", hrefs);
  const missingFromWatch = hrefs.filter((h) => !WATCHED.includes(h) && h !== "/mcp");
  console.log("navNotWatched", missingFromWatch);

  const results = [];
  for (const p of WATCHED) {
    results.push(await probe(p));
  }
  console.log(
    "live",
    results.filter((r) => r.ok).map((r) => `${r.path} body=${r.bodyLen} :: ${r.title}`),
  );
  console.log(
    "dead",
    results.filter((r) => !r.ok).map((r) => `${r.path} ${r.status}`),
  );
  console.log(`score ${results.filter((r) => r.ok).length}/${WATCHED.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
