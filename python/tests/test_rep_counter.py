import math

from puppet import plank_pose, run, side_pose, trajectory
from spotter import EXERCISES, RepCounter, grade_rep, summarize_set


def squats(keyframes, **extra):
    return [side_pose(knee=k, **extra) for k in trajectory(keyframes)]


def grades(counter):
    return [r["grade"] for r in counter.results]


def test_counts_three_perfect_squats():
    counter = run(RepCounter(EXERCISES["squat"]), squats([175, 80, 175, 80, 175, 80, 175]))
    assert (counter.reps, counter.partials) == (3, 0)
    assert grades(counter) == ["perfect"] * 3
    assert [r["number"] for r in counter.results] == [1, 2, 3]


def test_shallow_squat_is_partial():
    counter = run(RepCounter(EXERCISES["squat"]), squats([175, 120, 175]))
    assert (counter.reps, counter.partials) == (0, 1)
    assert counter.results[0]["cue"] == "Go deeper"


def test_good_depth_gets_partial_score():
    counter = run(RepCounter(EXERCISES["squat"]), squats([175, 95, 175]))
    rep = counter.results[0]
    assert rep["grade"] == "good"
    assert 80 < rep["score"] < 100


def test_jitter_while_standing_never_counts():
    frames = [side_pose(knee=160 + 6 * math.sin(i * 1.7)) for i in range(300)]
    counter = run(RepCounter(EXERCISES["squat"]), frames)
    assert counter.reps + counter.partials == 0


def test_noisy_rep_counts_once():
    frames = [side_pose(knee=k + 5 * math.sin(i * 2.3)) for i, k in enumerate(trajectory([175, 85, 175]))]
    counter = run(RepCounter(EXERCISES["squat"]), frames)
    assert (counter.reps, counter.partials) == (1, 0)


def test_missed_lockout_is_flagged():
    counter = run(RepCounter(EXERCISES["squat"]), squats([175, 85, 156, 85, 175]))
    assert counter.partials == 1
    assert counter.results[0]["cue"] == "Stand all the way up"
    assert counter.reps == 1


def test_forward_lean_is_flagged():
    frames = [side_pose(knee=k, torso_lean=65 if k < 120 else 10) for k in trajectory([175, 85, 175])]
    rep = run(RepCounter(EXERCISES["squat"]), frames).results[0]
    assert rep["counted"] and rep["grade"] == "warning"
    assert rep["cue"] == "Keep your chest up"
    assert rep["score"] == 85


def test_widescreen_frames_with_aspect():
    aspect = 16 / 9
    counter = run(RepCounter(EXERCISES["squat"]), squats([175, 85, 175, 85, 175], aspect=aspect), aspect=aspect)
    assert counter.reps == 2


def test_long_tracking_loss_abandons_rep():
    down = [side_pose(knee=k) for k in trajectory([175, 85])]
    counter = run(RepCounter(EXERCISES["squat"]), down + [None] * 45 + squats([175, 85, 175]))
    assert (counter.reps, counter.partials) == (1, 0)


def test_split_second_glitch_is_ignored():
    knees = [175] * 10 + [60] * 4 + [175] * 10
    counter = run(RepCounter(EXERCISES["squat"]), [side_pose(knee=k) for k in knees])
    assert counter.reps + counter.partials == 0


def test_lunge_curl_pushup():
    lunges = [side_pose(knee=k, torso_lean=40) for k in trajectory([170, 92, 170, 92, 170])]
    counter = run(RepCounter(EXERCISES["lunge"]), lunges)
    assert counter.reps == 2
    assert all(r["cue"] == "Keep your torso upright" for r in counter.results)

    curls = [side_pose(elbow=e) for e in trajectory([170, 40, 170, 40, 170])]
    assert grades(run(RepCounter(EXERCISES["curl"]), curls)) == ["perfect", "perfect"]

    sagging = [plank_pose(elbow=e, hip_sag=30) for e in trajectory([170, 80, 170])]
    counter = run(RepCounter(EXERCISES["pushup"]), sagging)
    assert counter.reps == 1
    assert counter.results[0]["cue"] == "Don't let your hips sag"


def test_grade_rep_knee_cave_and_score_floor():
    rep = {"startT": 0, "minAngle": 85, "metrics": {"kneeWidthRatio": {"min": 0.6, "max": 1.0}}}
    assert grade_rep(EXERCISES["squat"], rep, 2, True)["issues"] == ["Push your knees out"]

    many = {**EXERCISES["curl"], "checks": [EXERCISES["curl"]["checks"][0]] * 10}
    rep = {"startT": 0, "minAngle": 30, "metrics": {"elbowDrift": {"min": 10, "max": 90}}}
    assert grade_rep(many, rep, 1, True)["score"] == 0


def test_summarize_set():
    def rep(**kw):
        base = {"counted": True, "grade": "perfect", "score": 100, "minAngle": 85,
                "durationSec": 2, "cue": "Great depth!", "issues": []}
        return {**base, **kw}

    results = [
        rep(),
        rep(grade="warning", score=85, minAngle=88, durationSec=3, issues=["Keep your chest up"]),
        rep(grade="warning", score=70, minAngle=80, durationSec=2.5,
            issues=["Keep your chest up", "Push your knees out"]),
        rep(counted=False, grade="partial", score=0, minAngle=120, issues=["Push your knees out"]),
        rep(counted=False, grade="partial", score=0, minAngle=125, issues=["Keep your chest up"]),
    ]
    s = summarize_set(EXERCISES["squat"], results, 1_000, 61_000)
    assert (s["reps"], s["partials"], s["avgScore"], s["bestAngle"]) == (3, 2, 85, 80)
    assert s["avgTempoSec"] == 2.5
    assert s["topIssue"] == {"cue": "Keep your chest up", "count": 3}
    assert summarize_set(EXERCISES["curl"], [], 0, 5_000)["topIssue"] is None
