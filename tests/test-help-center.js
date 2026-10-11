'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('service-worker.js','utf8');
for(const title of ['Primeiros passos','Vínculo com a empresa','Disponibilidade','Receber entregas','Como seguir a rota','Google Maps','Waze','OsmAnd','Trabalhar sem internet','Atualizar o status','Comprovante de entrega','QR da entrega','Ler comanda (OCR)','Problemas, devolução e nova tentativa','Ganhos','Meta diária','Envio de dados','Problemas comuns'])assert.ok(app.includes(title),`help topic: ${title}`);
assert.match(html,/id="helpScreen"/u);assert.match(app,/function renderHelp\(\)/u);assert.match(app,/function filterHelp\(\)/u);assert.match(sw,/app\.js\?v=0139\.1/u,'help content is cached as part of app bundle');
console.log('Motoboy local Help Center content/search/offline contract: PASS');
