"""Cross-language parity: the Python reference and the shipped JavaScript must agree.

Each scenario is replayed through both implementations and the per-rep results
are compared. Skipped automatically if Node.js is not installed.
"""

import json
import math
import shutil
import subprocess

import pytest

from puppet import front_pose, plank_pose, side_pose, trajectory
from spotter import EXERCISES
from spotter.session import REPO_ROOT, count_reps_js, count_reps_python, frame_to_json, load_session, save_session

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="Node.js not installed")


WIDTH, HEIGHT = 1280, 720
A = WIDTH / HEIGHT  # build puppet frames for the same 16:9 frame the session declares


def _scenarios():
    squat_lean = [side_pose(knee=k, torso_lean=65 if k < 120 else 10, aspect=A) for k in trajectory([175, 85, 175])]
    noisy = [side_pose(knee=k + 5 * math.sin(i * 2.3), aspect=A)
             for i, k in enumerate(trajectory([175, 85, 175, 120, 175]))]
    lockout = [side_pose(knee=k, aspect=A) for k in trajectory([175, 85, 156, 92, 175])]
    dropout = [side_pose(knee=k, aspect=A) for k in trajectory([175, 85])] + [None] * 45 + \
              [side_pose(knee=k, aspect=A) for k in trajectory([175, 95, 175])]
    curls = [side_pose(elbow=e, upper_arm=50 if e < 100 else 10, aspect=A) for e in trajectory([170, 40, 170, 70, 170])]
    pushups = [plank_pose(elbow=e, hip_sag=-30, aspect=A) for e in trajectory([170, 80, 170, 95, 170])]
    front = [front_pose(knee_ratio=0.6, aspect=A)] * 10  # front view: no rep, exercises view detection path
    return {
        "squat-lean": ("squat", squat_lean),
        "squat-noisy": ("squat", noisy),
        "squat-lockout": ("squat", lockout),
        "squat-dropout": ("squat", dropout),
        "lunge-lockout": ("lunge", lockout),
        "curl-drift": ("curl", curls),
        "pushup-pike": ("pushup", pushups),
        "squat-front": ("squat", front),
    }


@pytest.mark.parametrize("name", list(_scenarios()))
def test_python_and_js_agree(name, tmp_path):
    exercise_id, frames = _scenarios()[name]
    path = tmp_path / f"{name}.json"
    save_session(path, WIDTH, HEIGHT, [frame_to_json(i * 1000 / 30, f) for i, f in enumerate(frames)])

    py = count_reps_python(load_session(path), exercise_id)
    js = count_reps_js(path, exercise_id, NODE)

    assert py["results"] or name == "squat-front", "scenario should produce at least one rep"
    assert (py["reps"], py["partials"]) == (js["reps"], js["partials"])
    for p, j in zip(py["results"], js["results"]):
        for key in ("counted", "grade", "score", "minAngle", "cue", "issues", "number"):
            assert p[key] == j[key], f"{name}: {key} differs ({p[key]!r} vs {j[key]!r})"
        assert p["durationSec"] == pytest.approx(j["durationSec"])


def test_exercise_configs_match():
    """Thresholds, cues and checks are duplicated in Python and JS; make sure they never drift."""
    script = "import('./web/js/core/exercises.js').then(m => console.log(JSON.stringify(m.EXERCISES)))"
    js = json.loads(subprocess.run([NODE, "--input-type=module", "-e", script], cwd=REPO_ROOT,
                                   capture_output=True, text=True, check=True).stdout)
    assert set(js) == set(EXERCISES)
    for exercise_id, py in EXERCISES.items():
        for key in ("id", "name", "joints", "thresholds", "cues", "checks"):
            assert py[key] == js[exercise_id][key], f"{exercise_id}.{key} differs"
