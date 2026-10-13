'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'pilot-views.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const locationScreen = html.match(/<section id="mapScreen"[\s\S]*?<\/section>/u)?.[0] || '';
assert.ok(locationScreen, 'the Location screen exists');
assert.match(locationScreen, /<div id="mapActionControls" class="mapActionControls" role="group" aria-label="Controles do mapa">[\s\S]*?<button id="fullscreenMap"[\s\S]*?<button id="workOverview"[\s\S]*?<\/div><div id="map">/u,
  'the Location screen has a single grouped control region, separate from Leaflet');
assert.doesNotMatch(locationScreen, /id="routeOverview"/u,
  'the planning-map overview is not mixed into the Location map controls');
assert.match(html, /<div class="mapStage"><div id="routePreviewMap"><\/div><button id="routeOverview"/u,
  'the separate planning-map overview remains in the Rotas screen');
assert.match(styles, /#mapScreen \.mapActionControls\s*\{[^}]*position:\s*absolute[^}]*top:\s*12px[^}]*right:\s*12px[^}]*display:\s*grid[^}]*gap:\s*8px/u);
assert.match(styles, /#mapScreen \.mapActionControls\s*>\s*\.mapFloat\s*\{[^}]*position:\s*relative[^}]*inset:\s*auto/u,
  'map buttons use normal flow inside their control group, not colliding absolute offsets');
assert.match(app, /\$\('#fullscreenMap'\)\.onclick=\(\)=>setRouteMapFullscreen\(!routeFullscreen\)/u,
  'the fullscreen control keeps its original toggle behavior');
assert.match(app, /\$\('#workOverview'\)\.onclick=\(\)=>\{closeMapPopups\(\);workOverviewUsed=true;fitWorkMapOverview\(\)/u,
  'the Location overview keeps its original map framing action');
assert.match(app, /\$\('#routeOverview'\)\.onclick=\(\)=>\{closeMapPopups\(\);fitRoutePreviewOverview\(\)/u,
  'the overview control in the Rotas planning map remains independently wired');

console.log('Motoboy Location map controls have independent layout and actions: PASS');
