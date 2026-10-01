'use strict';
const DB_NAME='RotaMotoDB',DB_VERSION=5,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const defaults={minFee:7,costKm:.65,tiers:[{max:3,rate:2},{max:6,rate:1.8},{max:10,rate:1.6},{max:null,rate:1.5}],googleLimit:4,wazeLimit:1,restaurantName:'',restaurantPhone:'',restaurantNote:'',driverName:'',trackingEnabled:true,routeOrderIds:[],theme:'auto',accent:'#16a34a',mapTheme:'standard',autoWork:false,addressMode:'full',autoNext:true,autoReorder:true,dailyGoal:0,dayClosures:[],highContrast:false,arrivalRadiusM:10,language:'pt',oneHandedMode:false,pendingAlertMinutes:30,pausedAlertMinutes:15,alertDisplaySeconds:8,alertRepeatMinutes:30,returnChargeEnabled:true,returnChargeMode:'full',returnAutoLink:true};
let state={races:[],settings:structuredClone(defaults)},raceSearch='',historyPeriod='all',editingId=null,currentCoords=null,formMap=null,formMarker=null,map=null,mapMarkers=[],optimizedOrder=[],currentFilter='all',currentPeriod='today',customStart='',customEnd='',dbReady=null,currentWazeIndex=0,watchId=null,driverMarker=null,lastGps=null,routeFullscreen=false,selectedRouteIndex=0,workFocusIndex=0,driverAddress='',driverAddressCoords=null,driverAddressBusy=false,driverAddressSeq=0,saveRaceBusy=false,workOverviewUsed=false,lastMovementAt=null,alertState={pending:{},paused:{}},gpsTrackingEnabled=true;
let nominatimCache=new Map(),lastNominatimRequestAt=0,routeDurationSeconds=0;
const uuid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
async function normalizeMotoData(){
 const companyId=state.settings.companyId||state.settings.global?.companyId||'company_local';
 state.races=(state.races||[]).filter(Boolean).map(r=>({...r,id:r.id||RotaMotoContract.id('del'),companyId:r.companyId||companyId,deliveryId:r.deliveryId||r.id,canonicalStatus:RotaMotoContract.normalizeDeliveryStatus(r.status,'motoboy'),version:Number(r.version||r.sync?.version||1),updatedAt:r.updatedAt||r.completedAt||r.startedAt||r.createdAt||new Date().toISOString()}));
 for(const r of state.races)await tx('deliveries','readwrite',st=>st.put(RotaMotoContract.deliveryFromRace(r,companyId,state.settings.driverId||null)));
 await tx('meta','readwrite',st=>st.put({key:'contract',value:{protocolVersion:1,schemaVersion:1,companyId,app:'RotaMoto',updatedAt:new Date().toISOString()}}));
}
function recordDeliveryEvent(type,r,payload={}){return RotaMotoContract.event(type,'delivery',r.deliveryId||r.id,payload,{type:'driver',id:state.settings.driverId||null})}
function reviseRace(r,at=Date.now()){Object.assign(r,RotaMotoContract.revise(r,at));return r.updatedAt}function restoreRace(r,snapshot){for(const key of Object.keys(r))delete r[key];Object.assign(r,snapshot)}
const brl=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const num=v=>Number(String(v??'').replace(',','.'))||0;const localDateKey=value=>{const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};const localMonthKey=value=>localDateKey(value).slice(0,7);const today=()=>localDateKey(new Date());const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function toast(msg,type='ok',duration=2600){const t=$('#toast');t.textContent=msg;t.className='toast show '+type;clearTimeout(window._toast);window._toast=setTimeout(()=>t.classList.remove('show'),Math.max(800,duration))}
function runUiIntegrityCheck(){const required=['modal','modalTitle','modalBody','modalActions','raceList','saveRace','newRaceFromRaces','raceSearch'];const missing=required.filter(id=>!document.getElementById(id));if(missing.length)console.warn('Rota Moto: elementos ausentes',missing)}
function showTimedAlert(key,msg){const now=Date.now(),repeat=Math.max(1,num(state.settings.alertRepeatMinutes)||30)*60000;if(alertState[key]?.last&&now-alertState[key].last<repeat)return;alertState[key]={last:now};toast(msg,'error',Math.max(1000,(num(state.settings.alertDisplaySeconds)||8)*1000))}
function checkInactivityAlerts(){const now=Date.now(),pendingMin=Math.max(1,num(state.settings.pendingAlertMinutes)||30),open=state.races.filter(r=>r.status==='open'),started=state.races.filter(r=>['route','arrived'].includes(r.status));const stale=started.filter(r=>r.startedAt&&(now-new Date(r.startedAt).getTime())>=pendingMin*60000);if(stale.length){const r=stale[0];showTimedAlert('pending',`Corrida pendente: ${r.client||'entrega'} está em rota há mais de ${pendingMin} min.`)}else alertState.pending={};const pausedMin=Math.max(1,num(state.settings.pausedAlertMinutes)||15);if(open.length&&lastMovementAt&&now-lastMovementAt>=pausedMin*60000){showTimedAlert('paused',`Há ${open.length} corrida(s) aberta(s) e o motoboy está parado há mais de ${pausedMin} min.`)}else if(!open.length||!lastMovementAt||now-lastMovementAt<pausedMin*60000)alertState.paused={}}
setInterval(checkInactivityAlerts,15000)
function modal(title,body,actions=[{label:'Fechar'}]){const m=$('#modal');$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;const box=$('#modalActions');box.innerHTML='';box.hidden=!actions.length;actions.forEach(a=>{const b=document.createElement('button');b.className=a.primary?'primary':'secondary';b.textContent=a.label;b.onclick=async()=>{await a.onClick?.();if(a.close!==false)m.hidden=true};box.appendChild(b)});m.hidden=false}$('#modalClose').onclick=()=>$('#modal').hidden=true;
const LANG={pt:{"settingsTitle":"Ajustes","home":"Início","races":"Corridas","routes":"Rota","earnings":"Ganhos","settings":"Ajustes","today":"Hoje","week":"7 dias","month":"Mês","period":"Período","all":"Todas","open":"Abertas","route":"Em rota","arrived":"Cheguei","issue":"Problemas","done":"Finalizadas","cancelled":"Canceladas","search":"Buscar por pedido, cliente ou endereço","newRace":"Nova corrida","start":"Iniciar corrida","cancel":"Cancelar corrida","finish":"Finalizar corrida","problem":"Reportar problema","details":"Detalhes da entrega","observations":"Observações","items":"Itens do pedido","close":"Fechar","save":"Salvar ajustes","language":"Idioma","portuguese":"Português","spanish":"Español","english":"English","goal":"Meta do dia","goalUnset":"Defina uma meta nos Ajustes","cancelReason":"Motivo do cancelamento","cancelled":"Cancelada","gpsWaiting":"Aguardando GPS","gpsNear":"Você está no local da entrega.","gpsFar":"Você ainda não está no local da entrega.","finalOnlyNear":"A opção de finalizar será liberada quando você estiver a até {m} m do local.","cancelBeforeStart":"Antes de iniciar, você pode cancelar e registrar o motivo."},es:{"settingsTitle":"Ajustes","home":"Inicio","races":"Pedidos","routes":"Ruta","earnings":"Ganancias","settings":"Ajustes","today":"Hoy","week":"7 días","month":"Mes","period":"Período","all":"Todas","open":"Abiertas","route":"En ruta","arrived":"Llegué","issue":"Problemas","done":"Finalizadas","cancelled":"Canceladas","search":"Buscar por pedido, cliente o dirección","newRace":"Nuevo pedido","start":"Iniciar pedido","cancel":"Cancelar pedido","finish":"Finalizar pedido","problem":"Reportar problema","details":"Detalles de la entrega","observations":"Observaciones","items":"Artículos del pedido","close":"Cerrar","save":"Guardar ajustes","language":"Idioma","portuguese":"Português","spanish":"Español","english":"English","goal":"Meta del día","goalUnset":"Define una meta en Ajustes","cancelReason":"Motivo de cancelación","cancelled":"Cancelada","gpsWaiting":"Esperando GPS","gpsNear":"Estás en el lugar de entrega.","gpsFar":"Todavía no estás en el lugar de entrega.","finalOnlyNear":"Finalizar se habilitará cuando estés a {m} m del lugar.","cancelBeforeStart":"Antes de iniciar, puedes cancelar y registrar el motivo."},en:{"settingsTitle":"Settings","home":"Home","races":"Deliveries","routes":"Route","earnings":"Earnings","settings":"Settings","today":"Today","week":"7 days","month":"Month","period":"Period","all":"All","open":"Open","route":"On route","arrived":"Arrived","issue":"Problems","done":"Completed","cancelled":"Cancelled","search":"Search by order, customer or address","newRace":"New delivery","start":"Start delivery","cancel":"Cancel delivery","finish":"Finish delivery","problem":"Report a problem","details":"Delivery details","observations":"Notes","items":"Order items","close":"Close","save":"Save settings","language":"Language","portuguese":"Português","spanish":"Español","english":"English","goal":"Daily goal","goalUnset":"Set a goal in Settings","cancelReason":"Cancellation reason","cancelled":"Cancelled","gpsWaiting":"Waiting for GPS","gpsNear":"You are at the delivery location.","gpsFar":"You are not at the delivery location yet.","finalOnlyNear":"Finish will be enabled when you are within {m} m of the location.","cancelBeforeStart":"Before starting, you can cancel and record the reason."}};
function t(k,v={}){let x=(LANG[state.settings?.language||'pt']||LANG.pt)[k]||k;return Object.keys(v).reduce((a,n)=>a.replaceAll('{'+n+'}',v[n]),x)}
const TRANSLATIONS={pt:{},es:{"Ajustes":"Ajustes","Início":"Inicio","Corridas":"Pedidos","Rota":"Ruta","Ganhos":"Ganancias","HOJE":"HOY","Seu dia de entregas":"Tu día de entregas","Organize a rota, navegue e finalize cada entrega.":"Organiza la ruta, navega y finaliza cada entrega.","Nova corrida":"Nuevo pedido","Modo trabalho":"Modo trabajo","Ganhos e estatísticas":"Ganancias y estadísticas","Meta de hoje":"Meta de hoy","Ver todas":"Ver todas","Histórico completo":"Historial completo","Abertas":"Abiertas","Em rota":"En ruta","Finalizadas":"Finalizadas","Resumo financeiro":"Resumen financiero","Taxas recebidas":"Tasas recibidas","Entregas":"Entregas","Km":"Km","Média/entrega":"Media/entrega","Custo estimado":"Costo estimado","Resultado":"Resultado","Melhor dia":"Mejor día","Fechar dia":"Cerrar día","Fechamentos do dia":"Cierres del día","Hoje":"Hoy","Mês":"Mes","Período":"Período","Todas":"Todas","Cheguei":"Llegué","Problemas":"Problemas","Buscar por pedido, cliente ou endereço":"Buscar por pedido, cliente o dirección","Toque em uma corrida para trabalhar nela.":"Toca una entrega para trabajar en ella.","Nova corrida":"Nuevo pedido","Ler comanda":"Leer comanda","Use a câmera ou uma foto.":"Usa la cámara o una foto.","Tirar foto":"Tomar foto","Escolher da galeria":"Elegir de la galería","Preencher manualmente":"Rellenar manualmente","Foto capturada":"Foto capturada","Tirar outra foto":"Tomar otra foto","Número do pedido":"Número del pedido","Cliente":"Cliente","Telefone":"Teléfono","Valor do pedido":"Valor del pedido","Endereço de entrega":"Dirección de entrega","Bairro":"Barrio","Entrega urgente":"Entrega urgente","Observações":"Observaciones","Salvar corrida":"Guardar entrega","Excluir corrida":"Eliminar entrega","Cancelar":"Cancelar","Finalizar":"Finalizar","Problema":"Problema","Iniciar rota":"Iniciar ruta","Detalhes da entrega":"Detalles de la entrega","Finalizada":"Finalizada","Cancelada":"Cancelada","Motivo do cancelamento":"Motivo de cancelación","Itens do pedido":"Artículos del pedido","Meta do dia":"Meta del día","Defina uma meta nos Ajustes":"Define una meta en Ajustes","Salvar ajustes":"Guardar ajustes","Idioma":"Idioma","Português":"Português","Español":"Español","English":"English","Nenhum item registrado.":"No hay artículos registrados.","Nenhuma observação registrada.":"No hay observaciones registradas.","Motoboy":"Motoboy","Visual do aplicativo":"Visual de la aplicación","Rotas e navegação":"Rutas y navegación","Atendimento do restaurante":"Atención del restaurante","Dados e backup":"Datos y copia de seguridad","Salvar ajustes":"Guardar ajustes","Última corrida entregue":"Última entrega realizada","Nenhuma entrega finalizada ainda.":"Aún no hay entregas finalizadas.","Detalhes":"Detalles","entregues":"entregadas","canceladas":"canceladas","pendentes":"pendientes","resultado":"resultado","Modo de uso com uma mão":"Modo de uso con una mano","Deixa os principais controles mais fáceis de alcançar no celular.":"Facilita el acceso a los controles principales en el móvil.","Diagnóstico: pronto para verificar.":"Diagnóstico: listo para verificar.","Verificar aplicativo":"Verificar aplicación","Diagnóstico concluído.":"Diagnóstico completado.","Configuração atualizada automaticamente.":"Configuración actualizada automáticamente."},en:{"Ajustes":"Settings","Início":"Home","Corridas":"Deliveries","Rota":"Route","Ganhos":"Earnings","HOJE":"TODAY","Seu dia de entregas":"Your delivery day","Organize a rota, navegue e finalize cada entrega.":"Organize your route, navigate and finish each delivery.","Nova corrida":"New delivery","Modo trabalho":"Work mode","Ganhos e estatísticas":"Earnings & stats","Meta de hoje":"Today's goal","Ver todas":"View all","Histórico completo":"Full history","Abertas":"Open","Em rota":"On route","Finalizadas":"Completed","Resumo financeiro":"Financial summary","Taxas recebidas":"Delivery fees","Entregas":"Deliveries","Km":"Km","Média/entrega":"Average/delivery","Custo estimado":"Estimated cost","Resultado":"Result","Melhor dia":"Best day","Fechar dia":"Close day","Fechamentos do dia":"Daily closures","Hoje":"Today","Mês":"Month","Período":"Period","Todas":"All","Cheguei":"Arrived","Problemas":"Problems","Buscar por pedido, cliente ou endereço":"Search by order, customer or address","Toque em uma corrida para trabalhar nela.":"Tap a delivery to work on it.","Ler comanda":"Read receipt","Use a câmera ou uma foto.":"Use the camera or a photo.","Tirar foto":"Take photo","Escolher da galeria":"Choose from gallery","Preencher manualmente":"Fill manually","Foto capturada":"Photo captured","Tirar outra foto":"Take another photo","Número do pedido":"Order number","Cliente":"Customer","Telefone":"Phone","Valor do pedido":"Order value","Endereço de entrega":"Delivery address","Bairro":"Neighborhood","Entrega urgente":"Urgent delivery","Observações":"Notes","Salvar corrida":"Save delivery","Excluir corrida":"Delete delivery","Cancelar":"Cancel","Finalizar":"Finish","Problema":"Problem","Iniciar rota":"Start route","Detalhes da entrega":"Delivery details","Finalizada":"Completed","Cancelada":"Cancelled","Motivo do cancelamento":"Cancellation reason","Itens do pedido":"Order items","Meta do dia":"Daily goal","Defina uma meta nos Ajustes":"Set a goal in Settings","Salvar ajustes":"Save settings","Idioma":"Language","Português":"Portuguese","Español":"Spanish","English":"English","Motoboy":"Rider","Visual do aplicativo":"App appearance","Rotas e navegação":"Routes & navigation","Atendimento do restaurante":"Restaurant support","Dados e backup":"Data & backup","Nenhum item registrado.":"No order items recorded.","Nenhuma observação registrada.":"No notes recorded."}};
function applyLanguage(){const lang=state.settings?.language||'pt';document.documentElement.lang=lang==='pt'?'pt-BR':lang;const map=TRANSLATIONS[lang]||{};const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode()){if(!n.parentElement||['SCRIPT','STYLE'].includes(n.parentElement.tagName))continue;const source=n.__sourceText??n.nodeValue;if(n.__sourceText==null)n.__sourceText=source;let out=source;for(const [a,b] of Object.entries(map).sort((x,y)=>y[0].length-x[0].length))out=out.split(a).join(b);n.nodeValue=out}document.querySelectorAll('[placeholder]').forEach(el=>{const source=el.dataset.sourcePlaceholder??el.getAttribute('placeholder');if(el.dataset.sourcePlaceholder==null)el.dataset.sourcePlaceholder=source;el.setAttribute('placeholder',map[source]||source)});document.querySelectorAll('[aria-label]').forEach(el=>{const source=el.dataset.sourceAria??el.getAttribute('aria-label');if(el.dataset.sourceAria==null)el.dataset.sourceAria=source;el.setAttribute('aria-label',map[source]||source)});const lm=$('#languageMode');if(lm)lm.value=lang}
function openDB(){
 if(dbReady)return dbReady;
 let opening;
 opening=new Promise((resolve,reject)=>{
  let settled=false;
  const fail=error=>{if(settled)return;settled=true;reject(error)};
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=()=>{const d=request.result;if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'key'});if(!d.objectStoreNames.contains('races')){const s=d.createObjectStore('races',{keyPath:'id'});s.createIndex('status','status');s.createIndex('createdAt','createdAt')}for(const name of ['deliveries','deliveryEvents','locations','proofs','earnings','outbox','inbox','tombstones','syncState'])if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath:'id'});};
  request.onsuccess=()=>{const connection=request.result;if(settled){connection.close();return}settled=true;connection.onversionchange=()=>{connection.close();if(dbReady===opening)dbReady=null};resolve(connection)};
  request.onerror=()=>fail(request.error||new Error('Falha ao abrir o banco local'));
  request.onblocked=()=>fail(new Error('A atualização do banco local está bloqueada por outra aba.'));
 }).catch(error=>{if(dbReady===opening)dbReady=null;throw error});
 dbReady=opening;
 return opening;
}
async function tx(store,mode,fn){const d=await openDB();return new Promise((res,rej)=>{let t,out;try{t=d.transaction(store,mode);out=fn(Array.isArray(store)?t:t.objectStore(store),t)}catch(e){try{t?.abort()}catch(_){}rej(e);return}t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error||new Error('Falha no banco local'));t.onabort=()=>rej(t.error||new Error('Transação local abortada'))})}
async function persistOnly({deliveryEvent}={}){
  const snapshot={races:state.races,settings:state.settings};
  const stores=['races','deliveries','meta',...(deliveryEvent?['deliveryEvents','outbox']:[])];
  await tx(stores,'readwrite',(t)=>{
    const races=t.objectStore('races'),deliveries=t.objectStore('deliveries');
    races.clear();deliveries.clear();
    state.races.forEach(r=>races.put(r));
    state.races.filter(r=>!r.deleted).forEach(r=>deliveries.put(RotaMotoContract.deliveryFromRace(r,state.settings.companyId||'company_local',state.settings.driverId||null)));
    t.objectStore('meta').put({key:'settings',value:state.settings});
    if(deliveryEvent){t.objectStore('deliveryEvents').put(deliveryEvent);t.objectStore('outbox').put({...deliveryEvent,id:deliveryEvent.eventId,status:'pending'})}
  });
  try{localStorage.setItem('rotaMoto.backup',JSON.stringify(snapshot))}catch(e){console.warn('localStorage backup failed',e)}
}
async function loadDB(){
  try{
    const races=await tx('races','readonly',s=>new Promise((resolve,reject)=>{const q=s.getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)}));
    const meta=await tx('meta','readonly',s=>new Promise((resolve,reject)=>{const q=s.get('settings');q.onsuccess=()=>resolve(q.result?.value||null);q.onerror=()=>reject(q.error)}));
    if(races.length||meta){state.races=Array.isArray(races)?races:[];state.settings=normalizeSettings(meta||{});applyTheme();return}
  }catch(e){console.warn('IndexedDB load failed',e)}
  try{const raw=localStorage.getItem('rotaMoto.backup');if(raw){const x=JSON.parse(raw);if(Array.isArray(x.races)){state.races=x.races;state.settings=normalizeSettings(x.settings||{});applyTheme();await persistOnly();return}}}catch(e){console.warn('localStorage load failed',e)}
  try{const legacy=localStorage.getItem('motoboy.db.v2');if(legacy){const x=JSON.parse(legacy);if(Array.isArray(x.races)){state.races=x.races;state.settings=normalizeSettings(x.settings||{});applyTheme();await persistOnly();return}}}catch(e){console.warn('legacy migration failed',e)}
}
async function saveAll(opts={}){await persistOnly(opts);renderAll();if(opts.recalcRoute){try{return await refreshActiveRoute()}catch(err){console.warn('route refresh failed after local save',err);toast('Dados salvos; não foi possível atualizar a rota.','error')}}}
async function buildSyncPacket(){
  const companyId=state.settings?.companyId||state.settings?.global?.companyId||'company_local';
  const deviceId=state.settings?.deviceId||state.settings?.driverId||null;
  const [deliveryEvents,locations,proofs,earnings,tombstones]=await Promise.all([
    tx('deliveryEvents','readonly',s=>new Promise((resolve,reject)=>{const q=s.getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)})),
    tx('locations','readonly',s=>new Promise((resolve,reject)=>{const q=s.getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)})),
    tx('proofs','readonly',s=>new Promise((resolve,reject)=>{const q=s.getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)})),
    tx('earnings','readonly',s=>new Promise((resolve,reject)=>{const q=s.getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)})),
    tx('tombstones','readonly',s=>new Promise((resolve,reject)=>{const q=s.getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)}))
  ]);
  const deliveries=state.races.filter(r=>!r.deleted).map(r=>RotaMotoContract.deliveryFromRace(r,companyId,state.settings.driverId||null));
  const pendingEvents=deliveryEvents.filter(e=>e && !e.acknowledgedAt);
  const packet=RotaMotoContract.packet({companyId,deviceId,app:'RotaMoto',events:[],deliveries,drivers:[],routes:[],locationUpdates:locations,deliveryEvents:pendingEvents,proofs,earnings,tombstones});
  packet.data.races=state.races;
  packet.data.settings={driverId:state.settings?.driverId||null};
  return packet;
}
function downloadSyncPacket(packet){
  const blob=new Blob([JSON.stringify(packet,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`rotamoto-sync-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
async function validateRestaurantPacket(packet={}){const p=packet?.data||{};const errors=[];if(packet?.protocol!=='rotamoto-sync')errors.push('Protocolo de sincronização inválido.');if(Number(packet?.protocolVersion)!==1)errors.push('Versão de protocolo não suportada.');if(Number(packet?.schemaVersion)!==1)errors.push('Versão de esquema não suportada.');const companyId=state.settings.companyId||'company_local';if(packet.companyId&&packet.companyId!==companyId)errors.push('O pacote pertence a outra empresa.');if(!packet.packetId)errors.push('O pacote não possui packetId.');if(!Array.isArray(p.deliveries))errors.push('O pacote não contém entregas válidas.');return {valid:!errors.length,errors,companyId,packetId:packet.packetId||null};}
async function receiveRestaurantPacket(packet={}){
 try{
  const check=await validateRestaurantPacket(packet);if(!check.valid)throw new Error(check.errors.join(' '));
  const receipts=await tx('inbox','readonly',s=>new Promise((resolve,reject)=>{const q=s.getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)}));
  if(receipts.some(x=>x.packetId===check.packetId))return {duplicate:true,received:0,updated:0,packetId:check.packetId};
  const incoming=packet.data.deliveries||[];const orders=Array.isArray(packet.data.orders)?packet.data.orders:[];let received=0,updated=0;
  for(const raw of incoming){if(!raw?.id||raw.companyId&&raw.companyId!==check.companyId)continue;const current=state.races.find(r=>r.deliveryId===raw.id||r.id===raw.id);if(!current||!RotaMotoContract.isNewer({...raw,updatedAt:raw.updatedAt||new Date().toISOString()},current))continue;const status=RotaMotoContract.normalizeDeliveryStatus(raw.status,'restaurante');RotaMotoContract.assertTransition(current.canonicalStatus||RotaMotoContract.normalizeDeliveryStatus(current.status,'motoboy'),status)}
  for(const raw of incoming){
   if(!raw?.id)continue;
   if(raw.companyId&&raw.companyId!==check.companyId)continue;
   const current=state.races.find(r=>r.deliveryId===raw.id||r.id===raw.id);
   const normalizedIncoming={...raw,companyId:raw.companyId||check.companyId,deliveryId:raw.id,updatedAt:raw.updatedAt||new Date().toISOString(),version:Number(raw.version||1)};
   if(current&&!RotaMotoContract.isNewer(normalizedIncoming,current))continue;
   const status=RotaMotoContract.normalizeDeliveryStatus(raw.status,'restaurante');
   const order=orders.find(o=>o.id===raw.orderId)||{};
   const next=RotaMotoContract.raceFromDelivery({...normalizedIncoming,status},order,current||{});
   await tx('races','readwrite',s=>s.put(next));
   await tx('deliveries','readwrite',s=>s.put(normalizedIncoming));
   const idx=state.races.findIndex(r=>r.id===next.id);
   if(idx>=0)state.races[idx]=next;else state.races.push(next);
   received += current?0:1; updated += current?1:0;
  }
  const tombstones=Array.isArray(packet.data.tombstones)?packet.data.tombstones:[];
  for(const tomb of tombstones){
   if(!tomb?.id||tomb.companyId&&tomb.companyId!==check.companyId)continue;
   if(tomb.store&&tomb.store!=='deliveries')continue;
   const current=state.races.find(r=>r.deliveryId===tomb.id||r.id===tomb.id);
   if(current&&!RotaMotoContract.isNewer(tomb,current))continue;
   const delivery={...(current||{}),id:tomb.id,companyId:check.companyId,deleted:true,deletedAt:tomb.deletedAt||Date.now(),updatedAt:tomb.updatedAt||new Date().toISOString(),version:Number(tomb.version||0),canonicalStatus:'CANCELLED',status:'cancelled'};
   await tx('deliveries','readwrite',s=>s.put(delivery));
   const race={...(current||delivery),id:current?.id||tomb.id,deliveryId:tomb.id,deleted:true,status:'cancelled',canonicalStatus:'CANCELLED',updatedAt:delivery.updatedAt,version:delivery.version};
   await tx('races','readwrite',s=>s.put(race));
   const idx=state.races.findIndex(r=>r.id===race.id);if(idx>=0)state.races[idx]=race;else state.races.push(race);
  }
  await tx('inbox','readwrite',s=>s.put({id:check.packetId,packetId:check.packetId,receivedAt:Date.now(),sourceDeviceId:packet.deviceId||null,status:'processed'}));
  await persistOnly();renderAll();toast(`Recebidas ${received} nova(s) e ${updated} atualizada(s).`,'success');return {duplicate:false,received,updated,packetId:check.packetId};
 }catch(e){console.warn('Falha ao receber pacote do Restaurante',e);throw new Error(e.message||'Não foi possível receber o pacote do Restaurante.');}
}
async function stageRestaurantPacket(file){if(!file)return;try{const packet=JSON.parse(await file.text());const check=await validateRestaurantPacket(packet);if(!check.valid)throw new Error(check.errors.join(' '));const ok=confirm(`Pacote do Restaurante\\n\\n${packet.data.deliveries.length} entrega(s)\\nPacote: ${check.packetId}\\n\\nImportar agora?`);if(ok)await receiveRestaurantPacket(packet)}catch(e){toast(e.message||'Pacote inválido.','error')}}



function normalizeSettings(s={}){const x={...defaults,...s};x.tiers=Array.isArray(s?.tiers)&&s.tiers.length?s.tiers:structuredClone(defaults.tiers);x.routeOrderIds=Array.isArray(s?.routeOrderIds)?s.routeOrderIds:[];x.googleLimit=Math.min(4,Math.max(1,Math.round(num(x.googleLimit||4))));x.wazeLimit=1;x.theme=['light','dark','auto'].includes(x.theme)?x.theme:'auto';x.accent=/^#[0-9a-f]{6}$/i.test(x.accent||'')?x.accent:defaults.accent;x.mapTheme='standard';x.addressMode=['full','short'].includes(x.addressMode)?x.addressMode:'full';x.autoNext=x.autoNext!==false;x.autoReorder=x.autoReorder!==false;x.dailyGoal=Math.max(0,num(x.dailyGoal));x.dayClosures=Array.isArray(x.dayClosures)?x.dayClosures:[];x.highContrast=!!x.highContrast;x.autoWork=!!x.autoWork;x.arrivalRadiusM=Math.min(200,Math.max(1,Math.round(num(x.arrivalRadiusM||10))));x.language=['pt','es','en'].includes(x.language)?x.language:'pt';x.oneHandedMode=!!x.oneHandedMode;x.pendingAlertMinutes=Math.max(1,Math.round(num(x.pendingAlertMinutes||30)));x.pausedAlertMinutes=Math.max(1,Math.round(num(x.pausedAlertMinutes||15)));x.alertDisplaySeconds=Math.max(1,Math.round(num(x.alertDisplaySeconds||8)));x.alertRepeatMinutes=Math.max(1,Math.round(num(x.alertRepeatMinutes||30)));x.returnChargeEnabled=x.returnChargeEnabled!==false;x.returnChargeMode=['full','half','zero'].includes(x.returnChargeMode)?x.returnChargeMode:'full';x.returnAutoLink=x.returnAutoLink!==false;return x}
function applyTheme(){const s=state.settings||defaults;const root=document.documentElement;const mode=s.theme||'auto';root.dataset.theme=mode;root.style.setProperty('--accent',s.accent||defaults.accent);root.style.setProperty('--accent2',s.accent||defaults.accent);root.style.setProperty('--accentSwatch',s.accent||defaults.accent);root.classList.toggle('high-contrast',!!s.highContrast);const resolved=mode==='dark'?'dark':mode==='light'?'light':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');root.style.colorScheme=resolved;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=resolved==='dark'?'#080d16':'#ffffff'}
function addressDisplay(){return state.settings.addressMode==='short'?(driverAddress||'Endereço não disponível'):driverAddress}
function distancePendingText(r,first=false){if(r?.distanceKm!=null)return `${r.distanceKm.toFixed(1).replace('.',',')} km`;return first?'Distância pendente — aguardando localização do motoboy':'Distância pendente — aguardando cálculo pelas ruas'}

function syncRouteOrder(){state.settings.routeOrderIds=optimizedOrder.map(r=>r.id)}
function restoreRouteOrder(){const ids=state.settings.routeOrderIds||[], by=new Map(routeRaces().map(r=>[r.id,r])), out=ids.map(id=>by.get(id)).filter(Boolean);routeRaces().forEach(r=>{if(!out.some(x=>x.id===r.id))out.push(r)});optimizedOrder=out;selectedRouteIndex=Math.min(selectedRouteIndex,Math.max(0,out.length-1));return out}
async function recalcAllFees(){state.races.forEach(r=>{if(r.distanceKm!=null)r.deliveryFee=calcFeeForRace(r)});await persistOnly();renderAll()}
async function refreshActiveRoute(){
  const rs=routeRaces();
  if(!rs.length){optimizedOrder=[];state.settings.routeOrderIds=[];await persistOnly();renderAll();return {ok:false,reason:'empty'}}
  restoreRouteOrder();
  if(!lastGps){try{const p=await getPosition();setDriverPosition(p.coords.latitude,p.coords.longitude,p.coords.accuracy)}catch{}}
  renderRouteOrder(optimizedOrder);renderRouteGroups();renderRouteInfo(optimizedOrder);evaluateManualOrder();renderRoutePreview(optimizedOrder);
  const result=await requestRoadDistances(optimizedOrder);
  return result;
}
function calcFeeForRace(r){const base=calcFee(r?.distanceKm);if(r?.deliveryType!=='return'&&r?.deliveryType!=='exchange'&&r?.deliveryType!=='pickup')return base;if(state.settings.returnChargeEnabled===false)return 0;if(state.settings.returnChargeMode==='zero')return 0;if(state.settings.returnChargeMode==='half')return base*.5;return base}function calcFee(km){km=Math.max(0,num(km));let prev=0,fee=0;for(const t of [...state.settings.tiers].sort((a,b)=>(a.max??Infinity)-(b.max??Infinity))){const max=t.max==null?Infinity:num(t.max);if(km<=prev)break;fee+=Math.max(0,Math.min(km,max)-prev)*num(t.rate);prev=max;if(max===Infinity)break}return Math.max(num(state.settings.minFee),fee)}function calcCost(km){return Math.max(0,num(km))*num(state.settings.costKm)}
function formatDuration(sec){sec=Math.max(0,Math.round(num(sec)));if(!sec)return '—';const h=Math.floor(sec/3600),m=Math.round((sec%3600)/60);return h?`${h}h ${m}min`:`${m} min`}
function todayRows(){return state.races.filter(r=>r.status==='done'&&localDateKey(r.completedAt)===today())}
function accountingKmForRace(r){const gps=gpsKmForRace(r);return gps>=0.05?gps:Math.max(0,num(r?.distanceKm))}
function financialSnapshot(rows){const list=Array.isArray(rows)?rows:[];const fee=list.reduce((a,r)=>a+(r.deliveryFee!=null?num(r.deliveryFee):r.distanceKm!=null?calcFeeForRace(r):0),0);const realKm=list.reduce((a,r)=>a+gpsKmForRace(r),0);const routeKm=list.reduce((a,r)=>a+Math.max(0,num(r.distanceKm)),0);const km=list.reduce((a,r)=>a+accountingKmForRace(r),0);const cost=calcCost(km);return {rows:list,fee,realKm,routeKm,km,cost,profit:fee-cost,hasReal:list.some(r=>gpsKmForRace(r)>=0.05),mixed:list.some(r=>gpsKmForRace(r)<0.05&&num(r.distanceKm)>0)&&list.some(r=>gpsKmForRace(r)>=0.05)}}
function deliveryMargin(r){return num(r.deliveryFee)-calcCost(accountingKmForRace(r))}
function profitabilityLabel(r){if(r.distanceKm==null||r.deliveryFee==null)return '';const margin=deliveryMargin(r);return margin<0?'Custo acima da taxa':margin<calcCost(r.distanceKm)*.25?'Margem apertada':''}
function distance(a,b){const R=6371,la=(b.lat-a.lat)*Math.PI/180,lo=(b.lng-a.lng)*Math.PI/180,q=Math.sin(la/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(lo/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function activeGpsRace(){return state.races.find(r=>r.status==='route'||r.status==='arrived')||null}
function gpsKmForRace(r){return r&&Number.isFinite(num(r.gpsDistanceKm))&&num(r.gpsDistanceKm)>0?num(r.gpsDistanceKm):0}
function earningsKmForRows(rows){return rows.reduce((a,r)=>a+gpsKmForRace(r),0)}
function routeKmForRows(rows){return rows.reduce((a,r)=>a+num(r.distanceKm),0)}
function hasRealKm(rows){return rows.some(r=>gpsKmForRace(r)>=0.05)}async function fetchJSON(url,ms=7000){const c=new AbortController(),id=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok){let detail='HTTP '+r.status;try{const t=await r.text();if(t)detail+=' — '+t.slice(0,180)}catch{}throw Error(detail)}return await r.json()}catch(e){if(e?.name==='AbortError')throw Error('Tempo esgotado ao acessar o serviço.');throw e}finally{clearTimeout(id)}}
function normalizeText(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim()}
function parseAddressQuery(raw){
  let q=String(raw||'').replace(/\s+/g,' ').trim();
  const postal=(q.match(/\b\d{5}-?\d{3}\b/)||[])[0]?.replace('-','')||'';
  const stateMatch=q.match(/(?:-|,)\s*([A-Z]{2})\b(?:\s*-?\s*CEP)?/i); const state=stateMatch?.[1]?.toUpperCase()||'';
  let street='',housenumber='';
  const m=q.match(/\b(rua|avenida|av\.?|alameda|travessa|estrada|praca|praça|rodovia|r\.)\s+(.+?)\s*,?\s*(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\b/i);
  if(m){street=(m[1].replace(/\.$/,'')+' '+m[2]).trim();housenumber=m[3]}
  else {const n=q.match(/\b(.+?)\s+(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\b/);if(n){street=n[1].trim();housenumber=n[2]}}
  street=street.replace(/,\s*$/,'').trim();
  const cleaned=q.replace(/\b(comp|complemento|apto|apartamento|bloco|casa)\s*[:#-]?\s*[^,;]+/gi,'').replace(/\b\d{5}-?\d{3}\b/,'').replace(/\s+/g,' ').trim();
  const cityMatch=cleaned.match(/,\s*([^,]+?)\s*-\s*[A-Z]{2}\b/i); const city=cityMatch?.[1]?.trim()||'';
  const neighborhoodMatch=cleaned.match(/\b(?:bairro|b\.)\s*[:\-]?\s*([^,]+?)(?=,|\s+-\s*[A-Z]{2}\b|$)/i); const neighborhood=neighborhoodMatch?.[1]?.trim()||'';
  return {street,housenumber,city,state,postalcode:postal,neighborhood};
}
function buildAddressQueries(raw){
  const p=parseAddressQuery(raw);
  const city=$('#fCity')?.value.trim()||p.city||'';
  const state=$('#fState')?.value.trim()||p.state||'';
  const postalcode=($('#fPostalcode')?.value.trim()||p.postalcode||'').replace(/\D/g,'');
  const neighborhood=$('#fNeighborhood')?.value.trim()||p.neighborhood||'';
  const streetName=p.street?String(p.street).replace(/^rua\s+/i,'').trim():'';
  const street=p.street?`${p.street}${p.housenumber?' '+p.housenumber:''}`:String(raw||'').trim();
  const variants=[...new Set([street, streetName&&p.housenumber?`${streetName} ${p.housenumber}`:'', streetName&&p.housenumber?`Rua ${streetName.replace(/\bMattos\b/i,'Matos')} ${p.housenumber}`:''].filter(Boolean))];
  const queries=[]; const add=(kind,params)=>queries.push({kind,params});
  for(const v of variants){
    const params=new URLSearchParams({format:'jsonv2',addressdetails:'1',limit:'8',countrycodes:'br'});
    params.set('street',v); if(city)params.set('city',city); if(state)params.set('state',state); if(postalcode)params.set('postalcode',postalcode);
    add('structured',params);
    const relaxed=new URLSearchParams({format:'jsonv2',addressdetails:'1',limit:'8',countrycodes:'br',q:`${v}${neighborhood?', '+neighborhood:''}${city?', '+city:''}${state?', '+state:''}, Brasil`});
    add('freeform',relaxed);
  }
  if(postalcode){
    add('postal',new URLSearchParams({format:'jsonv2',addressdetails:'1',limit:'8',countrycodes:'br',q:postalcode+', Brasil'}));
  }
  return {queries,parts:{street,housenumber:p.housenumber,city,state,postalcode,neighborhood}};
}
async function waitNominatim(){
  const wait=Math.max(0,1100-(Date.now()-lastNominatimRequestAt));
  if(wait)await new Promise(r=>setTimeout(r,wait));
  lastNominatimRequestAt=Date.now();
}
async function nominatimSearch(params){
  const key=params.toString();
  if(nominatimCache.has(key))return nominatimCache.get(key);
  await waitNominatim();
  const rs=await fetchJSON('https://nominatim.openstreetmap.org/search?'+key,10000);
  const out=Array.isArray(rs)?rs:[];
  nominatimCache.set(key,out);
  return out;
}
function canonicalAddress(r){
  const a=r?.address||{};
  const road=a.road||a.pedestrian||a.footway||a.residential||a.cycleway||a.path||'';
  const house=a.house_number||'';
  const neighborhood=a.suburb||a.neighbourhood||a.quarter||'';
  const city=a.city||a.town||a.municipality||a.village||'';
  const state=a.state_code||a.state||'';
  const cep=(a.postcode||'').replace(/\s+/g,'');
  const first=[road&&house?`${road}, ${house}`:road||r?.name||''].filter(Boolean).join('');
  const parts=[first,neighborhood,city&&state?`${city} - ${state}`:city||state,cep].filter(Boolean);
  return parts.join(', ');
}
async function geocode(q){
  if(q.trim().length<4)throw Error('Digite um endereço mais completo.');
  const {queries}=buildAddressQueries(q); let all=[]; let lastError=null;
  for(const item of queries.slice(0,3)){
    try{
      const rs=await nominatimSearch(item.params);
      if(Array.isArray(rs)&&rs.length) all.push(...rs);
      if(all.length>=8)break;
    }catch(e){lastError=e}
  }
  const seen=new Set();
  all=all.filter(r=>{const k=`${r.osm_type||''}:${r.osm_id||''}:${r.lat}:${r.lon}`;if(seen.has(k))return false;seen.add(k);return true});
  if(!all.length&&lastError)throw lastError;
  return all.slice(0,10);
}
async function roadDistancesViaOSRM(points){
  if(!Array.isArray(points)||points.length<2)throw Error('São necessários pelo menos dois pontos.');
  const coords=points.map(p=>`${Number(p[0])},${Number(p[1])}`).join(';');
  const urls=[
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=false`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=false&steps=false`
  ];
  let errors=[];
  for(const url of urls){
    try{
      const data=await fetchJSON(url,15000);
      if(data?.code==='Ok'&&data.routes?.[0])return data.routes[0];
      errors.push(data?.message||data?.code||'Servidor sem cálculo');
    }catch(e){errors.push(e?.message||String(e))}
  }
  throw Error(errors.filter(Boolean).join(' | ')||'Serviços de distância indisponíveis');
}
async function calculateRoadDistances(rs){
  const list=Array.isArray(rs)?rs:[];
  const request=++roadDistanceSeq;
  if(!list.length){routeDurationSeconds=0;return {ok:false,reason:'empty'}};
  const points=lastGps?[[lastGps.lng,lastGps.lat],...list.map(r=>[r.lng,r.lat])]:list.map(r=>[r.lng,r.lat]);
  if(points.length<2){
    list.forEach(r=>{r.distanceKm=null;r.deliveryFee=null});
    await persistOnly();renderRouteInfo(list);renderRouteOrder(list);renderRouteFocus(list);
    setRouteStatus('Ative o GPS para calcular a distância até a primeira entrega.');
    return {ok:false,reason:'gps-required'};
  }
  setRouteStatus('Calculando as distâncias pelas ruas…');
  const run=async()=>{
    if(request!==roadDistanceSeq)return {ok:false,reason:'stale'};
    try{
      const route=await roadDistancesViaOSRM(points);
      if(request!==roadDistanceSeq)return {ok:false,reason:'stale'};
      routeDurationSeconds=route.duration||0;const legs=route.legs||[];
      list.forEach((r,i)=>{
        const leg=lastGps?legs[i]:legs[i-1];
        r.distanceKm=leg?.distance!=null?leg.distance/1000:null;
        r.deliveryFee=r.distanceKm!=null?calcFeeForRace(r):null;
      });
      await persistOnly();
      if(request!==roadDistanceSeq)return {ok:false,reason:'stale'};
      renderRouteInfo(list);renderRouteOrder(list);renderRouteFocus(list);renderRaces();
      setRouteStatus('Distâncias pelas ruas atualizadas.');
      return {ok:true,totalDistance:route.distance||0,totalDuration:route.duration||0};
    }catch(e){
      if(request!==roadDistanceSeq)return {ok:false,reason:'stale'};
      routeDurationSeconds=0;list.forEach(r=>{r.distanceKm=null;r.deliveryFee=null});
      await persistOnly();renderRouteInfo(list);renderRouteOrder(list);renderRouteFocus(list);renderRaces();
      const detail=e?.message?` ${e.message.slice(0,180)}`:'';
      setRouteStatus('Não foi possível calcular as distâncias pelas ruas.'+detail);
      return {ok:false,reason:'distance-unavailable',error:e?.message||'unknown'};
    }
  };
  roadDistanceQueue=roadDistanceQueue.then(run,run);
  return roadDistanceQueue;
}
function requestRoadDistances(rs){return calculateRoadDistances(rs)}
async function reverseAddress(lat,lng){const key=`${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;if(nominatimCache.has('reverse:'+key))return nominatimCache.get('reverse:'+key);await waitNominatim();const r=await fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,10000);nominatimCache.set('reverse:'+key,r);return r}
function fillAddressParts(a){if(!a)return;$('#fNeighborhood').value=a.suburb||a.neighbourhood||a.quarter||$('#fNeighborhood').value||'';if($('#fCity'))$('#fCity').value=a.city||a.town||a.municipality||a.village||$('#fCity').value||'';if($('#fState'))$('#fState').value=a.state_code||a.state||$('#fState').value||'';if($('#fPostalcode'))$('#fPostalcode').value=(a.postcode||$('#fPostalcode').value||'').replace(/\s+/g,'')}
function osmTiles(mapInstance){return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(mapInstance)}
function setFormMap(lat,lng,zoom=17){currentCoords={lat:+lat,lng:+lng};if(!formMap){formMap=L.map('formMap').setView([lat,lng],zoom);osmTiles(formMap);formMarker=L.marker([lat,lng],{draggable:true}).addTo(formMap);formMarker.on('dragend',async()=>{const p=formMarker.getLatLng();currentCoords={lat:p.lat,lng:p.lng};$('#coordStatus').textContent='Pino ajustado manualmente';try{const r=await reverseAddress(p.lat,p.lng);if(r.display_name)$('#fAddress').value=r.display_name;fillAddressParts(r.address)}catch{}})}else{formMap.setView([lat,lng],zoom);formMarker.setLatLng([lat,lng])}$('#coordStatus').textContent='Localização confirmada no mapa';setTimeout(()=>formMap.invalidateSize(),60)}
async function searchAddress(){const box=$('#addressCandidates');box.hidden=false;box.innerHTML='<div class="loading">Buscando endereços…</div>';try{const rs=await geocode($('#fAddress').value);if(!rs.length){box.innerHTML='<div class="loading">Nenhum resultado. Tente número, bairro, cidade ou CEP.</div>';return}box.innerHTML=rs.map((r,i)=>`<button class="candidate" data-i="${i}"><b>${esc(canonicalAddress(r)||r.name||r.display_name.split(',')[0])}</b><small>${esc(r.display_name)}</small></button>`).join('');rs.forEach((r,i)=>box.querySelector(`[data-i="${i}"]`).onclick=()=>{setFormMap(+r.lat,+r.lon);const ca=canonicalAddress(r);if(ca)$('#fAddress').value=ca;fillAddressParts(r.address);box.hidden=true;toast('Localização selecionada. Confira o pino.')})}catch{box.innerHTML='<div class="loading">Não foi possível buscar agora. Verifique a internet.</div>'}}
function getPosition(){return new Promise((res,rej)=>{if(!navigator.geolocation)return rej(Error());navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:8000,maximumAge:10000})})}async function useGPS(){try{const p=await getPosition();setFormMap(p.coords.latitude,p.coords.longitude);try{const r=await reverseAddress(p.coords.latitude,p.coords.longitude);if(r.display_name)$('#fAddress').value=r.display_name;fillAddressParts(r.address)}catch{}toast('GPS localizado. Confira o endereço.')}catch{toast('Não foi possível obter o GPS.','error')}}
function initRoutePreviewMap(){
  const el=$('#routePreviewMap');if(!el||typeof L==='undefined')return null;
  if(!routePreviewMap){routePreviewMap=L.map('routePreviewMap',{zoomControl:true}).setView([-23.5505,-46.6333],12);osmTiles(routePreviewMap)}
  setTimeout(()=>routePreviewMap?.invalidateSize(),50);return routePreviewMap;
}
function closeMapPopups(){[...routePreviewMarkers,previewDriverMarker,...mapMarkers,driverMarker].filter(Boolean).forEach(m=>{try{m.closePopup();m.closeTooltip()}catch{}})}
function fitRoutePreviewOverview(){
  const pm=routePreviewMap;if(!pm)return;closeMapPopups();
  const rs=optimizedOrder.length?optimizedOrder:routeRaces();
  const points=rs.filter(r=>r.lat!=null&&r.lng!=null).map(r=>[r.lat,r.lng]);
  if(lastGps)points.push([lastGps.lat,lastGps.lng]);
  if(points.length)pm.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:15,animate:true});
  else pm.setView([-23.5505,-46.6333],12);
}
function clearRoutePreview(){routePreviewMarkers.forEach(m=>m.remove());routePreviewMarkers=[];if(previewDriverMarker){previewDriverMarker.remove();previewDriverMarker=null}}
function setRouteFocus(index){const rs=optimizedOrder.length?optimizedOrder:routeRaces();if(!rs.length){selectedRouteIndex=0;renderRouteFocus([]);return}selectedRouteIndex=Math.max(0,Math.min(rs.length-1,Number(index)||0));renderRouteFocus(rs);const m=routePreviewMarkers[selectedRouteIndex];if(m){m.openPopup();routePreviewMap?.setView(m.getLatLng(),Math.max(routePreviewMap.getZoom(),16),{animate:true})}}
function fitWorkMapOverview(){
  if(!map)return;closeMapPopups();
  const rs=optimizedOrder.length?optimizedOrder:routeRaces();
  const points=rs.filter(r=>r.lat!=null&&r.lng!=null).map(r=>[r.lat,r.lng]);
  if(lastGps)points.push([lastGps.lat,lastGps.lng]);
  if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[55,55],maxZoom:15,animate:true});
  else map.setView([-23.5505,-46.6333],12);
}
function renderRouteFocus(rs){const box=$('#routeFocus');if(!box)return;if(!rs?.length){box.hidden=true;return}selectedRouteIndex=Math.max(0,Math.min(rs.length-1,selectedRouteIndex));const r=rs[selectedRouteIndex],from=selectedRouteIndex===0?(lastGps?'Sua posição':'Ponto inicial não definido'):rs[selectedRouteIndex-1].client,km=r.distanceKm!=null?`${r.distanceKm.toFixed(1).replace('.',',')} km`:'—';box.hidden=false;box.innerHTML=`<div class="routeFocusHead"><span class="eyebrow">ENTREGA ${selectedRouteIndex+1} DE ${rs.length}</span>${r.urgent?'<b class="urgentText">URGENTE</b>':''}</div><div class="routeFocusAddress"><strong>${esc(r.orderNo?`#${r.orderNo} · ${r.client}`:r.client)}</strong><span>${esc(r.address)}</span></div><div class="routeFocusMeta"><div><small>Desde</small><b>${esc(from)}</b></div><div><small>Distância</small><b>${km}</b></div><div><small>Taxa</small><b>${r.deliveryFee!=null?brl(r.deliveryFee):'—'}</b></div></div><div class="routeFocusActions"><button id="routePrev" class="secondary" ${selectedRouteIndex===0?'disabled':''}>‹ Anterior</button><button id="routeFocusNav" class="primary">Navegar</button><button id="routeNext" class="secondary" ${selectedRouteIndex===rs.length-1?'disabled':''}>Próxima ›</button></div>`;$('#routePrev').onclick=()=>setRouteFocus(selectedRouteIndex-1);$('#routeNext').onclick=()=>setRouteFocus(selectedRouteIndex+1);$('#routeFocusNav').onclick=()=>navigateGoogle([r])}
function renderRoutePreview(rs){const pm=initRoutePreviewMap();if(!pm)return;clearRoutePreview();const bounds=[];rs.forEach((r,i)=>{if(r.lat==null||r.lng==null)return;const m=L.marker([r.lat,r.lng],{icon:markerIcon(i,r)}).addTo(pm).bindPopup(`<b>${i+1}. ${esc(r.client)}</b><br>${esc(r.address)}<br><b>${distancePendingText(r,i===0)}</b>`);m.on('click',()=>setRouteFocus(i));routePreviewMarkers.push(m);bounds.push([r.lat,r.lng])});if(lastGps){previewDriverMarker=L.marker([lastGps.lat,lastGps.lng],{icon:L.divIcon({className:'driver-location-marker',html:'<span></span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(pm).bindPopup(driverPopupHtml()).bindTooltip(`<b>GPS</b> · ${lastGps?new Date(lastGps.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}<br>${esc(addressDisplay()||'Endereço sendo localizado…')}`);bounds.push([lastGps.lat,lastGps.lng])}if(bounds.length)pm.fitBounds(L.latLngBounds(bounds),{padding:[35,35]});pm.invalidateSize();renderRouteFocus(rs)}
function initMap(){if(map)return;map=L.map('map',{zoomControl:false}).setView([-23.5505,-46.6333],12);L.control.zoom({position:'bottomright'}).addTo(map);osmTiles(map)}
function clearMap(){mapMarkers.forEach(m=>m.remove());mapMarkers=[]}
function renderRouteMap(){if(!map)return;clearMap();const rs=optimizedOrder.length?optimizedOrder:routeRaces();$('#mapEmpty').hidden=rs.length>0;rs.forEach((r,i)=>{const m=L.marker([r.lat,r.lng],{icon:markerIcon(i,r)}).addTo(map).bindPopup(`<b>${i+1}. ${esc(r.orderNo?`#${r.orderNo} · ${r.client}`:r.client)}</b>${r.urgent?' · <b>URGENTE</b>':''}<br>${esc(r.address)}<br><b>${r.distanceKm!=null?`${r.distanceKm.toFixed(1).replace('.',',')} km · ${brl(r.deliveryFee)}`:distancePendingText(r,i===0)}</b>`);m.on('click',()=>{selectedRouteIndex=i;renderRouteFocus(rs)});mapMarkers.push(m)});if(driverMarker)driverMarker.addTo(map);if(rs.length){if(!workOverviewUsed){fitWorkMapOverview();workOverviewUsed=true}renderRouteInfo(rs);renderRouteOrder(rs);renderRouteFocus(rs)}else{map.setView([-23.5505,-46.6333],12);renderRouteInfo([]);renderRouteOrder([]);renderRouteFocus([]);setRouteStatus('Sem entregas com localização para montar a rota.');$('#routeGroups').innerHTML=''}}
function routeLength(order){let total=0;for(let i=1;i<order.length;i++)total+=distance(order[i-1],order[i]);return total}
function nearestNeighbor(items,start){let rem=[...items],order=[],a=start||{lat:rem[0]?.lat,lng:rem[0]?.lng};while(rem.length){rem.sort((x,y)=>distance(a,x)-distance(a,y));const r=rem.shift();order.push(r);a=r}return order}
function buildOptimizedOrder(rs,start){const urgent=rs.filter(r=>r.urgent),normal=rs.filter(r=>!r.urgent);let order=[];let anchor=start;for(const u of urgent){const batch=nearestNeighbor([u],anchor);order.push(...batch);anchor=batch[batch.length-1]}order.push(...nearestNeighbor(normal,anchor));return order}
async function autoReorderActiveRoute(){
  if(!state.settings.autoReorder||!lastGps)return;
  const active=routeRaces().filter(r=>r.status!=='done');
  if(active.length<2)return;
  const currentIds=active.map(r=>r.id).join('|');
  const proposed=buildOptimizedOrder(active,{lat:lastGps.lat,lng:lastGps.lng});
  if(proposed.map(r=>r.id).join('|')===currentIds)return;
  const current=optimizedOrder.filter(r=>active.some(x=>x.id===r.id));
  const changed=proposed.map(r=>r.id).join('|')!==current.map(r=>r.id).join('|');
  if(!changed)return;
  optimizedOrder=[...proposed,...optimizedOrder.filter(r=>!active.some(x=>x.id===r.id)&&r.status!=='done')];
  syncRouteOrder();await persistOnly();
  if(mapScreenActive()){renderRouteMap();renderWorkNext()}
  else if($('#routesScreen')?.classList.contains('active')){renderRouteOrder(optimizedOrder);renderRouteGroups();renderRoutePreview(optimizedOrder)}
  toast('Rota reorganizada a partir da sua posição atual.');
}
function scheduleRouteRecalc(force=false){
  if(!state.settings.trackingEnabled||!routeRaces().length)return;
  const rs=optimizedOrder.length?optimizedOrder:routeRaces();
  if(!lastGps||!rs.length)return;
  if(routeRecalcBusy){return;}
  clearTimeout(routeRecalcTimer);
  routeRecalcTimer=setTimeout(async()=>{
    if(routeRecalcBusy)return;
    routeRecalcBusy=true;
    try{lastRerouteGps={lat:lastGps.lat,lng:lastGps.lng};await autoReorderActiveRoute();if(mapScreenActive()){renderRouteMap();await requestRoadDistances(rs)}else if($('#routesScreen')?.classList.contains('active')){renderRoutePreview(rs);await requestRoadDistances(rs)}}
    finally{routeRecalcBusy=false;}
  },900);
}
function gpsMovedEnough(){if(!lastRerouteGps)return true;return distance(lastRerouteGps,lastGps)>=0.05}
function show(id){$$('.screen').forEach(x=>x.classList.toggle('active',x.id===id));$$('[data-screen]').forEach(x=>x.classList.toggle('active',x.dataset.screen===id));if(id==='home')renderHome();if(id==='races')renderRaces();window.scrollTo(0,0);if(id!=='capture')stopCamera();if(id==='routesScreen'){restoreRouteOrder();workOverviewUsed=false;setTimeout(()=>{initRoutePreviewMap();startTracking();const rs=optimizedOrder.length?optimizedOrder:routeRaces();renderRouteOrder(rs);renderRouteGroups();renderRouteInfo(rs);evaluateManualOrder();renderRoutePreview(rs);setTimeout(()=>{routePreviewMap?.invalidateSize();if(rs.length)requestRoadDistances(rs)},120)},80)}else if(id==='mapScreen'){workOverviewUsed=false;setTimeout(()=>{initMap();renderRouteMap();startTracking();renderWorkNext();setTimeout(()=>map?.invalidateSize(),100)},100)}else stopTracking();if(id==='earnings')renderEarnings();if(id==='form')setTimeout(()=>formMap?.invalidateSize(),100)}
document.addEventListener('click',e=>{const nav=e.target.closest('[data-screen]');if(nav){e.preventDefault();e.stopPropagation();const id=nav.dataset.screen;if(id)show(id);return}const back=e.target.closest('[data-back]');if(back){e.preventDefault();e.stopPropagation();const id=back.dataset.back||'home';show(id);return}},true);$('#settingsBtn').onclick=()=>show('settings');$('#newRaceBtn').onclick=()=>openCapture();$('#newRaceFromRaces').onclick=()=>openCapture();$('#openRaces').onclick=()=>{currentFilter='all';show('races');renderRaces()};$('#mapWorkBtn').onclick=()=>show('mapScreen');$('#openWorkBtn').onclick=()=>show('mapScreen');$('#backToRoutes').onclick=()=>show('routesScreen');$('#earningsBtn').onclick=()=>show('earnings');$$('.miniCard').forEach(b=>b.onclick=()=>{currentFilter=b.dataset.filter;show('races');renderRaces()});function syncRaceFilterUI(){const buttons=$$('.filterTabs [data-filter]');buttons.forEach(b=>{const active=b.dataset.filter===currentFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');b.setAttribute('aria-current',active?'page':'false')})}$$('.filterTabs button').forEach(b=>b.onclick=()=>{currentFilter=b.dataset.filter;syncRaceFilterUI();renderRaces()});$('#raceSearch').oninput=e=>{raceSearch=e.target.value;renderRaces()};$$('.historyPeriod button').forEach(b=>b.onclick=()=>{historyPeriod=b.dataset.history;$$('.historyPeriod button').forEach(x=>x.classList.toggle('active',x===b));renderRaces()});$('#closeDayBtn').onclick=closeDaySummary;function syncEarningsPeriodUI(){const buttons=$$('.periodTabs [data-period]');buttons.forEach(b=>{const active=b.dataset.period===currentPeriod;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');b.setAttribute('aria-current',active?'page':'false')})}$$('.periodTabs button').forEach(b=>b.onclick=()=>{currentPeriod=b.dataset.period;syncEarningsPeriodUI();$('#customPeriod').hidden=currentPeriod!=='custom';renderEarnings()});$('#applyCustomPeriod').onclick=()=>{customStart=$('#customStart').value;customEnd=$('#customEnd').value;if(!customStart||!customEnd||customStart>customEnd){toast('Escolha um período válido.','error');return}currentPeriod='custom';syncEarningsPeriodUI();$('#customPeriod').hidden=false;renderEarnings()};
let cameraStream=null;
let lastCapturedFile=null;
let routePreviewMap=null,routePreviewMarkers=[],previewDriverMarker=null;
let routeRecalcTimer=null,lastRerouteGps=null,routeRecalcBusy=false,roadDistanceQueue=Promise.resolve(),roadDistanceSeq=0;
async function openCapture(){
  show('capture');
  lastCapturedFile=null;
  const preview=$('#cameraPreview'),snapshot=$('#captureSnapshot'),badge=$('#captureBadge');
  snapshot.hidden=true;snapshot.removeAttribute('src');badge.hidden=true;
  preview.hidden=false;preview.style.display='none';
  $('#retryPhoto').hidden=true;
  $('#ocrBar').style.width='0';
  $('#ocrStatus').textContent='Abrindo a câmera…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('getUserMedia indisponível');
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}},audio:false});
    preview.srcObject=cameraStream;preview.style.display='block';
    await new Promise(resolve=>{if(preview.readyState>=2)return resolve();preview.addEventListener('loadeddata',resolve,{once:true});setTimeout(resolve,1200)});
    const track=cameraStream.getVideoTracks?.()[0];
    if(track?.applyConstraints){try{await track.applyConstraints({advanced:[{focusMode:'continuous'}]})}catch(_){}}
    $('#ocrStatus').textContent='Câmera pronta. Enquadre a comanda, mantenha firme por um instante e toque em Tirar foto.';
  }catch(e){
    console.error('Camera',e);preview.style.display='none';
    $('#ocrStatus').textContent='A câmera não abriu. Verifique a permissão do navegador. Você pode escolher uma foto da galeria.';
    toast('Permissão da câmera não concedida.','error');
  }
}
function stopCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
  const v=$('#cameraPreview');if(v){v.pause?.();v.srcObject=null;v.style.display='none';v.hidden=false}
}
function resetCapturePreview(){
  const v=$('#cameraPreview'),s=$('#captureSnapshot'),b=$('#captureBadge');
  s.hidden=true;s.removeAttribute('src');b.hidden=true;
  v.style.display=cameraStream?'block':'none';
  $('#ocrBar').style.width='0';
}
function showCapturedFrame(file){
  const s=$('#captureSnapshot'),v=$('#cameraPreview'),b=$('#captureBadge');
  const url=URL.createObjectURL(file);
  s.onload=()=>URL.revokeObjectURL(url);s.src=url;s.hidden=false;v.style.display='none';b.hidden=false;
  $('#retryPhoto').hidden=false;
  $('#captureFlash').classList.remove('active');void $('#captureFlash').offsetWidth;$('#captureFlash').classList.add('active');
}
function captureFromCamera(){
  if(window.ocrBusy)return;
  const v=$('#cameraPreview'),c=$('#cameraCanvas');
  if(!v?.videoWidth){toast('Câmera ainda não está pronta.','error');return}
  const ctx=c.getContext('2d',{alpha:false});c.width=v.videoWidth;c.height=v.videoHeight;ctx.drawImage(v,0,0,c.width,c.height);
  c.toBlob(blob=>{
    if(!blob){toast('Não foi possível capturar a foto.','error');return}
    lastCapturedFile=new File([blob],'comanda-camera.jpg',{type:'image/jpeg',lastModified:Date.now()});
    showCapturedFrame(lastCapturedFile);stopCamera();runOCR(lastCapturedFile);
  },'image/jpeg',.98);
}
$('#takePhoto').onclick=captureFromCamera;
$('#choosePhoto').onclick=()=>$('#galleryInput').click();
$('#galleryInput').onchange=e=>{const f=e.target.files[0];if(f){lastCapturedFile=f;showCapturedFrame(f);runOCR(f)}e.target.value=''};
$('#photoInput').onchange=e=>{const f=e.target.files[0];if(f){lastCapturedFile=f;showCapturedFrame(f);runOCR(f)}e.target.value=''};
$('#manualFromCapture').onclick=()=>{stopCamera();openForm()};
$('#retryPhoto').onclick=()=>{lastCapturedFile=null;resetCapturePreview();$('#retryPhoto').hidden=true;openCapture()};
async function runOCR(file){
  if(window.ocrBusy)return;
  if(!file){toast('Nenhuma foto foi capturada.','error');return}
  lastCapturedFile=file;
  window.ocrBusy=true;
  $('#takePhoto').disabled=true;$('#choosePhoto').disabled=true;$('#manualFromCapture').disabled=true;$('#retryPhoto').disabled=true;
  $('#ocrStatus').textContent='Foto capturada. Preparando leitura…';$('#ocrBar').style.width='0';
  try{
    if(!window.Tesseract||typeof Tesseract.createWorker!=='function')throw Error('Biblioteca Tesseract.js não carregou');
    const worker=await Tesseract.createWorker('por',1,{logger:m=>{if(typeof m.progress==='number')$('#ocrBar').style.width=Math.round(m.progress*100)+'%';if(m.status)$('#ocrStatus').textContent=`Lendo a comanda… ${Math.round((m.progress||0)*100)}%`}});
    await worker.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_pageseg_mode:'6',language_model_penalty_non_freq_dict_word:'0.05'});
    const variants=[false,true,'adaptive','sharp'];let best='';let bestScore=-1;
    for(let i=0;i<variants.length;i++){
      $('#ocrStatus').textContent=`Lendo a comanda… tentativa ${i+1}/${variants.length}`;
      const result=await worker.recognize(await preprocessImage(file,variants[i]));
      const text=(result.data?.text||'').trim();
      const score=ocrQualityScore(text);
      if(score>bestScore){bestScore=score;best=text}
    }
    await worker.terminate();
    if(!best)throw Error('OCR sem texto');
    fillFromOCR(best);show('form');editingId=null;$('#formTitle').textContent='Nova corrida — confira a leitura';$('#deleteRace').hidden=true;$('#coordStatus').textContent='Localização ainda não confirmada';updateFormCalc();$('#ocrStatus').textContent='Leitura concluída. Confira os campos e confirme o endereço no mapa.';toast('Comanda lida. Confira os campos.');
  }catch(e){console.error('OCR',e);$('#ocrStatus').textContent='A leitura automática não conseguiu identificar tudo. Você pode corrigir ou preencher manualmente.';toast('OCR teve dificuldade com a foto.','error')}finally{window.ocrBusy=false;$('#takePhoto').disabled=false;$('#choosePhoto').disabled=false;$('#manualFromCapture').disabled=false;$('#retryPhoto').disabled=false}
}
function ocrQualityScore(text){const t=text||'';let s=Math.min(40,t.length/8);if(/endereço\s*:/i.test(t))s+=25;if(/rua\b|avenida\b|alameda\b|travessa\b/i.test(t))s+=15;if(/valor\s*total/i.test(t))s+=20;if(/bairro\s*:/i.test(t))s+=10;if(/cidade\s*:/i.test(t))s+=10;if(/r\$\s*\d+[,.]\d{2}/i.test(t))s+=10;return s}
async function preprocessImage(file,mode=false){
  const bitmap=await createImageBitmap(file);
  const marginX=Math.round(bitmap.width*.06),marginY=Math.round(bitmap.height*.015);
  const cropW=Math.max(1,bitmap.width-marginX*2),cropH=Math.max(1,bitmap.height-marginY*2);
  const max=3000,scale=Math.min(2,max/Math.max(cropW,cropH));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(cropW*scale));c.height=Math.max(1,Math.round(cropH*scale));
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,marginX,marginY,cropW,cropH,0,0,c.width,c.height);bitmap.close?.();
  const img=ctx.getImageData(0,0,c.width,c.height),d=img.data,hist=new Uint32Array(256);
  for(let i=0;i<d.length;i+=4){const y=Math.max(0,Math.min(255,Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2])));hist[y]++}
  const total=d.length/4;let lo=0,hi=255,acc=0;for(let i=0;i<256;i++){acc+=hist[i];if(acc>total*.01){lo=i;break}}acc=0;for(let i=255;i>=0;i--){acc+=hist[i];if(acc>total*.01){hi=i;break}}
  const span=Math.max(30,hi-lo);
  for(let i=0;i<d.length;i+=4){let y=Math.round((.299*d[i]+.587*d[i+1]+.114*d[i+2]-lo)*255/span);y=Math.max(0,Math.min(255,y));if(mode===true)y=y>155?255:0;else if(mode==='adaptive'){const local=y;y=local>150?255:local<105?0:Math.round((local-105)*255/45)}d[i]=d[i+1]=d[i+2]=y}
  ctx.putImageData(img,0,0);
  if(mode==='sharp'){
    const src=ctx.getImageData(0,0,c.width,c.height),out=ctx.createImageData(c.width,c.height),a=src.data,b=out.data,w=c.width,h=c.height;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=(y*w+x)*4;const v=5*a[p]-a[p-4]-a[p+4]-a[p-w*4]-a[p+w*4];const q=Math.max(0,Math.min(255,v));b[p]=b[p+1]=b[p+2]=q;b[p+3]=255}
    ctx.putImageData(out,0,0)
  }
  return c;
}
function fillFromOCR(text){
  const lines=text.split(/\n+/).map(x=>x.replace(/[|¦]+/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  const clean=s=>s.replace(/^[^A-Za-zÀ-ÿ0-9]+/,'').trim();
  const phoneLines=lines.filter(x=>/^(?:telefone|tel\.?|fone)\s*:/i.test(x)||/\b0800\s*\d{3,4}\s*\d{4}\b/i.test(x));const phoneSource=phoneLines.join('\n')||text;const phoneCandidates=[...phoneSource.matchAll(/(?:\+?55\s*)?(?:0800\s*\d{3,4}\s*\d{4}|\(?\d{2}\)?\s*(?:9\s*)?\d{4}[-.\s]?\d{4})/g)].map(m=>m[0].trim());
  const phone=phoneCandidates.sort((a,b)=>b.replace(/\D/g,'').length-a.replace(/\D/g,'').length)[0]||'';
  const totalLine=lines.find(x=>/valor\s*total/i.test(x));
  const moneyIn=s=>{const ms=[...s.matchAll(/(?:R\$\s*)?\d{1,5}[,.]\d{2}/g)];return ms.length?ms[ms.length-1][0].replace(/[^0-9,.]/g,''):''};
  let money=totalLine?moneyIn(totalLine):'';
  if(!money){const candidates=lines.filter(x=>/\btotal\b|\bvalor\b/i.test(x)).map(moneyIn).filter(Boolean);money=candidates[candidates.length-1]||''}
  const addrLine=lines.find(x=>/\bendereço\s*:/i.test(x))||lines.find(x=>/\b(rua|avenida|av\.?|alameda|travessa|estrada|praça|praca|rodovia|r\.)\b/i.test(x)&&/\d/.test(x))||'';
  let addr=addrLine.replace(/^.*?endereço\s*:\s*/i,'').trim();
  const compLines=lines.filter(x=>/^(comp|complemento)\s*:/i.test(x));
  const compText=compLines.map(x=>x.replace(/^\s*(comp|complemento)\s*:\s*/i,'').trim()).filter(Boolean).join(' ');
  const neighborhood=(lines.find(x=>/^bairro\s*:/i.test(x))||'').replace(/^bairro\s*:\s*/i,'').trim();const cityLine=lines.find(x=>/^cidade\s*:/i.test(x))||'';const cityMatch=cityLine.match(/^cidade\s*:\s*(.+?)(?:\s*-\s*([A-Z]{2}))?(?:\s*-?\s*CEP\s*:?\s*\d{5}-?\d{3})?$/i);const ocrCity=cityMatch?.[1]?.trim()||'';const ocrState=cityMatch?.[2]?.toUpperCase()||'';const ocrPostal=(cityLine.match(/\b\d{5}-?\d{3}\b/)||[])[0]||'';
  const refLine=lines.find(x=>/^(ponto\s*de\s*)?refer[eê]ncia\s*:/i.test(x));
  const reference=refLine?.replace(/^.*?refer[eê]ncia\s*:\s*/i,'').trim()||'';
  const itemStart=lines.findIndex(x=>/itens\s+do\s+pedido/i.test(x));
  const stopRe=/^\*?\s*(pagamento|forma de pagamento|valor total|taxa de servi[cç]o|troco|subtotal)\b/i;
  const itemLines=itemStart>=0?lines.slice(itemStart+1).filter(x=>!stopRe.test(x)&&!/^[-_=]{3,}$/.test(x)&&/\d/.test(x)):[];
  const parsedItems=itemLines.map(line=>{const m=line.match(/^(?:x|qtd|quantidade)?\s*(\d+)\s*[x×-]?\s*(.+)$/i);return {quantity:m?Number(m[1]):1,name:(m?m[2]:line).trim(),addons:'',notes:''}});const items=itemLines.join(' | ');
  const notes=[compText&&`Complemento: ${compText}`,reference&&`Ponto de referência: ${reference}`,items&&`Itens: ${items}`].join('\n');
  const named=lines.find(x=>/^(cliente|nome|destinat[aá]rio)\s*[:\-]/i.test(x));
  const rejected=/^(data|localizador|id|comp|complemento|bairro|cidade|endereço|telefone|tel|itens|pagamento|valor|taxa|pedido|mesa|forma|online|pix|observa|cep)/i;
  const name=named?.split(/[:\-]/).slice(1).join(':').trim()||lines.map(clean).filter(x=>!rejected.test(x)&&/[A-Za-zÀ-ÿ]/.test(x)&&x.split(/\s+/).length>=2&&!/\d{3,}/.test(x)&&!/R\$|\bCEP\b/i.test(x)).sort((a,b)=>{const sa=(/[A-ZÀ-Ý][a-zà-ÿ]+\s+[A-ZÀ-Ý][a-zà-ÿ]+/.test(a)?4:0)+(a.length<45?2:0);const sb=(/[A-ZÀ-Ý][a-zà-ÿ]+\s+[A-ZÀ-Ý][a-zà-ÿ]+/.test(b)?4:0)+(b.length<45?2:0);return sb-sa})[0]||'';
  const orderMatch=text.match(/(?:pedido|comanda|ordem)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/-]{1,})/i);const order=orderMatch?.[1]||'';
  $('#fClient').value=name;$('#fPhone').value=phone;$('#fAddress').value=addr.replace(/,?\s*(?:comp|complemento)\s*:.*/i,'').trim();$('#fNeighborhood').value=neighborhood;if($('#fCity'))$('#fCity').value=ocrCity;if($('#fState'))$('#fState').value=ocrState;if($('#fPostalcode'))$('#fPostalcode').value=ocrPostal;$('#fValue').value=money.replace(',','.');$('#fOrder').value=order;$('#fItems').value=itemsToText(parsedItems);$('#fNotes').value=notes;window._ocrItems=parsedItems;
}
function itemsToText(items){return (Array.isArray(items)?items:[]).map(it=>`${it.quantity&&it.quantity!==1?it.quantity+'x ':''}${it.name||it.text||''}${it.addons?' — '+it.addons:''}${it.notes?' — '+it.notes:''}`.trim()).filter(Boolean).join('\n')}
function parseItemsText(text){return String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).map(line=>{const m=line.match(/^(\d+)\s*[x×-]\s*(.+)$/);return {quantity:m?Number(m[1]):1,name:(m?m[2]:line).trim(),addons:'',notes:''}})}
function resetForm(){editingId=null;window._ocrItems=null;currentCoords=null;if($('#fItems'))$('#fItems').value='';if($('#fCity'))$('#fCity').value='';if($('#fState'))$('#fState').value='';if($('#fPostalcode'))$('#fPostalcode').value='';$('#addressCandidates').hidden=true;$('#coordStatus').textContent='Localização ainda não confirmada';if(formMarker)formMarker.remove();formMarker=null;if(formMap){formMap.remove();formMap=null}}
function openForm(id=null){editingId=id;const r=state.races.find(x=>x.id===id);show('form');$('#formTitle').textContent=r?'Editar corrida':'Nova corrida';$('#fOrder').value=r?.orderNo||'';$('#fUrgent').checked=!!r?.urgent;$('#fClient').value=r?.client||'';$('#fPhone').value=r?.phone||'';$('#fAddress').value=r?.address||'';$('#fNeighborhood').value=r?.neighborhood||'';if($('#fCity'))$('#fCity').value=r?.city||'';if($('#fState'))$('#fState').value=r?.state||'';if($('#fPostalcode'))$('#fPostalcode').value=r?.postalcode||'';$('#fValue').value=r?.value??'';$('#fDeliveryType').value=r?.deliveryType||'normal';$('#fItems').value=itemsToText(r?.items||[]);$('#fNotes').value=r?.notes||'';$('#deleteRace').hidden=!r;currentCoords=r?.lat!=null?{lat:r.lat,lng:r.lng}:null;setTimeout(()=>{if(r?.lat!=null)setFormMap(r.lat,r.lng);else if(formMap)formMap.invalidateSize()},80);updateFormCalc()}
$('#searchAddressBtn').onclick=searchAddress;$('#verifyGoogleBtn').onclick=()=>{const q=$('#fAddress').value.trim();if(!q){toast('Digite um endereço primeiro.','error');return}window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q),'_blank');};$('#useGpsBtn').onclick=useGPS;$('#fAddress').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchAddress()}};$('#fValue').oninput=updateFormCalc;
function updateFormCalc(){const r=editingId&&state.races.find(x=>x.id===editingId),km=r?.distanceKm;$('#formCalc').textContent=km!=null?brl(calcFee(km)):'—';$('#calcExplain').textContent=km!=null?`Distância pelas ruas: ${km.toFixed(1)} km.`:'Distância pendente — aguardando GPS e cálculo pelas ruas. A corrida será salva uma única vez e atualizada depois.'}
$('#saveRace').onclick=async()=>{if(saveRaceBusy)return;const client=$('#fClient').value.trim(),address=$('#fAddress').value.trim();if(!client||!address){toast('Preencha cliente e endereço.','error');return}if(!currentCoords){toast('Confirme a localização no mapa antes de salvar.','error');return}saveRaceBusy=true;$('#saveRace').disabled=true;const old=editingId&&state.races.find(r=>r.id===editingId);const id=old?.id||uuid();const r={...(old||{}),id,orderNo:$('#fOrder').value.trim(),client,phone:$('#fPhone').value.trim(),address,neighborhood:$('#fNeighborhood').value.trim(),city:$('#fCity')?.value.trim()||'',state:$('#fState')?.value.trim()||'',postalcode:$('#fPostalcode')?.value.trim()||'',value:num($('#fValue').value),deliveryType:$('#fDeliveryType')?.value||'normal',linkedRaceId:window._followupSourceId||null,notes:$('#fNotes').value.trim(),items:parseItemsText($('#fItems').value),urgent:$('#fUrgent').checked,lat:currentCoords.lat,lng:currentCoords.lng,status:old?.status||'open',createdAt:old?.createdAt||new Date().toISOString()};
  if(old && (old.lat!==r.lat||old.lng!==r.lng)) r.distanceKm=null,r.deliveryFee=null;
  if(!old) r.distanceKm=null,r.deliveryFee=null;
  if(old)Object.assign(old,r);else if(!state.races.some(x=>x.id===id))state.races.push(r);window._followupSourceId=null;
  if(!optimizedOrder.length)restoreRouteOrder();if(!optimizedOrder.some(x=>x.id===r.id))optimizedOrder.push(r);syncRouteOrder();await persistOnly();renderAll();
  if(!lastGps){try{const p=await getPosition();setDriverPosition(p.coords.latitude,p.coords.longitude,p.coords.accuracy)}catch{}}
  const route=optimizedOrder.length?optimizedOrder:routeRaces();if(route.length)await requestRoadDistances(route);
  toast(old?'Corrida atualizada.':'Corrida salva.');resetForm();show('races');renderRaces();saveRaceBusy=false;$('#saveRace').disabled=false};
