// Spotter app entry point: wires the screens together and runs the workout loop.
//
// Per video frame:  camera -> MediaPipe (33 landmarks) -> RepCounter -> HUD + skeleton + voice
// Per set:          RepCounter results -> summarizeSet -> localStorage history

import { EXERCISES } from './core/exercises.js';
import { RepCounter } from './core/repCounter.js';
import { summarizeSet } from './core/summary.js';
import { createStore } from './storage.js';
import { cameraErrorMessage, startCamera, stopCamera } from './camera.js';
import { createPoseDetector, MEDIAPIPE_URLS } from './pose.js';
import { drawOverlay } from './overlay.js';
import { Voice } from './voice.js';
import * as views from './views.js';
import * as hud from './hud.js';
import * as pwa from './pwa.js';

const $ = (id) => document.getElementById(id);
const store = createStore();
const voice = new Voice();
const TARGET_STEPS = [0, 5, 8, 10, 12, 15, 20, 25, 30];

let settings = store.loadSettings();
if (!EXERCISES[settings.exercise]) settings.exercise = 'squat'; // e.g. saved by an older version
let detectorPromise = null; // the model is loaded once and reused for every set
let summaryReturnsTo = 'home';

// Everything about the set in progress.
const workout = {
  session: 0, // bumped on every start/stop so slow async work from an old set can bail out
  running: false,
  counting: false, // false during the countdown
  stream: null,
  mirrored: true,
  detector: null,
  counter: null,
  startedAt: 0,
  countdownEndsAt: 0,
  lastSecond: null,
  lastVideoTime: -1,
  loopToken: 0, // starting a new frame loop (e.g. after a camera flip) retires the old one
  spokenThisRep: new Set(), // live cues already spoken during the current rep
  targetAnnounced: false,
  fps: { frames: 0, since: 0 },
};

// ---------- Navigation ----------
// We keep at most one browser-history entry above home, so the phone's back
// button/gesture always returns home (and ends a set in progress).

const SCREENS = ['home', 'workout', 'summary', 'history'];

function show(name) {
  for (const screen of SCREENS) $(`screen-${screen}`).hidden = screen !== name;
  window.scrollTo(0, 0);
}

function navigate(name) {
  show(name);
  const onHome = !history.state || history.state.screen === 'home';
  if (onHome) history.pushState({ screen: name }, '');
  else history.replaceState({ screen: name }, '');
}

function goHome() {
  if (history.state && history.state.screen !== 'home') history.back(); // triggers popstate -> showHome
  else showHome();
}

function showHome() {
  renderHome();
  show('home');
}

window.addEventListener('popstate', () => {
  if (workout.running) endSet();
  else showHome();
});

// ---------- Home screen ----------

function renderHome() {
  views.renderExerciseGrid($('exercise-grid'), settings.exercise);
  $('setup-tip').textContent = EXERCISES[settings.exercise].setup;
  setPressed($('seg-facing'), settings.facing);
  setPressed($('seg-countdown'), String(settings.countdown));
  $('target-value').textContent = settings.targetReps || 'Off';
  $('toggle-voice').setAttribute('aria-checked', String(settings.voice));
  views.renderWeekStats($('week-stats'), store.loadHistory());
}

function setPressed(group, value) {
  for (const button of group.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.value === value));
  }
}

function updateSettings(patch) {
  settings = { ...settings, ...patch };
  store.saveSettings(settings);
  voice.enabled = settings.voice;
  renderHome();
}

function stepTarget(direction) {
  const index = Math.max(0, TARGET_STEPS.indexOf(settings.targetReps));
  const next = TARGET_STEPS[Math.min(TARGET_STEPS.length - 1, Math.max(0, index + direction))];
  updateSettings({ targetReps: next });
}

