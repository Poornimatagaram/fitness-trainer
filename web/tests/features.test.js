import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractFeatures, pickSide } from '../js/core/features.js';
import { sidePose, plankPose, frontPose } from './helpers/puppet.js';

const LEG = ['hip', 'knee', 'ankle'];
const ARM = ['shoulder', 'elbow', 'wrist'];
const close = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

test('measures the knee angle and torso lean from a side view', () => {
  const f = extractFeatures(sidePose({ knee: 95, torsoLean: 35 }), { joints: LEG });
  close(f.angle, 95);
  close(f.torsoLean, 35);
  assert.equal(f.view, 'side');
  assert.equal(f.kneeWidthRatio, null); // knee cave is not measurable side-on
});

test('measures the elbow angle and elbow drift for arm exercises', () => {
  const f = extractFeatures(sidePose({ elbow: 50, upperArm: 25 }), { joints: ARM });
  close(f.angle, 50);
  close(f.elbowDrift, 25);
});

test('aspect-ratio correction recovers true angles from a 16:9 frame', () => {
  const aspect = 16 / 9;
  const frame = sidePose({ knee: 120, aspect });
  close(extractFeatures(frame, { joints: LEG, aspect }).angle, 120);
  // Without the correction the same frame reads several degrees off.
  assert.ok(Math.abs(extractFeatures(frame, { joints: LEG }).angle - 120) > 5);
});

test('returns null when the body is not visible enough', () => {
  const frame = sidePose({ nearVis: 0.2, farVis: 0.1 });
  assert.equal(extractFeatures(frame, { joints: LEG }), null);
  assert.equal(extractFeatures(null, { joints: LEG }), null);
});

test('pickSide: chooses the more visible side', () => {
  const frame = sidePose({ nearVis: 0.6, farVis: 0.9 });
  assert.equal(pickSide(frame, LEG), 'right');
});

test('pickSide: sticks with the current side unless the other is clearly better', () => {
  const frame = sidePose({ nearVis: 0.8, farVis: 0.88 }); // right only slightly better
  assert.equal(pickSide(frame, LEG, 'left'), 'left');
  const clearlyBetter = sidePose({ nearVis: 0.6, farVis: 0.95 });
  assert.equal(pickSide(clearlyBetter, LEG, 'left'), 'right');
});

test('hipSag: positive when hips drop, negative when they pike', () => {
  close(extractFeatures(plankPose({ hipSag: 25 }), { joints: ARM }).hipSag, 25);
  close(extractFeatures(plankPose({ hipSag: -30 }), { joints: ARM }).hipSag, -30);
  close(extractFeatures(plankPose({ hipSag: 0 }), { joints: ARM }).hipSag, 0);
});

test('front view is detected and knee width ratio is measured', () => {
  const f = extractFeatures(frontPose({ kneeRatio: 0.6 }), { joints: LEG });
  assert.equal(f.view, 'front');
  close(f.kneeWidthRatio, 0.6);
});
