const CACHE='rota-moto-v40.8';
const ASSETS=['./','./index.html','./styles.css?v=39.7','./contract.js?v=1','./backup-format.js?v=1','./sync-reconciliation.js?v=2','./execution-workflow.js?v=2','./indexeddb-schema.js?v=2','./app.js?v=40.2','./identity-ui.css','./identity-session-guard.js','./identity-ui.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('rota-moto-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||event.request.cache==='no-store')return;
 const url=new URL(event.request.url);
 if(url.origin!==location.origin||/^\/api(?:\/|$)/u.test(url.pathname))return;
 const assetUrls=new Set(ASSETS.map(asset=>new URL(asset,self.location.href).href));
 if(!assetUrls.has(url.href))return;
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)).catch(()=>
  new Response('',{status:503,statusText:'Offline asset unavailable',headers:{'Cache-Control':'no-store'}})));
});
