import { marketCatalog } from "./market-catalog.js";
import { runSniff } from "./sniffer.js";

const DEFAULT_TIMEOUT_MS = 12_000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "GeoffThermometer-Market/1.0",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, json, url };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      json: null,
      url,
      error: error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function summarizeStatuspage(payload, label) {
  if (!payload?.json?.status) {
    return {
      label,
      ok: false,
      indicator: "unknown",
      description: payload?.error || "Status unavailable",
      components: [],
      ms: payload?.ms ?? 0,
    };
  }
  const components = (payload.json.components || [])
    .filter((c) => !c.group)
    .slice(0, 12)
    .map((c) => ({
      name: c.name,
      status: c.status,
    }));
  return {
    label,
    ok: true,
    indicator: payload.json.status.indicator,
    description: payload.json.status.description,
    updatedAt: payload.json.page?.updated_at ?? null,
    components,
    ms: payload.ms,
  };
}

function geoffLiveFromSniff(snapshot) {
  const s = snapshot?.summary || {};
  const healthy = s.stacknetStatus === "healthy";
  return {
    label: "Geoff / Stacknet",
    ok: healthy,
    indicator: healthy ? "none" : "major",
    description: healthy
      ? `Operational · ${s.nodes ?? "?"} nodes · ${s.gpus ?? "?"} GPUs · ${s.models ?? "?"} models`
      : s.stacknetStatus || "Unknown",
    updatedAt: snapshot?.takenAt ?? null,
    components: [
      { name: "Stacknet version", status: s.stacknetVersion || "—" },
      { name: "Nodes online", status: String(s.nodes ?? "—") },
      { name: "GPUs", status: String(s.gpus ?? "—") },
      { name: "VRAM free", status: s.availableVramGb != null ? `${s.availableVramGb} GB` : "—" },
      { name: "API models", status: String(s.apiModels ?? "—") },
      { name: "Widgets", status: String(s.widgets ?? "—") },
      { name: "Capabilities", status: String(s.capabilities ?? "—") },
    ],
    ms: 0,
    vitals: s,
  };
}

export async function buildMarketPayload() {
  const [openai, github, geoffSnap] = await Promise.all([
    fetchJson("https://status.openai.com/api/v2/summary.json"),
    fetchJson("https://www.githubstatus.com/api/v2/summary.json"),
    runSniff().catch(() => null),
  ]);

  const live = {
    geoff: geoffLiveFromSniff(geoffSnap),
    grok: {
      label: "Grok / xAI",
      ok: false,
      indicator: "unknown",
      description:
        "No public Statuspage JSON found — check docs.x.ai / console.x.ai for incidents.",
      components: [],
      ms: 0,
      researchHint: "https://docs.x.ai/developers/models",
    },
    openai: summarizeStatuspage(openai, "OpenAI"),
    copilot: {
      ...summarizeStatuspage(github, "GitHub (hosts Copilot)"),
      note: "Copilot rides GitHub’s status surface; check components mentioning Copilot / git / API.",
    },
  };

  // Highlight Copilot-ish GitHub components when present.
  if (live.copilot.components?.length) {
    const interesting = live.copilot.components.filter((c) =>
      /copilot|git operations|api requests|codespaces|actions/i.test(c.name),
    );
    if (interesting.length) live.copilot.spotlight = interesting;
  }

  return {
    takenAt: new Date().toISOString(),
    catalog: marketCatalog,
    live,
    compareHints: [
      "Same questions for every vendor: What do they sell? What’s the flagship brain? How much context? How do you pay?",
      "Geoff column refreshes from live Stacknet sniff. OpenAI/GitHub columns refresh from public status JSON.",
      "Grok pricing/context comes from public xAI docs — re-check before production spend.",
    ],
  };
}
