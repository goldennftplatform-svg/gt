import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

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

export async function loadEvents() {
  return readJson(paths.events(), []);
}

export async function appendEvents(newEvents) {
  if (!newEvents.length) return loadEvents();
  const events = await loadEvents();
  const next = [...newEvents, ...events].slice(0, config.maxEvents);
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