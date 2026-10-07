'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const identity = fs.readFileSync(path.join(root, 'identity-ui.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

assert.match(app, /\$\$\('\.historyPeriod button'\)\.forEach/u, 'all history period controls are registered');
assert.match(app, /if\(id==='settings'\)renderSettings\(\)/u, 'opening settings refreshes canonical settings after sync');
assert.doesNotMatch(app, /(?<!\$)\$\('\.historyPeriod button'\)\.forEach/u, 'a singular selector is not iterated');
assert(app.indexOf('let cameraStream=null;') < app.indexOf("$('#takePhoto').onclick=") && app.indexOf('let lastCapturedFile=null;') < app.indexOf("$('#takePhoto').onclick="), 'capture state is initialized before capture handlers');
assert.match(app, /if\(!navigator\.mediaDevices\?\.getUserMedia\)throw Error\('getUserMedia indisponível'\)/u, 'missing camera API enters the handled unavailable-camera flow');
assert.match(identity, /if \(inviteForm\) inviteForm\.hidden/u, 'optional admin invitation control is guarded');
assert.match(identity, /if \(membersList\) membersList\.hidden/u, 'optional admin membership control is guarded');
assert.match(identity, /if \(adminPanel\) adminPanel\.hidden/u, 'removed admin panel is not dereferenced');
assert.match(styles, /@media\(min-width:761px\)\{\.app\{display:flex;height:100dvh;min-height:100dvh;flex-direction:column;margin:0 auto;padding-bottom:0\}\.top\{flex:0 0 auto\}\.app main\{flex:1;min-height:0;overflow-y:auto/u, 'desktop content scrolls in a reserved viewport above the navigation');
assert.match(styles, /nav\{position:static;transform:none;flex:0 0 auto/u, 'desktop navigation occupies its own layout space');
assert.match(styles, /@media\(max-width:760px\)[\s\S]{0,200}\.app\{padding-top:[^}]*padding-bottom:calc\(72px \+ env\(safe-area-inset-bottom\)\)/u, 'mobile fixed navigation retains safe-area content clearance');
console.log('Motoboy bootstrap, identity and navigation regressions: OK');
