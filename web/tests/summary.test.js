import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXERCISES } from '../js/core/exercises.js';
import { summarizeSet } from '../js/core/summary.js';

const rep = (overrides) => ({
  counted: true, grade: 'perfect', score: 100, minAngle: 85, durationSec: 2, cue: 'Great depth!', issues: [],
  ...overrides,
});

test('summarizeSet: totals, averages and the most common issue', () => {
  const results = [
    rep({}),
    rep({ grade: 'warning', score: 85, minAngle: 88, durationSec: 3, issues: ['Keep your chest up'] }),
    rep({ grade: 'warning', score: 70, minAngle: 80, durationSec: 2.5, issues: ['Keep your chest up', 'Push your knees out'] }),
    rep({ counted: false, grade: 'partial', score: 0, minAngle: 120, issues: ['Push your knees out'] }),
    rep({ counted: false, grade: 'partial', score: 0, minAngle: 125, issues: ['Keep your chest up'] }),
  ];
  const s = summarizeSet({ exercise: EXERCISES.squat, results, startedAt: 1_000, endedAt: 61_000 });
  assert.equal(s.exercise, 'squat');
  assert.equal(s.reps, 3);
  assert.equal(s.partials, 2);
  assert.equal(s.avgScore, 85); // (100 + 85 + 70) / 3
  assert.equal(s.bestAngle, 80); // partial reps don't count toward best depth
  assert.equal(s.avgTempoSec, 2.5);
  assert.equal(s.durationSec, 60);
  assert.deepEqual(s.topIssue, { cue: 'Keep your chest up', count: 3 });
  assert.equal(s.results.length, 5);
});

test('summarizeSet: an empty set has sensible defaults', () => {
  const s = summarizeSet({ exercise: EXERCISES.curl, results: [], startedAt: 0, endedAt: 5_000 });
  assert.equal(s.reps, 0);
  assert.equal(s.avgScore, 0);
  assert.equal(s.bestAngle, null);
  assert.equal(s.avgTempoSec, null);
  assert.equal(s.topIssue, null);
});
