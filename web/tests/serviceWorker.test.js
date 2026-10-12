// Guard tests for the service worker. Forgetting to precache a new file only
// shows up as a broken app in airplane mode, so we check it here instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TASKS_VISION_VERSION, MEDIAPIPE_URLS } from '../js/pose.js';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(WEB, 'sw.js'), 'utf8');

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'tests' ? [] : listFiles(path);
    return [relative(WEB, path)];
  });
}

test('every file the app ships is precached for offline use', () => {
  const shell = [...sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const shipped = listFiles(WEB).filter((f) => f !== 'sw.js'); // the worker itself is cached by the browser
  assert.deepEqual([...shipped].sort(), shell.filter((f) => f !== './').sort());
  assert.ok(shell.includes('./'), 'the start URL must be precached too');
});

test('the model cache name matches the MediaPipe version the app loads', () => {
  assert.match(sw, new RegExp(`spotter-mediapipe-${TASKS_VISION_VERSION.replace(/\./g, '\\.')}'`));
  for (const url of Object.values(MEDIAPIPE_URLS)) {
    const host = new URL(url).hostname;
    assert.ok(sw.includes(`'${host}'`), `${host} must be in MODEL_HOSTS so it is cached`);
  }
});

test('manifest paths are relative so the app works under a GitHub Pages sub-path', () => {
  const manifest = JSON.parse(readFileSync(join(WEB, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) assert.ok(!icon.src.startsWith('/'), `${icon.src} must be relative`);
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});
