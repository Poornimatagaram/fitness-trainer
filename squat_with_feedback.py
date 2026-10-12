import cv2
import mediapipe as mp
import numpy as np
import time  # NEW: For timing feedback messages

# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

pose = mp_pose.Pose(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

def calculate_angle(point1, point2, point3):
    """Calculate angle at point2 (the middle point)"""
    a = np.array([point1.x, point1.y])
    b = np.array([point2.x, point2.y])
    c = np.array([point3.x, point3.y])
    
    vector_ba = a - b
    vector_bc = c - b
    
    angle_rad = np.arctan2(vector_bc[1], vector_bc[0]) - np.arctan2(vector_ba[1], vector_ba[0])
    angle_deg = np.abs(angle_rad * 180.0 / np.pi)
    
    if angle_deg > 180.0:
        angle_deg = 360 - angle_deg
    
    return angle_deg

# Variables for rep counting
squat_stage = "up"
rep_count = 0

# ===== NEW: Variables for feedback =====
feedback_message = ""  # What feedback to show
feedback_color = (255, 255, 255)  # Color of feedback text
last_feedback_time = 0  # When we last showed feedback
feedback_cooldown = 2.0  # Wait 2 seconds between feedback messages

# Open webcam
cap = cv2.VideoCapture(0)

print("Squat Counter with Feedback Started!")
print("Stand up straight to begin")
print("Try to squat below 90° for best results!")
print("Press 'q' to quit")

while cap.isOpened():
    success, frame = cap.read()
    
    if not success:
        print("Failed to read from webcam")
        break
    
    h, w, _ = frame.shape
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(rgb_frame)
    
    if results.pose_landmarks:
        mp_drawing.draw_landmarks(
            frame,
            results.pose_landmarks,
            mp_pose.POSE_CONNECTIONS,
            mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
            mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=2)
        )
        
        landmarks = results.pose_landmarks.landmark
        
        left_hip = landmarks[mp_pose.PoseLandmark.LEFT_HIP.value]
        left_knee = landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value]
        left_ankle = landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value]
        
        knee_angle = calculate_angle(left_hip, left_knee, left_ankle)
        
        # Get current time for feedback cooldown
        current_time = time.time()
        
        # Rep Counting Logic (same as before)
        if knee_angle > 160:
            squat_stage = "up"
        
        if knee_angle < 100 and squat_stage == "up":
            squat_stage = "down"
            rep_count += 1
            print(f"Rep {rep_count} completed!")
            
            # ===== NEW: Give feedback based on depth =====
            
            # Check if enough time has passed since last feedback
            if current_time - last_feedback_time > feedback_cooldown:
                
                # Excellent depth (below 90°)
                if knee_angle < 90:
                    feedback_message = "Perfect depth! 💪"
                    feedback_color = (0, 255, 0)  # Green
                    print("  └─ Perfect depth!")
                
                # Good depth (90-100°)
                elif knee_angle < 100:
                    feedback_message = "Good depth! ✓"
                    feedback_color = (0, 255, 255)  # Yellow
                    print("  └─ Good depth!")
                
                # Update last feedback time
                last_feedback_time = current_time
        
        # ===== NEW: Form feedback during squat =====
        
        # If you're in the down position but not deep enough
        if squat_stage == "down" and knee_angle > 110:
            # Only show if cooldown passed
            if current_time - last_feedback_time > feedback_cooldown:
                feedback_message = "Go deeper! ⚠"
                feedback_color = (0, 165, 255)  # Orange
                last_feedback_time = current_time
        
        # Display angle
        knee_pixel = (int(left_knee.x * w), int(left_knee.y * h))
        cv2.putText(frame, f'{int(knee_angle)}°',
                    (knee_pixel[0] - 30, knee_pixel[1] - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # Display rep count
        cv2.putText(frame, f'REPS: {rep_count}',
                    (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 0), 4)
        
        # Display stage
        stage_color = (0, 255, 255) if squat_stage == "down" else (255, 255, 255)
        cv2.putText(frame, f'Stage: {squat_stage.upper()}',
                    (10, 140), cv2.FONT_HERSHEY_SIMPLEX, 1, stage_color, 2)
        
        # ===== NEW: Display feedback message =====
        if feedback_message:
            cv2.putText(frame, feedback_message,
                       (10, 200), cv2.FONT_HERSHEY_SIMPLEX, 1.2, feedback_color, 3)
        
        # Display instructions
        cv2.putText(frame, 'Squat below 90° for perfect depth',
                    (10, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
    
    cv2.imshow('Squat Counter with Feedback', frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
pose.close()

print(f"\nWorkout complete! You did {rep_count} squats!")