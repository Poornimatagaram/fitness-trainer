import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXERCISES } from '../js/core/exercises.js';
import { RepCounter, gradeRep } from '../js/core/repCounter.js';
import { sidePose, plankPose, trajectory, run } from './helpers/puppet.js';

const squats = (keyframes, extra = {}) => trajectory(keyframes).map((knee) => sidePose({ knee, ...extra }));
const grades = (counter) => counter.results.map((r) => r.grade);

test('squat: counts three deep reps as perfect', () => {
  const counter = run(new RepCounter(EXERCISES.squat), squats([175, 80, 175, 80, 175, 80, 175]));
  assert.equal(counter.reps, 3);
  assert.equal(counter.partials, 0);
  assert.deepEqual(grades(counter), ['perfect', 'perfect', 'perfect']);
  assert.deepEqual(counter.results.map((r) => r.number), [1, 2, 3]);
  assert.ok(counter.results.every((r) => r.score === 100));
});

test('squat: grades by the LOWEST angle, not the angle when standing back up', () => {
  const counter = run(new RepCounter(EXERCISES.squat), squats([175, 80, 175]));
  const [rep] = counter.results;
  assert.ok(rep.minAngle <= 85, `minAngle was ${rep.minAngle}`);
});

test('squat: a shallow rep is not counted and asks for more depth', () => {
  const counter = run(new RepCounter(EXERCISES.squat), squats([175, 120, 175]));
  assert.equal(counter.reps, 0);
  assert.equal(counter.partials, 1);
  assert.equal(counter.results[0].cue, 'Go deeper');
  assert.equal(counter.results[0].score, 0);
});

test('squat: depth between good and perfect counts as "good" with a partial score', () => {
  const counter = run(new RepCounter(EXERCISES.squat), squats([175, 95, 175]));
  assert.equal(counter.reps, 1);
  const [rep] = counter.results;
  assert.equal(rep.grade, 'good');
  assert.ok(rep.score > 80 && rep.score < 100, `score was ${rep.score}`);
});

test('squat: jitter around the thresholds while standing never counts a rep', () => {
  const frames = Array.from({ length: 300 }, (_, i) => sidePose({ knee: 160 + 6 * Math.sin(i * 1.7) }));
  const counter = run(new RepCounter(EXERCISES.squat), frames);
  assert.equal(counter.reps + counter.partials, 0);
});

test('squat: noisy landmarks during a rep do not double count', () => {
  const noisy = trajectory([175, 85, 175]).map((knee, i) => sidePose({ knee: knee + 5 * Math.sin(i * 2.3) }));
  const counter = run(new RepCounter(EXERCISES.squat), noisy);
  assert.equal(counter.reps, 1);
  assert.equal(counter.partials, 0);
});

test('squat: coming most of the way up then dropping again flags a missed lockout', () => {
  const counter = run(new RepCounter(EXERCISES.squat), squats([175, 85, 156, 85, 175]));
  assert.equal(counter.partials, 1);
  assert.equal(counter.results[0].cue, 'Stand all the way up');
  assert.equal(counter.reps, 1); // the second, locked-out rep still counts
});

test('squat: excessive forward lean is counted but flagged', () => {
  const frames = trajectory([175, 85, 175]).map((knee) => sidePose({ knee, torsoLean: knee < 120 ? 65 : 10 }));
  const counter = run(new RepCounter(EXERCISES.squat), frames);
  const [rep] = counter.results;
  assert.equal(rep.counted, true);
  assert.equal(rep.grade, 'warning');
  assert.equal(rep.cue, 'Keep your chest up');
  assert.equal(rep.score, 85); // 100 depth points - 15 for one issue
});

test('squat: live cues fire while the rep is in progress', () => {
  const counter = new RepCounter(EXERCISES.squat);
  const frames = trajectory([175, 85]).map((knee) => sidePose({ knee, torsoLean: knee < 130 ? 65 : 10 }));
  let last;
  frames.forEach((f, i) => (last = counter.update(f, (i * 1000) / 30)));
  assert.equal(last.phase, 'down');
  assert.deepEqual(last.liveCues, ['Keep your chest up']);
});

