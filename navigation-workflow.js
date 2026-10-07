'use strict';
(function(root){
  const PROVIDERS=new Set(['google','waze','osmand']);
  function providerConfig(provider,googleLimit=4){
    if(!PROVIDERS.has(provider))throw new TypeError('Unsupported navigation provider.');
    const raw=Number(googleLimit),limit=Number.isFinite(raw)?Math.trunc(raw):4;
    return {provider,batchSize:provider==='google'?Math.min(4,Math.max(1,limit)):1};
  }
  function normalizeStops(stops){
    if(!Array.isArray(stops))throw new TypeError('A route stop list is required.');
    const ids=new Set();
    return stops.map(stop=>{
      const id=String(stop?.id||'');
      if(!id||ids.has(id))throw new TypeError('Route stops need unique identifiers.');
      ids.add(id);
      const latitude=Number(stop.latitude??stop.lat),longitude=Number(stop.longitude??stop.lng);
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw new TypeError('Every route stop needs valid coordinates.');
      return {id,latitude,longitude,label:String(stop.label||'')};
    });
  }
  function createBatches(stops,provider,googleLimit=4){
    const config=providerConfig(provider,googleLimit),valid=normalizeStops(stops),batches=[];
    for(let index=0;index<valid.length;index+=config.batchSize)batches.push(valid.slice(index,index+config.batchSize));
    return {provider:config.provider,batchSize:config.batchSize,batches};
  }
  function buildUrl(stops,provider,googleLimit=4){
    const normalized=normalizeStops(stops),plan=createBatches(normalized,provider,googleLimit),batch=plan.batches[0],intents=root.RotaMotoNavigation;
    if(!batch?.length)throw new TypeError('A navigation batch is required.');
    if(provider!=='google'&&normalized.length!==1)throw new TypeError('This navigator accepts one stop per opening.');
    if(!intents)throw new Error('Navigation intent adapter is unavailable.');
    if(provider==='google')return intents.googleDirectionsUrl(batch.map(stop=>({lat:stop.latitude,lng:stop.longitude})));
    if(provider==='waze')return intents.wazeUrl({lat:batch[0].latitude,lng:batch[0].longitude});
    return intents.osmandGeoUri({lat:batch[0].latitude,lng:batch[0].longitude});
  }
  function routeSignature(route){return JSON.stringify({routeId:String(route?.routeId||''),revision:Number(route?.revision||0),sequence:(route?.sequence||[]).map(String)});}
  function createProgress(route,provider='osmand',googleLimit=4,now=Date.now()){
    const config=providerConfig(provider,googleLimit),sequence=(route?.sequence||[]).map(String);
    return {version:1,routeId:String(route?.routeId||''),routeRevision:Number(route?.revision||0),routeSequence:sequence,cursorDeliveryId:sequence[0]||null,provider:config.provider,batchSize:config.batchSize,status:sequence.length?'ready':'complete',openedAt:null,lastOpenedAt:null,lastAdvancedAt:null,updatedAt:now};
  }
  function isStale(progress,route){return !!progress&&routeSignature({routeId:progress.routeId,revision:progress.routeRevision,sequence:progress.routeSequence})!==routeSignature(route);}
  function rebaseProgress(progress,route,provider='osmand',googleLimit=4,now=Date.now()){
    const sequence=(route?.sequence||[]).map(String),oldSequence=progress?.routeSequence||[],oldCursor=progress?.cursorDeliveryId;
    let cursor=oldCursor&&sequence.includes(oldCursor)?oldCursor:null;
    if(!cursor&&oldCursor){const oldIndex=Math.max(0,oldSequence.indexOf(oldCursor));cursor=sequence[oldIndex]||sequence.slice(oldIndex).find(id=>sequence.includes(id))||null;}
    cursor=cursor||sequence[0]||null;
    const config=providerConfig(provider,googleLimit);
    return {version:1,routeId:String(route?.routeId||''),routeRevision:Number(route?.revision||0),routeSequence:sequence,cursorDeliveryId:cursor,provider:config.provider,batchSize:config.batchSize,status:cursor?'ready':'complete',openedAt:null,lastOpenedAt:null,lastAdvancedAt:progress?.lastAdvancedAt||null,updatedAt:now,reconciledAt:now};
  }
  function currentBatch(progress,activeStops,provider=progress?.provider||'osmand',googleLimit=4){
    if(!progress)return {batches:[],batchIndex:-1,batch:null,total:0,cursorDeliveryId:null};
    const active=normalizeStops(activeStops),plan=createBatches(active,provider,googleLimit),cursor=progress.cursorDeliveryId;
    if(!plan.batches.length)return {...plan,batchIndex:-1,batch:null,total:0,cursorDeliveryId:null};
    if(!cursor&&progress.status==='all_visited')return {...plan,batchIndex:plan.batches.length,batch:null,total:plan.batches.length,cursorDeliveryId:null};
    let stopIndex=active.findIndex(stop=>stop.id===cursor);
    if(stopIndex<0){const oldIndex=Math.max(0,progress.routeSequence.indexOf(cursor));stopIndex=active.findIndex(stop=>progress.routeSequence.indexOf(stop.id)>=oldIndex);if(stopIndex<0)stopIndex=active.length;}
    if(stopIndex>=active.length)return {...plan,batchIndex:plan.batches.length,batch:null,total:plan.batches.length,cursorDeliveryId:null};
    const batchIndex=Math.floor(stopIndex/plan.batchSize);
    return {...plan,batchIndex,batch:plan.batches[batchIndex],total:plan.batches.length,cursorDeliveryId:active[stopIndex].id};
  }
  function markOpened(progress,now=Date.now()){
    if(!progress?.cursorDeliveryId)throw new TypeError('There is no current navigation batch.');
    return {...progress,status:'opened',openedAt:progress.openedAt||now,lastOpenedAt:now,updatedAt:now};
  }
  function markBatchNavigated(progress,activeStops,provider=progress?.provider||'osmand',googleLimit=4,now=Date.now()){
    const current=currentBatch(progress,activeStops,provider,googleLimit);
    if(!current.batch?.length)throw new TypeError('There is no current navigation batch.');
    if(progress.status!=='opened')throw new TypeError('Open the navigation batch before marking it navigated.');
    const active=normalizeStops(activeStops),lastId=current.batch.at(-1).id,activeIndex=active.findIndex(stop=>stop.id===lastId),next=active.slice(activeIndex+1).find(stop=>progress.routeSequence.includes(stop.id))?.id||null;
    return {...progress,cursorDeliveryId:next,status:next?'ready':'all_visited',openedAt:null,lastAdvancedAt:now,updatedAt:now};
  }
  function reopenFirst(progress,activeStops,now=Date.now()){
    const active=normalizeStops(activeStops);
    return {...progress,cursorDeliveryId:active[0]?.id||null,status:active.length?'ready':'complete',openedAt:null,updatedAt:now};
  }
  const api=Object.freeze({providerConfig,normalizeStops,createBatches,buildUrl,routeSignature,createProgress,isStale,rebaseProgress,currentBatch,markOpened,markBatchNavigated,reopenFirst});
  root.RotaMotoNavigationWorkflow=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
