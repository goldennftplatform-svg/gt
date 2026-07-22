const STORAGE_KEY = "geoff-thermometer-v1";
const els = {
  pollBtn: document.getElementById("pollBtn"),
  connection: document.getElementById("connection"),
  mercury: document.getElementById("mercury"),
  tempValue: document.getElementById("tempValue"),
  tempLabel: document.getElementById("tempLabel"),
  tempMeta: document.getElementById("tempMeta"),
  spark: document.getElementById("spark"),
  geoffBuild: document.getElementById("geoffBuild"),
  geoffDeploy: document.getElementById("geoffDeploy"),
  stackVersion: document.getElementById("stackVersion"),
  stackHealth: document.getElementById("stackHealth"),
  stackNodes: document.getElementById("stackNodes"),
  stackLoad: document.getElementById("stackLoad"),
  vramText: document.getElementById("vramText"),
  vramBar: document.getElementById("vramBar"),
  modelCount: document.getElementById("modelCount"),
  apiModelCount: document.getElementById("apiModelCount"),
  widgetCount: document.getElementById("widgetCount"),
  mcpContract: document.getElementById("mcpContract"),
  feed: document.getElementById("feed"),
  modelCards: document.getElementById("modelCards"),
  widgets: document.getElementById("widgets"),
  caps: document.getElementById("caps"),
  capMeta: document.getElementById("capMeta"),
  models: document.getElementById("models"),
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

function short(value, head = 8, tail = 6) {
  if (!value && value !== 0) return "—";
  const s = String(value);
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function setConnection(state, label) {
  els.connection.className = `pill ${state}`;
  els.connection.textContent = label;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
    <polyline fill="none" stroke="rgba(240,162,2,0.85)" stroke-width="2"
      points="${coords.join(" ")}" />
  `;
}

function renderTemperature(temperature, state) {
  const value = temperature?.value ?? 0;
  els.mercury.style.width = `${Math.max(8, value)}%`;
  els.tempValue.textContent = String(value);
  els.tempLabel.textContent = temperature?.label ?? "cool";
  const recent = temperature?.recentEventCount ?? 0;
  const polls = state?.pollCount ?? memory.pollCount ?? 0;
  els.tempMeta.textContent = `${recent} updates / 6h · ${polls} sniffs · ${mode}`;
  memory.temps = [...(memory.temps || []), value].slice(-48);
  renderSpark(memory.temps);
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

function renderFeed(events = []) {
  if (!events.length) {
    els.feed.innerHTML = `<p class="empty">No translated events yet. First sniff sets the baseline.</p>`;
    return;
  }
  els.feed.innerHTML = events
    .slice(0, 50)
    .map(
      (event) => `
      <article class="event">
        <time datetime="${event.at}">${fmtTime(event.at)}</time>
        <div>
          <h3>${escapeHtml(event.title)}</h3>
          <p>${escapeHtml(event.summary)}</p>
        </div>
        <span class="badge ${escapeHtml(event.severity || "info")}">${escapeHtml(event.kind)}</span>
      </article>
    `,
    )
    .join("");
}

function renderModelCards(models = []) {
  if (!models.length) {
    els.modelCards.innerHTML = `<p class="empty">Waiting for /v1/models…</p>`;
    return;
  }
  els.modelCards.innerHTML = models
    .map(
      (m) => `
      <article class="model-card">
        <header>
          <h3>${escapeHtml(m.displayName || m.id)}</h3>
          <span class="owner">${escapeHtml(m.ownedBy || "stacknet")}</span>
        </header>
        <p>${escapeHtml(m.description || m.id)}</p>
        <div class="chips">
          ${(m.capabilities || [])
            .map((c) => `<span class="chip cap">${escapeHtml(c)}</span>`)
            .join("")}
          ${(m.contentTypes || [])
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
        <h3>${escapeHtml(w.name || w.id)}</h3>
        <div class="meta">${escapeHtml(w.version || "v?")} · ${w.isSystem ? "system" : "user"} · used ${w.usageCount || 0}</div>
        <p>${escapeHtml(w.description || "No description")}</p>
      </article>
    `,
    )
    .join("");
}

function renderCaps(capabilities = []) {
  els.capMeta.textContent = `${capabilities.length} live capabilities`;
  if (!capabilities.length) {
    els.caps.innerHTML = `<p class="empty">Waiting…</p>`;
    return;
  }
  els.caps.innerHTML = capabilities
    .map((cap) => `<span class="chip">${escapeHtml(String(cap).replace(/[-_]/g, " "))}</span>`)
    .join("");
}

function renderNetworkModels(models = []) {
  if (!models.length) {
    els.models.innerHTML = `<p class="empty">Waiting…</p>`;
    return;
  }
  els.models.innerHTML = models
    .map((model) => `<span class="chip">${escapeHtml(model)}</span>`)
    .join("");
}

function applyPayload(payload, { mergeClient = false } = {}) {
  if (!payload?.latest && !payload?.events) return;

  if (mergeClient || mode === "vercel") {
    const incoming = payload.newEvents || [];
    const merged = [...incoming, ...(memory.events || [])];
    // de-dupe by id
    const seen = new Set();
    memory.events = merged.filter((e) => {
      if (!e?.id || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).slice(0, 500);
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
  const latest = payload.latest || memory.latest;
  const temperature = payload.temperature;
  const state = payload.state || { pollCount: memory.pollCount };

  renderTemperature(temperature, state);
  renderMetrics(latest);
  renderFeed(events);
  renderModelCards(latest?.sources?.["stacknet.models"]?.models ?? []);
  renderWidgets(latest?.sources?.["stacknet.widgets"]?.widgets ?? []);
  renderCaps(latest?.sources?.["stacknet.network"]?.capabilities ?? []);
  renderNetworkModels(latest?.sources?.["stacknet.network"]?.models ?? []);

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
    setConnection("error", "poll failed");
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

els.pollBtn.addEventListener("click", pollNow);

async function boot() {
  // Detect mode via health, then load
  try {
    const health = await fetch("/api/health").then((r) => r.json());
    mode = health.mode || "local";
  } catch {
    mode = "vercel";
  }

  if (memory.latest) {
    applyPayload(
      {
        latest: memory.latest,
        events: memory.events,
        temperature: { value: memory.temps.at(-1) || 22, label: "steady", recentEventCount: 0 },
        state: { pollCount: memory.pollCount },
      },
      { mergeClient: false },
    );
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
    // Fallback: treat as vercel-style client history
    mode = "vercel";
    await pollNow();
    startClientPolling();
  }
}

boot();
