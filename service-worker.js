'use strict';

const CACHE_PREFIX = 'rota-moto-';
const CACHE = `${CACHE_PREFIX}v43.43`;
const ASSETS = Object.freeze(['./','./index.html','./favicon.svg?v=0140.1','./styles.css?v=43.16','./navigation-intents.js?v=1','./navigation-workflow.js?v=1','./contract.js?v=1','./backup-format.js?v=1','./sync-reconciliation.js?v=2','./execution-workflow.js?v=2','./indexeddb-schema.js?v=2','./delivery-qr.js?v=1','./delivery-confirmation.js?v=1','./qr-decoder.js?v=1','./ocr/normalization.js?v=1','./ocr/semantic-parser.js?v=1','./ocr/image-preprocessor.js?v=1','./ocr/pipeline.js?v=1','./vendor/tesseract/tesseract.min.js?v=5.1.1','./vendor/tesseract/worker/worker.min.js','./vendor/tesseract/core/tesseract-core-lstm.wasm.js','./vendor/tesseract/lang/4.0.0_best_int/por.traineddata.gz','./location-quality.js?v=0140.9','./app.js?v=0140.10','./identity-ui.css','./design-system.css?v=0110.4','./pilot-views.css?v=0140.6','./identity-session-guard.js','./identity-ui.js?v=0140.1','./vendor/leaflet/leaflet.css','./vendor/maplibre/maplibre-gl.css?v=0139.1','./vendor/maplibre/rotamoto-map-runtime.js?v=0140.9','./vendor/maplibre/maplibre-gl-worker.js?v=0139.1','./vendor/leaflet/leaflet.js','./manifest.json','./favicon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png']);
const OPTIONAL_ASSETS = new Set(['./vendor/maplibre/maplibre-gl.css?v=0139.1','./vendor/maplibre/maplibre-gl-worker.js?v=0139.1','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png','./vendor/tesseract/worker/worker.min.js','./vendor/tesseract/core/tesseract-core-lstm.wasm.js','./vendor/tesseract/lang/4.0.0_best_int/por.traineddata.gz']);
const assetURLs = new Set(ASSETS.map(asset => new URL(asset, self.registration.scope).href));
const optionalURLs = new Set([...OPTIONAL_ASSETS].map(asset => new URL(asset, self.registration.scope).href));

async function stageShell() {
  await caches.delete(CACHE);
  const cache = await caches.open(CACHE);
  try {
    const results = await Promise.all(ASSETS.map(async asset => {
      const request = new Request(new URL(asset, self.registration.scope), { cache: 'reload' });
      const response = await fetch(request);
      if (!response.ok || response.type === 'opaque' || (response.redirected && new URL(response.url).origin !== self.location.origin)) throw new Error(`shell asset unavailable (${response.status})`);
      return { request, response };
    }).map(promise => promise.catch(error => ({ error }))));
    const failures = results.filter((result, index) => result.error && !optionalURLs.has(new URL(ASSETS[index], self.registration.scope).href));
    if (failures.length) throw new Error(`required shell assets unavailable (${failures.length})`);
    await Promise.all(results.filter(result => !result.error).map(({ request, response }) => cache.put(request, response)));
    results.forEach((result, index) => {
      if (result.error && optionalURLs.has(new URL(ASSETS[index], self.registration.scope).href)) {
        console.warn('Optional offline asset unavailable:', new URL(ASSETS[index], self.registration.scope).pathname);
      }
    });
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  }
}

self.addEventListener('install', event => event.waitUntil((async () => {
  await stageShell();
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.cache === 'no-store') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || /^\/api(?:\/|$)/u.test(url.pathname) || !assetURLs.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    return await fetch(request);
  })().catch(() => new Response('', { status: 503, statusText: 'Offline asset unavailable', headers: { 'Cache-Control': 'no-store' } })));
});
