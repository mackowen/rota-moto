'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const root = require('node:path').resolve(__dirname, '..');
const app = fs.readFileSync(`${root}/app.js`, 'utf8');
const html = fs.readFileSync(`${root}/index.html`, 'utf8');
const worker = fs.readFileSync(`${root}/service-worker.js`, 'utf8');
const show = app.slice(app.indexOf('function show(id)'), app.indexOf("document.addEventListener('click'"));
const visit = app.slice(app.indexOf('function beginHomeMapVisit()'), app.indexOf('function updateHomeGpsMarker()'));
const refresh = app.slice(app.indexOf('function refreshHomeMap()'), app.indexOf('function renderHome()'));
const locator = app.slice(app.indexOf("$('#homeMapLocate').onclick"), app.indexOf("$('#availabilityToggle').onclick"));

assert.match(show, /previousScreen=\$\('\.screen\.active'\)\?\.id/u,
  'screen transition must identify a new Home visit');
assert.match(show, /id==='home'&&previousScreen!=='home'\)beginHomeMapVisit\(\)/u,
  'returning to Home starts a fresh one-shot centering opportunity');
assert.match(visit, /homeAutoCenterPending=true/u, 'each Home visit enables one initial GPS center');
assert.match(visit, /homeMapUserMoved=false/u, 'manual exploration state resets only on a new visit');
assert.match(visit, /instance\.setView\(position,Math\.max\(15,instance\.getZoom\(\)\),\{animate:false\}\)/u,
  'initial automatic centering uses the validated current GPS coordinate');
assert.match(visit, /homeAutoCenterPending=false/u, 'automatic center is consumed once per visit');
assert.match(visit, /visit!==homeVisitSequence/u, 'callbacks from a prior visit are ignored');
assert.match(refresh, /homeMap\.on\('movestart zoomstart',event=>\{if\(event\.originalEvent\)/u,
  'only user-originated movement cancels pending automatic centering');
assert.match(refresh, /if\(lastGps\)\{centerHomeMapOnGpsOnce\(\)\}/u,
  'new GPS readings trigger the pending center when available');
assert.match(app, /\['pointerdown','touchstart','mousedown'\]\.forEach\(type=>el\.addEventListener\(type,markHomeMapExplored/u,
  'real touch and pointer interaction cancels an unconsumed automatic center');
assert.match(refresh, /homeMap\.fitBounds\(L\.latLngBounds\(points\)/u,
  'route overview remains separate when no valid GPS fix is available');
assert.doesNotMatch(refresh, /dataset\.userMoved/u,
  'a stale map dataset cannot block centering on a later Home visit');
assert.match(locator, /homeAutoCenterPending=false/u,
  'manual locate remains an explicit recenter operation');
assert.match(locator, /homeMap\?\.setView\(\[position\.coords\.latitude,position\.coords\.longitude\],16/u,
  'manual locate keeps its existing user-visible behavior');
assert.match(html, /app\.js\?v=0140\.10/u, 'HTML references the updated application asset');
assert.match(worker, /v43\.45/u, 'service worker cache version is advanced');
assert.match(worker, /app\.js\?v=0140\.10/u, 'offline shell references the same application asset');

console.log('Home GPS one-shot automatic centering contract: PASS');
