"""Spotter desktop coach: webcam (or video file) + OpenCV window.

The Python twin of the web app, built on the same spotter package.
It replaces the original prototype in legacy/squat_with_feedback.py.

Usage:
    python python/live_coach.py --exercise squat          # webcam 0
    python python/live_coach.py --exercise curl --camera 1
    python python/live_coach.py --exercise pushup --video clip.mp4
Press q to quit.
"""

import argparse
import sys
import time
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent))
from spotter import EXERCISES, RepCounter, summarize_set  # noqa: E402
from spotter.features import MIN_VISIBILITY  # noqa: E402
from spotter.landmarks import SIDES, SKELETON  # noqa: E402
from spotter.pose_model import PoseDetector  # noqa: E402

# OpenCV colours are BGR.
GRADE_COLORS = {"perfect": (75, 215, 50), "good": (75, 215, 50), "warning": (10, 214, 255), "partial": (58, 69, 255)}
WHITE, GREY, AMBER = (255, 255, 255), (200, 200, 200), (10, 214, 255)


def draw_skeleton(frame, landmarks, exercise, state):
    h, w = frame.shape[:2]

    def px(i):
        return int(landmarks[i].x * w), int(landmarks[i].y * h)

    def visible(i):
        return (landmarks[i].visibility or 0) >= MIN_VISIBILITY

    for a, b in SKELETON:
        if visible(a) and visible(b):
            cv2.line(frame, px(a), px(b), GREY, 2, cv2.LINE_AA)

    if state["tracked"]:
        ids = [SIDES[state["side"]][joint] for joint in exercise["joints"]]
        color = AMBER if state["liveCues"] else GRADE_COLORS["perfect"]
        cv2.line(frame, px(ids[0]), px(ids[1]), color, 6, cv2.LINE_AA)
        cv2.line(frame, px(ids[1]), px(ids[2]), color, 6, cv2.LINE_AA)
        x, y = px(ids[1])
        cv2.putText(frame, f"{int(state['angle'])} deg", (x + 15, y - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--exercise", choices=EXERCISES, default="squat")
    parser.add_argument("--camera", type=int, default=0, help="webcam index")
    parser.add_argument("--video", help="process a video file instead of the webcam")
    parser.add_argument("--model", choices=["lite", "full", "heavy"], default="lite")
    args = parser.parse_args()

    exercise = EXERCISES[args.exercise]
    counter = RepCounter(exercise)
    cap = cv2.VideoCapture(args.video if args.video else args.camera)
    if not cap.isOpened():
        sys.exit("Could not open the camera/video.")

    started_at = time.time() * 1000
    feedback, feedback_color = "", WHITE
    prev = time.time()
    print(f"{exercise['name']} coach started. Press 'q' to quit.")

    with PoseDetector(args.model) as detector:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            h, w = frame.shape[:2]
            # Video files: use the file's own clock. Webcam: wall-clock time.
            t_ms = cap.get(cv2.CAP_PROP_POS_MSEC) if args.video else (time.time() * 1000 - started_at)

            landmarks = detector.detect(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), t_ms)
            state = counter.update(landmarks, t_ms, aspect=w / h)

            if landmarks:
                draw_skeleton(frame, landmarks, exercise, state)
            if not state["tracked"]:
                cv2.putText(frame, "Move so the camera can see you", (10, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.9, AMBER, 2)
            if state["liveCues"]:
                cv2.putText(frame, state["liveCues"][0], (10, h - 70), cv2.FONT_HERSHEY_SIMPLEX, 1.0, AMBER, 2)
            if state["rep"]:
                rep = state["rep"]
                feedback, feedback_color = rep["cue"], GRADE_COLORS[rep["grade"]]
                print(f"Rep attempt: lowest {rep['minAngle']} deg, {rep['grade']}, score {rep['score']} -> {rep['cue']}")

            now = time.time()
            fps, prev = 1 / max(now - prev, 1e-6), now
            cv2.putText(frame, f"REPS: {counter.reps}", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 2, (75, 215, 50), 4)
            if feedback:
                cv2.putText(frame, feedback, (10, h - 25), cv2.FONT_HERSHEY_SIMPLEX, 1.2, feedback_color, 3)
            cv2.putText(frame, f"FPS: {int(fps)}", (w - 130, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, GREY, 2)

            cv2.imshow(f"Spotter - {exercise['name']}", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()
    summary = summarize_set(exercise, counter.results, started_at, time.time() * 1000)
    print(f"\nDone: {summary['reps']} reps, {summary['partials']} not counted, form score {summary['avgScore']}.")
    if summary["topIssue"]:
        print(f"Focus next set: {summary['topIssue']['cue']} ({summary['topIssue']['count']}x)")


if __name__ == "__main__":
    main()
