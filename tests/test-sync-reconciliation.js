'use strict';
const assert=require('node:assert/strict');
const R=require('../sync-reconciliation.js');
const uuid='00000000-0000-4000-8000-000000000001';
const event={eventId:uuid,type:'CANONICAL_RECORD_UPSERTED',entity:'Delivery',entityId:uuid,occurredAt:'2026-10-04T10:00:00.000Z',protocolVersion:1,payload:{id:uuid,companyId:'tenant-a',version:3,status:'ASSIGNED',driverId:'driver-a',priority:'HIGH',assignedAt:'2026-10-04T09:00:00.000Z',estimatedDistanceM:2400,orderId:'00000000-0000-4000-8000-000000000002'}};
assert.equal(R.canonicalEvent(event,'tenant-a').version,3);
const revoked={eventId:'00000000-0000-4000-8000-000000000009',type:'CANONICAL_ASSIGNMENT_REVOKED',entity:'Delivery',entityId:uuid,occurredAt:'2026-10-04T10:00:00.000Z',protocolVersion:1,payload:{id:uuid,companyId:'tenant-a',version:4,updatedAt:'2026-10-04T10:00:00.000Z'}};
assert.equal(R.canonicalEvent(revoked,'tenant-a').type,'CANONICAL_ASSIGNMENT_REVOKED');
assert.throws(()=>R.canonicalEvent({...revoked,entity:'Order'},'tenant-a'),/REVOCATION_INVALID/);
assert.throws(()=>R.canonicalEvent(event,'tenant-b'),/TENANT_MISMATCH/);
assert.equal(R.decide({localVersion:2,incomingVersion:3}),'apply');
assert.equal(R.decide({localVersion:2,incomingVersion:3,localPending:true}),'conflict');
assert.equal(R.decide({localVersion:3,incomingVersion:2}),'stale');
assert.equal(R.decide({localVersion:1,incomingVersion:2,tombstone:true}),'tombstone');
for(const status of ['accepted','duplicate','rejected','conflict'])assert.equal(R.statusFromAck(status),status);
assert.equal(R.retryAfterMilliseconds('7'),7000,'HTTP Retry-After delta seconds are honored');
assert.equal(R.retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:12 GMT',10000),2000,'HTTP Retry-After dates are converted against the current time');
assert.equal(R.retryAfterMilliseconds('invalid',10000),null,'invalid Retry-After falls back to exponential backoff');
assert.equal(R.retryDelay({status:429,retryAfterMs:R.retryAfterMilliseconds('7')},2),7000);
const ackPacket={packetId:'packet-ack-1',companyId:'tenant-a',deviceId:'device-a',data:{routes:[{id:'route-local'}],deliveryEvents:[{id:'event-local',eventId:'event-local'}],tombstones:[]}};
const ackResults=[
 {operation:'routes:0',entity:'Route',localId:'route-local',canonicalId:'00000000-0000-4000-8000-000000000099',canonicalVersion:4,status:'accepted'},
 {operation:'deliveryEvents:0',entity:'DeliveryEvent',localId:'event-local',canonicalId:'00000000-0000-4000-8000-000000000098',canonicalVersion:2,status:'duplicate'}
];
const validAck={packetId:ackPacket.packetId,companyId:'tenant-a',operationResults:ackResults};
assert.equal(R.validateOperationAck(ackPacket,validAck,{companyId:'tenant-a',deviceId:'device-a'}),true);
for(const malformed of [
 {...validAck,packetId:'other-packet'},
 {...validAck,companyId:'tenant-b'},
 {...validAck,operationResults:[]},
 {...validAck,operationResults:[ackResults[0]]},
 {...validAck,operationResults:[...ackResults,ackResults[0]]},
 {...validAck,operationResults:[ackResults[0],{...ackResults[1],operation:'unknown:0'}]},
 {...validAck,operationResults:[{...ackResults[0],entity:'Delivery'} ,ackResults[1]]},
 {...validAck,operationResults:[{...ackResults[0],localId:'other'} ,ackResults[1]]},
 {...validAck,operationResults:[{...ackResults[0],canonicalVersion:'4'},ackResults[1]]},
 {...validAck,operationResults:[{...ackResults[0],canonicalId:'not-a-uuid'},ackResults[1]]},
 {...validAck,operationResults:[{...ackResults[0],status:'pending'},ackResults[1]]}
])assert.throws(()=>R.validateOperationAck(ackPacket,malformed,{companyId:'tenant-a',deviceId:'device-a'}),/SYNC_ACK_INVALID/);
assert.throws(()=>R.validateOperationAck(ackPacket,validAck,{companyId:'tenant-a',deviceId:'device-b'}),/SYNC_ACK_INVALID/);
const durableAckOutbox=new Map([['sync-packet:device-a',{packet:ackPacket,snapshots:{'Route:route-local':1}}]]);
const reloadAckOutbox=()=>durableAckOutbox.get('sync-packet:device-a');
function modelAckOutboxReply(reply){const queued=reloadAckOutbox();if(reply instanceof Error)throw reply;R.validateOperationAck(queued.packet,reply,{companyId:'tenant-a',deviceId:'device-a'});durableAckOutbox.delete('sync-packet:device-a')}
assert.throws(()=>modelAckOutboxReply(new Error('network unavailable')),/network unavailable/);
assert.equal(reloadAckOutbox().packet.packetId,ackPacket.packetId,'after restart/reconnect the same durable packet is retried');
assert.throws(()=>modelAckOutboxReply({...validAck,operationResults:[ackResults[0]]}),/SYNC_ACK_INVALID/);
assert.equal(durableAckOutbox.size,1,'partial ACK cannot remove the durable packet');
const editAfterSend={id:'route-local',sync:{state:'local',version:2}};
assert.equal(R.sourceVersionMatches(editAfterSend,1),false,'an ACK snapshot cannot mark a concurrent newer local edit synced');
assert.equal(R.shouldRetry('accepted',true),true,'a newer local edit becomes a new pending operation after the acknowledged snapshot');
modelAckOutboxReply(validAck);
assert.equal(durableAckOutbox.size,0,'only a complete valid ACK permits packet retirement');
assert.equal(R.shouldRetry('rejected',false),false);assert.equal(R.shouldRetry('conflict',false),false);assert.equal(R.shouldRetry('conflict',true),true);
assert.equal(R.isPendingFact({sync:{state:'synced'}}),false,'canonical facts pulled from the server are not upload work');
assert.equal(R.isPendingFact({sync:{state:'canonical'}}),false);
assert.equal(R.isPendingFact({localOnly:true}),false);
assert.equal(R.isPendingFact({acknowledgedAt:1}),false);
assert.equal(R.isPendingFact({sync:{state:'local'}}),true);
const orderedReturnEvents=R.orderVersionedEvents([{id:'return-handover',entityId:'return-a',payload:{expectedVersion:3}},{id:'other',entityId:'return-b',payload:{expectedVersion:2}},{id:'return-arrival',entityId:'return-a',payload:{expectedVersion:2}},{id:'return-start',entityId:'return-a',payload:{expectedVersion:1}}]);assert.deepEqual(orderedReturnEvents.map(row=>row.id),['return-start','return-arrival','return-handover','other'],'offline return facts are sent in canonical expected-revision order, independent of IndexedDB key order');
assert.equal(R.versionedDeliveryFactCanFollow({entity:'delivery',payload:{expectedVersion:3}},3),true,'a pending handover based on the newly canonical arrival revision remains sendable');
assert.equal(R.versionedDeliveryFactCanFollow({entity:'delivery',payload:{expectedVersion:4}},3),true,'a later ordered local fact remains queued behind its predecessor');
assert.equal(R.versionedDeliveryFactCanFollow({entity:'delivery',payload:{expectedVersion:2}},3),false,'a fact based on an older canonical revision remains a conflict');
assert.equal(R.versionedDeliveryFactCanFollow({entity:'Order',payload:{expectedVersion:3}},3),false,'non-delivery records do not receive delivery-event conflict exemptions');
const deliveryOperationKey=row=>`operation:DeliveryEvent:${row.eventId||row.id}`;const serverConfirmedEvent={eventId:'restaurant-cancel',deliveryId:'delivery-a',sync:{state:'synced'}};assert.equal(R.hasPendingDeliveryFacts([serverConfirmedEvent],new Map(),deliveryOperationKey,['delivery-a']),false,'server-confirmed DeliveryEvents without a local ACK timestamp are not offline pending work');const localOfflineEvent={eventId:'driver-action',deliveryId:'delivery-a',sync:{state:'local'}};assert.equal(R.hasPendingDeliveryFacts([localOfflineEvent],new Map(),deliveryOperationKey,['delivery-a']),true,'unacknowledged local execution facts remain pending for reconciliation');assert.equal(R.hasPendingDeliveryFacts([localOfflineEvent],new Map([[deliveryOperationKey(localOfflineEvent),{status:'accepted'}]]),deliveryOperationKey,['delivery-a']),false,'accepted facts do not create a false pending conflict');
const opMap=new Map([['operation:event-local',{canonicalId:'00000000-0000-4000-8000-000000000099'}]]);assert.equal(R.findCanonicalFact([{id:'event-local'}],'00000000-0000-4000-8000-000000000099',opMap,row=>`operation:${row.id}`).id,'event-local');
const race=R.projectMotoboyDelivery(event.payload,{id:event.payload.orderId,customer:{name:'Jo'},address:'Rua A',coords:[-23,-46],items:[{name:'X'}]},{status:'route',startedAt:'2026-10-04T09:30:00Z'},{pendingExecution:true});
assert.equal(race.status,'route');assert.equal(race.driverId,'driver-a');assert.equal(race.client,'Jo');assert.equal(race.lat,-23);assert.equal(race.sync.canonicalVersion,3);
const syncedCoordinates=R.projectMotoboyDelivery(event.payload,{id:event.payload.orderId,extensions:{x_rotamoto_navigation_coordinates:{latitude:-23.5,longitude:-46.6,provenance:'restaurant_order_coordinates'}}});
assert.equal(syncedCoordinates.lat,-23.5);assert.equal(syncedCoordinates.lng,-46.6,'validated restaurant-owned route coordinates survive the sync projection');
const invalidSyncedCoordinates=R.projectMotoboyDelivery(event.payload,{extensions:{x_rotamoto_navigation_coordinates:{latitude:91,longitude:181,provenance:'restaurant_order_coordinates'}}});
assert.equal(invalidSyncedCoordinates.lat,null);assert.equal(invalidSyncedCoordinates.lng,null,'invalid coordinates remain unavailable after sync');
assert.equal(R.projectMotoboyDelivery(event.payload,{}, {assignmentRevoked:true}).assignmentRevoked,false,'a new canonical assignment clears the local revocation marker');
const cancelled=R.projectMotoboyDelivery({...event.payload,status:'CANCELLED',version:4},{},{status:'route'},{pendingExecution:true});assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.sync.state,'conflict');
const returnDelivery=R.projectMotoboyDelivery({...event.payload,status:'ASSIGNED',version:7,extensions:{x_rotamoto_delivery_type:'RETURN',x_rotamoto_custody_state:'WITH_DRIVER',x_rotamoto_return_destination:{name:'Restaurante QA',address:'Rua Retorno',latitude:-23.1,longitude:-46.2}}},{customer:{name:'Cliente original'},address:'Endereço do cliente',coords:[-22,-45]});
assert.equal(returnDelivery.isReturn,true);assert.equal(returnDelivery.client,'Restaurante QA');assert.equal(returnDelivery.address,'Rua Retorno');assert.equal(returnDelivery.lat,-23.1);assert.equal(returnDelivery.canonicalStatus,'ASSIGNED');assert.equal(returnDelivery.returnStage,null);assert.equal(returnDelivery.returnExpectedVersion,7,'return operations start from the canonical revision');
const externalReturn=R.projectMotoboyDelivery({...event.payload,status:'ASSIGNED',version:8,extensions:{x_rotamoto_delivery_type:'RETURN',x_rotamoto_return_destination:{name:'Restaurante QA',address:'Rua Retorno'}}},{number:'IFOOD-ORDER-42'});
assert.equal(externalReturn.orderNo,'IFOOD-ORDER-42','external canonical Order.number remains visible on Motoboy return tasks');
const awaitingReceipt=R.projectMotoboyDelivery({...event.payload,status:'ARRIVED',version:10,extensions:{x_rotamoto_delivery_type:'RETURN',x_rotamoto_custody_state:'AWAITING_RESTAURANT_RECEIPT'}});
assert.equal(awaitingReceipt.returnStage,'awaiting-receipt');assert.equal(awaitingReceipt.canonicalStatus,'ARRIVED','physical handover never masquerades as DELIVERED/RETURNED');
const restaurant=R.projectRestaurantDelivery({...event.payload,status:'OUT_FOR_DELIVERY',version:4},{id:'local-del',driverId:'local-driver',priority:'NORMAL',assignedAt:'local-time',estimatedDistanceM:10,status:'ASSIGNED'},{pendingPlanning:true});
assert.equal(restaurant.id,'local-del');assert.equal(restaurant.driverId,'local-driver');assert.equal(restaurant.status,'ASSIGNED');assert.equal(restaurant.sync.state,'conflict');
const keep=R.compactInbox([{id:'old',status:'reconciled',receivedAt:1},{id:'conflict',status:'conflict',receivedAt:1},...Array.from({length:3},(_,i)=>({id:`r${i}`,status:'reconciled',receivedAt:i+2}))],{keep:2});assert.deepEqual([...keep].sort(),['old','r0']);
async function testCoordinator(){let active=0,max=0,lockRequests=0;const locks={request:async(_name,_options,run)=>{lockRequests++;return run()}};const coordinator=R.createCoordinator({locks,lockName:'test'});const task=async()=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return 'ok'};const values=await Promise.all([coordinator.run(task),coordinator.run(task)]);assert.deepEqual(values,['ok','ok']);assert.equal(max,1);assert.equal(lockRequests,1)}
testCoordinator().then(()=>console.log('sync reconciliation policy tests: OK')).catch(error=>{console.error(error);process.exitCode=1});
