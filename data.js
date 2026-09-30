/* Pure data functions shared by the interface, sensor adapter and checks. */
(function(root){
  'use strict';
  function parsePH(raw){
    if(typeof raw==='number')return Number.isFinite(raw)&&raw>=0&&raw<=14?raw:null;
    if(typeof raw!=='string')return null;
    const value=raw.trim();
    if(!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value))return null;
    const number=Number(value.replace(',','.'));
    return Number.isFinite(number)&&number>=0&&number<=14?number:null;
  }
  function parseColumn(text){
    const readings=[],invalid=[];
    String(text).split(/\r\n|\n|\r/).forEach((raw,i)=>{
      if(!raw.trim())return;
      const value=parsePH(raw);
      if(value===null)invalid.push({line:i+1,value:raw});else readings.push(value);
    });
    return {readings,invalid};
  }
  function mean(readings){
    if(!readings.length)return null;
    // Compensated sum: retain input precision rather than summing display values.
    let total=0,correction=0;
    for(const reading of readings){const adjusted=reading.ph-correction;const next=total+adjusted;correction=(next-total)-adjusted;total=next;}
    return total/readings.length;
  }
  function receiveReadings(state,sourceId,values,origin='sensor',timestamp=new Date().toISOString()){
    const source=state.sources.find(s=>s.id===sourceId);
    if(!source)throw new Error('Fonte de destino desconhecida.');
    if(!Array.isArray(values)||!values.length)throw new Error('Informe ao menos uma leitura.');
    if(!['simulado','manual','colado','sensor'].includes(origin))throw new Error('Origem inválida.');
    if(typeof timestamp!=='string'||!Number.isFinite(Date.parse(timestamp)))throw new Error('Horário inválido.');
    const valid=values.map(parsePH);
    if(valid.some(v=>v===null))throw new Error('Cada pH deve ser um número entre 0 e 14.');
    const start=source.readings.length;
    const added=valid.map((ph,i)=>({id:sourceId+'-'+(start+i+1),sourceId,timestamp,ph,origin}));
    source.readings.push(...added);
    return added;
  }
  function seedState(now=Date.now()){
    const state={version:1,secondSource:false,running:true,sources:[{id:'fonte-1',readings:[]},{id:'fonte-2',readings:[]}]};
    const presets=[[7.12,7.08,7.21,7.16,7.09,7.24,7.18,7.11,7.23,7.19,7.14,7.17],[6.78,6.82,6.91,6.85,6.79,6.88,6.94,6.87,6.83,6.9,6.86,6.89]];
    state.sources.forEach((s,index)=>presets[index].forEach((ph,i)=>receiveReadings(state,s.id,[ph],'simulado',new Date(now-(11-i)*5000).toISOString())));
    return state;
  }
  function restoreState(raw){
    const state=JSON.parse(raw);
    if(state.version!==1||typeof state.running!=='boolean'||typeof state.secondSource!=='boolean'||!Array.isArray(state.sources)||state.sources.length!==2)throw new Error('Histórico inválido.');
    const ids=['fonte-1','fonte-2'];
    state.sources.forEach((source,i)=>{
      if(source.id!==ids[i]||!Array.isArray(source.readings))throw new Error('Fonte inválida.');
      source.readings.forEach(r=>{if(typeof r.id!=='string'||r.sourceId!==source.id||typeof r.ph!=='number'||parsePH(r.ph)===null||typeof r.timestamp!=='string'||!Number.isFinite(Date.parse(r.timestamp))||!['simulado','manual','colado','sensor'].includes(r.origin))throw new Error('Leitura inválida.');});
    });
    return state;
  }
  const api={parsePH,parseColumn,mean,receiveReadings,seedState,restoreState};
  root.AquaData=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
