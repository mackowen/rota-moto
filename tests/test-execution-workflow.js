'use strict';
const assert = require('node:assert/strict');
const workflow = require('../execution-workflow');
require('../contract');
const contract = globalThis.RotaMotoContract;
const expected = {
  ASSIGNED: ['accept'], ACCEPTED: ['pickup', 'fail'], PICKED_UP: ['depart', 'fail'],
  OUT_FOR_DELIVERY: ['arrive', 'deliver', 'fail', 'return'], ARRIVED: ['deliver', 'fail', 'return'],
  DELIVERED: [], CANCELLED: [], FAILED: [], RETURNED: [], REDELIVERY: []
};
for (const [status, actions] of Object.entries(expected)) {
  assert.deepEqual(workflow.allowedActions(status).sort(), actions.sort(), `actions at ${status}`);
  for (const name of actions) {
    const action = workflow.action(status, name);
    assert.ok(action);
    assert.equal(contract.EXECUTION_EVENT_STATUS[action.eventType], action.to);
    assert.equal(contract.canTransition(status, action.to), true);
  }
}
assert.equal(workflow.action('ASSIGNED', 'deliver'), null);
assert.equal(workflow.action('REDELIVERY', 'accept'), null);
assert.equal(workflow.localStatus('RETURNED'), 'issue');
assert.equal(workflow.localStatus('REDELIVERY'), 'open');
assert.equal(workflow.inActiveRoute({canonicalDelivery:true,canonicalStatus:'CANCELLED',status:'cancelled'}, contract), false);
assert.equal(workflow.inActiveRoute({canonicalDelivery:true,canonicalStatus:'ASSIGNED',status:'open'}, contract), true);

const archived = workflow.resetForRedelivery({canonicalStatus:'RETURNED',returnedAt:'2026-10-04T10:00:00Z',returnReason:'cliente ausente',customerSignature:'data:image/png;base64,AAAA',gpsDistanceKm:3.5});
assert.equal(archived.returnedAt, undefined);
assert.equal(archived.gpsDistanceKm, 0);
assert.equal(archived.executionHistory[0].status, 'RETURNED');
assert.equal(archived.executionHistory[0].returnReason, 'cliente ausente');
assert.equal(archived.executionHistory[0].customerSignature, 'data:image/png;base64,AAAA');
assert.equal(workflow.resetForRedelivery(archived).executionHistory.length, 1, 'replay does not duplicate archived attempts');
console.log('Motoboy execution workflow: OK');
