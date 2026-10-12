// Camera access with getUserMedia. Browsers only allow this on HTTPS
// (or http://localhost) and only after the user grants permission.

/**
 * Start the camera and show it in `video`.
 * @param facingMode 'user' (front/selfie camera) or 'environment' (rear camera)
 */
export async function startCamera(video, facingMode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('Camera access needs HTTPS. Open the app from an https:// address.'), {
      name: 'InsecureContext',
    });
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode }, // "ideal" falls back gracefully on laptops with one camera
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop()); // turns the camera light off
}

/** Human-friendly message for common getUserMedia errors. */
export function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
      return 'Camera permission was denied. Allow camera access for this site in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No suitable camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is being used by another app. Close it and try again.';
    default:
      return error?.message || 'Could not start the camera.';
  }
}