async function refreshOfflineStatus(modelLoaded = false) {
  const ready = await pwa.isOfflineReady(MEDIAPIPE_URLS.model);
  const el = $('offline-status');
  el.classList.toggle('ready', ready);
  if (ready) el.textContent = 'Ready to use offline';
  else if (modelLoaded) el.textContent = 'Pose model loaded (offline caching unavailable in this browser)';
  else if (!navigator.onLine) el.textContent = 'Offline: connect once to download the pose model';
  else el.textContent = 'Downloading pose model for offline use…';
}

// ---------- Pose model ----------

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = pwa
      .waitForServiceWorker()
      .then(createPoseDetector)
      .catch((error) => {
        detectorPromise = null; // allow a retry next time
        throw error;
      });
  }
  return detectorPromise;
}

// ---------- Screen wake lock (keeps the phone awake during a set) ----------

let wakeLock = null;

async function keepScreenAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    // Not supported or refused (e.g. low battery): the set still works.
  }
}

function releaseScreen() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  // The browser drops the wake lock when the page is hidden; take it back on return.
  if (document.visibilityState === 'visible' && workout.running) keepScreenAwake();
});

// ---------- Workout ----------

async function startSet() {
  voice.unlock(); // must run inside the tap handler for iOS
  voice.enabled = settings.voice;
  const session = ++workout.session;
  const exercise = EXERCISES[settings.exercise];
  Object.assign(workout, {
    running: true,
    counting: false,
    counter: new RepCounter(exercise),
    startedAt: 0,
    lastVideoTime: -1,
    spokenThisRep: new Set(),
    targetAnnounced: false,
    fps: { frames: 0, since: performance.now() },
  });

  navigate('workout');
  hud.resetHud(exercise, settings.targetReps);
  hud.setStatus('');
  hud.setFps(0);
  syncVoiceButton();

  hud.setLoading('Starting camera…');
  try {
    await openCamera(session);
  } catch (error) {
    if (session === workout.session) failStart(cameraErrorMessage(error));
    return;
  }

  hud.setLoading('Loading pose model…');
  try {
    workout.detector = await getDetector();
  } catch (error) {
    console.error(error);
    if (session === workout.session) {
      failStart('Could not load the pose model. Connect to the internet once so it can be downloaded and cached.');
    }
    return;
  }
  if (session !== workout.session) return; // the user left while we were loading

  hud.setLoading('');
  keepScreenAwake();
  workout.countdownEndsAt = performance.now() + settings.countdown * 1000;
  workout.lastSecond = null;
  if (settings.countdown > 0) voice.say('Get in position');
  startLoop();
}

/** (Re)start the camera with the current facing setting. */
async function openCamera(session) {
  stopCamera(workout.stream); // phones often can't open two cameras at once
  workout.stream = null;
  const stream = await startCamera($('video'), settings.facing);
  if (session !== workout.session) {
    stopCamera(stream); // the set was ended while the camera was starting
    throw new Error('cancelled');
  }
  workout.stream = stream;
  // Mirror the front camera so it behaves like a mirror. Prefer what the
  // browser actually opened (a laptop may only have one camera).
  const actual = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
  workout.mirrored = (actual || settings.facing) === 'user';
  $('video').classList.toggle('mirrored', workout.mirrored);
  workout.lastVideoTime = -1;
}

function failStart(message) {
  stopCamera(workout.stream);
  workout.stream = null;
  workout.running = false;
  hud.setLoading(message, { error: true });
}

/**
 * Run processFrame once per new camera frame. requestVideoFrameCallback fires
 * exactly when the camera delivers a frame (e.g. 30 fps), so we never run the
 * model twice on the same picture. Older browsers fall back to
 * requestAnimationFrame (once per screen refresh).
 */
function startLoop() {
  const token = ++workout.loopToken;
  const video = $('video');
  const tick = () => {
    if (!workout.running || token !== workout.loopToken) return;
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(tick);
    else requestAnimationFrame(tick);
    processFrame(video);
  };
  tick();
}

