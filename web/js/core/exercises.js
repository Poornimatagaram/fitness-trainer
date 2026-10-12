// Every exercise is plain data. The rep counter is generic: adding an exercise
// means adding an entry here, not writing new counting code.
//
// thresholds (degrees, measured at the middle joint of `joints`):
//   start   - a rep attempt begins when the angle drops below this
//   end     - the rep finishes when the angle rises back above this (lockout)
//   good    - the lowest angle must reach this for the rep to count
//   perfect - reaching this earns full depth points
// The gap between `start` and `end` is hysteresis: small wobbles near one
// threshold cannot flip the state back and forth and double-count.
//
// checks are form rules evaluated over the whole rep:
//   metric - a feature name from features.js
//   agg    - 'max' | 'min' | 'range' (max - min) of that metric during the rep
//   op     - '>' or '<' compared with `limit`; true means the rule is broken
//   cue    - what we tell the user

export const EXERCISES = {
  squat: {
    id: 'squat',
    name: 'Squat',
    muscles: 'Quads · Glutes',
    joints: ['hip', 'knee', 'ankle'],
    thresholds: { start: 140, end: 160, good: 100, perfect: 90 },
    cues: {
      perfect: 'Great depth!',
      good: 'Good rep',
      shallow: 'Go deeper',
      lockout: 'Stand all the way up',
    },
    checks: [
      { metric: 'torsoLean', agg: 'max', op: '>', limit: 55, cue: 'Keep your chest up' },
      { metric: 'kneeWidthRatio', agg: 'min', op: '<', limit: 0.8, cue: 'Push your knees out' },
    ],
    setup: 'Side-on to the camera, phone at hip height, 2–3 m away. Face the camera to check your knees.',
  },
  lunge: {
    id: 'lunge',
    name: 'Lunge',
    muscles: 'Quads · Glutes',
    joints: ['hip', 'knee', 'ankle'],
    thresholds: { start: 140, end: 155, good: 105, perfect: 95 },
    cues: {
      perfect: 'Great lunge!',
      good: 'Good rep',
      shallow: 'Drop your back knee lower',
      lockout: 'Stand tall between reps',
    },
    checks: [{ metric: 'torsoLean', agg: 'max', op: '>', limit: 30, cue: 'Keep your torso upright' }],
    setup: 'Side-on to the camera, 2–3 m away. Lunge in place so you stay in frame.',
  },
  curl: {
    id: 'curl',
    name: 'Bicep Curl',
    muscles: 'Biceps',
    joints: ['shoulder', 'elbow', 'wrist'],
    // A straight arm only reads ~150-155° in 2D (see the push-up eval clip), so lockout is 140.
    thresholds: { start: 110, end: 140, good: 60, perfect: 45 },
    cues: {
      perfect: 'Full squeeze!',
      good: 'Good curl',
      shallow: 'Curl all the way up',
      lockout: 'Lower all the way down',
    },
    checks: [
      { metric: 'elbowDrift', agg: 'max', op: '>', limit: 35, cue: 'Keep your elbows pinned' },
      { metric: 'torsoLean', agg: 'range', op: '>', limit: 15, cue: "Don't swing your body" },
    ],
    setup: 'Side-on to the camera with the working arm closest to it. Upper body in frame.',
  },
  pushup: {
    id: 'pushup',
    name: 'Push-up',
    muscles: 'Chest · Triceps',
    joints: ['shoulder', 'elbow', 'wrist'],
    // Calibrated on real video: locked-out arms plateau at ~150-155°, so 155 missed reps.
    thresholds: { start: 130, end: 145, good: 100, perfect: 90 },
    cues: {
      perfect: 'Chest to floor!',
      good: 'Good push-up',
      shallow: 'Go lower',
      lockout: 'Lock out your arms',
    },
    checks: [
      { metric: 'hipSag', agg: 'max', op: '>', limit: 20, cue: "Don't let your hips sag" },
      { metric: 'hipSag', agg: 'min', op: '<', limit: -20, cue: 'Lower your hips' },
    ],
    setup: 'Phone on the floor, side-on, 2 m away so your whole body fits in frame.',
  },
};

export const EXERCISE_LIST = Object.values(EXERCISES);

/** 0 at lockout, 1 at "perfect" depth. Drives the on-screen depth meter. */
export function depthProgress(exercise, angle) {
  const { end, perfect } = exercise.thresholds;
  return Math.min(1, Math.max(0, (end - angle) / (end - perfect)));
}
