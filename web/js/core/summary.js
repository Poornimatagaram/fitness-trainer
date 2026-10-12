// Turns the list of graded reps from one set into the numbers shown on the
// summary screen and saved to workout history.

const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * @param exercise  exercise config (from exercises.js)
 * @param results   rep results from RepCounter (counted and partial)
 * @param startedAt / endedAt  epoch milliseconds
 */
export function summarizeSet({ exercise, results, startedAt, endedAt }) {
  const counted = results.filter((r) => r.counted);

  // Count how often each form cue appeared; the most frequent one is the
  // single thing to work on next set.
  const issueCounts = {};
  for (const r of results) for (const cue of r.issues) issueCounts[cue] = (issueCounts[cue] || 0) + 1;
  const topIssue =
    Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cue, count]) => ({ cue, count }))[0] ?? null;

  return {
    id: String(startedAt),
    exercise: exercise.id,
    startedAt,
    durationSec: Math.round((endedAt - startedAt) / 1000),
    reps: counted.length,
    partials: results.length - counted.length,
    avgScore: counted.length ? Math.round(average(counted.map((r) => r.score))) : 0,
    bestAngle: counted.length ? Math.min(...counted.map((r) => r.minAngle)) : null,
    avgTempoSec: counted.length ? Math.round(average(counted.map((r) => r.durationSec)) * 10) / 10 : null,
    topIssue,
    results: results.map(({ grade, score, minAngle, durationSec, cue, issues }) => ({
      grade,
      score,
      minAngle,
      durationSec,
      cue,
      issues,
    })),
  };
}
