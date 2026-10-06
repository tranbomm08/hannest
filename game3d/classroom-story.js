// The same borrowed pencil connects the meeting, lesson and return. Existing
// vocabulary, campus and Flutter study records retain their storage keys.
export const STORY_STORAGE_KEY = 'hannest_game3d_classroom101_story_v1';
export const STORY_STEPS = Object.freeze(['greet-sua','check-bag','borrow-pencil','use-pencil','lesson','return-pencil','thank-sua']);
const freeze = s => {Object.freeze(s.completed);return Object.freeze(s);};
const exact = (v,keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const copy = s => ({version:1,completed:[...s.completed],revisited:s.revisited});
export function initialStoryState(){return freeze({version:1,completed:[],revisited:false});}
export function isValidStoryState(s){
  return exact(s,['version','completed','revisited']) && s.version===1 && Array.isArray(s.completed)
    && s.completed.length<=STORY_STEPS.length && STORY_STEPS.slice(0,s.completed.length).every((id,i)=>s.completed[i]===id)
    && typeof s.revisited==='boolean' && (!s.revisited || s.completed.length===STORY_STEPS.length);
}
export function getStoryPhase(s){return isValidStoryState(s)?STORY_STEPS[s.completed.length]||'complete':STORY_STEPS[0];}
export function getStoryInventory(s){return isValidStoryState(s)&&s.completed.includes('borrow-pencil')&&!s.completed.includes('return-pencil')?['pencil']:[];}
export function storyTransition(s,event){
  if(!isValidStoryState(s))return {state:initialStoryState(),changed:false};
  const unchanged={state:s,changed:false};
  if(!event||typeof event!=='object'||Array.isArray(event))return unchanged;
  const phase=getStoryPhase(s);
  if(event.type==='REVISIT_SUA'){
    if(!exact(event,['type'])||phase!=='complete'||s.revisited)return unchanged;
    const next=copy(s);next.revisited=true;return {state:freeze(next),changed:true};
  }
  const types={'GREET_SUA':'greet-sua','CHECK_BAG':'check-bag','BORROW_PENCIL':'borrow-pencil','USE_PENCIL':'use-pencil','LESSON_DONE':'lesson','RETURN_PENCIL':'return-pencil','THANK_SUA':'thank-sua'};
  if(types[event.type]!==phase)return unchanged;
  if(event.type==='LESSON_DONE'){
    if(!exact(event,['type','reviewed'])||event.reviewed!==30)return unchanged;
  }else if(!exact(event,['type']))return unchanged;
  const next=copy(s);next.completed.push(phase);return {state:freeze(next),changed:true};
}
const warnings={invalid:'이야기 기록을 읽을 수 없어요. 기존 기록을 보존하고 이번 화면에서 진행할게요.',newer:'더 새로운 이야기 기록이 있어요. 기존 기록을 보존할게요.',unavailable:'이야기를 저장할 수 없어요. 이번 화면에서 계속할 수 있어요.',conflict:'다른 화면에 더 진행된 이야기 기록이 있어요. 그 기록을 보존했어요.'};
function decode(raw){
  if(typeof raw!=='string'||raw.length>2048)return {warning:warnings.invalid};
  try{const s=JSON.parse(raw);if(s&&Number.isInteger(s.version)&&s.version>1)return {warning:warnings.newer};
    return isValidStoryState(s)?{state:freeze(copy(s)),warning:null}:{warning:warnings.invalid};
  }catch{return {warning:warnings.invalid};}
}
export function loadStoryState(storage){
  try{const raw=storage.getItem(STORY_STORAGE_KEY);if(raw===null)return {state:initialStoryState(),warning:null};
    const result=decode(raw);return {state:result.state||initialStoryState(),warning:result.warning};
  }catch{return {state:initialStoryState(),warning:warnings.unavailable};}
}
export function saveStoryState(storage,s){
  if(!isValidStoryState(s))return {saved:false,warning:warnings.invalid};
  try{const raw=storage.getItem(STORY_STORAGE_KEY);if(raw!==null){const old=decode(raw);if(!old.state)return {saved:false,warning:old.warning};
    if(s.completed.length<old.state.completed.length||old.state.revisited&&!s.revisited)return {saved:false,warning:warnings.conflict};}
    storage.setItem(STORY_STORAGE_KEY,JSON.stringify(s));return {saved:true,warning:null};
  }catch{return {saved:false,warning:warnings.unavailable};}
}
const missions={
  'greet-sua':{target:'sua',title:'수아와 처음 만나요',prompt:'수아에게 다가가 한국어로 인사해요.'},
  'check-bag':{target:'bag',title:'수업 준비물을 확인해요',prompt:'가방을 직접 골라 안에 무엇이 있는지 확인해요.'},
  'borrow-pencil':{target:'sua',title:'연필을 빌려요',prompt:'연필이 없어요. 수아에게 부탁해 볼까요?'},
  'use-pencil':{target:'student-seat',title:'빌린 연필로 공부해요',prompt:'책상이 있는 빈자리에 앉아요. 「빈자리로 가기」로 이동하거나 직접 의자를 고른 뒤 「연필로 써 보기」를 눌러요.'},
  'return-pencil':{target:'sua',title:'연필을 돌려줘요',prompt:'30가지 물건 수업을 마쳤어요. 수아에게 연필을 돌려줘요.'},
  'thank-sua':{target:'sua',title:'도와준 친구에게 감사해요',prompt:'연필을 돌려줬어요. 수아에게 감사 인사를 해요.'},
  'complete':{target:null,title:'수아와 함께 첫 수업을 마쳤어요!',prompt:'다시 만나면 수아가 오늘의 일을 기억해요.'},
};
export function getStoryMission(s,context={}){const phase=getStoryPhase(s);if(phase==='lesson')return null;
  const mission={phase,...missions[phase]};if(phase==='borrow-pencil'&&context.hasPencil){mission.prompt='가방 속 연필심이 부러졌어요. 수아에게 연필을 빌려요.';}return mission;
}
export function getStoryMemory(s,context={}){
  if(!isValidStoryState(s)||!s.completed.length)return context.metSua?'캠퍼스에서 만난 수아가 같은 반 친구예요.':'아직 처음 만나는 친구예요.';
  if(s.completed.includes('thank-sua'))return '수아가 나를 기억해요.';
  if(s.completed.includes('return-pencil'))return '연필을 돌려줬어요.';
  if(getStoryInventory(s).length)return '빌린 물건: 수아의 연필';
  if(s.completed.includes('check-bag'))return context.hasPencil?'가방 속 연필심이 부러졌어요.':'가방을 확인했어요. 연필이 없어요.';
  return '수아와 인사했어요.';
}
function storyDialogue(s,id,progress,context={}){
  const phase=getStoryPhase(s);
  if(id==='sua'){
    if(phase==='greet-sua')return {text:context.metSua?'캠퍼스에서 만났죠? 교실에서도 만나서 반가워요!':'안녕하세요! 저는 수아예요. 오늘 처음 오셨어요?',choices:[{id:'greet',label:'안녕하세요. 만나서 반가워요.',type:'GREET_SUA'},{id:'wrong',label:'연필을 돌려줄게요.'}]};
    if(phase==='borrow-pencil')return {text:context.hasPencil?'연필심이 부러졌어요? 제 연필을 빌려줄게요. 어떻게 부탁하면 좋을까요?':'연필이 없어요? 제 연필을 빌려줄게요. 어떻게 부탁하면 좋을까요?',choices:[{id:'borrow',label:'연필 좀 빌려 주세요.',type:'BORROW_PENCIL'},{id:'wrong',label:'연필을 돌려줄게요.'}]};
    if(phase==='return-pencil')return {text:'수업을 마쳤네요! 제가 빌려준 연필은 잘 썼어요?',choices:[{id:'return',label:'네, 잘 썼어요. 연필을 돌려줄게요.',type:'RETURN_PENCIL'},{id:'wrong',label:'연필 좀 빌려 주세요.'}]};
    if(phase==='thank-sua')return {text:'연필을 돌려줘서 고마워요. 다음에도 함께 공부해요!',choices:[{id:'thanks',label:'빌려줘서 고마워요.',type:'THANK_SUA'},{id:'wrong',label:'연필이 어디예요?'}]};
    if(phase==='complete')return {text:s.revisited?'또 만났네요! 오늘도 함께 공부해요.':'다시 왔네요! 지난번에 연필을 돌려줘서 고마워요. 다시 만나서 반가워요!',choices:[{id:'revisit',label:'수아야, 다시 만나서 반가워!',type:'REVISIT_SUA'}]};
    const text=phase==='check-bag'?(context.metSua?'캠퍼스 활동을 마치고 왔네요! 같은 반이라 반가워요. 이제 가방을 확인해 봐요.':'수업 전에 가방을 확인해 봐요.'):phase==='use-pencil'?'제 연필로 공책에 써 보세요. 책상이 있는 빈자리에 앉아요. 「빈자리로 가기」를 눌러도 돼요.':`빌린 연필로 공부하고 있네요. 배운 낱말 ${progress.learned}/30, 기억한 낱말 ${progress.completed}/30이에요.`;
    return {text,choices:[{id:'continue',label:'네, 알겠어요.'}]};
  }
  if(id==='teacher')return {text:phase==='lesson'?`수아의 연필로 첫 수업을 시작했군요. 물건을 찾고 낱말을 기억해 봐요. ${progress.completed}/30을 기억했어요.`:'친구에게 인사하고 준비물을 확인해요. 필요한 물건은 정중하게 빌려요.',choices:[{id:'continue',label:'네, 선생님.'}]};
  return {text:phase==='complete'?'수아와 친구가 됐네요! 다음에도 함께 공부해요.':phase==='lesson'?'배운 낱말을 다시 찾아봐요. 수업 뒤에는 빌린 연필을 돌려줘요.':getStoryMission(s,context).prompt,choices:[{id:'continue',label:'알겠어요.'}]};
}
export function getStoryDialogue(s,id,progress,context={}){
  const content=storyDialogue(s,id,progress,context);
  return {...content,choices:[...content.choices,{id:'friends',label:'친구들과 함께 이야기하기'}]};
}
