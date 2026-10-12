// A stick-figure "puppet" that builds synthetic MediaPipe landmarks from joint
// angles, so the rep logic can be tested without a camera or a model.
// The same puppet exists in python/tests/puppet.py; keep them in sync.

import { LANDMARK_COUNT } from '../../js/core/landmarks.js';

const RAD = Math.PI / 180;
const SHIN = 0.2, THIGH = 0.2, TORSO = 0.25, UPPER_ARM = 0.13, FOREARM = 0.12;

const add = (p, v, length) => ({ x: p.x + v.x * length, y: p.y + v.y * length });
// Rotate a vector by `deg` degrees (with y pointing down, positive = clockwise on screen).
const rotate = (v, deg) => ({
  x: v.x * Math.cos(deg * RAD) - v.y * Math.sin(deg * RAD),
  y: v.x * Math.sin(deg * RAD) + v.y * Math.cos(deg * RAD),
});
const flip = (v) => ({ x: -v.x, y: -v.y });

function emptyLandmarks() {
  return Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
}

/**
 * Write one side's joints into `landmarks`. Points are built in square units;
 * x is divided by `aspect` to get normalised image coordinates like MediaPipe's.
 */
function setSide(landmarks, side, joints, visibility, aspect, xOffset = 0) {
  const ids = side === 'left'
    ? { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 }
    : { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 };
  for (const [name, p] of Object.entries(joints)) {
    landmarks[ids[name]] = { x: (p.x + xOffset) / aspect, y: p.y, z: 0, visibility };
  }
}

/**
 * Standing figure seen from the side, facing +x.
 * knee/elbow: joint angles; torsoLean: degrees forward from vertical;
 * upperArm: angle between upper arm and torso.
 */
export function sidePose({
  knee = 175, elbow = 170, torsoLean = 5, upperArm = 10,
  nearVis = 0.95, farVis = 0.4, aspect = 1,
} = {}) {
  const ankle = { x: 0.5, y: 0.9 };
  const kneePt = add(ankle, { x: 0, y: -1 }, SHIN); // vertical shin
  const thighDir = rotate({ x: 0, y: 1 }, knee); // knee->hip, `knee` degrees from knee->ankle
  const hip = add(kneePt, thighDir, THIGH);
  const shoulder = add(hip, { x: Math.sin(torsoLean * RAD), y: -Math.cos(torsoLean * RAD) }, TORSO);
  const torsoDown = { x: -Math.sin(torsoLean * RAD), y: Math.cos(torsoLean * RAD) };
  const elbowPt = add(shoulder, rotate(torsoDown, -upperArm), UPPER_ARM); // arm swings forward
  const forearmDir = rotate(flip(rotate(torsoDown, -upperArm)), elbow);
  const wrist = add(elbowPt, forearmDir, FOREARM);

  const joints = { shoulder, elbow: elbowPt, wrist, hip, knee: kneePt, ankle };
  const landmarks = emptyLandmarks();
  setSide(landmarks, 'left', joints, nearVis, aspect);
  setSide(landmarks, 'right', joints, farVis, aspect, 0.01); // far side nearly overlaps
  return landmarks;
}

/** Push-up plank seen from the side. hipSag > 0 drops the hips below the body line. */
export function plankPose({ elbow = 170, hipSag = 0, aspect = 1 } = {}) {
  const wrist = { x: 0.3, y: 0.8 };
  const elbowPt = add(wrist, { x: 0, y: -1 }, FOREARM); // vertical forearm
  const shoulder = add(elbowPt, rotate({ x: 0, y: 1 }, elbow), UPPER_ARM);
  const slope = 10; // body tilts down toward the feet
  const hip = add(shoulder, rotate({ x: 1, y: 0 }, slope + hipSag / 2), TORSO);
  const ankle = add(hip, rotate({ x: 1, y: 0 }, slope - hipSag / 2), THIGH + SHIN);
  const knee = add(hip, rotate({ x: 1, y: 0 }, slope - hipSag / 2), THIGH);

  const joints = { shoulder, elbow: elbowPt, wrist, hip, knee, ankle };
  const landmarks = emptyLandmarks();
  setSide(landmarks, 'left', joints, 0.95, aspect);
  setSide(landmarks, 'right', joints, 0.4, aspect, 0.01);
  return landmarks;
}

/** Standing figure facing the camera. kneeRatio < 1 pulls the knees inward (valgus). */
export function frontPose({ kneeRatio = 1, aspect = 1 } = {}) {
  const landmarks = emptyLandmarks();
  const half = { shoulder: 0.1, elbow: 0.12, wrist: 0.12, hip: 0.06, knee: 0.08 * kneeRatio, ankle: 0.08 };
  const y = { shoulder: 0.3, elbow: 0.42, wrist: 0.52, hip: 0.55, knee: 0.72, ankle: 0.9 };
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1; // the person's left appears on image right
    const joints = Object.fromEntries(Object.keys(y).map((j) => [j, { x: 0.5 + sign * half[j], y: y[j] }]));
    setSide(landmarks, side, joints, 0.9, aspect);
  }
  return landmarks;
}

/**
 * Interpolate between keyframe values with a short hold at each keyframe.
 * trajectory([175, 85, 175]) -> 175 ... 85 (held) ... 175
 */
export function trajectory(keyframes, { steps = 20, hold = 6 } = {}) {
  const values = [];
  for (let i = 0; i < keyframes.length - 1; i++) {
    for (let h = 0; h < hold; h++) values.push(keyframes[i]);
    for (let s = 0; s < steps; s++) values.push(keyframes[i] + ((keyframes[i + 1] - keyframes[i]) * s) / steps);
  }
  for (let h = 0; h < hold; h++) values.push(keyframes[keyframes.length - 1]);
  return values;
}

/** Feed frames to a counter at a fixed frame rate; returns the counter. */
export function run(counter, frames, { fps = 30, aspect = 1, startMs = 0 } = {}) {
  frames.forEach((landmarks, i) => counter.update(landmarks, startMs + (i * 1000) / fps, aspect));
  return counter;
}
