import { marketCatalog } from "./market-catalog.js";
import { scrapeMarketIntel } from "./market-scrape.js";
import { runSniff } from "./sniffer.js";
import { FALLBACK_TOKEN_PLAN, TOKEN_PLAN_URLS } from "./token-plan.js";

function pickTokenPlan(geoffSnap) {
  const src = geoffSnap?.sources?.["geoff.docs.pricing"];
  if (src?.plans?.length) {
    return {
      scraped: Boolean(src.scraped),
      model: src.model || FALLBACK_TOKEN_PLAN.model,
      plans: src.plans,
      estimates: src.estimates || FALLBACK_TOKEN_PLAN.estimates,
      sourceUrls: src.sourceUrls || TOKEN_PLAN_URLS,
      reason: src.reason || null,
      fingerprint: src.fingerprint || null,
    };
  }
  return {
    scraped: false,
    model: FALLBACK_TOKEN_PLAN.model,
    plans: FALLBACK_TOKEN_PLAN.plans.map((p) => ({ ...p })),
    estimates: FALLBACK_TOKEN_PLAN.estimates,
    sourceUrls: TOKEN_PLAN_URLS,
    reason: "Using published Token Plan tables from docs.geoff.ai",
    fingerprint: null,
  };
}

function enrichCatalog(catalog, tokenPlan) {
  const vendors = (catalog.vendors || []).map((v) => {
    if (v.id !== "geoff") return v;
    const planLine = (tokenPlan.plans || [])
      .map((p) => `${p.name} ${p.price} (${p.tokens})`)
      .join(" · ");
    return {
      ...v,
      horsepower: {
        ...v.horsepower,
        pricingModel: planLine
          ? `Token Plan: ${planLine}`
          : v.horsepower?.pricingModel,
      },
      delivers: [
        ...(v.delivers || []).filter((d) => !/token plan|pricing|seat/i.test(d)),
        "Public Token Plan seats on docs.geoff.ai (Basic → Turbo)",
      ],
      research: [
        { label: "Token Plan pricing", href: TOKEN_PLAN_URLS.pricing },
        { label: "Token Plan overview", href: TOKEN_PLAN_URLS.overview },
        ...((v.research || []).filter(
          (r) => !/token plan/i.test(r.label || ""),
        )),
      ],
    };
  });

  const dimensions = (catalog.dimensions || []).map((d) => {
    if (d.id !== "price") return d;
    const cheap = tokenPlan.plans?.[0];
    const rich = tokenPlan.plans?.[tokenPlan.plans.length - 1];
    return {
      ...d,
      scores: {
        ...d.scores,
        geoff:
          cheap && rich
            ? `${cheap.price} → ${rich.price}`
            : d.scores?.geoff,
      },
    };
  });

  return { ...catalog, vendors, dimensions };
}

export async function buildMarketPayload() {
  const geoffSnap = await runSniff().catch(() => null);
  const intel = await scrapeMarketIntel(geoffSnap);
  const tokenPlan = pickTokenPlan(geoffSnap);
  const catalog = enrichCatalog(marketCatalog, tokenPlan);

  const inventories = [
    {
      id: "geoff-pricing",
      title: "Geoff Token Plan (docs)",
      subtitle: tokenPlan.scraped
        ? "Sniffed from docs.geoff.ai"
        : "Published docs tables",
      items: (tokenPlan.plans || []).map(
        (p) =>
          `${p.name}: ${p.price} · ${p.tokens} tokens · ${p.rpm || "—"} RPM`,
      ),
      extras: [
        "shared monthly token pool",
        `source:${TOKEN_PLAN_URLS.pricing}`,
      ],
    },
    ...(intel.inventories || []),
  ];

  if (intel.live?.geoff) {
    intel.live.geoff.components = [
      ...(intel.live.geoff.components || []),
      {
        name: "Token Plan docs",
        status: tokenPlan.scraped ? "operational" : "published (fallback)",
      },
      {
        name: "Cheapest seat",
        status: tokenPlan.plans?.[0]
          ? `${tokenPlan.plans[0].name} ${tokenPlan.plans[0].price}`
          : "—",
      },
      {
        name: "Top seat",
        status: tokenPlan.plans?.[tokenPlan.plans.length - 1]
          ? `${tokenPlan.plans.at(-1).name} ${tokenPlan.plans.at(-1).price}`
          : "—",
      },
    ];
  }

  return {
    takenAt: new Date().toISOString(),
    catalog,
    tokenPlan,
    live: intel.live,
    scraped: intel.scraped,
    scorecard: intel.scorecard,
    manifesto: intel.manifesto,
    inventories,
    compareHints: [
      "Rule 1: if they won’t show capacity without a login, price in the opacity tax.",
      "Geoff now publishes Token Plan seats on docs.geoff.ai — CoverAI sniffs those tables live.",
      "Geoff column = live Stacknet sniff + docs pricing. Grok/OpenAI/Copilot menus = public docs + status boards.",
      "Seat products can look “all green” while the real horsepower stays behind plan gates.",
    ],
  };
}
