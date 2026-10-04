'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

assert.match(html, /<div class="stats">[\s\S]*?<b id="todayValue">[\s\S]*?<\/div><p id="earningsSyncNote" class="earningsSyncNote" role="status" hidden>/u,
  'the pending synchronization message is outside the narrow numeric stat card');
assert.match(app, /todayValue'\)\.textContent=earnedTotals\.size\?formatCanonicalTotals\(earnedTotals\):'—'/u,
  'an absent canonical snapshot uses a compact neutral value');
assert.match(app, /earningsNote\.hidden=earnedTotals\.size>0/u,
  'the explanatory status appears only while canonical earnings are absent');
assert.match(app, /monthValue'\)\.textContent=monthTotals\.size\?formatCanonicalTotals\(monthTotals\):'—'/u,
  'the monthly metric also remains a compact value when no snapshot exists');
assert.match(styles, /\.earningsSyncNote\{[^}]*overflow-wrap:anywhere/u,
  'the separate explanatory status can wrap without widening the layout');
console.log('narrow earnings card regression: OK');
