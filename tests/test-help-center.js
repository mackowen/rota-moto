'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('service-worker.js','utf8'),styles=fs.readFileSync('styles.css','utf8');
for(const title of ['Primeiros passos','Vínculo com o restaurante','Disponibilidade','Receber entregas','Como seguir a rota','Google Maps','Waze','OsmAnd','Trabalhar sem internet','Atualizar uma entrega','Comprovante de entrega','QR da entrega','Ler comanda','Problemas e devoluções','Ganhos','Meta diária','Envio de dados','Problemas comuns'])assert.ok(app.includes(title),`help topic: ${title}`);
assert.ok(app.includes('O Waze abre um destino por vez.'),'help uses plain language for navigation limits');
assert.ok(!app.includes('<small>${esc(keywords)}</small>'),'search keywords are not rendered as user-facing jargon');
assert.match(html,/id="helpScreen"/u);assert.match(app,/function renderHelp\(\)/u);assert.match(app,/function filterHelp\(\)/u);assert.match(sw,/app\.js\?v=0140\.6/u,'help content is cached as part of app bundle');
assert.match(styles,/\.helpIndex:not\(\[open\]\)>nav\{display:none\}/u,'collapsed Help index does not render its links');assert.match(styles,/\.helpIndex\[open\]>nav\{position:static;display:grid/u,'expanded Help index stays in document flow');assert.match(styles,/\.helpIndex\[open\]>summary::after\{content:"▾"\}/u,'expanded Help index exposes a visual state indicator');
console.log('Motoboy local Help Center content/search/offline contract: PASS');
