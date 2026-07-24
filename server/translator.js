/**
 * Diff two sniff snapshots into plain-English events.
 * Ranks are dialed so routine noise stays quiet and only measurable spikes float.
 *
 * rank: whisper < note < move < spike < crazy
 */

const RANK = {
  whisper: { weight: 1, severity: "info", heat: 0 },
  note: { weight: 2, severity: "low", heat: 1 },
  move: { weight: 3, severity: "medium", heat: 2 },
  spike: { weight: 4, severity: "high", heat: 4 },
  crazy: { weight: 5, severity: "high", heat: 6 },
};

function listDiff(before = [], after = []) {
  const a = new Set(before);
  const b = new Set(after);
  const added = [...b].filter((x) => !a.has(x)).sort();
  const removed = [...a].filter((x) => !b.has(x)).sort();
  return { added, removed, changed: added.length + removed.length > 0 };
}

function event(partial) {
  const rank = partial.rank || "note";
  const meta = RANK[rank] || RANK.note;
  return {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    ...partial,
    rank,
    severity: partial.severity || meta.severity,
    heat: partial.heat ?? meta.heat,
  };
}

function rankForListChange(count) {
  if (count >= 8) return "crazy";
  if (count >= 5) return "spike";
  if (count >= 2) return "move";
  if (count >= 1) return "note";
  return "whisper";
}

/** Empty↔full catalog swaps are scrape flaps, not real product changes. */
function isScrapeFlap(prevList, currList, diff) {
  const prevN = Array.isArray(prevList) ? prevList.length : 0;
  const currN = Array.isArray(currList) ? currList.length : 0;
  if (!prevN || !currN) return true;
  const added = diff?.added?.length || 0;
  const removed = diff?.removed?.length || 0;
  // Entire menu appeared or vanished in one poll
  if (added === currN && removed === 0) return true;
  if (removed === prevN && added === 0) return true;
  if (added >= 8 && removed === 0) return true;
  if (removed >= 8 && added === 0) return true;
  if (added >= 8 && removed >= 8) return true;
  return false;
}

function isFlapEvent(e) {
  if (
    !["models", "apiModels", "widgets", "capabilities", "catalog"].includes(e.kind)
  ) {
    return false;
  }
  const added = e.details?.added?.length || e.details?.raw?.added?.length || 0;
  const removed = e.details?.removed?.length || e.details?.raw?.removed?.length || 0;
  // One-sided bulk appear/disappear = incomplete previous/current sniff
  if (removed === 0 && added >= 4) return true;
  if (added === 0 && removed >= 4) return true;
  if (added >= 8 && removed >= 8) return true;
  if (/\+\d{2,} (models|capabilities|widgets|powers|API models)/i.test(e.summary || "")) {
    return true;
  }
  if (/-\d{2,} (models|capabilities|widgets|powers|API models)/i.test(e.summary || "")) {
    return true;
  }
  return false;
}

const VIBE = {
  crazy: "Crazy",
  spike: "Spike",
  move: "Move",
  note: "Note",
  whisper: "Whisper",
};

/**
 * Always derive rank from kind/content.
 * Website deploys are common (Vercel) → Note. Spike/Crazy are rare.
 * Never trust legacy severity:high / "Big deal".
 */
