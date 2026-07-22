function listDiff(before = [], after = []) {
  const a = new Set(before);
  const b = new Set(after);
  const added = [...b].filter((x) => !a.has(x)).sort();
  const removed = [...a].filter((x) => !b.has(x)).sort();
  return { added, removed, changed: added.length + removed.length > 0 };
}

function event(partial) {
  return {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    heat: 1,
    ...partial,
  };
}

function heatFor(kind, magnitude = 1) {
  const base = {
    deploy: 8,
    version: 7,
    models: 6,
    apiModels: 6,
    widgets: 5,
    capabilities: 5,
    catalog: 5,
    network: 3,
    health: 4,
    treasury: 2,
    baseline: 1,
  }[kind] ?? 2;
  return Math.min(10, base + Math.max(0, magnitude - 1));
}

export function translate(previous, current) {
  if (!current) return [];
  if (!previous) {
    return [
      event({
        kind: "baseline",
        severity: "info",
        heat: heatFor("baseline"),
        title: "Thermometer online",
        summary: "Initial Geoff / Stacknet snapshot captured. Watching for updates.",
        details: {
          geoffBuildId: current.summary.geoffBuildId,
          stacknetVersion: current.summary.stacknetVersion,
          models: current.summary.models,
          nodes: current.summary.nodes,
        },
      }),
    ];
  }

  const events = [];
  const prev = previous.sources;
  const curr = current.sources;

  const prevBuild = prev["geoff.version"]?.buildId;
  const currBuild = curr["geoff.version"]?.buildId;
  if (prevBuild && currBuild && prevBuild !== currBuild) {
    events.push(
      event({
        kind: "deploy",
        severity: "high",
        heat: heatFor("deploy"),
        title: "geoff.ai shipped a new build",
        summary: `App buildId changed from ${short(prevBuild)} → ${short(currBuild)}.`,
        details: { from: prevBuild, to: currBuild },
      }),
    );
  }

  const prevDeploy = prev["geoff.deploy"]?.deployId;
  const currDeploy = curr["geoff.deploy"]?.deployId;
  if (prevDeploy && currDeploy && prevDeploy !== currDeploy) {
    events.push(
      event({
        kind: "deploy",
        severity: "high",
        heat: heatFor("deploy"),
        title: "Vercel deploy fingerprint changed",
        summary: `Deploy id ${prevDeploy} → ${currDeploy}.`,
        details: { from: prevDeploy, to: currDeploy },
      }),
    );
  }

  const prevChunk = prev["geoff.deploy"]?.chunks?.hash;
  const currChunk = curr["geoff.deploy"]?.chunks?.hash;
  if (prevChunk && currChunk && prevChunk !== currChunk) {
    events.push(
      event({
        kind: "deploy",
        severity: "medium",
        heat: heatFor("deploy", 0),
        title: "Frontend bundle set changed",
        summary: `Next.js chunk fingerprint ${prevChunk} → ${currChunk}.`,
        details: {
          from: prevChunk,
          to: currChunk,
          chunkCount: curr["geoff.deploy"]?.chunks?.count ?? null,
        },
      }),
    );
  }

  const prevVer = prev["stacknet.health"]?.version || prev["stacknet.root"]?.version;
  const currVer = curr["stacknet.health"]?.version || curr["stacknet.root"]?.version;
  if (prevVer && currVer && prevVer !== currVer) {
    events.push(
      event({
        kind: "version",
        severity: "high",
        heat: heatFor("version"),
        title: "Stacknet API version bumped",
        summary: `Stacknet moved ${prevVer} → ${currVer}.`,
        details: {
          from: prevVer,
          to: currVer,
          mcp: curr["stacknet.health"]?.remoteMcp ?? null,
        },
      }),
    );
  }

  const prevHealth = prev["stacknet.health"]?.statusText;
  const currHealth = curr["stacknet.health"]?.statusText;
  if (prevHealth && currHealth && prevHealth !== currHealth) {
    events.push(
      event({
        kind: "health",
        severity: currHealth === "healthy" ? "medium" : "high",
        heat: heatFor("health"),
        title: "Stacknet health status changed",
        summary: `Health ${prevHealth} → ${currHealth}.`,
        details: { from: prevHealth, to: currHealth },
      }),
    );
  }

  const modelDiff = listDiff(prev["stacknet.network"]?.models, curr["stacknet.network"]?.models);
  if (modelDiff.changed) {
    events.push(
      event({
        kind: "models",
        severity: "high",
        heat: heatFor("models", modelDiff.added.length + modelDiff.removed.length),
        title: "Network model catalog changed",
        summary: humanListChange("models", modelDiff),
        details: modelDiff,
      }),
    );
  }

  const capDiff = listDiff(
    prev["stacknet.network"]?.capabilities,
    curr["stacknet.network"]?.capabilities,
  );
  if (capDiff.changed) {
    events.push(
      event({
        kind: "capabilities",
        severity: "high",
        heat: heatFor("capabilities", capDiff.added.length + capDiff.removed.length),
        title: "Network capabilities changed",
        summary: humanListChange("capabilities", capDiff),
        details: {
          added: capDiff.added.map(prettyCapability),
          removed: capDiff.removed.map(prettyCapability),
          raw: capDiff,
        },
      }),
    );
  }

  const nodesPrev = prev["stacknet.network"]?.availableNodes;
  const nodesCurr = curr["stacknet.network"]?.availableNodes;
  if (isNumber(nodesPrev) && isNumber(nodesCurr) && nodesPrev !== nodesCurr) {
    events.push(
      event({
        kind: "network",
        severity: "medium",
        heat: heatFor("network", Math.abs(nodesCurr - nodesPrev)),
        title: "Available Stacknet nodes changed",
        summary: `Nodes online ${nodesPrev} → ${nodesCurr}.`,
        details: {
          from: nodesPrev,
          to: nodesCurr,
          gpus: curr["stacknet.network"]?.totalGpus ?? null,
          availableVramGb: curr["stacknet.network"]?.availableVramGb ?? null,
        },
      }),
    );
  }

  const gpusPrev = prev["stacknet.network"]?.totalGpus;
  const gpusCurr = curr["stacknet.network"]?.totalGpus;
  if (isNumber(gpusPrev) && isNumber(gpusCurr) && gpusPrev !== gpusCurr) {
    events.push(
      event({
        kind: "network",
        severity: "medium",
        heat: heatFor("network"),
        title: "GPU pool size changed",
        summary: `Total GPUs ${gpusPrev} → ${gpusCurr}.`,
        details: { from: gpusPrev, to: gpusCurr },
      }),
    );
  }

  if (!prev["geoff.catalog"]?.skipped && !curr["geoff.catalog"]?.skipped) {
    for (const [key, label] of [
      ["models", "Geoff catalog models"],
      ["tools", "Geoff catalog tools"],
      ["mcpTools", "Remote MCP tools"],
    ]) {
      const diff = listDiff(prev["geoff.catalog"]?.[key], curr["geoff.catalog"]?.[key]);
      if (diff.changed) {
        events.push(
          event({
            kind: "catalog",
            severity: "high",
            heat: heatFor("catalog", diff.added.length + diff.removed.length),
            title: `${label} updated`,
            summary: humanListChange(label.toLowerCase(), diff),
            details: diff,
          }),
        );
      }
    }
  }

  const solPrev = prev["stacknet.network"]?.treasury?.solPriceUsd;
  const solCurr = curr["stacknet.network"]?.treasury?.solPriceUsd;
  if (isNumber(solPrev) && isNumber(solCurr) && Math.abs(solCurr - solPrev) >= 1) {
    events.push(
      event({
        kind: "treasury",
        severity: "low",
        heat: heatFor("treasury"),
        title: "Treasury SOL price moved",
        summary: `SOL mark ${solPrev} → ${solCurr} USD.`,
        details: { from: solPrev, to: solCurr },
      }),
    );
  }

  const apiModelDiff = listDiff(prev["stacknet.models"]?.ids, curr["stacknet.models"]?.ids);
  if (apiModelDiff.changed) {
    events.push(
      event({
        kind: "apiModels",
        severity: "high",
        heat: heatFor("apiModels", apiModelDiff.added.length + apiModelDiff.removed.length),
        title: "OpenAI-compatible /v1/models changed",
        summary: humanListChange("API models", apiModelDiff),
        details: apiModelDiff,
      }),
    );
  } else if (prev["stacknet.models"]?.models && curr["stacknet.models"]?.models) {
    const capShifts = diffModelCapabilities(
      prev["stacknet.models"].models,
      curr["stacknet.models"].models,
    );
    if (capShifts.length) {
      events.push(
        event({
          kind: "apiModels",
          severity: "medium",
          heat: heatFor("apiModels", capShifts.length),
          title: "Model capability surface shifted",
          summary: capShifts
            .slice(0, 3)
            .map((s) => `${s.id}: ${s.summary}`)
            .join(" · "),
          details: { shifts: capShifts },
        }),
      );
    }
  }

  const widgetDiff = listDiff(prev["stacknet.widgets"]?.ids, curr["stacknet.widgets"]?.ids);
  if (widgetDiff.changed) {
    events.push(
      event({
        kind: "widgets",
        severity: "high",
        heat: heatFor("widgets", widgetDiff.added.length + widgetDiff.removed.length),
        title: "Stacknet widgets catalog changed",
        summary: humanListChange("widgets", widgetDiff),
        details: widgetDiff,
      }),
    );
  }

  const mcpPrev = prev["stacknet.health"]?.remoteMcp?.contract_id;
  const mcpCurr = curr["stacknet.health"]?.remoteMcp?.contract_id;
  if (mcpPrev && mcpCurr && mcpPrev !== mcpCurr) {
    events.push(
      event({
        kind: "version",
        severity: "high",
        heat: heatFor("version"),
        title: "Remote MCP contract updated",
        summary: `${mcpPrev} → ${mcpCurr}`,
        details: { from: mcpPrev, to: mcpCurr },
      }),
    );
  }

  return events;
}

