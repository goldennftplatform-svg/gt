import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { normalizeEvents } from "./translator.js";

async function ensureDataDir() {
  await fs.mkdir(config.dataDir, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await ensureDataDir();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

const paths = {
  events: () => path.join(config.dataDir, "events.json"),
  snapshots: () => path.join(config.dataDir, "snapshots.json"),
  latest: () => path.join(config.dataDir, "latest.json"),
  state: () => path.join(config.dataDir, "state.json"),
};

export async function loadState() {
  return readJson(paths.state(), {
    startedAt: null,
    lastPollAt: null,
    lastError: null,
    pollCount: 0,
    temperature: 0,
  });
}

export async function saveState(state) {
  await writeJson(paths.state(), state);
}

function pruneTrackWindow(events = []) {
  const cutoff = Date.now() - config.trackWindowHours * 60 * 60 * 1000;
  return events.filter((e) => {
    const t = Date.parse(e?.at || "");
    return Number.isFinite(t) && t >= cutoff;
  });
}

function needsLegacyCleanup(events = []) {
  return events.some(
    (e) =>
      !e?.rank ||
      e.vibe === "Big deal" ||
      e.vibe === "Notable" ||
      (typeof e.heat === "number" && e.heat >= 7) ||
      (e.severity === "high" && !e.rank),
  );
}

export async function loadEvents() {
  const raw = pruneTrackWindow(await readJson(paths.events(), []));
  const next = normalizeEvents(raw).slice(0, config.maxEvents);
  if (needsLegacyCleanup(raw) || next.length !== raw.length) {
    await writeJson(paths.events(), next);
  }
  return next;
}

export async function appendEvents(newEvents) {
  const events = await loadEvents();
  if (!newEvents.length) return events;
  const next = normalizeEvents(pruneTrackWindow([...newEvents, ...events])).slice(
    0,
    config.maxEvents,
  );
  await writeJson(paths.events(), next);
  return next;
}

export async function loadSnapshots() {
  return readJson(paths.snapshots(), []);
}

export async function saveLatestSnapshot(snapshot) {
  await writeJson(paths.latest(), snapshot);
  const snaps = await loadSnapshots();
  const next = [snapshot, ...snaps].slice(0, config.maxSnapshots);
  await writeJson(paths.snapshots(), next);
  return next;
}

export async function loadLatestSnapshot() {
  return readJson(paths.latest(), null);
}