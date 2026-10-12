"""MediaPipe PoseLandmarker (Tasks API) for Python: the same model the web app uses.

Imported only by the webcam app and the evaluator, so the core logic and its
tests don't need MediaPipe installed.
"""

import urllib.request
from pathlib import Path

MODEL_URLS = {
    "lite": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    "full": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    "heavy": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
}
MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


def ensure_model(variant="lite"):
    """Download the .task model file on first use and return its path."""
    path = MODELS_DIR / f"pose_landmarker_{variant}.task"
    if not path.exists():
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {variant} pose model to {path} ...")
        urllib.request.urlretrieve(MODEL_URLS[variant], path)
    return path


class PoseDetector:
    """Thin wrapper: feed RGB frames with timestamps, get 33 landmarks (or None)."""

    def __init__(self, variant="lite"):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

        self._mp = mp
        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(ensure_model(variant))),
            running_mode=RunningMode.VIDEO,  # same mode as the web app: tracks between frames
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker = PoseLandmarker.create_from_options(options)
        self._last_ts = -1

    def detect(self, rgb_frame, timestamp_ms):
        ts = max(int(timestamp_ms), self._last_ts + 1)  # VIDEO mode needs increasing timestamps
        self._last_ts = ts
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb_frame)
        result = self._landmarker.detect_for_video(image, ts)
        return result.pose_landmarks[0] if result.pose_landmarks else None

    def close(self):
        self._landmarker.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