function diffModelCapabilities(before = [], after = []) {
  const prevMap = new Map(before.map((m) => [m.id, m]));
  const shifts = [];
  for (const model of after) {
    const prevModel = prevMap.get(model.id);
    if (!prevModel) continue;
    const caps = listDiff(prevModel.capabilities, model.capabilities);
    const types = listDiff(prevModel.contentTypes, model.contentTypes);
    if (!caps.changed && !types.changed) continue;
    const bits = [];
    if (caps.added.length) bits.push(`+caps ${caps.added.join(", ")}`);
    if (caps.removed.length) bits.push(`-caps ${caps.removed.join(", ")}`);
    if (types.added.length) bits.push(`+types ${types.added.join(", ")}`);
    if (types.removed.length) bits.push(`-types ${types.removed.join(", ")}`);
    shifts.push({ id: model.id, summary: bits.join("; "), caps, types });
  }
  return shifts;
}

export function computeTemperature(events, latestSnapshot) {
  const now = Date.now();
  const recent = events.filter((e) => now - Date.parse(e.at) < 6 * 60 * 60 * 1000);
  const heatSum = recent.reduce((acc, e) => acc + (e.heat || 1), 0);
  const decayed = recent.reduce((acc, e) => {
    const ageH = (now - Date.parse(e.at)) / 3_600_000;
    return acc + (e.heat || 1) * Math.max(0.15, 1 - ageH / 6);
  }, 0);

  let temp = Math.min(100, Math.round(decayed * 6 + (heatSum > 0 ? 8 : 0)));

  // Baseline warmth when Stacknet is healthy and serving models.
  if (latestSnapshot?.summary?.stacknetStatus === "healthy") temp = Math.max(temp, 18);
  if ((latestSnapshot?.summary?.models ?? 0) > 0) temp = Math.max(temp, 22);
  if (recent.some((e) => e.kind === "deploy" || e.kind === "version")) {
    temp = Math.max(temp, 55);
  }

  return {
    value: temp,
    label: temperatureLabel(temp),
    recentEventCount: recent.length,
  };
}

