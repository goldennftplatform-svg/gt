import { inferRank, normalizeEvents, prettyCapability, vibeForRank } from "./translator.js";

const CAPABILITY_GROUPS = [
  {
    id: "chat",
    label: "Chat & reasoning",
    blurb: "Talk, plan, and think through tasks.",
    match: [/chat/, /prompt/, /completion/, /reasoning/, /think/, /sequential/],
  },
  {
    id: "media",
    label: "Images & video",
    blurb: "Generate and edit pictures, clips, and visual styles.",
    match: [/image/, /video/, /sizzle/, /style/, /vision/, /media/],
  },
  {
    id: "audio",
    label: "Music & voice",
    blurb: "Make music, speech, and voice sessions.",
    match: [/music/, /tts/, /voice/, /audio/],
  },
  {
    id: "code",
    label: "Code & agents",
    blurb: "Run code, sandboxes, skills, and AI helpers.",
    match: [/coder/, /e2b/, /shell/, /skill/, /agent/, /mcp/, /runtime/],
  },
  {
    id: "infra",
    label: "Hardware & infra",
    blurb: "GPU power and low-level network capacity.",
    match: [/^hw:/, /gpu/, /embedding/, /embed/],
  },
];

const MODEL_ROLE = {
  magma: { role: "Creative powerhouse", use: "Music, media, agents, and multimodal making." },
  preview: { role: "Everyday multimodal", use: "Chat, code, images, and tool use." },
  pyro: { role: "Fast creative lane", use: "Quicker generation when you want speed." },
  "pyro:max": { role: "Max pyro lane", use: "Heavier pyro-class generation." },
  "stack-chat": { role: "Chat specialist", use: "Conversation-focused replies." },
  "stack-embed": { role: "Search memory", use: "Turns text into embeddings for retrieval." },
  "mom-preview": { role: "Mom preview", use: "Preview-tier experimental model." },
};

function modelRole(id = "") {
  if (MODEL_ROLE[id]) return { ...MODEL_ROLE[id], guessed: true };
  if (id.includes("voice"))
    return { role: "Voice-related id", use: "Named like voice — guessed from id only.", guessed: true };
  if (id.includes("vision"))
    return { role: "Vision-related id", use: "Named like vision — guessed from id only.", guessed: true };
  if (id.includes("media"))
    return { role: "Media-related id", use: "Named like media — guessed from id only.", guessed: true };
  if (id.includes("embed"))
    return { role: "Embedding-related id", use: "Named like embed — guessed from id only.", guessed: true };
  if (id.includes("chat"))
    return { role: "Chat-related id", use: "Named like chat — guessed from id only.", guessed: true };
  if (id.includes("pyro"))
    return { role: "Pyro family id", use: "Pyro family — role guessed from id only.", guessed: true };
  if (id.includes("magma"))
    return { role: "Magma family id", use: "Magma family — role guessed from id only.", guessed: true };
  return { role: "Network model", use: "Listed publicly — no role metadata published.", guessed: true };
}

function groupCapabilities(capabilities = []) {
  const remaining = new Set(capabilities);
  const groups = CAPABILITY_GROUPS.map((group) => {
    const items = capabilities.filter((cap) => {
      const hit = group.match.some((re) => re.test(cap));
      if (hit) remaining.delete(cap);
      return hit;
    });
    return {
      id: group.id,
      label: group.label,
      blurb: group.blurb,
      count: items.length,
      items: items.map((c) => ({ id: c, label: prettyCapability(c) })),
      on: items.length > 0,
    };
  });

  if (remaining.size) {
    groups.push({
      id: "other",
      label: "Other powers",
      blurb: "Extra network abilities that don’t fit the big buckets.",
      count: remaining.size,
      items: [...remaining].map((c) => ({ id: c, label: prettyCapability(c) })),
      on: true,
    });
  }

  return groups;
}

