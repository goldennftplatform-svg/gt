async function main() {
  const home = await fetch("https://www.geoff.ai/manifesto", {
    headers: { "user-agent": "GeoffThermometer/1.0" },
  }).then((r) => r.text());

  const assets = [
    ...new Set(
      [...home.matchAll(/\/_next\/static\/[^"'\\]+\.(?:js|css)/g)].map((m) => m[0].split("?")[0]),
    ),
  ];
  console.log("assets", assets.length, assets.slice(0, 15));

  const keywords = [
    "manifesto",
    "peoples",
    "people",
    "Go Turbo",
    "Create, learn",
    "Stacknet",
    "StackNet",
    "we believe",
    "philosophy",
    "the future",
    "Turbo",
    "build and play",
    "Integral",
  ];

  const hits = [];
  for (const asset of assets) {
    const url = `https://www.geoff.ai${asset}`;
    let text = "";
    try {
      text = await fetch(url, { headers: { "user-agent": "GeoffThermometer/1.0" } }).then((r) =>
        r.text(),
      );
    } catch {
      continue;
    }
    for (const k of keywords) {
      const lower = text.toLowerCase();
      const needle = k.toLowerCase();
      let from = 0;
      let n = 0;
      while (n < 3) {
        const idx = lower.indexOf(needle, from);
        if (idx < 0) break;
        hits.push({
          asset,
          k,
          snip: text.slice(Math.max(0, idx - 100), idx + 280).replace(/\s+/g, " "),
        });
        from = idx + needle.length;
        n += 1;
      }
    }

    // CSS color tokens
    if (asset.endsWith(".css")) {
      const colors = [...text.matchAll(/--[a-zA-Z0-9-]+:\s*[^;]{1,80}/g)].slice(0, 40);
      if (colors.length) {
        console.log("\nCSS vars", asset);
        for (const c of colors) console.log(" ", c[0]);
      }
      const hsl = [...text.matchAll(/hsl\([^)]+\)/g)].slice(0, 20).map((m) => m[0]);
      if (hsl.length) console.log("hsl sample", [...new Set(hsl)].slice(0, 15));
    }
  }

  console.log("\nhitCount", hits.length);
  // Prefer unique snips
  const seen = new Set();
  for (const h of hits) {
    const key = h.snip.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log("\n---", h.k, "@", h.asset.split("/").pop());
    console.log(h.snip);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