$('#cancelForm').onclick=()=>{resetForm();show('home')};$('#deleteRace').onclick=()=>{const id=editingId;modal('Excluir corrida','Essa corrida será removida deste aparelho.',[{label:'Cancelar'},{label:'Excluir',primary:true,onClick:async()=>{const race=state.races.find(r=>r.id===id);if(race){const revised=RotaMotoContract.revise(race);const tomb={id:race.deliveryId||race.id,store:'deliveries',companyId:race.companyId||state.settings.companyId||'company_local',deleted:true,deletedAt:revised.updatedAt,updatedAt:revised.updatedAt,version:revised.version};await tx('tombstones','readwrite',s=>s.put(tomb));}state.races=state.races.filter(r=>r.id!==id);await saveAll();resetForm();show('races');toast('Corrida excluída.')}}])};
function statusLabel(s){return s==='done'?t('done'):s==='cancelled'?t('cancelled'):s==='route'?t('route'):s==='arrived'?t('arrived'):s==='issue'?t('issue'):t('open')}function statusClass(s){return s==='done'?'done':s==='cancelled'?'cancelled':s==='route'?'route':s==='arrived'?'arrived':s==='issue'?'issue':'open'}
function arrivalDistanceM(r){if(!r||r.lat==null||r.lng==null||!lastGps)return Infinity;return distance({lat:r.lat,lng:r.lng},lastGps)*1000}
function isAtDelivery(r){const d=arrivalDistanceM(r);return Number.isFinite(d)&&d<=(state.settings.arrivalRadiusM||10)}
async function startRace(id){
 const r=state.races.find(x=>x.id===id);
 if(!r)return;
 if(r.status!=='open'){toast('Essa corrida não está disponível para iniciar.','error');return}
 const previous=structuredClone(r);r.status='route';r.canonicalStatus='OUT_FOR_DELIVERY';r.startedAt=reviseRace(r);
 r.arrivedAt=null;
 r.gpsDistanceKm=0;
 r.gpsLastPoint=lastGps?{lat:lastGps.lat,lng:lastGps.lng}:null;
 r.distanceSource='gps';
 r.finishedAt=null;
 try{const deliveryEvent=recordDeliveryEvent('DELIVERY_STARTED',r,{startedAt:r.startedAt});await saveAll({recalcRoute:true,deliveryEvent});toast('Corrida iniciada.')}catch(err){restoreRace(r,previous);toast('Não foi possível iniciar a corrida.','error');console.error(err)}
}
async function markArrived(id){
 const r=state.races.find(x=>x.id===id);
 if(!r)return;
 if(!['route','arrived'].includes(r.status))return;
 if(!isAtDelivery(r)){toast(t('finalOnlyNear',{m:state.settings.arrivalRadiusM||10}),'error');return}
 const previous=structuredClone(r);r.status='arrived';r.canonicalStatus='ARRIVED';r.arrivedAt=reviseRace(r);
 try{const deliveryEvent=recordDeliveryEvent('DELIVERY_ARRIVED',r,{arrivedAt:r.arrivedAt});await saveAll({deliveryEvent});toast('Chegada registrada.')}catch(err){restoreRace(r,previous);console.error(err);toast('Não foi possível registrar a chegada.','error')}
}
function openFinalizeRace(id){
 const r=state.races.find(x=>x.id===id);
 if(!r)return;
 if(!['route','arrived'].includes(r.status)){toast('Inicie a corrida antes de finalizar.','error');return}
 if(!isAtDelivery(r)){toast(t('finalOnlyNear',{m:state.settings.arrivalRadiusM||10}),'error');return}
 const body=`<div class="finishFlow">
   <div class="finishIntro"><b>Confirmação de entrega</b><span>Peça ao cliente para assinar abaixo. A corrida só poderá ser finalizada depois da assinatura.</span></div>
   <div class="signatureBox">
     <div class="signatureHead"><b>Assinatura do cliente</b><small>${esc(r.client||'Cliente')}</small></div>
     <canvas id="customerSignature" class="signatureCanvas" aria-label="Assinatura do cliente"></canvas>
     <div class="signatureTools"><span id="signatureStatus">Aguardando assinatura</span><button type="button" class="secondary" id="clearSignature">Limpar</button></div>
   </div>
   <div class="finishSliderWrap">
     <label for="finishSlider"><b>Finalizar corrida</b><small id="finishSliderHint">Assine primeiro para habilitar.</small></label>
     <div class="finishSlider"><span>Deslize para finalizar</span><input id="finishSlider" type="range" min="0" max="100" value="0" disabled aria-label="Deslize para finalizar a corrida"></div>
   </div>
 </div>`;
 modal('Finalizar corrida',body,[]);
 const m=$('#modal'),canvas=m.querySelector('#customerSignature'),ctx=canvas.getContext('2d'),slider=m.querySelector('#finishSlider'),status=m.querySelector('#signatureStatus'),hint=m.querySelector('#finishSliderHint');
 let drawing=false,hasSignature=false,lastX=0,lastY=0;
 const resize=()=>{const rect=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1),old=hasSignature?canvas.toDataURL():null;canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=2.5;ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()||'#111827';if(old){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,rect.height);img.src=old}};
 const point=e=>{const rect=canvas.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top}};
 const begin=e=>{e.preventDefault();drawing=true;const q=point(e);lastX=q.x;lastY=q.y;canvas.setPointerCapture?.(e.pointerId)};
 const move=e=>{if(!drawing)return;e.preventDefault();const q=point(e);ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(q.x,q.y);ctx.stroke();lastX=q.x;lastY=q.y;hasSignature=true;status.textContent='Assinatura registrada';slider.disabled=false;hint.textContent='Agora deslize o controle até o final.'};
 const end=e=>{drawing=false;try{canvas.releasePointerCapture?.(e.pointerId)}catch{}};
 canvas.addEventListener('pointerdown',begin);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
 m.querySelector('#clearSignature').onclick=()=>{const rect=canvas.getBoundingClientRect();ctx.clearRect(0,0,rect.width,rect.height);hasSignature=false;slider.value=0;slider.disabled=true;status.textContent='Aguardando assinatura';hint.textContent='Assine primeiro para habilitar.'};
 slider.oninput=()=>{if(!hasSignature){slider.value=0;return}if(Number(slider.value)>=100){slider.value=100;const signature=canvas.toDataURL('image/png');finalizeRace(id,signature)}};
 resize();requestAnimationFrame(resize);window.addEventListener('resize',resize,{once:true});
}
async function finalizeRace(id,signature){
 const r=state.races.find(x=>x.id===id);
 if(!r||!signature)return;
 if(!isAtDelivery(r)){toast(t('finalOnlyNear',{m:state.settings.arrivalRadiusM||10}),'error');return}
 const previous=structuredClone(r);r.status='done';r.canonicalStatus='DELIVERED';r.completedAt=reviseRace(r);r.finishedAt=r.completedAt;r.customerSignature=signature;r.customerSignatureAt=r.completedAt;
 optimizedOrder=optimizedOrder.filter(x=>x.id!==id);syncRouteOrder();
 try{const deliveryEvent=recordDeliveryEvent('DELIVERY_COMPLETED',r,{completedAt:r.completedAt,hasProof:!!signature});await saveAll({recalcRoute:true,deliveryEvent});$('#modal').hidden=true;toast('Corrida finalizada e assinatura salva.')}catch(err){restoreRace(r,previous);console.error(err);toast('Não foi possível finalizar a corrida.','error')}
}
async function finishRace(id){openFinalizeRace(id)}

