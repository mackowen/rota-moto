'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function setup(failPath) {
  const listeners = new Map();
  const stores = new Map();
  const origin = 'https://motoboy.test';
  const cacheApi = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return { async put(request, response) { entries.set(request.url, response); }, async match(request) { return entries.get(request.url); } };
    },
    async delete(name) { return stores.delete(name); },
    async keys() { return [...stores.keys()]; }
  };
  const context = {
    URL, Request, Response, Promise, Set, Object, Error, console, caches: cacheApi,
    self: { location: { origin, href: `${origin}/service-worker.js` }, registration: { scope: `${origin}/` }, async skipWaiting() {}, clients: { async claim() {} }, addEventListener(name, listener) { listeners.set(name, listener); } },
    async fetch(request) {
      const url = new URL(request.url);
      if (failPath === url.pathname) return new Response('missing', { status: 503 });
      return new Response(`asset:${url.pathname}${url.search}`, { status: 200 });
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../service-worker.js'), 'utf8'), context, { filename: 'service-worker.js' });
  return { listeners, stores, origin };
}

async function run(listener, event = {}) {
  let pending;
  listener({ ...event, waitUntil(promise) { pending = promise; } });
  if (pending) await pending;
}

(async () => {
  const healthy = await setup('/vendor/maplibre/maplibre-gl-worker.js');
  await run(healthy.listeners.get('install'));
  const [cacheName] = [...healthy.stores.keys()];
  assert.match(cacheName, /v43\.29$/u);
  assert.equal([...healthy.stores.get(cacheName).keys()].some(url => url.includes('maplibre-gl-worker.js')), false,
    'optional worker outage does not prevent an offline shell update');

  const failed = await setup('/app.js');
  failed.stores.set('rota-moto-v43.25', new Map([['old-shell', new Response('preserved')]]));
  await assert.rejects(run(failed.listeners.get('install')), /required shell assets unavailable/u);
  assert.deepEqual([...failed.stores.keys()], ['rota-moto-v43.25'], 'failed install preserves the active version and discards only staging');

  const missingMapRuntime = await setup('/vendor/maplibre/rotamoto-map-runtime.js');
  missingMapRuntime.stores.set('rota-moto-v43.26', new Map([['old-shell', new Response('preserved')]]));
  await assert.rejects(run(missingMapRuntime.listeners.get('install')), /required shell assets unavailable/u);
  assert.deepEqual([...missingMapRuntime.stores.keys()], ['rota-moto-v43.26'], 'map runtime is required for usable map error handling and recovery');

  let intercepted = false;
  const unlisted = { request: new Request(`${healthy.origin}/styles.css?v=43.999`), respondWith() { intercepted = true; } };
  await run(healthy.listeners.get('fetch'), unlisted);
  assert.equal(intercepted, false, 'unlisted versions bypass the shell cache');
  const exact = { request: new Request(`${healthy.origin}/styles.css?v=43.11`), response: null, respondWith(promise) { exact.response = promise; } };
  await run(healthy.listeners.get('fetch'), exact);
  assert.equal(await (await exact.response).text(), 'asset:/styles.css?v=43.11');
  const api = { request: new Request(`${healthy.origin}/api/sync/push`), respondWith() { throw new Error('API must bypass shell cache'); } };
  await run(healthy.listeners.get('fetch'), api);
  console.log('Motoboy service worker atomic installation and exact URL matching: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
