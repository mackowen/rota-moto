'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),nav=require('../navigation-intents');
assert.match(html,/vendor\/leaflet\/leaflet\.(?:css|js)/u);
assert.match(app,/L\.polyline\(bounds,/u,'route order is drawn as a renderer-owned overlay');
assert.match(html,/não representa ruas nem ETA/u,'direct segments are not presented as road geometry or ETA');
assert.match(app,/https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/u);assert.match(app,/OpenStreetMap contributors/u);assert.doesNotMatch(app,/router\.project-osrm\.org|routing\.openstreetmap\.de/u,'client must not call public routing');
assert.match(html,/id="googleNav"/u,'Google Maps navigation remains available');assert.match(html,/id="wazeNav"/u,'Waze navigation remains available');assert.match(html,/id="osmandNav"/u,'OsmAnd remains an additional navigation option');assert.doesNotMatch(html,/id="wazeLimit"/u,'fixed adapter behavior is not exposed as an editable Waze setting');assert.match(app,/delete x\.wazeLimit/u,'legacy Waze limit is discarded during settings normalization');assert.match(app,/navigationProvider/u);assert.match(app,/googleDirectionsUrl\(\[currentCoords\]\)/u,'external address validation sends confirmed coordinates only');assert.doesNotMatch(app,/maps\/search\/\?api=1&query=/u,'raw customer address must not enter navigation URL');
assert.match(html,/name="referrer" content="strict-origin-when-cross-origin"/u);assert.match(sw,/vendor\/leaflet\/leaflet\.js/u,'renderer is available from the offline shell');
assert.doesNotMatch(sw,/tile\.openstreetmap\.org/u,'third-party tiles are not copied or cached');
for(const point of [{lat:-23.5,lng:-46.6},{lat:0,lng:180}]){const url=new URL(nav.googleDirectionsUrl([point]));assert.equal(url.searchParams.has('destination'),true);assert.doesNotMatch(url.href,/phone|name|address|observations/u)}
console.log('Cartography/privacy/navigation contract: PASS');
