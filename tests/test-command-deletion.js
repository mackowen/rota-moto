'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing ${start}`);return source.slice(a,b)};
const lock=extract('function withRiderWriteLock(', '\nasync function readPersistedRiderSnapshot');
const persist=extract('async function persistOnly(', '\nlet riderCommandQueue=');
const commands=extract('let riderCommandQueue=Promise.resolve();','\nfunction commitRaceCommand');
const seedRace={id:'race-1',deliveryId:'delivery-1',companyId:'company_local',version:4,updatedAt:'2026-10-01T12:00:00.000Z',status:'open'};
const db=new Map([['races',new Map([[seedRace.id,structuredClone(seedRace)]])],['deliveries',new Map([[seedRace.id,{id:seedRace.id}]])],['meta',new Map([['settings',{key:'settings',value:{companyId:'company_local',routeOrderIds:[seedRace.id]}}]])],['tombstones',new Map()]]);
const ui={renders:0,backups:0,fail:false,gate:null};
const context=vm.createContext({
 structuredClone,Promise,Date,Error,Array,Object,JSON,DB_NAME:'RotaMotoDB',navigator:{locks:{request(_name,_options,run){return run()}}},console:{warn(){}},
 state:{races:[structuredClone(seedRace)],settings:{companyId:'company_local',routeOrderIds:[seedRace.id]}},
 normalizeSettings:value=>value,readPersistedRiderSnapshot:async()=>({races:structuredClone([...db.get('races').values()]),settings:structuredClone(db.get('meta').get('settings')?.value||{})}),
 RotaMotoContract:{tombstone(race,store){return{id:race.deliveryId||race.id,store,companyId:race.companyId||'company_local',deleted:true,version:race.version+1,updatedAt:'2026-10-01T12:00:00.001Z',deletedAt:'2026-10-01T12:00:00.001Z'}},deliveryFromRace(race){return{id:race.id,status:race.status}}},
 localStorage:{setItem(){ui.backups++;ui.backupState=JSON.stringify(context.state)}},renderAll(){assert(!ui.fail,'UI cannot render while persistence is failing');ui.renders++},
 tx:async(names,_mode,write)=>{const stores=Array.isArray(names)?names:[names],staged=new Map(stores.map(name=>[name,new Map([...db.get(name)].map(([key,value])=>[key,structuredClone(value)]))]));const transaction={objectStore(name){assert(staged.has(name),`missing transaction store ${name}`);const rows=staged.get(name);return{clear(){rows.clear()},put(value){rows.set(value.id??value.key,structuredClone(value))}}}};write(transaction);if(ui.gate){const gate=ui.gate;ui.gate=null;await gate.promise}if(ui.fail)throw Error('simulated transaction abort');for(const [name,rows]of staged)db.set(name,rows)}
});
vm.runInContext(`${lock}\n${persist}\n${commands}\nthis.api={deleteRiderRace,commitRiderCommand};`,context);
const api=context.api;
async function run(){
 ui.fail=true;
 await assert.rejects(api.deleteRiderRace(seedRace.id),/simulated transaction abort/);
 assert.equal(context.state.races.length,1,'failure preserves active race');assert(db.get('races').has(seedRace.id));assert.equal(db.get('tombstones').size,0,'failed transaction rolls tombstone back');assert.equal(ui.backups,0);assert.equal(ui.renders,0);
 ui.fail=false;let release;ui.gate={promise:new Promise(resolve=>release=resolve)};
 const deletion=api.deleteRiderRace(seedRace.id);
 const update=api.commitRiderCommand(next=>{const race=next.races.find(item=>item.id===seedRace.id);if(!race)throw Error('race was deleted');race.client='updated';return{result:true}});
 await Promise.resolve();await Promise.resolve();assert.equal(context.state.races.length,1,'active state remains until transaction commits');assert.equal(ui.backups,0);assert.equal(ui.renders,0);release();
 assert.equal(await deletion,true);await assert.rejects(update,/race was deleted/);
 assert.equal(context.state.races.length,0);assert.equal(db.get('races').size,0);assert.equal(db.get('deliveries').size,0);assert.equal(db.get('tombstones').get('delivery-1').deleted,true);
 assert.equal(ui.backups,1);assert.equal(ui.renders,1);
 assert.equal(await api.deleteRiderRace(seedRace.id),false,'replayed delete is an idempotent no-op');assert.equal(db.get('tombstones').size,1);assert.equal(ui.backups,1);assert.equal(ui.renders,1);
 console.log('command deletion tests: OK');
}
run().catch(error=>{console.error(error);process.exitCode=1});
