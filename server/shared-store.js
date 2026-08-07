/**
 * Shared live desk for Vercel — one public JSON bundle on the gt-live branch.
 * Every visitor (incognito included) reads the same events / daily cubes.
 * GitHub Actions (and optional GT_GITHUB_TOKEN writes) persist ticks.
 */

import { config } from "./config.js";
import { pruneDailyActivity } from "./daily-activity.js";
import { normalizeEvents } from "./translator.js";

const DEFAULT_REPO = "goldennftplatform-svg/gt";
const DEFAULT_BRANCH = "gt-live";
const DEFAULT_PATH = "shared.json";

function repo() {
  return process.env.GT_SHARED_REPO || DEFAULT_REPO;
}

function branch() {
  return process.env.GT_SHARED_BRANCH || DEFAULT_BRANCH;
}

function filePath() {
  return process.env.GT_SHARED_PATH || DEFAULT_PATH;
}

function githubToken() {
  return process.env.GT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
}

export function sharedStoreConfig() {
  return {
    enabled: true,
    repo: repo(),
    branch: branch(),
    path: filePath(),
    writable: Boolean(githubToken()),
    rawUrl: `https://raw.githubusercontent.com/${repo()}/${branch()}/${filePath()}`,
  };
}

function emptyBundle() {
  return {
    updatedAt: null,
    latest: null,
    events: [],
    dailyActivity: [],
    state: {
      startedAt: null,
      lastPollAt: null,
      lastError: null,
      pollCount: 0,
      temperature: 0,
    },
  };
}

function pruneEvents(events = []) {
  const cutoff = Date.now() - config.trackWindowHours * 60 * 60 * 1000;
  return normalizeEvents(events)
    .filter((e) => {
      const t = Date.parse(e?.at || "");
      return Number.isFinite(t) && t >= cutoff;
    })
    .slice(0, config.maxEvents);
}

function normalizeBundle(raw) {
  const base = emptyBundle();
  if (!raw || typeof raw !== "object") return base;
  return {
    updatedAt: raw.updatedAt || null,
    latest: raw.latest || null,
    events: pruneEvents(raw.events || []),
    dailyActivity: pruneDailyActivity(raw.dailyActivity || [], config.heatmapDays),
    state: { ...base.state, ...(raw.state || {}) },
  };
}

export async function loadSharedBundle() {
  const cfg = sharedStoreConfig();
  const url = `${cfg.rawUrl}?t=${Date.now()}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "GeoffThermometer/shared-store",
      },
    });
    if (res.status === 404) return emptyBundle();
    if (!res.ok) {
      throw new Error(`shared store HTTP ${res.status}`);
    }
    return normalizeBundle(await res.json());
  } catch (error) {
    // Fallback: Contents API (works for private later; public raw usually enough)
    const token = githubToken();
    if (!token) throw error;
    const api = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`;
    const res = await fetch(api, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "GeoffThermometer/shared-store",
      },
    });
    if (res.status === 404) return emptyBundle();
    if (!res.ok) throw new Error(`shared store API HTTP ${res.status}`);
    const body = await res.json();
    const json = Buffer.from(body.content || "", "base64").toString("utf8");
    return normalizeBundle(JSON.parse(json || "{}"));
  }
}

async function getContentMeta() {
  const cfg = sharedStoreConfig();
  const token = githubToken();
  if (!token) return { sha: null };
  const api = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`;
  const res = await fetch(api, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "GeoffThermometer/shared-store",
    },
  });
  if (res.status === 404) return { sha: null };
  if (!res.ok) throw new Error(`content meta HTTP ${res.status}`);
  const body = await res.json();
  return { sha: body.sha || null };
}

export async function saveSharedBundle(bundle, { message } = {}) {
  const cfg = sharedStoreConfig();
  const token = githubToken();
  if (!token) {
    throw new Error("No GT_GITHUB_TOKEN/GITHUB_TOKEN — cannot write shared store");
  }

  const normalized = normalizeBundle({
    ...bundle,
    updatedAt: new Date().toISOString(),
  });
  const content = Buffer.from(JSON.stringify(normalized, null, 2), "utf8").toString("base64");
  const api = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { sha } = await getContentMeta();
    const res = await fetch(api, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "GeoffThermometer/shared-store",
      },
      body: JSON.stringify({
        message: message || `live tick ${normalized.updatedAt}`,
        content,
        branch: cfg.branch,
        sha: sha || undefined,
      }),
    });
    if (res.ok) return normalized;
    // 409 = someone else wrote; retry with fresh sha
    if (res.status === 409 && attempt < 2) continue;
    const text = await res.text();
    throw new Error(`shared store write HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  return normalized;
}

export { emptyBundle, normalizeBundle, pruneEvents };
