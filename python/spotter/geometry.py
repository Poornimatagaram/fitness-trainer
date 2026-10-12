"""Small, pure math helpers (mirrors web/js/core/geometry.js).

Points are dicts {"x": ..., "y": ...}. Image coordinates: y grows DOWNWARD.
"""

import math


def angle_at(a, b, c):
    """Angle ABC measured at vertex b, in degrees between 0 and 180."""
    radians = math.atan2(c["y"] - b["y"], c["x"] - b["x"]) - math.atan2(a["y"] - b["y"], a["x"] - b["x"])
    degrees = abs(math.degrees(radians))
    if degrees > 180:
        degrees = 360 - degrees  # always report the inner angle
    return degrees


def tilt_from_vertical(top, bottom):
    """How far the line from bottom to top tilts away from straight up (0 = vertical)."""
    dx = top["x"] - bottom["x"]
    dy = bottom["y"] - top["y"]  # flip y so "up" is positive
    return abs(math.degrees(math.atan2(dx, dy)))


def distance(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def midpoint(a, b):
    return {"x": (a["x"] + b["x"]) / 2, "y": (a["y"] + b["y"]) / 2}


def js_round(value):
    """Round half up, like JavaScript's Math.round (Python's round() uses banker's rounding)."""
    return math.floor(value + 0.5)


class EmaFilter:
    """Exponential moving average that smooths by elapsed *time*, not frame count.

    Using dt keeps the smoothing (and its lag) the same at 15 fps or 60 fps.
    """

    def __init__(self, time_constant_sec):
        self.tau = time_constant_sec
        self.reset()

    def reset(self):
        self.value = None
        self.last_t = None

    def update(self, x, t_sec):
        if self.value is None:
            self.value = x  # first sample: nothing to smooth against yet
        else:
            dt = max(0.0, t_sec - self.last_t)
            alpha = 1 - math.exp(-dt / self.tau)  # 0 = ignore new sample, 1 = jump to it
            self.value += alpha * (x - self.value)
        self.last_t = t_sec
        return self.value
