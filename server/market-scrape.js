const DEFAULT_TIMEOUT_MS = 16_000;

async function fetchText(url, { accept = "text/html,application/json;q=0.9,*/*;q=0.8" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Accept: accept,
        "User-Agent": "CoverAI-ResearchDesk/1.1 (+local transparency scraper; public pages only)",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      text,
      json,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      text: "",
      json: null,
      url,
      error: error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function uniq(list) {
  return [...new Set(list.filter(Boolean))];
}

function extractMatches(text, re, { clean, limit = 80 } = {}) {
  if (!text) return [];
  const hits = [...text.matchAll(re)].map((m) => {
    const raw = m[1] || m[0];
    return clean ? clean(raw) : raw;
  });
  return uniq(hits).slice(0, limit);
}

function parseXaiModels(html) {
  const ids = extractMatches(html, /grok-[a-z0-9][a-z0-9._-]*/gi, {
    clean: (s) => s.toLowerCase().replace(/\.(png|jpg|jpeg|gif|svg|webp)$/i, ""),
    limit: 120,
  }).filter((id) => !/\.(com|localhost)$/i.test(id) && id.length < 80);

  // Prefer distinctive families for the dossier.
  const families = [
    "grok-4.5",
    "grok-4.3",
    "grok-4.20",
    "grok-4.1",
    "grok-4-fast",
    "grok-4.1-fast",
    "grok-code-fast",
    "grok-build",
    "grok-3",
    "grok-2",
  ];
  const featured = [];
  for (const fam of families) {
    const hit = ids.find((id) => id === fam || id.startsWith(fam));
    if (hit) featured.push(hit);
  }

  return {
    source: "https://docs.x.ai/developers/models",
    scrapedCount: ids.length,
    featured: featured.length ? featured : ids.slice(0, 12),
    sample: ids.slice(0, 40),
  };
}

function parseOpenAiModels(html) {
  const slugIds = extractMatches(
    html,
    /\b(?:gpt-[a-z0-9][a-z0-9._-]{1,40}|o[0-9](?:-[a-z0-9._-]{1,30})?)\b/gi,
    {
      clean: (s) => s.toLowerCase().replace(/\.(png|jpg|jpeg|gif|svg|webp)$/i, ""),
      limit: 160,
    },
  ).filter(
    (id) =>
      !/\.(com|localhost)$/i.test(id) &&
      !/^(gpt-docs|gpt-ui|gpt-staging|gpt-preview)/i.test(id) &&
      id.length < 48,
  );

  const displayNames = extractMatches(
    html,
    /(?:GPT-[0-9][A-Za-z0-9.+\- ]{0,32}|o[0-9](?:-[a-z0-9]+)*)/g,
    {
      clean: (s) => s.replace(/\s+/g, " ").trim(),
      limit: 80,
    },
  ).filter((s) => s.length > 2 && s.length < 48);

  const ids = uniq([...slugIds, ...displayNames.map((d) => d.toLowerCase().replace(/\s+/g, "-"))]);

  const featured = uniq([
    displayNames.find((x) => /5\.6\s*Sol/i.test(x)) || ids.find((x) => x.includes("5.6-sol")),
    displayNames.find((x) => /5\.6\s*Terra/i.test(x)) || ids.find((x) => x.includes("5.6-terra")),
    displayNames.find((x) => /5\.6\s*Luna/i.test(x)) || ids.find((x) => x.includes("5.6-luna")),
    displayNames.find((x) => /GPT-5\.5/i.test(x)),
    displayNames.find((x) => /GPT-5\.4/i.test(x)),
    ids.find((x) => x.includes("gpt-image")),
    ids.find((x) => x.includes("realtime")),
    ids.find((x) => /^o3/.test(x)),
  ]).filter(Boolean);

  return {
    source: "https://developers.openai.com/api/docs/models",
    scrapedCount: ids.length,
    featured: featured.length ? featured : ids.slice(0, 12),
    sample: uniq([...featured, ...ids]).slice(0, 40),
  };
}

function parseCopilotModels(html) {
  const names = extractMatches(
    html,
    /(?:GPT-[0-9][A-Za-z0-9.+\- ]{0,40}|Claude [A-Za-z0-9.+\- ()]{0,40}|Gemini [A-Za-z0-9.+\- ]{0,40}|Raptor mini|Kimi K[0-9.]+ Code)/g,
    {
      clean: (s) => s.replace(/\s+/g, " ").trim(),
      limit: 100,
    },
  ).filter((s) => s.length > 3 && s.length < 60 && !/<|>/.test(s));

  const byProvider = {
    openai: names.filter((n) => /^GPT/i.test(n)),
    anthropic: names.filter((n) => /^Claude/i.test(n)),
    google: names.filter((n) => /^Gemini/i.test(n)),
    other: names.filter((n) => /^(Raptor|Kimi)/i.test(n)),
  };

  return {
    source: "https://docs.github.com/en/copilot/reference/ai-models/supported-models",
    scrapedCount: names.length,
    featured: names.slice(0, 24),
    byProvider: {
      openai: byProvider.openai.slice(0, 20),
      anthropic: byProvider.anthropic.slice(0, 20),
      google: byProvider.google.slice(0, 20),
      other: byProvider.other.slice(0, 10),
    },
  };
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
      source: payload?.url,
    };
  }
  const components = (payload.json.components || [])
    .filter((c) => !c.group)
    .map((c) => ({ name: c.name, status: c.status }));
  return {
    label,
    ok: true,
    indicator: payload.json.status.indicator,
    description: payload.json.status.description,
    updatedAt: payload.json.page?.updated_at ?? null,
    components: components.slice(0, 20),
    ms: payload.ms,
    source: payload.url || payload.json.page?.url,
  };
}

