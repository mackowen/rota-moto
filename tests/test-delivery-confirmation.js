'use strict';

const assert = require('node:assert/strict');
const { isServerConfirmedCompletion } = require('../delivery-confirmation');
const race = { id: 'local-1', deliveryId: 'delivery-1', canonicalDelivery: true, canonicalStatus: 'DELIVERED' };
const event = { id: 'event-1', eventId: 'event-1', type: 'DELIVERY_COMPLETED', entityId: 'delivery-1', version: 2 };

assert.equal(isServerConfirmedCompletion(race, [event], []), false,
  'a locally recorded completion is not presented as confirmed');
assert.equal(isServerConfirmedCompletion({ ...race, canonicalDelivery: false }, [{ ...event, sync: { state: 'synced' } }]), false,
  'local-only deliveries cannot claim server confirmation');
assert.equal(isServerConfirmedCompletion({ ...race, canonicalStatus: 'OUT_FOR_DELIVERY' }, [{ ...event, sync: { state: 'synced' } }]), false,
  'only the canonical delivered state is eligible for confirmation');
assert.equal(isServerConfirmedCompletion(race, [{ ...event, entityId: 'other-delivery', sync: { state: 'synced' } }]), false,
  'an acknowledgement for another delivery cannot confirm this completion');
assert.equal(isServerConfirmedCompletion(race, [{ ...event, sync: { state: 'pending' } }]), false,
  'a pending event cannot claim confirmation');
assert.equal(isServerConfirmedCompletion(race, [event], [
  { id: 'operation:DeliveryEvent:event-1', status: 'accepted', sourceVersion: 2 },
]), true, 'the matching server acknowledgement confirms the canonical completion');
assert.equal(isServerConfirmedCompletion(race, [event], [
  { id: 'operation:DeliveryEvent:event-1', status: 'accepted', sourceVersion: 1 },
]), false, 'an acknowledgement for a stale local revision cannot confirm completion');
assert.equal(isServerConfirmedCompletion(race, [{ ...event, sync: { state: 'synced' } }]), true,
  'a canonical event received from the server confirms completion');
console.log('Delivery confirmation waits for canonical server acknowledgement: OK');