function processFrame(video) {
  tickCountdown(performance.now());
  // rAF fallback only: skip refreshes where the camera has no new frame yet.
  if (video.readyState < 2 || video.currentTime === workout.lastVideoTime) return;
  workout.lastVideoTime = video.currentTime;

  const now = performance.now();
  let landmarks;
  try {
    landmarks = workout.detector.detect(video, now);
  } catch (error) {
    console.error(error);
    return;
  }

  const exercise = workout.counter.exercise;
  const frame = workout.counting ? workout.counter.update(landmarks, now, video.videoWidth / video.videoHeight) : null;

  drawOverlay($('overlay'), video, landmarks, {
    mirrored: workout.mirrored,
    joints: exercise.joints,
    side: frame?.tracked ? frame.side : null, // only highlight a limb we are actually measuring
    angle: frame?.angle ?? null,
    warn: (frame?.liveCues.length ?? 0) > 0,
  });
  updateHud(exercise, frame, landmarks);
  if (frame?.rep) onRep(frame.rep);
  countFps(now);
}

function tickCountdown(now) {
  if (workout.counting) return;
  const secondsLeft = Math.ceil((workout.countdownEndsAt - now) / 1000);
  if (secondsLeft > 0) {
    if (secondsLeft !== workout.lastSecond) {
      workout.lastSecond = secondsLeft;
      hud.setCountdown(secondsLeft);
      if (secondsLeft <= 3) voice.say(String(secondsLeft));
    }
    return;
  }
  hud.setCountdown(0);
  workout.counting = true;
  workout.startedAt = Date.now();
  voice.say('Go');
}

function updateHud(exercise, frame, landmarks) {
  if (!frame) {
    // Countdown: just help the user get into position.
    hud.setStatus(landmarks ? 'Person detected' : 'Looking for you…');
    return;
  }
  if (!frame.tracked) {
    const limb = exercise.joints.includes('knee') ? 'legs' : 'arm';
    hud.setHint(landmarks ? `Move so the camera can see your ${limb}` : 'Step into the frame');
    hud.setStatus('Not tracking');
    hud.updateMeter(exercise, null);
    hud.showLiveCue('');
    return;
  }
  hud.setHint('');
  hud.setStatus(`Tracking ${frame.side} side · ${frame.view} view`);
  hud.updateMeter(exercise, frame.angle);

  const cue = frame.liveCues[0] ?? '';
  hud.showLiveCue(cue);
  if (cue && !workout.spokenThisRep.has(cue)) {
    workout.spokenThisRep.add(cue);
    voice.say(cue);
  }
}

function onRep(rep) {
  const counter = workout.counter;
  hud.showRep(rep, counter);

  // Say the rep number; add the form cue unless it was already spoken mid-rep.
  let speech = rep.counted ? String(rep.number) : rep.cue;
  if (rep.grade === 'warning' && !workout.spokenThisRep.has(rep.cue)) speech += `. ${rep.cue}`;
  workout.spokenThisRep.clear();

  if (rep.counted && settings.targetReps && counter.reps === settings.targetReps && !workout.targetAnnounced) {
    workout.targetAnnounced = true;
    speech += '. Target reached!';
    toast('Target reached. Keep going or end the set.');
  }
  voice.say(speech);
}

function countFps(now) {
  const fps = workout.fps;
  fps.frames += 1;
  if (now - fps.since >= 1000) {
    hud.setFps(Math.round((fps.frames * 1000) / (now - fps.since)), workout.detector.delegate);
    fps.frames = 0;
    fps.since = now;
  }
}

function stopSet() {
  workout.session += 1;
  workout.running = false;
  workout.counting = false;
  stopCamera(workout.stream);
  workout.stream = null;
  $('video').srcObject = null;
  releaseScreen();
  hud.setLoading('');
  hud.setCountdown(0);
}

