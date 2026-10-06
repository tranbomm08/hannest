import * as characters from './characters.js';
import {createModelClassroom} from './classroom-model.js';
import {transition,loadState,saveState,getPhase,getProgress,getCurrentMission,OBJECT_WORDS,OBJECT_SENTENCES,CONTENT} from './classroom-state.js';
import {OBJECT_BY_ID} from './classroom-lesson.js';
import {loadStoryState,saveStoryState,storyTransition,getStoryPhase,getStoryMission,getStoryInventory,getStoryMemory,getStoryDialogue} from './classroom-story.js';
import {getWordGuide,getLessonHint,getLessonDialogue,getClassroomConversation} from './classroom-guidance.js';
import {createCameraCollision,fitDialogueCamera} from './camera-rig.js';
import {ACTIVITY_STORAGE_KEY,ACTIVITY_WORDS,CLASSMATE_NAMES,loadActivityWords,learnActivityWords,getActivityDialogue,createClassroomActivityProps} from './classroom-activities.js';
import {BOARD_STORAGE_KEY,loadBoardState,saveBoardState,boardTransition,getBoardMission,getTeacherBoardDialogue,createBoardVisuals} from './classroom-board.js';
import {SESSION_STORAGE_KEY,loadSessionState,saveSessionState,startSession,answerSession,getSessionRun,getSessionTask,getSessionProgress,getSessionResults,getSessionWordMemory,getSessionRewards} from './classroom-session.js';

