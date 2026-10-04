((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RotaMotoExecutionWorkflow = api;
})(globalThis, () => {
  'use strict';

  const ACTIONS = Object.freeze({
    ASSIGNED: Object.freeze({ accept: ['ACCEPTED', 'DELIVERY_ACCEPTED'] }),
    ACCEPTED: Object.freeze({ pickup: ['PICKED_UP', 'DELIVERY_PICKED_UP'], fail: ['FAILED', 'DELIVERY_FAILED'] }),
    PICKED_UP: Object.freeze({ depart: ['OUT_FOR_DELIVERY', 'DELIVERY_STARTED'], fail: ['FAILED', 'DELIVERY_FAILED'] }),
    OUT_FOR_DELIVERY: Object.freeze({ arrive: ['ARRIVED', 'DELIVERY_ARRIVED'], deliver: ['DELIVERED', 'DELIVERY_COMPLETED'], fail: ['FAILED', 'DELIVERY_FAILED'], return: ['RETURNED', 'DELIVERY_RETURNED'] }),
    ARRIVED: Object.freeze({ deliver: ['DELIVERED', 'DELIVERY_COMPLETED'], fail: ['FAILED', 'DELIVERY_FAILED'], return: ['RETURNED', 'DELIVERY_RETURNED'] })
  });
  const LOCAL_STATUS = Object.freeze({
    CREATED: 'open', ASSIGNED: 'open', ACCEPTED: 'open', PICKED_UP: 'route',
    OUT_FOR_DELIVERY: 'route', ARRIVED: 'arrived', DELIVERED: 'done',
    CANCELLED: 'cancelled', FAILED: 'issue', RETURNED: 'issue', REDELIVERY: 'open'
  });

  function canonicalStatus(race, contract) {
    return race?.canonicalStatus || contract.normalizeDeliveryStatus(race?.status, 'motoboy');
  }
  function action(status, name) {
    const result = ACTIONS[status]?.[name];
    return result ? Object.freeze({ to: result[0], eventType: result[1] }) : null;
  }
  function allowedActions(status) {
    return Object.keys(ACTIONS[status] || {});
  }
  function localStatus(status) {
    return LOCAL_STATUS[status] || null;
  }
  function resetForRedelivery(current = {}) {
    const fields = ['acceptedAt', 'pickedUpAt', 'startedAt', 'arrivedAt', 'completedAt', 'finishedAt',
      'customerSignature', 'customerSignatureAt', 'issueAt', 'failureReason', 'returnedAt', 'returnReason',
      'gpsDistanceKm', 'gpsLastPoint'];
    const attempt = Object.fromEntries(fields.filter(key => current[key] !== undefined).map(key => [key, current[key]]));
    const hasFacts = Object.keys(attempt).some(key => key !== 'gpsDistanceKm' && key !== 'gpsLastPoint');
    const history = Array.isArray(current.executionHistory) ? [...current.executionHistory] : [];
    const attemptId = [current.canonicalStatus || current.status || '', current.completedAt || '', current.issueAt || '', current.returnedAt || ''].join(':');
    if (hasFacts && !history.some(item => item.attemptId === attemptId)) {
      history.push({ attemptId, status: current.canonicalStatus || current.status || null, ...attempt });
    }
    const next = { ...current, executionHistory: history, gpsDistanceKm: 0 };
    for (const key of fields) delete next[key];
    next.gpsDistanceKm = 0;
    return next;
  }
  function inActiveRoute(race, contract) {
    if (!race || race.deleted || ['done', 'cancelled', 'issue'].includes(race.status)) return false;
    const status = canonicalStatus(race, contract);
    return ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'REDELIVERY'].includes(status) ||
      (!race.canonicalDelivery && ['open', 'route', 'arrived'].includes(race.status));
  }

  return Object.freeze({ ACTIONS, canonicalStatus, action, allowedActions, localStatus, inActiveRoute, resetForRedelivery });
});
