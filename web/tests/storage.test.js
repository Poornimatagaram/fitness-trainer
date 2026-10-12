import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, weeklyStats, groupByDay, DEFAULT_SETTINGS, MAX_SETS } from '../js/storage.js';

/** Minimal in-memory stand-in for window.localStorage. */
function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 12, 18, 0).getTime(); // 12 Oct 2026, 6pm local time

test('history: saves newest first and survives a reload', () => {
  const storage = fakeStorage();
  const store = createStore(storage);
  store.saveSet({ id: 'a', reps: 5 });
  store.saveSet({ id: 'b', reps: 8 });
  assert.deepEqual(createStore(storage).loadHistory().map((s) => s.id), ['b', 'a']);
});

test('history: is capped so localStorage cannot grow forever', () => {
  const store = createStore(fakeStorage());
  for (let i = 0; i < MAX_SETS + 5; i++) store.saveSet({ id: String(i) });
  const history = store.loadHistory();
  assert.equal(history.length, MAX_SETS);
  assert.equal(history[0].id, String(MAX_SETS + 4));
});

test('history: clear and corrupted data both give an empty list', () => {
  const storage = fakeStorage();
  const store = createStore(storage);
  store.saveSet({ id: 'a' });
  store.clearHistory();
  assert.deepEqual(store.loadHistory(), []);
  storage.setItem('spotter.history.v1', '{not json');
  assert.deepEqual(store.loadHistory(), []);
});

test('settings: defaults are filled in for missing keys', () => {
  const store = createStore(fakeStorage());
  assert.deepEqual(store.loadSettings(), DEFAULT_SETTINGS);
  store.saveSettings({ voice: false });
  assert.equal(store.loadSettings().voice, false);
  assert.equal(store.loadSettings().countdown, DEFAULT_SETTINGS.countdown);
});

test('weeklyStats: only counts the last 7 days and weights score by reps', () => {
  const history = [
    { startedAt: NOW - 1 * DAY, reps: 10, avgScore: 90 },
    { startedAt: NOW - 3 * DAY, reps: 5, avgScore: 60 },
    { startedAt: NOW - 9 * DAY, reps: 50, avgScore: 10 },
  ];
  assert.deepEqual(weeklyStats(history, NOW), { sets: 2, reps: 15, avgScore: 80 });
  assert.deepEqual(weeklyStats([], NOW), { sets: 0, reps: 0, avgScore: 0 });
});

test('groupByDay: labels today and yesterday and keeps sets together', () => {
  const history = [
    { id: 1, startedAt: NOW - 60_000 },
    { id: 2, startedAt: NOW - 120_000 },
    { id: 3, startedAt: NOW - DAY },
    { id: 4, startedAt: NOW - 4 * DAY },
  ];
  const groups = groupByDay(history, NOW);
  assert.deepEqual(groups.map((g) => g.label).slice(0, 2), ['Today', 'Yesterday']);
  assert.deepEqual(groups.map((g) => g.sets.length), [2, 1, 1]);
});
