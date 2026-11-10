export const PRACTICE_VERSION = 1;
export const PREFIX = 'hannest.topik.practice.v1.';

export function questionKey(question, index) {
  return `${question.id || question.number || 'page'}:${index}`;
}

export function answered(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 4;
  if (typeof value === 'string') return Boolean(value.trim());
  return value && typeof value === 'object' && Object.values(value).some(v => typeof v === 'string' && v.trim());
}

export function keyFor(record, owner = 'public') {
  if (!record || !/^[a-zA-Z0-9_.:-]{1,250}$/.test(record.id)) throw new Error('Invalid practice identity');
  return `${PREFIX}${encodeURIComponent(owner.slice(0,200))}.${record.id}`;
}

export function freshProgress(record, now = Date.now()) {
  return {version:PRACTICE_VERSION, recordId:record.id, answers:{}, current:0, elapsed:0,
    audioIndex:0, audioTime:0, updatedAt:now, checked:false,
    questionOrder:record.questions.map(questionIdentity),archivedAnswers:Object.create(null)};
}

function questionIdentity(question, index) {
  return String(question.id || question.number || `page:${index}`);
}

function validAnswer(value, question) {
  if (question.type === 'choice') return Number.isInteger(value) && value >= 1 && value <= 4;
  if (typeof value === 'string') return value.length <= 10000;
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(k=>['ㄱ','ㄴ'].includes(k)) &&
    Object.values(value).every(v=>typeof v === 'string' && v.length <= 10000);
}

export function restoreProgress(raw, record) {
  if (!raw || raw.version !== PRACTICE_VERSION || raw.recordId !== record.id ||
      !raw.answers || typeof raw.answers !== 'object' || Array.isArray(raw.answers)) return null;
  const result=freshProgress(record);
  const historicalValue=value=>Number.isInteger(value)&&value>=1&&value<=4||validAnswer(value,{type:'writing'});
  if(raw.archivedAnswers&&typeof raw.archivedAnswers==='object'&&!Array.isArray(raw.archivedAnswers)){
    for(const [id,value] of Object.entries(raw.archivedAnswers).slice(0,10000)){
      if(id.length<=300&&historicalValue(value))result.archivedAnswers[id]=value;
    }
  }
  // Old storage keys contain array indices. Restoring a missed question must
  // move saved answers by question identity, never by their new position.
  const oldOrder=raw.questionOrder??record.previousQuestionOrder??result.questionOrder;
  if(!Array.isArray(oldOrder)||oldOrder.length>10000||oldOrder.some(x=>typeof x!=='string'||x.length>300)||new Set(oldOrder).size!==oldOrder.length)return null;
  if(new Set(result.questionOrder).size!==result.questionOrder.length)return null;
  const oldIndex=new Map(oldOrder.map((id,i)=>[id,i]));
  const currentIds=new Set(result.questionOrder);
  oldOrder.forEach((id,i)=>{
    if(currentIds.has(id)||Object.hasOwn(result.archivedAnswers,id))return;
    const value=raw.answers[`${id.startsWith('page:')?'page':id}:${i}`];
    if(historicalValue(value))result.archivedAnswers[id]=value;
  });
  record.questions.forEach((q,i)=>{
    const previous=oldIndex.get(result.questionOrder[i]);
    if(previous===undefined)return;
    const k=`${q.id||q.number||'page'}:${previous}`;
    if(validAnswer(raw.answers[k],q))result.answers[questionKey(q,i)]=raw.answers[k];
    else if(historicalValue(raw.answers[k])&&!(result.questionOrder[i] in result.archivedAnswers)){
      result.archivedAnswers[result.questionOrder[i]]=raw.answers[k];
    }
  });
  const oldCurrent=Number.isInteger(raw.current)?Math.max(0,Math.min(oldOrder.length-1,raw.current)):0;
  const newCurrent=result.questionOrder.indexOf(oldOrder[oldCurrent]);
  result.current=newCurrent>=0?newCurrent:Math.max(0,Math.min(record.questions.length-1,oldCurrent));
  result.elapsed=Number.isFinite(raw.elapsed)&&raw.elapsed>=0?Math.min(raw.elapsed,31536000):0;
  result.audioIndex=Number.isInteger(raw.audioIndex)&&raw.audioIndex>=0?raw.audioIndex:0;
  result.audioTime=Number.isFinite(raw.audioTime)&&raw.audioTime>=0?raw.audioTime:0;
  result.checked=raw.checked===true;
  result.updatedAt=Number.isFinite(raw.updatedAt)?raw.updatedAt:Date.now();
  return result;
}

export function migrateOriginal(storage, record) {
  if(record.category!=='official') return null;
  for(const id of [...(record.oldStorageIds||[])].reverse()) {
    try {
      const old=JSON.parse(storage.getItem(`hannest.topik_original.v1.${id}`));
      if(!old || old.examId!==id || !old.answers || !['running','finished'].includes(old.status)) continue;
      const source=old.answers[record.section]; if(!source) continue;
      const result=freshProgress(record);let count=0;
      record.questions.forEach((q,i)=>{const value=source[q.phaseQuestionId??q.number];
        if(validAnswer(value,q)){result.answers[questionKey(q,i)]=value;count++;}});
      if(count){result.migratedFrom=id;return result;}
    } catch { /* A different old session never blocks a new worksheet. */ }
  }
  return null;
}

export function loadProgress(storage, record, owner='public') {
  try {
    const text=storage.getItem(keyFor(record,owner));
    if(text!==null){if(text.length>1500000)return {progress:freshProgress(record),writable:false};
      const progress=restoreProgress(JSON.parse(text),record);
      return {progress:progress||freshProgress(record),writable:Boolean(progress)};}
    return {progress:migrateOriginal(storage,record)||freshProgress(record),writable:true};
  } catch {return {progress:freshProgress(record),writable:false};}
}

export function saveProgress(storage, record, progress, writable=true, owner='public') {
  if(!writable)return false;
  try{progress.updatedAt=Date.now();storage.setItem(keyFor(record,owner),JSON.stringify(progress));return true;}
  catch{return false;}
}

export function resultFor(record, progress) {
  const result={correct:0,graded:0,answered:0,total:record.questions.length,earned:0,possible:0,ungraded:0};
  record.questions.forEach((q,i)=>{const value=progress.answers[questionKey(q,i)];
    if(answered(value))result.answered++;
    if(q.type==='choice'&&Number.isInteger(q.correctChoice)&&q.correctChoice>=1&&q.correctChoice<=4){
      result.graded++;result.possible+=Number.isFinite(q.points)?q.points:1;
      if(value===q.correctChoice){result.correct++;result.earned+=Number.isFinite(q.points)?q.points:1;}
    }else result.ungraded++;
  });
  return result;
}
