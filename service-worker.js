const CACHE='rota-moto-v40.3';
const ASSETS=['./','./index.html','./styles.css?v=39.6','./contract.js?v=1','./backup-format.js?v=1','./sync-reconciliation.js?v=1','./execution-workflow.js?v=1','./indexeddb-schema.js?v=2','./app.js?v=40.1','./identity-ui.css','./identity-ui.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||event.request.cache==='no-store')return;
 const url=new URL(event.request.url);
 // Authenticated identity/domain responses must never be persisted in Cache Storage.
 if(url.origin===location.origin&&/^\/api(?:\/|$)/u.test(url.pathname))return;
 if(url.origin===location.origin&&['/index.html','/app.js','/styles.css'].some(path=>url.pathname.endsWith(path))){
  event.respondWith(fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response}).catch(()=>caches.match(event.request).then(response=>response||caches.match('./'))));return;
 }
 event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request).then(network=>{if(network.ok&&url.origin===location.origin)caches.open(CACHE).then(cache=>cache.put(event.request,network.clone()));return network}).catch(()=>undefined)));
});
