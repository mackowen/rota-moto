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
const gpsQuality = fs.readFileSync(path.join(root, 'location-quality.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

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
assert.match(css, /grid-template-areas:\s*"intro intro"\s*"map availability"\s*"map presence"/u,
  'desktop map and operational cards occupy explicit non-overlapping dashboard areas');
assert.match(css, /#home \.availability-panel\.presence-panel\s*\{\s*grid-area:\s*presence;/u,
  'desktop presence card occupies its own grid area beside the map');
assert.match(css, /\.availability-panel\.presence-panel \.presence-actions\s*\{\s*width:\s*100%;\s*\}/u,
  'presence controls use the full panel width and preserve their existing wrapping behavior');
assert.match(html, /class="home-quick-actions"[\s\S]*id="scanDeliveryQrBtn"[\s\S]*id="newRaceBtn"[\s\S]*id="mapWorkBtn"/u,
  'QR, comanda and existing work-mode entry points remain reachable from Home with an active delivery');
assert.match(html, /id="mapScreen"[\s\S]*class="back" data-back="routesScreen" aria-label="Voltar para Rotas"/u,
  'the route map returns to the populated Routes screen instead of an empty delivery detail screen');
assert.match(app, /function setRouteMapFullscreen\(expanded\)[\s\S]*aria-expanded[\s\S]*invalidateSize\(\{pan:false\}\)/u,
  'map expansion exposes its exit state and invalidates the renderer after resizing');
assert.match(app, /event\.key==='Escape'&&routeFullscreen/u,
  'Escape exits the expanded map without changing route state');
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
assert.match(css, /#mapScreen \.mapWrap\.fullscreen\s*\{\s*position:\s*fixed;\s*inset:\s*0;\s*z-index:\s*5000;\s*width:\s*auto;\s*height:\s*auto;\s*min-height:\s*0;\s*margin:\s*0/u,
  'fullscreen map overrides the more specific normal map frame and occupies the viewport');
assert.match(css, /#mapScreen \.mapWrap\.fullscreen #map\s*\{\s*height:\s*100%;\s*\}/u,
  'Leaflet canvas follows the expanded map height');
assert.match(baseCss, /\.mapWrap #map\{height:100%;min-height:0\}/u,
  'the Leaflet canvas fills its visual surface instead of extending below the clipped map frame');
assert.match(baseCss, /filterTabs button:not\(\.active\)[^}]*background:var\(--card\)/u,
  'dark surface rules do not replace the active filter treatment');
assert.match(css, /html\[data-resolved-theme="dark"\] \.filterTabs button\.active[^}]*color: #082713/u,
  'active Entregas filters retain a dark foreground on the bright green selected surface');
assert.match(css, /env\(safe-area-inset-bottom\)/u,
  'mobile content and navigation continue to account for the device safe area');
assert.match(css, /button:focus-visible,[\s\S]*outline: 3px/u,
  'interactive controls retain a visible keyboard focus state');
assert.match(css, /data-resolved-theme="dark"[^\n]*button\.active[^\n]*color: #082713/u,
  'selected green controls use dark foreground text in dark theme for readable contrast');
assert.doesNotMatch(css, /!important/u,
  'the pilot presentation does not add important overrides');

assert.match(html, /location-quality\.js\?v=0140\.9/u, 'GPS quality metadata is loaded before the application');
assert.match(serviceWorker, /location-quality\.js\?v=0140\.9/u, 'GPS quality helper is included in the offline shell');
assert.match(gpsQuality, /capturedAt < Number\(previousTimestamp \|\| 0\)/u, 'a late GPS response cannot replace a newer device reading');
assert.match(app, /RotaMotoGpsQuality\.accept\(lat,lng,accuracy,timestamp,lastGps\?\.timestamp\)/u, 'GPS coordinates use the device capture timestamp and reject stale callbacks');
assert.match(app, /maximumAge:0,timeout:15000/u, 'one-shot GPS requests require a fresh reading');
assert.match(app, /maximumAge:0,timeout:20000/u, 'continuous GPS tracking requests fresh readings with a bounded timeout');
assert.match(app, /function updateGpsAccuracyCircle\(/u, 'reported GPS accuracy is shown as a geographic uncertainty circle');
assert.match(app, /scheduleRoutePreviewLayout\(\)[\s\S]*requestAnimationFrame\([\s\S]*requestAnimationFrame\([\s\S]*invalidateSize\(\{pan:false\}\)/u,
  'the Rotas map waits for stable visible dimensions before Leaflet calculates its tile viewport');
assert.match(app, /function initRoutePreviewMap\(\)[\s\S]*setView\(center,known\?12:4\)/u,
  'the map uses a known device or delivery point, otherwise a labeled regional overview');
assert.match(app, /function initRoutePreviewMap\(\)[\s\S]*row\.lat!=null&&row\.lng!=null&&Number\.isFinite/u,
  'missing coordinates cannot be coerced to a fabricated 0,0 map center');
assert.doesNotMatch(app.match(/function fitRoutePreviewOverview\(\)[\s\S]*?\n\}/u)?.[0]||'', /-23\.5505|-46\.6333/u,
  'Visão geral does not invent a São Paulo device position when there are no known points');
const routePreview = app.match(/function renderRoutePreview\(rs\)[\s\S]*?\n\}/u)?.[0] || '';
assert.match(routePreview, /const deliveryBounds=\[\]/u, 'automatic route framing uses a separate collection of real delivery points');
assert.match(routePreview, /deliveryBounds\.push\(point\)/u, 'real delivery coordinates remain eligible for automatic framing');
assert.doesNotMatch(routePreview, /deliveryBounds\.push\(\[lastGps\.lat,lastGps\.lng\]\)/u, 'a GPS-only fix cannot force a late zoom that temporarily blanks the cartography');
const canonicalGeometry = app.split('\n').find(line => line.startsWith('async function loadCanonicalRoadGeometry(rows)')) || '';
assert.doesNotMatch(canonicalGeometry, /if\(lastGps\)bounds\.push/u, 'late road geometry cannot reframe a route map around the device alone');
assert.match(app, /function fitRoutePreviewOverview\(\)[\s\S]*?if\(lastGps\)points\.push/u, 'the explicit Overview action can still include the actual current device position');

console.log('Mobile operational hierarchy and regression guards: OK');
