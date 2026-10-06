// Read-only help: asking friends never awards a discovered or reviewed word.
import {getCurrentMission,getProgress} from './classroom-state.js';
import {LESSON_OBJECTS} from './classroom-lesson.js';

const details = {
  desk:['공부할 때 책과 공책을 올려놓는 가구예요.','교실 앞쪽 왼편의 학생 자리에서 찾아보세요.'],
  chair:['앉을 때 쓰는 가구예요.','책상 뒤를 보세요. 가운데 빈자리에 직접 앉아도 돼요.'],
  book:['글과 그림을 읽는 물건이에요.','교실 앞쪽 왼편 책상 위에 있어요.'],
  notebook:['글씨를 쓰거나 배운 내용을 적는 물건이에요.','교실 앞쪽 가운데 책상 위를 보세요.'],
  pencil:['지우개로 지울 수 있는 글씨를 쓰는 도구예요.','교실 앞쪽 왼편 책상 위에 있어요. 빌린 연필도 수업 중에는 거기에 놓아요.'],
  pen:['잉크로 글씨를 쓰는 도구예요.','교실 앞쪽 가운데 책상 위에 있어요.'],
  eraser:['연필로 쓴 글씨를 지우는 물건이에요.','교실 앞쪽 왼편 책상 위의 작은 물건을 찾아보세요.'],
  ruler:['길이를 재거나 곧은 선을 그리는 도구예요.','교실 앞쪽 왼편 책상 위를 보세요. 작은 눈금이 있어요.'],
  bag:['물건을 넣어 가지고 다니는 물건이에요.','교실 왼편 앞자리 옆 바닥을 보세요.'],
  board:['선생님이 글씨를 쓰고 학생들이 함께 보는 곳이에요.','교실 맨 앞 벽의 넓은 면을 보세요.'],
  clock:['시간을 알려 주는 물건이에요.','교실 맨 앞 벽의 위쪽을 보세요. 시선을 위로 돌려요.'],
  door:['방에 들어가거나 나갈 때 여는 곳이에요.','교실 앞쪽 오른편 벽에 있어요.'],
  window:['빛이 들어오고 바깥을 볼 수 있는 곳이에요.','교실 왼편 벽의 유리를 찾아보세요.'],
  computer:['정보를 보고 여러 작업을 하는 기계예요.','교실 맨 앞 선생님 책상 위의 화면을 보세요.'],
  'trash-bin':['필요 없는 것을 버리는 통이에요.','교실 뒤쪽 오른편 바닥에 있어요.'],
  locker:['개인 물건을 넣어 두는 작은 보관장이에요.','교실 맨 뒤 벽의 가운데를 보세요.'],
  bookshelf:['책을 정리해 놓는 가구예요.','교실 뒤쪽 왼편 벽에 있어요.'],
  bottle:['물을 담아 가지고 다니는 물건이에요.','교실 앞쪽 오른편 책상 위를 보세요.'],
  globe:['지구의 모양과 여러 나라를 보여 주는 모형이에요.','교실 맨 앞 선생님 책상 왼편에 있어요.'],
  plant:['식물을 심어 기르는 그릇이에요.','교실 맨 뒤 오른편 구석의 초록 잎을 보세요.'],
  'teacher-desk':['선생님이 수업할 때 사용하는 큰 책상이에요.','교실 맨 앞, 선생님 가까이에 있어요.'],
  chalk:['칠판에 글씨를 쓰는 짧은 막대예요.','교실 맨 앞 칠판 아래 받침의 왼편을 보세요.'],
  'board-eraser':['칠판에 쓴 글씨를 지우는 물건이에요.','교실 맨 앞 칠판 아래 받침에 있어요.'],
  'pencil-case':['연필이나 볼펜 같은 작은 도구를 넣는 물건이에요.','교실 앞쪽 가운데 책상 위를 보세요.'],
  scissors:['종이나 천을 자르는 도구예요.','교실 가운데 책상 위에 있어요.'],
  glue:['종이와 종이를 붙이는 물건이에요.','교실 가운데 책상 위를 보세요.'],
  'colored-pencils':['여러 색으로 그림을 그리거나 색칠하는 도구예요.','교실 뒤쪽 왼편 책상 위에 모여 있어요.'],
  paper:['글씨를 쓰거나 그림을 그리는 얇은 물건이에요.','교실 뒤쪽 가운데 책상 위의 하얀 것을 보세요.'],
  keyboard:['버튼을 눌러 컴퓨터에 글자를 넣는 도구예요.','교실 맨 앞 선생님 책상 위, 화면 앞을 보세요.'],
  mouse:['컴퓨터 화면의 화살표를 움직이는 도구예요.','교실 맨 앞 선생님 책상 위, 글자 버튼 오른편에 있어요.'],
};
export const WORD_GUIDES = Object.freeze(Object.fromEntries(LESSON_OBJECTS.map(item=>[
  item.id,Object.freeze({id:item.id,word:item.word,clue:item.clue,sentence:item.sentence,
    meaning:details[item.id][0],location:details[item.id][1]})
])));
export function getWordGuide(id){return WORD_GUIDES[id]||null;}
export function getLessonHint(state,level=1){
  const mission=getCurrentMission(state);if(!mission)return null;
  const guide=WORD_GUIDES[mission.target],tier=Math.min(3,Math.max(1,Number.isInteger(level)?level:1));
  return {key:mission.id,target:guide.id,level:tier,
    title:tier===1?'친구의 힌트 · 특징':tier===2?'친구의 힌트 · 찾는 곳':'친구의 힌트 · 낱말과 문장',
    text:tier===1?guide.clue:tier===2?guide.location:guide.word+' · '+guide.meaning+' '+guide.sentence,
    showLocation:tier>=2,showShape:tier>=2};
}
const names={teacher:'선생님',sua:'수아',minsu:'민수',hana:'하나',jiun:'지윤',hero:'나'};
const helpers={teacher:'hana',sua:'minsu',minsu:'jiun',hana:'sua',jiun:'minsu'};
const turn=(speaker,listener,text)=>({speaker,listener,text});
export function getLessonDialogue(state,starter='sua'){
  if(!Object.hasOwn(helpers,starter))starter='sua';
  const helper=helpers[starter],mission=getCurrentMission(state),p=getProgress(state);
  if(!mission)return {turns:[
    turn(starter,helper,'30가지 낱말을 모두 배우고 다시 찾았어요!'),
    turn(helper,starter,'우리 함께 공부해서 더 잘 기억할 수 있었어요.'),
    turn('teacher','hero','잘했어요. 이제 수아에게 빌린 연필을 돌려주고 감사 인사를 해요.'),
  ],choices:[{id:'continue',label:'함께 공부해서 즐거웠어요.'}]};
  const guide=WORD_GUIDES[mission.target];
  return {turns:[
    turn(starter,helper,`${names[helper]}, 같이 알려 줄까요? ${mission.stage==='review'?'이번에는 「'+guide.word+'」을 다시 찾아요.':guide.clue}`),
    turn(helper,starter,'좋아요. '+guide.location),
    turn('hero','teacher','선생님, 이 물건은 어떻게 써요?'),
    turn('teacher','hero',guide.word+' · '+guide.meaning+' 「'+guide.sentence+'」라고 말해요.'),
    turn(helper,'hero',`설명을 읽고 직접 골라 봐요. 지금 배운 낱말은 ${p.learned}/30, 기억한 낱말은 ${p.completed}/30이에요.`),
  ],choices:[{id:'hint',label:'찾는 곳을 한 번 더 알려 주세요.'},{id:'continue',label:'고마워요. 직접 찾아볼게요.'}]};
}
export function getClassroomConversation(phase,context={}){
  const finishing=['return-pencil','thank-sua','complete'].includes(phase);
  if(finishing)return {turns:[
    turn('teacher','sua','30가지 낱말 수업을 마쳤어요. 서로 도와줘서 고마워요.'),
    turn('sua','minsu','민수야, 우리 친구가 물건을 모두 다시 찾았어요!'),
    turn('minsu','hero','잘했어요! 배운 문장을 다음 수업에서도 써 봐요.'),
    turn('hero','sua',phase==='return-pencil'?'수아야, 연필을 잘 썼어요. 이제 돌려줄게요.':'수아야, 함께 공부해서 즐거웠어요.'),
  ],choices:[{id:'continue',label:'친구와 계속 이야기하기'}]};
  return {turns:[
    turn('sua','minsu',context.metSua?'민수야, 캠퍼스에서 만난 친구가 8가지 활동을 마치고 왔어요!':'민수야, 새 친구와 함께 공부해요.'),
    turn('minsu','hero',context.metSua?'왔네요! 준비물을 챙긴 뒤 저에게 교실을 물어봤죠? 같은 반이라 반가워요.':'반가워요! 같은 반 친구들과 함께 공부해요.'),
    turn('teacher','sua','수아와 민수, 친구의 수업 준비를 도와주세요. 오늘은 교실의 물건 30가지를 배워요.'),
    turn('sua','hero',context.hasPencil?'가방을 확인해 봐요. 연필심이 부러졌으면 제 연필을 빌려도 돼요.':'가방을 확인해 봐요. 필요한 물건은 친구에게 빌려도 돼요.'),
    turn('hero','teacher','네, 선생님. 친구들과 함께 찾아보고 공부할게요.'),
  ],choices:[{id:'continue',label:'이어서 준비하기'}]};
}
