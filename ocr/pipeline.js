(() => {
  'use strict';
  const Image=globalThis.RotaMotoOcrImage||(typeof require==='function'?require('./image-preprocessor'):null);
  const Semantic=globalThis.RotaMotoOcrSemantic||(typeof require==='function'?require('./semantic-parser'):null);
  const ASSETS=Object.freeze({workerPath:'/vendor/tesseract/worker/worker.min.js',corePath:'/vendor/tesseract/core/tesseract-core-lstm.wasm.js',langPath:'/vendor/tesseract/lang/4.0.0_best_int'});
  function error(code){const e=new Error(code);e.code=code;return e}
  async function analyzeImage(file,{tesseract=globalThis.Tesseract,onProgress=()=>{},clock=()=>performance.now(),signal}={}){
    if(!tesseract||typeof tesseract.createWorker!=='function')throw error('OCR_ENGINE_UNAVAILABLE');
    const started=clock(),prepared=await Image.preprocessImage(file,{signal,onProgress:progress=>onProgress({phase:'preprocess',progress})});let worker,abortHandler;
    try{
      if(signal?.aborted)throw error('OCR_CANCELLED');
      worker=await tesseract.createWorker('por',1,{...ASSETS,gzip:true,cacheMethod:'none',logger:event=>{if(Number.isFinite(event?.progress))onProgress({phase:'recognize',progress:Math.max(0,Math.min(1,event.progress))})}});
      abortHandler=()=>{try{worker?.terminate()}catch(_){}};signal?.addEventListener('abort',abortHandler,{once:true});
      await worker.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_pageseg_mode:'6',language_model_penalty_non_freq_dict_word:'0.05'});
      const recognized=[];for(let index=0;index<prepared.variants.length;index++){
        if(signal?.aborted)throw error('OCR_CANCELLED');
        const result=await worker.recognize(prepared.variants[index].image);const data=result?.data||{};
        recognized.push({name:prepared.variants[index].name,data,quality:recognitionQuality(data)});
        onProgress({phase:'recognize',variant:index+1,variants:prepared.variants.length,progress:(index+1)/prepared.variants.length});
        if(index===0&&Number(data.confidence||0)>=78&&Array.isArray(data.lines)&&data.lines.length>=4)break;
      }
      if(signal?.aborted)throw error('OCR_CANCELLED');const best=recognized.sort((a,b)=>b.quality-a.quality)[0];if(!best?.data?.text?.trim())throw error('OCR_NO_TEXT');
      const lines=Array.isArray(best.data.lines)&&best.data.lines.length?best.data.lines.map(line=>({text:line.text,confidence:line.confidence,bbox:line.bbox})):best.data.text.split(/\n+/u).filter(Boolean);
      const draft=Semantic.parseReceipt(lines);return {...draft,engine:{name:'tesseract.js',version:'5.1.1',language:'por',variant:best.name,variantsUsed:recognized.length,inputScale:prepared.scale,dimensions:[prepared.width,prepared.height],durationMs:Math.max(0,Math.round(clock()-started))}};
    }catch(cause){if(signal?.aborted)throw error('OCR_CANCELLED');throw cause}finally{if(abortHandler)signal?.removeEventListener('abort',abortHandler);try{await worker?.terminate()}catch(_){}}
  }
  function recognitionQuality(data){const lines=Array.isArray(data?.lines)?data.lines:[];if(!lines.length)return Number(data?.confidence||0)*.35+Math.min(30,String(data?.text||'').length/8);const mean=lines.reduce((sum,line)=>sum+Number(line.confidence||0),0)/lines.length;return mean+Math.min(15,lines.length*.4)}
  const api=Object.freeze({ASSETS,analyzeImage,recognitionQuality});globalThis.RotaMotoOcrPipeline=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
