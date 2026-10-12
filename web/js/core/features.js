// Turns 33 raw landmarks into the handful of numbers the exercises care about:
// the main joint angle plus a few posture metrics used by the form checks.

import { LANDMARK_COUNT, SIDES } from './landmarks.js';
import { angleAt, distance, midpoint, tiltFromVertical } from './geometry.js';

export const MIN_VISIBILITY = 0.5; // ignore joints the model is unsure about
export const SIDE_SWITCH_MARGIN = 0.15; // how much better the other side must be to switch
export const FRONT_VIEW_RATIO = 0.5; // shoulder width / torso length above this = facing camera

/** Some MediaPipe builds omit visibility; treat a missing value as fully visible. */
function visibilityOf(landmark) {
  return landmark.visibility ?? 1;
}

/** The lowest visibility among `joints` on one side (a chain is only as good as its weakest joint). */
export function sideVisibility(landmarks, side, joints) {
  return Math.min(...joints.map((joint) => visibilityOf(landmarks[SIDES[side][joint]])));
}

/**
 * Choose which side of the body to measure. From a side view the far limbs are
 * hidden, so we use the side the model sees best. To stop the reading flickering
 * between sides mid-rep, we keep the current side unless the other one is clearly
 * better. Returns 'left', 'right', or null if neither side is visible enough.
 */
export function pickSide(landmarks, joints, currentSide = null) {
  const vis = {
    left: sideVisibility(landmarks, 'left', joints),
    right: sideVisibility(landmarks, 'right', joints),
  };
  let side = vis.left >= vis.right ? 'left' : 'right';
  if (currentSide) {
    const other = currentSide === 'left' ? 'right' : 'left';
    const stillVisible = vis[currentSide] >= MIN_VISIBILITY;
    if (stillVisible && vis[other] - vis[currentSide] < SIDE_SWITCH_MARGIN) side = currentSide;
  }
  return vis[side] >= MIN_VISIBILITY ? side : null;
}

/**
 * Signed bend at the hip relative to a straight shoulder-to-ankle line, in degrees.
 * Positive = hips sag below the line, negative = hips pike above it. Used for push-ups.
 */
export function hipSag(shoulder, hip, ankle) {
  const bend = 180 - angleAt(shoulder, hip, ankle);
  const dx = ankle.x - shoulder.x;
  if (Math.abs(dx) < 1e-6) return 0; // body is vertical: sag is not meaningful
  // Height of the straight line at the hip's x position (y grows downward).
  const lineY = shoulder.y + ((hip.x - shoulder.x) / dx) * (ankle.y - shoulder.y);
  return hip.y > lineY ? bend : -bend;
}

/**
 * Front-view metrics. Facing the camera, the shoulders look wide compared with the
 * torso; side-on they overlap. Knee cave (valgus) is only measurable from the front:
 * we compare how far apart the knees are with how far apart the ankles are.
 */
function frontViewFeatures(point) {
  const [ls, rs, lh, rh] = [11, 12, 23, 24].map(point);
  if (!ls || !rs || !lh || !rh) return { view: 'side', kneeWidthRatio: null };

  const torsoLength = distance(midpoint(ls, rs), midpoint(lh, rh));
  const shoulderWidth = Math.abs(ls.x - rs.x);
  const view = torsoLength > 0 && shoulderWidth / torsoLength > FRONT_VIEW_RATIO ? 'front' : 'side';

  let kneeWidthRatio = null;
  const [lk, rk, la, ra] = [25, 26, 27, 28].map(point);
  if (view === 'front' && lk && rk && la && ra) {
    const ankleWidth = Math.abs(la.x - ra.x);
    if (ankleWidth > 0.02) kneeWidthRatio = Math.abs(lk.x - rk.x) / ankleWidth;
  }
  return { view, kneeWidthRatio };
}

/**
 * Extract features for one video frame.
 * @param landmarks  33 MediaPipe landmarks ({x, y, visibility}, x/y normalised 0–1)
 * @param joints     the three joints of the exercise's main angle, e.g. ['hip','knee','ankle']
 * @param aspect     video width / height. Normalised x and y use different units
 *                   (fractions of width vs height); multiplying x by the aspect ratio
 *                   makes them square again so angles are not distorted.
 * @param currentSide the side used on the previous frame (for sticky side selection)
 * @returns features object, or null if the body is not visible enough.
 */
export function extractFeatures(landmarks, { joints, aspect = 1, currentSide = null }) {
  if (!landmarks || landmarks.length < LANDMARK_COUNT) return null;
  const side = pickSide(landmarks, joints, currentSide);
  if (!side) return null;

  // Visible joints become square-unit points; unsure joints become null.
  const point = (index) => {
    const lm = landmarks[index];
    return visibilityOf(lm) >= MIN_VISIBILITY ? { x: lm.x * aspect, y: lm.y } : null;
  };
  const s = SIDES[side];
  const [a, b, c] = joints.map((joint) => point(s[joint]));
  const shoulder = point(s.shoulder);
  const elbow = point(s.elbow);
  const hip = point(s.hip);
  const ankle = point(s.ankle);

  return {
    side,
    angle: angleAt(a, b, c), // the main angle that drives rep counting
    torsoLean: shoulder && hip ? tiltFromVertical(shoulder, hip) : null,
    elbowDrift: shoulder && elbow && hip ? angleAt(elbow, shoulder, hip) : null,
    hipSag: shoulder && hip && ankle ? hipSag(shoulder, hip, ankle) : null,
    ...frontViewFeatures(point),
  };
}
