// Small, pure math helpers. Points are plain objects: { x, y }.
// Image coordinates: x grows to the right, y grows DOWNWARD.

/** Angle ABC measured at vertex b, in degrees between 0 and 180. */
export function angleAt(a, b, c) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let degrees = Math.abs((radians * 180) / Math.PI);
  if (degrees > 180) degrees = 360 - degrees; // always report the inner angle
  return degrees;
}

/** How far the line from `bottom` to `top` tilts away from straight up (0 = vertical). */
export function tiltFromVertical(top, bottom) {
  const dx = top.x - bottom.x;
  const dy = bottom.y - top.y; // flip y so "up" is positive
  return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Exponential moving average that smooths by *time*, not by frame count.
 * A phone might run at 15 fps or 60 fps; using the elapsed time `dt` keeps
 * the smoothing (and its lag) the same either way.
 */
export class EmaFilter {
  constructor(timeConstantSec) {
    this.tau = timeConstantSec;
    this.reset();
  }

  reset() {
    this.value = null;
    this.lastT = null;
  }

  update(x, tSec) {
    if (this.value === null) {
      this.value = x; // first sample: nothing to smooth against yet
    } else {
      const dt = Math.max(0, tSec - this.lastT);
      const alpha = 1 - Math.exp(-dt / this.tau); // 0 = ignore new sample, 1 = jump to it
      this.value += alpha * (x - this.value);
    }
    this.lastT = tSec;
    return this.value;
  }
}
