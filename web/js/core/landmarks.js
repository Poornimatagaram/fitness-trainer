// MediaPipe Pose returns 33 landmarks per person, always in the same order.
// These are the indices this app uses. Full map:
// https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

export const LANDMARK_COUNT = 33;

// Joint indices for each side of the body, so exercise configs can say
// "hip, knee, ankle" without caring which side the camera sees best.
export const SIDES = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
};

// Pairs of landmark indices to connect with lines when drawing the skeleton.
// The face is left out on purpose: it adds clutter and is not used for coaching.
export const SKELETON = [
  [11, 12], [11, 23], [12, 24], [23, 24], // torso
  [11, 13], [13, 15], [12, 14], [14, 16], // arms
  [23, 25], [25, 27], [24, 26], [26, 28], // legs
  [27, 29], [29, 31], [27, 31], // left foot
  [28, 30], [30, 32], [28, 32], // right foot
];
