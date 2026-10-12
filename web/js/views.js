// HTML for the home, summary and history screens.
// Plain template strings; anything that could contain stored text is escaped.

import { EXERCISES } from './core/exercises.js';
import { groupByDay, weeklyStats } from './storage.js';

// Colour is never the only signal: every grade also has an icon and a label.
export const GRADES = {
  perfect: { icon: '✓', label: 'Perfect' },
  good: { icon: '✓', label: 'Good' },
  warning: { icon: '!', label: 'Form cue' },
  partial: { icon: '✕', label: 'Not counted' },
};

export function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (c) => map[c]);
}

export function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const exerciseIcon = (id) => `<svg viewBox="0 0 48 48" aria-hidden="true"><use href="#ex-${esc(id)}"/></svg>`;

export function gradeDot(grade) {
  const g = GRADES[grade] ?? GRADES.partial;
  return `<span class="grade-dot" data-grade="${esc(grade)}" role="img" aria-label="${g.label}">${g.icon}</span>`;
}

function statTiles(tiles) {
  return tiles
    .map(
      ({ label, value, unit = '' }) =>
        `<div class="stat"><div class="stat-label">${esc(label)}</div>` +
        `<div class="stat-value">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div></div>`,
    )
    .join('');
}

function weekTiles(history) {
  const week = weeklyStats(history);
  return statTiles([
    { label: 'Sets', value: week.sets },
    { label: 'Reps', value: week.reps },
    { label: 'Form score', value: week.reps ? week.avgScore : '–' },
  ]);
}

const LEGEND = `<div class="grade-legend">
  <span>${gradeDot('perfect')} Counted</span>
  <span>${gradeDot('warning')} Counted, form cue</span>
  <span>${gradeDot('partial')} Not counted</span>
</div>`;

// ---------- Home ----------

export function renderExerciseGrid(container, selectedId) {
  container.innerHTML = Object.values(EXERCISES)
    .map(
      (ex) => `<button type="button" class="exercise-card" role="radio" aria-checked="${ex.id === selectedId}" data-id="${ex.id}">
        ${exerciseIcon(ex.id)}<strong>${esc(ex.name)}</strong><small>${esc(ex.muscles)}</small>
      </button>`,
    )
    .join('');
}

export function renderWeekStats(container, history) {
  container.innerHTML = weekTiles(history);
}

// ---------- Summary ----------

export function renderSummary(container, set) {
  const exercise = EXERCISES[set.exercise];
  const when = new Date(set.startedAt).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const tiles = statTiles([
    { label: 'Form score', value: set.reps ? set.avgScore : '–', unit: set.reps ? '/100' : '' },
    { label: 'Not counted', value: set.partials },
    { label: 'Deepest angle', value: set.bestAngle ?? '–', unit: set.bestAngle === null ? '' : '°' },
    { label: 'Avg rep time', value: set.avgTempoSec ?? '–', unit: set.avgTempoSec === null ? '' : 's' },
  ]);

  let focus = '';
  if (set.topIssue) {
    focus = `<div class="focus-card">${gradeDot('warning')}<div>
      <strong>Focus next set: ${esc(set.topIssue.cue)}</strong>
      <p>Flagged on ${set.topIssue.count} of ${set.results.length} reps.</p></div></div>`;
  } else if (set.reps) {
    focus = `<div class="focus-card clean">${gradeDot('perfect')}<div>
      <strong>Clean set</strong><p>No form issues detected. Nice work.</p></div></div>`;
  }

  const rows = set.results
    .map(
      (r, i) => `<li>
        <span class="rep-num">${i + 1}</span>${gradeDot(r.grade)}
        <span class="rep-cue">${esc(r.cue)}<small>${GRADES[r.grade]?.label ?? ''} · ${r.minAngle}° · ${r.durationSec}s</small></span>
        <span class="rep-score">${r.grade === 'partial' ? '–' : `${r.score} pts`}</span>
      </li>`,
    )
    .join('');

  container.innerHTML = `
    <p class="eyebrow" style="margin-top:20px">${esc(exercise?.name ?? set.exercise)} · ${formatDuration(set.durationSec)}</p>
    <div class="summary-hero"><span class="big">${set.reps}</span><span class="unit">${set.reps === 1 ? 'rep' : 'reps'}</span></div>
    <p class="fine-print">${esc(when)}</p>
    <section><div class="stat-grid four">${tiles}</div></section>
    ${focus ? `<section>${focus}</section>` : ''}
    <section>
      <h2 class="section-label">Rep by rep</h2>
      ${rows ? `<ol class="rep-list">${rows}</ol>${LEGEND}` : '<p class="empty">No reps recorded.</p>'}
    </section>`;
}

// ---------- History ----------

export function renderHistory(container, history) {
  if (!history.length) {
    container.innerHTML = '<p class="empty">No sets yet. Finish a set and it will appear here.</p>';
    return;
  }
  const groups = groupByDay(history)
    .map(
      (group) =>
        `<h3 class="day-label">${esc(group.label)}</h3>` +
        group.sets
          .map((set) => {
            const time = new Date(set.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            const score = set.reps ? ` · form ${set.avgScore}` : '';
            return `<button type="button" class="set-card" data-id="${esc(set.id)}">
              ${exerciseIcon(set.exercise)}
              <span class="set-main"><strong>${esc(EXERCISES[set.exercise]?.name ?? set.exercise)}</strong>
                <small>${esc(time)} · ${formatDuration(set.durationSec)}${score}</small></span>
              <span class="set-reps">${set.reps}<small>reps</small></span>
            </button>`;
          })
          .join(''),
    )
    .join('');

  container.innerHTML = `
    <section><h2 class="section-label">Last 7 days</h2><div class="stat-grid">${weekTiles(history)}</div></section>
    ${groups}`;
}
