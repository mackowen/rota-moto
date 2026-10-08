const CACHE='rota-moto-v42.4';
const ASSETS=['./','./index.html','./styles.css?v=42.3','./navigation-intents.js?v=1','./navigation-workflow.js?v=1','./contract.js?v=1','./backup-format.js?v=1','./sync-reconciliation.js?v=2','./execution-workflow.js?v=2','./indexeddb-schema.js?v=2','./delivery-qr.js?v=1','./qr-decoder.js?v=1','./ocr/normalization.js?v=1','./ocr/semantic-parser.js?v=1','./ocr/image-preprocessor.js?v=1','./ocr/pipeline.js?v=1','./vendor/tesseract/tesseract.min.js?v=5.1.1','./vendor/tesseract/worker/worker.min.js','./vendor/tesseract/core/tesseract-core-lstm.wasm.js','./vendor/tesseract/lang/4.0.0_best_int/por.traineddata.gz','./app.js?v=42.3','./identity-ui.css','./identity-session-guard.js','./identity-ui.js','./vendor/leaflet/leaflet.css','./vendor/leaflet/leaflet.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png'];
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
