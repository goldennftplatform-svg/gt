import { icon } from "./icons.js";

const STORAGE_KEY = "geoff-thermometer-v5";
const RANK_WEIGHT = { crazy: 5, spike: 4, move: 3, note: 2, whisper: 1 };
const VIBE = { crazy: "Crazy", spike: "Spike", move: "Move", note: "Note", whisper: "Whisper" };
const TRACK_HOURS = 72;
const TRACK_MS = TRACK_HOURS * 60 * 60 * 1000;
const MAX_MEMORY_EVENTS = 2000;

/** Website deploys = Note. Spike/Crazy are rare. Never trust "Big deal". */
function inferRank(e = {}) {
  const blob = `${e.title || ""} ${e.summary || ""}`;
  if (/full-stack ship/i.test(blob)) return "crazy";
  if (e.kind === "baseline" || e.kind === "treasury") return "whisper";
  if (e.kind === "agent") return "note";
  if (e.kind === "agentCluster") {
    if (/crazy|full-stack/i.test(blob)) return "crazy";
    if (/spike/i.test(blob)) return "spike";
    return "move";
  }
  if (e.kind === "deploy") return "note";
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
    if (n >= 8) return "crazy";
    if (n >= 5) return "spike";
    if (n >= 2) return "move";
    if (n >= 1) return "note";
    const m = blob.match(/\+(\d+)/);
    if (m) {
      const c = Number(m[1]);
      if (c >= 8) return "crazy";
      if (c >= 5) return "spike";
      if (c >= 2) return "move";
      return "note";
    }
    return "note";
  }
  if (e.severity === "high" || e.severity === "medium") return "note";
  if (e.severity === "low" || e.severity === "info") return "whisper";
  return "note";
}

function displayVibe(e) {
  // Always derive from rank. Never paint legacy "Big deal" / "Notable" even if server sends them.
  return VIBE[inferRank(e)] || "Note";
}

function deployFingerprint(e) {
  const d = e.details || {};
  const to = d.to || d.build?.to || d.deploy?.to || d.chunks?.to || e.summary || e.title || "";
  const from = d.from || d.build?.from || d.deploy?.from || d.chunks?.from || "";
  return `${e.kind}|${from}|${to}|${(e.title || "").replace(/\s+/g, " ").slice(0, 48)}`;
}