function healthStory(summary) {
  const healthy = summary.stacknetStatus === "healthy";
  if (!healthy) {
    return {
      tone: "warn",
      headline: "Network needs attention",
      sentence: "Stacknet isn’t reporting healthy right now — generation may be flaky.",
    };
  }

  const tempHint =
    summary._temperatureLabel === "blazing"
      ? "A real cluster of meaningful change just landed."
      : summary._temperatureLabel === "hot"
        ? "A spike showed up recently — check the feed."
        : summary._temperatureLabel === "warming"
          ? "Some measurable movement, nothing crazy."
          : "Ops look calm — routine telemetry only.";

  return {
    tone: "good",
    headline: "Geoff is online",
    sentence: `${tempHint} App + network are reachable.`,
  };
}

function pieceApp(summary) {
  const shipped = Boolean(summary.geoffBuildId);
  const deployFact = summary.geoffDeployId
    ? `Vercel deploy id present`
    : summary.chunkHash
      ? `No deploy id — asset fingerprint ${summary.chunkHash} (derived from JS chunk names)`
      : "Deploy id and asset fingerprint both missing";
  return {
    id: "app",
    title: "The app",
    plain: "geoff.ai — the website people use",
    status: shipped ? "Live build detected" : "Build unknown",
    tone: shipped ? "good" : "muted",
    meaning:
      "When buildId changes, geoff.ai shipped. Measured from public /api/version + HTML scrape.",
    facts: [
      deployFact,
      summary.chunkCount != null ? `${summary.chunkCount} frontend bundles fingerprint` : "Bundle count unknown",
    ],
  };
}

function pieceNetwork(summary) {
  const nodes = summary.nodes;
  const gpus = summary.gpus;
  const vramPct = summary.vramAvailablePct;
  let headroom = "VRAM headroom unknown";
  if (vramPct != null) {
    if (vramPct >= 55) headroom = "comfortable GPU memory free";
    else if (vramPct >= 30) headroom = "moderate GPU memory free";
    else headroom = "GPU memory running tight";
  }

  const nodeBit = nodes != null ? `${nodes} machines` : "machine count unknown";
  const gpuBit = gpus != null ? `${gpus} GPUs` : "GPU count unknown";

  return {
    id: "network",
    title: "The network",
    plain: "Stacknet — shared computers that run AI jobs",
    status: summary.stacknetStatus === "healthy" ? "Healthy" : summary.stacknetStatus || "Unknown",
    tone: summary.stacknetStatus === "healthy" ? "good" : "warn",
    meaning: `${nodeBit} online with ${gpuBit}. From public /network/summary — not estimated.`,
    facts: [
      summary.stacknetVersion ? `Software ${summary.stacknetVersion}` : "Version unknown",
      headroom,
      summary.averageLoad != null ? `Average load ${summary.averageLoad}` : "Load unknown",
    ],
  };
}

function pieceBrains(summary, models = []) {
  const featured = models.slice(0, 4).map((m) => {
    if (m.description) return `${m.displayName || m.id}: ${m.description.split(/(?<=\.)\s/)[0]}`;
    const role = modelRole(m.id);
    return `${m.displayName || m.id}: ${role.role} (guessed from id)`;
  });

  return {
    id: "brains",
    title: "The brains",
    plain: "Models — different AI personalities / skills",
    status: `${summary.apiModels ?? models.length ?? "—"} API models · ${summary.models ?? "—"} network ids`,
    tone: (summary.apiModels || summary.models) > 0 ? "good" : "muted",
    meaning:
      "Prefer live /v1/models descriptions. Role labels say guessed when the API doesn’t publish one.",
    facts: featured.length ? featured : ["No public model cards yet"],
  };
}

function pieceTools(summary, capabilityGroups = [], widgets = []) {
  const onGroups = capabilityGroups.filter((g) => g.on).map((g) => g.label);
  return {
    id: "tools",
    title: "The tools",
    plain: "Capabilities + widgets — what Geoff can actually do",
    status: `${summary.capabilities ?? 0} powers · ${summary.widgets ?? widgets.length ?? 0} widgets`,
    tone: (summary.capabilities || 0) > 0 ? "good" : "muted",
    meaning:
      "Capabilities are verbs (make image, run code, speak). Widgets are ready-made UI blocks agents can drop into answers.",
    facts: [
      onGroups.length ? `Active lanes: ${onGroups.join(", ")}` : "No capability lanes detected",
      summary.mcpContract
        ? "Agent plug-in contract (MCP) is published"
        : "No MCP contract reported",
    ],
  };
}

