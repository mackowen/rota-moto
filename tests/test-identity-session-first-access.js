'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sessionRestoreErrorMessage } = require('../identity-session-guard');

const ui = fs.readFileSync(path.join(__dirname, '..', 'identity-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const fallback = error => error?.code === 'UNAUTHENTICATED' ? 'Sua sessão expirou. Entre novamente.' : 'Falha.';

assert.equal(sessionRestoreErrorMessage({ status: 401, code: 'UNAUTHENTICATED' }, false, fallback), '',
  'first anonymous access does not claim an existing session expired');
assert.equal(sessionRestoreErrorMessage({ status: 401, code: 'UNAUTHENTICATED' }, true, fallback),
  'Sua sessão expirou. Entre novamente.', 'a previously authenticated session still reports expiry');
assert.match(ui, /const hadAuthenticatedSession = Boolean\(current\)/u);
assert.match(ui, /sessionRestoreErrorMessage\(error, hadAuthenticatedSession, message\)/u);
assert.match(html, /identity-session-guard\.js[\s\S]{0,100}identity-ui\.js/u,
  'session helper loads before the Motoboy identity client');
console.log('Motoboy anonymous-first-session regression: OK');
