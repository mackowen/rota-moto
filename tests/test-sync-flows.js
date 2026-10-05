'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','contract.js'),'utf8');
const ctx={crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},globalThis:null};ctx.globalThis=ctx;vm.runInNewContext(source,ctx);
const C=ctx.RotaMotoContract;

// a) Restaurant order -> delivery packet -> Moto route record, retaining route fields.
const order={id:'ord-1',deliveryId:'del-1',companyId:'c1',status:'ATRIBUIDA',num:17,customer:'Ana',phone:'11999990000',address:'Rua A, 10',coords:[-23.5,-46.6],value:42,items:[{name:'Prato'}],obs:'Portaria'};
const delivery=C.deliveryFromOrder(order,'c1');
const incoming=C.raceFromDelivery(delivery,order);
assert.equal(incoming.orderId,'ord-1');assert.equal(incoming.client,'Ana');assert.equal(incoming.address,'Rua A, 10');assert.equal(incoming.lat,-23.5);assert.equal(incoming.lng,-46.6);assert.equal(incoming.orderNo,17);assert.equal(incoming.items.length,1);

// b/g) Operational revisions use ISO timestamps, monotonically advance, and round trip.
const started=C.revise({...incoming,status:'route',canonicalStatus:'OUT_FOR_DELIVERY'},'2026-09-30T12:00:00.000Z');
assert.match(started.updatedAt,/^\d{4}-\d\d-\d\dT/);assert(started.version>incoming.version);assert(C.compareRevision(started,incoming)>0);
const exported=C.deliveryFromRace(started,'c1','driver-1');assert.equal(exported.status,'OUT_FOR_DELIVERY');assert.equal(exported.updatedAt,started.updatedAt);
assert.equal(C.timestampMs('2026-09-30T12:00:00.000Z'),Date.parse('2026-09-30T12:00:00.000Z'));

// c) Explicit cancellation is a status update and leaves Moto race outside active route.
const cancelled=C.raceFromDelivery({...delivery,status:'CANCELLED',updatedAt:'2026-09-30T12:01:00.000Z',version:3},order,incoming);
assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.canonicalStatus,'CANCELLED');

