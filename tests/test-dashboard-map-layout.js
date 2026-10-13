'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const views = fs.readFileSync(require.resolve('../pilot-views.css'), 'utf8');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const worker = fs.readFileSync(require.resolve('../service-worker.js'), 'utf8');
const icon = fs.readFileSync(require.resolve('../favicon.svg'), 'utf8');

assert.match(views, /grid-template-areas:\s*"intro intro"\s*"map availability"\s*"map presence"/u);
assert.match(views, /\.home-map-card\s*\{\s*grid-area:\s*map/u);
assert.doesNotMatch(views, /\.home-map-card\s*\{[^}]*grid-row:\s*2\s*\/\s*span\s*4/u);
assert.match(views, /max-height:\s*519px[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/u);
assert.match(views, /min-width:\s*0;\s*max-width:\s*100%;\s*min-height:\s*60px/u);
assert.match(app, /new ResizeObserver\(entries/u);
assert.match(app, /visualViewport\?\.addEventListener\('resize',invalidateVisibleMaps\)/u);
assert.match(app, /responsiveMapObserver\?\.observe\(container\)/u);
assert.match(html, /favicon\.svg\?v=0140\.1/u);
assert.match(html, /pilot-views\.css\?v=0140\.6/u);
assert.match(worker, /CACHE_PREFIX\}v43\.44/u);
assert.match(worker, /\.\/favicon\.svg\?v=0140\.1/u);
assert.match(worker, /\.\/pilot-views\.css\?v=0140\.6/u);
assert.match(icon, /viewBox="0 0 64 64"/u);
assert.match(icon, /M32 11c-7\.7 0-14 6\.3-14 14/u);
assert.match(html, /id="mapActionControls" class="mapActionControls" role="group" aria-label="Controles do mapa"[\s\S]*?id="fullscreenMap"[\s\S]*?id="workOverview"[\s\S]*?<\/div><div id="map">/u);
assert.match(views, /#mapScreen \.mapActionControls\s*\{[^}]*display:\s*grid[^}]*gap:\s*8px/u);
assert.match(views, /#mapScreen \.mapActionControls\s*>\s*\.mapFloat\s*\{[^}]*position:\s*relative[^}]*inset:\s*auto/u);
assert.match(html, /<div class="mapStage"><div id="routePreviewMap"><\/div><button id="routeOverview"/u,
  'the homonymous Route overview action remains in the separate planning map');
assert.match(app, /\$\('#fullscreenMap'\)\.onclick=\(\)=>setRouteMapFullscreen\(!routeFullscreen\)/u);
assert.match(app, /\$\('#workOverview'\)\.onclick=\(\)=>\{closeMapPopups\(\);workOverviewUsed=true;fitWorkMapOverview\(\)/u);
assert.match(app, /\$\('#routeOverview'\)\.onclick=\(\)=>\{closeMapPopups\(\);fitRoutePreviewOverview\(\)/u,
  'the overview action in the planning route remains independently wired');

console.log('Motoboy desktop dashboard map separation and layout refresh: PASS');
console.log('Motoboy Location map controls are grouped and independently actionable: PASS');
