// Progressive Web App plumbing: service worker registration, the install
// button, and the "ready offline" indicator.

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Relative path so it also works under a GitHub Pages sub-path (/<repo>/).
  navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker failed', error));
}

/**
 * Resolve once the service worker controls this page (or after a timeout).
 * Loading the pose model *after* this means the model's network requests pass
 * through the service worker and get cached, so the very first visit already
 * makes the app work offline (no second download needed).
 */
export function waitForServiceWorker(timeoutMs = 4000) {
  if (!('serviceWorker' in navigator) || navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    setTimeout(resolve, timeoutMs);
  });
}

/** True once the large model file is in the cache, i.e. the app can start offline. */
export async function isOfflineReady(modelUrl) {
  if (!('caches' in window)) return false;
  return Boolean(await caches.match(modelUrl));
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

/**
 * Android/desktop Chrome fire `beforeinstallprompt`; we keep the event and show
 * our own "Install app" button. iOS has no such event, so we show a hint instead.
 */
export function setupInstall(button, iosHint) {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    button.hidden = true;
  });
  window.addEventListener('appinstalled', () => (button.hidden = true));

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIos && !isStandalone()) iosHint.hidden = false;
}