export function inferRank(e = {}) {
  const blob = `${e.title || ""} ${e.summary || ""}`;

  // Explicit rare full-stack marker wins
  if (/full-stack ship/i.test(blob)) return "crazy";

  if (e.kind === "baseline" || e.kind === "treasury") return "whisper";
  if (e.kind === "agent") return "note";
  if (e.kind === "agentCluster") {
    if (/crazy|full-stack/i.test(blob)) return "crazy";
    if (/spike/i.test(blob)) return "spike";
    return "move";
  }
  if (e.kind === "deploy") {
    // Routine site ships stay quiet — not a parade
    return "note";
  }
  if (e.kind === "version") return /mcp|plug-in|contract/i.test(blob) ? "note" : "spike";
  if (e.kind === "health") {
    if (/unhealthy|degrad|down|fail/i.test(blob)) return "spike";
    return "note";
  }
  if (e.kind === "network") return "note";
  if (
    e.kind === "models" ||
    e.kind === "apiModels" ||
    e.kind === "widgets" ||
    e.kind === "capabilities" ||
    e.kind === "catalog"
  ) {
    const n =
      (e.details?.added?.length || 0) +
      (e.details?.removed?.length || 0) +
      (e.details?.raw?.added?.length || 0) +
      (e.details?.raw?.removed?.length || 0);
    if (n > 0) return rankForListChange(n);
    const m = blob.match(/\+(\d+)/);
    if (m) return rankForListChange(Number(m[1]));
    return "note";
  }
  if (e.severity === "high" || e.severity === "medium") return "note";
  if (e.severity === "low" || e.severity === "info") return "whisper";
  return "note";
}

export function vibeForRank(rank) {
  return VIBE[rank] || "Note";
}

export function normalizeEvent(e) {
  if (!e || typeof e !== "object") return e;
  const rank = inferRank(e);
  const meta = RANK[rank] || RANK.note;
  const heat =
    typeof e.heat === "number" && e.heat >= 7
      ? meta.heat
      : (e.heat ?? meta.heat);
  return {
    ...e,
    rank,
    severity: meta.severity,
    heat,
    vibe: vibeForRank(rank),
  };
}

function deployFingerprint(e) {
  const d = e.details || {};
  const to =
    d.to ||
    d.build?.to ||
    d.deploy?.to ||
    d.chunks?.to ||
    e.summary ||
    e.title ||
    "";
  const from =
    d.from ||
    d.build?.from ||
    d.deploy?.from ||
    d.chunks?.from ||
    "";
  return `${e.kind}|${from}|${to}|${(e.title || "").replace(/\s+/g, " ").slice(0, 48)}`;
}

/** Collapse legacy deploy triplets + repeated identical ship spam. */
export function dedupeDeployBursts(events = []) {
  const sorted = [...events].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  const used = new Set();
  const out = [];
  const seenFingerprints = new Set();

  for (const e of sorted) {
    if (!e?.id || used.has(e.id)) continue;
    if (e.kind !== "deploy") {
      // Collapse identical health/version/catalog spam
      if (["health", "version", "models", "apiModels", "widgets", "capabilities", "catalog"].includes(e.kind)) {
        const fp = deployFingerprint(e);
        if (seenFingerprints.has(fp)) {
          used.add(e.id);
          continue;
        }
        seenFingerprints.add(fp);
      }
      out.push(e);
      used.add(e.id);
      continue;
    }
    const t = Date.parse(e.at || 0);
    const siblings = sorted.filter(
      (o) =>
        o.kind === "deploy" &&
        o.id &&
        !used.has(o.id) &&
        Math.abs(Date.parse(o.at || 0) - t) < 120_000,
    );
    for (const s of siblings) used.add(s.id);
    const keep =
      siblings.find((s) => /shipped|build/i.test(s.title || "")) || siblings[0] || e;
    const coalesced = siblings.length > 1;
    const normalized = normalizeEvent({
      ...keep,
      title: coalesced ? "Geoff website shipped" : keep.title,
      summary: coalesced
        ? `Coalesced ${siblings.length} deploy signals from the same window: ${siblings
            .map((s) => s.title)
            .join(" · ")}`
        : keep.summary,
      details: {
        ...(keep.details || {}),
        coalesced: siblings.length,
        legacyIds: siblings.map((s) => s.id),
      },
    });
    const fp = deployFingerprint(normalized);
    if (seenFingerprints.has(fp)) continue;
    seenFingerprints.add(fp);
    out.push(normalized);
  }
  return out;
}

export function normalizeEvents(events = []) {
  return dedupeDeployBursts(events.filter((e) => !isFlapEvent(e)).map(normalizeEvent));
}