// The host owns the renderer, RAF and lifecycle. This controller owns only the
// classroom scene, its listeners and its separate classroom progress record.
export function createClassroomController({THREE,renderer,canvas,camera,mount,isActive,getViewMode,setViewMode,notify=()=>{},onExit=()=>{},getCampusContext=()=>({}),canEnter=()=>true}) {
  let entered=false,disposed=false,paused=false,scene=null,room=null,hero=null;
  let yaw=0,pitch=-.08,time=0,path=[],pending=null,pointer=null,seated=null,seatAlign=null;
  let dialogue=null,reveal=null,hint=null,speaker=null,guideFocus=null,dialogueRig=null,cameraCollision=null;
  let sitting=false,sitHandle=null,standing=false,standingSeat=null,standHandle=null,seatActionEpoch=0,sleeping=false,activityProps=null;
  let loadEpoch=0,loadAbort=null;
  let clipped=false,moving=false,saveWarning='',completionShown=false;
  let storyAction=null,storyActionEpoch=0,storySaveWarning='';
  let boardVisuals=null,boardAction=null,boardEpoch=0,boardGuide=null;
  let sessionFocused=false,sessionReady=null,sessionAction=null,sessionEpoch=0,sessionWatch=null,sessionPractice=null,sessionFeedback='';
  const actors=new Map(),slots=new Map(),propOwners=new Map(),propRest=new Map(),reactions=new Map();
  const keys=new Set(),held=new Map(),removers=[],variantMaterials=new Set();
  const ray=new THREE.Raycaster(),occlusionRay=new THREE.Raycaster();
  let storage;try{storage=localStorage;}catch(_){storage={getItem(){throw new Error('저장 불가');},setItem(){throw new Error('저장 불가');}};}
  const loaded=loadState(storage);let state=loaded.state;saveWarning=loaded.warning||'';
  const storyLoaded=loadStoryState(storage);let story=storyLoaded.state;storySaveWarning=storyLoaded.warning||'';
  const activityLoaded=loadActivityWords(storage);let activityWords=activityLoaded.words,activitySaveWarning=activityLoaded.warning;
  const boardLoaded=loadBoardState(storage);let boardRequest=boardLoaded.state,boardSaveWarning=boardLoaded.warning,boardProtected=boardLoaded.protected;
  const sessionLoaded=loadSessionState(storage);let sessions=sessionLoaded.state,sessionSaveWarning=sessionLoaded.warning;
  const $=id=>mount.querySelector('#'+id);
  const active=()=>entered&&!disposed&&!paused&&isActive()&&!document.hidden;
  const blocked=()=>Boolean(dialogue)||Boolean(storyAction)||Boolean(boardAction)||Boolean(sessionAction)||!$('classroom-help').hidden||!$('classroom-collection').hidden||!$('classroom-completion').hidden||!$('classroom-session-result').hidden||sitting||standing||Boolean(seatAlign)||sleeping;
  const interactive=()=>active()&&!blocked();
  mount.innerHTML=`
    <section id="classroom-panel" class="classroom-panel mission-card" aria-labelledby="classroom-task">
      <div class="mission-topline"><span>101호 · 수아와 함께하는 첫 수업</span><span id="classroom-progress"></span></div>
      <h1 id="classroom-task"></h1>
      <section id="classroom-session-card" class="classroom-session-card" aria-labelledby="classroom-session-title"><h2 id="classroom-session-title">오늘의 놀이 수업</h2><p id="classroom-session-status"></p><p id="classroom-session-question" hidden lang="ko"></p><div class="classroom-session-tools"><button id="classroom-session-go" type="button">놀이 수업 시작하기</button><button id="classroom-session-back" type="button" hidden>물건 수업 계속하기</button></div><p id="classroom-session-feedback" role="status" aria-live="polite"></p><button id="classroom-session-hint" type="button" hidden>낱말 힌트 보기</button><div id="classroom-session-choices" class="dialogue-choices" hidden></div><p id="classroom-session-rewards"></p></section>
      <p id="classroom-location" class="classroom-location" hidden></p>
      <div id="classroom-find-tools" class="classroom-find-tools" hidden><button id="classroom-find-go" type="button">가까이 가기</button><button id="classroom-find-look" type="button">물건 쪽 보기</button></div>
      <p id="classroom-prompt"></p><p id="classroom-memory" class="classroom-memory"></p>
      <button id="classroom-story-action" type="button" hidden>연필로 써 보기</button>
      <button id="classroom-rest-toggle" type="button" hidden>잠깐 졸기</button><p id="classroom-rest-status" class="classroom-memory" role="status" hidden>졸고 있어요. 「잠 깨기」를 누르면 다시 활동할 수 있어요.</p>
      <div id="classroom-goal" class="classroom-goal goal-shape" role="img" aria-label="찾을 모양" hidden></div>
      <button id="classroom-hint-toggle" type="button" hidden>친구에게 힌트 받기</button>
      <div id="classroom-hint" class="classroom-hint" hidden><strong id="classroom-hint-title"></strong><p id="classroom-hint-text" role="status" aria-live="polite"></p><button id="classroom-hint-close" type="button">힌트 닫기</button></div>
      <p id="classroom-save" class="save-status" role="status"></p>
      <div class="classroom-panel-tools"><button id="classroom-collection-toggle" type="button">만난 낱말 <span id="classroom-word-count">0 / 30</span></button><span id="classroom-activity-count" class="classroom-memory"></span><button id="classroom-help-toggle" type="button" aria-label="교실 조작 방법">?</button></div>
      <section id="classroom-board-task" class="classroom-board-task" aria-labelledby="classroom-board-title"><h2 id="classroom-board-title">선생님의 부탁 · 칠판 지우기</h2><p id="classroom-board-prompt" role="status" aria-live="polite"></p><button id="classroom-board-go" type="button">선생님께 가기</button><button id="classroom-board-back" type="button" hidden>물건 수업 계속하기</button></section>
    </section>
    <section id="classroom-word-panel" class="classroom-word-panel discovery-panel" aria-labelledby="classroom-word" hidden>
      <p id="classroom-selected-label" class="selected-object-label">방금 고른 물건</p><h2 id="classroom-word" class="object-word" lang="ko"></h2>
      <p id="classroom-word-meaning" class="classroom-word-meaning" lang="ko"></p>
      <p class="classroom-sentence-label">문장으로 보기</p><p id="classroom-sentence" class="classroom-sentence" lang="ko"></p>
      <p id="classroom-feedback" class="object-feedback" role="status" aria-live="polite"></p>
      <div class="object-actions"><button id="classroom-word-close" type="button">장면 계속 보기</button></div>
    </section>
    <section id="classroom-dialogue" class="classroom-dialogue dialogue" role="dialog" aria-modal="true" aria-labelledby="classroom-speaker" hidden>
      <div class="dialogue-heading"><div><span>교실 친구</span><h2 id="classroom-speaker"></h2></div><button id="classroom-close" type="button" aria-label="교실 대화 닫기">×</button></div>
      <p id="classroom-dialogue-turn" class="classroom-dialogue-turn" role="status"></p><p id="classroom-text" lang="ko"></p>
      <div id="classroom-choices" class="dialogue-choices"></div><p id="classroom-dialogue-feedback" class="object-feedback" role="status" aria-live="polite"></p>
    </section>
    <section id="classroom-session-result" class="classroom-overlay overlay" role="dialog" aria-modal="true" aria-labelledby="classroom-session-result-title" hidden><div class="completion-card classroom-session-results"><h2 id="classroom-session-result-title">오늘의 놀이 수업을 마쳤어요!</h2><p id="classroom-session-teacher"></p><p id="classroom-session-result-summary"></p><div id="classroom-session-result-words"></div><p id="classroom-session-result-rewards"></p><button id="classroom-session-practice" type="button">헷갈린 낱말 연습하기</button><button id="classroom-session-next" type="button">새 놀이 수업</button><button id="classroom-session-result-close" type="button">교실 계속 둘러보기</button></div></section>
    <section id="classroom-help" class="classroom-overlay overlay" role="dialog" aria-modal="true" aria-labelledby="classroom-help-title" hidden><div class="help-card">
      <h2 id="classroom-help-title">친구와 함께 첫 수업을 해요</h2><p>캠퍼스의 8가지 활동을 마친 친구들이 같은 반에서 다시 만나요. 가방을 확인하고 연필을 빌린 뒤 빈자리에 앉아 써 봐요. 30가지 낱말 수업을 마치면 연필을 돌려주고 감사해요.</p><p>화면의 바닥을 눌러 이동해요. 방향 버튼이나 W A S D도 사용할 수 있어요.</p><p>화면을 끌거나 둘러보기 버튼으로 시선을 돌려요. 「시점 맞추기」로 앞을 다시 볼 수 있어요. 가까이에서 친구와 물건을 눌러 보세요.</p><p>처음 배우는 물건은 이름, 위치와 테두리가 보여요. 「가까이 가기」로 물건 앞까지 걸어가고, 「물건 쪽 보기」로 바라볼 수 있어요. 도착한 뒤 직접 물건을 눌러야 낱말이 기록돼요.</p><p>친구에게 물으면 서로 이야기하며 특징, 위치, 뜻과 문장을 알려 줘요. 「친구에게 힌트 받기」를 누르면 힌트가 차례로 열려요. 다시 찾기에서 다른 물건을 고르면 위치 힌트가 열려요. 직접 물건을 고른 뒤 다시 찾아야 기억한 낱말로 기록돼요. 대화와 힌트는 글로 보여요.</p><p>빈자리는 직접 눌러 앉아요. 책상이 있는 빈자리 어디서든 빌린 연필로 쓸 수 있어요. 「잠깐 졸기」로 쉬고 「잠 깨기」로 다시 활동해요. 이동하면 일어나요. 뒤쪽의 하나와 유나, 청소하는 지윤에게 말하면 활동에 관한 추가 낱말을 배워요. 「선생님께 가기」로 선생님의 부탁을 듣고 지우개를 가져와 칠판을 지운 뒤 제자리에 놓아요. 새 동사도 배워요. 목소리는 재생하지 않아요. 조용한 배경음은 위의 버튼으로 끌 수 있어요.</p><p>「놀이 수업 시작하기」에서 문장에 맞는 물건을 고르고 친구 두 명을 도와요. 동작과 물건을 보고 추가 낱말 11개를 고르면 결과와 스티커를 받을 수 있어요. 헷갈린 낱말은 마지막에 다시 나와요. 「헷갈린 낱말 연습하기」로 더 연습해요. 칠판 부탁을 하는 중이면 먼저 지우개를 돌려놓아요.</p><button id="classroom-help-close" class="primary" type="button">둘러보기</button>
    </div></section>
    <section id="classroom-collection" class="classroom-overlay overlay" role="dialog" aria-modal="true" aria-labelledby="classroom-collection-title" hidden><div class="vocabulary-card">
      <div class="vocabulary-heading"><h2 id="classroom-collection-title">교실에서 만난 낱말</h2><button id="classroom-collection-close" type="button" aria-label="낱말 닫기">×</button></div>
      <p>직접 고른 물건의 낱말과 문장이에요.</p><div id="classroom-collection-items" class="vocabulary-items"></div>
    </div></section>
    <section id="classroom-completion" class="classroom-overlay overlay" role="dialog" aria-modal="true" aria-labelledby="classroom-completion-title" hidden><div class="story-card completion-card">
      <p class="story-eyebrow">수아와 함께한 첫 수업</p><div class="completion-emblem">✓</div><h2 id="classroom-completion-title">새 낱말도 배우고, 친구도 생겼어요!</h2><p>30가지 낱말을 배우고 모두 다시 찾았어요. 빌린 연필을 돌려주고 감사했어요. 수아는 다음에 만나도 오늘의 일을 기억해요.</p><button id="classroom-continue" class="primary" type="button">친구와 다시 이야기하기</button><button type="button" data-classroom-exit>캠퍼스로 돌아가기</button>
    </div></section>
    <button id="classroom-exit" class="classroom-exit" type="button">캠퍼스로</button>
    <button id="classroom-camera-reset" class="classroom-camera-reset" type="button">시점 맞추기</button>
    <button id="classroom-interact" class="classroom-interact interact-button" type="button" hidden>이야기하기</button>`;
  function listen(target,type,fn,options){target.addEventListener(type,fn,options);removers.push(()=>target.removeEventListener(type,fn,options));}
  function clearInput(){keys.clear();held.clear();path=[];pending=null;pointer=null;for(const b of document.querySelectorAll('[data-direction]'))b.classList.remove('is-held');}
  function resetTalkAnimation(){speaker=null;for(const actor of actors.values())if(actor.userData.behavior)actor.userData.behavior.speaking=false;}
  function updateStory(event){
    const result=storyTransition(story,event);if(!result.changed)return result;
    story=result.state;
    // Previously completed vocabulary remains completed when the new story is installed.
    if(getStoryPhase(story)==='lesson'&&getProgress(state).completed===30)story=storyTransition(story,{type:'LESSON_DONE',reviewed:30}).state;
    const saved=saveStoryState(storage,story);storySaveWarning=saved.warning||'';syncPencilForStory();
    if(getStoryPhase(story)==='complete'&&!completionShown){$('classroom-completion').hidden=false;completionShown=true;clearInput();}
    syncUI();return result;
  }
  function update(event){const wasReview=getPhase(state)==='review';const result={...transition(state,event),wasReview};if(result.changed){state=result.state;const saved=saveState(storage,state);saveWarning=saved.warning||'';if(getStoryPhase(story)==='lesson'&&getProgress(state).completed===30)updateStory({type:'LESSON_DONE',reviewed:30});}syncUI();return result;}
  function syncUI(){
    const phase=getPhase(state),mission=getCurrentMission(state),p=getProgress(state),storyPhase=getStoryPhase(story),storyMission=getStoryMission(story,getCampusContext());
    const boardMission=getBoardMission(boardRequest),boardFocused=!boardProtected&&boardRequest.phase!=='complete'&&Boolean(boardGuide||boardAction),boardPrompt=boardAction?({take:'칠판지우개를 잡고 있어요.',erase:'칠판을 지우고 있어요.',put:'지우개를 제자리에 놓고 있어요.'}[boardAction.type]):boardMission.prompt;
    if(storyPhase!=='lesson'||hint?.key!==mission?.id)hint=null;
    $('classroom-progress').textContent='배운 낱말 '+p.learned+' / 30 · 기억한 낱말 '+p.completed+' / 30';
    $('classroom-task').textContent=storyAction?.type==='USE_PENCIL'?'빌린 연필로 쓰고 있어요':storyAction?'친구와 물건을 주고받고 있어요':storyMission?.title||mission?.title||'교실의 30가지 물건';
    $('classroom-prompt').textContent=storyAction?.type==='USE_PENCIL'?'빌린 연필로 공책에 쓰고 있어요.':storyAction?'동작이 끝나면 다음 활동을 할 수 있어요.':storyMission?.prompt||(mission?.prompt||'교실을 둘러보세요')+' ('+(mission?.done||0)+' / '+(mission?.total||0)+')';
    $('classroom-memory').textContent=getStoryMemory(story,getCampusContext());
    $('classroom-story-action').hidden=storyPhase!=='use-pencil';$('classroom-story-action').disabled=!interactive()||!writingSeat()||propOwners.get('board-eraser')==='hero';
    $('classroom-rest-toggle').hidden=!seated;$('classroom-rest-toggle').textContent=sleeping?'잠 깨기':'잠깐 졸기';$('classroom-rest-toggle').disabled=sleeping?!active():!interactive();$('classroom-rest-status').hidden=!sleeping;
    const seatGuide=storyPhase==='use-pencil'&&!storyAction&&!boardFocused;
    if(seatGuide)$('classroom-prompt').textContent=sleeping?'졸고 있어요. 「잠 깨기」를 누른 뒤 써 봐요.':sitting||seatAlign?'자리에 앉고 있어요. 동작이 끝나면 쓸 수 있어요.':standing?'자리에서 일어나는 중이에요. 빈자리에 앉아 써 봐요.':writingSeat()?'책상이 있는 빈자리에 앉았어요. 「연필로 써 보기」를 눌러요.':storyMission.prompt;
    if(seatGuide&&propOwners.get('board-eraser')==='hero')$('classroom-prompt').textContent='칠판지우개를 먼저 제자리에 놓으면 빌린 연필로 쓸 수 있어요.';
    $('classroom-save').textContent=[saveWarning,storySaveWarning,activitySaveWarning,boardSaveWarning,sessionSaveWarning].filter(Boolean).join(' ')||'이야기와 배운 낱말을 저장해요. 중간에 나가도 이어서 할 수 있어요.';
    $('classroom-word-count').textContent=state.discovered.length+' / 30';
    $('classroom-activity-count').textContent='추가 낱말 '+activityWords.length+' / '+Object.keys(ACTIVITY_WORDS).length;
    $('classroom-board-prompt').textContent=boardPrompt;$('classroom-board-go').textContent=boardMission.button;$('classroom-board-go').disabled=!interactive()||boardProtected;
    $('classroom-board-back').hidden=!boardFocused;$('classroom-board-back').disabled=!interactive();
    if(boardFocused){$('classroom-task').textContent='선생님의 부탁 · 칠판 지우기';$('classroom-prompt').textContent=boardPrompt;}
    $('classroom-hint-toggle').hidden=boardFocused||storyPhase!=='lesson'||!mission;$('classroom-hint-toggle').disabled=Boolean(storyAction)||Boolean(boardAction)||Boolean(dialogue);
    $('classroom-hint-toggle').textContent=hint&&hint.level<3?'다음 힌트 보기':hint?'힌트 다시 보기':'친구에게 힌트 받기';
    $('classroom-hint').hidden=!hint;$('classroom-hint-title').textContent=hint?.title||'';$('classroom-hint-text').textContent=hint?.text||'';
    const assisted=!boardFocused&&storyPhase==='lesson'&&mission&&(phase==='learn'||hint?.showLocation),guide=assisted?getWordGuide(mission.target):null;
    $('classroom-location').hidden=!guide&&!seatGuide;$('classroom-location').textContent=seatGuide?'책상이 있는 빈자리면 어디서든 쓸 수 있어요. 가운데와 뒤쪽 가운데 자리가 비어 있어요.':guide?'찾을 물건: '+guide.word+' · '+guide.location:'';
    $('classroom-find-tools').hidden=!guide&&!seatGuide;
    $('classroom-find-go').textContent=seatGuide?'빈자리로 가기':'가까이 가기';$('classroom-find-look').textContent=seatGuide?'자리 쪽 보기':'물건 쪽 보기';
    $('classroom-find-go').disabled=!interactive()||(seatGuide&&Boolean(writingSeat()));$('classroom-find-look').disabled=!interactive();
    const shape=boardFocused?null:OBJECT_BY_ID[storyPhase==='check-bag'?'bag':storyMission?null:hint?.showShape?mission?.target:mission?.goalIcon]?.shape;
    $('classroom-goal').hidden=!shape;$('classroom-goal').innerHTML=shape?'<svg viewBox="0 0 120 120" aria-hidden="true" fill="none" stroke="#527c6b" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">'+'<path d="'+shape+'"/>'+'</svg>':'';
    if(room){for(const [id,owner] of propOwners)if(owner!=='world'&&owner!=='hero'&&room.targets[owner])room.targets[id]=room.targets[owner].clone();
      if(boardFocused){const action=boardAction?.type||boardMission.action,id={teacher:'teacher',take:'board-eraser',erase:'board',put:null}[action];room.setObjective(id,action==='teacher'?room.targets.teacher:boardTarget(action));}
      else room.setObjective(seatGuide?guideTarget():storyMission?storyMission.target:phase==='learn'||hint?.showLocation?mission?.target:null);
    }
    if(reveal){const extra=ACTIVITY_WORDS[reveal.activity];$('classroom-selected-label').textContent=extra?'친구에게 배운 추가 낱말':'방금 고른 물건';$('classroom-word').textContent=extra?.word||OBJECT_WORDS[reveal.id];$('classroom-word-meaning').textContent=extra?.meaning||getWordGuide(reveal.id)?.meaning||'';$('classroom-sentence').textContent=extra?.sentence||OBJECT_SENTENCES[reveal.id]||'';}
    $('classroom-word-panel').hidden=!reveal;
    $('classroom-dialogue').hidden=!dialogue;
    syncSessionUI();
    const modal=blocked();for(const b of [document.querySelector('.movement-pad'),document.getElementById('look-controls')])if(b)b.style.visibility=modal?'hidden':'';
  }
  function showHint(level){if(!active()||storyAction||getStoryPhase(story)!=='lesson')return;const next=getLessonHint(state,level??(hint?.level||0)+1);if(!next)return;hint=next;syncUI();}
  function showReveal(id,result){reveal={id,advanced:result?.advanced===true};$('classroom-feedback').textContent=result?.reviewCorrect?CONTENT.feedback.correctReview:result?.wasReview?CONTENT.feedback.wrongReview:result?.advanced?CONTENT.feedback.correctObject:result?.changed?CONTENT.feedback.discovered:CONTENT.feedback.alreadyDiscovered;syncUI();}
  function actorName(id){return CONTENT.classmates[id]||CLASSMATE_NAMES[id]||({hero:'나'}[id])||'친구';}
  function writingSeat(){return room?.seats.find(s=>s.id===seated&&s.desk&&![...slots.values()].some(slot=>slot.seatId===s.id))||null;}
  function toggleRest(){if(!active())return;if(sleeping){sleeping=false;syncUI();return;}if(!interactive()||!seated)return;clearInput();reveal=null;resetTalkAnimation();sleeping=true;syncUI();}
  function learnActivity(id){const previous=activityWords,result=learnActivityWords(storage,previous,id);activityWords=result.words;if(result.words!==previous||result.warning)activitySaveWarning=result.warning;}
  function showActivityWord(id){reveal={activity:id};$('classroom-feedback').textContent='친구의 활동을 보고 배운 낱말이에요.';syncUI();}
  function sessionContext(){return(getSessionRun(sessions)?.id||'')+':'+(getSessionTask(sessions)?.key||'complete');}
  function cancelSessionMotion(){
    sessionEpoch++;sessionAction?.handle?.cancel?.();sessionAction=null;sessionWatch=null;sessionReady=null;
    if(sessionPractice&&room){setEraserOwner(['erase-board','put-eraser'].includes(boardRequest.phase)?'hero':'world');boardVisuals?.setPhase(boardRequest.phase);}
    sessionPractice=null;if(room)clearInput();
  }
  function applySessionSave(saved){
    const before=sessionContext();sessions=saved.state;sessionSaveWarning=saved.warning;
    if(before!==sessionContext()){cancelSessionMotion();if(dialogue?.sessionKey)closeDialogue();}
    activityProps?.setRewardDecoration(getSessionRewards(sessions).some(r=>r.id==='first-class'),room?.seats.find(s=>s.id==='student-seat'));
  }
  function refreshSessions(){applySessionSave(saveSessionState(storage,sessions));}
  function recordSessionAnswer(task,choice,hintOnly=false){
    refreshSessions();if(getSessionTask(sessions)?.key!==task.key||getSessionTask(sessions)?.runId!==task.runId)return false;
    const result=answerSession(sessions,{key:task.key,choice,hint:hintOnly});if(!result.changed)return false;
    applySessionSave(saveSessionState(storage,result.state));
    if(result.correct&&task.wordId)learnActivity(task.wordId);
    if(sessionFocused&&getSessionProgress(sessions).complete)showSessionResults();else syncUI();return result.correct;
  }
  function beginSession(mode='daily'){
    if(!active()||storyAction||boardAction||sessionAction||sitting||standing||sleeping)return;
    refreshBoardProgress();refreshSessions();if(!['offered','complete'].includes(boardRequest.phase)&&!boardProtected){notify('칠판 부탁을 끝내고 놀이 수업을 시작해요.');return;}
    cancelSessionMotion();closeDialogue();$('classroom-session-result').hidden=true;$('classroom-completion').hidden=true;$('classroom-help').hidden=true;$('classroom-collection').hidden=true;
    const seed=Math.floor(Math.random()*4294967296),id=globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    const result=startSession(sessions,{id,seed,mode});if(!result.changed){syncUI();return;}
    applySessionSave(saveSessionState(storage,result.state));sessionFocused=true;boardGuide=null;hint=null;reveal=null;sessionFeedback='문장을 읽고 직접 고르세요. 시간 제한은 없어요.';syncUI();canvas.focus({preventScroll:true});
  }
  function goSession(){
    if(!interactive())return;refreshSessions();if(!getSessionRun(sessions)){beginSession();return;}if(getSessionProgress(sessions).complete){showSessionResults();return;}
    refreshBoardProgress();if(!boardProtected&&!['offered','complete'].includes(boardRequest.phase)){notify('칠판 부탁을 끝낸 뒤 놀이 수업을 이어 해요.');return;}
    sessionFocused=true;boardGuide=null;hint=null;reveal=null;const task=getSessionTask(sessions);
    if(task.type==='object'){lookAtObject(task.target);walkTo(room.targets[task.target]);}
    else if(task.type==='help'){if(nearActor(task.actor))openDialogue(task.actor);else walkTo(room.targets[task.actor],{type:'actor',id:task.actor});}
    else if(sessionReady!==task.key){if(task.action){if(!sessionPractice){sessionPractice={key:task.key,wordId:task.wordId,stage:'take',answer:null};boardVisuals.setPhase('take-eraser');}goPracticeStep(sessionPractice.stage);}
      else if(nearActor(task.actor))startSessionWatch(task);else walkTo(room.targets[task.actor],{type:'session-watch',key:task.key,actor:task.actor});}
    syncUI();
  }
  function startSessionWatch(task){
    if(!interactive()||!sessionFocused||getSessionTask(sessions)?.key!==task.key||!nearActor(task.actor))return;
    clearInput();sessionFeedback='동작이나 물건을 잘 보고 낱말을 골라요.';guideFocus=task.prop||task.actor;
    if(task.wordId==='request'){
      const token=++sessionEpoch;sessionAction={key:task.key,type:'request',handle:null};
      const finish=()=>{if(!active()||token!==sessionEpoch||sessionAction?.key!==task.key)return;sessionAction=null;sessionReady=task.key;learnActivity(task.wordId);syncUI();};
      const handle=characters.playActorAction(actors.get('teacher'),'point',{onFinish:finish});if(sessionAction)sessionAction.handle=handle;if(!handle.supported){cancelSessionMotion();notify('동작을 불러오지 못했어요. 다시 시도해요.');}
    }else sessionWatch={key:task.key,actor:task.actor,elapsed:0};syncUI();
  }
  function goPracticeStep(type){
    if(!sessionPractice||!interactive())return;sessionPractice.stage=type;const point=boardTarget(type==='erase'?'erase':type==='put'?'put':'take');
    if(hero.position.distanceTo(point)<.025)startPracticeClip(type);else walkTo(point,{type:'session-board',action:type,key:sessionPractice.key});
    if(type==='erase')lookAtObject('board');syncUI();
  }
  function startPracticeClip(type){
    const practice=sessionPractice,task=getSessionTask(sessions);if(!interactive()||!practice||!sessionFocused||task?.key!==practice.key||hero.position.distanceTo(boardTarget(type))>.025)return;
    clearInput();reveal=null;sessionReady=null;const token=++sessionEpoch,target=type==='erase'?boardVisuals.contact:propRest.get('board-eraser').position.clone();if(type!=='erase')room.root.localToWorld(target);
    hero.rotation.y=type==='erase'?Math.PI:Math.atan2(target.x-hero.position.x,target.z-hero.position.z);guideFocus=type==='erase'?'board':null;
    sessionAction={key:task.key,type,handle:null};const valid=()=>active()&&token===sessionEpoch&&sessionPractice===practice&&sessionAction?.key===task.key;
    const finish=()=>{
      if(!valid())return;sessionAction=null;if(type==='take')setEraserOwner('hero');if(type==='put')setEraserOwner('world');
      if(type==='take'&&practice.wordId!=='hold'){goPracticeStep(practice.wordId==='erase'?'erase':'put');return;}
      if(type==='put'&&practice.answer){const answer=practice.answer;sessionPractice=null;boardVisuals.setPhase(boardRequest.phase);sessionFeedback='맞아요! 지우개도 제자리에 돌려놓았어요.';recordSessionAnswer(task,answer.choice);return;}
      if(type==='put'){sessionPractice=null;boardVisuals.setPhase(boardRequest.phase);}
      sessionReady=task.key;learnActivity(task.wordId);sessionFeedback='방금 한 동작에 맞는 낱말을 골라요.';syncUI();
    };
    const handle=characters.playActorAction(hero,{take:'grab',erase:'erase',put:'putdown'}[type],{onMarker:marker=>{if(!valid())return;if(marker.name==='grasp')setEraserOwner('hero');if(marker.name==='place')setEraserOwner('world');},onFinish:finish});
    if(sessionAction)sessionAction.handle=handle;if(!handle.supported){cancelSessionMotion();notify('동작을 불러오지 못했어요. 다시 시도해요.');}syncUI();
  }
  function chooseSessionWord(choice){
    if(!interactive()||!sessionFocused)return;refreshSessions();const task=getSessionTask(sessions);if(task?.type!=='review'||sessionReady!==task.key||!task.choices.includes(choice))return;
    const correct=choice===task.wordId;
    sessionFeedback=correct?'맞아요! '+ACTIVITY_WORDS[task.wordId].sentence:ACTIVITY_WORDS[choice].word+' · '+ACTIVITY_WORDS[choice].meaning+' 지금은 '+ACTIVITY_WORDS[task.wordId].meaning+' 다시 골라요.';
    if(correct&&sessionPractice&&propOwners.get('board-eraser')==='hero'){sessionPractice.answer={choice};goPracticeStep('put');return;}
    recordSessionAnswer(task,choice);
  }
  function showSessionHint(){
    if(!interactive()||!sessionFocused)return;const task=getSessionTask(sessions);if(!task)return;
    recordSessionAnswer(task,null,true);sessionFeedback=task.type==='object'?getWordGuide(task.target).meaning+' '+getWordGuide(task.target).location:task.type==='help'?task.explanation:ACTIVITY_WORDS[task.wordId].word+' · '+ACTIVITY_WORDS[task.wordId].meaning+' · '+ACTIVITY_WORDS[task.wordId].sentence;syncUI();
  }
  function showSessionResults(){
    if(!active())return;cancelSessionMotion();dialogue=null;dialogueRig=null;reveal=null;clearInput();const result=getSessionResults(sessions),memory=getSessionWordMemory(sessions);
    $('classroom-session-result-title').textContent='놀이 수업 '+result.number+'회를 마쳤어요!';
    $('classroom-session-teacher').textContent=result.practice.length?'선생님: 끝까지 잘했어요. 헷갈린 낱말을 다시 연습하면 더 잘 기억할 수 있어요.':'선생님: 잘했어요! 문장을 읽고 친구도 도우며 낱말을 기억했어요.';
    $('classroom-session-result-summary').textContent='미션 '+result.done+' / '+result.total+' · 물건 '+result.objects.length+'개 · 도운 친구 '+result.helped.length+'명';
    $('classroom-session-result-words').replaceChildren();for(const [title,ids]of [['만난 낱말',result.seen],['기억한 낱말',result.remembered],['더 연습할 낱말',result.practice]]){const p=document.createElement('p');p.textContent=title+' '+ids.length+'개 · '+(ids.map(id=>ACTIVITY_WORDS[id].word).join(', ')||'없어요');$('classroom-session-result-words').append(p);}
    $('classroom-session-result-rewards').textContent=result.rewards.map(r=>r.symbol+' '+r.label).join(' · ');$('classroom-session-practice').disabled=!memory.practice.length;
    $('classroom-session-result').hidden=false;$('classroom-session-practice').focus({preventScroll:true});syncUI();
  }
  function syncSessionUI(){
    const p=getSessionProgress(sessions),task=getSessionTask(sessions),focused=sessionFocused&&Boolean(task),ready=focused&&task.type==='review'&&sessionReady===task.key;
    $('classroom-session-status').textContent=getSessionRun(sessions)?'놀이 수업 '+p.number+'회 · 미션 '+p.done+' / '+p.total+(p.complete?' · 완료':task?.retry?' · 헷갈린 낱말 다시 보기':''):'문장 미션 3개 · 친구 돕기 2개 · 추가 낱말 11개';
    $('classroom-session-question').hidden=!focused;$('classroom-session-question').textContent=focused?task.prompt:'';
    $('classroom-session-go').textContent=p.complete?'놀이 수업 결과 보기':!getSessionRun(sessions)?'놀이 수업 시작하기':!sessionFocused?'놀이 수업 이어 하기':task.type==='object'?'물건 쪽 둘러보기':task.type==='help'?'친구에게 가기':sessionReady===task.key?'동작 다시 보기':'동작과 물건 보기';
    if(ready)$('classroom-session-go').textContent='아래 낱말을 골라요.';
    $('classroom-session-go').disabled=!interactive()||ready;$('classroom-session-back').hidden=!sessionFocused;$('classroom-session-back').disabled=!interactive();
    $('classroom-session-feedback').textContent=sessionFeedback;$('classroom-session-hint').hidden=!focused;$('classroom-session-hint').disabled=!interactive();
    $('classroom-session-choices').hidden=!ready;$('classroom-session-choices').replaceChildren();
    if(ready)for(const id of task.choices){const b=document.createElement('button');b.type='button';b.dataset.classroomSessionChoice=id;b.textContent=ACTIVITY_WORDS[id].word;b.disabled=!interactive();$('classroom-session-choices').append(b);}
    $('classroom-session-rewards').textContent=getSessionRewards(sessions).map(r=>r.symbol+' '+r.label).join(' · ');
    if(focused){$('classroom-task').textContent=(task.retry?'다시 기억해요':'오늘의 놀이 수업')+' · '+(p.done+1)+' / '+p.total;$('classroom-prompt').textContent=task.type==='review'?task.prompt+' '+(sessionAction?'동작이 끝날 때까지 살펴보세요.':ready?'아래 낱말을 골라요.':'「동작과 물건 보기」를 눌러 가까이 가요.'):task.prompt;
      for(const id of ['classroom-location','classroom-find-tools','classroom-goal','classroom-hint-toggle','classroom-hint','classroom-story-action'])$(id).hidden=true;
      if(room)room.setObjective(task.type==='object'?task.target:task.actor,task.action?boardTarget(sessionPractice?.stage||(task.wordId==='erase'?'erase':'take')):undefined);
    }
  }
  function variant(actor,id){
    const colors=id==='teacher'?{'periwinkle cardigan':0x677a62,'sand trousers':0x82746a}:id==='hana'?{'rose cardigan':0xb19cbe,'rose ribbed cuffs':0x9881a7}:id==='jiun'?{'cream hoodie':0xb3c7c0,'hoodie seams':0x92aaa1}:null;
    if(!colors)return;const copied=new Map();actor.traverse(node=>{if(!node.isMesh)return;const list=Array.isArray(node.material)?node.material:[node.material];const out=list.map(m=>{if(!Object.hasOwn(colors,m.name))return m;if(!copied.has(m)){const clone=m.clone();clone.color.setHex(colors[m.name]);copied.set(m,clone);variantMaterials.add(clone);}return copied.get(m);});node.material=Array.isArray(node.material)?out:out[0];});
  }
  async function setup(token){
    const nextScene=new THREE.Scene();nextScene.background=new THREE.Color('#e9e4d8');nextScene.fog=new THREE.Fog('#e9e4d8',27,55);
    const nextRoom=await createModelClassroom(nextScene,{signal:loadAbort.signal});
    if(disposed||paused||token!==loadEpoch){nextRoom.dispose();return false;}
    scene=nextScene;room=nextRoom;
    cameraCollision=createCameraCollision({THREE,getObstacles:()=>room?.cameraObstacles||[],getBounds:()=>({...room?.walkBounds,minY:.58,maxY:3.22})});
    if(!room.lightingOwned){scene.add(new THREE.HemisphereLight(0xfff1da,0x77907f,2.2));const sun=new THREE.DirectionalLight(0xffe7ca,1.9);sun.position.set(-8,13,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.normalBias=.035;scene.add(sun);}
    hero=characters.createActor('player',{outfit:'uniform'});hero.position.copy(room.spawn);hero.rotation.y=Math.PI;actors.set('hero',hero);scene.add(hero);
    const seatOwners=new Set();
    for(const [id,spec] of Object.entries(room.actorSpawns)){
      if(spec.seatId){if(seatOwners.has(spec.seatId))throw new Error('교실 자리 배정이 겹쳤어요.');seatOwners.add(spec.seatId);}
      const actor=characters.createActor(id,{outfit:id==='teacher'?'formal':id==='hana'?'casual':'uniform'});if(!actor.userData.humanBody)variant(actor,id);
      actor.position.copy(spec.position);actor.position.y=0;actor.rotation.y=spec.yaw;actor.userData.interactableKey=id;scene.add(actor);actors.set(id,actor);
      slots.set(id,{homeYaw:spec.yaw,seated:spec.seated,seatHeight:spec.position.y||.52,seatId:spec.seatId||null,activity:spec.activity||'idle',gesture:null,until:0});
    }
    activityProps=createClassroomActivityProps({THREE,scene,actors});
    activityProps.setRewardDecoration(getSessionRewards(sessions).some(r=>r.id==='first-class'),room.seats.find(s=>s.id==='student-seat'));
    for(const item of room.selectableObjects){const id=item.userData.discoveryId;propOwners.set(id,'world');propRest.set(id,{position:item.position.clone(),rotation:item.rotation.clone(),scale:item.scale.clone(),target:room.targets[id].clone()});}
    boardVisuals=createBoardVisuals({THREE,room});boardVisuals.setPhase(boardRequest.phase);
    room.targets['erase-board']=boardVisuals.stance.clone();
    // All 30 original props stay in the scene so learning and physical review
    // can use the same object, including after loading a saved lesson.
    for(const [id] of actors)if(id!=='hero'){const goal=approachActor(id,id==='teacher'?1.04:1.12);if(goal)room.targets[id]=goal;}
    syncPencilForStory();
    setEraserOwner(['erase-board','put-eraser'].includes(boardRequest.phase)?'hero':'world');
    yaw=0;pitch=-.08;camera.position.copy(hero.position).add(new THREE.Vector3(0,2.7,3.8));
    return true;
  }
  function restoreProps(){if(!room)return;for(const [id,rest] of propRest){const item=room.objectsById.get(id);if(!item)continue;room.root.add(item);item.position.copy(rest.position);item.rotation.copy(rest.rotation);item.scale.copy(rest.scale);if(item.userData.coverGroup)item.userData.coverGroup.rotation.z=0;}}
  function setPencilOwner(owner){
    if(!room)return;const pencil=room.objectsById.get('pencil'),rest=propRest.get('pencil');if(!pencil||!rest)return;
    reactions.delete('pencil');
    if(owner==='world'){room.root.add(pencil);pencil.position.copy(rest.position);pencil.rotation.copy(rest.rotation);pencil.scale.copy(rest.scale);room.targets.pencil=rest.target.clone();}
    else{const actor=actors.get(owner),socket=actor?.userData.sockets?.[owner==='hero'&&propOwners.get('board-eraser')==='hero'?'leftHand':'rightHand'];if(!socket)return;socket.add(pencil);pencil.position.set(0,-.01,.04);pencil.rotation.set(0,Math.PI/2,0);pencil.scale.copy(rest.scale);room.targets.pencil=(room.targets[owner]||actor.position).clone();}
    propOwners.set('pencil',owner);pencil.updateWorldMatrix(true,true);
  }
  function syncPencilForStory(){const phase=getStoryPhase(story);setPencilOwner(['greet-sua','check-bag','borrow-pencil','thank-sua','complete'].includes(phase)?'sua':['use-pencil','return-pencil'].includes(phase)?'hero':'world');}
  function setEraserOwner(owner){
    if(!room)return;const item=room.objectsById.get('board-eraser'),rest=propRest.get('board-eraser');if(!item||!rest)return;reactions.delete('board-eraser');
    if(owner==='hero'){hero.userData.sockets.rightHand.add(item);item.position.set(0,-.015,.012);item.rotation.set(0,0,0);item.scale.copy(rest.scale);}
    else{room.root.add(item);item.position.copy(rest.position);item.rotation.copy(rest.rotation);item.scale.copy(rest.scale);room.targets['board-eraser']=rest.target.clone();}
    propOwners.set('board-eraser',owner);syncPencilForStory();item.updateWorldMatrix(true,true);
  }
  function applyBoardSave(saved){
    boardSaveWarning=saved.warning;
    if(saved.protected){boardProtected=true;cancelBoardAction();if(room){clearInput();setEraserOwner('world');boardVisuals?.setPhase(boardRequest.phase);}return;}
    boardProtected=false;const changed=saved.state.phase!==boardRequest.phase,following=Boolean(boardGuide||boardAction);
    if(changed){if(sessionPractice||sessionAction){cancelSessionMotion();sessionFocused=false;}cancelBoardAction();if(room)clearInput();boardRequest=saved.state;boardGuide=following&&boardRequest.phase!=='complete'?getBoardMission(boardRequest).action:null;
      if(room){boardVisuals?.setPhase(boardRequest.phase);setEraserOwner(['erase-board','put-eraser'].includes(boardRequest.phase)?'hero':'world');}
    }
  }
  function refreshBoardProgress(){applyBoardSave(saveBoardState(storage,boardRequest));}
  function updateBoard(event){if(boardProtected)return false;const result=boardTransition(boardRequest,event);if(!result.changed)return false;const saved=saveBoardState(storage,result.state);applyBoardSave(saved);syncUI();return!saved.protected&&saved.state.phase===result.state.phase;}
  function cancelBoardAction(){boardEpoch++;boardAction?.handle?.cancel?.();boardAction=null;boardGuide=null;}
  function boardTarget(type){
    if(type==='erase')return boardVisuals.stance.clone();const rest=propRest.get('board-eraser'),position=rest.position.clone();room.root.localToWorld(position);
    const p=new THREE.Vector3(position.x-.32,0,position.z+.10);return isWalkable(p.x,p.z)?p:rest.target.clone();
  }
  function goBoard(){
    if(!interactive())return;cancelSessionMotion();sessionFocused=false;refreshBoardProgress();syncUI();if(boardProtected)return;const mission=getBoardMission(boardRequest),type=mission.action;
    if(type==='word'){showActivityWord('erase');return;}
    reveal=null;boardGuide=type;
    if(type==='teacher'){walkTo(room.targets.teacher,{type:'actor',id:'teacher'});syncUI();return;}
    const point=boardTarget(type);if(!seated&&hero.position.distanceTo(point)<.18)startBoardAction(type);else{walkTo(point,{type:'board',action:type});if(type==='erase'){lookAtObject('board');}syncUI();}
  }
  function startBoardAction(type){
    refreshBoardProgress();
    if(!interactive()||boardProtected||seated||getBoardMission(boardRequest).action!==type)return;
    const point=boardTarget(type);if(hero.position.distanceTo(point)>.025){walkTo(point,{type:'board',action:type});syncUI();return;}
    if(type==='erase'&&propOwners.get('board-eraser')!=='hero')return;
    clearInput();resetTalkAnimation();reveal=null;boardGuide=type;const token=++boardEpoch;
    const target=type==='erase'?boardVisuals.contact:new THREE.Vector3();if(type!=='erase'){target.copy(propRest.get('board-eraser').position);room.root.localToWorld(target);}
    hero.rotation.y=type==='erase'?Math.PI:Math.atan2(target.x-hero.position.x,target.z-hero.position.z);
    boardAction={type,handle:null};const valid=()=>active()&&token===boardEpoch&&boardAction?.type===type;
    const finish=()=>{if(!valid())return;if(type==='take')setEraserOwner('hero');if(type==='put')setEraserOwner('world');boardAction=null;
      if(updateBoard({take:'TAKE',erase:'ERASE',put:'PUT'}[type]))learnActivity({take:'hold',erase:'erase',put:'put'}[type]);
      if(type==='put')showDialogue(getTeacherBoardDialogue(boardRequest),'teacher');else syncUI();
    };
    const handle=characters.playActorAction(hero,{take:'grab',erase:'erase',put:'putdown'}[type],{onMarker:marker=>{if(!valid())return;if(marker.name==='grasp')setEraserOwner('hero');if(marker.name==='place')setEraserOwner('world');},onFinish:finish});
    if(boardAction?.type===type)boardAction.handle=handle;if(!handle.supported)finish();else syncUI();
  }
  function cancelStoryAction(){storyActionEpoch++;if(storyAction)for(const handle of storyAction.handles)handle?.cancel?.();storyAction=null;activityProps?.setWritingDesk(null);}
  function performStoryAction(type){
    if(!interactive()||sessionFocused||getStoryPhase(story)!==({'BORROW_PENCIL':'borrow-pencil','USE_PENCIL':'use-pencil','RETURN_PENCIL':'return-pencil'}[type]))return;
    if(propOwners.get('board-eraser')==='hero'){notify('칠판지우개를 먼저 제자리에 놓아요. 그다음 연필을 사용할 수 있어요.');return;}
    if(type==='USE_PENCIL'?(!writingSeat()||!getStoryInventory(story).length):!nearActor('sua'))return;
    clearInput();resetTalkAnimation();reveal=null;const token=++storyActionEpoch;
    storyAction={type,partner:type==='USE_PENCIL'?null:'sua',handles:[]};
    if(type==='USE_PENCIL')activityProps?.setWritingDesk(writingSeat());
    const valid=()=>active()&&storyActionEpoch===token&&storyAction?.type===type;
    const handoff=()=>{if(valid()&&type!=='USE_PENCIL')setPencilOwner(type==='BORROW_PENCIL'?'hero':'sua');};
    const finish=()=>{if(!valid())return;handoff();storyAction=null;activityProps?.setWritingDesk(null);updateStory({type});if(type==='BORROW_PENCIL'||type==='USE_PENCIL')update({type:'SELECT_OBJECT',item:'pencil'});if(type==='USE_PENCIL')update({type:'SELECT_OBJECT',item:'notebook'});notify(type==='BORROW_PENCIL'?'수아의 연필을 받았어요. 빈자리에 앉아 써 보세요.':type==='USE_PENCIL'?'연필로 써 봤어요. 이제 교실의 낱말을 함께 배워요.':'수아에게 같은 연필을 돌려줬어요. 감사 인사를 해요.');syncUI();};
    if(type!=='USE_PENCIL'){const other=actors.get('sua');hero.rotation.y=Math.atan2(other.position.x-hero.position.x,other.position.z-hero.position.z);const partner=characters.playActorAction?.(other,type==='BORROW_PENCIL'?'give':'receive',{});storyAction.handles.push(partner);}
    const handle=characters.playActorAction?.(hero,type==='BORROW_PENCIL'?'receive':type==='RETURN_PENCIL'?'give':'write',{onMarker:marker=>{if(marker.name==='handoff')handoff();},onFinish:finish});
    if(storyAction?.type===type)storyAction.handles.push(handle);
    if(!handle?.supported)finish();else syncUI();
  }
  function clearScene(){if(!scene)return;resetTalkAnimation();boardVisuals?.dispose();boardVisuals=null;activityProps?.dispose();activityProps=null;restoreProps();for(const actor of actors.values())characters.disposeActor(actor);actors.clear();slots.clear();for(const m of variantMaterials)m.dispose();variantMaterials.clear();if(!room?.lightingOwned)scene.traverse(node=>{if(node.isLight)node.shadow?.map?.dispose();});room?.dispose();renderer.renderLists.dispose();room=null;scene=null;hero=null;propOwners.clear();propRest.clear();reactions.clear();}
  function isWalkable(x,z,ignoreActor=null){
    if(!room)return false;const b=room.walkBounds;if(x<b.minX+.12||x>b.maxX-.12||z<b.minZ+.12||z>b.maxZ-.12)return false;
    if(room.obstacles.some(o=>o.name!=='chair-'+standingSeat&&x>o.minX-.28&&x<o.maxX+.28&&z>o.minZ-.28&&z<o.maxZ+.28))return false;
    for(const [id,actor] of actors)if(id!=='hero'&&id!==ignoreActor&&Math.hypot(x-actor.position.x,z-actor.position.z)<.62)return false;
    return true;
  }
  function segment(a,b){const count=Math.max(1,Math.ceil(a.distanceTo(b)/.12));for(let n=0;n<=count;n++){const x=a.x+(b.x-a.x)*n/count,z=a.z+(b.z-a.z)*n/count;if(!isWalkable(x,z))return false;}return true;}
  function route(destination){
    const start=hero.position.clone();start.y=0;const end=destination.clone();end.y=0;if(!isWalkable(end.x,end.z))return [];
    if(segment(start,end))return [end];
    const bounds=room.walkBounds,step=room.navigationStep||.45,w=Math.floor((bounds.maxX-bounds.minX)/step)+1,h=Math.floor((bounds.maxZ-bounds.minZ)/step)+1;
    const point=i=>new THREE.Vector3(bounds.minX+(i%w)*step,0,bounds.minZ+Math.floor(i/w)*step);
    const free=i=>i>=0&&i<w*h&&isWalkable(point(i).x,point(i).z);
    const nearest=p=>{let best=-1,d=Infinity;for(let i=0;i<w*h;i++){if(!free(i))continue;const q=point(i),distance=q.distanceToSquared(p);if(distance<d&&segment(p,q)){d=distance;best=i;}}return best;};
    const first=nearest(start),last=nearest(end);if(first<0||last<0)return [];
    const open=new Set([first]),from=new Map(),g=new Map([[first,0]]),f=new Map([[first,point(first).distanceTo(end)]]);let found=false;
    while(open.size){let current=-1,best=Infinity;for(const id of open)if((f.get(id)??Infinity)<best){best=f.get(id);current=id;}if(current===last){found=true;break;}open.delete(current);const x=current%w,z=Math.floor(current/w);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,nz=z+dz;if(nx<0||nx>=w||nz<0||nz>=h)continue;const next=nz*w+nx;if(!free(next)||!segment(point(current),point(next)))continue;const cost=g.get(current)+step*Math.hypot(dx,dz);if(cost<(g.get(next)??Infinity)){from.set(next,current);g.set(next,cost);f.set(next,cost+point(next).distanceTo(end));open.add(next);}}
    }
    if(!found)return [];const ids=[last];while(ids[0]!==first)ids.unshift(from.get(ids[0]));const result=ids.map(point);result.push(end);const simplified=[];let anchor=start,index=0;while(index<result.length){let furthest=index;for(let m=index;m<result.length;m++){if(segment(anchor,result[m]))furthest=m;else break;}simplified.push(result[furthest]);anchor=result[furthest];index=furthest+1;}return simplified;
  }
  function stand(){if(!seated||sitting)return;standingSeat=seated;seated=null;standing=true;const token=++seatActionEpoch;standHandle=characters.playActorAction?.(hero,'stand',{onFinish:()=>{if(!disposed&&entered&&token===seatActionEpoch){standing=false;standHandle=null;syncUI();}}});if(!standHandle?.supported){standing=false;standHandle=null;}syncUI();}
  function walkTo(point,next=null){stand();path=route(point);pending=path.length?next:null;if(!path.length&&next)notify('가까운 바닥을 눌러 조금 더 가까이 가세요.');}
  function approachActor(id,radius=1.12){
    const actor=actors.get(id),slot=slots.get(id);if(!actor)return null;const candidates=[];
    if(slot?.seated){for(const distance of [1.72,1.98,2.18])for(const offset of [0,-.35,.35,-.55,.55]){const angle=slot.homeYaw+offset,p=new THREE.Vector3(actor.position.x+Math.sin(angle)*distance,0,actor.position.z+Math.cos(angle)*distance);if(isWalkable(p.x,p.z))candidates.push(p);}}
    else for(let n=0;n<16;n++){const angle=n*Math.PI/8,p=new THREE.Vector3(actor.position.x+Math.sin(angle)*radius,0,actor.position.z+Math.cos(angle)*radius);if(isWalkable(p.x,p.z))candidates.push(p);}
    // Crowded back rows must not share a talk target with an empty chair.
    const emptyApproaches=room.seats.filter(s=>![...slots.values()].some(slot=>slot.seatId===s.id)).map(s=>s.approach);
    const separate=candidates.filter(p=>emptyApproaches.every(a=>p.distanceTo(a)>.48));
    if(separate.length)candidates.splice(0,candidates.length,...separate);
    candidates.sort((a,b)=>a.distanceToSquared(hero.position)-b.distanceToSquared(hero.position));return candidates.find(p=>route(p).length)||null;
  }
  function center(id){const seat=room.seats.find(s=>s.id===id);if(seat)return new THREE.Box3().setFromObject(seat.object).getCenter(new THREE.Vector3());const actor=actors.get(id);if(actor)return headBox(actor).getCenter(new THREE.Vector3());const prop=activityProps?.pickables.find(p=>p.userData.activityId===id);const item=room.objectsById.get(id)||prop;item.updateWorldMatrix(true,true);return item.userData.interactionCenter?item.localToWorld(item.userData.interactionCenter.clone()):new THREE.Box3().setFromObject(item).getCenter(new THREE.Vector3());}
  function nearObject(id){const c=center(id);return Math.hypot(hero.position.x-c.x,hero.position.z-c.z)<2.25;}
  function nearActor(id){const actor=actors.get(id),slot=slots.get(id);if(!actor)return false;const dx=hero.position.x-actor.position.x,dz=hero.position.z-actor.position.z,distance=Math.hypot(dx,dz);if(!slot?.seated)return distance<1.6;return distance<2.35&&distance>.01&&(dx*Math.sin(slot.homeYaw)+dz*Math.cos(slot.homeYaw))/distance>.75;}
  function isFloorMarker(node){while(node){if(node.name.startsWith('classroom-objective'))return true;node=node.parent;}return false;}
  function visible(node){while(node){if(!node.visible)return false;node=node.parent;}return true;}
  function belongsTo(node,parent){while(node){if(node===parent)return true;node=node.parent;}return false;}
  function lineOfSight(id){const item=room.objectsById.get(id),target=center(id),origin=hero.position.clone().add(new THREE.Vector3(0,seated?1.2:1.45,0)),delta=target.clone().sub(origin);occlusionRay.set(origin,delta.clone().normalize());const hit=occlusionRay.intersectObjects(room.cameraObstacles.filter(node=>visible(node)&&!belongsTo(node,item)),false).find(h=>h.distance<delta.length()-.07);return !hit;}
  function selectObject(id){
    if(!interactive()||!OBJECT_WORDS[id]||!nearObject(id)||!lineOfSight(id))return;
    if(sessionFocused){const task=getSessionTask(sessions);if(task?.type!=='object'){notify('지금 미션의 친구나 동작을 살펴보세요.');return;}clearInput();const correct=recordSessionAnswer(task,id);sessionFeedback=correct?'맞아요! '+OBJECT_SENTENCES[id]:OBJECT_WORDS[id]+' · '+getWordGuide(id).meaning+' 문장을 읽고 다시 골라요.';reveal={id};$('classroom-feedback').textContent=sessionFeedback;if(propOwners.get(id)==='world')reactions.set(id,time);syncUI();return;}
    if(boardGuide)clearInput();boardGuide=null;
    const result=update({type:'SELECT_OBJECT',item:id});
    guideFocus=null;if(result.wasReview&&!result.reviewCorrect&&getStoryPhase(story)==='lesson')hint=getLessonHint(state,2);
    showReveal(id,result);if(propOwners.get(id)==='world')reactions.set(id,time);else if(id==='book'&&room.objectsById.get(id).userData.coverGroup)room.objectsById.get(id).userData.coverGroup.rotation.z=1.15;
    if(id==='bag'&&getStoryPhase(story)==='check-bag'&&updateStory({type:'CHECK_BAG'}).changed)$('classroom-feedback').textContent=getStoryMission(story,getCampusContext()).prompt;
    if(result.advanced)characters.playActorAction?.(hero,'nod',{});
  }
  function clickObject(id){if(!boardProtected&&boardGuide&&(id==='board-eraser'&&['take-eraser','put-eraser'].includes(boardRequest.phase)||id==='board'&&boardRequest.phase==='erase-board')){goBoard();return;}if(nearObject(id)&&lineOfSight(id)){selectObject(id);return;}const owner=propOwners.get(id);const target=owner!=='world'?approachActor(owner):room.targets[id];if(target)walkTo(target,{type:'object',id});else notify('조금 더 가까이 가세요.');}
  function openDialogue(id){
    if(!interactive()||!nearActor(id))return;clearInput();resetTalkAnimation();reveal=null;
    const task=sessionFocused?getSessionTask(sessions):null;if(task?.type==='help'&&task.actor===id){const n=getSessionRun(sessions).seed%3,choices=[...task.choices.slice(n),...task.choices.slice(0,n)];showDialogue({text:task.text,choices:choices.map(([key,label])=>({id:'session-help-'+key,label})),sessionKey:task.key,sessionRun:task.runId},id);return;}
    if(task?.type==='review'&&task.actor===id){startSessionWatch(task);return;}
    if(task){showDialogue({text:'지금 놀이 수업의 문장과 친구를 먼저 살펴보세요. 다른 이야기는 물건 수업으로 돌아가서 이어 할 수 있어요.',choices:[{id:'continue',label:'네, 미션을 계속할게요.'}]},id);return;}
    if(id==='teacher')refreshBoardProgress();
    const activity=getActivityDialogue(id);if(activity)learnActivity(activity.activity);
    const content=id==='teacher'&&!boardProtected?getTeacherBoardDialogue(boardRequest):activity||(getStoryPhase(story)==='lesson'?getLessonDialogue(state,id):getStoryDialogue(story,id,getProgress(state),getCampusContext()));
    showDialogue(content,id);
  }
  function showDialogue(content,id){dialogueRig=null;guideFocus=null;dialogue={id,choices:content.choices,turns:content.turns||null,index:0,text:content.text,defaultSpeaker:content.speaker||id,defaultListener:content.listener||'hero',activity:content.activity||null,sessionKey:content.sessionKey||null,sessionRun:content.sessionRun||null};renderDialogueTurn();}
  function renderDialogueTurn(){
    resetTalkAnimation();const current=dialogue.turns?.[dialogue.index];
    dialogue.speaker=current?.speaker||dialogue.defaultSpeaker;dialogue.listener=current?.listener||dialogue.defaultListener;
    if(current&&current.speaker!=='hero')dialogue.id=current.speaker;
    $('classroom-speaker').textContent=actorName(dialogue.speaker);$('classroom-text').textContent=current?.text||dialogue.text;
    $('classroom-dialogue-turn').textContent=current?`함께하는 대화 ${dialogue.index+1} / ${dialogue.turns.length} · ${actorName(current.speaker)} → ${actorName(current.listener)}`:'';
    const last=!current||dialogue.index===dialogue.turns.length-1;renderChoices(last?dialogue.choices:[{id:'next',label:dialogue.turns[dialogue.index+1].speaker==='hero'?'나도 대답하기':'다음 대화 보기'}]);
    $('classroom-dialogue-feedback').textContent='';
    if(current&&current.speaker!=='jiun')characters.playActorAction?.(actors.get(current.speaker),current.speaker==='teacher'?'point':'nod',{});
    syncUI();
  }
  function renderChoices(choices){$('classroom-choices').replaceChildren();for(const choice of choices){const b=document.createElement('button');b.type='button';b.dataset.classroomChoice=choice.id;b.textContent=choice.label;$('classroom-choices').append(b);}}
  function closeDialogue(){dialogue=null;dialogueRig=null;resetTalkAnimation();$('classroom-dialogue-feedback').textContent='';syncUI();canvas.focus({preventScroll:true});}
  function choose(id){
    if(!active()||!dialogue||storyAction)return;
    if(id==='next'&&dialogue.turns&&dialogue.index<dialogue.turns.length-1){dialogue.index++;renderDialogueTurn();return;}
    if(dialogue.turns&&dialogue.index<dialogue.turns.length-1)return;
    const choice=dialogue.choices.find(c=>c.id===id);if(!choice)return;
    if(id.startsWith('session-help-')){const oldDialogue=dialogue;refreshSessions();const task=getSessionTask(sessions);if(task?.key!==oldDialogue.sessionKey||task.runId!==oldDialogue.sessionRun){closeDialogue();return;}const answer=id.slice('session-help-'.length);if(answer!=='help'){recordSessionAnswer(task,answer);$('classroom-dialogue-feedback').textContent=task.explanation+' 다시 골라 보세요.';return;}closeDialogue();sessionFeedback='고마워요! '+task.explanation;characters.playActorAction(actors.get(task.actor),'nod',{});recordSessionAnswer(task,answer);return;}
    if(id==='board-accept'){cancelSessionMotion();sessionFocused=false;closeDialogue();refreshBoardProgress();if(!boardProtected&&boardRequest.phase==='offered'){boardGuide='take';if(updateBoard('ACCEPT'))learnActivity('request');}syncUI();return;}
    if(id==='board-go'){closeDialogue();goBoard();return;}
    if(id==='board-word'){closeDialogue();learnActivity('erase');showActivityWord('erase');return;}
    if(id==='board-lesson'){boardGuide=null;showDialogue(getStoryPhase(story)==='lesson'?getLessonDialogue(state,'teacher'):getStoryDialogue(story,'teacher',getProgress(state),getCampusContext()),'teacher');return;}
    if(id==='activity-word'){const activity=dialogue.activity;closeDialogue();if(activity)showActivityWord(activity);return;}
    if(id==='lesson-help'){boardGuide=null;const partner=dialogue.id;showDialogue(getLessonDialogue(state,partner),partner);return;}
    if(id==='friends'){showDialogue(getClassroomConversation(getStoryPhase(story),getCampusContext()),dialogue.id);return;}
    if(id==='hint'){closeDialogue();showHint(2);return;}
    if(id==='wrong'){$('classroom-dialogue-feedback').textContent='지금 상황에 맞는 말을 다시 골라 보세요.';return;}
    const partner=dialogue.id;closeDialogue();
    if(['BORROW_PENCIL','RETURN_PENCIL'].includes(choice.type)){performStoryAction(choice.type);return;}
    characters.playActorAction?.(actors.get(partner),choice.type==='GREET_SUA'?'wave':'nod',{});if(choice.type)updateStory({type:choice.type});
  }
  function finishSit(seat){
    hero.position.set(seat.position.x,0,seat.position.z);hero.rotation.y=seat.yaw;seated=seat.id;seatAlign=null;standingSeat=null;
    // Arrival starts Sit. The chair discovery is saved only when its native clip ends.
    // Pause freezes the controller's ticks; it does not cancel this action.
    sitting=true;const token=++seatActionEpoch;
    const finish=()=>{if(!active()||!sitting||token!==seatActionEpoch||seated!==seat.id)return;sitting=false;sitHandle=null;if(sessionFocused){syncUI();return;}const result=update({type:'SELECT_OBJECT',item:'chair'});showReveal('chair',result);};
    sitHandle=characters.playActorAction?.(hero,'sit',{onFinish:finish});
    if(!sitHandle?.supported)finish();else syncUI();
  }
  function sitAt(seatId){
    if(!interactive())return;const seat=room.seats.find(s=>s.id===seatId),occupied=[...slots.values()].some(s=>s.seatId===seatId);if(!seat)return;
    if(hero.position.distanceTo(seat.approach)>1.35){walkTo(seat.approach,{type:'seat',id:seatId});return;}
    if(occupied){if(!sessionFocused)showReveal('chair',update({type:'SELECT_OBJECT',item:'chair'}));notify('친구가 앉아 있는 자리예요. 빈자리를 찾아보세요.');return;}
    resetTalkAnimation();clearInput();standingSeat=seat.id;const target=seat.position.clone();target.y=0;
    if(!segment(hero.position,target)){standingSeat=null;notify('빈자리 옆으로 조금 더 가까이 가세요.');return;}
    seatAlign={id:seat.id,target};syncUI();
  }
  function identify(node){for(let n=node;n&&n!==scene;n=n.parent){if(n.userData.activityId)return{type:'activity',id:n.userData.activityId};if(n.userData.seatId)return{type:'seat',id:n.userData.seatId};if(n.userData.discoveryId)return{type:'object',id:n.userData.discoveryId};if(n.userData.interactableKey&&actors.has(n.userData.interactableKey))return{type:'actor',id:n.userData.interactableKey};}return null;}
  function clickWorld(event){
    if(!interactive())return;const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    const hits=ray.intersectObjects([room.root,...actors.values(),...(activityProps?.pickables||[])],true).filter(h=>visible(h.object)&&!isFloorMarker(h.object)&&!belongsTo(h.object,hero));
    const first=hits[0],hit=first&&identify(first.object);let selected=hit;
    // Tiny objects get only bounded, close-range padding around their real AABB.
    if(!selected||selected.type==='actor'||selected.type==='object'&&!room.objectsById.get(selected.id)?.userData.pickPadding){let nearest=Infinity;for(const item of room.selectableObjects){const id=item.userData.discoveryId,padding=item.userData.pickPadding?Math.min(.12,item.userData.pickPadding*3):0;if(!padding||!visible(item)||!nearObject(id)||!lineOfSight(id))continue;item.updateWorldMatrix(true,true);const bounds=item.userData.visualBounds?item.userData.visualBounds.clone().applyMatrix4(item.matrixWorld):new THREE.Box3().setFromObject(item);bounds.expandByScalar(padding);const point=ray.ray.intersectBox(bounds,new THREE.Vector3());if(!point)continue;const distance=point.distanceTo(ray.ray.origin),c=center(id).project(camera),px=rect.left+(c.x+1)*rect.width/2,py=rect.top+(1-c.y)*rect.height/2,pixels=Math.hypot(event.clientX-px,event.clientY-py);if(pixels>(rect.width<=700?36:30)||first&&first.distance<distance-.14)continue;if(pixels<nearest){nearest=pixels;selected={type:'object',id};}}}
    if(selected?.type==='object'){clickObject(selected.id);return;}
    if(selected?.type==='seat'){sitAt(selected.id);return;}
    if(selected?.type==='actor'){if(nearActor(selected.id))openDialogue(selected.id);else{const goal=approachActor(selected.id);if(goal)walkTo(goal,{type:'actor',id:selected.id});}return;}
    if(selected?.type==='activity'){const id=selected.id==='broom'?'jiun':'yuna';if(sessionFocused&&getSessionTask(sessions)?.type==='review'){const task=getSessionTask(sessions);if(task.actor===id){if(nearActor(id))startSessionWatch(task);else walkTo(room.targets[id],{type:'session-watch',key:task.key,actor:id});}else notify('미션에 나온 친구의 동작을 살펴보세요.');return;}if(nearActor(id)){learnActivity(selected.id);showActivityWord(selected.id);}else{const goal=approachActor(id);if(goal)walkTo(goal,{type:'actor',id});}return;}
    const ground=ray.intersectObjects(room.grounds,false)[0];if(ground&&(!first||first.object===ground.object||first.distance>=ground.distance-.05)&&isWalkable(ground.point.x,ground.point.z))walkTo(ground.point);
  }
  function look(dx,dy){if(!interactive())return;guideFocus=null;yaw=Math.atan2(Math.sin(yaw+dx),Math.cos(yaw+dx));pitch=THREE.MathUtils.clamp(pitch+dy,-.95,.95);path=[];pending=null;}
  function guideTarget(){if(getStoryPhase(story)==='use-pencil')return writingSeat()?.id||'student-seat';const mission=getCurrentMission(state);return getStoryPhase(story)==='lesson'&&mission&&(getPhase(state)==='learn'||hint?.showLocation)?mission.target:null;}
  function lookAtObject(id){guideFocus=id;const delta=center(id).sub(hero.position.clone().add(new THREE.Vector3(0,seated?1.24:1.58,0)));yaw=Math.atan2(-delta.x,-delta.z);pitch=THREE.MathUtils.clamp(Math.atan2(delta.y,Math.hypot(delta.x,delta.z)),-.95,.95);}
  function guideObject(walk){if(!interactive())return;const id=guideTarget();if(!id)return;reveal=null;const seat=room.seats.find(s=>s.id===id);if(walk){if(seat){if(seated!==id)walkTo(seat.approach,{type:'seat',id});}else walkTo(room.targets[id]);}lookAtObject(id);syncUI();}
  function resetCamera(){if(!interactive())return;guideFocus=null;yaw=Math.atan2(Math.sin(hero.rotation.y-Math.PI),Math.cos(hero.rotation.y-Math.PI));pitch=-.08;dialogueRig=null;canvas.focus({preventScroll:true});}
  function safeCamera(origin,desired,reportClip=true){const point=cameraCollision.resolve(origin,desired);if(reportClip&&point.distanceToSquared(desired)>.0025)clipped=true;return point;}
  function dialoguePair(){const talker=actors.get(dialogue?.speaker)||actors.get(dialogue?.id),listener=actors.get(dialogue?.listener)||hero;return talker===hero?[hero,listener]:[listener,talker];}
  function headBox(actor){const group=actor.userData.humanFace?.group||actor.userData.rig?.head;group?.updateWorldMatrix(true,true);return (group?new THREE.Box3().setFromObject(group):new THREE.Box3().setFromCenterAndSize(actor.position.clone().add(new THREE.Vector3(0,1.35,0)),new THREE.Vector3(.45,.55,.4))).expandByScalar(.025);}
  function dialogueFrame(portrait){
    // Canonical order prevents a reverse shot just because speaker/listener swap.
    const ids=portrait?[dialogue.speaker==='hero'?dialogue.listener:dialogue.speaker]:[dialogue.speaker,dialogue.listener].sort();
    const key=ids.join(':'),heads=ids.map(id=>headBox(actors.get(id))),bounds=heads.reduce((box,head)=>box.union(head),new THREE.Box3()),focus=bounds.getCenter(new THREE.Vector3());
    const rect=canvas.getBoundingClientRect(),card=$('classroom-dialogue').getBoundingClientRect();
    const frame={left:-.86,right:.86,top:.9,bottom:1-2*Math.min(rect.height-14,Math.max(rect.height*.25,card.top-rect.top-18))/rect.height};
    const distance=portrait?2.6:4.2;
    if(!dialogueRig||dialogueRig.key!==key){
      const preferred=camera.position.clone().sub(focus);preferred.y=0;if(preferred.lengthSq()<.001)preferred.set(0,0,1);preferred.normalize();
      let best=-Infinity,direction=preferred;
      const probe=camera.clone();
      for(let n=0;n<16;n++){
        const angle=n*Math.PI/8,d=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)),point=safeCamera(focus,focus.clone().addScaledVector(d,distance).add(new THREE.Vector3(0,.28,0)),false);
        if(!cameraCollision.isClear(point))continue;
        probe.aspect=camera.aspect;probe.position.copy(point);
        const fitted=fitDialogueCamera({THREE,camera:probe,boxes:heads,focus,frame,minFov:portrait?50:43});
        const seen=heads.filter(box=>safeCamera(box.getCenter(new THREE.Vector3()),point,false).distanceTo(point)<.25).length;
        const closest=Math.min(...heads.map(box=>point.distanceTo(box.getCenter(new THREE.Vector3()))));
        const score=(fitted.fits?8:0)+seen*5+Math.min(3,point.distanceTo(focus))+d.dot(preferred)*1.2-(closest<.7?12:0);
        if(score>best){best=score;direction=d;}
      }
      dialogueRig={key,direction};
    }
    const desired=safeCamera(focus,focus.clone().addScaledVector(dialogueRig.direction,distance).add(new THREE.Vector3(0,.28,0)),false);
    return {focus,heads,frame,desired};
  }
  function updateCamera(dt){
    const first=getViewMode()==='first-person'&&!dialogue&&!storyAction&&!sessionAction&&!sessionPractice,portrait=camera.aspect<.85;
    const reticle=document.getElementById('reticle');if(reticle)reticle.hidden=!first||blocked();document.getElementById('look-controls').hidden=!interactive();
    const toggle=document.getElementById('view-toggle');toggle.textContent=getViewMode()==='first-person'?'1인칭':'어깨 시점';toggle.setAttribute('aria-pressed',String(getViewMode()==='first-person'));
    $('classroom-panel').hidden=Boolean(dialogue)&&portrait;$('classroom-word-panel').hidden=!reveal;$('classroom-camera-reset').disabled=!interactive();$('classroom-camera-reset').hidden=!interactive()||Boolean(reveal);
    clipped=false;const origin=hero.position.clone().add(new THREE.Vector3(0,seated?1.2:1.45,0));let focus;
    if(dialogue){
      const shot=dialogueFrame(portrait);focus=shot.focus;
      camera.position.copy(safeCamera(focus,camera.position.clone().lerp(shot.desired,1-Math.exp(-Math.min(.05,dt)*7))));
      fitDialogueCamera({THREE,camera,boxes:shot.heads,focus,frame:shot.frame,minFov:portrait?50:43});
    }else if(first){
      camera.position.copy(safeCamera(origin,hero.position.clone().add(new THREE.Vector3(0,seated?1.24:1.58,0))));
      focus=guideFocus?center(guideFocus):camera.position.clone().add(new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch)*8,Math.sin(pitch)*8,-Math.cos(yaw)*Math.cos(pitch)*8));camera.fov=60;camera.updateProjectionMatrix();camera.lookAt(focus);
    }else{
      const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
      focus=guideFocus?center(guideFocus):origin.clone().addScaledVector(forward,2.3);if(!guideFocus)focus.y+=pitch*2.1;
      const desired=origin.clone().addScaledVector(forward,seated?-2.6:-3.2).addScaledVector(right,.3);desired.y+=1.05-pitch*.7;
      camera.position.copy(safeCamera(origin,camera.position.clone().lerp(desired,1-Math.exp(-dt*8))));camera.fov=52;camera.updateProjectionMatrix();camera.lookAt(focus);
    }
    // A wall can bring a shoulder camera close to the avatar: keep its face
    // from filling the whole view, without moving the player through scenery.
    hero.visible=!first&&(Boolean(dialogue||sessionAction||sessionPractice)||camera.position.distanceTo(origin)>.82);
  }
  function animateCast(dt,speed){
    const talker=dialogue?.speaker||dialogue?.id,listener=dialogue?.listener||'hero',partner=storyAction?.partner;
    for(const [id,actor] of actors){const slot=slots.get(id),inDialogue=dialogue&&(id===talker||id===listener),inAction=partner&&(partner===id||id==='hero'),interrupted=inDialogue||inAction,observingSleep=slot?.activity==='sleep'&&inDialogue&&dialogue.activity==='sleep'&&!inAction,continuingSweep=slot?.activity==='sweep'&&!inAction,target=observingSleep?null:inDialogue?actors.get(id===talker?listener:talker):inAction?(id==='hero'?actors.get(partner):hero):id!=='hero'&&!['sleep','makeup'].includes(slot?.activity)&&actor.position.distanceTo(hero.position)<3?hero:null;
      if(continuingSweep)actor.rotation.y=slot.homeYaw;
      else if(target){const worldYaw=Math.atan2(target.position.x-actor.position.x,target.position.z-actor.position.z);if(!slot?.seated)actor.rotation.y+=Math.atan2(Math.sin(worldYaw-actor.rotation.y),Math.cos(worldYaw-actor.rotation.y))*(1-Math.exp(-dt*6));}
      else if(id!=='hero')actor.rotation.y+=Math.atan2(Math.sin(slot.homeYaw-actor.rotation.y),Math.cos(slot.homeYaw-actor.rotation.y))*(1-Math.exp(-dt*4));
      const headYaw=target?THREE.MathUtils.clamp(Math.atan2(Math.sin(Math.atan2(target.position.x-actor.position.x,target.position.z-actor.position.z)-actor.rotation.y),Math.cos(Math.atan2(target.position.x-actor.position.x,target.position.z-actor.position.z)-actor.rotation.y)),-.5,.5):0;
      if(slot?.seated)actor.rotation.y=slot.homeYaw;
      const activity=id==='hero'?(sleeping?'sleep':seated?'sit':standing?'stand':'idle'):observingSleep||continuingSweep?slot.activity:interrupted?(slot?.seated?'sit':'idle'):slot.activity;
      actor.userData.behavior={activity,gesture:'idle',expression:observingSleep?'neutral':interrupted?'friendly':target?'curious':'neutral',headYaw,headPitch:0,torsoYaw:slot?.seated&&interrupted?THREE.MathUtils.clamp(headYaw,-.20,.20):0,speaking:speaker===id};
      characters.animateActor(actor,{time,dt,moving:id==='hero'&&speed>.01,speed:id==='hero'?speed:0,seated:id==='hero'?Boolean(seated):slot?.seated===true,seatHeight:id==='hero'&&seated?room.seats.find(s=>s.id===seated)?.position.y:slot?.seatHeight,...actor.userData.behavior});
      // Legacy assets can sit for preview, but this is not called a native clip.
      if(!actor.userData.humanBody&&(id==='hero'?seated:slot?.seated)){const rig=actor.userData.rig;if(rig?.legs){rig.body.position.y=id==='hero'?.52:slot.seatHeight;for(let n=0;n<2;n++){rig.legs[n].rotation.x=-1.45;rig.shins[n].rotation.x=1.45;rig.feet[n].rotation.x=0;}}}
    }
    activityProps?.update(time);
  }
  function nearestInteraction(){
    if(!room)return null;const boardType=getBoardMission(boardRequest).action;
    if(!boardProtected&&boardGuide&&!seated&&['take','erase','put'].includes(boardType)&&hero.position.distanceTo(boardTarget(boardType))<.25)return{type:'board',id:boardType};
    if(!sessionFocused&&getStoryPhase(story)==='use-pencil'&&writingSeat()&&propOwners.get('board-eraser')!=='hero')return{type:'write',id:seated};
    const seat=!seated?room.seats.filter(s=>![...slots.values()].some(slot=>slot.seatId===s.id)).sort((a,b)=>hero.position.distanceTo(a.approach)-hero.position.distanceTo(b.approach))[0]:null;
    const seatDistance=seat?hero.position.distanceTo(seat.approach):Infinity;
    let best=null,d=Infinity,approachDistance=Infinity;
    for(const [id,a]of actors)if(id!=='hero'&&nearActor(id)){const distance=a.position.distanceTo(hero.position);if(distance<d){d=distance;best={type:'actor',id};approachDistance=room.targets[id]?.distanceTo(hero.position)??Infinity;}}
    if(best&&approachDistance<.35&&seatDistance>.18)return best;
    if(seatDistance<1.05)return{type:'seat',id:seat.id};return best;
  }
  function interact(){if(!interactive())return;const hit=nearestInteraction();if(hit?.type==='board')startBoardAction(hit.id);else if(hit?.type==='write')performStoryAction('USE_PENCIL');else if(hit?.type==='seat')sitAt(hit.id);else if(hit?.type==='actor')openDialogue(hit.id);}
  function collection(show){clearInput();resetTalkAnimation();$('classroom-collection').hidden=!show;if(show){$('classroom-collection-items').replaceChildren();for(const id of state.discovered){const row=document.createElement('div'),text=document.createElement('p');text.textContent=OBJECT_WORDS[id]+' · '+getWordGuide(id).meaning+' '+OBJECT_SENTENCES[id];row.append(text);$('classroom-collection-items').append(row);}if(!state.discovered.length&&!activityWords.length)$('classroom-collection-items').textContent='직접 고른 물건과 친구에게 배운 낱말이 여기에 모여요.';for(const id of activityWords){const row=document.createElement('div'),text=document.createElement('p'),word=ACTIVITY_WORDS[id];text.textContent='추가 낱말 · '+word.word+' · '+word.meaning+' '+word.sentence;row.append(text);$('classroom-collection-items').append(row);}for(const reward of getSessionRewards(sessions)){const row=document.createElement('div'),text=document.createElement('p');text.textContent=reward.symbol+' '+reward.label;row.append(text);$('classroom-collection-items').append(row);}}syncUI();}

  function exit(){sleeping=false;loadEpoch++;loadAbort?.abort();loadAbort=null;paused=false;cancelSessionMotion();cancelBoardAction();cancelStoryAction();seatActionEpoch++;sitHandle?.cancel?.();sitHandle=null;sitting=false;standHandle?.cancel?.();standHandle=null;standing=false;standingSeat=null;seatAlign=null;if(!entered&&!scene)return;clearInput();resetTalkAnimation();entered=false;seated=null;clearScene();mount.hidden=true;for(const node of [document.querySelector('.movement-pad'),document.getElementById('look-controls')])if(node)node.style.visibility='';}
  function uiExit(){if(!active())return;exit();onExit();}
  async function enter(){
    if(disposed||entered||loadAbort)return entered&&!disposed;
    if(!canEnter())return false;
    learnActivity(null);refreshBoardProgress();refreshSessions();sessionFocused=Boolean(getSessionTask(sessions));if(!boardProtected&&['take-eraser','erase-board','put-eraser'].includes(boardRequest.phase)){boardGuide=getBoardMission(boardRequest).action;sessionFocused=false;}
    paused=false;const token=++loadEpoch;loadAbort=new AbortController();
    try{
      if(!await setup(token)||disposed||token!==loadEpoch)return false;
      if(!canEnter()){clearScene();return false;}
      entered=true;mount.hidden=false;dialogue=null;reveal=null;hint=null;guideFocus=null;dialogueRig=null;seated=null;sitting=false;standing=false;standingSeat=null;completionShown=false;seatAlign=null;sleeping=false;
      $('classroom-help').hidden=true;$('classroom-collection').hidden=true;$('classroom-completion').hidden=true;$('classroom-session-result').hidden=true;
      // Campus greeting is already earned; resume the friendship at preparation.
      if(getCampusContext().metSua&&getStoryPhase(story)==='greet-sua')updateStory({type:'GREET_SUA'});
      update({type:'START'});
      if(getStoryPhase(story)==='lesson'&&getProgress(state).completed===30)updateStory({type:'LESSON_DONE',reviewed:30});
      if(getStoryPhase(story)==='complete'&&!sessionFocused){$('classroom-completion').hidden=false;completionShown=true;}
      syncUI();updateCamera(1);renderer.render(scene,camera);canvas.focus({preventScroll:true});return true;
    }catch(error){if(token===loadEpoch){entered=false;clearScene();if(error.name!=='AbortError')throw error;}return false;}
    finally{if(token===loadEpoch)loadAbort=null;}
  }
  function tick({time:now,dt}){
    if(!active()||!room)return;time=Number.isFinite(now)?now:time+dt;dt=Math.min(.05,Math.max(0,dt||0));const before=hero.position.clone();moving=false;
    if(seatAlign){const seat=room.seats.find(s=>s.id===seatAlign.id),delta=seatAlign.target.clone().sub(hero.position);delta.y=0;if(delta.length()<.04)finishSit(seat);else{const amount=Math.min(delta.length(),1.45*dt);delta.normalize();hero.position.addScaledVector(delta,amount);const angle=Math.atan2(delta.x,delta.z);hero.rotation.y+=Math.atan2(Math.sin(angle-hero.rotation.y),Math.cos(angle-hero.rotation.y))*Math.min(1,dt*10);}}
    if(interactive()){
      const dirs=new Set([...keys,...held.values()]);let dx=(dirs.has('right')?1:0)-(dirs.has('left')?1:0),dz=(dirs.has('down')?1:0)-(dirs.has('up')?1:0);
      if(dx||dz){guideFocus=null;const wasSeated=Boolean(seated);stand();path=[];pending=null;if(!wasSeated){const len=Math.hypot(dx,dz),x=(dx*Math.cos(yaw)+dz*Math.sin(yaw))/len,z=(-dx*Math.sin(yaw)+dz*Math.cos(yaw))/len;dx=x;dz=z;moving=true;}else{dx=0;dz=0;}}
      else if(path.length){const delta=path[0].clone().sub(hero.position);delta.y=0;const reach=['board','session-board'].includes(pending?.type)&&path.length===1?.02:.07;if(delta.length()<reach)path.shift();else{delta.normalize();dx=delta.x;dz=delta.z;moving=true;}}
      if(moving){const distance=['board','session-board'].includes(pending?.type)&&path.length===1?Math.min(2.45*dt,hero.position.distanceTo(path[0])):2.45*dt;if(isWalkable(hero.position.x+dx*distance,hero.position.z))hero.position.x+=dx*distance;if(isWalkable(hero.position.x,hero.position.z+dz*distance))hero.position.z+=dz*distance;const heading=Math.atan2(dx,dz);hero.rotation.y+=Math.atan2(Math.sin(heading-hero.rotation.y),Math.cos(heading-hero.rotation.y))*Math.min(1,dt*13);}
      if(pending){const request=pending;if(request.type==='object'&&nearObject(request.id)&&lineOfSight(request.id)){pending=null;path=[];selectObject(request.id);}else if(request.type==='actor'&&nearActor(request.id)){pending=null;path=[];openDialogue(request.id);}else if(request.type==='board'&&hero.position.distanceTo(boardTarget(request.action))<.025){pending=null;path=[];startBoardAction(request.action);}else if(request.type==='session-watch'&&nearActor(request.actor)){pending=null;path=[];const task=getSessionTask(sessions);if(task?.key===request.key)startSessionWatch(task);}else if(request.type==='session-board'&&hero.position.distanceTo(boardTarget(request.action))<.025){pending=null;path=[];if(sessionPractice?.key===request.key)startPracticeClip(request.action);}else if(request.type==='seat'&&hero.position.distanceTo(room.seats.find(s=>s.id===request.id).approach)<.12){pending=null;path=[];sitAt(request.id);}else if(!path.length)pending=null;}
    }
    if(standingSeat){const seat=room.seats.find(s=>s.id===standingSeat);if(seat&&Math.hypot(hero.position.x-seat.position.x,hero.position.z-seat.position.z)>.85)standingSeat=null;}animateCast(dt,dt?hero.position.distanceTo(before)/dt:0);
    for(const [id,start] of reactions){room.reactObject(id,{time:time-start,active:time-start<1.4});if(time-start>=1.4)reactions.delete(id);}
    if(boardAction?.type==='erase'){const clip=hero.userData.humanBody?.actions.Erase;if(clip)boardVisuals.setProgress(THREE.MathUtils.clamp((clip.time-.45)/(clip.getClip().duration-.45),0,1));}
    if(sessionAction?.type==='erase'){const clip=hero.userData.humanBody?.actions.Erase;if(clip)boardVisuals.setProgress(THREE.MathUtils.clamp((clip.time-.45)/(clip.getClip().duration-.45),0,1));}
    if(sessionWatch&&!blocked()){
      const task=getSessionTask(sessions);if(!sessionFocused||task?.key!==sessionWatch.key||!nearActor(sessionWatch.actor)){sessionWatch=null;sessionReady=null;syncUI();}
      else{sessionWatch.elapsed+=dt;if(sessionWatch.elapsed>=1.4){sessionReady=task.key;sessionWatch=null;learnActivity(task.wordId);syncUI();}}
    }
    const sessionTask=getSessionTask(sessions);if(sessionReady&&sessionTask?.actor&&!nearActor(sessionTask.actor)){sessionReady=null;syncUI();}
    const near=interactive()?nearestInteraction():null;$('classroom-interact').hidden=!near;$('classroom-interact').textContent=near?.type==='board'?getBoardMission(boardRequest).button:near?.type==='write'?'연필로 써 보기':near?.type==='seat'?'빈자리에 앉기':'이야기하기';
    updateCamera(dt);renderer.render(scene,camera);
  }
  function pause(){paused=true;clearInput();resetTalkAnimation();if(seatAlign){seatAlign=null;standingSeat=null;}}
  function resume(){if(!disposed&&entered){paused=false;clearInput();syncUI();}}
  function dispose(){if(disposed)return;exit();clearScene();disposed=true;pause();while(removers.length)removers.pop()();mount.replaceChildren();}
  function info(){return{session:{focused:sessionFocused,...getSessionProgress(sessions),task:getSessionTask(sessions),ready:sessionReady,action:sessionAction?.type||null,watching:sessionWatch?.actor||null,practice:sessionPractice?{...sessionPractice}:null},entered,active:active(),paused,disposed,phase:getPhase(state),player:hero?.position.toArray()||null,seated,sleeping,boardRequest:{...boardRequest},boardAction:boardAction?.type||null,boardVisuals:boardVisuals?.diagnostics()||null,boardTargets:room?{take:boardTarget('take').toArray(),erase:boardTarget('erase').toArray(),put:boardTarget('put').toArray()}:{},activityWords:[...activityWords],activityProps:activityProps?.diagnostics()||{},seating:seatAlign?.id||null,sitting,standing,walkable:hero&&!seated?isWalkable(hero.position.x,hero.position.z):true,viewMode:getViewMode(),cameraYaw:yaw,cameraPitch:pitch,cameraPosition:camera.position.toArray(),cameraClipped:clipped,playerVisible:hero?.visible??false,pathLength:path.length,pathGoal:path.at(-1)?.toArray()||null,dialogueOpen:Boolean(dialogue),dialogueSpeaker:dialogue?.speaker||dialogue?.id||null,speakingActor:speaker,lessonProgress:getProgress(state),inventory:getStoryInventory(story),storyPhase:getStoryPhase(story),storyProgress:story.completed.length,storyRevisited:story.revisited,storyAction:storyAction?.type||null,hint:hint?{...hint}:null,conversationStep:dialogue?.turns?dialogue.index+1:null,conversationTotal:dialogue?.turns?.length||0,dialogueListener:dialogue?.listener||null,seats:room?Object.fromEntries(room.seats.map(s=>[s.id,{position:[s.position.x,.75,s.position.z],approach:s.approach.toArray(),hasDesk:Boolean(s.desk),row:s.row,deskTop:s.deskTop.toArray(),occupied:[...slots.values()].some(slot=>slot.seatId===s.id)}])):{},targets:room?Object.fromEntries(Object.entries(room.targets).map(([k,v])=>[k,v.toArray()])):{},objects:room?Object.fromEntries(room.selectableObjects.map(o=>{const id=o.userData.discoveryId;return[id,{position:center(id).toArray(),visible:visible(o),owner:propOwners.get(id)}];})): {},actors:Object.fromEntries([...actors].map(([id,a])=>[id,{position:a.position.toArray(),activity:a.userData.behavior?.activity,outfit:a.userData.outfit,seatId:slots.get(id)?.seatId||null,seated:id==='hero'?Boolean(seated):slots.get(id)?.seated,gesture:a.userData.behavior?.gesture,speaking:speaker===id,native:Boolean(a.userData.humanBody),socketCount:Object.keys(a.userData.sockets||{}).length,nativeFace:a.userData.humanFace?.diagnostics?.()||a.userData.face?.diagnostics?.()||null,nativeAnimation:a.userData.humanBody?.getInfo?.()||a.userData.humanBody?.diagnostics?.()||null}])),guideFocus,cameraClear:cameraCollision?.isClear(camera.position)??true,cameraDialogueKey:dialogueRig?.key||null,resources:renderer.info.memory};}
  function projectPoint(id){let p;if(Array.isArray(id))p=new THREE.Vector3(...id);else if(room?.objectsById.has(id))p=center(id);else if(id==='student-seat')p=room.seats.find(s=>s.id===id).position.clone();else if(actors.has(id)){const actor=actors.get(id),head=actor.userData.humanFace?.group||actor.userData.rig?.head;head?.updateWorldMatrix(true,true);p=head?new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3()):actor.position.clone().add(new THREE.Vector3(0,1.25,0));}else p=room?.targets[id]?.clone();if(!p)return null;p.project(camera);const r=canvas.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
  listen(mount,'click',e=>{const b=e.target.closest('button');if(!b||!active())return;if(b.dataset.classroomChoice)choose(b.dataset.classroomChoice);else if(b.dataset.classroomSessionChoice)chooseSessionWord(b.dataset.classroomSessionChoice);else if(b.hasAttribute('data-classroom-exit'))uiExit();});
  listen($('classroom-session-go'),'click',goSession);
  listen($('classroom-session-back'),'click',()=>{if(!interactive())return;cancelSessionMotion();sessionFocused=false;guideFocus=null;syncUI();});
  listen($('classroom-session-hint'),'click',showSessionHint);
  listen($('classroom-session-practice'),'click',()=>{if(active())beginSession('mistakes');});listen($('classroom-session-next'),'click',()=>{if(active())beginSession();});
  listen($('classroom-session-result-close'),'click',()=>{if(!active())return;$('classroom-session-result').hidden=true;sessionFocused=false;syncUI();canvas.focus({preventScroll:true});});
  listen($('classroom-story-action'),'click',()=>performStoryAction('USE_PENCIL'));
  listen($('classroom-rest-toggle'),'click',toggleRest);
  listen($('classroom-board-go'),'click',goBoard);
  listen($('classroom-board-back'),'click',()=>{if(!interactive())return;boardGuide=null;clearInput();guideFocus=null;syncUI();});
  listen($('classroom-hint-toggle'),'click',()=>{if(interactive())showHint();});
  listen($('classroom-hint-close'),'click',()=>{if(!active())return;hint=null;syncUI();});
  listen($('classroom-find-go'),'click',()=>guideObject(true));listen($('classroom-find-look'),'click',()=>guideObject(false));listen($('classroom-camera-reset'),'click',resetCamera);
  listen($('classroom-exit'),'click',uiExit);listen($('classroom-interact'),'click',interact);listen($('classroom-close'),'click',closeDialogue);listen($('classroom-word-close'),'click',()=>{if(!active())return;reveal=null;syncUI();});
  listen($('classroom-help-toggle'),'click',()=>{if(!active())return;clearInput();resetTalkAnimation();$('classroom-help').hidden=false;syncUI();});listen($('classroom-help-close'),'click',()=>{if(!active())return;$('classroom-help').hidden=true;syncUI();});listen($('classroom-collection-toggle'),'click',()=>{if(active())collection(true);});listen($('classroom-collection-close'),'click',()=>{if(active())collection(false);});listen($('classroom-continue'),'click',()=>{if(!active())return;$('classroom-completion').hidden=true;syncUI();});
  listen(document.getElementById('view-toggle'),'click',()=>{if(!interactive())return;setViewMode(getViewMode()==='first-person'?'shoulder':'first-person');clearInput();canvas.focus({preventScroll:true});});
  for(const [id,x,y] of [['look-left',.3,0],['look-right',-.3,0],['look-up',0,.12],['look-down',0,-.12]])listen(document.getElementById(id),'click',()=>look(x,y));
  const keyMap={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'};
  listen(window,'keydown',e=>{if(!active()||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;if(sleeping&&['e','E','Escape'].includes(e.key)){sleeping=false;syncUI();if(e.key!=='Escape')return;}if(e.key==='Escape'){resetTalkAnimation();if(dialogue)closeDialogue();$('classroom-help').hidden=true;$('classroom-collection').hidden=true;$('classroom-session-result').hidden=true;syncUI();return;}if(!interactive())return;if(['e','E'].includes(e.key)){interact();return;}if(keyMap[e.key]){e.preventDefault();keys.add(keyMap[e.key]);}});listen(window,'keyup',e=>keys.delete(keyMap[e.key]));listen(window,'blur',()=>{if(entered)clearInput();});
  listen(window,'storage',event=>{if(disposed||event.storageArea&&event.storageArea!==storage)return;if(event.key===ACTIVITY_STORAGE_KEY)learnActivity(null);else if(event.key===BOARD_STORAGE_KEY)refreshBoardProgress();else if(event.key===SESSION_STORAGE_KEY){refreshSessions();if(sessionFocused&&getSessionProgress(sessions).complete&&active())showSessionResults();}else return;if(entered)syncUI();});
  for(const b of document.querySelectorAll('[data-direction]')){listen(b,'pointerdown',e=>{if(!interactive())return;e.preventDefault();b.setPointerCapture(e.pointerId);held.set(e.pointerId,b.dataset.direction);b.classList.add('is-held');});for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(b,type,e=>{held.delete(e.pointerId);b.classList.remove('is-held');});}
  listen(canvas,'pointerdown',e=>{if(!interactive()||pointer)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});});listen(canvas,'pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8)pointer.moved=true;if(pointer.moved){look(-(e.clientX-pointer.lastX)*.006,-(e.clientY-pointer.lastY)*.004);e.preventDefault();}pointer.lastX=e.clientX;pointer.lastY=e.clientY;});listen(canvas,'pointerup',e=>{if(pointer?.id!==e.pointerId)return;if(!pointer.moved)clickWorld(e);pointer=null;});for(const type of ['pointercancel','lostpointercapture'])listen(canvas,type,e=>{if(pointer?.id===e.pointerId)pointer=null;});
  return{enter,exit,tick,pause,resume,dispose,getInfo:info,getState:()=>JSON.parse(JSON.stringify(state)),getStoryState:()=>JSON.parse(JSON.stringify(story)),getBoardState:()=>({...boardRequest}),getSessionState:()=>JSON.parse(JSON.stringify(sessions)),projectPoint};
}
