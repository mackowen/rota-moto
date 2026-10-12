'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const pilot = fs.readFileSync('pilot-views.css', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

assert.match(html, /<nav class="bottom-navigation" aria-label="Navegação principal">/u,
  'primary navigation has a dedicated style boundary');
assert.match(pilot, /\.bottom-navigation\[aria-label="Navegação principal"\]\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;[^}]*touch-action:\s*pan-x/u,
  'mobile navigation is a touch-scrollable horizontal strip');
assert.match(pilot, /\.bottom-navigation\[aria-label="Navegação principal"\]\s+button\s*\{[^}]*flex:\s*0 0 78px;[^}]*min-width:\s*78px/u,
  'navigation buttons keep uniform non-shrinking widths');
assert.doesNotMatch(css, /html\[data-(?:resolved-theme|theme)="(?:dark|auto)"\]\s+nav\s*,/u,
  'theme rules no longer style the nested Help topic index as the app navigation');
assert.match(css, /\.helpIndex nav\{position:static;display:grid;[^}]*overflow:visible/u,
  'the Help topic index stays in document flow and is not clipped');
assert.match(css, /#helpTopics\s*>\s*\.helpIndex\s*\{grid-column:1\/-1/u,
  'the topic index spans the Help content width');
assert.match(app, /target\.scrollIntoView\(\{block:'start'\}\);target\.focus\(\{preventScroll:true\}\)/u,
  'topic links navigate to the selected visible article and support keyboard focus');
assert.match(app, /event\.key==='Escape'&&!\$\('#moreNavMenu'\)\?\.hidden/u,
  'Escape closes the More popover');
assert.match(app, /window\.addEventListener\('popstate',\(\)=>\{const menu=\$\('#moreNavMenu'\)/u,
  'browser Back closes the More popover');
assert.match(app, /activeNav&&primaryNav[\s\S]*primaryNav\.scrollLeft=right-primaryNav\.clientWidth/u,
  'the current destination scrolls into view automatically');
assert.match(pilot, /@media \(min-width: 761px\) and \(min-height: 520px\)/u,
  'short landscape viewports retain the mobile shell instead of a compressed desktop grid');
assert.match(pilot, /#home \.home-map \{ height: clamp\(260px, 52dvh, 430px\); \}/u,
  'desktop map height responds to available viewport height');
assert.match(app, /window\.addEventListener\('orientationchange',invalidateVisibleMaps\)/u,
  'map dimensions are recalculated after device rotation');

console.log('Structural navigation, Help index, landscape map layout and rotation contracts: PASS');
