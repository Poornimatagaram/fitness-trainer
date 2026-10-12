// Draws the skeleton on a <canvas> laid over the video.
// The canvas uses the video's own pixel size, and both use the same CSS
// object-fit, so normalised landmark coordinates map straight onto the picture.

import { SIDES, SKELETON } from './core/landmarks.js';
import { MIN_VISIBILITY } from './core/features.js';

const BONE = 'rgba(255, 255, 255, 0.6)';
const ACTIVE = '#32d74b';
const WARN = '#ffd60a';

const isVisible = (lm) => lm && (lm.visibility ?? 1) >= MIN_VISIBILITY;

/**
 * @param options.mirrored  true for the front camera (the video is flipped with CSS;
 *                          we flip x here instead of flipping the canvas so text stays readable)
 * @param options.joints    the exercise's three angle joints, e.g. ['hip','knee','ankle']
 * @param options.side      which side is being measured, or null
 * @param options.angle     smoothed angle to print at the middle joint
 * @param options.warn      highlight the limb in amber while a form cue is active
 */
export function drawOverlay(canvas, video, landmarks, { mirrored, joints, side, angle, warn }) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;

  const scale = Math.max(w, h) / 1000; // keep line widths consistent across resolutions
  const px = (lm) => ({ x: (mirrored ? 1 - lm.x : lm.x) * w, y: lm.y * h });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Every visible bone, thin and white.
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 4 * scale;
  ctx.beginPath();
  for (const [i, j] of SKELETON) {
    if (!isVisible(landmarks[i]) || !isVisible(landmarks[j])) continue;
    const a = px(landmarks[i]);
    const b = px(landmarks[j]);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // 2. The limb being measured, thick and coloured, with the angle at its middle joint.
  if (!side) return;
  const color = warn ? WARN : ACTIVE;
  const points = joints.map((joint) => px(landmarks[SIDES[side][joint]]));
  ctx.strokeStyle = color;
  ctx.lineWidth = 9 * scale;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.lineTo(points[2].x, points[2].y);
  ctx.stroke();

  ctx.fillStyle = '#fff';
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  if (angle !== null && angle !== undefined) {
    const vertex = points[1];
    const label = `${Math.round(angle)}°`;
    ctx.font = `700 ${Math.round(34 * scale)}px -apple-system, system-ui, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const pad = 10 * scale;
    const boxX = vertex.x + 18 * scale;
    const boxY = vertex.y - 26 * scale;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(boxX, boxY, textWidth + pad * 2, 46 * scale, 12 * scale);
    else ctx.rect(boxX, boxY, textWidth + pad * 2, 46 * scale); // older browsers
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, boxX + pad, boxY + 23 * scale);
  }
}
