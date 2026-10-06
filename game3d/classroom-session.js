import {ACTIVITY_WORDS} from './classroom-activities.js';
import {OBJECT_BY_ID} from './classroom-lesson.js';

export const SESSION_STORAGE_KEY='hannest_game3d_classroom101_sessions_v1';
export const REVIEW_WORD_IDS=Object.freeze(Object.keys(ACTIVITY_WORDS));
const objectTasks=[
  ['book','책을 읽고 싶어요. 읽을 물건을 찾아 눌러요.'],
  ['notebook','배운 내용을 적을 공책을 찾아 눌러요.'],
  ['paper','종이에 글씨를 쓰고 싶어요. 종이를 찾아 눌러요.'],
  ['clock','몇 시인지 알고 싶어요. 시계를 찾아 눌러요.'],
  ['bottle','물을 마시고 싶어요. 물병을 찾아 눌러요.'],
  ['bag','수업 준비물을 가방에 넣어요. 가방을 찾아 눌러요.'],
  ['scissors','종이를 자르고 싶어요. 가위를 찾아 눌러요.'],
  ['glue','종이를 붙이고 싶어요. 풀을 찾아 눌러요.'],
  ['bookshelf','책을 정리하고 싶어요. 책장을 찾아 눌러요.'],
  ['trash-bin','쓰레기를 버리고 싶어요. 휴지통을 찾아 눌러요.'],
  ['colored-pencils','색칠하고 싶어요. 색연필을 찾아 눌러요.'],
  ['computer','컴퓨터로 공부하고 싶어요. 컴퓨터를 찾아 눌러요.'],
];
const helpTasks={
  hana:{wordId:'sleep',text:'졸고 있었어요. 벌써 수업이 시작했나요?',choices:[['help','네, 책을 펴고 같이 공부해요.'],['ignore','그냥 계속 자요.'],['noise','수업 중에 큰 소리로 떠들어요.']],explanation:'수업이 시작했어요. 잠을 깨고 함께 공부하자고 말해요.'},
  yuna:{wordId:'makeup',text:'거울을 보며 화장하고 있었어요. 수업이 시작하면 뭘 할까요?',choices:[['help','거울과 립스틱을 넣고 같이 공부해요.'],['ignore','수업 내내 거울만 봐요.'],['noise','친구의 책을 숨겨요.']],explanation:'화장 도구를 정리하고 함께 수업을 준비해요.'},
  jiun:{wordId:'sweep',text:'교실 바닥에 먼지가 있어요. 무엇으로 쓸까요?',choices:[['help','빗자루로 바닥을 쓸어요.'],['ignore','거울로 바닥을 쓸어요.'],['noise','립스틱으로 먼지를 칠해요.']],explanation:'빗자루는 바닥을 쓰는 도구예요. 함께 교실을 깨끗하게 해요.'},
  daeun:{wordId:'study',text:'이 문장의 낱말을 잘 모르겠어요. 도와줄래요?',choices:[['help','네, 문장을 함께 읽고 공부해요.'],['ignore','모르면 책을 버려요.'],['noise','공부하는 친구를 방해해요.']],explanation:'모르는 낱말은 문장을 함께 읽으며 배울 수 있어요.'},
};
const reviewActors={sleep:'hana',makeup:'yuna',sweep:'jiun',study:'daeun',broom:'jiun',mirror:'yuna',lipstick:'yuna',request:'teacher'};
const questionTexts={sleep:'앉아서 잠깐 잠이 드는 동작은?',makeup:'얼굴에 화장품을 바르는 동작은?',sweep:'빗자루로 먼지를 모으는 동작은?',study:'책을 읽고 새로운 내용을 배우는 동작은?',broom:'지윤이 바닥을 쓸 때 사용하는 도구는?',mirror:'유나가 자신의 얼굴을 보는 물건은?',lipstick:'유나가 입술에 바르는 화장품은?',request:'선생님: “칠판을 지워 줄래요?” 도움을 요청하는 것을 뭐라고 할까요?',hold:'손으로 칠판지우개를 쥐는 동작은?',erase:'칠판에 쓴 글씨를 없애는 동작은?',put:'칠판지우개를 제자리에 두는 동작은?'};
const nouns=['broom','mirror','lipstick'],verbs=REVIEW_WORD_IDS.filter(id=>!nouns.includes(id));
const copy=value=>JSON.parse(JSON.stringify(value));
function shuffle(items,seed){const result=[...items];let n=seed>>>0;for(let i=result.length-1;i>0;i--){n=(Math.imul(n,1664525)+1013904223)>>>0;const j=n%(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;}
export function initialSessionState(){return{version:1,runs:[]};}
export function getSessionRun(state){return state.runs.at(-1)||null;}
function order(a,b){return a.number-b.number||a.id.localeCompare(b.id);}
function baseTasks(run){
  const reviews=run.mode==='mistakes'?run.reviewIds:shuffle(REVIEW_WORD_IDS,run.seed+49);
  const tasks=run.mode==='mistakes'?[]:[...Array.from({length:3},(_,i)=>{
    const [target,prompt]=objectTasks[(run.number*3+i)%objectTasks.length];return{key:'object-'+i,type:'object',target,prompt};
  }),...Array.from({length:2},(_,i)=>{
    const actor=Object.keys(helpTasks)[(run.number+i)%4],spec=helpTasks[actor];return{key:'help-'+actor,type:'help',actor,wordId:spec.wordId,prompt:'친구에게 가서 상황에 맞게 대답해요.',...spec};
  })];
  return tasks.concat(reviews.map(id=>reviewTask(id,'review-'+id,run.seed)));
}
function reviewTask(wordId,key,seed){return{key,type:'review',wordId,actor:reviewActors[wordId]||null,action:['hold','erase','put'].includes(wordId)?wordId:null,prop:nouns.includes(wordId)?wordId:null,prompt:questionTexts[wordId],choices:shuffle([wordId,...shuffle(nouns.includes(wordId)?nouns:verbs,seed+wordId.length).filter(id=>id!==wordId).slice(0,2)],seed+key.length)};}
export function getSessionTasks(run){
  if(!run)return[];const base=baseTasks(run),missed=base.filter(task=>task.type==='review'&&((run.answers[task.key]?.wrong.length||0)>0||run.answers[task.key]?.hinted));
  return base.concat(missed.map(task=>({...reviewTask(task.wordId,'retry-'+task.wordId,run.seed+87),retry:true})));
}
export function getSessionTask(state){const run=getSessionRun(state),task=getSessionTasks(run).find(task=>!run.answers[task.key]?.correct);return task?{...task,runId:run.id}:null;}
export function getSessionProgress(state){const run=getSessionRun(state),tasks=getSessionTasks(run);return{done:tasks.filter(task=>run.answers[task.key]?.correct).length,total:tasks.length,complete:Boolean(run)&&tasks.every(task=>run.answers[task.key]?.correct),number:run?.number||0,mode:run?.mode||'daily'};}
export function startSession(state,{id,seed=Date.now()>>>0,mode='daily'}={}){
  const due=getSessionWordMemory(state).practice;if(mode==='mistakes'&&!due.length)return{state,changed:false};
  if(!id||state.runs.some(run=>run.id===id)||!['daily','mistakes'].includes(mode))return{state,changed:false};
  const run={id,number:(getSessionRun(state)?.number||0)+1,seed:seed>>>0,mode,reviewIds:mode==='mistakes'?shuffle(due,seed):[],answers:{}};
  return{state:{version:1,runs:[...copy(state.runs),run]},changed:true};
}
export function answerSession(state,{key,choice,hint=false}){
  const task=getSessionTask(state);if(!task||task.key!==key)return{state,changed:false,correct:false};
  const next=copy(state),run=getSessionRun(next),answer=run.answers[key]||{correct:false,wrong:[],hinted:false};
  if(hint){if(answer.hinted)return{state,changed:false,correct:false};answer.hinted=true;}
  else{
    const valid=task.type==='object'?Object.hasOwn(OBJECT_BY_ID,choice):task.type==='help'?task.choices.some(c=>c[0]===choice):task.choices.includes(choice);
    if(!valid)return{state,changed:false,correct:false};
    answer.correct=choice===(task.type==='object'?task.target:task.type==='help'?'help':task.wordId);
    if(!answer.correct&&!answer.wrong.includes(choice))answer.wrong.push(choice);
  }
  run.answers[key]=answer;return{state:next,changed:true,correct:answer.correct};
}
function wordMemoryForRun(run){
  const latest=new Map();for(const task of getSessionTasks(run)){const answer=run.answers[task.key];if(task.type==='review'&&answer?.correct)latest.set(task.wordId,{id:task.wordId,remembered:!answer.wrong.length&&!answer.hinted});}
  return latest;
}
export function getSessionWordMemory(state){const latest=new Map();for(const run of state.runs)for(const [id,result]of wordMemoryForRun(run))latest.set(id,result);return{seen:[...latest.keys()],remembered:[...latest.values()].filter(r=>r.remembered).map(r=>r.id),practice:[...latest.values()].filter(r=>!r.remembered).map(r=>r.id)};}
export function getSessionResults(state){
  const run=getSessionRun(state),memory=run?wordMemoryForRun(run):new Map(),tasks=getSessionTasks(run),correct=task=>run.answers[task.key]?.correct;
  return{...getSessionProgress(state),seen:[...memory.keys()],remembered:[...memory.values()].filter(r=>r.remembered).map(r=>r.id),practice:[...memory.values()].filter(r=>!r.remembered).map(r=>r.id),objects:tasks.filter(t=>t.type==='object'&&correct(t)).map(t=>t.target),helped:tasks.filter(t=>t.type==='help'&&correct(t)).map(t=>t.actor),rewards:getSessionRewards(state)};
}
export function getSessionRewards(state){
  const rewards=[];const completed=state.runs.filter(run=>getSessionTasks(run).every(t=>run.answers[t.key]?.correct));
  if(completed.some(run=>run.mode==='daily'))rewards.push({id:'first-class',label:'첫 놀이 수업 스티커',symbol:'★'});
  if(state.runs.some(run=>baseTasks(run).filter(t=>t.type==='help'&&run.answers[t.key]?.correct).length>=2))rewards.push({id:'friend-helper',label:'친구 도우미 배지',symbol:'♡'});
  if(state.runs.some((run,index)=>completed.some(done=>done.id===run.id)&&getSessionWordMemory({runs:state.runs.slice(0,index+1)}).remembered.length===11))rewards.push({id:'word-explorer',label:'낱말 탐험가 스티커',symbol:'✦'});
  return rewards;
}
function validRecord(value){
  if(!value||value.version!==1||!Array.isArray(value.runs))return false;
  const ids=new Set();for(const run of value.runs){
    if(!run||typeof run.id!=='string'||!run.id||run.id.length>120||ids.has(run.id)||!Number.isSafeInteger(run.number)||run.number<1||!Number.isInteger(run.seed)||run.seed<0||run.seed>4294967295||!['daily','mistakes'].includes(run.mode)||!Array.isArray(run.reviewIds)||run.reviewIds.some(id=>!REVIEW_WORD_IDS.includes(id))||new Set(run.reviewIds).size!==run.reviewIds.length||run.mode==='mistakes'&&!run.reviewIds.length||!run.answers||typeof run.answers!=='object'||Array.isArray(run.answers))return false;
    ids.add(run.id);if(Object.values(run.answers).some(a=>!a||typeof a.correct!=='boolean'||typeof a.hinted!=='boolean'||!Array.isArray(a.wrong)))return false;
    const tasks=getSessionTasks(run),allowed=new Map(tasks.map(t=>[t.key,t]));
    for(const [key,answer]of Object.entries(run.answers)){
      const task=allowed.get(key);if(!task||!answer||typeof answer.correct!=='boolean'||typeof answer.hinted!=='boolean'||!Array.isArray(answer.wrong)||answer.wrong.some(id=>typeof id!=='string'||(task.type==='object'?!Object.hasOwn(OBJECT_BY_ID,id):task.type==='help'?!task.choices.some(c=>c[0]===id):!task.choices.includes(id))))return false;
    }
  }return true;
}
export function loadSessionState(storage){
  try{const raw=storage.getItem(SESSION_STORAGE_KEY);if(raw==null)return{state:initialSessionState(),warning:'',protected:false};const state=JSON.parse(raw);if(!validRecord(state))throw new Error('Unknown session record');state.runs.sort(order);return{state,warning:'',protected:false};}
  catch(_){return{state:initialSessionState(),warning:'놀이 수업 기록을 읽지 못했어요. 기존 기록을 지우지 않고 이 화면에서 연습해요.',protected:true};}
}
export function mergeSessionStates(left,right){
  const runs=new Map(left.runs.map(run=>[run.id,copy(run)]));for(const incoming of right.runs){const previous=runs.get(incoming.id);if(!previous){runs.set(incoming.id,copy(incoming));continue;}
    // Each run has immutable curriculum. Freshly read metadata wins a conflict.
    if(previous.number!==incoming.number||previous.seed!==incoming.seed||previous.mode!==incoming.mode||JSON.stringify(previous.reviewIds)!==JSON.stringify(incoming.reviewIds)){runs.set(incoming.id,copy(incoming));continue;}
    for(const [key,a]of Object.entries(incoming.answers)){const b=previous.answers[key];previous.answers[key]=b?{...b,correct:a.correct||b.correct,wrong:[...new Set([...b.wrong,...a.wrong])],hinted:a.hinted||b.hinted}:copy(a);}
  }return{version:1,runs:[...runs.values()].sort(order)};
}
export function saveSessionState(storage,current){
  const loaded=loadSessionState(storage);if(loaded.protected)return{state:current,warning:loaded.warning,protected:true};
  if(!validRecord(current))return{state:loaded.state,warning:'놀이 수업 기록을 확인하지 못했어요. 기존 기록을 유지해요.',protected:true};
  const state=mergeSessionStates(current,loaded.state),serialized=JSON.stringify(state);
  try{if(serialized!==JSON.stringify(loaded.state))storage.setItem(SESSION_STORAGE_KEY,serialized);return{state,warning:'',protected:false};}
  catch(_){return{state,warning:'놀이 수업을 저장하지 못했어요. 이 화면에서는 계속 연습할 수 있어요.',protected:false};}
}
