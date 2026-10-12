// The heads-up display drawn over the camera during a set:
// rep counter, rep dots, range meter, feedback banners, hints and overlays.

import { depthProgress } from './core/exercises.js';
import { gradeDot, GRADES } from './views.js';

const $ = (id) => document.getElementById(id);

/** Only touch the DOM when text actually changes (these run every frame). */
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

const FLASH_COLORS = { perfect: 'var(--acc)', good: 'var(--acc)', warning: 'var(--warn)', partial: 'var(--bad)' };

/** Restart a CSS animation by removing the class, forcing a reflow, and adding it back. */
function replay(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

export function resetHud(exercise, targetReps) {
  $('hud-exercise').textContent = exercise.name;
  $('rep-count').textContent = '0';
  $('rep-target').textContent = targetReps ? `/${targetReps}` : '';
  $('rep-label').textContent = 'reps';
  $('partial-count').textContent = '';
  $('rep-dots').innerHTML = '';
  $('feedback').hidden = true;
  $('live-cue').hidden = true;
  // Place the "counts from here" tick on the range meter.
  $('meter-good').style.top = `${depthProgress(exercise, exercise.thresholds.good) * 100}%`;
  updateMeter(exercise, null);
  setHint('');
}

export function setStatus(text) {
  setText($('hud-status'), text);
}

export function setHint(text) {
  const hint = $('hint');
  hint.hidden = !text;
  setText(hint, text);
}

export function updateMeter(exercise, angle) {
  const fill = $('meter-fill');
  const progress = angle === null ? 0 : depthProgress(exercise, angle);
  fill.style.height = `${progress * 100}%`;
  fill.classList.toggle('deep', angle !== null && angle <= exercise.thresholds.good);
  setText($('meter-angle'), angle === null ? '–' : `${Math.round(angle)}°`);
}

export function showLiveCue(cue) {
  const el = $('live-cue');
  el.hidden = !cue;
  if (cue) setText(el, cue);
}

/** Update the counter, add a rep dot, show the feedback banner and flash the screen edge. */
export function showRep(rep, counter) {
  const count = $('rep-count');
  count.textContent = String(counter.reps);
  $('rep-label').textContent = counter.reps === 1 ? 'rep' : 'reps';
  if (rep.counted) replay(count, 'bump');
  $('partial-count').textContent = counter.partials ? `${counter.partials} not counted` : '';

  $('rep-dots').insertAdjacentHTML('beforeend', gradeDot(rep.grade));

  const feedback = $('feedback');
  feedback.dataset.grade = rep.grade;
  feedback.innerHTML = `${gradeDot(rep.grade)}<span class="feedback-text"></span>`;
  feedback.querySelector('.feedback-text').textContent = rep.cue;
  feedback.setAttribute('aria-label', `${GRADES[rep.grade].label}: ${rep.cue}`);
  feedback.hidden = false;
  replay(feedback, 'pop');

  const flash = $('flash');
  flash.style.setProperty('--flash', FLASH_COLORS[rep.grade]);
  replay(flash, 'on');
}

/** Big centred countdown; pass 0 to hide it. */
export function setCountdown(secondsLeft) {
  const el = $('countdown');
  el.hidden = secondsLeft <= 0;
  if (secondsLeft > 0) el.innerHTML = `${secondsLeft}<small>Get in position</small>`;
}

export function setLoading(text, { error = false } = {}) {
  const el = $('loading');
  el.hidden = !text;
  el.classList.toggle('error', error);
  $('loading-text').textContent = text || '';
  $('btn-loading-back').hidden = !error;
}

export function setFps(fps, delegate) {
  $('fps').textContent = fps ? `${fps} fps · ${delegate}` : '';
}
