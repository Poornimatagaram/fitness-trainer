"""Exercise definitions as plain data (mirrors web/js/core/exercises.js).

thresholds (degrees at the middle joint of `joints`):
  start   - a rep attempt begins when the angle drops below this
  end     - the rep finishes when the angle rises back above this (lockout)
  good    - the lowest angle must reach this for the rep to count
  perfect - reaching this earns full depth points

checks are form rules evaluated over the whole rep:
  metric (feature name), agg ('max' | 'min' | 'range'), op ('>' | '<'), limit, cue
"""

EXERCISES = {
    "squat": {
        "id": "squat",
        "name": "Squat",
        "joints": ["hip", "knee", "ankle"],
        "thresholds": {"start": 140, "end": 160, "good": 100, "perfect": 90},
        "cues": {
            "perfect": "Great depth!",
            "good": "Good rep",
            "shallow": "Go deeper",
            "lockout": "Stand all the way up",
        },
        "checks": [
            {"metric": "torsoLean", "agg": "max", "op": ">", "limit": 55, "cue": "Keep your chest up"},
            {"metric": "kneeWidthRatio", "agg": "min", "op": "<", "limit": 0.8, "cue": "Push your knees out"},
        ],
    },
    "lunge": {
        "id": "lunge",
        "name": "Lunge",
        "joints": ["hip", "knee", "ankle"],
        "thresholds": {"start": 140, "end": 155, "good": 105, "perfect": 95},
        "cues": {
            "perfect": "Great lunge!",
            "good": "Good rep",
            "shallow": "Drop your back knee lower",
            "lockout": "Stand tall between reps",
        },
        "checks": [
            {"metric": "torsoLean", "agg": "max", "op": ">", "limit": 30, "cue": "Keep your torso upright"},
        ],
    },
    "curl": {
        "id": "curl",
        "name": "Bicep Curl",
        "joints": ["shoulder", "elbow", "wrist"],
        # A straight arm only reads ~150-155 deg in 2D (see the push-up eval clip), so lockout is 140.
        "thresholds": {"start": 110, "end": 140, "good": 60, "perfect": 45},
        "cues": {
            "perfect": "Full squeeze!",
            "good": "Good curl",
            "shallow": "Curl all the way up",
            "lockout": "Lower all the way down",
        },
        "checks": [
            {"metric": "elbowDrift", "agg": "max", "op": ">", "limit": 35, "cue": "Keep your elbows pinned"},
            {"metric": "torsoLean", "agg": "range", "op": ">", "limit": 15, "cue": "Don't swing your body"},
        ],
    },
    "pushup": {
        "id": "pushup",
        "name": "Push-up",
        "joints": ["shoulder", "elbow", "wrist"],
        # Calibrated on real video: locked-out arms plateau at ~150-155 deg, so 155 missed reps.
        "thresholds": {"start": 130, "end": 145, "good": 100, "perfect": 90},
        "cues": {
            "perfect": "Chest to floor!",
            "good": "Good push-up",
            "shallow": "Go lower",
            "lockout": "Lock out your arms",
        },
        "checks": [
            {"metric": "hipSag", "agg": "max", "op": ">", "limit": 20, "cue": "Don't let your hips sag"},
            {"metric": "hipSag", "agg": "min", "op": "<", "limit": -20, "cue": "Lower your hips"},
        ],
    },
}


def depth_progress(exercise, angle):
    """0 at lockout, 1 at "perfect" depth. Drives the on-screen depth meter."""
    t = exercise["thresholds"]
    return min(1.0, max(0.0, (t["end"] - angle) / (t["end"] - t["perfect"])))