function transparencyScorecard(scraped, live) {
  // Higher = more receipts in public. Not a moral score — a visibility score.
  const rows = [
    {
      id: "geoff",
      name: "Geoff / Stacknet",
      score: 92,
      grade: "A",
      posture: "Show your work",
      why: "Public health, network summary, /v1/models, widgets, capability list, deploy fingerprints — live, no login.",
      hides: ["Exact token meter UX still evolving", "Some app catalogs need auth"],
      reveals: [
        `${scraped.geoff?.vitals?.nodes ?? "?"} nodes / ${scraped.geoff?.vitals?.gpus ?? "?"} GPUs`,
        `${scraped.geoff?.apiModels?.length ?? 0} public API model cards`,
        `${scraped.geoff?.widgetCount ?? 0} widgets`,
        `${scraped.geoff?.vitals?.capabilities ?? "?"} capabilities`,
      ],
    },
    {
      id: "grok",
      name: "Grok / xAI",
      score: 58,
      grade: "C+",
      posture: "Docs when it helps sales",
      why: "Model IDs + pricing tables appear in docs, but no public Statuspage JSON and /v1/models wants credentials.",
      hides: ["Live capacity / queue opacity", "Auth wall on model list API", "No public incident JSON feed found"],
      reveals: [
        `${scraped.grok?.scrapedCount ?? 0} model id strings scraped from docs`,
        "Public token pricing on docs.x.ai",
        "Flagship context numbers published",
      ],
    },
    {
      id: "openai",
      name: "OpenAI",
      score: 64,
      grade: "B-",
      posture: "Polished black box with a status light",
      why: "Great status board + model marketing pages; pricing pages often gated/blocked to scrapers; rate limits & routing stay foggy.",
      hides: [
        "Hard capacity numbers",
        "Which shard you’re on",
        "Full pricing HTML often 403 to bots",
        "Deprecation treadmill fine print",
      ],
      reveals: [
        `Status: ${live.openai?.description || "—"}`,
        `${scraped.openai?.scrapedCount ?? 0} model-ish ids from docs HTML`,
        `${scraped.openaiIncidents?.length ?? 0} recent incidents visible`,
      ],
    },
    {
      id: "copilot",
      name: "GitHub Copilot",
      score: 61,
      grade: "C+",
      posture: "Seat product, multi-vendor mystery meat",
      why: "Supported-model list is public, but you’re buying a cockpit — not raw horsepower receipts. Plan gates hide half the menu.",
      hides: [
        "Per-model token economics inside the seat",
        "Which provider call actually ran",
        "Org policy defaults that quietly disable models",
      ],
      reveals: [
        `${scraped.copilot?.scrapedCount ?? 0} named models on docs page`,
        `Copilot component: ${live.copilot?.spotlight?.find((c) => /copilot$/i.test(c.name))?.status || "—"}`,
        "Providers: OpenAI + Anthropic + Google (+ extras)",
      ],
    },
  ];
  return rows;
}

