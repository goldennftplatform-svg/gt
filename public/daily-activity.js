/** Compact day rollups for GitHub-style activity cubes (~2 months). */

export const DEFAULT_HEATMAP_DAYS = 60;

const RANK_WEIGHT = { crazy: 5, spike: 4, move: 3, note: 2, whisper: 1 };

export function dayKeyFromDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayKeyFromIso(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  return dayKeyFromDate(new Date(t));
}

export function emptyDay(day) {
  return {
    day,
    count: 0,
    heat: 0,
    crazy: 0,
    spike: 0,
  };
}

export function pruneDailyActivity(rows = [], heatmapDays = DEFAULT_HEATMAP_DAYS) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (heatmapDays - 1));
  const cutoffKey = dayKeyFromDate(cutoff);
  return (rows || [])
    .filter((r) => r?.day && (!cutoffKey || r.day >= cutoffKey))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function upsertDailyActivity(
  rows = [],
  events = [],
  { heatmapDays = DEFAULT_HEATMAP_DAYS, seenIds = null } = {},
) {
  const map = new Map((rows || []).map((r) => [r.day, { ...emptyDay(r.day), ...r }]));
  const seen = seenIds instanceof Set ? seenIds : null;

  for (const e of events || []) {
    // Queue telemetry + cluster chrome are not "what changed" day cubes
    if (!e || e.kind === "agentCluster" || e.kind === "agent") continue;
    if (seen && e.id) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
    }
    const day = dayKeyFromIso(e.at);
    if (!day) continue;
    const row = map.get(day) || emptyDay(day);
    const heat = Number(e.heat);
    const add = Number.isFinite(heat) && heat > 0 ? heat : RANK_WEIGHT[e.rank] || 1;
    row.count += 1;
    row.heat += add;
    if (e.rank === "crazy") row.crazy += 1;
    if (e.rank === "spike") row.spike += 1;
    map.set(day, row);
  }

  return pruneDailyActivity(Array.from(map.values()), heatmapDays);
}

export function mergeDailyActivity(a = [], b = [], heatmapDays = DEFAULT_HEATMAP_DAYS) {
  const map = new Map();
  for (const row of [...(a || []), ...(b || [])]) {
    if (!row?.day) continue;
    const prev = map.get(row.day);
    if (!prev) {
      map.set(row.day, { ...emptyDay(row.day), ...row });
      continue;
    }
    // Prefer the richer observation when two stores overlap (avoid sum double-count).
    map.set(row.day, {
      day: row.day,
      count: Math.max(prev.count || 0, row.count || 0),
      heat: Math.max(prev.heat || 0, row.heat || 0),
      crazy: Math.max(prev.crazy || 0, row.crazy || 0),
      spike: Math.max(prev.spike || 0, row.spike || 0),
    });
  }
  return pruneDailyActivity(Array.from(map.values()), heatmapDays);
}

/** GitHub-like intensity 0–4 from day rollup. */
export function activityLevel(row) {
  if (!row || !row.count) return 0;
  if (row.crazy > 0 || row.heat >= 16) return 4;
  if (row.spike > 0 || row.heat >= 9) return 3;
  if (row.heat >= 4 || row.count >= 3) return 2;
  return 1;
}

/**
 * Build week columns for a GitHub-style grid (Sun→Sat rows).
 * Returns { weeks: [[{day, level, ...}|null] x 7], startKey, endKey }
 */
export function buildHeatmapGrid(rows = [], heatmapDays = DEFAULT_HEATMAP_DAYS) {
  const byDay = new Map((rows || []).map((r) => [r.day, r]));
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (heatmapDays - 1));

  // Align to Sunday of the week containing start (GitHub style).
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const weeks = [];
  const cursor = new Date(gridStart);
  const endTime = end.getTime();

  while (cursor.getTime() <= endTime) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      const key = dayKeyFromDate(cursor);
      const inRange = cursor.getTime() >= start.getTime() && cursor.getTime() <= endTime;
      if (!inRange) {
        week.push(null);
      } else {
        const row = byDay.get(key) || emptyDay(key);
        week.push({
          ...row,
          level: activityLevel(row),
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return {
    weeks,
    startKey: dayKeyFromDate(start),
    endKey: dayKeyFromDate(end),
    heatmapDays,
  };
}
