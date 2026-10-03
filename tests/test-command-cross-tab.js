'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing ${start}`);return source.slice(a,b)};
const lockSource=extract('function withRiderWriteLock(', '\nasync function readPersistedRiderSnapshot');
const commandSource=extract('let riderCommandQueue=Promise.resolve();','\nasync function loadDB');
let lockTail=Promise.resolve();
const locks={request(_name,_options,run){const result=lockTail.then(run,run);lockTail=result.then(()=>undefined,()=>undefined);return result}};
const shared={snapshot:{races:[],settings:{dailyGoal:0,autoWork:false}}};
function tab(){
 const context=vm.createContext({
  structuredClone,Promise,Error,console:{warn(){}},DB_NAME:'RotaMotoDB',navigator:{locks},
  defaults:{dailyGoal:0,autoWork:false},normalizeSettings:value=>({...context.defaults,...value}),
  state:structuredClone(shared.snapshot),renderAll(){},localStorage:{setItem(){}},
  readPersistedRiderSnapshot:async()=>structuredClone(shared.snapshot),
  persistOnly:async({snapshot})=>{await Promise.resolve();shared.snapshot=structuredClone(snapshot)}
 });
 vm.runInContext(`${lockSource}\n${commandSource}\nthis.update=changes=>commitSettingsCommand({...state.settings,...changes});`,context);
 return context;
}
async function run(){
 const first=tab(),second=tab();
 await Promise.all([first.update({dailyGoal:42}),second.update({autoWork:true})]);
 assert.equal(shared.snapshot.settings.dailyGoal,42,'first tab update survives the next tab write');
 assert.equal(shared.snapshot.settings.autoWork,true,'second tab update is persisted');
 const unsupported=vm.createContext({structuredClone,Promise,Error,console:{warn(){}},DB_NAME:'RotaMotoDB',navigator:{},state:{races:[],settings:{dailyGoal:0,autoWork:false}},defaults:{dailyGoal:0,autoWork:false},normalizeSettings:value=>value,readPersistedRiderSnapshot:async()=>structuredClone(shared.snapshot),persistOnly:async()=>{throw Error('must not persist without cross-tab lock')}});
 vm.runInContext(`${lockSource}\n${commandSource}\nthis.update=changes=>commitSettingsCommand({...state.settings,...changes});`,unsupported);
 await assert.rejects(unsupported.update({dailyGoal:99}),/bloqueio entre abas/,'unsupported browsers fail closed instead of risking a lost update');
 assert.equal(shared.snapshot.settings.dailyGoal,42,'unsupported context cannot overwrite persisted settings');
 console.log('cross-tab command serialization tests: OK');
}
run().catch(error=>{console.error(error);process.exitCode=1});
