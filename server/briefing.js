import { prettyCapability } from "./translator.js";

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
  if (MODEL_ROLE[id]) return MODEL_ROLE[id];
  if (id.includes("voice")) return { role: "Voice model", use: "Speech and spoken sessions." };
  if (id.includes("vision")) return { role: "Vision model", use: "Understands images and visual input." };
  if (id.includes("media")) return { role: "Media model", use: "Generates or orchestrates media." };
  if (id.includes("embed")) return { role: "Embedding model", use: "Indexes meaning for search." };
  if (id.includes("chat")) return { role: "Chat model", use: "Conversation and instruction following." };
  if (id.includes("pyro")) return { role: "Pyro family", use: "Creative generation lane." };
  if (id.includes("magma")) return { role: "Magma family", use: "High-end creative / agent work." };
  return { role: "Network model", use: "Available on the Geoff compute network." };
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
      ? "Lots of change just landed."
      : summary._temperatureLabel === "hot"
        ? "Things are moving quickly."
        : summary._temperatureLabel === "warming"
          ? "Some fresh movement detected."
          : "Operations look calm.";

  return {
    tone: "good",
    headline: "Geoff is online and cooking",
    sentence: `${tempHint} App + network are reachable.`,
  };
}

function pieceApp(summary) {
  const shipped = Boolean(summary.geoffBuildId);
  return {
    id: "app",
    title: "The app",
    plain: "geoff.ai — the website people use",
    status: shipped ? "Live build detected" : "Build unknown",
    tone: shipped ? "good" : "muted",
    meaning:
      "When this changes, Geoff shipped new UI or product code. Users may see new features without a store update.",
    facts: [
      summary.geoffDeployId ? "Fresh web deploy fingerprint present" : "Deploy fingerprint missing",
      summary.chunkCount != null ? `${summary.chunkCount} frontend bundles loaded` : "Bundle count unknown",
    ],
  };
}

function pieceNetwork(summary) {
  const nodes = summary.nodes ?? 0;
  const gpus = summary.gpus ?? 0;
  const vramPct = summary.vramAvailablePct;
  let headroom = "unknown headroom";
  if (vramPct != null) {
    if (vramPct >= 55) headroom = "comfortable GPU memory free";
    else if (vramPct >= 30) headroom = "moderate GPU memory free";
    else headroom = "GPU memory running tight";
  }

  return {
    id: "network",
    title: "The network",
    plain: "Stacknet — shared computers that run AI jobs",
    status: summary.stacknetStatus === "healthy" ? "Healthy" : summary.stacknetStatus || "Unknown",
    tone: summary.stacknetStatus === "healthy" ? "good" : "warn",
    meaning: `${nodes} machines online with ${gpus} GPUs. This is the farm that actually generates images, music, video, and agent work.`,
    facts: [
      summary.stacknetVersion ? `Software ${summary.stacknetVersion}` : "Version unknown",
      headroom,
      summary.averageLoad != null ? `Average load ${summary.averageLoad}` : "Load unknown",
    ],
  };
}

function pieceBrains(summary, models = []) {
  const featured = models.slice(0, 4).map((m) => {
    const role = modelRole(m.id);
    return `${m.displayName || m.id}: ${role.role}`;
  });

  return {
    id: "brains",
    title: "The brains",
    plain: "Models — different AI personalities / skills",
    status: `${summary.apiModels ?? models.length ?? 0} API models · ${summary.models ?? 0} network ids`,
    tone: (summary.apiModels || summary.models) > 0 ? "good" : "muted",
    meaning:
      "Think of models as specialist workers. Magma leans creative/media; chat models talk; embed models help search; voice/vision handle senses.",
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
  const label = temperature?.label ?? "cool";
  const map = {
    cool: "Quiet — little has changed lately.",
    steady: "Normal ops — network is up, no big storms.",
    warming: "Movement — something noteworthy changed recently.",
    hot: "Active — deploys or catalog shifts are landing.",
    blazing: "Very active — multiple meaningful updates in a short window.",
  };
  return {
    value,
    label,
    plain: map[label] || "Activity score from recent translated updates.",
    detail:
      value >= 55
        ? "Worth checking the update feed — users may notice new behavior."
        : "Glance the pieces below; nothing urgent unless health turns red.",
  };
}

function humanModels(models = []) {
  return models.map((m) => {
    const role = modelRole(m.id);
    const skills = (m.capabilities || []).map(prettyCapability);
    return {
      ...m,
      role: role.role,
      use: m.description || role.use,
      skillLabels: skills,
      glance: `${role.role} — ${(m.contentTypes || []).length ? (m.contentTypes || []).join(", ") : "general"}`,
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
  return events.map((e) => ({
    ...e,
    vibe:
      e.severity === "high"
        ? "Big deal"
        : e.severity === "medium"
          ? "Notable"
          : e.severity === "low"
            ? "Minor"
            : "FYI",
    userTake: userTakeForEvent(e),
  }));
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
    default:
      return event.summary;
  }
}

/**
 * Compile a glanceable human briefing from a raw snapshot + temperature/events.
 */
export function compileBriefing({ latest, temperature, events = [] } = {}) {
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

  return {
    story,
    temperature: explainTemperature(temperature),
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
    networkModelGuide: (latest.sources?.["stacknet.network"]?.models || []).map((id) => ({
      id,
      ...modelRole(id),
    })),
    glossary: glossary(),
  };
}

function glossary() {
  return [
    {
      term: "Temperature",
      meaning: "How much meaningful change we’ve seen lately — not room temperature.",
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
  ];
}
