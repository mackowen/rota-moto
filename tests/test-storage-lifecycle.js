'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('function openDB(){');
const end=source.indexOf('\nasync function tx',start);
assert(start>=0&&end>start,'openDB implementation should be present');
const requests=[];
const indexedDB={open(){const request={result:null,error:null};requests.push(request);return request}};
const context=vm.createContext({indexedDB,DB_NAME:'test-db',DB_VERSION:1,Error});
const openDB=vm.runInContext(`let dbReady=null;${source.slice(start,end)};openDB`,context);

async function run(){
 const first=openDB();
 assert.strictEqual(openDB(),first,'in-flight opens should be shared');
 requests[0].error=new Error('temporary open failure');
 requests[0].onerror();
 await assert.rejects(first,/temporary open failure/);

 const second=openDB();
 assert.equal(requests.length,2,'a failed open should allow a retry');
 const connection={closed:false,close(){this.closed=true}};
 requests[1].result=connection;
 requests[1].onsuccess();
 assert.strictEqual(await second,connection);

 connection.onversionchange();
 assert.equal(connection.closed,true,'version changes should close the old connection');
 const third=openDB();
 assert.equal(requests.length,3,'a closed connection should be reopened');
 requests[2].result={close(){}};
 requests[2].onsuccess();
 await third;

 requests[2].result.onversionchange();
 const blocked=openDB();
 requests[3].onblocked();
 await assert.rejects(blocked,/bloqueada/i);
 requests[3].result={close(){this.closed=true}};
 requests[3].onsuccess();
 assert.equal(requests[3].result.closed,true,'late success after blocked rejection should be closed');
}

run().then(()=>console.log('storage lifecycle tests: OK')).catch(error=>{console.error(error);process.exitCode=1});
