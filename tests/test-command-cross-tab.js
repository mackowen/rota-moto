'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing ${start}`);return source.slice(a,b)};
const lockSource=extract('function withRiderWriteLock(', '\nasync function readPersistedRiderSnapshot');
const commandSource=extract('let riderCommandQueue=Promise.resolve();','\nasync function loadDB');
let lockTail=Promise.resolve();
const locks={request(_name,_options,run){const result=lockTail.then(run,run);lockTail=result.then(()=>undefined,()=>undefined);return result}};
const shared={snapshot:{races:[],settings:{autoNext:0,autoWork:false,restaurantName:'Canônico',restaurantPhone:'11999990000',driverName:'Motorista canônico'}}};
function tab(){
 const context=vm.createContext({
  structuredClone,Promise,Error,console:{warn(){}},DB_NAME:'RotaMotoDB',navigator:{locks},
  defaults:{autoNext:0,autoWork:false},normalizeSettings:value=>({...context.defaults,...value}),syncSession:{companyId:'tenant-a',driverId:'driver-a'},
  state:structuredClone(shared.snapshot),renderAll(){},localStorage:{setItem(){}},
  readPersistedRiderSnapshot:async()=>structuredClone(shared.snapshot),
  persistOnly:async({snapshot})=>{await Promise.resolve();shared.snapshot=structuredClone(snapshot)}
 });
 vm.runInContext(`${lockSource}\n${commandSource}\nthis.update=changes=>commitSettingsCommand({...state.settings,...changes});`,context);
 return context;
}
async function run(){
 const first=tab(),second=tab();
 await Promise.all([first.update({autoNext:42}),second.update({autoWork:true})]);
 assert.equal(shared.snapshot.settings.autoNext,42,'first tab update survives the next tab write');
 assert.equal(shared.snapshot.settings.autoWork,true,'second tab update is persisted');
 await first.update({restaurantName:'tentativa local',restaurantPhone:'000',driverName:'outro motorista',autoNext:43});
 assert.equal(shared.snapshot.settings.restaurantName,'Canônico','tenant-linked settings cannot overwrite Restaurant-owned Company data');
 assert.equal(shared.snapshot.settings.restaurantPhone,'11999990000','tenant-linked settings cannot overwrite canonical support contact');
 assert.equal(shared.snapshot.settings.driverName,'Motorista canônico','tenant-linked settings cannot overwrite Restaurant-owned Driver profile');
 assert.equal(shared.snapshot.settings.autoNext,43,'DEVICE_LOCAL settings remain writable while integrated');
 const unsupported=vm.createContext({structuredClone,Promise,Error,console:{warn(){}},DB_NAME:'RotaMotoDB',navigator:{},state:{races:[],settings:{autoNext:0,autoWork:false}},defaults:{autoNext:0,autoWork:false},normalizeSettings:value=>value,readPersistedRiderSnapshot:async()=>structuredClone(shared.snapshot),persistOnly:async()=>{throw Error('must not persist without cross-tab lock')}});
 vm.runInContext(`${lockSource}\n${commandSource}\nthis.update=changes=>commitSettingsCommand({...state.settings,...changes});`,unsupported);
 await assert.rejects(unsupported.update({autoNext:99}),/bloqueio entre abas/,'unsupported browsers fail closed instead of risking a lost update');
 assert.equal(shared.snapshot.settings.autoNext,43,'unsupported context cannot overwrite persisted settings');
 console.log('cross-tab command serialization tests: OK');
}
run().catch(error=>{console.error(error);process.exitCode=1});
