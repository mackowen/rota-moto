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
assert.match(html, /id="availabilityState"[\s\S]*id="availabilityHelp"[\s\S]*id="availabilityToggle"/u,
  'operational availability is a distinct, accessible control with an explicit server-confirmation state');
assert.match(html, /class="availability-panel presence-panel"[\s\S]*id="restaurantPresenceState"[\s\S]*id="restaurantPresenceHelp"[\s\S]*class="presence-actions"[\s\S]*id="restaurantCheckIn"[\s\S]*id="restaurantCheckOut"[\s\S]*id="restaurantPresenceQr"/u,
  'presence copy and existing check-in, check-out and QR controls remain grouped and available');
assert.match(css, /\.availability-panel\.presence-panel\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);\s*\}/u,
  'presence copy and actions use separate rows so action intrinsic width cannot squeeze the status text');
assert.match(css, /@media\s*\(max-width:\s*600px\)\s*\{\s*\.availability-panel\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);\s*\}/u,
  'availability status uses the full mobile panel width before its disabled or active action');
assert.match(app, /function refreshHomeMap\(\)[\s\S]*homeMap\.getContainer\(\)\.dataset\.userMoved/u,
  'map interaction state is read from the Leaflet container, where the drag/zoom listeners write it');
assert.doesNotMatch(app, /homeMap\.dataset\.userMoved/u,
  'the Leaflet Map object is not mistaken for an HTMLElement during home rendering');
assert.match(css, /#home \.availability-panel\.presence-panel\s*\{\s*grid-column:\s*1\s*\/\s*-1;\s*\}/u,
  'desktop presence panel spans the dashboard columns instead of being placed in a narrow secondary column');
assert.match(css, /\.availability-panel\.presence-panel \.presence-actions\s*\{\s*width:\s*100%;\s*\}/u,
  'presence controls use the full panel width and preserve their existing wrapping behavior');
assert.match(html, /class="home-quick-actions"[\s\S]*id="scanDeliveryQrBtn"[\s\S]*id="newRaceBtn"[\s\S]*id="mapWorkBtn"/u,
  'QR, comanda and existing work-mode entry points remain reachable from Home with an active delivery');
assert.match(html, /id="mapScreen"[\s\S]*class="back" data-back="routesScreen" aria-label="Voltar para Rotas"/u,
  'the route map returns to the populated Routes screen instead of an empty delivery detail screen');
assert.match(html, /id="earnings"[\s\S]*class="back" data-back="home"[^>]*aria-label="Voltar ao início"/u,
  'Earnings has an explicit accessible return path to Home');
assert.match(baseCss, /\.qrScanner \.scanFrame\{[^}]*top:50%;left:50%;right:auto;bottom:auto;width:min\(64%,280px\);height:auto;aspect-ratio:1;transform:translate\(-50%,-50%\)/u,
  'QR reader frame is centered and square without conflicting inset and width constraints');
assert.match(baseCss, /\.captureBadge:not\(\[hidden\]\)\s*\{\s*display:\s*flex\s*\}/u,
  'the captured-photo badge is visible only after the app removes its hidden state');
assert.match(app, /async function submitAvailabilityCommand[\s\S]*expectedRevision[\s\S]*commandId/u,
  'availability updates persist an idempotent server command with revision checking');
assert.match(app, /async function renewDriverAvailability[\s\S]*visibilityState==='visible'/u,
  'availability leases renew only while the authenticated app is visible');
assert.match(app, /async function restoreDriverAvailability\([\s\S]*driverAvailabilityUnconfirmed=!!driverAvailability/u,
  'availability restored from IndexedDB stays explicitly unconfirmed until the server responds');
assert.match(app, /async function refreshDriverAvailability\([\s\S]*catch\(error\)\{driverAvailabilityUnconfirmed=true/u,
  'a failed availability read cannot present the last cached Online state as currently confirmed');
assert.match(baseCss, /--canvas:#F3F5F9[\s\S]*--accent:#079669/u,
  'light surfaces and operational accent use the refreshed semantic palette');
assert.match(baseCss, /--canvas:#0B0D12[\s\S]*--surface:#171B24[\s\S]*--accent:#16C784/u,
  'dark surfaces are graphite and reserve green for actions and positive state');
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
assert.match(app, /r\.isReturn\?\(r\.returnStage==='awaiting-receipt'\?'Mercadoria entregue · aguardando confirmação do Restaurante'/u,
  'return detail distinguishes physical handover from final restaurant confirmation');
assert.match(app, /data-return-action="\$\{step\[0\]\}"/u,
  'return deliveries expose their own start, arrival and handover actions');
assert.match(app, /async function runReturnAction[\s\S]*DELIVERY_RETURN_STARTED[\s\S]*DELIVERY_RETURN_ARRIVED[\s\S]*DELIVERY_RETURN_HANDED_OVER/u,
  'return operational facts use separate event types instead of customer-delivery actions');
assert.match(app, /if\(r\.isReturn\)\{const steps=/u,
  'return deliveries cannot invoke customer-completion actions');
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
