'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sessionRestoreErrorMessage, beginCsrfRefresh, withSessionRead, setCsrfToken, getCsrfToken, clearCsrfToken } = require('../identity-session-guard');

const ui = fs.readFileSync(path.join(__dirname, '..', 'identity-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const fallback = error => error?.code === 'UNAUTHENTICATED' ? 'Sua sessão expirou. Entre novamente.' : 'Falha.';

assert.equal(sessionRestoreErrorMessage({ status: 401, code: 'UNAUTHENTICATED' }, false, fallback), '',
  'first anonymous access does not claim an existing session expired');
assert.equal(sessionRestoreErrorMessage({ status: 401, code: 'UNAUTHENTICATED' }, true, fallback),
  'Sua sessão expirou. Entre novamente.', 'a previously authenticated session still reports expiry');
const firstCsrfRead = beginCsrfRefresh();
const secondCsrfRead = beginCsrfRefresh();
assert.equal(setCsrfToken('latest-csrf-proof', secondCsrfRead), true);
assert.equal(setCsrfToken('stale-csrf-proof', firstCsrfRead), false);
assert.equal(getCsrfToken(), 'latest-csrf-proof');
clearCsrfToken();
assert.equal(getCsrfToken(), null);
let reads = 0, resolveRead;
const pending = new Promise(resolve => { resolveRead = resolve; });
const first = withSessionRead(async () => { reads += 1; return pending; });
const second = withSessionRead(async () => { reads += 1; return pending; });
resolveRead({ csrfToken: 'shared' });
Promise.all([first, second]).then(values => {
  assert.deepEqual(values, [{ csrfToken: 'shared' }, { csrfToken: 'shared' }]);
  assert.equal(reads, 1, 'simultaneous identity and sync clients share one rotating session read');
});
assert.match(ui, /const hadAuthenticatedSession = Boolean\(current\)/u);
assert.match(ui, /sessionRestoreErrorMessage\(error, hadAuthenticatedSession, message\)/u);
assert.match(html, /identity-session-guard\.js[\s\S]*?app\.js[\s\S]*?identity-ui\.js/u,
  'session guard loads before app startup and the identity client follows the app');
assert.match(html, /identity-session-guard\.js[\s\S]*?app\.js/u, 'shared session/CSRF guard loads before the sync client');
console.log('Motoboy anonymous-first-session regression: OK');
