"""Recorded landmark sessions: save, load, and replay through a rep counter.

A session is the pose model's output for a whole video, stored as JSON:
    {"width": 1280, "height": 720,
     "frames": [{"t": <ms>, "landmarks": [[x, y, z, visibility], ...] or null}, ...]}

Caching landmarks means the slow part (running the model) happens once per video;
the rep logic can then be re-evaluated in milliseconds, in Python or in JavaScript
(eval/run_js_counter.mjs reads the same file).
"""

import json
import subprocess
from pathlib import Path

from .exercises import EXERCISES
from .landmarks import Landmark
from .rep_counter import RepCounter

REPO_ROOT = Path(__file__).resolve().parents[2]
JS_COUNTER = REPO_ROOT / "eval" / "run_js_counter.mjs"


def frame_to_json(t_ms, landmarks):
    """One frame in session format. `landmarks` is a list of objects with x/y/z/visibility, or None."""
    if landmarks is None:
        return {"t": t_ms, "landmarks": None}
    rows = [[lm.x, lm.y, getattr(lm, "z", 0.0) or 0.0, getattr(lm, "visibility", None)] for lm in landmarks]
    return {"t": t_ms, "landmarks": rows}


def save_session(path, width, height, frames):
    """frames: list of dicts from frame_to_json()."""
    Path(path).write_text(json.dumps({"width": width, "height": height, "frames": frames}))


def load_session(path):
    data = json.loads(Path(path).read_text())
    for frame in data["frames"]:
        if frame["landmarks"] is not None:
            frame["landmarks"] = [Landmark(*row) for row in frame["landmarks"]]
    return data


def count_reps_python(session, exercise_id):
    """Replay a loaded session through the Python RepCounter."""
    counter = RepCounter(EXERCISES[exercise_id])
    aspect = session["width"] / session["height"]
    for frame in session["frames"]:
        counter.update(frame["landmarks"], frame["t"], aspect)
    return {"reps": counter.reps, "partials": counter.partials, "results": counter.results}


def count_reps_js(session_path, exercise_id, node="node"):
    """Replay a session file through the web app's JavaScript RepCounter (requires Node.js)."""
    out = subprocess.run(
        [node, str(JS_COUNTER), str(session_path), exercise_id],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)
