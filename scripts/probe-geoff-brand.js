async function dig(url) {
  const r = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "GeoffThermometer/1.0", accept: "text/html" },
  });
  const html = await r.text();
  const title = ((html.match(/<title>([^<]+)/i) || [])[1] || "").trim();
  const desc = ((html.match(/property="og:description"[^>]*content="([^"]+)"/i) || html.match(/name="description"[^>]*content="([^"]+)"/i) || [])[1] || "").trim();
  const ogTitle = ((html.match(/property="og:title"[^>]*content="([^"]+)"/i) || [])[1] || "").trim();
  const next = (html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/) || [])[1];
  let nextKeys = [];
  let textHits = [];
  if (next) {
    try {
      const j = JSON.parse(next);
      nextKeys = Object.keys(j.props?.pageProps || j).slice(0, 40);
      const blob = JSON.stringify(j);
      for (const k of ["manifesto", "philosophy", "mission", "Stacknet", "one pool", "token", "agent", "Geoff"]) {
        if (blob.toLowerCase().includes(k.toLowerCase())) textHits.push(k);
      }
    } catch {}
  }

  // RSC / flight payloads often embed readable copy
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[.*?\]\)/g)].length;
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Look for manifesto-ish phrases
  const phrases = [
    /manifesto/i,
    /we believe/i,
    /the future of/i,
    /stacknet/i,
    /one pool/i,
    /every modality/i,
    /agents? (?:should|will|are)/i,
    /build in public/i,
    /compute/i,
  ]
    .map((re) => {
      const m = plain.match(re);
      return m ? m[0] : null;
    })
    .filter(Boolean);

  console.log("\n==", url);
  console.log({ status: r.status, title, ogTitle, desc: desc.slice(0, 200), next: Boolean(next), nextKeys, chunks, plainLen: plain.length, phrases });
  console.log("plain snip:", plain.slice(0, 700));

  // Extract long quoted strings that look like copy
  const longs = [...html.matchAll(/"([A-Z][^"\\]{80,280})"/g)].map((m) => m[1]).slice(0, 12);
  if (longs.length) {
    console.log("long strings:");
    for (const s of longs) console.log(" -", s.slice(0, 180));
  }
}

(async () => {
  for (const u of [
    "https://www.geoff.ai/",
    "https://www.geoff.ai/manifesto",
    "https://www.geoff.ai/about",
    "https://www.geoff.ai/explore",
  ]) {
    await dig(u);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