// d/e) Deletion is represented as a delivery tombstone; packet retains it after local history cleanup.
const tomb=C.tombstone(started,'deliveries','2026-09-30T12:02:00.000Z');
const packet=C.packet({companyId:'c1',app:'RotaMoto',deliveries:[],tombstones:[tomb]});
assert.equal(packet.data.tombstones[0].id,'del-1');assert.equal(packet.data.tombstones[0].deleted,true);
const motoSource=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const motoHtml=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const motoWorker=fs.readFileSync(path.join(__dirname,'..','service-worker.js'),'utf8');
const renderingHelpers=motoSource.slice(motoSource.indexOf('const brl='),motoSource.indexOf('\nfunction toast'));
const renderingContext=vm.createContext({Date,Number,String,Math});
vm.runInContext(`${renderingHelpers}\nthis.esc=esc;this.safeSignatureDataUrl=safeSignatureDataUrl;`,renderingContext);
assert.equal(renderingContext.esc('" onmouseover="alert(1)'), '&quot; onmouseover=&quot;alert(1)');
assert.equal(renderingContext.safeSignatureDataUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
assert.equal(renderingContext.safeSignatureDataUrl('data:image/png;base64,AA" onerror="alert(1)'), '', 'untrusted signature markup is not used as an image URL');
assert(motoSource.includes('data-view="${esc(r.id)}"'),'imported race IDs are escaped in HTML attributes');
assert(motoSource.includes('src="${esc(signature)}"'),'signature source is constrained and escaped');
assert(/<script src="contract\.js\?v=1"><\/script><script src="backup-format\.js\?v=1"><\/script><script src="sync-reconciliation\.js\?v=2"><\/script><script src="execution-workflow\.js\?v=2"><\/script><script src="indexeddb-schema\.js\?v=2"><\/script><script src="delivery-qr\.js\?v=1"><\/script><script src="qr-decoder\.js\?v=1"><\/script><script src="identity-session-guard\.js"><\/script><script src="app\.js\?v=40\.3"><\/script>/u.test(motoHtml),'browser must load shared security/sync and QR dependencies before its app consumer');
assert(motoWorker.includes("'./contract.js?v=1'"),'contract must be available from offline precache');
assert(motoSource.includes("for(const store of ['races','deliveries','deliveryEvents','locations','proofs','earnings','outbox','inbox','syncState'])"));
assert(motoSource.includes('async function createMotoBackup()')&&motoSource.includes('RotaMotoBackupFormat.create({app:\'motoboy\''),'Motoboy backup exports a versioned snapshot of every IndexedDB store');
assert(motoSource.includes('transaction=connection.transaction(names,\'readwrite\')')&&motoSource.includes('if(existing.has(key)){counts.kept++;continue}'),'Motoboy backup restore merges atomically without overwriting existing records');
// Execution facts and their outbound queue entry must commit or abort together.
assert(motoSource.includes("const stores=['races','deliveries','meta',...(deliveryEvent||deliveryProof?['outbox']:[]),...(deliveryEvent?['deliveryEvents']:[]),...(deliveryProof?['proofs']:[]),...(tombstones.length?['tombstones']:[])]"));
assert(motoSource.includes('for(const tombstone of tombstones)t.objectStore(\'tombstones\').put(tombstone)'));
assert(motoSource.includes("const storedEvent={...deliveryEvent,id:deliveryEvent.eventId,sync:{state:deliveryEvent.localOnly?'local-only':'pending'}};t.objectStore('deliveryEvents').put(storedEvent);t.objectStore('outbox').put({...storedEvent,status:deliveryEvent.localOnly?'local-only':'pending'})"));
assert(motoSource.includes("if(decision==='stale'){inbox.put({id:`server:${event.eventId}`,event,status:'reconciled',resolution:'stale'"), 'stale pull revisions are recorded without regressing canonical cache');
assert(motoSource.includes("renderHome();renderRaces();if($('#earnings')?.classList.contains('active'))renderEarnings()"), 'canonical pull refreshes active user-facing projections without waiting for reload');
assert(motoSource.includes('state.races=nextRaces;state.earnings=nextEarnings;state.settings=normalizeSettings(nextSettings)'), 'pull persists and publishes canonical earnings and route settings after the transaction');
assert(motoSource.includes('const linkedEarning=nextEarnings.filter(row=>row.canonicalId&&Number.isSafeInteger(row.amountMinor)&&row.deliveryId===event.entityId'), 'canonical Earning pulled before Delivery still attaches to its local projection');
assert(motoSource.includes('nextSettings.canonicalRouteOrderIds=[...new Set([...canonicalRoutes.values()]'), 'pull projects authoritative Route.deliveryIds into local route ordering');
assert(motoSource.includes('uploadPendingProofMedia')&&motoSource.includes("uploadState:'pending'"), 'proofs remain local and retry upload through the authenticated media endpoint');
assert(motoSource.includes('proofs/media?proofId=${encodeURIComponent(proof.id)}'), 'proof upload binds the server intent to the local DeliveryProof id');
assert(motoSource.includes("proofId:proof.id,proofSha256:proof.media?.sha256"), 'completion event links its locally persisted proof metadata');
assert(motoSource.includes('RotaMotoExecutionWorkflow.resetForRedelivery(current)'), 'redelivery archives the prior local attempt before resetting its active projection');

assert(motoSource.includes('await persistOnly(opts)'));
assert(motoSource.includes("function deleteRiderRace(id)"));
assert(motoSource.includes('events:[],deliveries:[],drivers:[],routes:[]'),'Motoboy must not publish canonical Delivery or administrative data');
assert(motoSource.includes("await tx(['races','deliveries','meta'],'readwrite',t=>"),'startup projection normalization is one transaction');
assert(motoSource.includes('function commitRouteOrder(ids){return commitRiderCommand('),'route-order settings use the shared serialized command queue');
const routeMetrics=motoSource.slice(motoSource.indexOf('async function calculateRoadDistances(rs){'),motoSource.indexOf('\nfunction requestRoadDistances'));
assert(routeMetrics.includes('commitRiderCommand('),'route distance results publish only after snapshot persistence');
assert(!routeMetrics.includes('persistOnly('),'route distance calculations do not persist already-mutated global races');
assert(motoSource.includes("tx(['races','deliveries','inbox','tombstones'],'readwrite',t=>"),'received tombstones commit with sync receipt and projections');
assert(motoSource.includes('return enqueueRiderWrite(()=>receiveRestaurantPacketNow(packet),{refreshState:true})'),'sync receipt shares cross-tab write lock and refreshes persisted state');
// History deletion must commit tombstones and all cleared projections together.
const historyDeleteStart=motoSource.indexOf("$('#clearData').onclick=");
const historyDelete=motoSource.slice(historyDeleteStart,historyDeleteStart+1800);
assert(historyDelete.includes("tx(['races','deliveries','tombstones','deliveryEvents','locations','proofs','earnings','outbox','inbox','syncState'],'readwrite'"));
assert(historyDelete.indexOf('await tx(')<historyDelete.indexOf('state.races=[]'),'in-memory state changes only after transaction completion');
assert(historyDelete.includes("toast('Não foi possível apagar o histórico. Nenhuma alteração foi confirmada.','error')"));
assert(!historyDelete.includes("tx('tombstones','readwrite'"),'history tombstones are not persisted separately');
// Failed opens must be retryable; a schema upgrade from another tab must release this connection.
assert(motoSource.includes(".catch(error=>{if(dbReady===opening)dbReady=null;throw error})"));
assert(motoSource.includes('request.onblocked=()=>fail(new Error('));
assert(motoSource.includes('connection.onversionchange=()=>{connection.close();if(dbReady===opening)dbReady=null}'));
assert(motoSource.includes('if(settled){connection.close();return}'));

// f) Impossible transitions are rejected, never persisted as a newer revision.
assert.throws(()=>C.assertTransition('DELIVERED','OUT_FOR_DELIVERY'));
assert.throws(()=>C.assertTransition('ASSIGNED','DELIVERED'));
console.log('sync flow tests: OK');
