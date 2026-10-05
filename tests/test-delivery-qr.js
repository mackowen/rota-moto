'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('../delivery-qr');
const QR = globalThis.RotaMotoDeliveryQr;

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(htmlSource, /delivery-qr\.js/iu);
assert.match(htmlSource, /qr-decoder\.js/iu);
assert.match(appSource, /BarcodeDetector/iu);
assert.match(appSource, /jsQR\(/u, 'fallback usa decoder local');
assert.match(appSource, /validateOnlineDeliveryQr/iu);
assert.match(htmlSource, /Escanear QR da entrega/iu);

const companyId = '11111111-1111-4111-8111-111111111111';
const otherCompanyId = '22222222-2222-4222-8222-222222222222';
const deliveryId = '33333333-3333-4333-8333-333333333333';
const driverId = '44444444-4444-4444-8444-444444444444';
const otherDriverId = '55555555-5555-4555-8555-555555555555';
const nowSeconds = 1_800_000_000;
const pair = crypto.generateKeyPairSync('ed25519');
const kid = 'campaign-key-01';
const spki = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
const publicKey = { kid, algorithm: 'Ed25519', spki };

function tokenFor(overrides = {}, key = pair.privateKey, keyId = kid) {
  const claims = { v: 1, d: deliveryId, c: companyId, iat: nowSeconds - 10, exp: nowSeconds + 600, rev: 7, kid: keyId, ...overrides };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const prefix = `rm-delivery.v1.${payload}`;
  const signature = crypto.sign(null, Buffer.from(prefix), key).toString('base64url');
  return `${prefix}.${signature}`;
}
function reencodePayload(token, change) {
  const parts = token.split('.');
  const claims = JSON.parse(Buffer.from(parts[2], 'base64url').toString('utf8'));
  change(claims);
  parts[2] = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return parts.join('.');
}
async function expectCode(run, code) { await assert.rejects(run, error => error.code === code); }

(async () => {
  const token = tokenFor();
  const valid = await QR.verifyToken(token, { keys: [publicKey], nowSeconds });
  assert.equal(valid.d, deliveryId);
  assert.deepEqual(Object.keys(valid).sort(), ['c', 'd', 'exp', 'iat', 'kid', 'rev', 'v']);
  assert.doesNotMatch(token, /cliente|telefone|endereço|observações|preço|items|customer|address/iu);

  const tokenParts = token.split('.');
  const alteredSignature = [...tokenParts.slice(0, 3), `${tokenParts[3][0] === 'A' ? 'B' : 'A'}${tokenParts[3].slice(1)}`].join('.');
  await expectCode(() => QR.verifyToken(alteredSignature, { keys: [publicKey], nowSeconds }), 'QR_SIGNATURE_INVALID');
  await expectCode(() => QR.verifyToken(reencodePayload(token, claims => { claims.d = '66666666-6666-4666-8666-666666666666'; }), { keys: [publicKey], nowSeconds }), 'QR_SIGNATURE_INVALID');
  await expectCode(() => QR.verifyToken(tokenFor({ c: otherCompanyId }), { keys: [publicKey], nowSeconds }).then(claim => QR.resolveLocalDelivery(claim, { companyId, driverId, deliveries: [] })), 'QR_TENANT_MISMATCH');
  await expectCode(() => QR.verifyToken(tokenFor({ exp: nowSeconds - 1, iat: nowSeconds - 100 }), { keys: [publicKey], nowSeconds }), 'QR_EXPIRED');
  await expectCode(() => QR.verifyToken(reencodePayload(token, claims => { claims.v = 2; }), { keys: [publicKey], nowSeconds }), 'QR_VERSION_UNSUPPORTED');
  await expectCode(() => QR.verifyToken(token, { keys: [], nowSeconds }), 'QR_KEY_UNKNOWN');

  const oldPair = crypto.generateKeyPairSync('ed25519');
  const oldId = 'old-key-01';
  const oldToken = tokenFor({}, oldPair.privateKey, oldId);
  const oldPublic = { kid: oldId, algorithm: 'Ed25519', spki: oldPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url') };
  assert.equal((await QR.verifyToken(oldToken, { keys: [oldPublic], nowSeconds })).kid, oldId, 'key antiga continua válida enquanto estiver no cache trusted');
  await expectCode(() => QR.verifyToken(oldToken, { keys: [publicKey], nowSeconds }), 'QR_KEY_UNKNOWN');

  const delivery = { id: deliveryId, companyId, driverId, status: 'ASSIGNED', version: 7 };
  const race = { id: 'local-race-1', deliveryId, companyId, canonicalDelivery: true };
  assert.equal(QR.resolveLocalDelivery(valid, { deliveries: [delivery], races: [race], companyId, driverId }).race, race);
  assert.throws(() => QR.resolveLocalDelivery(valid, { deliveries: [delivery], companyId, driverId: otherDriverId }), { code: 'QR_DRIVER_NOT_ASSIGNED' });
  assert.throws(() => QR.resolveLocalDelivery(valid, { deliveries: [], companyId, driverId }), { code: 'QR_DELIVERY_NOT_FOUND' });
  assert.throws(() => QR.resolveLocalDelivery(valid, { deliveries: [{ ...delivery, version: 8 }], companyId, driverId }), { code: 'QR_REVISION_STALE' });
  assert.throws(() => QR.resolveLocalDelivery(valid, { deliveries: [{ ...delivery, status: 'DELIVERED' }], companyId, driverId }), { code: 'QR_STATE_INCOMPATIBLE' });
  assert.throws(() => QR.resolveLocalDelivery(valid, { deliveries: [{ ...delivery, driverId: otherDriverId }], companyId, driverId }), { code: 'QR_DRIVER_NOT_ASSIGNED' });

  console.log('Delivery QR signature, claim, rotation-cache, tenant, assignment, replay-state and offline resolution tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
