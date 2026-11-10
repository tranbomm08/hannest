import * as base from './practice-core.mjs?v=r8-single-20261103';
export const answered=base.answered;
export const questionKey=base.questionKey;
export const resultFor=base.resultFor;
export const freshProgress=base.freshProgress;

// A replaced paper gets its own draft. The old paper's storage is read only.
export function keyFor(record,owner='public'){
  const key=base.keyFor(record,owner);
  return /^[a-f0-9]{16}$/.test(record.writingRevision??'')?key+'.writing-r3.'+record.writingRevision:key;
}
function previousDrafts(storage,record,owner){
  if(!record.writingRevision||!record.previousRecord)return {};
  try{
    const raw=storage.getItem(base.keyFor(record.previousRecord,owner));
    if(!raw||raw.length>1500000)return {};
    const old=base.restoreProgress(JSON.parse(raw),record.previousRecord);
    if(!old)return {};
    const result={};
    record.previousRecord.questions.forEach((q,i)=>{
      const answer=old.answers[base.questionKey(q,i)];
      if(base.answered(answer))result[q.number]=answer;
    });
    return result;
  }catch{return {};}
}
export function loadProgress(storage,record,owner='public'){
  if(!record.writingRevision)return base.loadProgress(storage,record,owner);
  const old=previousDrafts(storage,record,owner);
  try{
    const raw=storage.getItem(keyFor(record,owner));
    if(raw===null)return {progress:base.freshProgress(record),writable:true,previousDrafts:old};
    if(raw.length>1500000)return {progress:base.freshProgress(record),writable:false,previousDrafts:old};
    const restored=base.restoreProgress(JSON.parse(raw),record);
    return {progress:restored??base.freshProgress(record),writable:!!restored,previousDrafts:old};
  }catch{return {progress:base.freshProgress(record),writable:false,previousDrafts:old};}
}
export function saveProgress(storage,record,progress,writable=true,owner='public'){
  if(!record.writingRevision)return base.saveProgress(storage,record,progress,writable,owner);
  return base.saveProgress({setItem:(_,value)=>storage.setItem(keyFor(record,owner),value)},record,progress,writable,owner);
}

export function applyWritingReplacements(records,dataset){
  if(dataset?.version!==1||!Array.isArray(dataset.records))throw new Error('Invalid writing replacement data');
  const byId=new Map(records.map(r=>[r.id,r]));
  const seen=new Set();
  for(const replacement of dataset.records){
    const previous=byId.get(replacement.id);
    if(!previous||seen.has(replacement.id)||replacement.id!==`supp-${replacement.round}-writing`||
       replacement.round===108||previous.round!==replacement.round||replacement.section!=='writing'||
       !/^[a-f0-9]{16}$/.test(replacement.writingRevision??'')||!Array.isArray(replacement.questions)||
       replacement.questions.length<=previous.questions.length||replacement.questions.length>4)throw new Error('Invalid writing replacement record');
    const numbers=replacement.questions.map(q=>q.number);
    if(new Set(numbers).size!==numbers.length||numbers.some(n=>![51,52,53,54].includes(n)))throw new Error('Invalid replacement question numbers');
    for(const q of replacement.questions){
      if(q.type!=='writing'||typeof q.promptText!=='string'||q.promptText.length>30000)throw new Error('Invalid replacement question');
      if(q.figureData&&(!Array.isArray(q.figureData.columns)||!Array.isArray(q.figureData.rows)||q.figureData.columns.length>5||q.figureData.rows.some(row=>!Array.isArray(row)||row.length!==q.figureData.columns.length)))throw new Error('Invalid figure data');
    }
    if(replacement.complete&&[51,52,53,54].some(n=>!numbers.includes(n)))throw new Error('Incomplete paper marked complete');
    seen.add(replacement.id);byId.set(replacement.id,{...replacement,previousRecord:previous});
  }
  return records.map(r=>byId.get(r.id));
}