export function translate(previous, current) {
  if (!current) return [];
  if (!previous) {
    return [
      event({
        kind: "baseline",
        rank: "whisper",
        title: "First reading locked in",
        summary:
          "Captured a baseline of the app, network, models, and tools. Next sniffs will call out what changed — quietly unless something real moves.",
        details: {
          geoffBuildId: current.summary.geoffBuildId,
          stacknetVersion: current.summary.stacknetVersion,
          models: current.summary.models,
          nodes: current.summary.nodes,
          inFlight: current.summary.inFlight,
          taskCount: current.summary.taskCount,
        },
      }),
    ];
  }

  const events = [];
  const prev = previous.sources;
  const curr = current.sources;

  // --- Deploy: coalesce build + deployId + chunks into ONE event ---
  const prevBuild = prev["geoff.version"]?.buildId;
  const currBuild = curr["geoff.version"]?.buildId;
  const prevDeploy = prev["geoff.deploy"]?.deployId;
  const currDeploy = curr["geoff.deploy"]?.deployId;
  const prevChunk = prev["geoff.deploy"]?.chunks?.hash;
  const currChunk = curr["geoff.deploy"]?.chunks?.hash;
  const buildChanged = Boolean(prevBuild && currBuild && prevBuild !== currBuild);
  const deployChanged = Boolean(prevDeploy && currDeploy && prevDeploy !== currDeploy);
  const chunkChanged = Boolean(prevChunk && currChunk && prevChunk !== currChunk);

  if (buildChanged || deployChanged || chunkChanged) {
    const bits = [];
    if (buildChanged) bits.push(`build ${short(prevBuild)} → ${short(currBuild)}`);
    if (deployChanged) bits.push(`deploy ${short(prevDeploy)} → ${short(currDeploy)}`);
    if (chunkChanged) bits.push(`assets ${prevChunk} → ${currChunk}`);
    // Website ships are Notes — Vercel can roll often. Spike/Crazy only for rare full-stack.
    const rank = "note";
    events.push(
      event({
        kind: "deploy",
        rank,
        title: buildChanged || deployChanged ? "Geoff website shipped" : "Site assets refreshed",
        summary:
          buildChanged || deployChanged
            ? `Live app update detected (${bits.join("; ")}). Routine unless the network version moves too.`
            : `JS bundles changed (${bits.join("; ")}). Often a small UI tweak.`,
        details: {
          build: buildChanged ? { from: prevBuild, to: currBuild } : null,
          deploy: deployChanged ? { from: prevDeploy, to: currDeploy } : null,
          chunks: chunkChanged
            ? {
                from: prevChunk,
                to: currChunk,
                chunkCount: curr["geoff.deploy"]?.chunks?.count ?? null,
              }
            : null,
        },
      }),
    );
  }

  // --- Stacknet version + MCP contract: coalesce ---
  const prevVer = prev["stacknet.health"]?.version || prev["stacknet.root"]?.version;
  const currVer = curr["stacknet.health"]?.version || curr["stacknet.root"]?.version;
  const verChanged = Boolean(prevVer && currVer && prevVer !== currVer);
  const mcpPrev = prev["stacknet.health"]?.remoteMcp?.contract_id;
  const mcpCurr = curr["stacknet.health"]?.remoteMcp?.contract_id;
  const mcpChanged = Boolean(mcpPrev && mcpCurr && mcpPrev !== mcpCurr);

  if (verChanged || mcpChanged) {
    const bits = [];
    if (verChanged) bits.push(`${prevVer} → ${currVer}`);
    if (mcpChanged) bits.push(`MCP ${short(mcpPrev)} → ${short(mcpCurr)}`);
    events.push(
      event({
        kind: "version",
        rank: verChanged ? "spike" : "move",
        title: verChanged ? "AI network software upgraded" : "Agent plug-in contract updated",
        summary: verChanged
          ? `Stacknet moved ${bits.join("; ")}. Under-the-hood runtime change for generation and agents.`
          : `Outside AI agents may need the new MCP contract (${bits.join("; ")}).`,
        details: {
          version: verChanged ? { from: prevVer, to: currVer } : null,
          mcp: mcpChanged ? { from: mcpPrev, to: mcpCurr } : null,
        },
      }),
    );
  }

  // If website + network version both moved in the same sniff → that IS the rare crazy
  if (events.some((e) => e.kind === "deploy") && verChanged) {
    const deployEvt = events.find((e) => e.kind === "deploy");
    if (deployEvt) {
      deployEvt.rank = "crazy";
      deployEvt.severity = RANK.crazy.severity;
      deployEvt.heat = RANK.crazy.heat;
      deployEvt.vibe = vibeForRank("crazy");
      deployEvt.title = "Full-stack ship: app + network";
      deployEvt.summary = `${deployEvt.summary} Stacknet also moved ${prevVer} → ${currVer} in the same window.`;
    }
  }

  const prevHealth = prev["stacknet.health"]?.statusText;
  const currHealth = curr["stacknet.health"]?.statusText;
  if (prevHealth && currHealth && prevHealth !== currHealth) {
    const bad = currHealth !== "healthy";
    events.push(
      event({
        kind: "health",
        rank: bad ? "spike" : "note",
        title: bad ? "Network health degraded" : "Network health recovered",
        summary: `Status went ${prevHealth} → ${currHealth}.`,
        details: { from: prevHealth, to: currHealth },
      }),
    );
  }

  const prevModels = prev["stacknet.network"]?.models;
  const currModels = curr["stacknet.network"]?.models;
  const modelDiff = listDiff(prevModels, currModels);
  if (modelDiff.changed && !isScrapeFlap(prevModels, currModels, modelDiff)) {
    const n = modelDiff.added.length + modelDiff.removed.length;
    events.push(
      event({
        kind: "models",
        rank: rankForListChange(n),
        title: "Available AI models changed",
        summary: humanListChange("models", modelDiff),
        details: modelDiff,
      }),
    );
  }

  const prevCaps = prev["stacknet.network"]?.capabilities;
  const currCaps = curr["stacknet.network"]?.capabilities;
  const capDiff = listDiff(prevCaps, currCaps);
  if (capDiff.changed && !isScrapeFlap(prevCaps, currCaps, capDiff)) {
    const n = capDiff.added.length + capDiff.removed.length;
    events.push(
      event({
        kind: "capabilities",
        rank: rankForListChange(n),
        title: "What Geoff can do shifted",
        summary: humanListChange("powers", {
          added: capDiff.added.map(prettyCapability),
          removed: capDiff.removed.map(prettyCapability),
        }),
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
    const delta = Math.abs(nodesCurr - nodesPrev);
    events.push(
      event({
        kind: "network",
        rank: delta >= 3 ? "spike" : delta >= 2 ? "move" : "note",
        title: "Compute machines online changed",
        summary: `Live nodes ${nodesPrev} → ${nodesCurr}.`,
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
    const delta = Math.abs(gpusCurr - gpusPrev);
    events.push(
      event({
        kind: "network",
        rank: delta >= 2 ? "move" : "note",
        title: "GPU horsepower changed",
        summary: `GPUs available ${gpusPrev} → ${gpusCurr}.`,
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
      const prevList = prev["geoff.catalog"]?.[key];
      const currList = curr["geoff.catalog"]?.[key];
      const diff = listDiff(prevList, currList);
      if (diff.changed && !isScrapeFlap(prevList, currList, diff)) {
        const n = diff.added.length + diff.removed.length;
        events.push(
          event({
            kind: "catalog",
            rank: rankForListChange(n),
            title: `${label} updated`,
            summary: humanListChange(label.toLowerCase(), diff),
            details: diff,
          }),
        );
      }
    }
  }

  // SOL noise: ignore penny noise — require ≥5% or $5
  const solPrev = prev["stacknet.network"]?.treasury?.solPriceUsd;
  const solCurr = curr["stacknet.network"]?.treasury?.solPriceUsd;
  if (isNumber(solPrev) && isNumber(solCurr) && solPrev > 0) {
    const abs = Math.abs(solCurr - solPrev);
    const pct = abs / solPrev;
    if (abs >= 5 || pct >= 0.05) {
      events.push(
        event({
          kind: "treasury",
          rank: pct >= 0.1 ? "note" : "whisper",
          title: "Treasury SOL mark moved",
          summary: `SOL ${solPrev} → ${solCurr} USD (${(pct * 100).toFixed(1)}%).`,
          details: { from: solPrev, to: solCurr, pct },
        }),
      );
    }
  }

  const prevApiIds = prev["stacknet.models"]?.ids;
  const currApiIds = curr["stacknet.models"]?.ids;
  const apiModelDiff = listDiff(prevApiIds, currApiIds);
  if (apiModelDiff.changed && !isScrapeFlap(prevApiIds, currApiIds, apiModelDiff)) {
    const n = apiModelDiff.added.length + apiModelDiff.removed.length;
    events.push(
      event({
        kind: "apiModels",
        rank: rankForListChange(n),
        title: "Public model menu changed",
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
          rank: capShifts.length >= 3 ? "move" : "note",
          title: "Model capabilities shifted",
          summary: capShifts
            .slice(0, 3)
            .map((s) => `${s.id}: ${s.summary}`)
            .join(" · "),
          details: { shifts: capShifts },
        }),
      );
    }
  }

  const prevWidgetIds = prev["stacknet.widgets"]?.ids;
  const currWidgetIds = curr["stacknet.widgets"]?.ids;
  const widgetDiff = listDiff(prevWidgetIds, currWidgetIds);
  if (widgetDiff.changed && !isScrapeFlap(prevWidgetIds, currWidgetIds, widgetDiff)) {
    const n = widgetDiff.added.length + widgetDiff.removed.length;
    events.push(
      event({
        kind: "widgets",
        rank: rankForListChange(n),
        title: "Answer widgets catalog changed",
        summary: humanListChange("widgets", widgetDiff),
        details: widgetDiff,
      }),
    );
  }

  // Measurable agent / queue activity (not invented identity)
  const agentEvt = agentActivityEvent(previous, current);
  if (agentEvt) events.push(agentEvt);

  // Same-sniff surface cluster → labeled speculation (heat 0 so it doesn't double-count)
  const clusterEvt = agentClusterEvent(events);
  if (clusterEvt) events.push(clusterEvt);

  return events;
}

function agentActivityEvent(previous, current) {
  const prevFlight = previous.summary?.inFlight;
  const currFlight = current.summary?.inFlight;
  const maxFlight = current.summary?.maxInFlight ?? 512;
  const prevTasks = previous.summary?.taskCount ?? previous.sources?.["stacknet.node"]?.taskCount;
  const currTasks = current.summary?.taskCount ?? current.sources?.["stacknet.node"]?.taskCount;
  const prevLoad = previous.summary?.averageLoad;
  const currLoad = current.summary?.averageLoad;

  // Only emit on measurable edges — not every poll while the queue is non-zero
  const wokeUp = isNumber(prevFlight) && prevFlight === 0 && isNumber(currFlight) && currFlight > 0;
  const wentIdle = isNumber(prevFlight) && prevFlight > 0 && isNumber(currFlight) && currFlight === 0;
  const flightJump =
    isNumber(prevFlight) && isNumber(currFlight) && Math.abs(currFlight - prevFlight) >= 2;
  const taskJump = isNumber(prevTasks) && isNumber(currTasks) && currTasks !== prevTasks;
  const loadJump =
    isNumber(prevLoad) && isNumber(currLoad) && Math.abs(currLoad - prevLoad) >= 0.05;

  if (!wokeUp && !wentIdle && !flightJump && !taskJump && !loadJump) return null;

  const signals = [];
  if (isNumber(prevFlight) && isNumber(currFlight) && currFlight !== prevFlight) {
    signals.push(`in-flight ${prevFlight} → ${currFlight} (max ${maxFlight})`);
  } else if (isNumber(currFlight)) {
    signals.push(`in-flight ${currFlight}/${maxFlight}`);
  }
  if (taskJump) signals.push(`node tasks ${prevTasks} → ${currTasks}`);
  if (loadJump) signals.push(`avg load ${prevLoad} → ${currLoad}`);

  const heavy =
    (isNumber(currFlight) && maxFlight > 0 && currFlight / maxFlight >= 0.05) ||
    (isNumber(currFlight) && currFlight >= 8) ||
    (flightJump && Math.abs(currFlight - prevFlight) >= 8);

  let rank = "note";
  let title = "Queue metrics shifted";
  if (wokeUp) {
    title = "Agent lane woke up";
    rank = heavy ? "move" : "note";
  } else if (wentIdle) {
    title = "Agent lane went quiet";
    rank = "whisper";
  } else if (heavy) {
    title = "Agent lane looks busy";
    rank = "move";
  }

  return event({
    kind: "agent",
    rank,
    title,
    summary: `Measured from public Stacknet counters: ${signals.join(" · ")}. No private agent transcript — just queue/load telemetry.`,
    details: {
      inferred: true,
      inFlight: currFlight,
      maxInFlight: maxFlight,
      taskCount: currTasks ?? null,
      averageLoad: currLoad ?? null,
      signals,
    },
  });
}

function agentClusterEvent(events) {
  const surface = events.filter((e) =>
    ["deploy", "version", "models", "apiModels", "widgets", "capabilities", "catalog"].includes(
      e.kind,
    ),
  );
  if (surface.length < 2) return null;

  const hasCrazy = surface.some((e) => e.rank === "crazy");
  const hasSpike = surface.some((e) => e.rank === "spike");
  const rank = hasCrazy ? "crazy" : hasSpike ? "spike" : "move";

  const bullets = surface.map((e) => `${e.kind}: ${e.title}`);
  return event({
    kind: "agentCluster",
    rank,
    heat: 0, // narrative only — underlying events already carry the heat
    title:
      rank === "crazy"
        ? "Cluster drop — something big just landed"
        : rank === "spike"
          ? "Agent desk cluster"
          : "Same-sniff change cluster",
    summary: `This sniff saw ${surface.length} surface changes together. Inferred cluster (public diffs only): ${bullets.join(" · ")}`,
    details: {
      inferred: true,
      disclaimer:
        "Not claiming a named agent identity — clustering measurable public diffs that arrived in one sniff.",
      kinds: surface.map((e) => e.kind),
      titles: bullets,
    },
  });
}

/**
 * Live "agent desk" card from current counters + optional new events.
 * Always measurable; speculation is labeled.
 */
export function inferAgentDesk(latest, newEvents = []) {
  if (!latest) return null;
  const inFlight = latest.summary?.inFlight;
  const maxInFlight = latest.summary?.maxInFlight ?? 512;
  const taskCount = latest.summary?.taskCount ?? latest.sources?.["stacknet.node"]?.taskCount;
  const load = latest.summary?.averageLoad;
  const signals = [];

  if (isNumber(inFlight)) {
    signals.push({
      key: "in_flight",
      label: "In-flight jobs",
      value: `${inFlight} / ${maxInFlight}`,
      raw: inFlight,
    });
  }
  if (isNumber(taskCount)) {
    signals.push({
      key: "task_count",
      label: "Node task count",
      value: String(taskCount),
      raw: taskCount,
    });
  }
  if (isNumber(load)) {
    signals.push({
      key: "average_load",
      label: "Average load",
      value: String(load),
      raw: load,
    });
  }

  const surface = newEvents.filter((e) =>
    ["deploy", "version", "models", "apiModels", "widgets", "capabilities", "catalog"].includes(
      e.kind,
    ),
  );
  const clustered = surface.length >= 2;

  const busy = isNumber(inFlight) && inFlight > 0;
  if (!busy && !clustered) {
    return {
      status: "quiet",
      headline: "Agent lane quiet",
      sentence: "No in-flight jobs on the public health counter right now.",
      signals,
      cluster: [],
      disclaimer: "Inferred from public Stacknet/Geoff metrics only — no private agent logs.",
    };
  }

  let status = "watching";
  let headline = "Watching the queue";
  let sentence = "Counters are live; nothing clustered yet.";

  if (busy) {
    status = "busy";
    headline = "Agent lane busy";
    sentence = `${inFlight} job${inFlight === 1 ? "" : "s"} in flight (max ${maxInFlight}). That’s a real queue signal, not a vibe.`;
  }
  if (clustered) {
    status = busy ? "busy_cluster" : "cluster";
    headline = busy ? "Busy — and a cluster just landed" : "Cluster of public diffs";
    sentence = busy
      ? `${sentence} Same sniff also moved ${surface.length} surface signals.`
      : `${surface.length} surface changes arrived together in one sniff — clustered from measurable diffs.`;
  }

  return {
    status,
    headline,
    sentence,
    signals,
    cluster: surface.map((e) => ({
      kind: e.kind,
      rank: e.rank,
      title: e.title,
      summary: e.summary,
    })),
    disclaimer: "Inferred from public Stacknet/Geoff metrics only — no private agent logs.",
  };
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

export const TRACK_WINDOW_HOURS = 72;
const TRACK_WINDOW_MS = TRACK_WINDOW_HOURS * 60 * 60 * 1000;

export function computeTemperature(events, latestSnapshot) {
  const now = Date.now();
  const recent = events.filter((e) => now - Date.parse(e.at) < TRACK_WINDOW_MS);
  // Ignore whisper/baseline/zero-heat narrative clusters in the heat math
  const meaningful = recent.filter(
    (e) => (e.heat || 0) > 0 && e.kind !== "baseline" && e.kind !== "agentCluster",
  );

  const decayed = meaningful.reduce((acc, e) => {
    const ageH = (now - Date.parse(e.at)) / 3_600_000;
    const rankBoost = e.rank === "crazy" ? 1.25 : e.rank === "spike" ? 1.05 : 1;
    // Heat fades across the full 72h tape — recent still dominates
    return acc + (e.heat || 1) * rankBoost * Math.max(0.12, 1 - ageH / TRACK_WINDOW_HOURS);
  }, 0);

  let temp = Math.min(100, Math.round(decayed * 2.8));

  if (latestSnapshot?.summary?.stacknetStatus === "healthy") temp = Math.max(temp, 12);
  if ((latestSnapshot?.summary?.models ?? 0) > 0) temp = Math.max(temp, 16);

  // Only crazy/spike in the last 6h can force warmer bands
  const recentHot = recent.filter(
    (e) =>
      now - Date.parse(e.at) < 6 * 60 * 60 * 1000 &&
      e.kind !== "agentCluster" &&
      (e.heat || 0) > 0,
  );
  if (recentHot.some((e) => e.rank === "crazy")) temp = Math.max(temp, 58);
  else if (recentHot.some((e) => e.rank === "spike")) temp = Math.max(temp, 38);

  return {
    value: temp,
    label: temperatureLabel(temp),
    // Count must match the feed's 72h window (all ranked items), not just heat contributors
    recentEventCount: recent.length,
    trackWindowHours: TRACK_WINDOW_HOURS,
  };
}

function temperatureLabel(value) {
  if (value >= 75) return "blazing";
  if (value >= 50) return "hot";
  if (value >= 30) return "warming";
  if (value >= 14) return "steady";
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

export { prettyCapability, RANK };
