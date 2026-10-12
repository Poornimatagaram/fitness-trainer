"""MediaPipe Pose landmark indices used by Spotter (mirrors web/js/core/landmarks.js).

Full map: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
"""

from collections import namedtuple

LANDMARK_COUNT = 33

# Joint indices for each side, so exercises can say "hip, knee, ankle"
# without caring which side the camera sees best.
SIDES = {
    "left": {"shoulder": 11, "elbow": 13, "wrist": 15, "hip": 23, "knee": 25, "ankle": 27},
    "right": {"shoulder": 12, "elbow": 14, "wrist": 16, "hip": 24, "knee": 26, "ankle": 28},
}

# Bones to draw for the skeleton overlay (face left out on purpose).
SKELETON = [
    (11, 12), (11, 23), (12, 24), (23, 24),  # torso
    (11, 13), (13, 15), (12, 14), (14, 16),  # arms
    (23, 25), (25, 27), (24, 26), (26, 28),  # legs
    (27, 29), (29, 31), (27, 31),  # left foot
    (28, 30), (30, 32), (28, 32),  # right foot
]

# A lightweight landmark for tests and cached evaluation data. MediaPipe's own
# landmark objects have the same attribute names, so either can be used.
Landmark = namedtuple("Landmark", "x y z visibility", defaults=(0.0, 1.0))
