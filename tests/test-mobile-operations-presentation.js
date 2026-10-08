'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'pilot-views.css'), 'utf8');
const baseCss = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const workflow = fs.readFileSync(path.join(root, 'execution-workflow.js'), 'utf8');

assert.match(html, /id="syncStatus"[^>]+role="status" aria-live="polite"/u,
  'connection state remains announced to assistive technology');
assert.match(app, /box\.setAttribute\('aria-label',details\)/u,
  'the compact header label retains the full synchronization detail accessibly');
assert.match(app, /box\.textContent=attention\?'Revisar sincronização':!online\?'Offline'/u,
  'sync failures and offline state remain visible in the compact header');

assert.match(html, /class="filterTabs" role="group" aria-label="Status principais/u,
  'primary delivery filters stay immediately available');
assert.match(html, /<details class="advancedRaceFilters" id="advancedRaceFilters"[\s\S]*data-filter="issue"[\s\S]*data-filter="done"[\s\S]*data-filter="cancelled"[\s\S]*data-history="30"/u,
  'advanced statuses and every history period remain in an accessible disclosure');
assert.match(app, /\.filterTabs button'\)\.forEach\(b=>b\.onclick=\(\)=>\{currentFilter=b\.dataset\.filter/u,
  'visible and disclosed status controls use the existing filter state');
assert.match(app, /closest\('button,summary,a,input,select,textarea'\)/u,
  'opening a race action disclosure does not trigger the card detail click target');

assert.match(app, /function deliveryDetailActions\(r,status,allowed\)[\s\S]*allowed\.slice\(1\)[\s\S]*<details class="deliverySecondaryActions"/u,
  'delivery detail gives the first canonical action priority and keeps alternatives available');
assert.match(app, /status==='ARRIVED'\?'No destino'/u,
  'arrival gets a distinct destination state label');
assert.match(app, /status==='ARRIVED'\?'<div class="arrivalContext"/u,
  'arrival explains the valid next step without adding a transition');
assert.match(workflow, /ARRIVED:[\s\S]*deliver[\s\S]*fail[\s\S]*return/u,
  'the presentation continues to derive arrival options from the canonical workflow');

assert.match(html, /class="earnQuickFacts"[\s\S]*id="earnTrips"[\s\S]*id="earnPeriodLabel"/u,
  'the earnings total is followed by a quick delivery count and selected period');
assert.match(html, /class="earnUnavailable"[\s\S]*id="earnPerKm"[\s\S]*id="earnCost"[\s\S]*id="earnProfit"/u,
  'unavailable financial indicators remain explicit and grouped');
assert.match(app, /earnedTrips=new Set\(earned\.map\(row=>row\.deliveryId\)\.filter\(Boolean\)\)/u,
  'delivery count uses only canonical earnings linked to delivery IDs');
assert.match(app, /value===0\?' is-zero':''/u,
  'zero-valued chart data is represented without a fabricated bar');
assert.match(baseCss, /\.bar\.is-zero\{min-height:0;visibility:hidden\}/u,
  'zero-value bars cannot inherit the legacy minimum chart height');
assert.match(app, /formatCanonicalTotals\(totals\)/u,
  'the displayed total continues to use canonical currency totals');

assert.match(app, /id="nextPreferredMap"[\s\S]*mapProviderOptions[\s\S]*Google Maps[\s\S]*Waze[\s\S]*OsmAnd/u,
  'map keeps the configured external navigation action and all provider choices');
assert.match(app, /map\?\.invalidateSize\(\{pan:false\}\);fitWorkMapOverview\(\)/u,
  'the route map refits real markers after its container dimensions settle');
assert.match(baseCss, /\.mapWrap #map\{height:100%;min-height:0\}/u,
  'the Leaflet canvas fills its visual surface instead of extending below the clipped map frame');
assert.match(baseCss, /filterTabs button:not\(\.active\)[^}]*background:var\(--card\)/u,
  'dark surface rules do not replace the active filter treatment');
assert.match(css, /env\(safe-area-inset-bottom\)/u,
  'mobile content and navigation continue to account for the device safe area');
assert.match(css, /button:focus-visible,[\s\S]*outline: 3px/u,
  'interactive controls retain a visible keyboard focus state');
assert.match(css, /data-resolved-theme="dark"[^\n]*button\.active[^\n]*color: #082713/u,
  'selected green controls use dark foreground text in dark theme for readable contrast');
assert.doesNotMatch(css, /!important/u,
  'the pilot presentation does not add important overrides');

console.log('Mobile operational hierarchy and regression guards: OK');
