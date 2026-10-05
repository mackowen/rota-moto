(() => {
  'use strict';
  const N = globalThis.RotaMotoOcrNormalization || (typeof require === 'function' ? require('./normalization') : null);
  const THRESHOLDS = Object.freeze({ orderNo:.75, origin:.78, customer:.76, phone:.92, address:.88, number:.9, complement:.76,
    neighborhood:.78, city:.78, state:.9, postalCode:.92, reference:.76, items:.78, notes:.78, value:.94, paymentMethod:.9 });
  const LABELS = Object.freeze({ orderNo:['pedido','comanda','ordem','número do pedido','numero do pedido','order'], customer:['cliente','nome','destinatário','destinatario','recebedor'],
    phone:['telefone','celular','fone','contato','whatsapp','tel'], address:['endereço','endereco','entrega em','destino','logradouro'], complement:['complemento','complemento/apto','apto','apartamento','bloco'],
    neighborhood:['bairro','vila','região','regiao'], city:['cidade','município','municipio'], state:['uf','estado'], postalCode:['cep','c.e.p.'],
    reference:['referência','referencia','ponto de referência','ponto de referencia'], items:['itens','produtos','descrição','descricao'], notes:['observação','observacao','instruções','instrucoes','nota','obs'],
    value:['valor total','total','valor','a pagar'], paymentMethod:['forma de pagamento','pagamento','pago com','payment'] });
  const norm = value => N.stripMarks(value).toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
  const clamp = value => Math.max(0, Math.min(1, value));
  function parseLines(input) {
    if (Array.isArray(input)) return input.map((line,index)=>typeof line==='string'?{text:N.normalizeOcrText(line),confidence:.76,index}:{text:N.normalizeOcrText(line?.text),confidence:clamp(Number(line?.confidence)>1?Number(line.confidence)/100:Number(line?.confidence??.76)),bbox:line?.bbox||null,index}).filter(line=>line.text);
    return N.normalizeOcrText(input).split(/\n+/u).map((text,index)=>({text,confidence:.76,index})).filter(line=>line.text);
  }
  function parseReceipt(input) {
    const lines=parseLines(input), candidates=Object.fromEntries(Object.keys(THRESHOLDS).map(field=>[field,[]]));
    const add=(field,value,line,semantic,provenance,warning=null)=>{
      const clean=String(value??'').trim(); if(!clean)return;
      const confidence=Number(clamp(line.confidence*.65+semantic*.35).toFixed(3));
      candidates[field].push({value:clean,confidence,ocrConfidence:Number(line.confidence.toFixed(3)),provenance,evidence:line.text.slice(0,180),bbox:line.bbox||null,warnings:warning?[warning]:[]});
    };
    const labeled=(line,field)=>{
      const text=norm(line.text);
      for(const label of LABELS[field]){const normalized=norm(label);if(text===normalized||text.startsWith(`${normalized} `)){
        const separator=line.text.match(/^\s*([^:–—-]{2,48})\s*[:–—-]\s*(.*)$/u);
        if(separator&&norm(separator[1])===normalized&&separator[2].trim())return separator[2].trim();
        const original=line.text.trim();if(original.toLowerCase().startsWith(label.toLowerCase())){const rest=original.slice(label.length).replace(/^\s*[:#–—-]?\s*/u,'');if(rest)return rest}
      }}return null;
    };
    for(const line of lines){
      for(const field of ['orderNo','customer','phone','address','complement','neighborhood','city','state','postalCode','reference','notes','value','paymentMethod']){
        const value=labeled(line,field);if(value){
          if(field==='value'&&/^\s*total\s+(?:de\s+)?(?:itens|produtos|unidades|quantidade)\b/iu.test(line.text))continue;
          let normalized=value,warning=null;
          if(field==='phone'){const result=N.normalizePhone(value);normalized=result.value;warning=result.warning}
          if(field==='postalCode'){const result=N.normalizePostalCode(value);normalized=result.value;warning=result.warning}
          if(field==='state'){const result=N.normalizeState(value);normalized=result.value;warning=result.warning}
          if(field==='value'){const amounts=[...value.matchAll(/(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d{1,7})[,.]\d{2}/gu)];const result=N.parseBrl(value);normalized=amounts.length===1?result.value:'';warning=amounts.length>1?'Mais de um valor monetário na mesma linha.':result.warning}
          if(field==='city'){
            const postal=value.match(/(?:\s*[-,]?\s*CEP\s*:?)?\s*(\d{5}-?\d{3})\s*$/iu);let cityValue=value;
            if(postal){const cep=N.normalizePostalCode(postal[1]);if(cep.valid)add('postalCode',cep.value,line,.94,'city-suffix-cep');cityValue=value.slice(0,postal.index).replace(/[\s,-]+$/u,'')}
            const suffix=cityValue.match(/\s*[-,]\s*([A-Z]{2})\s*$/u);if(suffix){const state=N.normalizeState(suffix[1]);if(state.valid)add('state',state.value,line,.94,'city-suffix-state');cityValue=cityValue.slice(0,suffix.index)}normalized=cityValue.trim();
          }
          if(field==='address'){normalized=N.normalizeStreet(value);const number=N.normalizeAddressNumber(normalized);if(number.valid)add('number',number.value,line,.88,'address-label-number')}
          if(field==='orderNo')normalized=value.replace(/^(?:n(?:[º°.]|úmero)?\s*|#)/iu,'').replace(/\s+/gu,' ').trim().slice(0,80);
          add(field,normalized,line,.96,`label:${field}`,warning);
        }
      }
      const platform=line.text.match(/\b(i\s*food|ifood|99\s*food|keeta)\b/iu);
      if(platform){const raw=platform[1].toLowerCase().replace(/\s+/gu,'');const value=raw==='99food'?'99Food':raw==='keeta'?'Keeta':'iFood';add('origin',value,line,.96,'platform-alias')}
      if(!candidates.phone.some(candidate=>candidate.provenance.startsWith('label:'))){
        for(const match of line.text.matchAll(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4,5}[-.\s]?\d{4}/gu)){
          const phone=N.normalizePhone(match[0]);if(phone.valid)add('phone',phone.value,line,.82,'br-phone-pattern');
        }
      }
      const street=line.text.match(/\b(rua|r\.?|avenida|av\.?|travessa|trav?\.?|tv\.?|alameda|al\.?|estrada|rodovia|pra[cç]a)\s+([^,;]+(?:,\s*(?:n[º°.]?\s*)?\d{1,5}[A-Za-z]?)?)/iu);
      if(street&&!candidates.address.some(candidate=>candidate.provenance==='label:address')){
        const value=N.normalizeStreet(street[0]),ocrConfusion=/\p{L}\p{N}|\p{N}\p{L}/u.test(value);add('address',value,line,ocrConfusion?0.28:0.78,'street-pattern',ocrConfusion?'Possível confusão entre letra e número; confira o texto.':null);
        const number=N.normalizeAddressNumber(value);if(number.valid)add('number',number.value,line,ocrConfusion?0.28:.8,'address-number',ocrConfusion?'Possível confusão entre letra e número; confira o texto.':null);
      }
      if(!candidates.postalCode.some(candidate=>candidate.provenance.startsWith('label:'))){const cep=line.text.match(/\b\d{5}-?\d{3}\b/u);if(cep){const result=N.normalizePostalCode(cep[0]);if(result.valid)add('postalCode',result.value,line,.9,'br-cep-pattern')}}
      if(!candidates.value.some(candidate=>candidate.provenance.startsWith('label:'))&&/\b(total|a pagar|valor)\b/iu.test(line.text)){
        for(const amount of line.text.matchAll(/(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d{1,7})[,.]\d{2}/gu)){const result=N.parseBrl(amount[0]);if(result.valid)add('value',result.value,line,.8,'brl-context')}
      }
      const state=line.text.match(/\b([A-Z]{2})\b/u);if(state&&!candidates.state.some(candidate=>candidate.provenance.startsWith('label:'))){const result=N.normalizeState(state[1]);if(result.valid)add('state',result.value,line,.48,'uf-pattern')}
    }
    const orderLine=lines.find(line=>/\b(?:pedido|comanda|ordem|order)\s*(?:n[º°.]?\s*)?[#:-]?\s*[A-Z0-9][A-Z0-9/-]{1,}/iu.test(line.text));
    if(orderLine&&!candidates.orderNo.length){const value=orderLine.text.match(/\b(?:pedido|comanda|ordem|order)\s*(?:n[º°.]?\s*)?[#:-]?\s*([A-Z0-9][A-Z0-9/-]{1,})/iu)?.[1];add('orderNo',value,orderLine,.84,'order-pattern')}
    const itemStart=lines.findIndex(line=>LABELS.items.some(label=>norm(line.text).startsWith(norm(label))));
    if(itemStart>=0){const stop=/^(?:subtotal|total|valor total|pagamento|forma de pagamento|troco|observa[cç][aã]o|entrega|a pagar)\b/iu;const itemLines=lines.slice(itemStart+1).filter(line=>!stop.test(line.text)&&line.text.length<140);if(itemLines.length){const confidence=itemLines.reduce((sum,line)=>sum+line.confidence,0)/itemLines.length;add('items',itemLines.map(line=>line.text).join('\n'),{...lines[itemStart],confidence},.82,'section:items')}}
    if(!candidates.items.length){const itemLines=lines.filter(line=>/^\s*(?:\d{1,2}\s*[x×]\s*|[•*-]\s+)[\p{L}\p{N}]/iu.test(line.text));if(itemLines.length>1)add('items',itemLines.map(line=>line.text.trim()).join('\n'),{...itemLines[0],confidence:itemLines.reduce((sum,line)=>sum+line.confidence,0)/itemLines.length},.7,'item-line-pattern')}
    const all=lines.map(line=>line.text).join('\n');
    const knownOrigin=all.match(/\b(i\s*food|ifood|99\s*food|keeta)\b/iu);if(knownOrigin&&!candidates.origin.length){const raw=knownOrigin[1].toLowerCase().replace(/\s+/gu,'');candidates.origin.push({value:raw==='99food'?'99Food':raw==='keeta'?'Keeta':'iFood',confidence:.92,ocrConfidence:.8,provenance:'platform-alias',evidence:knownOrigin[0],warnings:[]})}
    const fields={};for(const [field,list]of Object.entries(candidates)){
      const byValue=new Map();for(const candidate of list){const key=norm(candidate.value),previous=byValue.get(key);if(!previous||candidate.confidence>previous.confidence)byValue.set(key,candidate)}const dedup=[...byValue.values()].sort((a,b)=>b.confidence-a.confidence);candidates[field]=dedup;
      const conflict=dedup.length>1&&dedup[0].confidence-dedup[1].confidence<.12;
      const selected=dedup[0]&&dedup[0].confidence>=THRESHOLDS[field]&&!conflict?dedup[0]:null;
      fields[field]={value:selected?.value??'',confidence:selected?.confidence??(dedup[0]?.confidence??0),status:!dedup.length?'missing':conflict?'conflict':selected?'high':'review',candidates:dedup,warnings:conflict?['Candidatos divergentes; confira manualmente.']:dedup[0]?.warnings||[]};
    }
    return Object.freeze({version:1,fields,candidates,lines:lines.map(line=>({text:line.text,confidence:line.confidence,bbox:line.bbox||null})),requiresHumanReview:true});
  }
  const api=Object.freeze({THRESHOLDS,LABELS,parseLines,parseReceipt});globalThis.RotaMotoOcrSemantic=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