function temperatureLabel(value) {
  if (value >= 80) return "blazing";
  if (value >= 55) return "hot";
  if (value >= 35) return "warming";
  if (value >= 18) return "steady";
  return "cool";
}

function humanListChange(noun, { added, removed }) {
  const parts = [];
  if (added.length) parts.push(`+${added.length} ${noun}: ${preview(added)}`);
  if (removed.length) parts.push(`-${removed.length} ${noun}: ${preview(removed)}`);
  return parts.join(" · ") || `No net ${noun} change`;
}

function preview(items, limit = 4) {
  if (items.length <= limit) return items.join(", ");
  return `${items.slice(0, limit).join(", ")} (+${items.length - limit} more)`;
}

function prettyCapability(cap) {
  const map = {
    "ai-prompt": "AI prompt",
    "chat-completion": "Chat completion",
    "coder-execute": "Coder execute",
    "coder-session": "Coder sessions",
    "coder-tool": "Coder tools",
    "e2b-code": "E2B code",
    "e2b-execute": "E2B execute",
    "hw:gpu": "GPU hardware",
    "image-edit-pipeline": "Image edit pipeline",
    "image-pipeline": "Image pipeline",
    image_editing: "Image editing",
    image_generation: "Image generation",
    "mcp-tool": "MCP tools",
    "media-analyze": "Media analyze",
    "media-generate": "Media generate",
    "media-orchestration": "Media orchestration",
    media_generation: "Media generation",
    "music-pipeline": "Music pipeline",
    "runtime:shell": "Shell runtime",
    "sequential-thinking": "Sequential thinking",
    "sizzle-video-pipeline": "Sizzle video pipeline",
    "skill-auto-execute": "Skill auto-execute",
    style_transfer: "Style transfer",
    "tts-stream": "TTS stream",
    "tts-synthesize": "TTS synthesize",
    video_generation: "Video generation",
    "voice-session": "Voice sessions",
  };
  return map[cap] || cap.replace(/[-_]/g, " ");
}

function short(id) {
  if (!id || id.length < 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export { prettyCapability };