// Runs the web app's JavaScript rep counter over a recorded landmark session.
// Lets the Python evaluator (and parity tests) measure the exact code the PWA ships.
//
// Usage: node eval/run_js_counter.mjs <session.json> <exercise-id>
// session.json: { "width": 1280, "height": 720,
//                 "frames": [{ "t": <ms>, "landmarks": [[x, y, z, visibility], ...] | null }, ...] }
// Prints: { "reps": n, "partials": n, "results": [...] }

import { readFileSync } from 'node:fs';
import { EXERCISES } from '../web/js/core/exercises.js';
import { RepCounter } from '../web/js/core/repCounter.js';

const [sessionPath, exerciseId] = process.argv.slice(2);
const exercise = EXERCISES[exerciseId];
if (!sessionPath || !exercise) {
  console.error(`usage: node run_js_counter.mjs <session.json> <${Object.keys(EXERCISES).join('|')}>`);
  process.exit(2);
}

const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
const aspect = session.width / session.height;
const counter = new RepCounter(exercise);

for (const frame of session.frames) {
  const landmarks = frame.landmarks?.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
  counter.update(landmarks ?? null, frame.t, aspect);
}

console.log(JSON.stringify({ reps: counter.reps, partials: counter.partials, results: counter.results }));
