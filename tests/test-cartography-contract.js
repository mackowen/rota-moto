'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),nav=require('../navigation-intents');
assert.match(app,/https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/u);assert.match(app,/OpenStreetMap contributors/u);assert.doesNotMatch(app,/router\.project-osrm\.org|routing\.openstreetmap\.de/u,'client must not call public routing');
assert.match(app,/navigationProvider/u);assert.match(app,/googleDirectionsUrl\(\[currentCoords\]\)/u,'external address validation sends confirmed coordinates only');assert.doesNotMatch(app,/maps\/search\/\?api=1&query=/u,'raw customer address must not enter navigation URL');
assert.match(html,/name="referrer" content="strict-origin-when-cross-origin"/u);assert.doesNotMatch(sw,/tile\.openstreetmap\.org|leaflet\.js/u,'web maps are not claimed to be offline cached');
for(const point of [{lat:-23.5,lng:-46.6},{lat:0,lng:180}]){const url=new URL(nav.googleDirectionsUrl([point]));assert.equal(url.searchParams.has('destination'),true);assert.doesNotMatch(url.href,/phone|name|address|observations/u)}
console.log('Cartography/privacy/navigation contract: PASS');