function endSet() {
  const { counter, startedAt } = workout;
  stopSet();
  if (!counter || !startedAt || counter.results.length === 0) {
    voice.stop();
    goHome();
    return;
  }
  const set = summarizeSet({ exercise: counter.exercise, results: counter.results, startedAt, endedAt: Date.now() });
  store.saveSet(set);
  openSummary(set, { fresh: true });
  voice.say(`Set complete. ${set.reps} ${set.reps === 1 ? 'rep' : 'reps'}.`);
}

async function flipCamera() {
  updateSettings({ facing: settings.facing === 'user' ? 'environment' : 'user' });
  const session = workout.session;
  try {
    await openCamera(session);
    if (workout.running && workout.detector) startLoop(); // re-attach to the new stream's frames
  } catch (error) {
    if (session === workout.session) toast(cameraErrorMessage(error));
  }
}

function syncVoiceButton() {
  $('btn-voice').setAttribute('aria-pressed', String(settings.voice));
}

// ---------- Summary & history ----------

function openSummary(set, { fresh }) {
  views.renderSummary($('summary-content'), set);
  $('summary-title').textContent = fresh ? 'Set complete' : 'Set details';
  $('summary-actions').hidden = !fresh;
  summaryReturnsTo = fresh ? 'home' : 'history';
  navigate('summary');
}

function openHistory() {
  views.renderHistory($('history-content'), store.loadHistory());
  $('btn-clear').hidden = store.loadHistory().length === 0;
  navigate('history');
}

// ---------- Toast ----------

let toastTimer = null;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

// ---------- Events ----------

function wireEvents() {
  $('exercise-grid').addEventListener('click', (event) => {
    const card = event.target.closest('.exercise-card');
    if (card) updateSettings({ exercise: card.dataset.id });
  });
  $('seg-facing').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) updateSettings({ facing: button.dataset.value });
  });
  $('seg-countdown').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) updateSettings({ countdown: Number(button.dataset.value) });
  });
  $('target-minus').addEventListener('click', () => stepTarget(-1));
  $('target-plus').addEventListener('click', () => stepTarget(1));
  $('toggle-voice').addEventListener('click', () => updateSettings({ voice: !settings.voice }));

  $('btn-start').addEventListener('click', startSet);
  $('btn-history').addEventListener('click', openHistory);
  $('btn-history-link').addEventListener('click', openHistory);

  $('btn-end').addEventListener('click', endSet);
  $('btn-flip').addEventListener('click', flipCamera);
  $('btn-voice').addEventListener('click', () => {
    updateSettings({ voice: !settings.voice });
    syncVoiceButton();
    if (!settings.voice) voice.stop();
  });
  $('btn-loading-back').addEventListener('click', () => {
    stopSet();
    goHome();
  });

  $('btn-done').addEventListener('click', goHome);
  $('btn-again').addEventListener('click', startSet);
  $('btn-summary-back').addEventListener('click', () => (summaryReturnsTo === 'history' ? openHistory() : goHome()));

  $('btn-history-back').addEventListener('click', goHome);
  $('btn-clear').addEventListener('click', () => {
    if (!confirm('Delete all saved sets? This cannot be undone.')) return;
    store.clearHistory();
    openHistory();
  });
  $('history-content').addEventListener('click', (event) => {
    const card = event.target.closest('.set-card');
    if (!card) return;
    const set = store.loadHistory().find((s) => s.id === card.dataset.id);
    if (set) openSummary(set, { fresh: false });
  });

  window.addEventListener('online', () => refreshOfflineStatus());
  window.addEventListener('offline', () => refreshOfflineStatus());
}

// ---------- Start ----------

function init() {
  history.replaceState({ screen: 'home' }, '');
  renderHome();
  wireEvents();
  pwa.registerServiceWorker();
  pwa.setupInstall($('btn-install'), $('ios-install-hint'));
  refreshOfflineStatus();
  // Warm up the model in the background so "Start set" is instant.
  getDetector()
    .then(() => refreshOfflineStatus(true))
    .catch((error) => {
      console.warn('Pose model preload failed', error);
      refreshOfflineStatus();
    });
}

init();