test('squat: works on a 16:9 frame when the aspect ratio is passed in', () => {
  const aspect = 16 / 9;
  const frames = squats([175, 85, 175, 85, 175], { aspect });
  const counter = run(new RepCounter(EXERCISES.squat), frames, { aspect });
  assert.equal(counter.reps, 2);
});

test('squat: losing the person mid-rep for over a second abandons the attempt', () => {
  const counter = new RepCounter(EXERCISES.squat);
  const down = trajectory([175, 85]).map((knee) => sidePose({ knee }));
  const hidden = Array.from({ length: 45 }, () => null); // 1.5 s with nobody detected
  const nextRep = squats([175, 85, 175]);
  run(counter, [...down, ...hidden, ...nextRep]);
  assert.equal(counter.reps, 1);
  assert.equal(counter.partials, 0);
});

test('squat: a brief dropout (a few frames) does not break the rep', () => {
  const frames = squats([175, 85, 175]);
  frames.splice(40, 5, null, null, null, null, null);
  const counter = run(new RepCounter(EXERCISES.squat), frames);
  assert.equal(counter.reps, 1);
});

test('lunge: counts reps and flags a leaning torso', () => {
  const frames = trajectory([170, 92, 170, 92, 170]).map((knee) => sidePose({ knee, torsoLean: 40 }));
  const counter = run(new RepCounter(EXERCISES.lunge), frames);
  assert.equal(counter.reps, 2);
  assert.ok(counter.results.every((r) => r.cue === 'Keep your torso upright'));
});

test('curl: counts full curls and flags swinging elbows', () => {
  const clean = trajectory([170, 40, 170, 40, 170]).map((elbow) => sidePose({ elbow }));
  const counter = run(new RepCounter(EXERCISES.curl), clean);
  assert.equal(counter.reps, 2);
  assert.deepEqual(grades(counter), ['perfect', 'perfect']);

  const swinging = trajectory([170, 40, 170]).map((elbow) => sidePose({ elbow, upperArm: elbow < 100 ? 50 : 10 }));
  const cheat = run(new RepCounter(EXERCISES.curl), swinging);
  assert.equal(cheat.results[0].cue, 'Keep your elbows pinned');
});

test('curl: a half curl is a partial', () => {
  const counter = run(new RepCounter(EXERCISES.curl), trajectory([170, 90, 170]).map((elbow) => sidePose({ elbow })));
  assert.equal(counter.reps, 0);
  assert.equal(counter.results[0].cue, 'Curl all the way up');
});

test('push-up: counts reps and catches sagging hips', () => {
  const good = trajectory([170, 80, 170]).map((elbow) => plankPose({ elbow }));
  assert.equal(run(new RepCounter(EXERCISES.pushup), good).results[0].grade, 'perfect');

  const sagging = trajectory([170, 80, 170]).map((elbow) => plankPose({ elbow, hipSag: 30 }));
  const counter = run(new RepCounter(EXERCISES.pushup), sagging);
  assert.equal(counter.reps, 1);
  assert.equal(counter.results[0].cue, "Don't let your hips sag");
});

test('gradeRep: knee cave from a front view is reported', () => {
  const rep = { startT: 0, minAngle: 85, metrics: { kneeWidthRatio: { min: 0.6, max: 1.0 } } };
  const result = gradeRep(EXERCISES.squat, rep, 2, true);
  assert.deepEqual(result.issues, ['Push your knees out']);
  assert.equal(result.durationSec, 2);
});

test('gradeRep: score never goes below zero', () => {
  const rep = {
    startT: 0,
    minAngle: 100,
    metrics: { elbowDrift: { min: 10, max: 90 }, torsoLean: { min: 0, max: 80 } },
  };
  const result = gradeRep({ ...EXERCISES.curl, thresholds: { ...EXERCISES.curl.thresholds, good: 100 } }, rep, 1, true);
  assert.equal(result.issues.length, 2);
  assert.equal(result.score, 50); // 80 depth points - 2 x 15
  const many = { ...EXERCISES.curl, checks: Array(10).fill(EXERCISES.curl.checks[0]) };
  assert.equal(gradeRep(many, { ...rep, minAngle: 30 }, 1, true).score, 0);
});
