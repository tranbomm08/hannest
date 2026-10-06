// New lesson, separate from the six-task classroom, LV1 and study records.
// Physical selection/proximity belongs to the controller, never postMessage.
import {OBJECT_IDS,OBJECT_WORDS,OBJECT_SENTENCES,OBJECT_BY_ID,LESSON_GROUPS,REVIEW_IDS} from './classroom-lesson.js';
export {OBJECT_IDS,OBJECT_WORDS,OBJECT_SENTENCES,LESSON_GROUPS,REVIEW_IDS};
export const STORAGE_KEY = 'hannest_game3d_classroom101_30_v1';
export const STATE_VERSION = 1;
export const STUDENT_SEAT_ID = 'student-seat';
const MAX_STORED_LENGTH = 8192;
const freeze = s => {Object.freeze(s.completed);Object.freeze(s.discovered);return Object.freeze(s);};
const copy = s => ({version:STATE_VERSION,started:s.started,completed:[...s.completed],discovered:[...s.discovered]});
const exact = (v,keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
export const CONTENT = Object.freeze({
  classmates:Object.freeze({teacher:'선생님',sua:'수아',minsu:'민수',hana:'하나',jiun:'지윤'}),
  conversations:Object.freeze({sua:'오늘은 교실의 물건 30가지를 배워요. 그림을 보고 직접 찾아보세요.',teacher:'새 낱말을 만나고, 다시 찾아보며 기억해요. 여섯 묶음을 끝내면 새 수업이 완성돼요.',minsu:'물건을 고르면 이름과 짧은 문장이 보여요.',hana:'한 묶음을 배우고 나면 그림 없이 낱말만 보고 다시 찾아요.',jiun:'틀려도 괜찮아요. 소리를 듣지 않아도 끝까지 할 수 있어요.'}),
  feedback:Object.freeze({correctObject:'잘 찾았어요! 다음 물건도 만나 보세요.',correctReview:'맞아요! 이 낱말을 기억했어요.',wrongReview:'다른 물건이에요. 위의 낱말을 보고 다시 찾아보세요.',discovered:'새 낱말을 만났어요. 위의 그림도 찾아보세요.',alreadyDiscovered:'이미 만난 물건이에요. 다시 살펴봐도 좋아요.'}),
});
export const STORAGE_WARNINGS = Object.freeze({
  invalid:'저장된 새 수업 기록을 읽을 수 없어요. 기존 기록을 보존하고 이번 화면에서 진행할게요.',
  newer:'더 새로운 수업 기록이 있어요. 기존 기록을 보존하고 이번 화면에서 진행할게요.',
  unavailable:'새 수업 기록을 저장할 수 없어요. 이번 화면에서 계속할 수 있어요.',
  conflict:'다른 화면에 더 진행된 기록이 있어요. 기존 기록을 바꾸지 않았어요.',
  invalidState:'새 수업 기록이 올바르지 않아 저장하지 않았어요.',
});
export function initialState(){return freeze({version:STATE_VERSION,started:false,completed:[],discovered:[]});}
export function isValidState(s){
  if(!exact(s,['version','started','completed','discovered'])||s.version!==STATE_VERSION||typeof s.started!=='boolean'
    ||!Array.isArray(s.completed)||s.completed.length>30||!Array.isArray(s.discovered)||s.discovered.length>30)return false;
  if(!REVIEW_IDS.slice(0,s.completed.length).every((id,i)=>s.completed[i]===id))return false;
  const canonical=OBJECT_IDS.filter(id=>s.discovered.includes(id));
  if(canonical.length!==s.discovered.length||!canonical.every((id,i)=>s.discovered[i]===id))return false;
  if(!s.started)return s.completed.length===0&&s.discovered.length===0;
  // Reviewing a group is impossible until every object in it has been learned.
  for(const id of s.completed){const group=LESSON_GROUPS[OBJECT_BY_ID[id].group-1];if(!group.ids.every(item=>s.discovered.includes(item)))return false;}
  return true;
}
function currentGroup(s){return LESSON_GROUPS.find(group=>group.review.some(id=>!s.completed.includes(id)))||null;}
export function getPhase(s){
  if(!isValidState(s)||!s.started)return 'startgate';
  const group=currentGroup(s);if(!group)return 'complete';
  return group.ids.every(id=>s.discovered.includes(id))?'review':'learn';
}
export function getProgress(s){
  return {completed:isValidState(s)?s.completed.length:0,total:30,learned:isValidState(s)?s.discovered.length:0,
    groups:isValidState(s)?LESSON_GROUPS.filter(g=>g.review.every(id=>s.completed.includes(id))).length:0};
}
export function getCurrentMission(s){
  if(!isValidState(s))s=initialState();const group=currentGroup(s);if(!group)return null;
  const stage=group.ids.every(id=>s.discovered.includes(id))?'review':'learn';
  const target=(stage==='learn'?group.ids:group.review).find(id=>!(stage==='learn'?s.discovered:s.completed).includes(id));
  const item=OBJECT_BY_ID[target],done=(stage==='learn'?group.ids:group.review).filter(id=>(stage==='learn'?s.discovered:s.completed).includes(id)).length;
  return Object.freeze({id:stage+'-'+target,stage,group:group.number,target,goalIcon:stage==='learn'?target:null,
    title:group.number+' / 6 · '+group.title+' · '+(stage==='learn'?'배우기':'기억하기'),
    prompt:stage==='learn'?item.clue:item.word+' · 이 물건을 다시 찾아보세요.',done,total:group.ids.length});
}
export function transition(s,event){
  if(!isValidState(s))return {state:initialState(),changed:false,advanced:false};
  const unchanged={state:s,changed:false,advanced:false};
  if(!event||typeof event!=='object'||Array.isArray(event))return unchanged;
  if(event.type==='START'){
    if(!exact(event,['type'])||s.started)return unchanged;const next=copy(s);next.started=true;
    return {state:freeze(next),changed:true,advanced:false};
  }
  if(event.type!=='SELECT_OBJECT'||!exact(event,['type','item'])||!s.started||!OBJECT_IDS.includes(event.item))return unchanged;
  const mission=getCurrentMission(s),phase=getPhase(s),fresh=!s.discovered.includes(event.item);
  const correct=mission?.target===event.item;
  const next=copy(s);if(fresh)next.discovered=OBJECT_IDS.filter(id=>id===event.item||s.discovered.includes(id));
  if(phase==='review'&&correct)next.completed.push(event.item);
  const changed=fresh||(phase==='review'&&correct);
  return changed?{state:freeze(next),changed:true,advanced:correct,reviewCorrect:phase==='review'&&correct}:unchanged;
}
function decode(raw){
  if(typeof raw!=='string'||raw.length>MAX_STORED_LENGTH)return {state:null,warning:STORAGE_WARNINGS.invalid};
  try{const s=JSON.parse(raw);if(s&&typeof s==='object'&&Number.isInteger(s.version)&&s.version>STATE_VERSION)return {state:null,warning:STORAGE_WARNINGS.newer};
    return isValidState(s)?{state:freeze(copy(s)),warning:null}:{state:null,warning:STORAGE_WARNINGS.invalid};
  }catch{return {state:null,warning:STORAGE_WARNINGS.invalid};}
}
export function loadState(storage){
  try{const raw=storage.getItem(STORAGE_KEY);if(raw===null)return {state:initialState(),warning:null};const found=decode(raw);return {state:found.state||initialState(),warning:found.warning};}
  catch{return {state:initialState(),warning:STORAGE_WARNINGS.unavailable};}
}
export function saveState(storage,s){
  if(!isValidState(s))return {saved:false,warning:STORAGE_WARNINGS.invalidState};
  try{const raw=storage.getItem(STORAGE_KEY);if(raw!==null){const old=decode(raw);if(!old.state)return {saved:false,warning:old.warning};
    if((old.state.started&&!s.started)||s.completed.length<old.state.completed.length||old.state.discovered.some(id=>!s.discovered.includes(id)))return {saved:false,warning:STORAGE_WARNINGS.conflict};}
    storage.setItem(STORAGE_KEY,JSON.stringify(s));return {saved:true,warning:null};
  }catch{return {saved:false,warning:STORAGE_WARNINGS.unavailable};}
}
