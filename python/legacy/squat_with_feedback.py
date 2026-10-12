import time
from collections import deque

import cv2
import mediapipe as mp
import numpy as np

mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
L = mp_pose.PoseLandmark

# Thresholds (degrees)
STAND_ANGLE = 160    # above this = standing
DESCENT_ANGLE = 140  # below this = a squat attempt has started
GOOD_DEPTH = 100     # rep counts if lowest angle goes below this
PERFECT_DEPTH = 90   # "perfect" if lowest angle goes below this
MIN_VISIBILITY = 0.5
SMOOTHING_FRAMES = 5


def calculate_angle(a, b, c):
    """Angle at point b, in degrees."""
    a, b, c = (np.array([p.x, p.y]) for p in (a, b, c))
    rad = np.arctan2(c[1] - b[1], c[0] - b[0]) - np.arctan2(a[1] - b[1], a[0] - b[0])
    deg = abs(np.degrees(rad))
    return 360 - deg if deg > 180 else deg


def pick_leg(landmarks):
    """Return (hip, knee, ankle, side) for the more visible leg, or None."""
    legs = {
        "left": (L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE),
        "right": (L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE),
    }
    best_side, best_vis = None, 0.0
    for side, ids in legs.items():
        vis = min(landmarks[i.value].visibility for i in ids)
        if vis > best_vis:
            best_side, best_vis = side, vis
    if best_vis < MIN_VISIBILITY:
        return None
    hip, knee, ankle = (landmarks[i.value] for i in legs[best_side])
    return hip, knee, ankle, best_side


def main():
    pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
    cap = cv2.VideoCapture(0)

    angles = deque(maxlen=SMOOTHING_FRAMES)
    stage = "up"
    lowest_angle = 180.0
    rep_count = 0
    partial_count = 0
    feedback, feedback_color = "", (255, 255, 255)
    prev_time = time.time()

    print("Squat counter started. Press 'q' to quit.")

    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break
        h, w, _ = frame.shape
        results = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

        if results.pose_landmarks:
            mp_drawing.draw_landmarks(frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)
            leg = pick_leg(results.pose_landmarks.landmark)

            if leg:
                hip, knee, ankle, side = leg
                angles.append(calculate_angle(hip, knee, ankle))
                angle = sum(angles) / len(angles)

                if stage == "up" and angle < DESCENT_ANGLE:
                    stage, lowest_angle = "down", angle
                elif stage == "down":
                    lowest_angle = min(lowest_angle, angle)
                    if angle > STAND_ANGLE:  # back to standing: grade the rep
                        if lowest_angle < PERFECT_DEPTH:
                            rep_count += 1
                            feedback, feedback_color = "Perfect depth!", (0, 255, 0)
                        elif lowest_angle < GOOD_DEPTH:
                            rep_count += 1
                            feedback, feedback_color = "Good depth", (0, 255, 255)
                        else:
                            partial_count += 1
                            feedback, feedback_color = "Go deeper - not counted", (0, 165, 255)
                        print(f"Rep attempt: lowest {int(lowest_angle)} deg -> {feedback}")
                        stage = "up"

                kx, ky = int(knee.x * w), int(knee.y * h)
                cv2.putText(frame, f"{int(angle)} deg", (kx - 30, ky - 20),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                cv2.putText(frame, f"Stage: {stage.upper()} ({side})", (10, 140),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            else:
                angles.clear()
                cv2.putText(frame, "Legs not visible - step back", (10, 140),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

        now = time.time()
        fps = 1 / max(now - prev_time, 1e-6)
        prev_time = now

        cv2.putText(frame, f"REPS: {rep_count}", (10, 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 0), 4)
        if feedback:
            cv2.putText(frame, feedback, (10, 200),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, feedback_color, 3)
        cv2.putText(frame, f"FPS: {int(fps)}", (w - 130, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)

        cv2.imshow("Squat Counter", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    pose.close()
    print(f"\nDone: {rep_count} reps counted, {partial_count} partial reps.")


if __name__ == "__main__":
    main()