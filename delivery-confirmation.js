((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RotaMotoDeliveryConfirmation = api;
})(globalThis, () => {
  'use strict';

  function isServerConfirmedCompletion(race, events = [], operations = []) {
    if (!race?.canonicalDelivery || race.canonicalStatus !== 'DELIVERED') return false;
    const deliveryId = race.deliveryId || race.id;
    return events.some(event => {
      if (event?.type !== 'DELIVERY_COMPLETED' ||
          String(event.entityId || event.deliveryId || '') !== String(deliveryId)) return false;
      if (event.acknowledgedAt || event.sync?.state === 'synced') return true;
      const eventId = event.eventId || event.id;
      const operation = operations.find(row => row.id === 'operation:DeliveryEvent:' + eventId);
      const version = Number(event.sync?.version || event.version || 1);
      return ['accepted', 'duplicate'].includes(operation?.status) &&
        Number(operation.sourceVersion) === version;
    });
  }

  return Object.freeze({ isServerConfirmedCompletion });
});