function markIssue(id){
 const r=state.races.find(x=>x.id===id);
 if(!r)return;
 modal(t('problem'),`<p><b>${esc(r.client)}</b></p><p>Registre a ocorrência desta entrega.</p>`,[{label:'Voltar'},{label:'Marcar como problema',primary:true,onClick:async()=>{const previous=structuredClone(r);r.status='issue';r.canonicalStatus='FAILED';r.issueAt=reviseRace(r);try{const deliveryEvent=recordDeliveryEvent('DELIVERY_FAILED',r,{issueAt:r.issueAt});await saveAll({deliveryEvent});toast('Problema registrado.')}catch(err){restoreRace(r,previous);console.error(err);toast('Não foi possível registrar o problema.','error')}}}]);
}
function cancelRace(id){const r=state.races.find(x=>x.id===id);if(!r)return;const reasons=state.settings.language==='en'?['Customer cancelled','Incorrect address','Customer not found','Delivery could not be completed','Other']:state.settings.language==='es'?['Cliente canceló','Dirección incorrecta','Cliente no localizado','No fue posible realizar la entrega','Otro']:['Cliente cancelou','Endereço incorreto','Cliente não localizado','Não foi possível realizar a entrega','Outro'];modal(t('cancelReason'),`<p><b>${esc(r.client)}</b></p><p>${t('cancelBeforeStart')}</p>`,[{label:'Cancelar'},...reasons.map(reason=>({label:reason,primary:false,onClick:async()=>{const previous=structuredClone(r);r.status='cancelled';r.canonicalStatus='CANCELLED';r.cancelReason=reason;r.cancelledAt=reviseRace(r);try{const deliveryEvent=recordDeliveryEvent('DELIVERY_CANCELLED',r,{reason});optimizedOrder=optimizedOrder.filter(x=>x.id!==id);syncRouteOrder();await saveAll({recalcRoute:true,deliveryEvent});toast('Corrida cancelada e não contabilizada.')}catch(err){restoreRace(r,previous);console.error(err);toast('Não foi possível cancelar a corrida.','error')} }}))])}
function reuseRace(id){const src=state.races.find(r=>r.id===id);if(!src)return;editingId=null;currentCoords=src.lat!=null?{lat:src.lat,lng:src.lng}:null;show('form');$('#formTitle').textContent='Reutilizar corrida';$('#fOrder').value='';$('#fUrgent').checked=!!src.urgent;$('#fClient').value=src.client||'';$('#fPhone').value=src.phone||'';$('#fAddress').value=src.address||'';$('#fNeighborhood').value=src.neighborhood||'';if($('#fCity'))$('#fCity').value=src.city||'';if($('#fState'))$('#fState').value=src.state||'';if($('#fPostalcode'))$('#fPostalcode').value=src.postalcode||'';$('#fValue').value=src.value??'';$('#fDeliveryType').value='normal';$('#fItems').value=itemsToText(src.items||[]);$('#fNotes').value=src.notes||'';$('#deleteRace').hidden=true;setTimeout(()=>{if(currentCoords)setFormMap(currentCoords.lat,currentCoords.lng);},80);updateFormCalc()}
function startedDetail(r,near){const started=r.status==='route'||r.status==='arrived';if(!started)return '';if(!Number.isFinite(arrivalDistanceM(r)))return `<div class="detailHint">${t('gpsWaiting')}</div>`;return `<div class="detailGps ${near?'near':'far'}"><b>${near?t('gpsNear'):t('gpsFar')}</b><small>${t('finalOnlyNear',{m:state.settings.arrivalRadiusM||10})}</small></div>`}
function deliveryTypeLabel(type){return type==='return'?'Retorno ao cliente':type==='exchange'?'Troca de pedido':type==='pickup'?'Recolha / devolução':'Entrega normal'}
function createFollowupRace(id,type){const src=state.races.find(r=>r.id===id);if(!src)return;window._followupSourceId=id;editingId=null;currentCoords=src.lat!=null?{lat:src.lat,lng:src.lng}:null;show('form');$('#formTitle').textContent=deliveryTypeLabel(type);$('#fOrder').value=src.orderNo||'';$('#fDeliveryType').value=type;$('#fUrgent').checked=false;$('#fClient').value=src.client||'';$('#fPhone').value=src.phone||'';$('#fAddress').value=src.address||'';$('#fNeighborhood').value=src.neighborhood||'';if($('#fCity'))$('#fCity').value=src.city||'';if($('#fState'))$('#fState').value=src.state||'';if($('#fPostalcode'))$('#fPostalcode').value=src.postalcode||'';$('#fValue').value=src.value??'';$('#fItems').value=itemsToText(src.items||[]);$('#fNotes').value=`Retorno vinculado à entrega ${src.orderNo?`#${src.orderNo}`:src.id}. ${type==='return'?'Motivo a confirmar com o cliente.':type==='exchange'?'Troca de pedido.':'Recolha/devolução.'}`;$('#deleteRace').hidden=true;setTimeout(()=>{if(currentCoords)setFormMap(currentCoords.lat,currentCoords.lng);},80);updateFormCalc()}
function openRaceDetails(id){const r=state.races.find(x=>x.id===id);if(!r)return;const near=isAtDelivery(r),started=r.status==='route'||r.status==='arrived',items=Array.isArray(r.items)?r.items:[];const itemHtml=`<div class="detailSection"><button class="detailCollapse" data-collapse="items"><span>${t('items')}</span><b>⌄</b></button><div class="detailContent" data-content="items">${items.length?items.map(it=>`<div class="orderItem"><b>${esc(it.quantity?`${it.quantity}× `:'')}${esc(it.name||it.text||'Item')}</b>${it.addons?`<small>${esc(it.addons)}</small>`:''}${it.notes?`<small>${esc(it.notes)}</small>`:''}</div>`).join(''):`<small>Nenhum item registrado.</small>`}</div></div>`;const notes=`<div class="detailSection"><button class="detailCollapse" data-collapse="notes"><span>${t('observations')}</span><b>⌄</b></button><div class="detailContent" data-content="notes">${r.notes?esc(r.notes).replace(/\n/g,'<br>'):'Nenhuma observação registrada.'}</div></div>`;const km=r.distanceKm!=null?`${r.distanceKm.toFixed(1).replace('.',',')} km`:'Pendente';modal(t('details'),`<div class="detailHero"><div><span>Taxa da corrida</span><strong>${r.deliveryFee!=null?brl(r.deliveryFee):'—'}</strong></div><div class="detailHeroKm"><small>Distância</small><b>${km}</b></div></div><div class="detailGrid"><div><small>Cliente</small><b>${esc(r.client)}</b></div><div><small>Status</small><b>${statusLabel(r.status)}</b></div><div><small>Endereço</small><b>${esc(r.address)}</b></div>${r.orderNo?`<div><small>Pedido</small><b>#${esc(r.orderNo)}</b></div>`:''}${r.completedAt?`<div><small>Finalizada</small><b>${new Date(r.completedAt).toLocaleString('pt-BR')}</b></div>`:''}${r.deliveryType&&r.deliveryType!=='normal'?`<div><small>Tipo</small><b>${deliveryTypeLabel(r.deliveryType)}</b></div>`:''}</div>${itemHtml}${notes}${r.customerSignature?`<div class="detailSection"><div class="detailSectionTitle"><b>Assinatura do cliente</b></div><img class="savedSignature" src="${r.customerSignature}" alt="Assinatura do cliente"></div>`:''}${startedDetail(r,near)}${r.status==='done'?`<div class="detailActions"><button class="secondary" id="createReturn">Criar retorno</button><button class="secondary" id="createExchange">Criar troca</button><button class="secondary" id="createPickup">Criar recolha</button></div>`:''}`,[]);const m=$('#modal');m.querySelectorAll('[data-collapse]').forEach(btn=>btn.onclick=()=>{const key=btn.dataset.collapse,c=m.querySelector(`[data-content="${key}"]`);c.hidden=!c.hidden;btn.querySelector('b').textContent=c.hidden?'›':'⌄'});if(m.querySelector('#createReturn'))m.querySelector('#createReturn').onclick=()=>createFollowupRace(id,'return');if(m.querySelector('#createExchange'))m.querySelector('#createExchange').onclick=()=>createFollowupRace(id,'exchange');if(m.querySelector('#createPickup'))m.querySelector('#createPickup').onclick=()=>createFollowupRace(id,'pickup');}
function renderRaces(){syncRaceFilterUI();let rs=[...state.races].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));if(currentFilter!=='all')rs=rs.filter(r=>r.status===currentFilter);if(historyPeriod!=='all')rs=rs.filter(historyMatches);if(raceSearch.trim()){const q=normalizeText(raceSearch).toLowerCase();rs=rs.filter(r=>normalizeText(`${r.orderNo||''} ${r.client||''} ${r.address||''}`).toLowerCase().includes(q))}const box=$('#raceList');$$('.historyPeriod [data-history]').forEach(b=>b.classList.toggle('active',b.dataset.history===historyPeriod));if(!rs.length){box.innerHTML='<div class="empty"><b>Nenhuma corrida cadastrada. Cadastre uma nova corrida para começar.</b></div>';applyLanguage();return}box.innerHTML=rs.map(r=>{const near=isAtDelivery(r),started=r.status==='route'||r.status==='arrived';return `<article class="race" data-view="${r.id}"><div class="raceTop"><div><b>${esc(r.orderNo?`#${r.orderNo} · ${r.client}`:r.client)}</b><small>${esc(r.address)}</small></div><strong>${r.distanceKm!=null&&r.deliveryFee!=null?brl(r.deliveryFee):'—'}</strong></div><div class="raceMeta"><span class="badge ${statusClass(r.status)}">${statusLabel(r.status)}</span>${r.urgent&&r.status!=='done'&&r.status!=='cancelled'?'<span class="urgentBadge" title="Entrega urgente" aria-label="Entrega urgente">!</span>':''}<span>${r.distanceKm!=null?r.distanceKm.toFixed(1)+' km':'distância pendente — aguardando cálculo pelas ruas'}</span>${r.completedAt?`<span>${new Date(r.completedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>`:''}<button class="iconBtn" data-edit="${r.id}">Editar</button>${r.status==='done'||r.status==='cancelled'?`<button class="iconBtn" data-reuse="${r.id}">Reutilizar</button>`:''}</div>${r.status!=='done'&&r.status!=='cancelled'?`<div class="raceActions">${r.status==='open'?`<button class="primary" data-route="${r.id}">${t('start')}</button><button class="secondary" data-cancel="${r.id}">${t('cancel')}</button>`:started&&near?`<button class="primary" data-done="${r.id}">${t('finish')}</button>`:`<button class="secondary" data-cancel="${r.id}">${t('cancel')}</button>`}${started&&near?`<button class="secondary" data-arrived="${r.id}">Cheguei</button>`:''}<button class="secondary" data-issue="${r.id}">${t('problem')}</button></div>`:''}</article>`}).join('');$$('[data-view]').forEach(a=>a.onclick=e=>{if(e.target.closest('button'))return;openRaceDetails(a.dataset.view)});$$('[data-edit]').forEach(b=>b.onclick=()=>openForm(b.dataset.edit));$$('[data-route]').forEach(b=>b.onclick=()=>startRace(b.dataset.route));$$('[data-cancel]').forEach(b=>b.onclick=()=>cancelRace(b.dataset.cancel));$$('[data-arrived]').forEach(b=>b.onclick=()=>markArrived(b.dataset.arrived));$$('[data-issue]').forEach(b=>b.onclick=()=>markIssue(b.dataset.issue));$$('[data-done]').forEach(b=>b.onclick=()=>openFinalizeRace(b.dataset.done));$$('[data-reuse]').forEach(b=>b.onclick=()=>reuseRace(b.dataset.reuse));applyLanguage()}
function routeRaces(){return state.races.filter(r=>r.status!=='done'&&r.status!=='cancelled'&&r.lat!=null&&r.lng!=null)}
function markerIcon(i,r){const cls=i===0?' current':'';return L.divIcon({className:'',html:`<div class="numbered-marker${cls}">${i+1}</div>`,iconSize:[31,31],iconAnchor:[15,15]})}
function manualOrderIsWorse(order,optimized){if(order.length<3||optimized.length!==order.length)return null;const a=routeLength(order),b=routeLength(optimized);if(!b)return null;const pct=((a-b)/b)*100;return pct>5?pct:null}
async function optimizeRoute(){const rs=routeRaces();if(!rs.length){toast('Não há corridas com localização para organizar.','error');return}$('#optimizeBtn').disabled=true;setRouteStatus('Obtendo posição e calculando a sequência…');let start=null;try{const p=await getPosition();start={lat:p.coords.latitude,lng:p.coords.longitude};setDriverPosition(p.coords.latitude,p.coords.longitude,p.coords.accuracy)}catch{start=lastGps?{lat:lastGps.lat,lng:lastGps.lng}:null}const order=buildOptimizedOrder(rs,start||{lat:rs[0].lat,lng:rs[0].lng});optimizedOrder=order;syncRouteOrder();let result;if(mapScreenActive()){renderRouteMap();result=await requestRoadDistances(order)}else{result=await requestRoadDistances(order)}renderRouteOrder(order);renderRouteGroups();evaluateManualOrder();$('#optimizeBtn').disabled=false;const urgentCount=order.filter(r=>r.urgent).length;if(result.ok)toast(urgentCount?`${urgentCount} urgente(s) priorizada(s) e distâncias calculadas pelas ruas.`:'Rota otimizada e distâncias calculadas pelas ruas.');else toast('Sequência otimizada, mas a rota pelas ruas não respondeu.','error');}
async function moveRouteItem(from,to){
  if(from==null||to==null||from===to)return;
  const arr=[...optimizedOrder],item=arr.splice(from,1)[0];
  if(!item)return;
  to=Math.max(0,Math.min(arr.length,to));arr.splice(to,0,item);optimizedOrder=arr;syncRouteOrder();await persistOnly();
  renderRouteOrder(optimizedOrder);renderRouteGroups();evaluateManualOrder();renderRoutePreview(optimizedOrder);
  let result; if(mapScreenActive()){renderRouteMap(); result=await requestRoadDistances(optimizedOrder)} else {result=await requestRoadDistances(optimizedOrder)}
  if(result.ok)toast('Ordem atualizada e distâncias recalculadas pelas ruas.');else toast('Ordem atualizada; não foi possível recalcular a rota agora.','error');
}
function renderRouteOrder(rs){const box=$('#routeOrderList');if(!box)return;if(!rs.length){box.innerHTML='<div class="empty mini"><small>Inicie ou cadastre corridas com localização para montar a ordem.</small></div>';return}box.innerHTML=rs.map((r,i)=>`<div class="routeItem" draggable="true" data-index="${i}"><span class="dragHandle" aria-hidden="true"><svg><use href="#i-grip"/></svg></span><span class="routeNum">${i+1}</span><div><b>${esc(r.orderNo?`#${r.orderNo} · ${r.client}`:r.client)}</b><small>${esc(r.address)}</small><em class="routeLeg">${r.distanceKm!=null?`${r.distanceKm.toFixed(1).replace('.',',')} km desde o ponto anterior`:distancePendingText(r,i===0)}</em></div><div class="orderBtns"><button type="button" class="orderMove" data-up="${i}" ${i===0?'disabled':''}><svg><use href="#i-up"/></svg></button><button type="button" class="orderMove" data-down="${i}" ${i===rs.length-1?'disabled':''}><svg><use href="#i-down"/></svg></button></div>${r.urgent?'<span class="urgentBadge" title="Entrega urgente" aria-label="Entrega urgente">!</span>':''}</div>`).join('');let drag=null;$$('.routeItem').forEach(el=>{el.ondragstart=()=>{drag=+el.dataset.index;el.classList.add('dragging')};el.ondragend=()=>{drag=null;el.classList.remove('dragging')};el.ondragover=e=>e.preventDefault();el.ondrop=()=>{const to=+el.dataset.index;const from=drag;drag=null;moveRouteItem(from,to)};el.onpointerdown=e=>{if(e.pointerType==='touch')el.dataset.pointerStart=e.clientY};el.onpointerup=e=>{if(e.pointerType!=='touch')return;const start=Number(el.dataset.pointerStart);delete el.dataset.pointerStart;if(!Number.isFinite(start)||Math.abs(e.clientY-start)<36)return;const from=+el.dataset.index,to=Math.max(0,Math.min(optimizedOrder.length-1,from+(e.clientY<start?-1:1)));moveRouteItem(from,to)}});$$('[data-up]').forEach(b=>b.onclick=()=>moveRouteItem(+b.dataset.up,+b.dataset.up-1));$$('[data-down]').forEach(b=>b.onclick=()=>moveRouteItem(+b.dataset.down,+b.dataset.down+1));evaluateManualOrder()}
function evaluateManualOrder(){const box=$('#routeAlert');if(!box)return;const rs=optimizedOrder.length?optimizedOrder:routeRaces(), optimized=buildOptimizedOrder(routeRaces(),lastGps?{lat:lastGps.lat,lng:lastGps.lng}:null), pct=manualOrderIsWorse(rs,optimized);if(pct){box.hidden=false;box.innerHTML=`<b>⚠ Ordem escolhida pelo motoboy</b><span>Essa sequência está aproximadamente ${pct.toFixed(0)}% acima da rota otimizada.</span><button id="useOptimized">Usar rota otimizada</button>`;$('#useOptimized').onclick=async()=>{optimizedOrder=optimized;syncRouteOrder();await persistOnly();renderRouteOrder(optimizedOrder);renderRouteGroups();renderRoutePreview(optimizedOrder);let result;if(mapScreenActive()){renderRouteMap();result=await requestRoadDistances(optimizedOrder)}else{result=await requestRoadDistances(optimizedOrder)}if(result.ok)toast('Ordem otimizada aplicada e rota recalculada.');else toast('Ordem aplicada, mas o serviço de rota não respondeu.','error')}}else{box.hidden=true;box.innerHTML=''}}
function groups(platform){const limit=platform==='google'?Math.min(4,Math.max(1,num(state.settings.googleLimit))):1;const out=[];for(let i=0;i<optimizedOrder.length;i+=limit)out.push(optimizedOrder.slice(i,i+limit));return out}
function setRouteStatus(msg){const a=$('#routeStatus');if(a)a.textContent=msg;const b=$('#workStatus');if(b)b.textContent=msg}function renderRouteInfo(rs){const a=$('#routeStops'),b=$('#routeKm'),c=$('#routeEarn');if(!a||!b||!c)return;const pending=rs.some(r=>r.distanceKm==null),km=rs.reduce((x,r)=>x+num(r.distanceKm),0),earn=rs.reduce((x,r)=>x+(r.deliveryFee??0),0);a.textContent=rs.length;b.textContent=pending?'Pendente':km.toFixed(1).replace('.',',')+' km';if($('#routeTime'))$('#routeTime').textContent=routeDurationSeconds?formatDuration(routeDurationSeconds):'—';c.textContent=pending?'Pendente':brl(earn)}function renderWorkNext(){const box=$('#nextStop');if(!box)return;const rs=optimizedOrder.length?optimizedOrder:routeRaces(),active=rs.filter(x=>x.status!=='done'&&x.status!=='cancelled');if(!active.length){workFocusIndex=0;box.hidden=true;return}workFocusIndex=Math.max(0,Math.min(active.length-1,workFocusIndex));const r=active[workFocusIndex],absoluteIndex=rs.findIndex(x=>x.id===r.id),km=r.distanceKm!=null?`${r.distanceKm.toFixed(1).replace('.',',')} km desde o ponto anterior`:(absoluteIndex===0?'Distância pendente — aguardando localização do motoboy':'Distância pendente — aguardando cálculo pelas ruas'),near=isAtDelivery(r),started=r.status==='route'||r.status==='arrived';box.hidden=false;box.innerHTML=`<span class="eyebrow">ENTREGA EM FOCO</span><b>${esc(r.orderNo?`#${r.orderNo} · ${r.client}`:r.client)}</b><small>${esc(r.address)}</small><div class="workLegInfo"><span>Parada ${absoluteIndex+1} de ${rs.length}</span><span>${km}</span></div><div class="fastEta"><b>Modo entrega rápida</b><span>${routeDurationSeconds?formatDuration(routeDurationSeconds):'Tempo estimado pendente'}</span></div><div class="gpsArrival ${near?'near':'far'}"><b>${near?t('gpsNear'):t('gpsFar')}</b><small>${t('finalOnlyNear',{m:state.settings.arrivalRadiusM||10})}</small></div><div class="nextSequence"><button class="secondary" id="workPrev" ${workFocusIndex===0?'disabled':''}>‹ Anterior</button><span id="workSequence">${workFocusIndex+1} de ${active.length} pendentes</span><button class="secondary" id="workNext" ${workFocusIndex===active.length-1?'disabled':''}>Próxima ›</button></div><div class="nextBtns"><button class="secondary platformAction" id="nextGoogle">${platformIcon('google')} Google Maps</button><button class="secondary platformAction" id="nextWaze">${platformIcon('waze')} Waze</button>${!started?`<button class="primary" id="nextStart">${t('start')}</button>`:near?`<button class="primary" id="nextFinish">${t('finish')}</button>`:`<button class="secondary" id="nextCancel">${t('cancel')}</button>`}<button class="secondary" id="nextIssue">${t('problem')}</button>${state.settings.restaurantPhone?'<button class="secondary" id="nextSupport">Atendimento do restaurante</button>':''}</div>`;$('#workPrev').onclick=()=>{if(workFocusIndex>0){workFocusIndex--;renderWorkNext();const rr=active[workFocusIndex];if(rr&&map)map.setView([rr.lat,rr.lng],16)}};$('#workNext').onclick=()=>{if(workFocusIndex<active.length-1){workFocusIndex++;renderWorkNext();const rr=active[workFocusIndex];if(rr&&map)map.setView([rr.lat,rr.lng],16)}};$('#nextGoogle').onclick=()=>navigateGoogle([r]);$('#nextWaze').onclick=()=>navigateWaze(r);if($('#nextStart'))$('#nextStart').onclick=async()=>{await startRace(r.id)};if($('#nextCancel'))$('#nextCancel').onclick=()=>cancelRace(r.id);if($('#nextFinish'))$('#nextFinish').onclick=()=>openFinalizeRace(r.id);$('#nextIssue').onclick=()=>markIssue(r.id);const s=$('#nextSupport');if(s)s.onclick=()=>location.href='tel:'+state.settings.restaurantPhone.replace(/[^0-9+]/g,'');applyLanguage()}
function platformIcon(type){return type==='google'?'<svg class="brandIcon googleIcon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.71-.06-1.39-.18-2.04H12v3.86h5.24a4.47 4.47 0 0 1-1.94 2.93v2.42h3.14c1.84-1.69 2.91-4.18 2.91-7.17Z"/><path fill="#34A853" d="M12 21.64c2.63 0 4.84-.87 6.45-2.36l-3.14-2.42c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.29v2.5A9.75 9.75 0 0 0 12 21.64Z"/><path fill="#FBBC05" d="M6.54 13.75A5.86 5.86 0 0 1 6.22 12c0-.61.11-1.2.32-1.75v-2.5H3.29A9.76 9.76 0 0 0 2.25 12c0 1.57.38 3.05 1.04 4.25l3.25-2.5Z"/><path fill="#EA4335" d="M12 6.22c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.32 14.63 2.36 12 2.36a9.75 9.75 0 0 0-8.71 5.39l3.25 2.5c.77-2.31 2.92-4.03 5.46-4.03Z"/></svg>':'<svg class="brandIcon wazeIcon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#05B7FF" d="M20.3 10.4c0-4.5-3.6-7.9-8.4-7.9-4.6 0-8.2 3-8.2 7.2 0 2.2 1 4 2.8 5.3-.2.8-.7 1.8-1.5 2.5 1.8.1 3.4-.3 4.5-1.1.8.3 1.7.4 2.6.4 4.7 0 8.2-2.7 8.2-6.4Z"/><circle cx="8.1" cy="8.5" r="1" fill="#fff"/><circle cx="11.9" cy="8.5" r="1" fill="#fff"/><circle cx="15.6" cy="8.5" r="1" fill="#fff"/><path fill="#05B7FF" d="M9.5 18.3c.9 1.7 2.5 2.7 4.5 2.7 1.7 0 3.2-.7 4.2-1.9-1.1.1-2.2-.2-3-.8h-5.7Z"/></svg>'} 
function navigateGoogle(g){if(!g?.length){toast('Organize a rota primeiro.','error');return}const last=g[g.length-1],way=g.slice(0,-1).map(r=>`${r.lat},${r.lng}`).join('|');let u=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(last.lat+','+last.lng)}&travelmode=driving`;if(way)u+='&waypoints='+encodeURIComponent(way);window.location.href=u}
function navigateWaze(r){if(!r||r.lat==null||r.lng==null){toast('A corrida precisa ter uma localização válida antes de navegar.','error');return}currentWazeIndex=Math.max(0,optimizedOrder.findIndex(x=>x.id===r.id));window.location.href=`https://waze.com/ul?ll=${encodeURIComponent(r.lat+','+r.lng)}&navigate=yes`}
function renderRouteGroups(){const box=$('#routeGroups'),nav=$('.navGroup'),rs=optimizedOrder.length?optimizedOrder:routeRaces();if(!optimizedOrder.length)optimizedOrder=rs;if(nav)nav.hidden=!rs.length;if(!rs.length){if(box)box.innerHTML='';return}const gg=groups('google');box.innerHTML=`<div class="groups"><b>Google Maps</b>${gg.map((g,i)=>`<div class="group"><span>Grupo ${i+1} · ${g.length} paradas</span><button data-g="${i}">Abrir grupo</button><small>${g.map((r,j)=>`${j+1}. ${esc(r.client)}${r.urgent?' · !':''}`).join(' · ')}</small></div>`).join('')}</div><div class="groups"><b>Waze — sequência</b><div class="group"><span>1 parada por navegação</span><button id="wazeNext">Próxima</button><small>${optimizedOrder.map((r,j)=>`${j+1}. ${esc(r.client)}${r.urgent?' · !':''}`).join(' · ')}</small></div></div>`;$$('[data-g]').forEach(b=>b.onclick=()=>navigateGoogle(gg[+b.dataset.g]));$('#wazeNext').onclick=()=>{const r=optimizedOrder.find(x=>x.status!=='done');navigateWaze(r)}}
async function updateDriverAddress(lat,lng){
  const seq=++driverAddressSeq;driverAddressBusy=true;
  try{const r=await reverseAddress(lat,lng);if(seq!==driverAddressSeq)return;driverAddress=r?.display_name||canonicalAddress(r)||'';driverAddressCoords={lat:+lat,lng:+lng};updateDriverMarkerContent()}catch{}finally{if(seq===driverAddressSeq)driverAddressBusy=false}
}
function driverPopupHtml(){const when=lastGps?.at?new Date(lastGps.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';return `<b>Posição do motoboy</b><br><span>GPS: ${lastGps?`${lastGps.lat.toFixed(6)}, ${lastGps.lng.toFixed(6)}`:'aguardando'}</span><br><span>Horário: ${when}</span><br><span>${esc(addressDisplay()||'Endereço sendo localizado…')}</span>`}
function updateDriverMarkerContent(){
  const time=lastGps?.at?new Date(lastGps.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
  const tip=`<b>GPS</b> · ${time}<br>${esc(addressDisplay()||'Endereço sendo localizado…')}`;
  if(driverMarker){driverMarker.bindPopup(driverPopupHtml());driverMarker.bindTooltip(tip,{permanent:false})}
  if(previewDriverMarker){previewDriverMarker.bindPopup(driverPopupHtml());previewDriverMarker.bindTooltip(tip,{permanent:false})}
  const t=$('#trackingBadge');
  if(t&&lastGps)t.innerHTML=`<span></span><div><b>GPS ativo · ${time}</b><small>${esc(addressDisplay()||'Localizando endereço…')}</small></div>`;
}
function setDriverPosition(lat,lng,accuracy=null){const prevGps=lastGps;const point={lat:+lat,lng:+lng};const moved=prevGps?distance(prevGps,point)>=0.01:false;lastGps={lat:+lat,lng:+lng,accuracy:accuracy==null?null:+accuracy,at:new Date().toISOString()};if(!lastMovementAt||moved)lastMovementAt=Date.now();
  const active=activeGpsRace();
  if(active&&moved&&Number.isFinite(num(active.gpsLastPoint?.lat))&&Number.isFinite(num(active.gpsLastPoint?.lng))){const leg=distance(active.gpsLastPoint,point);const accOk=accuracy==null||+accuracy<=100;if(accOk&&leg>=0.01&&leg<=2){active.gpsDistanceKm=num(active.gpsDistanceKm)+leg;active.gpsLastPoint={lat:+lat,lng:+lng};persistOnly().catch(()=>{})}}
  if(map){if(!driverMarker){driverMarker=L.marker([lat,lng],{icon:L.divIcon({className:'driver-location-marker',html:'<span></span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map);driverMarker.on('click',()=>driverMarker.openPopup())}else driverMarker.setLatLng([lat,lng]);driverMarker.addTo(map)}
  if(routePreviewMap&&$('#routesScreen')?.classList.contains('active')){if(!previewDriverMarker){previewDriverMarker=L.marker([lat,lng],{icon:L.divIcon({className:'driver-location-marker',html:'<span></span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(routePreviewMap);previewDriverMarker.on('click',()=>previewDriverMarker.openPopup())}else previewDriverMarker.setLatLng([lat,lng]);previewDriverMarker.addTo(routePreviewMap)}
  updateDriverMarkerContent();if($('#races')?.classList.contains('active'))renderRaces();if($('#home')?.classList.contains('active'))renderHome();if($('#earnings')?.classList.contains('active'))renderEarnings();if(mapScreenActive())renderWorkNext();const prev=driverAddressCoords;const addressMoved=!prev||distance(prev,{lat:+lat,lng:+lng})>=0.05;if(addressMoved||!driverAddress)updateDriverAddress(lat,lng);
  const t=$('#trackingBadge');if(t){t.classList.remove('searching','error');t.classList.add('active');updateDriverMarkerContent()}
}

function mapScreenActive(){return $('#mapScreen')?.classList.contains('active')}
function startTracking(){if(watchId!==null||!state.settings.trackingEnabled||!navigator.geolocation){const t=$('#trackingBadge');if(t)t.innerHTML='<span></span> GPS desativado';return}const t=$('#trackingBadge');if(t){t.innerHTML='<span></span> Obtendo GPS…';t.classList.add('searching');t.classList.remove('active','error')}navigator.geolocation.getCurrentPosition(p=>{setDriverPosition(p.coords.latitude,p.coords.longitude,p.coords.accuracy);lastRerouteGps=null;if(mapScreenActive())renderRouteMap();else if($('#routesScreen')?.classList.contains('active')){renderRoutePreview(optimizedOrder.length?optimizedOrder:routeRaces());requestRoadDistances(optimizedOrder.length?optimizedOrder:routeRaces())}},()=>{}, {enableHighAccuracy:true,maximumAge:5000,timeout:10000});watchId=navigator.geolocation.watchPosition(p=>{setDriverPosition(p.coords.latitude,p.coords.longitude,p.coords.accuracy);renderWorkNext();if(gpsMovedEnough())scheduleRouteRecalc()},()=>{const b=$('#trackingBadge');if(b){b.innerHTML='<span></span> GPS indisponível';b.classList.remove('active','searching');b.classList.add('error')}},{enableHighAccuracy:true,maximumAge:5000,timeout:15000})}
function stopTracking(){if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}const t=$('#trackingBadge');if(t){t.innerHTML='<span></span> GPS parado';t.classList.remove('active','searching','error')}}
$('#optimizeBtn').onclick=optimizeRoute;$('#routeOverview').onclick=()=>{closeMapPopups();fitRoutePreviewOverview();toast('Visão geral das entregas.')} ;$('#googleNav').onclick=()=>navigateGoogle(groups('google')[0]);$('#wazeNav').onclick=()=>{const r=optimizedOrder.find(x=>x.status!=='done')||optimizedOrder[0];navigateWaze(r)};$('#locateMe').onclick=async()=>{try{const p=await getPosition();setDriverPosition(p.coords.latitude,p.coords.longitude,p.coords.accuracy);map.setView([p.coords.latitude,p.coords.longitude],16);toast('Mapa centralizado na sua posição.')}catch{toast('GPS indisponível.','error')}};$('#workOverview').onclick=()=>{closeMapPopups();workOverviewUsed=true;fitWorkMapOverview();toast('Visão geral das entregas.')} ;
$('#fullscreenMap').onclick=()=>{routeFullscreen=!routeFullscreen;$('#mapWrap').classList.toggle('fullscreen',routeFullscreen);$('#fullscreenMap').innerHTML=`<svg><use href="#i-${routeFullscreen?'minimize':'expand'}"/></svg>`;setTimeout(()=>map.invalidateSize(),250)};

function closeDaySummary(){const rows=todayRows(),f=financialSnapshot(rows),existing=(state.settings.dayClosures||[]).find(x=>x.date===today());const summary={date:today(),closedAt:new Date().toISOString(),trips:rows.length,km:f.km,realKm:f.realKm,routeKm:f.routeKm,fee:f.fee,cost:f.cost,profit:f.profit};modal('Fechar dia',`<p><b>${new Date().toLocaleDateString('pt-BR')}</b></p><p>${rows.length} entregas · ${f.km.toFixed(1).replace('.',',')} km considerados</p><p>Taxas: <b>${brl(f.fee)}</b></p><p>Custo estimado: <b>${brl(f.cost)}</b></p><p>Resultado estimado: <b>${brl(f.profit)}</b></p>${f.mixed?'<p class="muted">O fechamento usa km reais quando disponíveis e km de rota nas entregas sem GPS suficiente.</p>':''}${existing?'<p class="muted">O dia já foi fechado antes. Salvar novamente atualiza o fechamento.</p>':''}`,[{label:'Cancelar'},{label:'Salvar fechamento',primary:true,onClick:async()=>{state.settings.dayClosures=[...(state.settings.dayClosures||[]).filter(x=>x.date!==today()),summary];await persistOnly();renderAll();toast('Resumo do dia salvo no histórico.')}}])}
function historyMatches(r){if(historyPeriod==='all')return true;const days=historyPeriod==='today'?0:Number(historyPeriod)-1;const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-days);return new Date(r.completedAt||r.createdAt)>=start}
function periodDates(){let end=new Date();end.setHours(23,59,59,999);let start=new Date(end);if(currentPeriod==='today')start.setHours(0,0,0,0);else if(currentPeriod==='week')start.setDate(start.getDate()-6),start.setHours(0,0,0,0);else if(currentPeriod==='month')start.setDate(1),start.setHours(0,0,0,0);else if(customStart&&customEnd){start=new Date(customStart+'T00:00:00');end=new Date(customEnd+'T23:59:59.999')}return{start,end}}
function completedInPeriod(){const {start,end}=periodDates();return state.races.filter(r=>r.status==='done'&&r.completedAt&&new Date(r.completedAt)>=start&&new Date(r.completedAt)<=end)}
function renderBarChart(id,data,formatter){const box=$(id);if(!box)return;const max=Math.max(1,...data.map(x=>num(x.value)));box.innerHTML=data.map((x,i)=>{const pct=Math.max(3,num(x.value)/max*100);const title=`${x.fullLabel||x.label}: ${formatter(x.value)}${x.count!=null?` · ${x.count} entrega(s)`:''}`;return `<button type="button" class="barCol" data-chart-index="${i}" title="${esc(title)}" aria-label="${esc(title)}"><span class="barVal">${formatter(x.value)}</span><div class="barTrack"><div class="bar" style="height:${pct}%"></div></div><span class="barLabel">${esc(x.label)}</span></button>`}).join('');box.querySelectorAll('[data-chart-index]').forEach(btn=>btn.onclick=()=>{const x=data[Number(btn.dataset.chartIndex)];if(!x?.fullLabel)return;const f=x.financial||{};modal(x.fullLabel,`<div class="detailGrid"><div><small>Taxas</small><b>${brl(f.fee??x.value)}</b></div><div><small>Entregas</small><b>${x.count??0}</b></div><div><small>Km considerados</small><b>${num(f.km).toFixed(1).replace('.',',')} km</b></div><div><small>Custo estimado</small><b>${brl(f.cost)}</b></div><div><small>Resultado</small><b>${brl(f.profit)}</b></div></div>`,[])})}
function formatDateRangeLabel(start,end){const a=start.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),b=end.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});return a===b?a:`${a}–${b}`}
function renderEarnings(){const rows=completedInPeriod(),f=financialSnapshot(rows),km=f.km;$('#earnTotal').textContent=brl(f.fee);$('#earnSub').textContent=`${rows.length} entrega(s) · ${km.toFixed(1).replace('.',',')} km considerados${f.hasReal?` · ${f.realKm.toFixed(1).replace('.',',')} km reais`:''}`;$('#earnTrips').textContent=rows.length;$('#earnKm').textContent=km.toFixed(1).replace('.',',');$('#earnAvg').textContent=brl(rows.length?f.fee/rows.length:0);$('#earnPerKm').textContent=km>0?brl(f.fee/km):'—';$('#earnCost').textContent=km>0?brl(f.cost):'—';$('#earnProfit').textContent=km>0?brl(f.profit):'—';const {start,end}=periodDates(),days=[];const cursor=new Date(start);cursor.setHours(0,0,0,0);const last=new Date(end);last.setHours(0,0,0,0);let guard=0;while(cursor<=last&&guard<93){const key=localDateKey(cursor),rs=state.races.filter(r=>r.status==='done'&&localDateKey(r.completedAt)===key),rf=financialSnapshot(rs);days.push({label:cursor.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),fullLabel:cursor.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}),value:rf.fee,count:rs.length,financial:rf});cursor.setDate(cursor.getDate()+1);guard++}if(!days.length)days.push({label:'—',fullLabel:'Sem dados',value:0,count:0,financial:{fee:0,km:0,cost:0,profit:0}});const periodLegend={today:'Hoje',week:'7 dias',month:'Mês',custom:formatDateRangeLabel(start,end)}[currentPeriod]||'Período';if($('#earnChartLegend'))$('#earnChartLegend').textContent=periodLegend;if($('#tripChartLegend'))$('#tripChartLegend').textContent=periodLegend;renderBarChart('#earnChart',days,x=>brl(x));renderBarChart('#tripChart',days.map(x=>({...x,value:x.count})),x=>String(x));const best=[...days].filter(x=>x.count>0).sort((a,b)=>b.value-a.value)[0];$('#bestDay').textContent=best?.label||'—';$('#bestDayValue').textContent=best?`${brl(best.value)} em taxas · ${best.count} entrega(s)`:'Nenhuma entrega finalizada no período.';const goal=num(state.settings.dailyGoal),todayFee=financialSnapshot(todayRows()).fee,goalPct=goal?Math.min(100,todayFee/goal*100):0;if($('#earnGoalText'))$('#earnGoalText').textContent=goal?`${brl(todayFee)} de ${brl(goal)} · ${Math.round(goalPct)}%`:t('goalUnset');if($('#earnGoalBar'))$('#earnGoalBar').style.width=goalPct+'%';const closures=state.settings.dayClosures||[];const cb=$('#dayClosures');if(cb){const groups={};closures.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(x=>{const d=new Date(x.date+'T12:00:00'),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label=d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});(groups[key]??={label,items:[]}).items.push(x)});cb.innerHTML=Object.keys(groups).length?Object.entries(groups).map(([key,g])=>`<div class="closureGroup"><button class="closureGroupHead" data-closure-group="${key}"><b>${g.label}</b><span>${g.items.length} fechamento(s) · ${brl(g.items.reduce((a,x)=>a+num(x.profit),0))}</span><i>›</i></button><div class="closureGroupBody" data-closure-body="${key}" hidden>${g.items.map(x=>`<button class="closureRow" data-closure-date="${x.date}"><b>${new Date(x.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})}</b><span>${x.trips} entregas · ${num(x.km).toFixed(1).replace('.',',')} km</span><strong>${brl(x.profit)}</strong></button>`).join('')}</div></div>`).join(''):'<div class="empty mini"><small>Nenhum fechamento salvo ainda.</small></div>';cb.querySelectorAll('[data-closure-group]').forEach(b=>b.onclick=()=>{const body=cb.querySelector(`[data-closure-body="${b.dataset.closureGroup}"]`);body.hidden=!body.hidden;b.querySelector('i').textContent=body.hidden?'›':'⌄'});cb.querySelectorAll('[data-closure-date]').forEach(b=>b.onclick=()=>{const x=closures.find(c=>c.date===b.dataset.closureDate);if(!x)return;modal('Fechamento do dia',`<p><b>${new Date(x.date+'T12:00:00').toLocaleDateString('pt-BR')}</b></p><div class="detailGrid"><div><small>Entregas</small><b>${x.trips}</b></div><div><small>Km</small><b>${num(x.km).toFixed(1).replace('.',',')}</b></div><div><small>Taxas</small><b>${brl(x.fee)}</b></div><div><small>Custo</small><b>${brl(x.cost)}</b></div><div><small>Resultado</small><b>${brl(x.profit)}</b></div></div>`,[])})}}
function renderHome(){const d=state.races.filter(r=>r.status==='done'&&r.completedAt?.slice(0,10)===today()),km=d.reduce((a,r)=>a+num(r.distanceKm),0),fee=d.reduce((a,r)=>a+(r.deliveryFee??calcFeeForRace(r)),0);$('#todayValue').textContent=brl(fee);$('#todayKm').textContent=km.toFixed(1).replace('.',',');$('#todayCount').textContent=d.length;$('#todayPerKm').textContent=brl(km?fee/km:0);$('#todayCost').textContent=brl(calcCost(km));$('#todayProfit').textContent=brl(fee-calcCost(km));const m=today().slice(0,7);$('#monthValue').textContent=brl(state.races.filter(r=>r.status==='done'&&r.completedAt?.slice(0,7)===m).reduce((a,r)=>a+(r.deliveryFee??calcFeeForRace(r)),0));$('#openCount').textContent=state.races.filter(r=>r.status==='open').length;$('#routeCount').textContent=state.races.filter(r=>r.status==='route').length;$('#doneCount').textContent=state.races.filter(r=>r.status==='done').length;const active=state.races.filter(r=>r.status!=='done'&&r.status!=='cancelled');$('#workSummary').textContent=active.length?`${active.length} entrega(s) pendente(s)`:'Nenhuma rota em andamento';const goal=num(state.settings.dailyGoal),pct=goal?Math.min(100,fee/goal*100):0;if($('#goalProgressText'))$('#goalProgressText').textContent=goal?`${brl(fee)} de ${brl(goal)} · ${Math.round(pct)}%`:'Defina uma meta nos Ajustes';if($('#goalProgressBar'))$('#goalProgressBar').style.width=pct+'%';const last=[...state.races].filter(r=>r.status==='done'&&r.completedAt).sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt))[0],lastBox=$('#lastRaceCard');if(lastBox){if(last){lastBox.hidden=false;lastBox.innerHTML=`<div><span>Última corrida entregue</span><b>${esc(last.orderNo?`#${last.orderNo} · ${last.client}`:last.client)}</b><small>${esc(last.address)}</small></div><div class="lastRaceMeta"><strong>${last.deliveryFee!=null?brl(last.deliveryFee):'—'}</strong><small>${last.distanceKm!=null?last.distanceKm.toFixed(1).replace('.',',')+' km':'—'}</small></div><button class="textBtn" data-home-last="${last.id}">Detalhes</button>`;$('#lastRaceCard').querySelector('[data-home-last]').onclick=()=>openRaceDetails(last.id)}else{lastBox.hidden=false;lastBox.innerHTML='<div><span>Última corrida entregue</span><b>Nenhuma entrega finalizada ainda.</b></div>'}}const canceledToday=state.races.filter(r=>r.status==='cancelled'&&r.cancelledAt?.slice(0,10)===today()).length,pending=state.races.filter(r=>!['done','cancelled'].includes(r.status)).length;const js=$('#journeySummary');if(js)js.innerHTML=`<div><b>${d.length}</b><span>entregues</span></div><div><b>${canceledToday}</b><span>canceladas</span></div><div><b>${pending}</b><span>pendentes</span></div><div><b>${brl(fee-calcCost(km))}</b><span>resultado</span></div>`}
function renderSettings(){const s=state.settings;$('#restaurantName').value=s.restaurantName||'';$('#restaurantPhone').value=s.restaurantPhone||'';$('#restaurantNote').value=s.restaurantNote||'';$('#driverName').value=s.driverName||'';$('#trackingEnabled').checked=s.trackingEnabled!==false;$('#minFee').value=s.minFee;$('#costKm').value=s.costKm;$('#googleLimit').value=s.googleLimit;$('#wazeLimit').value=1;$('#arrivalRadiusM').value=s.arrivalRadiusM||10;$('#themeMode').value=s.theme||'auto';$('#accentColor').value=s.accent||defaults.accent;$('#highContrast').checked=!!s.highContrast;$('#autoWork').checked=!!s.autoWork;$('#addressMode').value=s.addressMode||'full';$('#autoNext').checked=s.autoNext!==false;$('#autoReorder').checked=s.autoReorder!==false;$('#oneHandedMode').checked=!!s.oneHandedMode;$('#pendingAlertMinutes').value=s.pendingAlertMinutes;$('#pausedAlertMinutes').value=s.pausedAlertMinutes;$('#alertDisplaySeconds').value=s.alertDisplaySeconds;$('#alertRepeatMinutes').value=s.alertRepeatMinutes;document.body.classList.toggle('oneHanded',!!s.oneHandedMode);$('#dailyGoal').value=s.dailyGoal||'';$('#returnChargeEnabled').checked=s.returnChargeEnabled!==false;$('#returnChargeMode').value=s.returnChargeMode||'full';$('#returnAutoLink').checked=s.returnAutoLink!==false;$('#tiers').innerHTML='';s.tiers.forEach((t,i)=>addTierEl(t,i));updateSimulation();applyTheme();applyLanguage();if(!document.querySelector('.settingsPanel:not([hidden])')&&!document.querySelector('.settingsPanel[data-settings-panel="driver"]')?.dataset.initialized){const d=document.querySelector('.settingsPanel[data-settings-panel="driver"]');if(d){d.dataset.initialized='1';openSettingsPanel('driver')}}}
function openSettingsPanel(id){const target=document.querySelector(`[data-settings-panel="${id}"]`);const wasOpen=target&&!target.hidden;document.querySelectorAll('[data-settings-panel]').forEach(p=>p.hidden=true);document.querySelectorAll('[data-settings-open]').forEach(b=>b.setAttribute('aria-expanded','false'));if(target&&!wasOpen){target.hidden=false;const trigger=document.querySelector(`[data-settings-open="${id}"]`);trigger?.setAttribute('aria-expanded','true')}}
$$('[data-settings-open]').forEach(b=>{b.setAttribute('aria-expanded','false');b.onclick=()=>openSettingsPanel(b.dataset.settingsOpen)});syncRaceFilterUI();$('#languageMode').onchange=async()=>{state.settings.language=$('#languageMode').value;applyLanguage();await persistOnly();renderAll()};
function addTierEl(t,i){const d=document.createElement('div');d.className='tier';d.innerHTML=`<input data-tier-max type="number" step=".1" placeholder="sem limite" value="${t.max??''}"><span>km →</span><input data-tier-rate type="number" step=".01" value="${t.rate}"><button type="button">×</button>`;d.querySelector('button').onclick=()=>{state.settings.tiers.splice(i,1);renderSettings()};$('#tiers').appendChild(d)}$('#addTier').onclick=()=>{state.settings.tiers.push({max:null,rate:1});renderSettings()};$('#simKm').oninput=updateSimulation;function updateSimulation(){const k=num($('#simKm').value);$('#simFee').textContent=brl(calcFee(k));$('#simText').textContent=`Para ${k.toFixed(1)} km, aplica-se o maior valor entre a soma das faixas e a taxa mínima.`}
$('#saveSettings').onclick=async()=>{const tiers=$$('.tier').map(d=>({max:d.querySelector('[data-tier-max]').value===''?null:num(d.querySelector('[data-tier-max]').value),rate:num(d.querySelector('[data-tier-rate]').value)})).sort((a,b)=>(a.max??Infinity)-(b.max??Infinity));state.settings=normalizeSettings({...state.settings,minFee:num($('#minFee').value),costKm:num($('#costKm').value),googleLimit:Math.min(4,Math.max(1,Math.round(num($('#googleLimit').value)))),wazeLimit:1,restaurantName:$('#restaurantName').value.trim(),restaurantPhone:$('#restaurantPhone').value.trim(),restaurantNote:$('#restaurantNote').value.trim(),driverName:$('#driverName').value.trim(),trackingEnabled:$('#trackingEnabled').checked,theme:$('#themeMode').value,accent:$('#accentColor').value,highContrast:$('#highContrast').checked,autoWork:$('#autoWork').checked,addressMode:$('#addressMode').value,autoNext:$('#autoNext').checked,autoReorder:$('#autoReorder').checked,oneHandedMode:$('#oneHandedMode').checked,pendingAlertMinutes:Math.max(1,Math.round(num($('#pendingAlertMinutes').value))),pausedAlertMinutes:Math.max(1,Math.round(num($('#pausedAlertMinutes').value))),alertDisplaySeconds:Math.max(1,Math.round(num($('#alertDisplaySeconds').value))),alertRepeatMinutes:Math.max(1,Math.round(num($('#alertRepeatMinutes').value))),dailyGoal:num($('#dailyGoal').value),returnChargeEnabled:$('#returnChargeEnabled').checked,returnChargeMode:$('#returnChargeMode').value,returnAutoLink:$('#returnAutoLink').checked,arrivalRadiusM:num($('#arrivalRadiusM').value)||10,language:$('#languageMode').value,dayClosures:state.settings.dayClosures||[],tiers:tiers.length?tiers:structuredClone(defaults.tiers)});applyTheme();await recalcAllFees();await saveAll({recalcRoute:true});toast('Ajustes salvos e valores atualizados em todo o app.')};const autoSettingInputs=['#minFee','#costKm','#googleLimit','#wazeLimit','#arrivalRadiusM','#dailyGoal','#returnChargeEnabled','#returnChargeMode','#returnAutoLink','#restaurantName','#restaurantPhone','#restaurantNote','#driverName','#trackingEnabled','#autoWork','#addressMode','#autoNext','#autoReorder','#oneHandedMode','#pendingAlertMinutes','#pausedAlertMinutes','#alertDisplaySeconds','#alertRepeatMinutes'];let autoSettingsTimer=null;function scheduleSettingsSync(){clearTimeout(autoSettingsTimer);autoSettingsTimer=setTimeout(async()=>{const tiers=$$('.tier').map(d=>({max:d.querySelector('[data-tier-max]').value===''?null:num(d.querySelector('[data-tier-max]').value),rate:num(d.querySelector('[data-tier-rate]').value)})).sort((a,b)=>(a.max??Infinity)-(b.max??Infinity));state.settings=normalizeSettings({...state.settings,minFee:num($('#minFee').value),costKm:num($('#costKm').value),googleLimit:Math.min(4,Math.max(1,Math.round(num($('#googleLimit').value)))),wazeLimit:1,restaurantName:$('#restaurantName').value.trim(),restaurantPhone:$('#restaurantPhone').value.trim(),restaurantNote:$('#restaurantNote').value.trim(),driverName:$('#driverName').value.trim(),trackingEnabled:$('#trackingEnabled').checked,autoWork:$('#autoWork').checked,addressMode:$('#addressMode').value,autoNext:$('#autoNext').checked,autoReorder:$('#autoReorder').checked,oneHandedMode:$('#oneHandedMode').checked,pendingAlertMinutes:Math.max(1,Math.round(num($('#pendingAlertMinutes').value))),pausedAlertMinutes:Math.max(1,Math.round(num($('#pausedAlertMinutes').value))),alertDisplaySeconds:Math.max(1,Math.round(num($('#alertDisplaySeconds').value))),alertRepeatMinutes:Math.max(1,Math.round(num($('#alertRepeatMinutes').value))),dailyGoal:num($('#dailyGoal').value),returnChargeEnabled:$('#returnChargeEnabled').checked,returnChargeMode:$('#returnChargeMode').value,returnAutoLink:$('#returnAutoLink').checked,arrivalRadiusM:num($('#arrivalRadiusM').value)||10,dayClosures:state.settings.dayClosures||[],tiers:tiers.length?tiers:structuredClone(defaults.tiers)});document.body.classList.toggle('oneHanded',!!state.settings.oneHandedMode);await recalcAllFees();await persistOnly();toast('Configuração atualizada automaticamente.');},500)}autoSettingInputs.forEach(sel=>{const el=$(sel);el?.addEventListener('input',scheduleSettingsSync);el?.addEventListener('change',scheduleSettingsSync)});$('#tiers')?.addEventListener('input',scheduleSettingsSync);$('#tiers')?.addEventListener('change',scheduleSettingsSync);$('#oneHandedMode')?.addEventListener('change',scheduleSettingsSync);
$('#themeMode').onchange=async()=>{state.settings.theme=$('#themeMode').value;applyTheme();await persistOnly()};$('#accentColor').oninput=async()=>{state.settings.accent=$('#accentColor').value;applyTheme();await persistOnly()};$('#highContrast').onchange=async()=>{state.settings.highContrast=$('#highContrast').checked;applyTheme();await persistOnly()};
async function importBackupFile(f){if(!f)return;try{const x=JSON.parse(await f.text());if(x?.app&&x.app!=='Rota Moto')throw Error();if(!Array.isArray(x.races)||!x.settings)throw Error();state.races=x.races;state.settings=normalizeSettings(x.settings);optimizedOrder=[];applyTheme();await persistOnly();renderAll();toast('Backup completo restaurado: corridas e configurações.')}catch{toast('Backup inválido ou incompatível com o Rota Moto.','error')}}
$('#exportData').onclick=async()=>{try{const blob=new Blob([JSON.stringify({app:'Rota Moto',version:8,protocolVersion:1,schemaVersion:1,exportedAt:new Date().toISOString(),races:state.races,settings:state.settings},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='rota-moto-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);toast('Backup completo exportado.')}catch(e){console.warn(e);toast('Não foi possível exportar o backup.','error')}};window.RotaMotoSync=Object.assign(window.RotaMotoSync||{},{version:1,protocolVersion:1,buildPacket:buildSyncPacket,exportPacket:async()=>{const p=await buildSyncPacket();downloadSyncPacket(p);return p;}});window.RotaMotoSync.receiveRestaurant=receiveRestaurantPacket;window.RotaMotoSync.importRestaurantPacket=stageRestaurantPacket;$('#importRestaurantSync')?.addEventListener('click',()=>$('#restaurantSyncFile')?.click());$('#restaurantSyncFile')?.addEventListener('change',e=>{stageRestaurantPacket(e.target.files?.[0]);e.target.value=''});$('#importData').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{await importBackupFile(e.target.files[0]);e.target.value=''};
const drop=$('#backupDrop');if(drop){['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('dragover')}));['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('dragover')}));drop.addEventListener('drop',e=>importBackupFile(e.dataTransfer.files[0]))}
$('#clearData').onclick=()=>modal('Apagar histórico','Isso remove as corridas, eventos, comprovantes, localizações, ganhos e recibos deste aparelho. Os ajustes e tombstones de sincronização permanecem.',[{label:'Cancelar'},{label:'Apagar tudo',primary:true,onClick:async()=>{try{const deletedAt=new Date().toISOString();const tombstones=state.races.map(r=>{const rev=RotaMotoContract.revise(r);return{id:r.deliveryId||r.id,store:'deliveries',companyId:r.companyId||state.settings.companyId||'company_local',deleted:true,deletedAt,updatedAt:rev.updatedAt,version:rev.version}});await tx(['races','deliveries','tombstones','deliveryEvents','locations','proofs','earnings','outbox','inbox','syncState'],'readwrite',t=>{for(const store of ['races','deliveries','deliveryEvents','locations','proofs','earnings','outbox','inbox','syncState'])t.objectStore(store).clear();for(const tombstone of tombstones)t.objectStore('tombstones').put(tombstone)});state.races=[];optimizedOrder=[];renderAll();toast('Histórico apagado.')}catch(error){console.error('history deletion failed',error);toast('Não foi possível apagar o histórico. Nenhuma alteração foi confirmada.','error')}}}]);
function renderAll(){renderHome();renderRaces();renderSettings();if($('#routesScreen').classList.contains('active')){restoreRouteOrder();renderRouteOrder(optimizedOrder);renderRouteGroups();renderRouteInfo(optimizedOrder);evaluateManualOrder();renderRoutePreview(optimizedOrder);setTimeout(()=>{if($('#routesScreen').classList.contains('active')&&optimizedOrder.length)requestRoadDistances(optimizedOrder)},60)}if($('#mapScreen').classList.contains('active')){restoreRouteOrder();renderRouteMap();renderWorkNext()}if($('#earnings').classList.contains('active'))renderEarnings();applyLanguage()}
async function runDiagnostics(){const el=$('#diagnosticStatus');if(el)el.innerHTML='<span class="diagItem warn">Verificando GPS…</span>';const gpsCheck=await (async()=>{try{const p=await getPosition();setDriverPosition(p.coords.latitude,p.coords.longitude,p.coords.accuracy);return true}catch(e){return false}})();const checks=[['Armazenamento local',!!dbReady],['GPS',gpsCheck],['Corridas salvas',Array.isArray(state.races)],['Configurações',!!state.settings],['Modo offline',navigator.onLine||'Sem internet — dados locais disponíveis']];const ok=checks.every(x=>x[1]===true||x[1]===undefined||typeof x[1]==='string');if(el)el.innerHTML=checks.map(x=>`<span class="diagItem ${x[1]===true?'ok':'warn'}">${x[0]}: ${x[1]===true?'OK':typeof x[1]==='string'?x[1]:'aguardando'}</span>`).join('');toast(ok?'Verificação concluída.':'Verificação concluída com itens para revisar.',ok?'ok':'error')}$('#diagnosticBtn')?.addEventListener('click',runDiagnostics);const systemThemeMedia=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;if(systemThemeMedia){const onSystemThemeChange=()=>{if((state.settings||defaults).theme==='auto')applyTheme()};systemThemeMedia.addEventListener?.('change',onSystemThemeChange);systemThemeMedia.addListener?.(onSystemThemeChange)}

(async()=>{await loadDB();await normalizeMotoData();runUiIntegrityCheck();applyTheme();renderAll();syncRaceFilterUI();syncEarningsPeriodUI();show(state.settings.autoWork&&routeRaces().length?'mapScreen':'home')})();

window.addEventListener('offline',()=>{setRouteStatus('Sem internet. Corridas e configurações continuam salvas no aparelho; mapas/rotas externos podem ficar indisponíveis.')});window.addEventListener('online',()=>{setRouteStatus('Conexão restaurada.');toast('Conexão com a internet restaurada.')});
