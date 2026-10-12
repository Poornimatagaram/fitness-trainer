import math

import pytest

from puppet import front_pose, plank_pose, side_pose
from spotter.features import extract_features, pick_side
from spotter.geometry import EmaFilter, angle_at, js_round, tilt_from_vertical

LEG = ["hip", "knee", "ankle"]
ARM = ["shoulder", "elbow", "wrist"]


def p(x, y):
    return {"x": x, "y": y}


def test_angle_at_basic_angles():
    assert angle_at(p(0, 1), p(0, 0), p(1, 0)) == pytest.approx(90)
    assert angle_at(p(-1, 0), p(0, 0), p(1, 0)) == pytest.approx(180)
    a, b, c = p(0.2, 0.9), p(0.5, 0.5), p(0.1, 0.1)
    assert angle_at(a, b, c) == pytest.approx(angle_at(c, b, a))


def test_tilt_from_vertical():
    assert tilt_from_vertical(p(0, 0), p(0, 1)) == pytest.approx(0)
    assert tilt_from_vertical(p(1, 1), p(0, 1)) == pytest.approx(90)
    assert tilt_from_vertical(p(-1, 0), p(0, 1)) == pytest.approx(45)


def test_ema_is_frame_rate_independent():
    at30, at60 = EmaFilter(0.1), EmaFilter(0.1)
    at30.update(0, 0)
    at60.update(0, 0)
    for i in range(1, 7):
        v30 = at30.update(100, i / 30)
    for i in range(1, 13):
        v60 = at60.update(100, i / 60)
    assert v30 == pytest.approx(v60)
    assert v30 == pytest.approx(100 * (1 - math.exp(-2)))


def test_js_round_matches_javascript():
    # Python's round(2.5) == 2 (banker's rounding); JavaScript's Math.round(2.5) == 3.
    assert [js_round(v) for v in (2.5, 3.5, -2.5, 2.49)] == [3, 4, -2, 2]


def test_side_view_features():
    f = extract_features(side_pose(knee=95, torso_lean=35), LEG)
    assert f["angle"] == pytest.approx(95)
    assert f["torsoLean"] == pytest.approx(35)
    assert f["view"] == "side"
    assert f["kneeWidthRatio"] is None


def test_arm_features():
    f = extract_features(side_pose(elbow=50, upper_arm=25), ARM)
    assert f["angle"] == pytest.approx(50)
    assert f["elbowDrift"] == pytest.approx(25)


def test_aspect_ratio_correction():
    aspect = 16 / 9
    frame = side_pose(knee=120, aspect=aspect)
    assert extract_features(frame, LEG, aspect)["angle"] == pytest.approx(120)
    assert abs(extract_features(frame, LEG)["angle"] - 120) > 5


def test_not_visible_returns_none():
    assert extract_features(side_pose(near_vis=0.2, far_vis=0.1), LEG) is None
    assert extract_features(None, LEG) is None


def test_pick_side_is_sticky():
    assert pick_side(side_pose(near_vis=0.6, far_vis=0.9), LEG) == "right"
    assert pick_side(side_pose(near_vis=0.8, far_vis=0.88), LEG, "left") == "left"
    assert pick_side(side_pose(near_vis=0.6, far_vis=0.95), LEG, "left") == "right"


def test_hip_sag_sign():
    assert extract_features(plank_pose(hip_sag=25), ARM)["hipSag"] == pytest.approx(25)
    assert extract_features(plank_pose(hip_sag=-30), ARM)["hipSag"] == pytest.approx(-30)


def test_front_view_knee_ratio():
    f = extract_features(front_pose(knee_ratio=0.6), LEG)
    assert f["view"] == "front"
    assert f["kneeWidthRatio"] == pytest.approx(0.6)
