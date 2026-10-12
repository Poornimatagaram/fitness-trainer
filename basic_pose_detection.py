import cv2
import mediapipe as mp
import numpy as np

# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

pose = mp_pose.Pose(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Function to calculate angle (same as before)
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

# ===== NEW: Variables for rep counting =====
squat_stage = "up"  # Track if you're standing ("up") or squatting ("down")
rep_count = 0       # Count how many squats you've done

# Open webcam
cap = cv2.VideoCapture(0)

print("Squat Counter Started!")
print("Stand up straight to begin")
print("Press 'q' to quit")

while cap.isOpened():
    success, frame = cap.read()
    
    if not success:
        print("Failed to read from webcam")
        break
    
    # Get frame dimensions
    h, w, _ = frame.shape
    
    # Convert BGR to RGB
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Process the frame
    results = pose.process(rgb_frame)
    
    # If pose is detected
    if results.pose_landmarks:
        # Draw landmarks
        mp_drawing.draw_landmarks(
            frame,
            results.pose_landmarks,
            mp_pose.POSE_CONNECTIONS,
            mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
            mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=2)
        )
        
        # Extract landmarks for LEFT leg
        landmarks = results.pose_landmarks.landmark
        
        left_hip = landmarks[mp_pose.PoseLandmark.LEFT_HIP.value]
        left_knee = landmarks[mp_pose.PoseLandmark.LEFT_KNEE.value]
        left_ankle = landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value]
        
        # Calculate knee angle
        knee_angle = calculate_angle(left_hip, left_knee, left_ankle)
        
        # ===== NEW: Rep Counting Logic =====
        
        # If you're standing up (angle > 160°)
        if knee_angle > 160:
            squat_stage = "up"
        
        # If you're squatting down (angle < 100°) AND you were standing before
        if knee_angle < 100 and squat_stage == "up":
            squat_stage = "down"
            rep_count += 1  # Count one rep!
            print(f"Rep {rep_count} completed!")  # Print to console
        
        # ===== Display Information =====
        
        # Display angle
        knee_pixel = (int(left_knee.x * w), int(left_knee.y * h))
        cv2.putText(frame, f'{int(knee_angle)}°',
                    (knee_pixel[0] - 30, knee_pixel[1] - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # Display rep count (BIG, top-left)
        cv2.putText(frame, f'REPS: {rep_count}',
                    (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 0), 4)
        
        # Display current stage
        stage_color = (0, 255, 255) if squat_stage == "down" else (255, 255, 255)
        cv2.putText(frame, f'Stage: {squat_stage.upper()}',
                    (10, 140), cv2.FONT_HERSHEY_SIMPLEX, 1, stage_color, 2)
        
        # Display instructions
        cv2.putText(frame, 'Squat down below 100° to count',
                    (10, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
    
    # Display the frame
    cv2.imshow('Squat Counter', frame)
    
    # Exit on 'q'
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Cleanup
cap.release()
cv2.destroyAllWindows()
pose.close()

print(f"\nWorkout complete! You did {rep_count} squats!")