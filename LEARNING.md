# LEARNING.md: how Spotter works, from first principles

This guide explains everything in this repo as if you're new to it: what each piece does, *why* it was built that way, and how to talk about it in an interview. Read it top to bottom once, then use the table of contents to jump back.

1. [The big picture](#1-the-big-picture)
2. [A tour of the files](#2-a-tour-of-the-files)
3. [Pose estimation 101](#3-pose-estimation-101)
4. [From landmarks to angles](#4-from-landmarks-to-angles)
5. [Choosing which side of the body to measure](#5-choosing-which-side-of-the-body-to-measure)
6. [Smoothing noisy measurements](#6-smoothing-noisy-measurements)
7. [Counting reps: the state machine](#7-counting-reps-the-state-machine)
8. [Form checks and scoring](#8-form-checks-and-scoring)
9. [Exercises are data](#9-exercises-are-data)
10. [The web app](#10-the-web-app)
11. [The PWA and the service worker](#11-the-pwa-and-the-service-worker)
12. [Saving history](#12-saving-history)
13. [The Python reference and parity tests](#13-the-python-reference-and-parity-tests)
14. [Testing strategy](#14-testing-strategy)
15. [Evaluation, and the bug it found](#15-evaluation-and-the-bug-it-found)
16. [Design decisions at a glance](#16-design-decisions-at-a-glance)
17. [Limitations and what to build next](#17-limitations-and-what-to-build-next)
18. [Glossary](#18-glossary)
19. [Interview questions and answers](#19-interview-questions-and-answers)

---

## 1. The big picture

Spotter is a website that behaves like an app (a **Progressive Web App**, or PWA). When you start a set, this loop runs about 30 times a second, entirely on your phone:

```
camera frame
   │  getUserMedia gives us a live <video>
   ▼
MediaPipe PoseLandmarker      ← a neural network running in WebAssembly + the GPU
   │  33 body landmarks: {x, y, visibility} each
   ▼
features.js                   ← geometry: knee/elbow angle, torso lean, hip sag…
   │
   ▼
repCounter.js                 ← smoothing + a state machine + form rules
   │  "rep finished: 84°, perfect, 100 points"
   ▼
HUD + skeleton + voice        ← what you see and hear
   │  when you tap End set
   ▼
summary.js → localStorage     ← set summary and history
```

There is **no server**. GitHub Pages just hands your browser some static files, and everything after that happens on the device. That's why it's private, free to host, and works offline.

The project has three parts:

| Part | Folder | Role |
|---|---|---|
| The product | `web/` | The PWA you use at the gym |
| The reference | `python/` | The same logic in Python, plus a desktop webcam version |
| The evidence | `eval/` | Measures how accurately reps are counted on real videos |

---

## 2. A tour of the files

### `web/` (the app)

| File | What it does | Talking point |
|---|---|---|
| `index.html` | All four screens (home, workout, summary, history) plus an SVG icon sprite | Single page, screens toggled with the `hidden` attribute |
| `css/styles.css` | Design tokens (colours, radii) and layout | Mobile-first, dark, safe-area aware |
| `js/core/geometry.js` | `angleAt`, `tiltFromVertical`, `EmaFilter` | Pure math, easy to test |
| `js/core/landmarks.js` | Which index is the left knee, etc.; skeleton bones | Keeps magic numbers in one place |
| `js/core/features.js` | 33 landmarks → angle, lean, hip sag, view, knee width | Aspect-ratio correction lives here |
| `js/core/exercises.js` | Thresholds, cues and form rules per exercise | "Exercises are data" |
| `js/core/repCounter.js` | The state machine and `gradeRep` | The heart of the app |
| `js/core/summary.js` | Per-set statistics | Pure function |
| `js/app.js` | Wires everything together; the per-frame loop | Async race handling |
| `js/pose.js` | Loads MediaPipe, GPU with CPU fallback | Lazy dynamic `import()` |
| `js/camera.js` | `getUserMedia`, friendly error messages | Requires HTTPS |
| `js/overlay.js` | Draws the skeleton on a `<canvas>` | Canvas/video alignment trick |
| `js/hud.js` | Rep counter, meter, banners, countdown | Minimal DOM writes per frame |
| `js/views.js` | HTML for home/summary/history | Escapes stored text |
| `js/voice.js` | Spoken cues (Web Speech API) | iOS "unlock" quirk |
| `js/storage.js` | localStorage history and settings | Injectable for tests |
| `js/pwa.js` | Service worker registration, install button | |
| `sw.js` | The service worker: offline caching | Two caching strategies |
| `manifest.webmanifest` | App name, icons, colours, standalone mode | Makes it installable |
| `tests/*.test.js` | 44 tests run with `node --test` | Zero dependencies |

### `python/`

| File | What it does |
|---|---|
| `spotter/*.py` | A line-for-line mirror of `web/js/core` |
| `spotter/session.py` | Saves and loads recorded landmarks; runs the JS engine through Node |
| `spotter/pose_model.py` | MediaPipe Tasks API wrapper; downloads the model |
| `live_coach.py` | Desktop webcam coach with an OpenCV window |
| `tests/` | 34 pytest tests, including JS↔Python parity |
| `legacy/` | Your original prototypes, kept for history |

### `eval/`

| File | What it does |
|---|---|
| `evaluate.py` | Runs the model on labelled videos and reports accuracy |
| `labels.csv` | Ground truth: video, exercise, true rep count, view |
| `run_js_counter.mjs` | Feeds cached landmarks to the *shipped* JS counter |
| `download_samples.py` | Fetches two openly licensed test clips |

---

## 3. Pose estimation 101

**Pose estimation** means finding body keypoints (shoulders, elbows, knees…) in an image. We use Google's **MediaPipe PoseLandmarker**, which is based on a model family called BlazePose. It works in two stages:

1. A **detector** finds the person and draws a box around them.
2. A **landmark model** looks inside the box and predicts 33 keypoints.

In **VIDEO mode** (which we use) the detector doesn't run on every frame. The model reuses the previous frame's result to know roughly where you are, and only re-detects when tracking is lost. That's faster and steadier, and it's why MediaPipe insists that timestamps always increase:

```js
// pose.js
const timestamp = Math.max(Math.round(timestampMs), lastTimestamp + 1);
const result = landmarker.detectForVideo(video, timestamp);
return result.landmarks[0] ?? null; // first person, or null if nobody is visible
```

Each landmark looks like `{ x: 0.52, y: 0.71, z: -0.1, visibility: 0.98 }`:

- `x` and `y` are **normalised**: 0 to 1 across the image's width and height. `(0, 0)` is the top-left corner and **y grows downward**.
- `visibility` is the model's confidence that the point is actually visible (not hidden behind your body). We ignore points below 0.5.
- `z` is a rough depth estimate. We don't use it because it's noisy.

The indices we care about are in `landmarks.js`:

```js
left:  { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
```

**Where does it run?** The model runs as **WebAssembly** (compiled C++ that runs at near-native speed in the browser) with a **GPU delegate** (WebGL) for the neural network maths. If the GPU isn't available we fall back to the CPU:

```js
try {
  landmarker = await PoseLandmarker.createFromOptions(fileset, options('GPU'));
} catch (error) {
  landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
}
```

**Why the "lite" model?** MediaPipe ships lite, full and heavy models. Lite is about 6 MB and the fastest. For joint *angles* we need the main limbs to be roughly right, not millimetre precision, and a smooth frame rate matters more on a phone.

---

## 4. From landmarks to angles

### The angle at a joint

To measure the knee, take three points: hip (A), knee (B) and ankle (C). Draw two arrows from the knee, one to the hip and one to the ankle. The knee angle is the angle between those arrows.

`Math.atan2(dy, dx)` gives the direction of an arrow as an angle. Subtract the two directions and you get the angle between them:

```js
export function angleAt(a, b, c) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let degrees = Math.abs((radians * 180) / Math.PI);
  if (degrees > 180) degrees = 360 - degrees; // always report the inner angle
  return degrees;
}
```

**Worked example.** Hip `(0.40, 0.50)`, knee `(0.50, 0.70)`, ankle `(0.50, 0.90)`:

- knee→ankle points straight down: `atan2(0.2, 0) = 90°`
- knee→hip points up and back: `atan2(-0.2, -0.1) = -116.6°`
- the difference is 206.6°, which is more than 180, so the inner angle is 360 − 206.6 = **153.4°**

Standing straight is about 175–180°. A parallel squat is roughly 90–100°.

### The aspect-ratio bug (and fix)

Here's a subtle bug that was in the original Python prototype. Normalised x is a fraction of the image *width* and y is a fraction of the *height*. On a 16:9 frame, "0.1 in x" is a much longer distance than "0.1 in y". Computing angles directly on normalised numbers therefore **squashes the picture**, and the angles come out wrong.

Measured with the test puppet, a true 120° knee reads as:

| Frame | Without correction | With correction |
|---|---|---|
| 16:9 landscape | 135.7° | 120.0° |
| 9:16 portrait phone | 108.0° | 120.0° |

That's a 12–16° error, which is enough to turn a counted rep into "go deeper". The fix is one multiplication: scale x by the aspect ratio so both axes use the same unit.

```js
// features.js
const point = (index) => ({ x: landmarks[index].x * aspect, y: landmarks[index].y });
// app.js passes: aspect = video.videoWidth / video.videoHeight
```

### Other measurements

| Feature | How | Used for |
|---|---|---|
| `torsoLean` | Tilt of the shoulder→hip line from vertical (`tiltFromVertical`) | "Keep your chest up" (squat), "Keep your torso upright" (lunge), body swing (curl) |
| `elbowDrift` | Angle at the shoulder between the upper arm and the torso | "Keep your elbows pinned" (curl) |
| `hipSag` | 180° minus the shoulder–hip–ankle angle, **signed**: + if the hip is below the straight line, − if above | "Don't let your hips sag" / "Lower your hips" (push-up) |
| `view` | Shoulder width ÷ torso length: wide means facing the camera | Enables front-only checks |
| `kneeWidthRatio` | Knee spacing ÷ ankle spacing, front view only | "Push your knees out" (knee cave, also called valgus) |

**Why 2D and not 3D?** MediaPipe also outputs 3D "world landmarks", but the depth estimate from a single camera is noisy. 2D angles from a side view are reliable, simple and explainable. The trade-off is that camera placement matters, which is why each exercise shows a setup tip. Using 3D is on the roadmap.

---

## 5. Choosing which side of the body to measure

From a side view, your far arm and leg are hidden behind your body. MediaPipe still guesses where they are, but with low `visibility`. So we measure the side the camera sees best, scoring each side by its **weakest** joint (a chain is only as strong as its weakest link):

```js
export function sideVisibility(landmarks, side, joints) {
  return Math.min(...joints.map((joint) => visibilityOf(landmarks[SIDES[side][joint]])));
}
```

**Improvement over the prototype: sticky selection.** If both sides score about the same, picking the best side on every frame makes the measurement flip between legs mid-rep, and the angle jumps. So we keep the current side unless the other one is better by a clear margin (0.15). This is the same idea as hysteresis (section 7) applied to a choice:

```js
if (stillVisible && vis[other] - vis[currentSide] < SIDE_SWITCH_MARGIN) side = currentSide;
```

If neither side reaches 0.5 visibility we return `null`, and the app shows "Move so the camera can see your legs".

---

## 6. Smoothing noisy measurements

Landmarks jitter by a few pixels every frame, so raw angles wobble. The prototype averaged the last 5 frames. That works, but "5 frames" means 167 ms at 30 fps and 333 ms at 15 fps. Phones vary in speed, so the amount of smoothing (and the delay it adds) changed with the device.

Spotter uses an **exponential moving average (EMA) that depends on elapsed time**:

```js
const dt = tSec - this.lastT;                // seconds since the last frame
const alpha = 1 - Math.exp(-dt / this.tau);  // tau = 0.08 s
this.value += alpha * (x - this.value);      // move part of the way toward the new reading
```

- `alpha` is "how much to trust the new reading": 0.19 at 60 fps, 0.34 at 30 fps, 0.57 at 15 fps.
- Slower devices take bigger steps per frame, so after any given amount of *time* the result is the same. A unit test proves this: 6 frames at 30 fps and 12 frames at 60 fps give exactly the same value.
- `tau` controls the trade-off: bigger means smoother but laggier. 80 ms of lag is unnoticeable for a 2-second rep.

Every posture metric gets its own filter, and a filter resets when its metric disappears (for example when you leave the frame).

---

## 7. Counting reps: the state machine

A **state machine** is a program that is always in exactly one state and moves between states when specific conditions happen. Ours has two states:

```
            angle < start                        angle > end
   [ up ] ─────────────────▶ [ down ] ────────────────────────▶ grade the rep ─▶ [ up ]
```

### Hysteresis: two thresholds instead of one

Why not just count "angle crossed 120°"? Because a noisy reading near 120° would cross it many times: 121, 119, 121, 119… and each crossing would count. Using **two** thresholds with a gap between them (squat: start below 140°, finish above 160°) means a small wobble can never complete a rep. You have to genuinely go down and genuinely come back up. Thermostats use the same trick so the heating doesn't click on and off constantly.

### Graded by the lowest angle

The very first prototype counted the rep the moment you dipped below 100°, so it never knew how deep you went. Your second version fixed this, and Spotter keeps it: while in `down`, we remember the **minimum** angle, and only when you stand back up do we grade the rep:

| Lowest angle (squat) | Result |
|---|---|
| ≤ 90° (`perfect`) | Counted, "Great depth!", 100 depth points |
| ≤ 100° (`good`) | Counted, "Good rep", 80–100 depth points |
| > 100° | **Not counted**, "Go deeper" |

### Three robustness rules

1. **Missed lockout.** If you come most of the way up (past the midpoint between `start` and `end`) and then go down again without finishing, that attempt is graded as a partial ("Stand all the way up") and a new attempt starts. Without this rule, two half-reps would be merged and counted as one.
2. **Tracking lost.** A few missing frames are ignored. If you're hidden for more than 1 second mid-rep, the attempt is abandoned rather than guessed.
3. **Glitch filter.** Anything faster than 0.4 s is ignored. A camera cut in a real video produced fake "reps" lasting 0.1 s; no human squats that fast.

The core of `update()`:

```js
if (this.phase === 'up') {
  if (f.angle < start) this.beginRep(t, f);
} else {
  trackRep(this.rep, f);                       // remember min angle + metric min/max
  if (f.angle > end) {
    finished = this.finishRep(t, true);        // locked out: grade it
  } else if (this.rep.rose && f.angle < start) {
    finished = this.finishRep(t, false);       // went back down without locking out
    this.beginRep(t, f);
  } else if (f.angle > (start + end) / 2) {
    this.rep.rose = true;
  }
}
```

---

## 8. Form checks and scoring

Each form rule is a small object:

```js
{ metric: 'torsoLean', agg: 'max', op: '>', limit: 55, cue: 'Keep your chest up' }
```

Read it as: *"if the **max**imum torso lean during the rep was **>** 55°, say 'Keep your chest up'."* `agg` can be:

- `max`: the worst moment going up (lean, drift, sag)
- `min`: the worst moment going down (knee width ratio, pike)
- `range`: max − min, for "you moved too much" (body swing during curls)

The same rules run in two places:

- **Live**, every frame during the rep: the amber chip on screen, the amber limb in the skeleton, and a spoken cue (once per rep).
- **Per rep**, on the aggregated values when the rep finishes: the issues stored in the result.

If a metric couldn't be measured (knee width from a side view, for example), the rule is skipped rather than guessed.

### The score

```
depth points = 100 at or below `perfect`, 80 at `good`, linear in between
score        = max(0, depth points − 15 × number of form issues)
not counted  = 0
```

### Grades: colour plus icon plus label

| Grade | Meaning | Colour | Icon |
|---|---|---|---|
| `perfect` / `good` | Counted, clean | green | ✓ |
| `warning` | Counted, but with a form cue | amber | ! |
| `partial` | Not counted | red outline | ✕ |

Colour is **never** the only signal (about 8% of men have some colour vision deficiency), so every grade also has an icon and a text label. All text colours were contrast-checked against the dark background (WCAG AA).

---

## 9. Exercises are data

Every exercise is just an entry in `exercises.js`. The counter itself contains nothing specific to any exercise:

```js
pushup: {
  joints: ['shoulder', 'elbow', 'wrist'],   // the angle is measured at the elbow
  thresholds: { start: 130, end: 145, good: 100, perfect: 90 },
  cues: { perfect: 'Chest to floor!', good: 'Good push-up', shallow: 'Go lower', lockout: 'Lock out your arms' },
  checks: [
    { metric: 'hipSag', agg: 'max', op: '>', limit: 20, cue: "Don't let your hips sag" },
    { metric: 'hipSag', agg: 'min', op: '<', limit: -20, cue: 'Lower your hips' },
  ],
},
```

**To add an exercise** (for example a goblet squat): copy an entry, adjust the thresholds, add it to `python/spotter/exercises.py` too (a parity test fails if you forget), record a few videos, add them to `eval/labels.csv`, and tune the thresholds until the evaluation is happy.

**Current limitation:** the engine assumes the angle *decreases* into the rep (flexion). An overhead press is the opposite: the elbow *straightens* to finish. Supporting it means adding a `direction: 'extend'` field and flipping the comparisons. It's a small, well-contained change and a good interview "how would you extend this?" answer.

---

## 10. The web app

### No build step

The app is plain ES modules (`import`/`export`) that browsers load directly. There's no webpack, no React and no `npm install`. For an app this size, a framework would add more concepts than it saves. It also means `web/` can be deployed exactly as it is.

### The per-frame loop and `requestVideoFrameCallback`

The first version used `requestAnimationFrame` (once per screen refresh, usually 60 Hz) and skipped frames where `video.currentTime` hadn't changed. Testing showed that for **live camera streams Chrome advances `currentTime` on every refresh**, so the model was running 60 times a second on a 30 fps camera: double the work, battery and heat. The fix:

```js
if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(tick); // once per *camera* frame
else requestAnimationFrame(tick);                                          // older browsers
```

The FPS counter dropped from 60 to 30, which is exactly the camera rate.

### Async races: the session token

Starting a set awaits two slow things: the camera and the model. What if you tap **End set** while the camera is still starting? Without care, the camera would turn on *after* you've left, and the light would stay on. The fix is a counter that every start and stop increments:

```js
const session = ++workout.session;
await openCamera(session);
if (session !== workout.session) return; // the user left while we were waiting
```

`openCamera` also stops the new stream if the session changed while it was opening. A similar `loopToken` stops an old frame loop when the camera is flipped.

### Lining up the skeleton with the video

The `<canvas>` is given the video's exact pixel size, and both use the same CSS `object-fit: contain`. The browser then scales and positions them identically on any screen shape, so normalised landmark coordinates map straight onto the picture.

**Mirroring:** the front camera is shown mirrored (like a mirror) using CSS `transform: scaleX(-1)` on the video. Mirroring the canvas the same way would also mirror the angle text, so instead we flip the x coordinate when drawing: `x = (1 - lm.x) * width`.

### Designed for 2 metres away

- The rep counter is `clamp(110px, 24vh, 260px)`: the digits are roughly 2–3 cm tall on a typical phone.
- The screen edge flashes green, amber or red on each rep, which you can see out of the corner of your eye.
- Optional voice says the rep number, plus the cue only when there's an issue ("4. Keep your chest up").
- **Wake lock** (`navigator.wakeLock.request('screen')`) stops the phone dimming mid-set. The browser releases it when the app is hidden, so we re-request it on `visibilitychange`.

### Voice quirks

- iOS only lets a page speak after speech has been started from a tap, so the **Start set** handler speaks a silent utterance (`voice.unlock()`).
- New speech interrupts old speech, so you always hear the latest rep, never a backlog.

### Back button

Phones have a back gesture. We push one history entry when leaving home, so back returns home, and if a set is running, it ends the set and shows the summary instead of closing the app.

---

## 11. The PWA and the service worker

A **PWA** is a website that can be installed and can work offline. It needs three things:

1. **HTTPS** (GitHub Pages provides it).
2. A **manifest** (`manifest.webmanifest`): name, icons, colours, and `"display": "standalone"` so it opens without browser bars.
3. A **service worker** (`sw.js`).

### What is a service worker?

A JavaScript file the browser runs **in the background, between your page and the network**. Every request the page makes (HTML, JS, model files) passes through its `fetch` event, and it can answer from a cache instead of the network. Its lifecycle:

| Event | What Spotter does |
|---|---|
| `install` | Downloads and caches the app shell (24 small files), then `skipWaiting()` to activate immediately |
| `activate` | Deletes old caches and calls `clients.claim()` to take control of open pages now |
| `fetch` | Answers requests using one of two strategies (below) |

### Two caching strategies

| What | Strategy | Why |
|---|---|---|
| Our own files | **Stale-while-revalidate**: answer instantly from cache, fetch a fresh copy in the background for next time | Instant start; new deploys arrive on the next launch |
| MediaPipe runtime and model (~19 MB, versioned URLs) | **Cache-first**: once cached, never re-download | These URLs never change, and the model cache survives app updates |

### The first-visit trick

On your very first visit the service worker isn't controlling the page yet, so the model download would bypass it and not get cached, and you'd need a second visit before offline mode worked. So the app **waits for the service worker to take control** (up to 4 s) before loading the model:

```js
// pwa.js
if (navigator.serviceWorker.controller) return Promise.resolve();
return new Promise((resolve) => {
  navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
  setTimeout(resolve, timeoutMs);
});
```

Together with `clients.claim()`, this means one visit downloads everything once, through the cache. The home screen shows "Ready to use offline" when the model is in the cache. This was verified by reloading with the network disabled: the app and model loaded from cache.

### GitHub Pages sub-paths

Your site lives at `https://you.github.io/fitness-trainer/`, not at `/`. An absolute path like `/sw.js` would point to the wrong place, so **every path is relative** (`./sw.js`, `"start_url": "./"`). A guard test enforces this.

### Updating

Change any file → users get it on the next launch (stale-while-revalidate). If you add a new file, add it to `APP_SHELL` in `sw.js`, and a test fails if you forget. To force everyone onto a fresh cache, bump `APP_VERSION`.

---

## 12. Saving history

`localStorage` is a small key–value store (a few MB) built into the browser. It only stores strings, so sets are saved as JSON:

```js
saveSet(set) {
  const history = [set, ...this.loadHistory()].slice(0, MAX_SETS); // newest first, capped at 300
  writeJson(storage, HISTORY_KEY, history);
}
```

- Reads and writes are wrapped in `try/catch`: storage can be full, blocked (private mode) or corrupted, and the app should keep working.
- Keys are versioned (`spotter.history.v1`) so a future format change can migrate cleanly.
- `createStore(storage)` takes the storage object as a parameter, so tests pass a fake in-memory one. This is **dependency injection**.

---

## 13. The Python reference and parity tests

**Why have Python at all?** It's where the project started, and it's a better environment for analysis: running the model over videos, plotting angle traces and iterating on thresholds. `python/spotter` mirrors `web/js/core` file by file and function by function, using plain dicts with the same camelCase keys so the two read alike.

**The danger of two implementations** is that they drift apart. Two tests stop that:

1. `test_parity.py` builds nine scenarios (lean, noise, missed lockout, dropout, glitch, curl drift, push-up pike…), saves each as a session file, runs it through **both** the Python counter and the shipped JS counter (via `node eval/run_js_counter.mjs`), and requires identical reps, grades, scores, cues and issues.
2. `test_exercise_configs_match` loads the JS exercise configs through Node and compares them with the Python ones.

**A subtle difference the tests caught:** Python's `round(2.5)` is `2` (it rounds to the nearest even number, called "banker's rounding"), while JavaScript's `Math.round(2.5)` is `3`. The Python side uses a `js_round` helper so scores match exactly.

---

## 14. Testing strategy

### Synthetic landmarks: the "puppet"

You can't unit test with a camera, so `tests/helpers/puppet.js` (and its Python twin) builds a stick figure from joint angles: *"give me a person with an 85° knee and a 40° forward lean"*. It returns 33 landmarks just like MediaPipe would. A `trajectory([175, 85, 175])` helper turns keyframes into a smooth movement with holds, which gives tests like:

```js
test('squat: a shallow rep is not counted and asks for more depth', () => {
  const counter = run(new RepCounter(EXERCISES.squat), squats([175, 120, 175]));
  assert.equal(counter.reps, 0);
  assert.equal(counter.results[0].cue, 'Go deeper');
});
```

### What's covered (78 tests)

- **Geometry:** known angles, symmetry, frame-rate-independent smoothing.
- **Features:** aspect correction, visibility, sticky sides, hip-sag sign, front-view knee ratio.
- **Counter:** perfect/good/partial grading, threshold jitter, noisy reps, missed lockout, forward lean, live cues, 16:9 frames, long vs brief dropouts, glitches, every exercise, score floor.
- **Summary and storage:** aggregates, caps, corrupted data, weekly stats.
- **Guards:** every shipped file is precached, the MediaPipe version matches across files, and manifest paths are relative.
- **Parity:** Python and JS agree.

**Mutation checks.** A test is only useful if it fails when the code is wrong. Key tests were checked by deliberately breaking the code (setting the glitch filter to 0 s, removing a file from the precache list) and confirming that the test failed.

**End-to-end.** The real app was also run in headless Chrome with a sample exercise video fed in as a fake camera (`--use-file-for-fake-video-capture`). That covered live rep counts, the GPU at 30 fps, a camera flip mid-set, the summary and history, and an offline reload.

---

## 15. Evaluation, and the bug it found

Unit tests prove the logic does what we *designed*; an evaluation tests whether the design matches *reality*.

`eval/evaluate.py`:

1. Runs MediaPipe on each labelled video (once) and caches the landmarks.
2. Replays them through the Python and/or JS counter.
3. Reports exact match, within ±1, MAE, bias and count accuracy.

**The bug it found.** The first run on a real push-up video counted **4 of 6** reps. Plotting the elbow angle showed why: at the top of each push-up the arm read only **~150–155°**, not 180°. 2D landmarks of a "straight" arm aren't perfectly in line (elbow carrying angle, landmark placement, camera angle). The lockout threshold was 155°, so some reps never "finished" and got flagged as missed lockouts. Lowering push-up lockout to 145° (and curls to 140°) gave **6 of 6**.

The same investigation found the 0.1-second fake reps caused by camera cuts in an edited video, which led to the glitch filter.

**Being honest about the numbers.** The current results are 8/8 reps across 2 clips. That's a smoke test: the push-up clip was used for tuning, so it's a *development set*, not a held-out *test set*. Reporting it that way, and knowing why it matters, is more impressive in an interview than a big unverified accuracy number.

**Building a real dataset.** Record sets on your phone and add rows to `labels.csv`. Include side and front views, good and bad form, different clothes and lighting, and several people if you can. Keep some videos aside, untouched while tuning, to report as your test set.

---

## 16. Design decisions at a glance

| Decision | Alternatives | Why this one |
|---|---|---|
| On-device MediaPipe in the browser | Cloud API, native app | Private, free to host, no API keys, works offline, one codebase for iOS and Android |
| Lite model | Full or heavy | Phone frame rate matters more than millimetre precision for angles |
| Plain JS, no build | React + bundler | Small app; fewer concepts; deploys as-is |
| 2D angles + aspect correction | 3D world landmarks | Reliable and explainable from a side view; 3D depth is noisy |
| Hysteresis thresholds | One threshold | Prevents double counting from jitter |
| Grade by lowest angle | Count when crossing a depth line | Knows how deep the rep was and can reject partial reps |
| Time-based EMA | N-frame moving average | Same smoothing on fast and slow phones |
| Sticky side selection | Best side every frame | No mid-rep flip-flopping |
| Exercises and checks as data | Code per exercise | Generic counter; easy to add exercises; mirrored and parity-tested |
| Count reps with form issues (amber) | Reject them | Coaching, not judging; depth is what decides a rep |
| `requestVideoFrameCallback` | `requestAnimationFrame` | Model runs once per camera frame, half the work |
| Stale-while-revalidate + cache-first | Network-first | Instant offline start; big model files never re-downloaded |
| localStorage | IndexedDB, a backend | Simple and sufficient for a few hundred sets; no accounts |
| Python mirror + parity tests | JS only | Fast analysis on video, with drift prevented by tests |

---

## 17. Limitations and what to build next

- **Camera placement matters.** Side views are best. Front views can't see knee bend well.
- **Thresholds were tuned on little data.** Collect more videos and fit thresholds per exercise and view.
- **One person only.** People in the background can confuse tracking.
- **Phones vary.** Older Android phones may run the model slowly; iOS has its own camera and speech quirks.
- **Next features:** extension-direction exercises (overhead press), rest timer, CSV export, a calibration rep ("show me your full range once"), 3D world landmarks, tempo coaching.

---

## 18. Glossary

| Term | Meaning |
|---|---|
| Landmark / keypoint | A predicted body point (e.g. left knee) with x, y and visibility |
| Normalised coordinates | Positions as fractions (0–1) of image width and height |
| Visibility | Model confidence that a landmark is visible (not occluded) |
| Hysteresis | Separate "on" and "off" thresholds so noise can't toggle state |
| State machine | Logic that is always in one named state and moves on defined events |
| EMA | Exponential moving average: blend each new value into a running estimate |
| WebAssembly (WASM) | A fast, compiled format that browsers can run (here: MediaPipe's C++) |
| Delegate (GPU/CPU) | Which hardware runs the neural network |
| PWA | Progressive Web App: an installable, offline-capable website |
| Service worker | Background script that intercepts network requests (used for caching) |
| Manifest | JSON describing the installed app (name, icons, display mode) |
| Wake lock | API that keeps the screen on |
| Parity test | A test that two implementations give identical results |
| Ground truth / labels | The human-verified correct answers used for evaluation |
| MAE | Mean absolute error |
| Valgus (knee cave) | Knees collapsing inward during a squat |

---

## 19. Interview questions and answers

**1. Give me the 30-second pitch.**
"Spotter is a phone-based gym coach. It uses MediaPipe pose estimation in the browser to find 33 body landmarks per frame, turns them into joint angles, and runs a state machine that counts reps, grades each one by depth and checks form, like forward lean or hips sagging. It's a PWA, so it installs to your home screen and works offline, and nothing leaves the device. I also built an evaluation harness on labelled videos, which caught a real threshold bug."

**2. Why run the model on the device instead of a server?**
Privacy (gym video is personal), latency (no round trip, so feedback is instant), cost (static hosting is free and there are no GPU servers), and reliability (gyms often have bad signal; it works offline). The trade-off is the phone's compute, which is why I chose the lite model and process each camera frame only once.

**3. How do you count a rep?**
A two-state machine with hysteresis. The rep starts below a `start` angle and finishes above a higher `end` angle. While down, I track the minimum angle and posture metrics, and grade once at the end. The gap between the thresholds means noise can't double count.

**4. Why grade by the lowest angle?**
My first prototype counted the moment you crossed 100°, so it couldn't tell a deep squat from a shallow one and couldn't reject partial reps. Recording the minimum during the rep and grading at lockout gives depth feedback and a score.

**5. How do you handle noisy landmarks?**
Four ways: a visibility threshold; sticky side selection; a time-based EMA so smoothing is the same at any frame rate; and hysteresis, plus a 0.4 s minimum rep duration and a 1 s tracking-loss timeout.

**6. What was the hardest bug?**
Two good ones. First, angles computed from normalised coordinates are distorted by the aspect ratio: a 120° knee read as 108° on a portrait phone, so I scale x by width/height. Second, real push-up data showed locked-out arms only read about 152°, so my 155° lockout threshold dropped a third of the reps. The evaluation caught it, and recalibrating fixed it.

**7. How do you know it's accurate?**
Unit tests prove the logic does what I designed; the evaluation script measures agreement with human counts on labelled videos (exact match, ±1, MAE, bias). Right now it's 8/8 on two public clips, which I treat as a smoke test because one clip was used for tuning. The next step is a held-out set of my own recordings.

**8. How did you test code that needs a camera?**
A synthetic "puppet" that generates landmarks from joint angles, so tests can say "squat to 85° with 65° of lean" and assert the cue. For the full app, I ran headless Chrome with a real exercise video as a fake camera and checked rep counts, frame rate, the summary and offline mode.

**9. Why both Python and JavaScript?**
Python is better for analysis (video processing, plotting traces, tuning); JavaScript is what ships. To prevent drift, parity tests replay identical landmarks through both and require identical output, and another test compares the exercise configs. It even caught Python's banker's rounding versus `Math.round`.

**10. Explain the service worker.**
It's a background script between the page and the network. On install it caches the app shell; for our files it serves from cache and refreshes in the background (stale-while-revalidate); for the versioned MediaPipe files it's cache-first. I also make the page wait for the worker to take control before loading the model, so the first visit already caches everything.

**11. How would you add a new exercise?**
Add a config entry (joints, thresholds, cues, checks) in JS and Python, since a test enforces parity. Then record labelled videos, run the evaluator and tune. For an extension movement like an overhead press, I'd add a `direction` field so the counter can look for the angle rising into the rep.

**12. What about performance on a phone?**
Lite model, GPU delegate with CPU fallback, one inference per camera frame via `requestVideoFrameCallback` (that change halved the work), minimal DOM writes per frame (only when text changes), and a single canvas overlay. I'd profile on a mid-range Android phone next.

**13. What about accessibility?**
Grades use colour plus icon plus label (never colour alone), text meets WCAG AA contrast, voice cues serve people who can't see the screen mid-set, controls are real buttons with ARIA states, and animations respect `prefers-reduced-motion`.

**14. What are the limitations?**
2D angles depend on camera angle; thresholds are tuned on little data; one person at a time; not yet tested on many phones. The roadmap is 3D world landmarks, a bigger labelled dataset with a held-out test set, and per-user calibration.

**15. How does it handle the user tapping End while the camera is still starting?**
A session counter incremented on every start and stop. After each `await` I check that the session is unchanged; if not, I stop any camera stream that just opened and bail out. This prevents the camera light staying on after leaving.

**16. Why no framework?**
The UI is four screens and a HUD. Plain ES modules load directly in the browser, there's no build to maintain, and every line is explainable. If it grew (accounts, plans, charts), I'd reconsider.

**17. What is hysteresis, in one sentence?**
Using a different threshold to turn something on than to turn it off, so a noisy signal hovering near one threshold can't flip the state back and forth.

**18. What would you do with more time?**
Build a proper labelled dataset with a held-out test split; try 3D world landmarks for view independence; add a calibration rep; profile on low-end phones; add extension exercises and a rest timer.
