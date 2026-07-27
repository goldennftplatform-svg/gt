/**
 * Geoff Token Plan — public rates from docs.geoff.ai.
 * Scraped live when possible; fallback matches published tables.
 */

export const TOKEN_PLAN_URLS = {
  overview: "https://docs.geoff.ai/token-plan/overview",
  pricing: "https://docs.geoff.ai/token-plan/pricing",
  usage: "https://docs.geoff.ai/token-plan/usage",
  billing: "https://geoff.ai/settings/billing",
};

const PLAN_ORDER = ["basic", "pro", "max", "turbo"];

/** Feature matrix from docs.geoff.ai/token-plan/overview */
export const FEATURE_MATRIX = [
  { id: "chat", label: "Chat · web, iOS, Android, desktop", levels: ["yes", "yes", "yes", "yes"] },
  { id: "media", label: "Music, video & image creation", levels: ["yes", "yes", "yes", "yes"] },
  { id: "code", label: "Code gen + data viz", levels: ["yes", "yes", "yes", "yes"] },
  { id: "content", label: "Write, edit & create content", levels: ["yes", "yes", "yes", "yes"] },
  { id: "analyze", label: "Analyze text & images", levels: ["yes", "yes", "yes", "yes"] },
  { id: "search", label: "Web search", levels: ["yes", "yes", "yes", "yes"] },
  { id: "files", label: "Files + code execution", levels: ["yes", "yes", "yes", "yes"] },
  { id: "think", label: "Extended thinking", levels: ["yes", "yes", "yes", "yes"] },
  { id: "e2e", label: "End-to-end encryption", levels: ["yes", "yes", "yes", "yes"] },
  { id: "memory", label: "Memory across conversations", levels: ["no", "yes", "yes", "yes"] },
  { id: "create+", label: "Extended creation abilities", levels: ["no", "yes", "yes", "yes"] },
  { id: "train", label: "Train your own models", levels: ["no", "no", "yes", "yes"] },
  { id: "mom", label: "Mixture of Models (MoM)", levels: ["no", "no", "yes", "yes"] },
  { id: "agent", label: "Max deep research & agent mode", levels: ["no", "no", "yes", "yes"] },
  { id: "context", label: "Maximum memory & context", levels: ["no", "no", "yes", "yes"] },
  { id: "multi", label: "Multi-agent mode", levels: ["no", "no", "no", "yes"] },
  { id: "unfiltered", label: "Unfiltered model access", levels: ["no", "no", "no", "yes"] },
];

/** Fallback if docs HTML cannot be parsed. */
export const FALLBACK_TOKEN_PLAN = {
  model:
    "One monthly token pool. Shared across text, speech, video, image, music, code, and files — no per-modality nickel-and-dime.",
  plans: [
    {
      id: "basic",
      name: "Basic",
      price: "$19/mo",
      priceNum: 19,
      tokens: "150M",
      rpm: "60",
      inputTpm: "100K",
      outputTpm: "50K",
      badge: "Start",
      pitch: "Full multimodal stack at coffee-money.",
      why: "Chat + music + video + image + code — unlocked at $19.",
    },
    {
      id: "pro",
      name: "Pro",
      price: "$199/mo",
      priceNum: 199,
      tokens: "2B",
      rpm: "125",
      inputTpm: "500K",
      outputTpm: "200K",
      badge: "Daily",
      pitch: "~13× the images. Memory that sticks.",
      why: "The daily driver when Basic runs dry.",
    },
    {
      id: "max",
      name: "Max",
      price: "$499/mo",
      priceNum: 499,
      tokens: "7B",
      rpm: "200",
      inputTpm: "2M",
      outputTpm: "800K",
      badge: "Power",
      highlighted: true,
      pitch: "MoM + train-your-own. The Geoff edge.",
      why: "Where Geoff stops being “another chat app.”",
    },
    {
      id: "turbo",
      name: "Turbo",
      price: "$999/mo",
      priceNum: 999,
      tokens: "20B",
      rpm: "450",
      inputTpm: "5M",
      outputTpm: "2M",
      badge: "All gas",
      pitch: "Multi-agent + unfiltered. Ceiling removed.",
      why: "For shops that print, don’t dabble.",
    },
  ],
  estimates: {
    note: "If you burn the whole monthly pool on one lane (docs estimate · ~150K tokens/image)",
    perImageTokens: "~150K",
    nsfwNote: "Unfiltered / NSFW requests use 10× tokens",
    images: { basic: "~1,000", pro: "~13,300", max: "~46,000", turbo: "~133,000" },
    videos5s: { basic: "~30", pro: "~400", max: "~1,400", turbo: "~4,000" },
    songs: { basic: "~50", pro: "~660", max: "~2,300", turbo: "~6,600" },
  },
  wins: [
    {
      k: "One pool",
      v: "Text → video → music → code share one balance. Corps sell five meters.",
    },
    {
      k: "$19 multimodal",
      v: "Basic already includes music, video, images, code — not an enterprise upsell.",
    },
    {
      k: "Published sheet",
      v: "Seats, RPM/TPM, and yield estimates on docs.geoff.ai. Receipts, not vibes.",
    },
    {
      k: "MoM unlock",
      v: "Max/Turbo open Mixture of Models + train-your-own — the Geoff differentiator.",
    },
  ],
};

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