function buildManifesto() {
  return {
    title: "Transparency is the coverage they don’t want to sell you",
    kicker: "Do your own research desk",
    paragraphs: [
      "Big AI shops love the appliance model: sealed box, monthly obedience, surprise deprecations, and a smile on the status page while the meter runs.",
      "Geoff’s pitch is uglier and better — modular strap-ons. Public network vitals. Model cards you can hit without a salesperson. Widgets and capabilities in the open. You can audit the stack like a mechanic, not a lemming in an upgrade queue.",
      "This page exists to put receipts next to marketing. If a carrier hides capacity, prices, or routing, that’s not “enterprise elegance.” That’s premium opacity.",
    ],
    bullets: [
      "Ask what is public without logging in.",
      "Ask what breaks when the brand page says green.",
      "Ask whether you can swap modules — or only renew the seat.",
      "Prefer stacks you can inspect over cults you must trust.",
    ],
  };
}

export async function scrapeMarketIntel(geoffSnapshot) {
  const [
    openaiStatus,
    openaiIncidents,
    githubStatus,
    githubComponents,
    xaiDocs,
    openaiDocs,
    copilotDocs,
  ] = await Promise.all([
    fetchText("https://status.openai.com/api/v2/summary.json", {
      accept: "application/json",
    }),
    fetchText("https://status.openai.com/api/v2/incidents.json", {
      accept: "application/json",
    }),
    fetchText("https://www.githubstatus.com/api/v2/summary.json", {
      accept: "application/json",
    }),
    fetchText("https://www.githubstatus.com/api/v2/components.json", {
      accept: "application/json",
    }),
    fetchText("https://docs.x.ai/developers/models"),
    fetchText("https://developers.openai.com/api/docs/models"),
    fetchText("https://docs.github.com/en/copilot/reference/ai-models/supported-models"),
  ]);

  const geoffModels = geoffSnapshot?.sources?.["stacknet.models"]?.models || [];
  const geoffWidgets = geoffSnapshot?.sources?.["stacknet.widgets"]?.widgets || [];
  const geoffNetwork = geoffSnapshot?.sources?.["stacknet.network"] || {};

  const scraped = {
    geoff: {
      source: "live Stacknet sniff",
      vitals: geoffSnapshot?.summary || {},
      apiModels: geoffModels.map((m) => ({
        id: m.id,
        name: m.displayName || m.id,
        capabilities: m.capabilities || [],
        ownedBy: m.ownedBy || null,
      })),
      widgetCount: geoffWidgets.length,
      widgets: geoffWidgets.slice(0, 16).map((w) => w.name || w.id),
      capabilities: geoffNetwork.capabilities || [],
      networkModels: geoffNetwork.models || [],
    },
    grok: parseXaiModels(xaiDocs.text),
    openai: parseOpenAiModels(openaiDocs.text),
    openaiIncidents: (openaiIncidents.json?.incidents || []).slice(0, 8).map((i) => ({
      name: i.name,
      status: i.status,
      impact: i.impact,
      updatedAt: i.updated_at,
    })),
    copilot: parseCopilotModels(copilotDocs.text),
    fetchMeta: {
      xaiDocs: { ok: xaiDocs.ok, status: xaiDocs.status, ms: xaiDocs.ms },
      openaiDocs: { ok: openaiDocs.ok, status: openaiDocs.status, ms: openaiDocs.ms },
      copilotDocs: { ok: copilotDocs.ok, status: copilotDocs.status, ms: copilotDocs.ms },
    },
  };

  const live = {
    geoff: {
      label: "Geoff / Stacknet",
      ok: scraped.geoff.vitals.stacknetStatus === "healthy",
      indicator: scraped.geoff.vitals.stacknetStatus === "healthy" ? "none" : "major",
      description:
        scraped.geoff.vitals.stacknetStatus === "healthy"
          ? `Operational · ${scraped.geoff.vitals.nodes ?? "?"} nodes · ${scraped.geoff.vitals.gpus ?? "?"} GPUs · ${scraped.geoff.vitals.models ?? "?"} models`
          : scraped.geoff.vitals.stacknetStatus || "Unknown",
      updatedAt: geoffSnapshot?.takenAt ?? null,
      components: [
        { name: "Stacknet version", status: scraped.geoff.vitals.stacknetVersion || "—" },
        { name: "Nodes online", status: String(scraped.geoff.vitals.nodes ?? "—") },
        { name: "GPUs", status: String(scraped.geoff.vitals.gpus ?? "—") },
        {
          name: "VRAM free",
          status:
            scraped.geoff.vitals.availableVramGb != null
              ? `${scraped.geoff.vitals.availableVramGb} GB`
              : "—",
        },
        { name: "API models", status: String(scraped.geoff.apiModels.length) },
        { name: "Widgets", status: String(scraped.geoff.widgetCount) },
        {
          name: "Capabilities",
          status: String(scraped.geoff.vitals.capabilities ?? scraped.geoff.capabilities.length),
        },
      ],
      vitals: scraped.geoff.vitals,
      source: "https://stacknet.magma-rpc.com/network/summary",
    },
    grok: {
      label: "Grok / xAI",
      ok: scraped.grok.scrapedCount > 0,
      indicator: scraped.grok.scrapedCount > 0 ? "none" : "unknown",
      description:
        scraped.grok.scrapedCount > 0
          ? `Docs scrape found ${scraped.grok.scrapedCount} model ids · no public Statuspage JSON`
          : "Docs scrape failed · no public Statuspage JSON",
      components: scraped.grok.featured.slice(0, 8).map((id) => ({
        name: id,
        status: "listed in docs",
      })),
      ms: xaiDocs.ms,
      source: scraped.grok.source,
      researchHint: scraped.grok.source,
    },
    openai: {
      ...summarizeStatuspage(openaiStatus, "OpenAI"),
      recentIncidents: scraped.openaiIncidents,
    },
    copilot: {
      ...summarizeStatuspage(githubStatus, "GitHub (hosts Copilot)"),
      note: "Copilot is a seat product on GitHub’s status board — green light ≠ transparent horsepower.",
    },
  };

  // Prefer components endpoint for Copilot spotlight when available.
  const ghComps = githubComponents.json?.components || live.copilot.components || [];
  const interesting = ghComps
    .filter((c) => /copilot|git operations|api requests|codespaces|actions|pages/i.test(c.name))
    .map((c) => ({ name: c.name, status: c.status }));
  if (interesting.length) live.copilot.spotlight = interesting;

  const scorecard = transparencyScorecard(scraped, live);

  return {
    scraped,
    live,
    scorecard,
    manifesto: buildManifesto(),
    inventories: [
      {
        id: "geoff",
        title: "Geoff live inventory",
        subtitle: "No login · sniffed now",
        items: scraped.geoff.apiModels.map(
          (m) => `${m.name} · ${(m.capabilities || []).slice(0, 4).join(", ")}`,
        ),
        extras: scraped.geoff.widgets.map((w) => `widget:${w}`),
      },
      {
        id: "grok",
        title: "Grok docs inventory",
        subtitle: `${scraped.grok.scrapedCount} ids scraped`,
        items: scraped.grok.sample,
        extras: [],
      },
      {
        id: "openai",
        title: "OpenAI docs inventory",
        subtitle: `${scraped.openai.scrapedCount} ids scraped`,
        items: scraped.openai.sample,
        extras: scraped.openaiIncidents.map((i) => `incident:${i.impact}:${i.name}`),
      },
      {
        id: "copilot",
        title: "Copilot supported models",
        subtitle: `${scraped.copilot.scrapedCount} names scraped`,
        items: scraped.copilot.featured,
        extras: [
          `openai:${scraped.copilot.byProvider.openai.length}`,
          `anthropic:${scraped.copilot.byProvider.anthropic.length}`,
          `google:${scraped.copilot.byProvider.google.length}`,
          `other:${scraped.copilot.byProvider.other.length}`,
        ],
      },
    ],
  };
}
