"""Per-set summary (mirrors web/js/core/summary.js)."""

from .geometry import js_round


def _average(values):
    return sum(values) / len(values)


def summarize_set(exercise, results, started_at, ended_at):
    """Totals for one set. started_at / ended_at are epoch milliseconds."""
    counted = [r for r in results if r["counted"]]

    # The most frequent form cue is the one thing to work on next set.
    issue_counts = {}
    for r in results:
        for cue in r["issues"]:
            issue_counts[cue] = issue_counts.get(cue, 0) + 1
    ranked = sorted(issue_counts.items(), key=lambda item: -item[1])  # stable: ties keep first-seen order
    top_issue = {"cue": ranked[0][0], "count": ranked[0][1]} if ranked else None

    return {
        "id": str(started_at),
        "exercise": exercise["id"],
        "startedAt": started_at,
        "durationSec": js_round((ended_at - started_at) / 1000),
        "reps": len(counted),
        "partials": len(results) - len(counted),
        "avgScore": js_round(_average([r["score"] for r in counted])) if counted else 0,
        "bestAngle": min(r["minAngle"] for r in counted) if counted else None,
        "avgTempoSec": js_round(_average([r["durationSec"] for r in counted]) * 10) / 10 if counted else None,
        "topIssue": top_issue,
        "results": [
            {k: r[k] for k in ("grade", "score", "minAngle", "durationSec", "cue", "issues")} for r in results
        ],
    }