function parseLevel(cell) {
  const t = decodeEntities(cell).toLowerCase();
  if (!t || t === "—" || t === "-" || t === "no" || t === "n") return "no";
  if (t === "yes" || t === "✓" || t === "✔") return "yes";
  return t;
}

/**
 * Parse plan price/token rows, rate limits, yields, and feature matrix from Mintlify SSR HTML.
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
    if (!/^\d+$/.test(rpm.replace(/,/g, ""))) continue;
    const prev = byId.get(id) || { id, name: m[1] };
    byId.set(id, { ...prev, name: m[1], rpm, inputTpm, outputTpm });
  }

  // Yield tables: Plan | Tokens | Images/Videos/Songs
  const yieldRow =
    /<strong>\s*(Basic|Pro|Max|Turbo)\s*<\/strong>\s*<\/td>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*>\s*(~?[\d,]+)\s*<\/td>/gi;
  const yieldHits = { images: {}, videos5s: {}, songs: {} };
  const yieldBuckets = [];
  for (const m of text.matchAll(yieldRow)) {
    const id = normalizePlanName(m[1]);
    const mid = decodeEntities(m[2]);
    const val = decodeEntities(m[3]);
    if (!id || !/~/.test(val)) continue;
    // Skip if mid looks like RPM (plain int without M/B)
    if (/^\d+$/.test(mid.replace(/,/g, ""))) continue;
    yieldBuckets.push({ id, val });
  }
  // Docs order: images table, then videos, then songs — 4 plans each
  const ids = PLAN_ORDER;
  if (yieldBuckets.length >= 12) {
    ids.forEach((id, i) => {
      yieldHits.images[id] = yieldBuckets[i]?.val;
      yieldHits.videos5s[id] = yieldBuckets[i + 4]?.val;
      yieldHits.songs[id] = yieldBuckets[i + 8]?.val;
    });
  }

  const plans = PLAN_ORDER.map((id) => {
    const scraped = byId.get(id);
    const fallback = FALLBACK_TOKEN_PLAN.plans.find((p) => p.id === id);
    if (!scraped && !fallback) return null;
    return {
      ...fallback,
      id,
      name: scraped?.name || fallback.name,
      price: scraped?.price || fallback.price,
      tokens: scraped?.tokens || fallback.tokens,
      rpm: scraped?.rpm || fallback.rpm,
      inputTpm: scraped?.inputTpm || fallback.inputTpm,
      outputTpm: scraped?.outputTpm || fallback.outputTpm,
      images: yieldHits.images[id] || FALLBACK_TOKEN_PLAN.estimates.images[id],
      videos5s: yieldHits.videos5s[id] || FALLBACK_TOKEN_PLAN.estimates.videos5s[id],
      songs: yieldHits.songs[id] || FALLBACK_TOKEN_PLAN.estimates.songs[id],
    };
  }).filter(Boolean);

  const estimates = {
    ...FALLBACK_TOKEN_PLAN.estimates,
    images: { ...FALLBACK_TOKEN_PLAN.estimates.images, ...yieldHits.images },
    videos5s: { ...FALLBACK_TOKEN_PLAN.estimates.videos5s, ...yieldHits.videos5s },
    songs: { ...FALLBACK_TOKEN_PLAN.estimates.songs, ...yieldHits.songs },
  };

  return {
    plans,
    model: FALLBACK_TOKEN_PLAN.model,
    estimates,
    matrix: FEATURE_MATRIX,
    wins: FALLBACK_TOKEN_PLAN.wins,
  };
}

/** Build the glanceable Apple-style comparison sheet payload. */
export function buildPlanSheet(plan) {
  const plans = (plan?.plans || FALLBACK_TOKEN_PLAN.plans).map((p) => {
    const fb = FALLBACK_TOKEN_PLAN.plans.find((x) => x.id === p.id) || {};
    return {
      ...fb,
      ...p,
      images: p.images || plan?.estimates?.images?.[p.id] || fb.images,
      videos5s: p.videos5s || plan?.estimates?.videos5s?.[p.id] || fb.videos5s,
      songs: p.songs || plan?.estimates?.songs?.[p.id] || fb.songs,
    };
  });

  const matrix = plan?.matrix || FEATURE_MATRIX;
  const wins = plan?.wins || FALLBACK_TOKEN_PLAN.wins;
  const estimates = plan?.estimates || FALLBACK_TOKEN_PLAN.estimates;

  // Compact “everyone gets” vs “unlocks at” for the sheet header story
  const everyone = matrix.filter((r) => r.levels.every((l) => l === "yes")).map((r) => r.label);
  const unlocks = [
    { at: "Pro+", label: "Memory + extended creation" },
    { at: "Max+", label: "MoM · train-your-own · max agents" },
    { at: "Turbo", label: "Multi-agent · unfiltered" },
  ];

  return {
    model: plan?.model || FALLBACK_TOKEN_PLAN.model,
    plans,
    matrix,
    wins,
    estimates,
    everyone: everyone.slice(0, 6),
    unlocks,
    headline: "Geoff Token Plan",
    subhead: "Apple-simple sheet. One pool. Every modality. Public numbers.",
    kicker: "Value sheet · docs.geoff.ai",
  };
}

export function fingerprintTokenPlan(plan) {
  const payload = (plan?.plans || []).map((p) =>
    [p.id, p.price, p.tokens, p.rpm, p.inputTpm, p.outputTpm].join("|"),
  );
  return payload.join("::");
}
