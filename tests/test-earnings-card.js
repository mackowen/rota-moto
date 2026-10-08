'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

assert.match(html, /id="earningsSyncNote" class="earningsSyncNote" role="status" hidden[\s\S]*?<section id="homeDeliveryFocus" class="driver-focus"/u,
  'the synchronization message remains separate from the operational delivery focus');
assert.match(html, /id="homeDeliveryFocus" class="driver-focus" aria-live="polite" hidden/u,
  'the home has a live region for the next canonical delivery action');
assert.match(html, /id="homeNoActive" class="driver-start"/u,
  'the no-active-delivery state retains the real QR and local race entry points');
assert.match(app, /todayValue'\)\.textContent=earnedTotals\.size\?formatCanonicalTotals\(earnedTotals\):'—'/u,
  'an absent canonical snapshot uses a compact neutral value');
assert.match(app, /earningsNote\.hidden=earnedTotals\.size>0\|\|completedToday\.length===0/u,
  'the explanatory status appears only while canonical earnings are absent');
assert.match(app, /monthValue'\)\.textContent=monthTotals\.size\?formatCanonicalTotals\(monthTotals\):'—'/u,
  'the monthly metric also remains a compact value when no snapshot exists');
assert.match(styles, /\.earningsSyncNote\{[^}]*overflow-wrap:anywhere/u,
  'the separate explanatory status can wrap without widening the layout');
assert.match(html, /<div id="customPeriod" class="customPeriod" hidden>/u,
  'custom earnings dates remain hidden until the custom period is selected');
assert.match(styles, /\.customPeriod\{display:none;[^}]*\}\.customPeriod:not\(\[hidden\]\)\{display:grid\}/u,
  'date controls respect their HTML visibility state instead of overriding hidden');
assert.match(app, /totals\.size\?formatCanonicalTotals\(totals\):completed\.length\?'Aguardando sincronização do Restaurante':'Nenhum ganho confirmado no período'/u,
  'an empty period is distinguished from completed deliveries still awaiting canonical earnings');
assert.match(app, /earningsNote\.hidden=earnedTotals\.size>0\|\|completedToday\.length===0/u,
  'the home synchronization notice is hidden when no delivery completed today');
assert.match(app, /gpsDistances=completed\.map\(gpsKmForRace\)\.filter\(value=>value>0\),km=gpsDistances\.reduce/u,
  'real distance uses observed GPS movement only');
assert.match(app, /earnKm'\)\.textContent=gpsDistances\.length\?km\.toFixed\(1\)\.replace\('\.',','\):'—'/u,
  'missing GPS coverage is represented as unknown, not a measured zero');
assert.match(html, /<div id="earnChart"><\/div>/u,
  'daily earnings data has a full-width container separate from the bar-chart scroller');
assert.match(app, /data-earnings-currency=/u,
  'daily earning series are charted by canonical currency without combining currencies');
assert.doesNotMatch(app, /class="earnDay"/u,
  'daily earnings no longer use compressed text rows as a chart');
assert.doesNotMatch(styles, /\.earnDay\{/u,
  'obsolete narrow daily earnings row styling is removed');
console.log('narrow earnings card regression: OK');
