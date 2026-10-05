(() => {
  'use strict';
  const PREFIX = 'rm-delivery.v1';
  const TTL_SECONDS = 12 * 60 * 60;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  const KID = /^[A-Za-z0-9_-]{1,32}$/u;
  function failure(code) { const error = new Error(code); error.code = code; return error; }
  function decodeBase64Url(value) {
    const raw = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - value.length % 4) % 4));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }
  function encodeUtf8(bytes) { return new TextDecoder().decode(bytes); }
  function parseToken(token, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (typeof token !== 'string' || token.length > 1024) throw failure('QR_INVALID');
    const parts = token.split('.');
    if (parts.length !== 4 || `${parts[0]}.${parts[1]}` !== PREFIX || !/^[A-Za-z0-9_-]+$/u.test(parts[2]) ||
        !/^[A-Za-z0-9_-]{80,100}$/u.test(parts[3])) throw failure('QR_INVALID');
    let claims;
    try { claims = JSON.parse(encodeUtf8(decodeBase64Url(parts[2]))); } catch (_) { throw failure('QR_INVALID'); }
    if (claims?.v !== 1) throw failure('QR_VERSION_UNSUPPORTED');
    if (!UUID.test(claims.d || '') || !UUID.test(claims.c || '') || !KID.test(claims.kid || '') ||
        !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.rev) || claims.rev < 1 ||
        claims.exp <= claims.iat || claims.exp - claims.iat > TTL_SECONDS) throw failure('QR_INVALID');
    if (claims.iat > nowSeconds + 60 || claims.exp <= nowSeconds) throw failure('QR_EXPIRED');
    return { parts, claims };
  }
  async function verifyToken(token, { keys = [], nowSeconds = Math.floor(Date.now() / 1000), subtle = globalThis.crypto?.subtle } = {}) {
    if (!subtle) throw failure('QR_CRYPTO_UNAVAILABLE');
    const { parts, claims } = parseToken(token, nowSeconds);
    const entry = keys.find(key => key?.kid === claims.kid && key?.algorithm === 'Ed25519' && typeof key.spki === 'string');
    if (!entry) throw failure('QR_KEY_UNKNOWN');
    let key;
    try { key = await subtle.importKey('spki', decodeBase64Url(entry.spki), { name: 'Ed25519' }, false, ['verify']); }
    catch (_) { throw failure('QR_KEY_INVALID'); }
    const valid = await subtle.verify({ name: 'Ed25519' }, key, decodeBase64Url(parts[3]), new TextEncoder().encode(`${PREFIX}.${parts[2]}`));
    if (!valid) throw failure('QR_SIGNATURE_INVALID');
    return Object.freeze({ ...claims });
  }
  function resolveLocalDelivery(claim, { deliveries = [], races = [], companyId, driverId } = {}) {
    if (!claim || claim.c !== companyId) throw failure('QR_TENANT_MISMATCH');
    if (!UUID.test(driverId || '')) throw failure('QR_DRIVER_UNAVAILABLE');
    const delivery = deliveries.find(row => row?.id === claim.d && row?.companyId === companyId && !row.deletedAt && !row.deleted);
    if (!delivery) throw failure('QR_DELIVERY_NOT_FOUND');
    if (delivery.driverId !== driverId) throw failure('QR_DRIVER_NOT_ASSIGNED');
    if (Number(delivery.version) !== claim.rev) throw failure('QR_REVISION_STALE');
    if (!['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'REDELIVERY'].includes(delivery.status))
      throw failure('QR_STATE_INCOMPATIBLE');
    const race = races.find(row => row && (row.deliveryId === claim.d || row.id === claim.d) && !row.deleted);
    return Object.freeze({ delivery, race: race || null });
  }
  const api = Object.freeze({ PREFIX, TTL_SECONDS, parseToken, verifyToken, resolveLocalDelivery });
  globalThis.RotaMotoDeliveryQr = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
