# SUMMARY

## What was built

**Spotter**, a mobile-first PWA that coaches gym exercises from your phone camera, fully on-device.

- **Web app (`web/`)**: plain HTML, CSS and JS with no build step. MediaPipe PoseLandmarker runs in the browser (GPU with CPU fallback) and feeds a generic rep engine for **squat, lunge, bicep curl and push-up**.
  - Rep counting uses a hysteresis state machine and is graded by the lowest angle, with visible-side selection, time-based smoothing, missed-lockout detection, a tracking-loss timeout and a glitch filter.
  - Form checks: depth, forward lean, knee cave (front view), torso upright, elbow drift, body swing, hip sag and pike.
  - UI: dark theme with a skeleton overlay, a rep counter readable at 2 m, a range meter, colour + icon + label rep feedback, an edge flash, optional voice cues, countdown, target reps, front/rear switch, wake lock, set summary, and history with 7-day stats.
  - PWA: manifest, icons and a service worker. It's installable and works offline after the first visit.
- **Python reference (`python/`)**: the `spotter` package mirrors the JS engine line for line, plus `live_coach.py` (OpenCV webcam/video coach). Your original prototypes are kept in `python/legacy/`.
- **Evaluation (`eval/`)**: `evaluate.py` measures rep-count accuracy on labelled videos, using the Python engine, the shipped JS engine (via Node), or both. `download_samples.py` fetches two openly licensed clips.
- **Tests**: 44 JS (`node:test`, zero dependencies) and 34 Python (`pytest`), all passing. They include JS↔Python parity tests and guard tests for the offline cache.
- **CI/CD**: GitHub Actions runs both suites on every push and deploys `web/` to GitHub Pages from `main`.
- **Docs**: `README.md` (overview, architecture diagrams, setup, deployment, evaluation) and `LEARNING.md` (a beginner-friendly deep dive plus interview Q&A).

All work is in local commits on `main` (`git log --oneline` shows each step). **Nothing has been pushed.**

## How to run it locally

```bash
# Web app: open http://localhost:8000 and allow the camera
npm run serve

# Tests
npm test                                        # JS (Node 20+)
source venv/bin/activate
pip install -r python/requirements-dev.txt      # pytest (already installed in your venv)
pytest                                          # Python, including parity with the JS engine

# Desktop coach and evaluation (your venv already has mediapipe + opencv)
python python/live_coach.py --exercise squat
python eval/download_samples.py && python eval/evaluate.py --engine both
```

Phones only allow the camera over HTTPS, so for a phone test either deploy to GitHub Pages (push, then **Settings → Pages → Source: GitHub Actions**) or use Chrome's USB port forwarding on Android. Details are in the README.

## What I verified

- Both test suites pass. Key tests were mutation-checked (they fail when the code is broken).
- In headless desktop Chrome, I fed real exercise clips in as a fake camera:
  - the model ran on the GPU at the camera's 30 fps, and live rep counts matched the clips;
  - switching camera mid-set kept counting;
  - the summary and history rendered, and there were no console errors;
  - after reloading with the network disabled, the app and pose model loaded from cache.
- The evaluator got 8/8 reps across the two sample clips, with the Python and JS engines identical. This is a smoke test, not a benchmark (see Known limitations).
- The desktop coach ran on a sample clip and counted 2/2 reps.

## What you need to test manually

These need a real phone and a real body, which I couldn't do:

- [ ] **Deploy to GitHub Pages** and open it on **iPhone (Safari)** and **Android (Chrome)**.
- [ ] Camera permission prompt; a denied-permission message appears if you refuse.
- [ ] **Install to home screen** (Android: *Install app* button; iOS: Share → Add to Home Screen), then launch from the icon.
- [ ] **Offline:** after "Ready to use offline" appears, turn on airplane mode and start a set.
- [ ] Each exercise from the recommended camera position (the setup tip under the picker). Do the counts and cues feel right? Squat thresholds and the lean/knee checks are the most likely to need tuning for your body and camera angle.
- [ ] Front/rear camera switch, voice cues (iOS especially), countdown, target reps, and that the screen stays awake.
- [ ] Frame rate (bottom-right of the workout screen) and phone heat during a 2-minute set.
- [ ] The back gesture during a set ends it and shows the summary; history survives closing the app.
- [ ] Record 5–10 of your own labelled sets, add them to `eval/labels.csv`, run `python eval/evaluate.py --engine both`, and paste the table into the README's results placeholder.
- [ ] Check the README badge and demo link (filled in from your `origin` remote) work after deploying, and add `docs/demo.gif`.

## Known limitations

- **Accuracy is lightly validated.** There are only two real clips, and the push-up clip was used to calibrate the lockout threshold, so it isn't held-out data. Your own recordings are needed for a credible number.
- **2D angles depend on camera placement.** Side views work best; knee-cave checks only work from the front.
- **Single person only.** Edited or multi-angle videos (cuts, close-ups) confuse tracking, though the glitch filter limits the damage.
- **Flexion movements only.** The engine expects the angle to decrease into the rep. Extension movements (overhead press) need a small `direction` addition.
- **Telemetry.** The MediaPipe library sends anonymous performance and usage metrics to Google (stated in the app and README). Camera frames are never uploaded.
- **Not tested on real phones** (see the checklist above).

## Decisions I made for you

- Product name **Spotter**, with the visual style taken from opengym.ch's tokens (pure black, iOS-style surfaces, green accent).
- **MediaPipe tasks-vision 1.1.0** (latest stable) with the **lite** model.
- Push-up and curl lockout thresholds were lowered after the real-video evaluation (details in LEARNING.md §15).
- Test clips are downloaded on demand and **not committed** (licensing and repo size).
- No `LICENSE` file was added. Choose one (MIT is common for portfolios) before publishing.
