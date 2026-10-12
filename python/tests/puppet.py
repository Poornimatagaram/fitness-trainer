"""Stick-figure "puppet" that builds synthetic landmarks from joint angles.

Mirrors web/tests/helpers/puppet.js so both test suites drive the logic the same way.
"""

import math

from spotter.landmarks import LANDMARK_COUNT, Landmark

SHIN, THIGH, TORSO, UPPER_ARM, FOREARM = 0.2, 0.2, 0.25, 0.13, 0.12
LEFT = {"shoulder": 11, "elbow": 13, "wrist": 15, "hip": 23, "knee": 25, "ankle": 27}
RIGHT = {"shoulder": 12, "elbow": 14, "wrist": 16, "hip": 24, "knee": 26, "ankle": 28}


def _add(p, v, length):
    return (p[0] + v[0] * length, p[1] + v[1] * length)


def _rotate(v, deg):
    """Rotate a vector by deg degrees (y points down, so positive = clockwise on screen)."""
    r = math.radians(deg)
    return (v[0] * math.cos(r) - v[1] * math.sin(r), v[0] * math.sin(r) + v[1] * math.cos(r))


def _empty():
    return [Landmark(0.5, 0.5, 0.0, 0.0) for _ in range(LANDMARK_COUNT)]


def _set_side(landmarks, ids, joints, visibility, aspect, x_offset=0.0):
    for name, (x, y) in joints.items():
        landmarks[ids[name]] = Landmark((x + x_offset) / aspect, y, 0.0, visibility)


def side_pose(knee=175, elbow=170, torso_lean=5, upper_arm=10, near_vis=0.95, far_vis=0.4, aspect=1.0):
    """Standing figure seen from the side, facing +x."""
    lean = math.radians(torso_lean)
    ankle = (0.5, 0.9)
    knee_pt = _add(ankle, (0, -1), SHIN)  # vertical shin
    hip = _add(knee_pt, _rotate((0, 1), knee), THIGH)
    shoulder = _add(hip, (math.sin(lean), -math.cos(lean)), TORSO)
    torso_down = (-math.sin(lean), math.cos(lean))
    upper_dir = _rotate(torso_down, -upper_arm)  # arm swings forward
    elbow_pt = _add(shoulder, upper_dir, UPPER_ARM)
    wrist = _add(elbow_pt, _rotate((-upper_dir[0], -upper_dir[1]), elbow), FOREARM)

    joints = {"shoulder": shoulder, "elbow": elbow_pt, "wrist": wrist, "hip": hip, "knee": knee_pt, "ankle": ankle}
    landmarks = _empty()
    _set_side(landmarks, LEFT, joints, near_vis, aspect)
    _set_side(landmarks, RIGHT, joints, far_vis, aspect, 0.01)  # far side nearly overlaps
    return landmarks


def plank_pose(elbow=170, hip_sag=0, aspect=1.0):
    """Push-up plank seen from the side. hip_sag > 0 drops the hips below the body line."""
    wrist = (0.3, 0.8)
    elbow_pt = _add(wrist, (0, -1), FOREARM)
    shoulder = _add(elbow_pt, _rotate((0, 1), elbow), UPPER_ARM)
    slope = 10
    hip = _add(shoulder, _rotate((1, 0), slope + hip_sag / 2), TORSO)
    legs = _rotate((1, 0), slope - hip_sag / 2)
    joints = {
        "shoulder": shoulder, "elbow": elbow_pt, "wrist": wrist, "hip": hip,
        "knee": _add(hip, legs, THIGH), "ankle": _add(hip, legs, THIGH + SHIN),
    }
    landmarks = _empty()
    _set_side(landmarks, LEFT, joints, 0.95, aspect)
    _set_side(landmarks, RIGHT, joints, 0.4, aspect, 0.01)
    return landmarks


def front_pose(knee_ratio=1.0, aspect=1.0):
    """Standing figure facing the camera. knee_ratio < 1 pulls the knees inward (valgus)."""
    half = {"shoulder": 0.1, "elbow": 0.12, "wrist": 0.12, "hip": 0.06, "knee": 0.08 * knee_ratio, "ankle": 0.08}
    ys = {"shoulder": 0.3, "elbow": 0.42, "wrist": 0.52, "hip": 0.55, "knee": 0.72, "ankle": 0.9}
    landmarks = _empty()
    for ids, sign in ((LEFT, 1), (RIGHT, -1)):  # the person's left appears on image right
        joints = {j: (0.5 + sign * half[j], ys[j]) for j in ys}
        _set_side(landmarks, ids, joints, 0.9, aspect)
    return landmarks


def trajectory(keyframes, steps=20, hold=6):
    """Interpolate between keyframe values with a short hold at each keyframe."""
    values = []
    for a, b in zip(keyframes, keyframes[1:]):
        values += [a] * hold
        values += [a + (b - a) * s / steps for s in range(steps)]
    values += [keyframes[-1]] * hold
    return values


def run(counter, frames, fps=30, aspect=1.0, start_ms=0):
    """Feed frames to a counter at a fixed frame rate; returns the counter."""
    for i, landmarks in enumerate(frames):
        counter.update(landmarks, start_ms + i * 1000 / fps, aspect)
    return counter
