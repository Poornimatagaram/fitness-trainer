// The rep counter: a small state machine fed one frame at a time.
//
//            angle < start                      angle > end
//   [ up ] ─────────────────▶ [ down ] ───────────────────────▶ grade rep ─▶ [ up ]
//                               │  ▲
//                               │  └── rose past halfway, then dropped below `start`
//                               └────▶ again without locking out: grade as partial,
//                                      start a new attempt
//
// While in `down` we remember the LOWEST angle reached and the min/max of every
// form metric. The rep is graded once, when it finishes, using those numbers.

import { extractFeatures } from './features.js';
import { EmaFilter } from './geometry.js';
import { depthProgress } from './exercises.js';

export const SMOOTHING_SECONDS = 0.08; // EMA time constant for angles and metrics
export const LOST_TIMEOUT_SECONDS = 1.0; // abandon a rep if the body is hidden this long
export const ISSUE_PENALTY = 15; // score points lost per form issue
const METRICS = ['torsoLean', 'elbowDrift', 'hipSag', 'kneeWidthRatio'];

export class RepCounter {
  constructor(exercise) {
    this.exercise = exercise;
    this.filters = { angle: new EmaFilter(SMOOTHING_SECONDS) };
    for (const name of METRICS) this.filters[name] = new EmaFilter(SMOOTHING_SECONDS);
    this.reset();
  }

  reset() {
    this.phase = 'up';
    this.side = null;
    this.rep = null; // stats for the rep in progress
    this.lastSeen = null; // time of the last frame with a visible body
    this.reps = 0;
    this.partials = 0;
    this.results = [];
    this.resetFilters();
  }

  resetFilters() {
    for (const filter of Object.values(this.filters)) filter.reset();
  }

  /**
   * Process one frame.
   * @param landmarks   33 landmarks, or null/undefined if no person was detected
   * @param timestampMs frame time in milliseconds
   * @param aspect      video width / height
   * @returns a frame summary for the UI; `rep` is set on the frame a rep finishes
   */
  update(landmarks, timestampMs, aspect = 1) {
    const t = timestampMs / 1000;
    const raw = extractFeatures(landmarks, { joints: this.exercise.joints, aspect, currentSide: this.side });
    if (!raw) return this.handleLost(t);

    this.lastSeen = t;
    this.side = raw.side;
    const f = this.smooth(raw, t);
    const { start, end } = this.exercise.thresholds;
    let finished = null;

    if (this.phase === 'up') {
      if (f.angle < start) this.beginRep(t, f);
    } else {
      trackRep(this.rep, f);
      if (f.angle > end) {
        finished = this.finishRep(t, true);
      } else if (this.rep.rose && f.angle < start) {
        // Came most of the way up, then went back down without locking out.
        finished = this.finishRep(t, false);
        this.beginRep(t, f);
      } else if (f.angle > (start + end) / 2) {
        this.rep.rose = true;
      }
    }

    return {
      tracked: true,
      phase: this.phase,
      angle: f.angle,
      side: this.side,
      view: raw.view,
      progress: depthProgress(this.exercise, f.angle),
      liveCues: this.phase === 'down' ? liveCues(this.exercise, this.rep, f) : [],
      rep: finished,
    };
  }

  /** Smooth the main angle and each metric. A metric that disappears resets its filter. */
  smooth(raw, t) {
    const smoothed = { angle: this.filters.angle.update(raw.angle, t) };
    for (const name of METRICS) {
      if (raw[name] === null) {
        this.filters[name].reset();
        smoothed[name] = null;
      } else {
        smoothed[name] = this.filters[name].update(raw[name], t);
      }
    }
    return smoothed;
  }

  beginRep(t, f) {
    this.phase = 'down';
    this.rep = { startT: t, minAngle: f.angle, rose: false, metrics: {} };
    trackRep(this.rep, f);
  }

  finishRep(t, lockedOut) {
    const result = gradeRep(this.exercise, this.rep, t, lockedOut);
    if (result.counted) this.reps += 1;
    else this.partials += 1;
    result.number = result.counted ? this.reps : null;
    this.results.push(result);
    this.phase = 'up';
    this.rep = null;
    return result;
  }

  handleLost(t) {
    // A short dropout (a missed frame) is ignored. A long one abandons the rep,
    // because we can no longer trust what happened while the body was hidden.
    if (this.lastSeen === null || t - this.lastSeen > LOST_TIMEOUT_SECONDS) {
      this.phase = 'up';
      this.rep = null;
      this.side = null;
      this.resetFilters();
    }
    return { tracked: false, phase: this.phase, angle: null, side: this.side, view: null, progress: 0, liveCues: [], rep: null };
  }
}

/** Record the lowest angle and the min/max of each metric for the rep in progress. */
function trackRep(rep, f) {
  rep.minAngle = Math.min(rep.minAngle, f.angle);
  for (const name of METRICS) {
    const value = f[name];
    if (value === null) continue;
    const stats = rep.metrics[name];
    if (!stats) rep.metrics[name] = { min: value, max: value };
    else {
      stats.min = Math.min(stats.min, value);
      stats.max = Math.max(stats.max, value);
    }
  }
}

/** The value a check looks at: the max, min, or range of its metric over the rep. */
function aggregate(rep, check) {
  const stats = rep.metrics[check.metric];
  if (!stats) return null; // never measured, e.g. knee width from a side view
  if (check.agg === 'max') return stats.max;
  if (check.agg === 'min') return stats.min;
  return stats.max - stats.min; // 'range'
}

function violates(check, value) {
  if (value === null) return false;
  return check.op === '>' ? value > check.limit : value < check.limit;
}

/** Form problems happening right now (shown live while the rep is in progress). */
function liveCues(exercise, rep, f) {
  return exercise.checks
    .filter((check) => violates(check, check.agg === 'range' ? aggregate(rep, check) : f[check.metric]))
    .map((check) => check.cue);
}

/**
 * Grade a finished rep. Pure function so it is easy to test.
 * Depth decides whether the rep counts; form issues lower the score.
 *   grade: 'perfect' | 'good'  - counted, clean form (green)
 *          'warning'           - counted, but with a form issue (amber)
 *          'partial'           - not counted: too shallow or no lockout (red)
 */
export function gradeRep(exercise, rep, endT, lockedOut) {
  const { good, perfect } = exercise.thresholds;
  const issues = exercise.checks.filter((check) => violates(check, aggregate(rep, check))).map((check) => check.cue);
  const base = {
    minAngle: Math.round(rep.minAngle),
    durationSec: Math.round((endT - rep.startT) * 100) / 100,
    issues,
  };

  if (rep.minAngle > good) return { ...base, counted: false, grade: 'partial', score: 0, cue: exercise.cues.shallow };
  if (!lockedOut) return { ...base, counted: false, grade: 'partial', score: 0, cue: exercise.cues.lockout };

  // Full points at perfect depth; 80 at the minimum counted depth, linear in between.
  const depthScore = rep.minAngle <= perfect ? 100 : 80 + (20 * (good - rep.minAngle)) / (good - perfect);
  const score = Math.max(0, Math.round(depthScore - ISSUE_PENALTY * issues.length));
  if (issues.length > 0) return { ...base, counted: true, grade: 'warning', score, cue: issues[0] };

  const grade = rep.minAngle <= perfect ? 'perfect' : 'good';
  return { ...base, counted: true, grade, score, cue: exercise.cues[grade] };
}