function explainTemperature(temperature) {
  const value = temperature?.value ?? 0;
  const label = temperature?.label ?? "flat";
  const map = {
    flat: "Flat — no ranked public diffs in the window (not padded).",
    cool: "Cool — tiny ranked movement only.",
    steady: "Steady — a few real ranked diffs.",
    warming: "Warming — measurable moves showed up.",
    hot: "Hot — spike-class public diffs recently.",
    blazing: "Blazing — crazy-class public diffs stacked.",
  };
  return {
    value,
    label,
    plain: map[label] || "Score from ranked public diffs only.",
    detail: temperature?.basis || "Not a thermometer sensor. No fake floors.",
  };
}

const RANK_WEIGHT = { crazy: 5, spike: 4, move: 3, note: 2, whisper: 1, info: 1 };

function sortEvents(events = []) {
  return [...events].sort((a, b) => {
    const ra = RANK_WEIGHT[inferRank(a)] || 0;
    const rb = RANK_WEIGHT[inferRank(b)] || 0;
    if (rb !== ra) return rb - ra;
    return Date.parse(b.at || 0) - Date.parse(a.at || 0);
  });
}

function humanModels(models = []) {
  return models.map((m) => {
    const role = modelRole(m.id);
    const skills = (m.capabilities || []).map(prettyCapability);
    const hasApiDesc = Boolean(m.description);
    return {
      ...m,
      role: hasApiDesc ? "From API description" : role.role,
      use: m.description || role.use,
      skillLabels: skills,
      roleGuessed: !hasApiDesc,
      glance: hasApiDesc
        ? m.description.split(/(?<=\.)\s/)[0]
        : `${role.role} (guessed) — ${(m.contentTypes || []).length ? (m.contentTypes || []).join(", ") : "types unknown"}`,
    };
  });
}

function humanWidgets(widgets = []) {
  return widgets.map((w) => ({
    ...w,
    glance: w.description
      ? w.description.split(/(?<=\.)\s/)[0]
      : "A reusable UI block agents can attach to answers.",
    audience: w.isSystem ? "Built-in" : "Community",
  }));
}

function humanEvents(events = []) {
  return sortEvents(normalizeEvents(events)).map((e) => {
    const rank = inferRank(e);
    return {
      ...e,
      rank,
      vibe: vibeForRank(rank),
      userTake: userTakeForEvent(e),
    };
  });
}

function userTakeForEvent(event) {
  switch (event.kind) {
    case "deploy":
      return "Geoff’s website/app code changed. New UI or behavior may appear.";
    case "version":
      return "The AI network software moved forward — under-the-hood upgrades.";
    case "models":
    case "apiModels":
      return "Available AI models changed. Some skills may appear or disappear.";
    case "capabilities":
      return "What the network can do shifted (new or removed powers).";
    case "widgets":
      return "Ready-made answer widgets changed.";
    case "network":
      return "Compute capacity changed — more/fewer machines or GPUs.";
    case "health":
      return "Network health status changed — check if generation still works.";
    case "catalog":
      return "Geoff’s internal tool/model catalog was updated.";
    case "treasury":
      return "On-chain treasury pricing moved; usually not user-facing.";
    case "baseline":
      return "First reading captured — this is the starting snapshot.";
    case "agent":
      return "Queue/load counters moved. Inferred busyness from public metrics only.";
    case "agentCluster":
      return "Several public diffs landed in one sniff — clustered, not invented.";
    default:
      return event.summary;
  }
}

/**
 * Compile a glanceable human briefing from a raw snapshot + temperature/events.
 */
