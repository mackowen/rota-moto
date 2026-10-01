'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('let riderCommandQueue=Promise.resolve();'),end=source.indexOf('\nfunction commitRaceCommand',start);
assert(start>=0&&end>start,'command boundary must exist');
const context=vm.createContext({structuredClone,Promise,console:{warn(){}},state:{races:[{id:'before'}],settings:{keep:true}},ui:{renders:0},localStorage:{setItem(){context.ui.backup=true}},renderAll(){context.ui.renders++},persistOnly:async({snapshot})=>{if(context.ui.fail)throw Error('write failed');if(context.ui.wait){const gate=context.ui.wait;context.ui.wait=null;await gate.promise}context.ui.persisted=structuredClone(snapshot)}});
vm.runInContext(source.slice(start,end)+'\nthis.command=commitRiderCommand;',context);
async function run(){
 const old=JSON.stringify(context.state);
 context.ui.fail=true;
 await assert.rejects(context.command(next=>{next.races.push({id:'failed'});return{result:'no'}}),/write failed/);
 assert.equal(JSON.stringify(context.state),old,'failed writes must leave active state untouched');
 assert.equal(context.ui.renders,0);assert.equal(context.ui.backup,undefined);
 context.ui.fail=false;
 const gate={};gate.promise=new Promise(resolve=>gate.resolve=resolve);context.ui.wait=gate;
 const first=context.command(next=>{next.races.push({id:'first'});return{result:'first'}});
 const second=context.command(next=>{next.races.push({id:'second'});return{result:'second'}});
 await Promise.resolve();await Promise.resolve();assert.equal(context.ui.renders,0);gate.resolve();
 assert.equal(await first,'first');assert.equal(await second,'second');
 assert.deepEqual(Array.from(context.state.races,r=>r.id),['before','first','second']);
 assert.equal(context.ui.persisted.races.at(-1).id,'second');assert.equal(context.ui.renders,2);
 console.log('command persistence tests: OK');
}
run().catch(error=>{console.error(error);process.exitCode=1});