function dedupeDeployBursts(events = []) {
  const sorted = [...events].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  const used = new Set();
  const seen = new Set();
  const out = [];
  for (const e of sorted) {
    if (!e?.id || used.has(e.id)) continue;
    if (e.kind !== "deploy") {
      if (
        ["health", "version", "models", "apiModels", "widgets", "capabilities", "catalog"].includes(
          e.kind,
        )
      ) {
        const fp = deployFingerprint(e);
        if (seen.has(fp)) {
          used.add(e.id);
          continue;
        }
        seen.add(fp);
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
    const keep = siblings.find((s) => /shipped|build/i.test(s.title || "")) || siblings[0] || e;
    const rank = inferRank({ ...keep, kind: "deploy", title: "Geoff website shipped" });
    const item = {
      ...keep,
      rank,
      vibe: VIBE[rank],
      title: siblings.length > 1 ? "Geoff website shipped" : keep.title,
      summary:
        siblings.length > 1
          ? `Coalesced ${siblings.length} deploy signals: ${siblings.map((s) => s.title).join(" · ")}`
          : keep.summary,
    };
    const fp = deployFingerprint(item);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(item);
  }
  return out;
}

function isFlapEvent(e) {
  if (
    !["models", "apiModels", "widgets", "capabilities", "catalog"].includes(e.kind)
  ) {
    return false;
  }
  const added = e.details?.added?.length || e.details?.raw?.added?.length || 0;
  const removed = e.details?.removed?.length || e.details?.raw?.removed?.length || 0;
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

function normalizeFeedEvents(events = []) {
  return dedupeDeployBursts(
    events
      .filter((e) => !isFlapEvent(e))
      .map((e) => {
        const rank = inferRank(e);
        return { ...e, rank, vibe: displayVibe({ ...e, rank }) };
      }),
  );
}
const els = {
  pollBtn: document.getElementById("pollBtn"),
  connection: document.getElementById("connection"),
  mercury: document.getElementById("mercury"),
  tempValue: document.getElementById("tempValue"),
  tempLabel: document.getElementById("tempLabel"),
  tempMeta: document.getElementById("tempMeta"),
  tempPlain: document.getElementById("tempPlain"),
  spark: document.getElementById("spark"),
  pumpMeta: document.getElementById("pumpMeta"),
  pumpStats: document.getElementById("pumpStats"),
  pumpChart: document.getElementById("pumpChart"),
  stackVersion: document.getElementById("stackVersion"),
  stackHealth: document.getElementById("stackHealth"),
  stackNodes: document.getElementById("stackNodes"),
  stackLoad: document.getElementById("stackLoad"),
  vramText: document.getElementById("vramText"),
  vramBar: document.getElementById("vramBar"),
  geoffBuild: document.getElementById("geoffBuild"),
  geoffDeploy: document.getElementById("geoffDeploy"),
  modelCount: document.getElementById("modelCount"),
  apiModelCount: document.getElementById("apiModelCount"),
  widgetCount: document.getElementById("widgetCount"),
  mcpContract: document.getElementById("mcpContract"),
  story: document.getElementById("story"),
  storyHeadline: document.getElementById("storyHeadline"),
  storySentence: document.getElementById("storySentence"),
  agentDesk: document.getElementById("agentDesk"),
  agentHeadline: document.getElementById("agentHeadline"),
  agentSentence: document.getElementById("agentSentence"),
  agentSignals: document.getElementById("agentSignals"),
  agentCluster: document.getElementById("agentCluster"),
  agentDisclaimer: document.getElementById("agentDisclaimer"),
  coverageMeta: document.getElementById("coverageMeta"),
  coverageChips: document.getElementById("coverageChips"),
  coverageNotes: document.getElementById("coverageNotes"),
  pieces: document.getElementById("pieces"),
  capGroups: document.getElementById("capGroups"),
  capMeta: document.getElementById("capMeta"),
  feed: document.getElementById("feed"),
  modelCards: document.getElementById("modelCards"),
  widgets: document.getElementById("widgets"),
  glossary: document.getElementById("glossary"),
  models: document.getElementById("models"),
};

const PIECE_ICONS = { app: "app", network: "network", brains: "brain", tools: "tools" };
const CAP_ICONS = {
  chat: "chat",
  media: "image",
  audio: "music",
  code: "code",
  infra: "chip",
  other: "spark",
};
const EVENT_ICONS = {
  deploy: "rocket",
  version: "layers",
  models: "brain",
  apiModels: "brain",
  capabilities: "bolt",
  widgets: "blocks",
  network: "server",
  health: "pulse",
  catalog: "layers",
  treasury: "spark",
  baseline: "activity",
  agent: "bolt",
  agentCluster: "spark",
};

let mode = "local";
let memory = loadMemory();
let pollTimer = null;

function emptyMemory() {
  return { latest: null, events: [], temps: [], agentSamples: [], pollCount: 0 };
}

function loadMemory() {
  // Kill poisoned hyped histories from older clients
  for (const key of [
    "geoff-thermometer-v1",
    "geoff-thermometer-v2",
    "geoff-thermometer-v3",
    "geoff-thermometer-v4",
  ]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw) return emptyMemory();
    return {
      ...emptyMemory(),
      ...raw,
      events: normalizeFeedEvents(raw.events || []),
      temps: normalizeTempSeries(raw.temps),
      agentSamples: Array.isArray(raw.agentSamples) ? raw.agentSamples : [],
    };
  } catch {
    return emptyMemory();
  }
}

function normalizeTempSeries(temps) {
  if (!Array.isArray(temps)) return [];
  return temps
    .map((t) =>
      typeof t === "number"
        ? { at: new Date().toISOString(), value: t }
        : { at: t.at || new Date().toISOString(), value: Number(t.value) || 0 },
    )
    .filter((t) => Number.isFinite(t.value));
}

function pruneWindow(list, getAt = (x) => x.at) {
  const cutoff = Date.now() - TRACK_MS;
  return (list || []).filter((item) => {
    const t = Date.parse(getAt(item));
    return Number.isFinite(t) && t >= cutoff;
  });
}

function saveMemory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
}

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((node) => {
    const name = node.getAttribute("data-icon");
    if (!name || node.dataset.hydrated === "1") return;
    node.innerHTML = icon(name);
    node.dataset.hydrated = "1";
  });
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function short(value, head = 8, tail = 6) {
  if (!value && value !== 0) return "—";
  const s = String(value);
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setConnection(state, label) {
  els.connection.className = `pill ${state}`;
  els.connection.textContent = label;
}

function renderMetrics(latest) {
  const s = latest?.summary ?? {};
  els.stackVersion.textContent = s.stacknetVersion || "—";
  els.stackHealth.textContent = s.stacknetStatus || "—";
  els.stackNodes.textContent =
    s.nodes != null && s.gpus != null ? `${s.nodes} / ${s.gpus}` : "—";
  const loadBits = [];
  if (s.averageLoad != null) loadBits.push(`load ${s.averageLoad}`);
  if (s.inFlight != null) loadBits.push(`in-flight ${s.inFlight}`);
  if (s.taskCount != null) loadBits.push(`tasks ${s.taskCount}`);
  els.stackLoad.textContent = loadBits.length ? loadBits.join(" · ") : "load —";
  if (s.availableVramGb != null && s.vramGb != null) {
    els.vramText.textContent = `${s.availableVramGb}/${s.vramGb} GB`;
    els.vramBar.style.width = `${s.vramAvailablePct ?? 0}%`;
  } else {
    els.vramText.textContent = "—";
    els.vramBar.style.width = "0%";
  }
  els.geoffBuild.textContent = short(s.geoffBuildId, 10, 6);
  if (s.geoffDeployId) {
    els.geoffDeploy.textContent = s.geoffDeployId;
  } else if (s.chunkHash) {
    els.geoffDeploy.textContent = `asset ${short(s.chunkHash, 4, 4)}`;
  } else {
    els.geoffDeploy.textContent = "—";
  }
  els.modelCount.textContent = s.models != null ? String(s.models) : "—";
  els.apiModelCount.textContent = s.apiModels != null ? `api ${s.apiModels}` : "api —";
  els.widgetCount.textContent = s.widgets != null ? String(s.widgets) : "—";
  els.mcpContract.textContent = short(s.mcpContract, 18, 0);
}

function renderSpark(temps = []) {
  const series = pruneWindow(normalizeTempSeries(temps));
  const pts = series.map((t) => t.value);
  if (pts.length < 2) {
    els.spark.innerHTML = "";
    return;
  }
  const w = 120;
  const h = 36;
  const max = Math.max(30, ...pts);
  const min = Math.min(...pts);
  const span = Math.max(1, max - min);
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  els.spark.innerHTML = `
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#059669"/>
        <stop offset="100%" stop-color="#4ade80"/>
      </linearGradient>
    </defs>
    <polyline fill="none" stroke="url(#g)" stroke-width="2.2" stroke-linecap="round"
      points="${coords.join(" ")}" />
  `;
}

function recordTracking(latest, temperature) {
  const at = latest?.takenAt || new Date().toISOString();
  const value = temperature?.value ?? 0;
  memory.temps = pruneWindow([
    ...normalizeTempSeries(memory.temps),
    { at, value },
  ]).slice(-500);

  const s = latest?.summary || {};
  memory.agentSamples = pruneWindow([
    ...(memory.agentSamples || []),
    {
      at,
      inFlight: s.inFlight ?? null,
      taskCount: s.taskCount ?? null,
      load: s.averageLoad ?? null,
    },
  ]).slice(-500);

  memory.events = pruneWindow(memory.events || []).slice(0, MAX_MEMORY_EVENTS);
  saveMemory();
  renderSpark(memory.temps);
}

function renderStory(briefing, temperature) {
  const story = briefing?.story || {};
  const temp = briefing?.temperature || {};
  els.story.className = `story tone-${story.tone || "muted"}`;
  els.storyHeadline.textContent = story.headline || "Waiting for first sniff";
  els.storySentence.textContent =
    story.sentence || "Once live data arrives, this board explains Geoff in plain English.";
  els.tempPlain.textContent = temp.plain
    ? `${temp.plain} ${temp.detail || ""}`
    : "—";

  const value = temperature?.value ?? temp.value ?? 0;
  els.mercury.style.width = `${Math.max(8, value)}%`;
  els.tempValue.textContent = String(value);
  els.tempLabel.textContent = temperature?.label || temp.label || "cool";
}

function eventsInTrackWindow(events = []) {
  return pruneWindow(events);
}

function setFeedMeta(count, pollCount) {
  els.tempMeta.textContent = `${count} updates in ${TRACK_HOURS}h · ${pollCount ?? 0} refreshes`;
}

function hourBuckets(now = Date.now()) {
  const start = now - TRACK_MS;
  const buckets = Array.from({ length: TRACK_HOURS }, (_, i) => ({
    i,
    start: start + i * 3_600_000,
    end: start + (i + 1) * 3_600_000,
    heat: 0,
    count: 0,
    crazy: 0,
    spike: 0,
    agent: 0,
    maxInFlight: 0,
  }));
  return buckets;
}

function renderPumpTape(events = [], agentSamples = []) {
  if (!els.pumpChart) return;
  const now = Date.now();
  const buckets = hourBuckets(now);
  const windowed = eventsInTrackWindow(events);

  for (const e of windowed) {
    const t = Date.parse(e.at);
    const idx = Math.min(TRACK_HOURS - 1, Math.max(0, Math.floor((t - (now - TRACK_MS)) / 3_600_000)));
    const b = buckets[idx];
    b.count += 1;
    b.heat += e.heat || RANK_WEIGHT[e.rank] || 1;
    if (e.rank === "crazy") b.crazy += 1;
    if (e.rank === "spike") b.spike += 1;
    if (e.kind === "agent" || e.kind === "agentCluster") b.agent += 1;
  }

  for (const sample of pruneWindow(agentSamples)) {
    const t = Date.parse(sample.at);
    const idx = Math.min(TRACK_HOURS - 1, Math.max(0, Math.floor((t - (now - TRACK_MS)) / 3_600_000)));
    const flight = Number(sample.inFlight) || 0;
    buckets[idx].maxInFlight = Math.max(buckets[idx].maxInFlight, flight);
  }

  const crazy = windowed.filter((e) => e.rank === "crazy").length;
  const spike = windowed.filter((e) => e.rank === "spike").length;
  const agentMoves = windowed.filter((e) => e.kind === "agent" || e.kind === "agentCluster").length;
  const peakFlight = Math.max(0, ...buckets.map((b) => b.maxInFlight));
  const heatSum = buckets.reduce((a, b) => a + b.heat, 0);

  els.pumpMeta.textContent =
    windowed.length || peakFlight
      ? `${windowed.length} ranked moves · peak queue ${peakFlight} · heat ${heatSum}`
      : `Waiting for measurable moves across ${TRACK_HOURS}h`;

  els.pumpStats.innerHTML = `
    <span class="pump-stat"><em>Crazy</em><strong>${crazy}</strong></span>
    <span class="pump-stat"><em>Spike</em><strong>${spike}</strong></span>
    <span class="pump-stat"><em>Agent signals</em><strong>${agentMoves}</strong></span>
    <span class="pump-stat"><em>Peak in-flight</em><strong>${peakFlight}</strong></span>
    <span class="pump-stat hot"><em>Tape heat</em><strong>${heatSum}</strong></span>
  `;

  const w = 720;
  const h = 140;
  const pad = { top: 12, bottom: 18, left: 4, right: 4 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const gap = 1.5;
  const barW = innerW / TRACK_HOURS - gap;
  const maxHeat = Math.max(3, ...buckets.map((b) => b.heat));
  const maxFlight = Math.max(1, ...buckets.map((b) => b.maxInFlight));

  const bars = buckets
    .map((b) => {
      const x = pad.left + b.i * (barW + gap);
      const bh = Math.max(b.heat > 0 ? 4 : 0, (b.heat / maxHeat) * (innerH * 0.72));
      const y = pad.top + innerH - bh;
      const hot = b.crazy > 0 || b.spike > 0;
      const fill = hot ? (b.crazy > 0 ? "#fb7185" : "#fbbf24") : "#34d399";
      const opacity = b.heat > 0 ? 0.85 : 0.12;
      return `<rect class="pump-bar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}" rx="1.5" fill="${fill}" opacity="${opacity}">
        <title>${b.count} updates · heat ${b.heat}${b.maxInFlight ? ` · queue ${b.maxInFlight}` : ""}</title>
      </rect>`;
    })
    .join("");

  const agentDots = buckets
    .filter((b) => b.maxInFlight > 0)
    .map((b) => {
      const x = pad.left + b.i * (barW + gap) + barW / 2;
      const y = pad.top + innerH * (1 - b.maxInFlight / maxFlight) * 0.85 + 4;
      const r = Math.min(4.5, 1.8 + b.maxInFlight / maxFlight * 3);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="#67e8f9" opacity="0.9">
        <title>Agent queue peak ${b.maxInFlight}</title>
      </circle>`;
    })
    .join("");

  const baselineY = pad.top + innerH;
  els.pumpChart.setAttribute("viewBox", `0 0 ${w} ${h}`);
  els.pumpChart.innerHTML = `
    <defs>
      <linearGradient id="pumpGlow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4ade80" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#4ade80" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="${pad.left}" y1="${baselineY}" x2="${w - pad.right}" y2="${baselineY}" stroke="rgba(74,222,128,0.2)" stroke-width="1"/>
    ${bars}
    ${agentDots}
  `;
}

function renderPieces(pieces = []) {
  if (!pieces.length) {
    els.pieces.innerHTML = `<p class="empty">Pieces appear after the first successful sniff.</p>`;
    return;
  }
  els.pieces.innerHTML = pieces
    .map(
      (p) => `
      <article class="piece tone-${escapeHtml(p.tone || "muted")}">
        <div class="piece-top">
          <span class="ico-wrap">${icon(PIECE_ICONS[p.id] || "spark")}</span>
          <div>
            <h3>${escapeHtml(p.title)}</h3>
            <p class="plain">${escapeHtml(p.plain)}</p>
          </div>
        </div>
        <p class="status">${escapeHtml(p.status)}</p>
        <p class="meaning">${escapeHtml(p.meaning)}</p>
        <ul>${(p.facts || []).map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
      </article>
    `,
    )
    .join("");
}

function renderCapGroups(groups = []) {
  const onCount = groups.filter((g) => g.on).length;
  els.capMeta.textContent = `${onCount} active lanes · ids from /network/summary · grouped for humans`;
  if (!groups.length) {
    els.capGroups.innerHTML = `<p class="empty">Waiting for capability map…</p>`;
    return;
  }
  els.capGroups.innerHTML = groups
    .map(
      (g) => `
      <article class="cap-group ${g.on ? "on" : "off"}">
        <div class="cap-group-top">
          <span class="ico-wrap sm">${icon(CAP_ICONS[g.id] || "spark")}</span>
          <h3>${escapeHtml(g.label)}</h3>
        </div>
        <div class="count">${g.count} powers ${g.on ? "on" : "off"}</div>
        <p>${escapeHtml(g.blurb)}</p>
        <div class="chips">
          ${(g.items || [])
            .slice(0, 6)
            .map((i) => `<span class="chip cap">${escapeHtml(i.label)}</span>`)
            .join("")}
          ${g.items?.length > 6 ? `<span class="chip">+${g.items.length - 6}</span>` : ""}
        </div>
      </article>
    `,
    )
    .join("");
}

function sortFeed(events = []) {
  return [...events].sort((a, b) => {
    const rw = (RANK_WEIGHT[inferRank(b)] || 0) - (RANK_WEIGHT[inferRank(a)] || 0);
    if (rw !== 0) return rw;
    return Date.parse(b.at || 0) - Date.parse(a.at || 0);
  });
}

function renderCoverage(coverage) {
  if (!els.coverageMeta) return;
  if (!coverage) {
    els.coverageMeta.textContent = "Waiting for first sniff…";
    els.coverageChips.innerHTML = "";
    els.coverageNotes.innerHTML = "";
    return;
  }
  els.coverageMeta.textContent = `${coverage.live}/${coverage.total} live · ${coverage.skipped} not shared · ${coverage.failed} failed`;
  els.coverageChips.innerHTML = (coverage.rows || [])
    .map(
      (r) =>
        `<span class="cov-chip ${escapeHtml(r.state)}" title="${escapeHtml(r.reason || r.source)}">${escapeHtml(r.label)} · ${escapeHtml(r.state)}</span>`,
    )
    .join("");
  els.coverageNotes.innerHTML = (coverage.notes || [])
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");
}

function renderAgentDesk(desk) {
  if (!els.agentDesk) return;
  if (!desk) {
    els.agentDesk.hidden = true;
    return;
  }
  els.agentDesk.hidden = false;
  els.agentDesk.className = `agent-desk status-${escapeHtml(desk.status || "quiet")}`;
  els.agentHeadline.textContent = desk.headline || "Agent desk";
  els.agentSentence.textContent = desk.sentence || "";
  els.agentDisclaimer.textContent = desk.disclaimer || "";
  els.agentSignals.innerHTML = (desk.signals || [])
    .map(
      (s) =>
        `<span class="agent-signal"><em>${escapeHtml(s.label)}</em><strong>${escapeHtml(s.value)}</strong></span>`,
    )
    .join("");
  els.agentCluster.innerHTML = (desk.cluster || [])
    .map(
      (c) =>
        `<li><span class="badge ${escapeHtml(c.rank || "note")}">${escapeHtml(c.rank || "note")}</span> ${escapeHtml(c.title)} — ${escapeHtml(c.summary)}</li>`,
    )
    .join("");
  hydrateIcons(els.agentDesk);
}

function resolveFeedEvents(payload, memoryEvents = []) {
  const raw =
    mode === "vercel"
      ? memoryEvents
      : payload.events?.length
        ? payload.events
        : memoryEvents;
  const briefMap = new Map((payload.briefing?.events || []).map((e) => [e.id, e]));
  const merged = raw.map((e) => (e?.id && briefMap.has(e.id) ? briefMap.get(e.id) : e));
  return normalizeFeedEvents(merged);
}

function renderFeed(events = [], { pollCount = 0 } = {}) {
  // Same list drives the cards and the "updates in 72h" number
  const windowed = sortFeed(eventsInTrackWindow(events));
  setFeedMeta(windowed.length, pollCount);

  if (!windowed.length) {
    els.feed.innerHTML = `<p class="empty">No changes in the last ${TRACK_HOURS} hours. Keep sniffing — the pump tape fills as real diffs land.</p>`;
    return;
  }
  els.feed.innerHTML = windowed
    .slice(0, 80)
    .map((event) => {
      const rank = inferRank(event);
      const vibe = displayVibe(event);
      const float = rank === "crazy" || rank === "spike";
      return `
      <article class="event rank-${escapeHtml(rank)}${float ? " float" : ""}">
        <div class="event-ico">${icon(EVENT_ICONS[event.kind] || "activity")}</div>
        <time datetime="${event.at}">${fmtTime(event.at)}</time>
        <div>
          <h3>${escapeHtml(event.title)}</h3>
          <p class="take">${escapeHtml(event.userTake || event.summary)}</p>
          <p class="tech">${escapeHtml(event.summary)}</p>
        </div>
        <span class="badge ${escapeHtml(rank)}">${escapeHtml(vibe)}</span>
      </article>
    `;
    })
    .join("");
}

function renderModelCards(models = []) {
  if (!models.length) {
    els.modelCards.innerHTML = `<p class="empty">Waiting for model cards…</p>`;
    return;
  }
  els.modelCards.innerHTML = models
    .map(
      (m) => `
      <article class="model-card">
        <header>
          <div class="title-row">
            <span class="ico-wrap sm">${icon("brain")}</span>
            <h3>${escapeHtml(m.displayName || m.id)}</h3>
          </div>
          <span class="role">${escapeHtml(m.role || "Network model")}${m.roleGuessed ? " · guessed" : ""}</span>
        </header>
        <p class="use">${escapeHtml(m.use || m.description || "")}</p>
        <div class="chips">
          ${(m.skillLabels || m.capabilities || [])
            .slice(0, 8)
            .map((c) => `<span class="chip cap">${escapeHtml(c)}</span>`)
            .join("")}
          ${(m.contentTypes || [])
            .slice(0, 5)
            .map((c) => `<span class="chip type">${escapeHtml(c)}</span>`)
            .join("")}
          ${m.roleGuessed ? `<span class="chip guessed">role guessed</span>` : `<span class="chip type">api text</span>`}
        </div>
      </article>
    `,
    )
    .join("");
}

function renderWidgets(widgets = []) {
  if (!widgets.length) {
    els.widgets.innerHTML = `<p class="empty">Waiting for widgets…</p>`;
    return;
  }
  els.widgets.innerHTML = widgets
    .map(
      (w) => `
      <article class="widget">
        <div class="widget-top">
          <span class="ico-wrap sm">${icon("blocks")}</span>
          <h3>${escapeHtml(w.name || w.id)}</h3>
        </div>
        <div class="meta">${escapeHtml(w.audience || (w.isSystem ? "Built-in" : "Community"))} · ${escapeHtml(w.version || "v?")}</div>
        <p>${escapeHtml(w.glance || w.description || "Reusable answer block")}</p>
      </article>
    `,
    )
    .join("");
}

function renderGlossary(items = []) {
  if (!items.length) {
    els.glossary.innerHTML = "";
    return;
  }
  els.glossary.innerHTML = items
    .map(
      (g) => `
      <article>
        <h3>${escapeHtml(g.term)}</h3>
        <p>${escapeHtml(g.meaning)}</p>
      </article>
    `,
    )
    .join("");
}

function renderNetworkModels(models = [], guide = []) {
  const byId = new Map(guide.map((g) => [g.id, g]));
  if (!models.length) {
    els.models.innerHTML = `<p class="empty">No network model ids yet.</p>`;
    return;
  }
  els.models.innerHTML = models
    .map((id) => {
      const role = byId.get(id)?.role;
      return `<span class="chip" title="${escapeHtml(role || id)}">${escapeHtml(id)}${role ? ` · ${escapeHtml(role)}` : ""}</span>`;
    })
    .join("");
}

function applyPayload(payload, { mergeClient = false } = {}) {
  if (!payload?.latest && !payload?.briefing && !payload?.events) return;

  if (mergeClient || mode === "vercel") {
    const incoming = payload.newEvents || [];
    const merged = [...incoming, ...(memory.events || [])];
    const seen = new Set();
    memory.events = pruneWindow(merged)
      .filter((e) => {
        if (!e?.id || seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .slice(0, MAX_MEMORY_EVENTS);
    memory.latest = payload.latest || memory.latest;
    memory.pollCount = (memory.pollCount || 0) + (payload.newEvents ? 1 : 0);
    saveMemory();
  } else {
    memory.latest = payload.latest;
    memory.events = pruneWindow(payload.events || []).slice(0, MAX_MEMORY_EVENTS);
    memory.pollCount = payload.state?.pollCount || memory.pollCount;
    saveMemory();
  }

  const briefing = payload.briefing;
  const latest = payload.latest || memory.latest;
  const pollCount = payload.state?.pollCount ?? memory.pollCount ?? 0;
  const feedEvents = resolveFeedEvents(payload, memory.events || []);

  recordTracking(latest, payload.temperature);
  renderMetrics(latest);
  renderStory(briefing, payload.temperature);
  renderCoverage(briefing?.coverage || null);
  renderAgentDesk(payload.agentDesk || briefing?.agentDesk || null);
  renderPumpTape(feedEvents, memory.agentSamples || []);
  renderPieces(briefing?.pieces || []);
  renderCapGroups(briefing?.capabilityGroups || []);
  renderFeed(feedEvents, { pollCount });
  renderModelCards(briefing?.models || latest?.sources?.["stacknet.models"]?.models || []);
  renderWidgets(briefing?.widgets || latest?.sources?.["stacknet.widgets"]?.widgets || []);
  renderGlossary(briefing?.glossary || []);
  renderNetworkModels(
    latest?.sources?.["stacknet.network"]?.models || [],
    briefing?.networkModelGuide || [],
  );

  if (payload.state?.lastError || payload.error) setConnection("error", "degraded");
}

async function pollNow() {
  els.pollBtn.disabled = true;
  try {
    const body = {
      previous: memory.latest,
      events: memory.events.slice(0, MAX_MEMORY_EVENTS),
    };
    const res = await fetch("/api/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Poll failed");
    mode = data.config?.mode || mode;
    applyPayload(data, { mergeClient: mode === "vercel" });
    setConnection("live", "live");
  } catch (error) {
    setConnection("error", "refresh failed");
    console.error(error);
  } finally {
    els.pollBtn.disabled = false;
  }
}

function connectStream() {
  if (mode === "vercel") return null;
  const source = new EventSource("/api/stream");
  source.addEventListener("status", (event) => {
    try {
      const payload = JSON.parse(event.data);
      mode = payload.config?.mode || mode;
      applyPayload(payload);
      setConnection("live", "live");
    } catch (error) {
      console.error(error);
    }
  });
  source.onerror = () => setConnection("error", "reconnecting");
  return source;
}

function startClientPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    pollNow().catch(() => {});
  }, 30_000);
}

function startMatrix() {
  const canvas = document.getElementById("matrix");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let columns = [];
  const glyphs = "01アイウエオカキクケコGEOFFSTACKNET<>/=";

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    const colCount = Math.floor(width / 18);
    columns = Array.from({ length: colCount }, () => Math.random() * -40);
  }

  function tick() {
    ctx.fillStyle = "rgba(5, 8, 5, 0.08)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(74, 222, 128, 0.55)";
    ctx.font = "12px ui-monospace, SF Mono, Menlo, monospace";
    for (let i = 0; i < columns.length; i++) {
      const ch = glyphs[(Math.random() * glyphs.length) | 0];
      const x = i * 18;
      const y = columns[i] * 18;
      ctx.fillText(ch, x, y);
      if (y > height && Math.random() > 0.975) columns[i] = 0;
      columns[i] += 0.65;
    }
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(tick);
}

els.pollBtn.addEventListener("click", pollNow);
hydrateIcons();
startMatrix();

async function boot() {
  try {
    const health = await fetch("/api/health").then((r) => r.json());
    mode = health.mode || "local";
  } catch {
    mode = "vercel";
  }

  try {
    if (mode === "vercel") {
      await pollNow();
      startClientPolling();
    } else {
      const status = await fetch("/api/status").then((r) => r.json());
      mode = status.config?.mode || mode;
      applyPayload(status);
      setConnection("live", "live");
      connectStream();
    }
  } catch (error) {
    console.error(error);
    mode = "vercel";
    await pollNow();
    startClientPolling();
  }
}

boot();
