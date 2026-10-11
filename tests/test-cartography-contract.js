'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),styles=fs.readFileSync(path.join(root,'styles.css'),'utf8'),sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),mapRuntime=fs.readFileSync(path.join(root,'map-runtime.js'),'utf8'),nav=require('../navigation-intents');
assert.match(html,/vendor\/leaflet\/leaflet\.css/u);assert.match(html,/vendor\/rotamoto-map-runtime\.js\?v=0139\.1/u);
assert.match(app,/L\.polyline\(coords,/u,'planned route overlay consumes provider-supplied road geometry');
assert.doesNotMatch(styles,/\.app\{[^}]*overflow-x:\s*clip/u,'app shell does not hide horizontal layout overflow');
assert.match(app,/canonicalRouteSnapshots/u,'geometry is requested only for synchronized canonical route snapshots');
assert.match(app,/routePreviewGeneration/u,'late route geometry responses cannot contaminate a newer preview');
assert.match(app,/const canonicalRoadGeometryCache=new Map\(\)/u,'same Route revision reuses one authenticated geometry request');
assert.match(app,/canonicalRoadGeometryCache\.get\(key\)/u,'route geometry cache key is canonical Route id plus revision');
assert.doesNotMatch(app,/L\.polyline\(bounds,/u,'straight lines between delivery markers are never shown as roads');
assert.match(html,/id="routeMapStatus"/u,'map reports when road geometry is unavailable');
assert.match(mapRuntime,/https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/u);assert.match(mapRuntime,/OpenStreetMap[\s\S]*contributors/u);assert.match(mapRuntime,/dark:\s*['"]https:\/\/tiles\.openfreemap\.org\/styles\/dark/u);assert.match(mapRuntime,/setStyle/u);assert.doesNotMatch(app,/router\.project-osrm\.org|routing\.openstreetmap\.de/u,'client must not call public routing');
assert.match(html,/id="googleNav"/u,'Google Maps navigation remains available');assert.match(html,/id="wazeNav"/u,'Waze navigation remains available');assert.match(html,/id="osmandNav"/u,'OsmAnd remains an additional navigation option');assert.doesNotMatch(html,/id="wazeLimit"/u,'fixed adapter behavior is not exposed as an editable Waze setting');assert.match(app,/delete x\.wazeLimit/u,'legacy Waze limit is discarded during settings normalization');assert.match(app,/navigationProvider/u);assert.match(app,/googleDirectionsUrl\(\[currentCoords\]\)/u,'external address validation sends confirmed coordinates only');assert.doesNotMatch(app,/maps\/search\/\?api=1&query=/u,'raw customer address must not enter navigation URL');
assert.match(html,/name="referrer" content="strict-origin-when-cross-origin"/u);assert.match(sw,/vendor\/rotamoto-map-runtime\.js\?v=0139\.1/u,'map renderer is available from the offline shell');assert.match(sw,/maplibre-gl-worker\.mjs\?v=0139\.1/u,'local vector worker is available from the offline shell');
assert.doesNotMatch(sw,/tile\.openstreetmap\.org/u,'third-party tiles are not copied or cached');
for(const point of [{lat:-23.5,lng:-46.6},{lat:0,lng:180}]){const url=new URL(nav.googleDirectionsUrl([point]));assert.equal(url.searchParams.has('destination'),true);assert.doesNotMatch(url.href,/phone|name|address|observations/u)}
console.log('Cartography/privacy/navigation contract: PASS');
