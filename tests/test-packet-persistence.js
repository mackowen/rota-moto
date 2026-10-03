'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const extract=(start,next)=>{const a=source.indexOf(start),b=source.indexOf(next,a);assert(a>=0&&b>a,`could not extract ${start}`);return source.slice(a,b)};

// This transaction-boundary harness models queued writes and all-or-nothing commit.
// It does not claim to emulate browser scheduling, upgrade locks, or IndexedDB internals.
function makeDatabase(seed={}){
 const data=new Map(Object.entries(seed).map(([name,rows])=>[name,new Map(rows.map(row=>[row.id??row.key,structuredClone(row)]))]));
 let abortNext=false,errorNext=false;
 return {data,abortNext(){abortNext=true},errorNext(){errorNext=true},transaction(names,mode){
  const selected=Array.isArray(names)?names:[names],staged=new Map(selected.map(name=>[name,new Map(data.get(name)||[])]));
  const reads=[];let aborted=false;
  const tx={error:null,objectStore(name){assert(selected.includes(name),`store ${name} not in transaction`);const store=staged.get(name);return {
   get(key){const request={result:undefined,error:null};reads.push(()=>{request.result=structuredClone(store.get(key));request.onsuccess?.()});return request},
   getAll(){const request={result:undefined,error:null};reads.push(()=>{request.result=structuredClone([...store.values()]);request.onsuccess?.()});return request},
   put(value){const key=value.id??value.key;store.set(key,structuredClone(value));return {result:key}},
   clear(){store.clear()},
   delete(key){store.delete(key)}
  }},abort(){aborted=true;tx.error=new Error('simulated abort')}};
  setTimeout(()=>{
   try{for(let index=0;index<reads.length;index++)reads[index]();if(mode==='readwrite'&&errorNext){errorNext=false;tx.error=new Error('simulated request failure');tx.onerror?.();tx.abort()}if(mode==='readwrite'&&abortNext){abortNext=false;tx.abort()}if(!aborted){for(const [name,rows] of staged)data.set(name,rows);tx.oncomplete?.()}else tx.onabort?.()}
   catch(error){tx.error=error;tx.onabort?.()}
  },0);
  return tx;
 }};
}

const validate=extract('async function validateRestaurantPacket(packet={}){','function receiveRestaurantPacket(packet={})');
const lock=extract('function withRiderWriteLock(', '\nasync function readPersistedRiderSnapshot');
const queue=extract('let riderCommandQueue=Promise.resolve();','\nfunction commitRiderCommand');
const receive=source.slice(source.indexOf('function receiveRestaurantPacket(packet={})'),source.indexOf('\n\n\nfunction normalizeSettings'));
const transaction=extract('async function tx(store,mode,fn){','async function persistOnly');
const contract={
 isNewer:(a,b)=>Date.parse(a.updatedAt||0)>Date.parse(b.updatedAt||0)||(Date.parse(a.updatedAt||0)===Date.parse(b.updatedAt||0)&&Number(a.version||0)>Number(b.version||0)),normalizeDeliveryStatus:s=>s||'CREATED',assertTransition:()=>{},
 raceFromDelivery:d=>({id:d.id,deliveryId:d.id,status:d.status||'open',canonicalStatus:d.status||'CREATED',updatedAt:d.updatedAt,version:d.version||1}),
 deliveryFromRace:r=>({id:r.deliveryId||r.id,status:r.canonicalStatus||r.status,updatedAt:r.updatedAt,version:r.version||1})
};
const ui={renders:0,success:0};
const db=makeDatabase({races:[{id:'old',deliveryId:'old',status:'open'}],deliveries:[{id:'old'}],meta:[{key:'settings',value:{keep:true}}],inbox:[],tombstones:[{id:'deleted-before',store:'deliveries',deleted:true,updatedAt:'2026-10-01T12:05:00Z',version:5}]});
const context=vm.createContext({
 Error,Date,JSON,Promise,Array,Object,Number,DB_NAME:'RotaMotoDB',navigator:{locks:{request(_name,_options,run){return run()}}},console:{warn(){},error(){}},
 openDB:async()=>db,db,state:{races:[{id:'old',deliveryId:'old',status:'open'}],settings:{companyId:'company_local'}},
 normalizeSettings:value=>value,readPersistedRiderSnapshot:async()=>({races:structuredClone(context.state.races),settings:structuredClone(context.state.settings)}),
 RotaMotoContract:contract,validateRestaurantPacket:null,renderAll(){ui.renders++},toast(_message,type){if(type==='success')ui.success++},localStorage:{setItem(){}},
 tx:null
});
vm.runInContext(`${lock}\n${queue}\n${transaction}\n${validate}\n${receive}\nthis.api={tx,receiveRestaurantPacket};`,context);
const api=context.api;
const packet={protocol:'rotamoto-sync',protocolVersion:1,schemaVersion:1,companyId:'company_local',packetId:'packet-1',data:{deliveries:[{id:'new-delivery',status:'OUT_FOR_DELIVERY',updatedAt:'2026-10-01T12:00:00Z'},{id:'deleted-before',status:'OUT_FOR_DELIVERY',updatedAt:'2026-10-01T12:00:00Z'}],tombstones:[{id:'old',store:'deliveries',companyId:'company_local',deleted:true,updatedAt:'2026-10-01T12:01:00Z',version:2}]}};
const snapshot=()=>JSON.stringify(Object.fromEntries([...db.data].map(([name,rows])=>[name,[...rows.values()]])));

async function run(){
 const original=JSON.stringify(context.state.races);const before=snapshot();
 db.errorNext();
 await assert.rejects(api.receiveRestaurantPacket(packet),/simulated request failure/);
 assert.equal(snapshot(),before,'request error must roll back all staged writes');
 assert.equal(JSON.stringify(context.state.races),original,'request error must not advance memory');
 db.abortNext();
 await assert.rejects(api.receiveRestaurantPacket(packet),/abort|transa/i);
 assert.equal(snapshot(),before,'abort must leave every persisted store untouched');
 assert.equal(JSON.stringify(context.state.races),original,'abort must leave in-memory projections untouched');
 assert.equal(ui.renders,0);assert.equal(ui.success,0,'an aborted packet must not render or announce success');

 const result=await api.receiveRestaurantPacket(packet);
 assert.equal(result.duplicate,false);assert.equal(result.received,1);
 assert(context.state.races.some(r=>r.id==='new-delivery'),'memory updates after commit');
 assert(!context.state.races.some(r=>r.id==='deleted-before'),'an older delivery cannot resurrect a locally tombstoned race');
 assert.equal(context.state.races.find(r=>r.id==='old').deleted,true);
 assert(db.data.get('races').has('new-delivery'));assert(db.data.get('deliveries').has('new-delivery'));
 assert.equal(db.data.get('deliveries').get('old').deleted,true,'tombstone projection commits with packet');
 assert.equal(db.data.get('tombstones').get('old').deleted,true,'received tombstone is retained for future outbound sync');
 assert(db.data.get('inbox').has('packet-1'),'receipt commits with domain writes');

 const committed=snapshot();const duplicate=await api.receiveRestaurantPacket(packet);
 assert.equal(duplicate.duplicate,true);assert.equal(snapshot(),committed,'replay must not write or duplicate data');
 assert.equal(context.state.races.filter(r=>r.id==='new-delivery').length,1);
 console.log('packet persistence tests: OK');
}
run().catch(error=>{console.error(error);process.exitCode=1});
