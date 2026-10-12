// Workout history and settings, saved in the browser's localStorage.
// localStorage only stores strings, so everything is JSON-encoded.
// The storage object is injectable so tests can pass a fake.

export const HISTORY_KEY = 'spotter.history.v1';
export const SETTINGS_KEY = 'spotter.settings.v1';
export const MAX_SETS = 300; // keep storage small; oldest sets are dropped first
export const DEFAULT_SETTINGS = {
  exercise: 'squat',
  voice: true,
  facing: 'user', // 'user' = front camera, 'environment' = rear camera
  countdown: 5, // seconds to get into position
  targetReps: 0, // 0 = no target
};

const DAY_MS = 24 * 60 * 60 * 1000;

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback; // corrupted data or storage blocked (e.g. private mode)
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage blocked: the app keeps working, it just can't save.
  }
}

export function createStore(storage = globalThis.localStorage) {
  return {
    loadHistory() {
      return readJson(storage, HISTORY_KEY, []);
    },
    /** Add a set to the front of the history (newest first). */
    saveSet(set) {
      const history = [set, ...this.loadHistory()].slice(0, MAX_SETS);
      writeJson(storage, HISTORY_KEY, history);
      return history;
    },
    clearHistory() {
      storage.removeItem(HISTORY_KEY);
    },
    loadSettings() {
      return { ...DEFAULT_SETTINGS, ...readJson(storage, SETTINGS_KEY, {}) };
    },
    saveSettings(settings) {
      writeJson(storage, SETTINGS_KEY, settings);
    },
  };
}

/** Totals for the last 7 days. The average score is weighted by reps. */
export function weeklyStats(history, now = Date.now()) {
  const recent = history.filter((set) => now - set.startedAt < 7 * DAY_MS);
  const reps = recent.reduce((sum, set) => sum + set.reps, 0);
  const weighted = recent.reduce((sum, set) => sum + set.avgScore * set.reps, 0);
  return { sets: recent.length, reps, avgScore: reps ? Math.round(weighted / reps) : 0 };
}

/** Group sets by calendar day for the history list: [{ label, sets }]. */
export function groupByDay(history, now = Date.now()) {
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - DAY_MS).toDateString();
  const groups = [];
  for (const set of history) {
    const date = new Date(set.startedAt);
    const key = date.toDateString();
    let label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (key === today) label = 'Today';
    else if (key === yesterday) label = 'Yesterday';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.sets.push(set);
    else groups.push({ key, label, sets: [set] });
  }
  return groups;
}
