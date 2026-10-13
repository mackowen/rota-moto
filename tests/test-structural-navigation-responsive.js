'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const pilot = fs.readFileSync('pilot-views.css', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const screens = ['home', 'races', 'routesScreen', 'earnings', 'settings', 'helpScreen'];

assert.match(html, /<nav class="bottom-navigation" aria-label="Navegação principal">/u,
  'primary navigation has a dedicated style boundary');
for (const screen of screens) {
  assert.match(html, new RegExp(`<button data-screen="${screen}"`, 'u'),
    `${screen} is a direct navigation item`);
}
assert.doesNotMatch(html + app + css + pilot, /moreNav|moreNavMenu|Mais destinos/u,
  'the grouped More control and popover are removed');
assert.doesNotMatch(app, /\$\('#(?:settingsBtn|helpBtn)'\)/u,
  'navigation no longer binds removed More-menu controls');
assert.match(pilot, /\.bottom-navigation\[aria-label="Navegação principal"\]\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;[^}]*touch-action:\s*pan-x/u,
  'mobile navigation remains horizontally touch-scrollable');
assert.match(pilot, /\.bottom-navigation\[aria-label="Navegação principal"\] button \{ flex: 1 0 78px; min-width: 78px; max-width: none;/u,
  'buttons grow to share available width and retain a uniform scroll width');
assert.match(pilot, /\.bottom-navigation\[aria-label="Navegação principal"\] button\.active\s*\{[^}]*color:\s*var\(--moto-green-dark\)[^}]*background:\s*var\(--moto-green-soft\)/u,
  'the active destination uses the shared theme color tokens');
assert.match(css, /\.helpIndex\[open\]>nav\{position:static;display:grid;[^}]*overflow:visible/u,
  'the Help topic index stays in document flow and is not clipped');
assert.match(css, /#helpTopics\s*>\s*\.helpIndex\s*\{grid-column:1\/-1/u,
  'the topic index spans the Help content width');
assert.match(app, /target\.scrollIntoView\(\{block:'start'\}\);target\.focus\(\{preventScroll:true\}\)/u,
  'Help topic links reach the selected article and support keyboard focus');
assert.match(app, /activeNav&&primaryNav\)[\s\S]*primaryNav\.scrollLeft=right-primaryNav\.clientWidth/u,
  'the active destination scrolls into view');
assert.match(app, /\('#newRaceBtn'\)\.onclick=\(\)=>openCapture\(\)/u,
  'the existing new-delivery action remains available on Home');
assert.match(app, /\('#newRaceFromRaces'\)\.onclick=\(\)=>openCapture\(\)/u,
  'the existing new-delivery action remains available from Deliveries');
assert.match(pilot, /@media \(min-width: 761px\) and \(min-height: 520px\)/u,
  'tablet and desktop use the existing sidebar breakpoint');
assert.match(pilot, /#home \.home-map \{ height: clamp\(300px, 50dvh, 460px\); \}/u,
  'desktop map height responds to viewport space');
assert.match(app, /window\.addEventListener\('orientationchange',invalidateVisibleMaps\)/u,
  'map dimensions update after device rotation');

console.log('Direct navigation, Help topics, desktop sidebar and responsive controls: PASS');
