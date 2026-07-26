/**
 * Geoff Token Plan — public rates from docs.geoff.ai.
 * Scraped live when possible; fallback matches published tables (Jul 2026).
 */

export const TOKEN_PLAN_URLS = {
  overview: "https://docs.geoff.ai/token-plan/overview",
  pricing: "https://docs.geoff.ai/token-plan/pricing",
  usage: "https://docs.geoff.ai/token-plan/usage",
  billing: "https://geoff.ai/settings/billing",
};

/** Fallback if docs HTML cannot be parsed. Source: docs.geoff.ai/token-plan/* */
export const FALLBACK_TOKEN_PLAN = {
  model: "Unified monthly token balance across text, media, code, and tools",
  plans: [
    {
      id: "basic",
      name: "Basic",
      price: "$19/mo",
      tokens: "150M",
      rpm: "60",
      inputTpm: "100K",
      outputTpm: "50K",
      highlights: ["Chat + create media", "Code & files", "Web search", "E2E encryption"],
    },
    {
      id: "pro",
      name: "Pro",
      price: "$199/mo",
      tokens: "2B",
      rpm: "125",
      inputTpm: "500K",
      outputTpm: "200K",
      highlights: ["Everything in Basic", "Memory across chats", "Extended creation"],
    },
    {
      id: "max",
      name: "Max",
      price: "$499/mo",
      tokens: "7B",
      rpm: "200",
      inputTpm: "2M",
      outputTpm: "800K",
      highlights: ["Train your own models", "Mixture of Models (MOM)", "Max agent / research"],
    },
    {
      id: "turbo",
      name: "Turbo",
      price: "$999/mo",
      tokens: "20B",
      rpm: "450",
      inputTpm: "5M",
      outputTpm: "2M",
      highlights: ["Multi-agent mode", "Unfiltered model access"],
    },
  ],
  estimates: {
    note: "Approx. if you spend the whole monthly balance on one capability",
    perImageTokens: "~150K",
    images: { Basic: "~1,000", Pro: "~13,300", Max: "~46,000", Turbo: "~133,000" },
    videos5s: { Basic: "~30", Pro: "~400", Max: "~1,400", Turbo: "~4,000" },
    songs: { Basic: "~50", Pro: "~660", Max: "~2,300", Turbo: "~6,600" },
  },
};

const PLAN_ORDER = ["basic", "pro", "max", "turbo"];

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizePlanName(name) {
  const n = decodeEntities(name).toLowerCase();
  if (n.includes("turbo")) return "turbo";
  if (n.includes("max")) return "max";
  if (n.includes("pro")) return "pro";
  if (n.includes("basic")) return "basic";
  return n.replace(/[^a-z0-9]+/g, "") || null;
}

/**
 * Parse plan price/token rows and rate-limit rows from Mintlify SSR HTML.
 */
export function parseTokenPlanHtml(html) {
  const text = String(html || "");
  const byId = new Map();

  const planRow =
    /<strong>\s*(Basic|Pro|Max|Turbo)\s*<\/strong>\s*<\/td>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*>\s*(\$[^<]+?)\s*<\/td>/gi;
  for (const m of text.matchAll(planRow)) {
    const id = normalizePlanName(m[1]);
    if (!id) continue;
    const tokens = decodeEntities(m[2]);
    const price = decodeEntities(m[3]);
    // Prefer rows that look like token allotments (150M / 2B), not RPM digits
    if (!/[MBK]/i.test(tokens) && /^\d+$/.test(tokens)) continue;
    const prev = byId.get(id) || { id, name: m[1] };
    byId.set(id, { ...prev, name: m[1], tokens, price });
  }

  const limitRow =
    /<strong>\s*(Basic|Pro|Max|Turbo)\s*<\/strong>\s*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*<\/td>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>/gi;
  for (const m of text.matchAll(limitRow)) {
    const id = normalizePlanName(m[1]);
    if (!id) continue;
    const rpm = decodeEntities(m[2]);
    const inputTpm = decodeEntities(m[3]);
    const outputTpm = decodeEntities(m[4]);
    // Rate-limit rows: RPM is a plain integer; TPM has K/M or large numbers
    if (!/^\d+$/.test(rpm.replace(/,/g, ""))) continue;
    const prev = byId.get(id) || { id, name: m[1] };
    byId.set(id, { ...prev, name: m[1], rpm, inputTpm, outputTpm });
  }

  const plans = PLAN_ORDER.map((id) => {
    const scraped = byId.get(id);
    const fallback = FALLBACK_TOKEN_PLAN.plans.find((p) => p.id === id);
    if (!scraped && !fallback) return null;
    return {
      id,
      name: scraped?.name || fallback.name,
      price: scraped?.price || fallback.price,
      tokens: scraped?.tokens || fallback.tokens,
      rpm: scraped?.rpm || fallback.rpm,
      inputTpm: scraped?.inputTpm || fallback.inputTpm,
      outputTpm: scraped?.outputTpm || fallback.outputTpm,
      highlights: fallback?.highlights || [],
    };
  }).filter(Boolean);

  return {
    plans,
    model: FALLBACK_TOKEN_PLAN.model,
    estimates: FALLBACK_TOKEN_PLAN.estimates,
  };
}

export function fingerprintTokenPlan(plan) {
  const payload = (plan?.plans || []).map((p) =>
    [p.id, p.price, p.tokens, p.rpm, p.inputTpm, p.outputTpm].join("|"),
  );
  return payload.join("::");
}
