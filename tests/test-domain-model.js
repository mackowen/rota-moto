'use strict';
const assert=require('node:assert/strict');
require('../contract.js');
const C=globalThis.RotaMotoContract;
assert.deepEqual(Object.keys(C.ENTITY_SCHEMAS).sort(),['Company','Delivery','DeliveryEvent','DeliveryProof','Driver','Earning','LocationPoint','Order','Route'].sort());
const base={id:'e1',companyId:'c1',createdAt:'2026-10-04T10:00:00.000Z',updatedAt:'2026-10-04T10:00:00.000Z',version:1};
assert.equal(C.validateEntity('Earning',{...base,deliveryId:'d1',amountMinor:105,currency:'BRL',components:[]}).valid,true);
assert.equal(C.validateEntity('Earning',{...base,amountMinor:105,currency:'BRL',components:[{code:'delivery_fee',amountMinor:105}],ruleVersion:'fees-v2'}).valid,true);
assert.equal(C.validateEntity('Earning',{...base,amountMinor:105,currency:'BRL',components:[{amountMinor:105}]}).valid,false);
assert.equal(C.validateEntity('Earning',{...base,amountMinor:1.2,currency:'BRL'}).valid,false);
assert.equal(C.validateEntity('Earning',{...base,amountMinor:10,currency:'brl'}).valid,false);
assert.equal(C.validateEntity('Delivery',{...base,status:'IMPOSSIBLE'}).valid,false);
assert.equal(C.validateEntity('Delivery',{...base,status:'ASSIGNED',unexpected:true}).valid,false);
assert.equal(C.validateEntity('Delivery',{...base,status:'ASSIGNED',x_ifood_external:{key:'value'}}).valid,true);
assert.equal(C.validateRouteMembership([{id:'r1',deliveryIds:['d1']},{id:'r2',deliveryIds:['d1']}]).valid,false);
assert.equal(C.validateRouteMembership([{id:'r1',deliveryIds:['d1','d2']}]).valid,true);
assert.equal(C.validateEntity('DeliveryProof',{...base,deliveryId:'d1',media:{mimeType:'image/png',sizeBytes:3,sha256:'a'.repeat(64),storageRef:{provider:'unconfigured',objectKey:'ref'}}}).valid,true);
const projected=C.raceFromDelivery({id:'d1',companyId:'c1',orderId:'o1',status:'ASSIGNED',createdAt:'2026-10-01T00:00:00.000Z'},
  {id:'o1',customer:'synthetic',extensions:{x_rotamoto_navigation_coordinates:{latitude:-23.5,longitude:-46.6,provenance:'restaurant_order_coordinates'}}});
assert.equal(projected.lat,-23.5);assert.equal(projected.lng,-46.6);
const untrustedCoordinates=C.raceFromDelivery({id:'d2',status:'ASSIGNED'},
  {extensions:{x_rotamoto_navigation_coordinates:{latitude:91,longitude:0,provenance:'restaurant_order_coordinates'}}});
assert.equal(untrustedCoordinates.lat,null,'invalid out-of-range coordinates remain unavailable');
console.log('canonical domain schema validation: OK');
