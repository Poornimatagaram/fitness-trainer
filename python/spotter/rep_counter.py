"""The rep counter: a small state machine fed one frame at a time.

Mirrors web/js/core/repCounter.js; see that file for a diagram.

           angle < start                     angle > end
  [ up ] ────────────────▶ [ down ] ───────────────────────▶ grade rep ─▶ [ up ]
                             └── rose past halfway, then dropped below `start` again
                                 without locking out: grade as partial, start a new attempt
"""

from .exercises import depth_progress
from .features import extract_features
from .geometry import EmaFilter, js_round

SMOOTHING_SECONDS = 0.08  # EMA time constant for angles and metrics
LOST_TIMEOUT_SECONDS = 1.0  # abandon a rep if the body is hidden this long
MIN_REP_SECONDS = 0.4  # faster "reps" are tracking glitches (e.g. camera cuts), not movement
ISSUE_PENALTY = 15  # score points lost per form issue
METRICS = ["torsoLean", "elbowDrift", "hipSag", "kneeWidthRatio"]


class RepCounter:
    def __init__(self, exercise):
        self.exercise = exercise
        self.filters = {name: EmaFilter(SMOOTHING_SECONDS) for name in ["angle", *METRICS]}
        self.reset()

    def reset(self):
        self.phase = "up"
        self.side = None
        self.rep = None  # stats for the rep in progress
        self.last_seen = None  # time of the last frame with a visible body
        self.reps = 0
        self.partials = 0
        self.results = []
        self._reset_filters()

    def _reset_filters(self):
        for f in self.filters.values():
            f.reset()

    def update(self, landmarks, timestamp_ms, aspect=1.0):
        """Process one frame. Returns a summary dict; 'rep' is set on the frame a rep finishes."""
        t = timestamp_ms / 1000
        raw = extract_features(landmarks, self.exercise["joints"], aspect, self.side)
        if raw is None:
            return self._handle_lost(t)

        self.last_seen = t
        self.side = raw["side"]
        f = self._smooth(raw, t)
        start, end = self.exercise["thresholds"]["start"], self.exercise["thresholds"]["end"]
        finished = None

        if self.phase == "up":
            if f["angle"] < start:
                self._begin_rep(t, f)
        else:
            _track_rep(self.rep, f)
            if f["angle"] > end:
                finished = self._finish_rep(t, locked_out=True)
            elif self.rep["rose"] and f["angle"] < start:
                # Came most of the way up, then went back down without locking out.
                finished = self._finish_rep(t, locked_out=False)
                self._begin_rep(t, f)
            elif f["angle"] > (start + end) / 2:
                self.rep["rose"] = True

        return {
            "tracked": True,
            "phase": self.phase,
            "angle": f["angle"],
            "side": self.side,
            "view": raw["view"],
            "progress": depth_progress(self.exercise, f["angle"]),
            "liveCues": _live_cues(self.exercise, self.rep, f) if self.phase == "down" else [],
            "rep": finished,
        }

    def _smooth(self, raw, t):
        """Smooth the main angle and each metric. A metric that disappears resets its filter."""
        smoothed = {"angle": self.filters["angle"].update(raw["angle"], t)}
        for name in METRICS:
            if raw[name] is None:
                self.filters[name].reset()
                smoothed[name] = None
            else:
                smoothed[name] = self.filters[name].update(raw[name], t)
        return smoothed

    def _begin_rep(self, t, f):
        self.phase = "down"
        self.rep = {"startT": t, "minAngle": f["angle"], "rose": False, "metrics": {}}
        _track_rep(self.rep, f)

    def _finish_rep(self, t, locked_out):
        rep, self.phase, self.rep = self.rep, "up", None
        if t - rep["startT"] < MIN_REP_SECONDS:
            return None  # too fast to be a real rep: ignore it

        result = grade_rep(self.exercise, rep, t, locked_out)
        if result["counted"]:
            self.reps += 1
        else:
            self.partials += 1
        result["number"] = self.reps if result["counted"] else None
        self.results.append(result)
        return result

    def _handle_lost(self, t):
        # A short dropout is ignored; a long one abandons the rep.
        if self.last_seen is None or t - self.last_seen > LOST_TIMEOUT_SECONDS:
            self.phase = "up"
            self.rep = None
            self.side = None
            self._reset_filters()
        return {
            "tracked": False, "phase": self.phase, "angle": None, "side": self.side,
            "view": None, "progress": 0, "liveCues": [], "rep": None,
        }


def _track_rep(rep, f):
    """Record the lowest angle and the min/max of each metric for the rep in progress."""
    rep["minAngle"] = min(rep["minAngle"], f["angle"])
    for name in METRICS:
        value = f[name]
        if value is None:
            continue
        stats = rep["metrics"].get(name)
        if stats is None:
            rep["metrics"][name] = {"min": value, "max": value}
        else:
            stats["min"] = min(stats["min"], value)
            stats["max"] = max(stats["max"], value)


def _aggregate(rep, check):
    stats = rep["metrics"].get(check["metric"])
    if stats is None:
        return None  # never measured, e.g. knee width from a side view
    if check["agg"] == "max":
        return stats["max"]
    if check["agg"] == "min":
        return stats["min"]
    return stats["max"] - stats["min"]  # 'range'


def _violates(check, value):
    if value is None:
        return False
    return value > check["limit"] if check["op"] == ">" else value < check["limit"]


def _live_cues(exercise, rep, f):
    """Form problems happening right now (shown while the rep is in progress)."""
    cues = []
    for check in exercise["checks"]:
        value = _aggregate(rep, check) if check["agg"] == "range" else f[check["metric"]]
        if _violates(check, value):
            cues.append(check["cue"])
    return cues


def grade_rep(exercise, rep, end_t, locked_out):
    """Grade a finished rep: depth decides if it counts, form issues lower the score.

    grade: 'perfect' | 'good' (counted, clean), 'warning' (counted, form issue),
           'partial' (not counted: too shallow or no lockout)
    """
    good, perfect = exercise["thresholds"]["good"], exercise["thresholds"]["perfect"]
    issues = [c["cue"] for c in exercise["checks"] if _violates(c, _aggregate(rep, c))]
    base = {
        "minAngle": js_round(rep["minAngle"]),
        "durationSec": js_round((end_t - rep["startT"]) * 100) / 100,
        "issues": issues,
    }
    cues = exercise["cues"]

    if rep["minAngle"] > good:
        return {**base, "counted": False, "grade": "partial", "score": 0, "cue": cues["shallow"]}
    if not locked_out:
        return {**base, "counted": False, "grade": "partial", "score": 0, "cue": cues["lockout"]}

    # Full points at perfect depth; 80 at the minimum counted depth, linear in between.
    if rep["minAngle"] <= perfect:
        depth_score = 100
    else:
        depth_score = 80 + 20 * (good - rep["minAngle"]) / (good - perfect)
    score = max(0, js_round(depth_score - ISSUE_PENALTY * len(issues)))
    if issues:
        return {**base, "counted": True, "grade": "warning", "score": score, "cue": issues[0]}

    grade = "perfect" if rep["minAngle"] <= perfect else "good"
    return {**base, "counted": True, "grade": grade, "score": score, "cue": cues[grade]}
