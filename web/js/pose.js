// Loads Google's MediaPipe PoseLandmarker and runs it on video frames.
// Everything runs in the browser: a WebAssembly runtime plus a ~6 MB model.
// The service worker (sw.js) caches these files so the app works offline.

export const TASKS_VISION_VERSION = '1.1.0'; // pinned so cached files never go stale
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}`;

export const MEDIAPIPE_URLS = {
  bundle: `${CDN}/vision_bundle.mjs`,
  wasm: `${CDN}/wasm`,
  // "lite" is the fastest of the three pose models; it is accurate enough for
  // joint angles and keeps phones at a smooth frame rate.
  model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

/**
 * Create a detector. Tries the GPU first (much faster) and falls back to the CPU
 * on devices where WebGL is unavailable.
 * @returns {{ delegate: string, detect(video, timestampMs): object[]|null, close(): void }}
 */
export async function createPoseDetector() {
  // Imported lazily so the rest of the app works even if the model can't load.
  const { FilesetResolver, PoseLandmarker } = await import(MEDIAPIPE_URLS.bundle);
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_URLS.wasm);

  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MEDIAPIPE_URLS.model, delegate },
    runningMode: 'VIDEO', // reuses tracking between frames: faster and steadier than per-image detection
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  let landmarker;
  let delegate = 'GPU';
  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, options('GPU'));
  } catch (error) {
    console.warn('GPU delegate unavailable, using CPU', error);
    delegate = 'CPU';
    landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
  }

  let lastTimestamp = -1;
  return {
    delegate,
    /** Landmarks for the first person in the frame, or null if nobody is visible. */
    detect(video, timestampMs) {
      // VIDEO mode requires strictly increasing timestamps.
      const timestamp = Math.max(Math.round(timestampMs), lastTimestamp + 1);
      lastTimestamp = timestamp;
      const result = landmarker.detectForVideo(video, timestamp);
      return result.landmarks[0] ?? null;
    },
    close() {
      landmarker.close();
    },
  };
}
