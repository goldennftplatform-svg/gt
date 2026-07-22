import { config } from "./config.js";

const DEFAULT_TIMEOUT_MS = 18_000;

async function fetchJson(url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, text/html;q=0.8, */*;q=0.5",
        "User-Agent": "GeoffThermometer/1.0 (+local sniffer)",
        ...headers,
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
      json,
      text,
      headers: Object.fromEntries(res.headers.entries()),
    };
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders() {
  const headers = {};
  if (config.geoffCookie) headers.Cookie = config.geoffCookie;
  if (config.geoffPreviewCode) {
    headers.Authorization = `Bearer ${config.geoffPreviewCode}`;
    headers["x-preview-code"] = config.geoffPreviewCode;
  }
  return headers;
}

function extractDeployId(html) {
  if (!html) return null;
  const dpl = html.match(/dpl_[A-Za-z0-9]+/);
  return dpl?.[0] ?? null;
}

function extractChunkFingerprint(html) {
  if (!html) return null;
  const chunks = [...html.matchAll(/\/_next\/static\/chunks\/([^\"'?\s]+\.js)/g)].map((m) => m[1]);
  const unique = [...new Set(chunks)].sort();
  return {
    count: unique.length,
    sample: unique.slice(0, 8),
    hash: simpleHash(unique.join("|")),
  };
}

function simpleHash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String))].sort();
}

async function sniffGeoffVersion() {
  const res = await fetchJson(`${config.geoffBaseUrl}/api/version`);
  return {
    source: "geoff.version",
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    buildId: res.json?.buildId ?? null,
    raw: res.json,
  };
}

async function sniffGeoffDeploy() {
  const res = await fetchJson(config.geoffBaseUrl, {
    headers: { Accept: "text/html" },
  });
  return {
    source: "geoff.deploy",
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    deployId: extractDeployId(res.text),
    chunks: extractChunkFingerprint(res.text),
  };
}

async function sniffGeoffCatalog() {
  if (!config.geoffCookie && !config.geoffPreviewCode) {
    return {
      source: "geoff.catalog",
      ok: false,
      status: 0,
      skipped: true,
      reason: "Set GEOFF_COOKIE or GEOFF_PREVIEW_CODE to sniff authenticated catalogs",
      models: [],
      tools: [],
      mcpTools: [],
    };
  }

  const headers = authHeaders();
  const [models, tools, mcp] = await Promise.all([
    fetchJson(`${config.geoffBaseUrl}/api/catalog/models`, { headers }),
    fetchJson(`${config.geoffBaseUrl}/api/catalog/tools?scope=all`, { headers }),
    fetchJson(`${config.geoffBaseUrl}/api/catalog/remote-mcp-tools`, { headers }),
  ]);

  const modelIds = normalizeList(
    (models.json?.data ?? models.json?.models ?? models.json ?? [])
      .map?.((m) => m.id || m.name || m)
      .filter(Boolean) ?? [],
  );
  const toolIds = normalizeList(
    (tools.json?.data ?? tools.json?.tools ?? tools.json ?? [])
      .map?.((t) => t.id || t.name || t)
      .filter(Boolean) ?? [],
  );
  const mcpIds = normalizeList(
    (mcp.json?.data ?? mcp.json?.tools ?? mcp.json ?? [])
      .map?.((t) => t.id || t.name || t)
      .filter(Boolean) ?? [],
  );

  return {
    source: "geoff.catalog",
    ok: models.ok || tools.ok || mcp.ok,
    status: models.status,
    skipped: false,
    models: modelIds,
    tools: toolIds,
    mcpTools: mcpIds,
    ms: Math.max(models.ms, tools.ms, mcp.ms),
  };
}

async function sniffStacknetHealth() {
  const res = await fetchJson(`${config.stacknetBaseUrl}/health`);
  return {
    source: "stacknet.health",
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    statusText: res.json?.status ?? null,
    version: res.json?.version ?? null,
    nodeId: res.json?.node_id ?? null,
    inFlight: res.json?.in_flight ?? null,
    maxInFlight: res.json?.max_in_flight ?? null,
    remoteMcp: res.json?.remote_mcp ?? null,
  };
}

async function sniffStacknetRoot() {
  const res = await fetchJson(`${config.stacknetBaseUrl}/`);
  return {
    source: "stacknet.root",
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    version: res.json?.v ?? null,
  };
}

async function sniffStacknetNetwork() {
  const res = await fetchJson(`${config.stacknetBaseUrl}/network/summary`);
  const network = res.json?.network ?? {};
  return {
    source: "stacknet.network",
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    totalNodes: network.totalNodes ?? null,
    availableNodes: network.availableNodes ?? null,
    totalGpus: network.totalGpus ?? null,
    totalVramGb: network.totalVramGb ?? null,
    availableVramGb: network.availableVramGb ?? null,
    averageLoad: network.averageLoad ?? null,
    totalModels: network.totalModels ?? null,
    models: normalizeList(network.models),
    capabilities: normalizeList(network.capabilities),
    treasury: res.json?.treasury
      ? {
          solPriceUsd: res.json.treasury.solPriceUsd ?? null,
          cluster: res.json.treasury.cluster ?? null,
          pendingObligations: res.json.treasury.pendingObligations ?? null,
        }
      : null,
    timestamp: res.json?.timestamp ?? null,
  };
}

async function sniffStacknetNode() {
  const res = await fetchJson(`${config.stacknetBaseUrl}/node`);
  return {
    source: "stacknet.node",
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    nodeId: res.json?.node_id ?? null,
    version: res.json?.version ?? null,
    coprocessorCount: res.json?.coprocessor_count ?? null,
    taskCount: res.json?.task_count ?? null,
  };
}

async function sniffStacknetModels() {
  const res = await fetchJson(`${config.stacknetBaseUrl}/v1/models`);
  const rows = Array.isArray(res.json?.data) ? res.json.data : [];
  const models = rows
    .map((m) => ({
      id: m.id,
      displayName: m.display_name || m.displayName || m.id,
      ownedBy: m.owned_by || m.ownedBy || null,
      description: m.description || null,
      capabilities: normalizeList(m.capabilities),
      contentTypes: normalizeList(m.content_types || m.contentTypes),
      created: m.created ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    source: "stacknet.models",
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    count: models.length,
    ids: models.map((m) => m.id),
    models,
  };
}

async function sniffStacknetWidgets() {
  const res = await fetchJson(`${config.stacknetBaseUrl}/widgets`);
  const rows = Array.isArray(res.json?.widgets) ? res.json.widgets : [];
  const widgets = rows
    .map((w) => ({
      id: w.id,
      name: w.name || w.id,
      description: w.description || null,
      version: w.version || null,
      tags: normalizeList(w.tags),
      isSystem: Boolean(w.is_system ?? w.isSystem),
      isPublic: w.is_public ?? w.isPublic ?? true,
      usageCount: w.usage_count ?? w.usageCount ?? 0,
      updatedAt: w.updated_at ?? w.updatedAt ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    source: "stacknet.widgets",
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    count: widgets.length,
    ids: widgets.map((w) => w.id),
    widgets,
  };
}

export async function runSniff() {
  const startedAt = new Date().toISOString();
  const settled = await Promise.allSettled([
    sniffGeoffVersion(),
    sniffGeoffDeploy(),
    sniffGeoffCatalog(),
    sniffStacknetHealth(),
    sniffStacknetRoot(),
    sniffStacknetNetwork(),
    sniffStacknetNode(),
    sniffStacknetModels(),
    sniffStacknetWidgets(),
  ]);

  const sources = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      source: `source-${index}`,
      ok: false,
      status: 0,
      error: result.reason?.message || String(result.reason),
    };
  });

  const bySource = Object.fromEntries(sources.map((s) => [s.source, s]));
  const network = bySource["stacknet.network"] ?? {};
  const vramPct =
    isFiniteNumber(network.totalVramGb) &&
    network.totalVramGb > 0 &&
    isFiniteNumber(network.availableVramGb)
      ? Math.round((network.availableVramGb / network.totalVramGb) * 100)
      : null;

  return {
    id: `snap_${Date.now().toString(36)}`,
    takenAt: startedAt,
    sources: bySource,
    summary: {
      geoffBuildId: bySource["geoff.version"]?.buildId ?? null,
      geoffDeployId: bySource["geoff.deploy"]?.deployId ?? null,
      chunkHash: bySource["geoff.deploy"]?.chunks?.hash ?? null,
      chunkCount: bySource["geoff.deploy"]?.chunks?.count ?? null,
      stacknetVersion: bySource["stacknet.health"]?.version ?? bySource["stacknet.root"]?.version ?? null,
      stacknetStatus: bySource["stacknet.health"]?.statusText ?? null,
      mcpContract: bySource["stacknet.health"]?.remoteMcp?.contract_id ?? null,
      inFlight: bySource["stacknet.health"]?.inFlight ?? null,
      maxInFlight: bySource["stacknet.health"]?.maxInFlight ?? null,
      nodes: network.availableNodes ?? null,
      totalNodes: network.totalNodes ?? null,
      gpus: network.totalGpus ?? null,
      vramGb: network.totalVramGb ?? null,
      availableVramGb: network.availableVramGb ?? null,
      vramAvailablePct: vramPct,
      averageLoad: network.averageLoad ?? null,
      models: network.totalModels ?? null,
      apiModels: bySource["stacknet.models"]?.count ?? null,
      widgets: bySource["stacknet.widgets"]?.count ?? null,
      capabilities: network.capabilities?.length ?? null,
      solPriceUsd: network.treasury?.solPriceUsd ?? null,
      catalogModels: bySource["geoff.catalog"]?.models?.length ?? null,
      healthySources: sources.filter((s) => s.ok || s.skipped).length,
      totalSources: sources.length,
    },
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}