export function compileBriefing({ latest, temperature, events = [], agentDesk = null } = {}) {
  if (!latest) {
    return {
      story: {
        tone: "muted",
        headline: "Waiting for first sniff",
        sentence: "Once live data arrives, this board explains what Geoff’s pieces mean.",
      },
      temperature: explainTemperature(temperature),
      pieces: [],
      capabilityGroups: [],
      models: [],
      widgets: [],
      events: [],
      agentDesk: null,
      coverage: null,
      glossary: glossary(),
    };
  }

  const summary = {
    ...latest.summary,
    _temperatureLabel: temperature?.label,
  };
  const models = humanModels(latest.sources?.["stacknet.models"]?.models || []);
  const widgets = humanWidgets(latest.sources?.["stacknet.widgets"]?.widgets || []);
  const capabilityGroups = groupCapabilities(
    latest.sources?.["stacknet.network"]?.capabilities || [],
  );
  const story = healthStory(summary);
  const coverage = buildCoverage(latest, summary);

  return {
    story,
    temperature: explainTemperature(temperature),
    coverage,
    pieces: [
      pieceApp(summary),
      pieceNetwork(summary),
      pieceBrains(summary, models),
      pieceTools(summary, capabilityGroups, widgets),
    ],
    capabilityGroups,
    models,
    widgets,
    events: humanEvents(events),
    agentDesk,
    networkModelGuide: (latest.sources?.["stacknet.network"]?.models || []).map((id) => ({
      id,
      ...modelRole(id),
    })),
    glossary: glossary(),
  };
}

function buildCoverage(latest, summary) {
  const rows = (summary.coverage || latest.summary?.coverage || []).map((row) => {
    let state = "fail";
    if (row.skipped) state = "skipped";
    else if (row.ok) state = "live";
    return {
      ...row,
      state,
      label: row.source,
    };
  });

  const catalogSkipped = Boolean(summary.catalogSkipped);
  const notes = [];
  if (catalogSkipped) {
    notes.push(
      summary.catalogSkipReason ||
        "Geoff /api/catalog/* is auth-gated — not measured without GEOFF_COOKIE / GEOFF_PREVIEW_CODE.",
    );
  }
  notes.push("Temperature + ranks are derived from public diffs — not a physical sensor.");
  notes.push("Model roles marked guessed when /v1/models has no description.");
  notes.push("Queue desk uses /health in_flight + /node task_count only.");

  return {
    live: summary.healthySources ?? rows.filter((r) => r.state === "live").length,
    skipped: summary.skippedSources ?? rows.filter((r) => r.state === "skipped").length,
    failed: summary.failedSources ?? rows.filter((r) => r.state === "fail").length,
    total: summary.totalSources ?? rows.length,
    rows,
    notes,
    catalogSkipped,
  };
}

function glossary() {
  return [
    {
      term: "Temperature",
      meaning: "Derived score from ranked public diffs over 72h. Not a sensor. No padded floors.",
    },
    {
      term: "Pump tape",
      meaning: "72h chart of real ranked updates + sampled in_flight. Heat = rank weights, not fake volume.",
    },
    {
      term: "Coverage",
      meaning: "Which public endpoints answered. Skipped = auth-gated / not shared. Failed = request error.",
    },
    {
      term: "Guessed role",
      meaning: "Model role inferred from the id string when /v1/models publishes no description.",
    },
    {
      term: "Stacknet",
      meaning: "Geoff’s shared compute network: nodes, GPUs, and model runtimes.",
    },
    {
      term: "Model",
      meaning: "An AI brain with a specialty (chat, music, vision, embeddings, etc.).",
    },
    {
      term: "Capability",
      meaning: "A verb the network supports — generate image, run code, speak, and so on.",
    },
    {
      term: "Widget",
      meaning: "A packaged UI card agents can attach to answers (charts, reports, etc.).",
    },
    {
      term: "MCP",
      meaning: "A plug-in contract so outside AI agents can call Stacknet tools safely.",
    },
    {
      term: "Build / deploy",
      meaning: "Proof the geoff.ai website shipped a new version.",
    },
    {
      term: "Rank",
      meaning: "Whisper → note → move → spike → crazy. Only spike/crazy float hard.",
    },
    {
      term: "Agent desk",
      meaning: "Inferred busyness from public in-flight / task / load counters + same-sniff clusters. Not private agent chat.",
    },
  ];
}
