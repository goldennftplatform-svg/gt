import { config } from "./config.js";
import { compileBriefing } from "./briefing.js";
import { runSniff } from "./sniffer.js";
import { computeTemperature, inferAgentDesk, translate } from "./translator.js";
import {
  appendEvents,
  loadEvents,
  loadLatestSnapshot,
  loadState,
  saveLatestSnapshot,
  saveState,
} from "./store.js";

export function publicConfig() {
  return {
    pollIntervalMs: config.pollIntervalMs,
    geoffBaseUrl: config.geoffBaseUrl,
    stacknetBaseUrl: config.stacknetBaseUrl,
    catalogAuthConfigured: Boolean(config.geoffCookie || config.geoffPreviewCode),
    mode: process.env.VERCEL ? "vercel" : "local",
    trackWindowHours: config.trackWindowHours,
  };
}

function withBriefing(payload) {
  const agentDesk = inferAgentDesk(payload.latest, payload.newEvents || []);
  return {
    ...payload,
    agentDesk,
    briefing: compileBriefing({
      latest: payload.latest,
      temperature: payload.temperature,
      events: payload.events,
      agentDesk,
    }),
  };
}

export async function getStoredPayload() {
  const [latest, events, state] = await Promise.all([
    loadLatestSnapshot(),
    loadEvents(),
    loadState(),
  ]);
  return withBriefing({
    latest,
    events,
    state,
    temperature: computeTemperature(events, latest),
    config: publicConfig(),
  });
}

/**
 * @param {object} options
 * @param {object|null} [options.previous] previous snapshot (for serverless/client history)
 * @param {object[]} [options.knownEvents] existing events for temperature calc when not persisting
 * @param {boolean} [options.persist] write to local data/ store
 */
export async function pollAndTranslate({
  previous = null,
  knownEvents = [],
  persist = !process.env.VERCEL,
} = {}) {
  const startedState = persist ? await loadState() : { startedAt: null, pollCount: 0 };
  if (!startedState.startedAt) startedState.startedAt = new Date().toISOString();

  const baseline = previous ?? (persist ? await loadLatestSnapshot() : null);
  const snapshot = await runSniff();
  const newEvents = translate(baseline, snapshot);

  let events;
  if (persist) {
    await saveLatestSnapshot(snapshot);
    events = await appendEvents(newEvents);
  } else {
    events = [...newEvents, ...knownEvents].slice(0, config.maxEvents);
  }

  const temperature = computeTemperature(events, snapshot);
  const state = {
    ...startedState,
    lastPollAt: snapshot.takenAt,
    lastError: null,
    pollCount: (startedState.pollCount || 0) + 1,
    temperature: temperature.value,
  };

  if (persist) await saveState(state);

  return withBriefing({
    latest: snapshot,
    events,
    newEvents,
    state,
    temperature,
    config: publicConfig(),
  });
}
