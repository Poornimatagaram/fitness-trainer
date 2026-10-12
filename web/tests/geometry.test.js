import { test } from 'node:test';
import assert from 'node:assert/strict';

import { angleAt, tiltFromVertical, EmaFilter } from '../js/core/geometry.js';

const close = (actual, expected, tol = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

test('angleAt: right angle, straight line, and folded joint', () => {
  close(angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 90);
  close(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 180);
  close(angleAt({ x: 1, y: 0.0001 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 0, 0.01);
});

test('angleAt: is symmetric and always returns the inner angle (0-180)', () => {
  const a = { x: 0.2, y: 0.9 }, b = { x: 0.5, y: 0.5 }, c = { x: 0.1, y: 0.1 };
  close(angleAt(a, b, c), angleAt(c, b, a));
  assert.ok(angleAt(a, b, c) <= 180);
});

test('tiltFromVertical: 0 when upright, 90 when horizontal, symmetric left/right', () => {
  close(tiltFromVertical({ x: 0, y: 0 }, { x: 0, y: 1 }), 0);
  close(tiltFromVertical({ x: 1, y: 1 }, { x: 0, y: 1 }), 90);
  close(tiltFromVertical({ x: 1, y: 0 }, { x: 0, y: 1 }), 45);
  close(tiltFromVertical({ x: -1, y: 0 }, { x: 0, y: 1 }), 45);
});

test('EmaFilter: first value passes through, constant input stays constant', () => {
  const f = new EmaFilter(0.1);
  assert.equal(f.update(10, 0), 10);
  close(f.update(10, 0.033), 10);
});

test('EmaFilter: smoothing depends on elapsed time, not frame rate', () => {
  // Step from 0 to 100 and sample both filters after 0.2 s.
  const at30 = new EmaFilter(0.1), at60 = new EmaFilter(0.1);
  at30.update(0, 0);
  at60.update(0, 0);
  let v30 = 0, v60 = 0;
  for (let i = 1; i <= 6; i++) v30 = at30.update(100, i / 30);
  for (let i = 1; i <= 12; i++) v60 = at60.update(100, i / 60);
  close(v30, v60, 1e-9); // identical: 1 - e^(-0.2/0.1) of the way there
  close(v30, 100 * (1 - Math.exp(-2)), 1e-9);
});

test('EmaFilter: reset forgets the previous value', () => {
  const f = new EmaFilter(0.1);
  f.update(50, 0);
  f.reset();
  assert.equal(f.update(120, 1), 120);
});
