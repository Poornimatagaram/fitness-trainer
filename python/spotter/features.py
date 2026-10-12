"""Turn 33 raw landmarks into the numbers the exercises care about.

Mirrors web/js/core/features.js. Landmarks can be MediaPipe landmark objects
or spotter.landmarks.Landmark tuples: anything with .x, .y and .visibility.
"""

from .geometry import angle_at, distance, midpoint, tilt_from_vertical
from .landmarks import LANDMARK_COUNT, SIDES

MIN_VISIBILITY = 0.5  # ignore joints the model is unsure about
SIDE_SWITCH_MARGIN = 0.15  # how much better the other side must be to switch
FRONT_VIEW_RATIO = 0.5  # shoulder width / torso length above this = facing camera


def visibility_of(landmark):
    """Some MediaPipe builds omit visibility; treat a missing value as fully visible."""
    vis = getattr(landmark, "visibility", None)
    return 1.0 if vis is None else vis


def side_visibility(landmarks, side, joints):
    """The lowest visibility among `joints` on one side (a chain is only as good as its weakest joint)."""
    return min(visibility_of(landmarks[SIDES[side][joint]]) for joint in joints)


def pick_side(landmarks, joints, current_side=None):
    """Choose which side of the body to measure: 'left', 'right', or None.

    Uses the side the model sees best, but keeps the current side unless the
    other one is clearly better, so the reading doesn't flicker mid-rep.
    """
    vis = {side: side_visibility(landmarks, side, joints) for side in ("left", "right")}
    side = "left" if vis["left"] >= vis["right"] else "right"
    if current_side:
        other = "right" if current_side == "left" else "left"
        still_visible = vis[current_side] >= MIN_VISIBILITY
        if still_visible and vis[other] - vis[current_side] < SIDE_SWITCH_MARGIN:
            side = current_side
    return side if vis[side] >= MIN_VISIBILITY else None


def hip_sag(shoulder, hip, ankle):
    """Signed bend at the hip vs a straight shoulder-ankle line, in degrees.

    Positive = hips sag below the line, negative = hips pike above it.
    """
    bend = 180 - angle_at(shoulder, hip, ankle)
    dx = ankle["x"] - shoulder["x"]
    if abs(dx) < 1e-6:
        return 0.0  # body is vertical: sag is not meaningful
    # Height of the straight line at the hip's x position (y grows downward).
    line_y = shoulder["y"] + ((hip["x"] - shoulder["x"]) / dx) * (ankle["y"] - shoulder["y"])
    return bend if hip["y"] > line_y else -bend


def _front_view_features(point):
    """View detection and knee width ratio (knee cave is only measurable from the front)."""
    ls, rs, lh, rh = (point(i) for i in (11, 12, 23, 24))
    if not (ls and rs and lh and rh):
        return {"view": "side", "kneeWidthRatio": None}

    torso_length = distance(midpoint(ls, rs), midpoint(lh, rh))
    shoulder_width = abs(ls["x"] - rs["x"])
    view = "front" if torso_length > 0 and shoulder_width / torso_length > FRONT_VIEW_RATIO else "side"

    knee_width_ratio = None
    lk, rk, la, ra = (point(i) for i in (25, 26, 27, 28))
    if view == "front" and lk and rk and la and ra:
        ankle_width = abs(la["x"] - ra["x"])
        if ankle_width > 0.02:
            knee_width_ratio = abs(lk["x"] - rk["x"]) / ankle_width
    return {"view": view, "kneeWidthRatio": knee_width_ratio}


def extract_features(landmarks, joints, aspect=1.0, current_side=None):
    """Features for one frame, or None if the body is not visible enough.

    aspect = video width / height. Normalised x and y are in different units
    (fractions of width vs height); multiplying x by the aspect ratio makes them
    square again so angles are not distorted.

    Keys use camelCase on purpose so results match the JavaScript version exactly.
    """
    if not landmarks or len(landmarks) < LANDMARK_COUNT:
        return None
    side = pick_side(landmarks, joints, current_side)
    if not side:
        return None

    def point(index):
        lm = landmarks[index]
        return {"x": lm.x * aspect, "y": lm.y} if visibility_of(lm) >= MIN_VISIBILITY else None

    s = SIDES[side]
    a, b, c = (point(s[joint]) for joint in joints)
    shoulder, elbow, hip, ankle = (point(s[name]) for name in ("shoulder", "elbow", "hip", "ankle"))

    return {
        "side": side,
        "angle": angle_at(a, b, c),  # the main angle that drives rep counting
        "torsoLean": tilt_from_vertical(shoulder, hip) if shoulder and hip else None,
        "elbowDrift": angle_at(elbow, shoulder, hip) if shoulder and elbow and hip else None,
        "hipSag": hip_sag(shoulder, hip, ankle) if shoulder and hip and ankle else None,
        **_front_view_features(point),
    }
