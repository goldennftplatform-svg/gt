import { icon } from "./icons.js";

const STORAGE_KEY = "geoff-thermometer-v2";
const els = {
  pollBtn: document.getElementById("pollBtn"),
  connection: document.getElementById("connection"),
  mercury: document.getElementById("mercury"),
  tempValue: document.getElementById("tempValue"),
  tempLabel: document.getElementById("tempLabel"),
  tempMeta: document.getElementById("tempMeta"),
  tempPlain: document.getElementById("tempPlain"),
  spark: document.getElementById("spark"),
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
};

let mode = "local";
let memory = loadMemory();
let pollTimer = null;

function loadMemory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {
      latest: null,
      events: [],
      temps: [],
      pollCount: 0,
    };
  } catch {
    return { latest: null, events: [], temps: [], pollCount: 0 };
  }
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
  els.stackLoad.textContent =
    s.averageLoad != null ? `load ${s.averageLoad}` : `in-flight ${s.inFlight ?? "—"}`;
  if (s.availableVramGb != null && s.vramGb != null) {
    els.vramText.textContent = `${s.availableVramGb}/${s.vramGb} GB`;
    els.vramBar.style.width = `${s.vramAvailablePct ?? 0}%`;
  } else {
    els.vramText.textContent = "—";
    els.vramBar.style.width = "0%";
  }
  els.geoffBuild.textContent = short(s.geoffBuildId, 10, 6);
  els.geoffDeploy.textContent = s.geoffDeployId || short(s.chunkHash, 4, 4);
  els.modelCount.textContent = s.models != null ? String(s.models) : "—";
  els.apiModelCount.textContent = s.apiModels != null ? `api ${s.apiModels}` : "api —";
  els.widgetCount.textContent = s.widgets != null ? String(s.widgets) : "—";
  els.mcpContract.textContent = short(s.mcpContract, 18, 0);
}

function renderSpark(temps = []) {
  const pts = temps.slice(-24);
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

function renderStory(briefing, temperature, state) {
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

  const recent = temperature?.recentEventCount ?? 0;
  const polls = state?.pollCount ?? memory.pollCount ?? 0;
  els.tempMeta.textContent = `${recent} updates in 6h · ${polls} refreshes`;
  memory.temps = [...(memory.temps || []), value].slice(-48);
  renderSpark(memory.temps);
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
  els.capMeta.textContent = `${onCount} active lanes · grouped for humans`;
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

function renderFeed(events = []) {
  if (!events.length) {
    els.feed.innerHTML = `<p class="empty">No changes yet. The first refresh sets a baseline; later ones explain what moved.</p>`;
    return;
  }
  els.feed.innerHTML = events
    .slice(0, 40)
    .map(
      (event) => `
      <article class="event">
        <div class="event-ico">${icon(EVENT_ICONS[event.kind] || "activity")}</div>
        <time datetime="${event.at}">${fmtTime(event.at)}</time>
        <div>
          <h3>${escapeHtml(event.title)}</h3>
          <p class="take">${escapeHtml(event.userTake || event.summary)}</p>
          <p class="tech">${escapeHtml(event.summary)}</p>
        </div>
        <span class="badge ${escapeHtml(event.severity || "info")}">${escapeHtml(event.vibe || event.kind)}</span>
      </article>
    `,
    )
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
          <span class="role">${escapeHtml(m.role || "Network model")}</span>
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
    memory.events = merged
      .filter((e) => {
        if (!e?.id || seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .slice(0, 500);
    memory.latest = payload.latest || memory.latest;
    memory.pollCount = (memory.pollCount || 0) + (payload.newEvents ? 1 : 0);
    saveMemory();
  } else {
    memory.latest = payload.latest;
    memory.events = payload.events || [];
    memory.pollCount = payload.state?.pollCount || memory.pollCount;
    saveMemory();
  }

  const events = mode === "vercel" ? memory.events : payload.events || memory.events;
  const briefing = payload.briefing;
  const latest = payload.latest || memory.latest;

  renderMetrics(latest);
  renderStory(briefing, payload.temperature, payload.state || { pollCount: memory.pollCount });
  renderPieces(briefing?.pieces || []);
  renderCapGroups(briefing?.capabilityGroups || []);
  renderFeed(briefing?.events?.length ? briefing.events : events);
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
      events: memory.events.slice(0, 200),
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
