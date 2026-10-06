import * as THREE from './vendor/three.module.js';
import {createActor,animateActor,disposeCharacters} from './characters.js';
import {createCampus} from './campus.js';
import {createCameraCollision} from './camera-rig.js';
import {createSchoolAmbience} from './school-ambience.js';
import {initialState,transition,loadState,saveState,getPhase,getProgress,getCurrentMission,canEnterClassroom,MISSIONS,CONTENT,OBJECT_WORDS} from './lv1-state.js';

const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search),session=query.get('session')||'';
const bridgeEnabled=parent!==window&&location.origin!=='null'&&/^[A-Za-z0-9_-]{1,80}$/.test(session);
let hostActive=!['0','false'].includes(query.get('active')),disposed=false,failed=false,initialized=false,raf=0,lastTime=0;
let campusCameraCollision,renderer,scene,camera,campus,player,sua,minsu,mapProp,cardProp,raycaster,groundClick,objective,cameraClipped=false;
let gameStarted=false,dialogueOpen=false,speakingActor=null,noticeTimer=0;
let savedWarning='',state,storage;
let path=[],pendingInteraction=null,cameraYaw=0,cameraPitch=-.08,viewMode='shoulder',heading=Math.PI,elapsed=0,dialogueSpeaker=null,objectReveal=null;const gestures=new Map(),expressions=new Map(),learnedWords=new Set();
let pointerDown=null,keys=new Set(),heldDirections=new Map();
let classroomController=null,classroomEntered=false,classroomLoading=false,classroomSnapshot=null,classroomLoadVersion=0;
const removers=[],timers=new Set(),worldResources={geometries:new Set(),materials:new Set(),textures:new Set()};
const actors=[],temporaryObjects=[],dialogueButtons=new Set(),vocabularyButtons=new Set();
try{storage=localStorage;}catch(_){storage={getItem(){throw new Error('저장 불가');},setItem(){throw new Error('저장 불가');}};}
const loaded=loadState(storage);state=loaded.state;savedWarning=loaded.warning||'';
window.hannestPreviewReady=false;window.hannestPreviewError=null;
const ambience=createSchoolAmbience({storage,onChange:syncAmbientUI});
function syncAmbientUI(){const info=ambience.getInfo();$('ambient-toggle').textContent=info.enabled?'배경음 켜짐':'배경음 꺼짐';$('ambient-toggle').setAttribute('aria-pressed',String(info.enabled));$('ambient-status').textContent=info.unavailable?'배경음을 재생할 수 없어요. 글로 계속할 수 있어요.':'대화와 낱말은 글로 보여요. 배경음만 작게 재생해요.';}


function listen(target,type,handler,options){target.addEventListener(type,handler,options);removers.push(()=>target.removeEventListener(type,handler,options));}
function notify(type){if(bridgeEnabled&&!disposed)parent.postMessage(JSON.stringify({channel:'hannest-character',version:1,session,type}),location.origin);}
function active(){return !disposed&&!failed&&hostActive&&!document.hidden;}
function interactive(){return active()&&!classroomEntered&&gameStarted&&$('intro').hidden&&$('help').hidden&&$('completion').hidden&&$('error').hidden&&$('vocabulary-panel').hidden;}
function resetTalkAnimation(){speakingActor=null;for(const actor of actors)if(actor.userData.behavior)actor.userData.behavior.speaking=false;}
function pause(){ambience.setPlaying(false);if(classroomLoading)classroomLoadVersion++;if(raf){cancelAnimationFrame(raf);raf=0;}keys.clear();heldDirections.clear();path=[];pendingInteraction=null;pointerDown=null;objectReveal=null;classroomController?.pause();if(campus&&!disposed&&!failed&&!classroomEntered)syncUI();for(const button of document.querySelectorAll('[data-direction]'))button.classList.remove('is-held');resetTalkAnimation();}
function dispose(){
  if(disposed)return;disposed=true;hostActive=false;ambience.dispose();classroomLoadVersion++;pause();try{classroomController?.dispose();}catch(_){}classroomController=null;classroomEntered=false;classroomSnapshot=null;for(const button of [...dialogueButtons,...vocabularyButtons])button.onclick=null;dialogueButtons.clear();vocabularyButtons.clear();while(removers.length){try{removers.pop()();}catch(_){}}for(const timer of timers)clearTimeout(timer);timers.clear();
  // Campus and character factories own their shared resources; only dispose
  // this module's document props here to avoid releasing pooled assets twice.
  for(const root of temporaryObjects)root.traverse(object=>{if(object.geometry)worldResources.geometries.add(object.geometry);const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){if(!material)continue;worldResources.materials.add(material);for(const value of Object.values(material))if(value?.isTexture)worldResources.textures.add(value);}});
  for(const texture of worldResources.textures)texture.dispose();for(const geometry of worldResources.geometries)geometry.dispose();for(const material of worldResources.materials)material.dispose();
  try{scene?.traverse(object=>object.shadow?.map?.dispose());campus?.dispose();disposeCharacters();renderer?.renderLists.dispose();renderer?.dispose();renderer?.forceContextLoss();}catch(_){}
  worldResources.geometries.clear();worldResources.materials.clear();worldResources.textures.clear();actors.length=0;temporaryObjects.length=0;
  gestures.clear();expressions.clear();
  scene=null;campus=null;player=null;sua=null;minsu=null;renderer=null;camera=null;
  window.hannestPreviewReady=false;window.hannestGame=null;
}
function resume(){if(!active())return;ambience.setPlaying(gameStarted||classroomEntered);if(!initialized){initialized=true;initialize();}else{if(classroomEntered)classroomController?.resume();lastTime=performance.now();schedule();}}
function receive(event){
  if(!bridgeEnabled||disposed||event.origin!==location.origin||event.source!==parent||typeof event.data!=='string'||event.data.length>512)return;
  let message;try{message=JSON.parse(event.data);}catch(_){return;}
  if(!message||typeof message!=='object'||Array.isArray(message)||Object.keys(message).sort().join(',')!=='action,channel,session,version'||message.channel!=='hannest-character'||message.version!==1||message.session!==session||!['pause','resume','dispose'].includes(message.action))return;
  if(message.action==='dispose'){dispose();return;}hostActive=message.action==='resume';if(hostActive)resume();else pause();
}
listen(window,'message',receive);listen(window,'pagehide',dispose);listen(document,'visibilitychange',()=>document.hidden?pause():resume());
function fail(error){
  if(disposed)return;failed=true;pause();$('loading').hidden=true;$('intro').hidden=true;$('dialogue').hidden=true;$('error').hidden=false;
  $('classroom-ui').hidden=true;
  $('error-detail').textContent='화면을 새로 열거나 그래픽을 지원하는 브라우저에서 다시 시도해 주세요.';window.hannestPreviewReady=false;window.hannestPreviewError=String(error?.message||error);notify('error');
  try{renderer?.dispose();}catch(_){}
}
function notice(text){
  $('notice').textContent=text;$('notice').hidden=false;if(noticeTimer){clearTimeout(noticeTimer);timers.delete(noticeTimer);}noticeTimer=setTimeout(()=>{$('notice').hidden=true;timers.delete(noticeTimer);noticeTimer=0;},2800);timers.add(noticeTimer);
}
function clearCampusInput(){
  if(pointerDown&&$('scene').hasPointerCapture(pointerDown.id))$('scene').releasePointerCapture(pointerDown.id);
  for(const button of document.querySelectorAll('[data-direction]')){for(const id of heldDirections.keys())if(button.hasPointerCapture(id))button.releasePointerCapture(id);button.classList.remove('is-held');}
  keys.clear();heldDirections.clear();pointerDown=null;path=[];pendingInteraction=null;
}
function classroomPresentation(entered){
  document.querySelector('.game-shell').classList.toggle('is-classroom',entered);
  $('world').classList.toggle('is-classroom',entered);
  $('classroom-ui').hidden=!entered;
  $('level-label').textContent=entered?'101호':'레벨 1';
  ambience.setSpace(entered?'classroom':'campus');
  $('brand-subtitle').textContent=entered?'수아와 함께하는 첫 수업 · 30가지 물건':'한국어로 만나는 나의 첫 캠퍼스';
  $('scene').setAttribute('aria-label',entered?'3D 101호. 화면을 끌어 둘러보고, 가까이에서 물건과 친구를 눌러 보세요.':'3D 캠퍼스. 화면을 눌러 이동하거나 방향키와 W A S D를 사용하세요.');
}
async function enterClassroom(){
  if(!active()||classroomEntered||classroomLoading)return;
  if(!canEnterClassroom(state)){syncClassroomEntry();notice('캠퍼스의 8가지 활동을 모두 마친 뒤 101호에 들어가요.');return;}
  ambience.setPlaying(true);ambience.unlock();
  const version=++classroomLoadVersion;classroomLoading=true;$('start-new-classroom').disabled=true;$('start-new-classroom').textContent='새 수업을 준비하고 있어요…';$('enter-classroom').disabled=true;$('enter-classroom').textContent='101호를 준비하고 있어요…';
  clearCampusInput();closeDialogue();resetTalkAnimation();
  try{
    const {createClassroomController}=await import('./classroom-controller.js');
    if(disposed||!active()||version!==classroomLoadVersion||!canEnterClassroom(state))return;
    if(!classroomController)classroomController=createClassroomController({THREE,renderer,canvas:$('scene'),camera,mount:$('classroom-ui'),isActive:()=>active()&&classroomEntered,canEnter:()=>canEnterClassroom(state),getViewMode:()=>viewMode,setViewMode:mode=>{if(['shoulder','first-person'].includes(mode))viewMode=mode;},notify:notice,onExit:leaveClassroom,getCampusContext:()=>({metSua:state.completed.includes('greet-sua'),hasPencil:state.inventory.includes('pencil')})});
    classroomSnapshot={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,near:camera.near,far:camera.far,yaw:cameraYaw,pitch:cameraPitch};
    $('map-panel').hidden=true;$('vocabulary-panel').hidden=true;$('help').hidden=true;$('notice').hidden=true;
    if(noticeTimer){clearTimeout(noticeTimer);timers.delete(noticeTimer);noticeTimer=0;}
    classroomEntered=true;classroomPresentation(true);$('completion').hidden=true;
    const didEnter=await classroomController.enter();
    if(disposed){classroomController?.exit();return;}
    if(!didEnter||version!==classroomLoadVersion){leaveClassroom();return;}
    lastTime=performance.now();schedule();
  }catch(error){
    try{classroomController?.dispose();}catch(_){}classroomController=null;
    if(classroomEntered)leaveClassroom();
    if(!disposed&&active())notice('101호를 준비하지 못했어요. 잠시 후 다시 눌러 주세요.');
  }finally{
    classroomLoading=false;
    if(!disposed)syncClassroomEntry();
  }
}
function syncClassroomEntry(){
  const allowed=canEnterClassroom(state),count=state.legacyComplete?0:getProgress(state).completed;
  for(const id of ['start-new-classroom','enter-classroom']){$(id).disabled=!allowed||classroomLoading;$(id).textContent=classroomLoading?'101호를 준비하고 있어요…':allowed?'수아와 함께 101호로':'캠퍼스 8가지 활동 후 열려요';}
  const text=allowed?'8가지 활동을 모두 마쳤어요. 수아와 민수가 101호에서 기다려요.':state.legacyComplete?'이전 4가지 활동 기록은 그대로예요. 「첫날 다시 해보기」에서 새 8가지 활동을 마치면 101호가 열려요.':`캠퍼스 활동 ${count} / 8 · 모두 마치면 101호가 열려요.`;
  $('classroom-entry-hint').textContent=text;$('classroom-completion-hint').textContent=text;
}
function leaveClassroom(){
  if(!classroomEntered||disposed)return;classroomEntered=false;classroomController?.exit();clearCampusInput();resetTalkAnimation();classroomPresentation(false);
  if(classroomSnapshot){camera.position.copy(classroomSnapshot.position);camera.quaternion.copy(classroomSnapshot.quaternion);camera.fov=classroomSnapshot.fov;camera.near=classroomSnapshot.near;camera.far=classroomSnapshot.far;cameraYaw=classroomSnapshot.yaw;cameraPitch=classroomSnapshot.pitch;camera.updateProjectionMatrix();classroomSnapshot=null;}
  syncUI();$('scene').focus({preventScroll:true});lastTime=performance.now();schedule();
}
function update(event){
  const result=transition(state,event);if(!result.changed)return false;state=result.state;
  const save=saveState(storage,state,{allowReplay:event.type==='REPLAY'});savedWarning=save.warning||'';syncUI();return true;
}
function phaseTarget(){
  const phase=objectReveal?.correct?objectReveal.phase:getPhase(state);return phase==='entrance'?'entrance':phase==='greet-sua'||phase==='thank-sua'?'sua':phase==='collect-documents'?'desk':phase.startsWith('find-')?'supplies':phase==='pack-bag'?'bag':phase==='ask-minsu'?'minsu':phase==='classroom101'?'classroom':null;
}
function discoveryPhase(phase=getPhase(state)){return phase.startsWith('find-')||phase==='pack-bag';}
function syncDiscovery(){
  const phase=objectReveal?.phase||getPhase(state),show=discoveryPhase(phase);
  $('discovery-panel').hidden=!show;$('world').classList.toggle('is-discovery',show);
  const goal=phase==='pack-bag'?'bag':phase.slice(5);
  for(const id of ['notebook','pencil','eraser','bag'])$(`goal-${id}`).toggleAttribute('hidden',!show||id!==goal);
  $('object-word').textContent=objectReveal?OBJECT_WORDS[objectReveal.id]:'';
  $('selected-object-label').hidden=!objectReveal;
  $('object-feedback').textContent=objectReveal?(objectReveal.correct?'잘 찾았어요. 모양과 낱말을 함께 보세요.':CONTENT.feedback.wrongObject):'그림과 같은 물건을 가까이에서 눌러 보세요.';
  $('object-next').hidden=!objectReveal?.correct;
  $('object-next').textContent=objectReveal?.id==='bag'?(state.dialogue.askedMinsu?'101호로 가기':'민수에게 가기'):objectReveal?.id==='eraser'?'준비물 챙기기':'다음 모양 찾기';
  $('pack-bag').hidden=getPhase(state)!=='pack-bag'||!!objectReveal?.correct;
  $('pack-bag').disabled=!proximity('bag')||!interactive();
  if(objectReveal?.correct&&objectReveal.id!=='bag'){const selected=campus?.selectableObjects.find(item=>item.userData.discoveryId===objectReveal.id);if(selected)selected.visible=true;}
}
function syncUI(){
  const phase=getPhase(state),{completed:count,total}=getProgress(state),heldMission=objectReveal?.correct?MISSIONS.find(item=>item.id===objectReveal.phase):null,mission=heldMission||getCurrentMission(state)||MISSIONS.at(-1),displayNumber=heldMission?MISSIONS.indexOf(heldMission)+1:Math.min(count+1,total);
  $('mission-count').textContent=`${String(displayNumber).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
  $('mission-title').textContent=phase==='complete'?'첫날, 잘 해냈어요!':mission.title;
  $('mission-description').textContent=phase==='thank-sua'?mission.thanksPrompt:phase==='classroom101'?mission.destinationPrompt:mission.prompt;
  $('mission-progress').style.width=`${count/total*100}%`;$('save-status').textContent=savedWarning||'이 이야기의 기록은 기기에 저장돼요.';
  objective=phaseTarget();if(campus)campus.setObjective(objective);
  if(mapProp)mapProp.visible=!state.inventory.includes('map');if(cardProp)cardProp.visible=!state.inventory.includes('student-card');
  if(campus){campus.setCollected(state.inventory);campus.setBagPacked(state.completed.includes('pack-bag'));}
  $('completion').hidden=phase!=='complete'||classroomEntered;if(phase==='complete'){closeDialogue();path=[];pendingInteraction=null;}
  $('start-game').textContent=state.started?'이어서 하기':'첫날 시작하기';
  $('completion-description').textContent=state.legacyComplete?'새로운 친구를 만나고, 학생증과 지도를 받아 101호에 도착했어요.': '친구를 만나고 필요한 물건을 직접 골라 챙긴 뒤 101호에 도착했어요.';
  syncClassroomEntry();syncAmbientUI();
  syncDiscovery();
}
function closeDialogue(){dialogueOpen=false;dialogueSpeaker=null;$('dialogue').hidden=true;resetTalkAnimation();$('dialogue-feedback').textContent='';$('scene').focus({preventScroll:true});}
function proximity(key){return player&&campus?.targets[key]&&player.position.distanceTo(campus.targets[key])<(['entrance','classroom'].includes(key)?1:1.65);}
function updateCanopyVisibility(){
  const footprint=campus.canopyFootprint,{x,z}=player.position;
  // Keep the controlled avatar visible beneath the overhead roof; columns remain.
  campus.setCanopyVisible(!(x>=footprint.minX&&x<=footprint.maxX&&z>=footprint.minZ&&z<=footprint.maxZ));
}
function dialogue(name,text,choices,kind='sua'){
  if(!interactive())return;resetTalkAnimation();dialogueSpeaker=kind;path=[];pendingInteraction=null;keys.clear();heldDirections.clear();dialogueOpen=true;$('dialogue').hidden=false;
  $('dialogue-name').textContent=name;$('dialogue-role').textContent=kind==='minsu'?'같은 반 친구':'캠퍼스 친구';$('speaker-avatar').textContent=kind==='minsu'?'민':'수';$('speaker-avatar').style.background=kind==='minsu'?'#aac7d6':'#e6b3b6';
  $('dialogue-text').textContent=text;$('dialogue-feedback').textContent='';for(const button of dialogueButtons)button.onclick=null;dialogueButtons.clear();$('dialogue-choices').replaceChildren();
  for(const choice of choices){const button=document.createElement('button');button.type='button';button.textContent=choice.label;button.dataset.choice=choice.id||choice.label;button.onclick=()=>{if(interactive())choice.onClick();};dialogueButtons.add(button);$('dialogue-choices').append(button);}
  $('dialogue-choices').firstElementChild?.focus({preventScroll:true});
}
function react(actor,gesture,expression='friendly',duration=1.2){
  if(!actor)return;
  if(gesture)gestures.set(actor,{gesture,until:elapsed+duration});
  expressions.set(actor,{expression,until:elapsed+duration});
}
function wrong(){
  $('dialogue-feedback').textContent=CONTENT.feedback.wrongChoice;
  react(dialogueSpeaker==='minsu'?minsu:sua,'think','curious',1.4);
  react(player,null,'thinking',1.4);
}
function openInteraction(key=objective){
  if(!interactive()||objectReveal?.correct||getPhase(state)==='complete')return;
  if(!key||!proximity(key)){notice(CONTENT.feedback.tooFar);return;}
  const phase=getPhase(state);
  if(key==='sua'&&phase==='greet-sua'){
    dialogue('수아','안녕하세요! 저는 수아예요. 오늘 처음 오셨어요?',MISSIONS[1].choices.map(choice=>({label:choice,onClick:()=>{if(!update({type:'GREET_SUA',choice})){wrong();return;}react(sua,'wave','friendly',1.5);react(player,'nod','friendly',1.2);dialogue('수아','반가워요! 안내 책상 위의 지도와 학생증을 하나씩 받아 주세요.',[{label:'네, 알겠어요.',onClick:closeDialogue}]);}})));
  }else if((key==='desk'||key==='sua')&&phase==='collect-documents'){
    const choices=[];if(!state.inventory.includes('map'))choices.push({id:'collect-map',label:'지도 받기',onClick:()=>collect('map')});if(!state.inventory.includes('student-card'))choices.push({id:'collect-card',label:'학생증 받기',onClick:()=>collect('student-card')});
    dialogue('수아','이건 캠퍼스 지도와 학생증이에요. 하나씩 받아 주세요.',choices);
  }else if((key==='sua'||key==='desk')&&phase==='thank-sua'){
    dialogue('수아','지도와 학생증을 받았네요. 도움이 되었나요?',MISSIONS[2].choices.map(choice=>({label:choice,onClick:()=>{if(!update({type:'THANK_SUA',choice})){wrong();return;}react(sua,'nod');react(player,'nod');dialogue('수아','이제 그림을 보고 준비물을 직접 골라 보세요. 저쪽 책상에 있어요.',[{label:'네, 찾아볼게요.',onClick:closeDialogue}]);}})));
  }else if(key==='supplies'&&phase.startsWith('find-')){
    closeDialogue();notice('그림을 보고 책상 위의 물건을 직접 골라 보세요.');
  }else if(key==='bag'&&phase==='pack-bag'){
    packBag();
  }else if(key==='minsu'&&phase==='ask-minsu'){
    dialogue('민수','안녕하세요. 무엇을 찾고 있어요?',MISSIONS.at(-1).choices.map(choice=>({label:choice,onClick:()=>{if(!update({type:'ASK_MINSU',choice})){wrong();return;}react(minsu,'point','friendly',2.6);react(player,'nod');dialogue('민수','101호는 저쪽 건물 1층이에요. 입구에 있는 표지판을 따라가 보세요.',[{label:'감사합니다. 가볼게요.',onClick:closeDialogue}],'minsu');}})),'minsu');
  }else if(key==='minsu'&&phase==='classroom101'){
    dialogue('민수','101호는 저쪽이에요. 초록색 표시를 따라가세요.',[{label:'네, 고마워요.',onClick:closeDialogue}],'minsu');
  }else if(key==='entrance'||key==='classroom'){
    notice(phase==='entrance'?'학생회관 입구로 조금 더 가까이 가세요.':phase==='classroom101'?'101호 문 앞으로 가세요.':getCurrentMission(state)?.prompt||'첫날을 마쳤어요.');
  }else{
    dialogue(key==='minsu'?'민수':'수아',getCurrentMission(state)?.prompt||'첫날을 마쳤어요.',[{label:'알겠어요.',onClick:closeDialogue}],key==='minsu'?'minsu':'sua');
  }
}
function collect(item){
  if(getPhase(state)!=='collect-documents'||!proximity('desk')||!interactive())return;
  if(!update({type:'COLLECT_DOCUMENTS',item})){notice(CONTENT.feedback.alreadyCollected);return;}
  react(sua,'give','friendly',1.5);react(player,'receive','friendly',1.5);notice(item==='map'?CONTENT.feedback.collectedMap:CONTENT.feedback.collectedCard);
  openInteraction('desk');
}
function selectObject(id){
  if(!interactive()||dialogueOpen||objectReveal?.correct||!getPhase(state).startsWith('find-'))return;
  if(!proximity('supplies')){walkTo(campus.targets.supplies,'supplies');return;}
  if(!Object.hasOwn(OBJECT_WORDS,id)||!campus.selectableObjects.some(item=>item.userData.discoveryId===id&&item.visible))return;
  resetTalkAnimation();path=[];pendingInteraction=null;keys.clear();heldDirections.clear();const phase=getPhase(state),correct=update({type:'SELECT_OBJECT',item:id});
  learnedWords.add(id);objectReveal={id,correct,phase};react(player,correct?'receive':'think',correct?'friendly':'thinking',1.2);syncUI();
}
function packBag(){
  if(!interactive()||dialogueOpen||objectReveal?.correct||getPhase(state)!=='pack-bag'||!proximity('bag'))return;
  resetTalkAnimation();path=[];pendingInteraction=null;keys.clear();heldDirections.clear();if(!update({type:'PACK_BAG'}))return;
  learnedWords.add('bag');objectReveal={id:'bag',correct:true,phase:'pack-bag'};react(player,'give','friendly',1.2);syncUI();
}
function createDocument(kind,position){
  const group=new THREE.Group();group.position.copy(position);group.position.y+=.045;group.userData.item=kind;
  const geometry=new THREE.BoxGeometry(kind==='map'?.5:.4,.035,kind==='map'?.37:.26),material=new THREE.MeshStandardMaterial({color:kind==='map'?0xf3eac9:0xf4efdf,roughness:.9});
  const base=new THREE.Mesh(geometry,material);base.castShadow=true;group.add(base);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle=kind==='map'?'#f1e5bd':'#f5eee0';ctx.fillRect(0,0,256,160);
  ctx.fillStyle='#4a6c59';ctx.font='bold 35px Arial';ctx.textAlign='center';ctx.fillText(kind==='map'?'캠퍼스 지도':'학생증',128,58);ctx.strokeStyle='#91ad8a';ctx.lineWidth=9;
  if(kind==='map'){ctx.beginPath();ctx.moveTo(40,130);ctx.lineTo(130,90);ctx.lineTo(220,130);ctx.stroke();ctx.fillRect(95,87,25,25);ctx.fillRect(170,83,31,24);}else{ctx.fillStyle='#a6ba9e';ctx.fillRect(34,78,44,47);ctx.fillRect(100,84,110,8);ctx.fillRect(100,107,75,8);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const face=new THREE.Mesh(new THREE.PlaneGeometry(kind==='map'?.49:.39,kind==='map'?.36:.25),new THREE.MeshBasicMaterial({map:texture}));face.rotation.x=-Math.PI/2;face.position.y=.02;group.add(face);scene.add(group);temporaryObjects.push(group);return group;
}
function isWalkable(x,z){
  const bounds=campus.walkBounds,radius=.3;if(x<bounds.minX+radius||x>bounds.maxX-radius||z<bounds.minZ+radius||z>bounds.maxZ-radius)return false;
  if([sua,minsu].some(actor=>actor&&Math.hypot(x-actor.position.x,z-actor.position.z)<.67))return false;
  return !campus.obstacles.some(rect=>x>rect.minX-radius&&x<rect.maxX+radius&&z>rect.minZ-radius&&z<rect.maxZ+radius);
}
function segmentClear(a,b){const count=Math.ceil(a.distanceTo(b)/.2);for(let i=1;i<=count;i++){const t=i/count;if(!isWalkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;}return true;}
function findPath(destination){
  const start=player.position.clone(),goal=destination.clone();goal.y=0;if(!isWalkable(goal.x,goal.z))return [];
  if(segmentClear(start,goal))return [goal];
  const step=.45,bounds=campus.walkBounds,toCell=v=>[Math.round((v.x-bounds.minX)/step),Math.round((v.z-bounds.minZ)/step)],toWorld=([x,z])=>new THREE.Vector3(bounds.minX+x*step,0,bounds.minZ+z*step);
  function nearestFreeCell(point){
    const base=toCell(point);let best=null,bestDistance=Infinity;
    for(let radius=0;radius<=4;radius++){
      for(let x=base[0]-radius;x<=base[0]+radius;x++)for(let z=base[1]-radius;z<=base[1]+radius;z++){
        const cell=[x,z],world=toWorld(cell),distance=world.distanceTo(point);
        if(distance<bestDistance&&isWalkable(world.x,world.z)&&segmentClear(point,world)){best=cell;bestDistance=distance;}
      }
      if(best)return best;
    }
    return null;
  }
  const startCell=nearestFreeCell(start),goalCell=nearestFreeCell(goal);if(!startCell||!goalCell)return [];
  const key=([x,z])=>`${x},${z}`,goalKey=key(goalCell),open=[startCell],came=new Map(),g=new Map([[key(startCell),0]]),closed=new Set();
  const h=cell=>Math.hypot(cell[0]-goalCell[0],cell[1]-goalCell[1]);let found=null;
  while(open.length&&closed.size<5000){let best=0;for(let i=1;i<open.length;i++)if((g.get(key(open[i]))||0)+h(open[i])<(g.get(key(open[best]))||0)+h(open[best]))best=i;const current=open.splice(best,1)[0],currentKey=key(current);if(currentKey===goalKey){found=current;break;}closed.add(currentKey);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const next=[current[0]+dx,current[1]+dz],nextKey=key(next);if(closed.has(nextKey))continue;const point=toWorld(next);if(!isWalkable(point.x,point.z)||!segmentClear(toWorld(current),point))continue;const score=g.get(currentKey)+Math.hypot(dx,dz);if(score<(g.get(nextKey)??Infinity)){came.set(nextKey,current);g.set(nextKey,score);if(!open.some(cell=>key(cell)===nextKey))open.push(next);}}
  }
  if(!found)return [];const route=[goal];let current=found;while(key(current)!==key(startCell)){route.unshift(toWorld(current));current=came.get(key(current));if(!current)return [];}const gridStart=toWorld(startCell);if(gridStart.distanceTo(start)>.02)route.unshift(gridStart);return route;
}
function walkTo(target,key=null){
  if(!interactive()||dialogueOpen||objectReveal?.correct||getPhase(state)==='complete')return false;
  let destination=target.clone();const actor=key==='sua'?sua:key==='minsu'?minsu:[sua,minsu].find(item=>item&&item.position.distanceTo(destination)<.67);
  if(actor){
    key=actor.userData.interactableKey;const angle=Math.atan2(player.position.x-actor.position.x,player.position.z-actor.position.z);let best=null,bestDistance=Infinity;
    for(let step=0;step<16;step++){const yaw=angle+step*Math.PI/8,point=actor.position.clone().add(new THREE.Vector3(Math.sin(yaw)*1.15,0,Math.cos(yaw)*1.15));const distance=point.distanceTo(player.position);if(distance<bestDistance&&isWalkable(point.x,point.z)){best=point;bestDistance=distance;}}
    if(!best)return false;destination=best;
  }
  const route=findPath(destination);if(!route.length){notice('길 위의 가까운 곳을 눌러 주세요.');return false;}path=route;pendingInteraction=key;return true;
}
function clickWorld(event){
  if(!interactive()||dialogueOpen||objectReveal?.correct||getPhase(state)==='complete')return;
  const rect=$('scene').getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
  const discoveryObjects=discoveryPhase()?campus.selectableObjects.concat(campus.supplyBag):[];
  const hits=raycaster.intersectObjects([sua,minsu,mapProp,cardProp,...discoveryObjects].filter(object=>object?.visible),true);if(hits.length){let object=hits[0].object;while(object&&!object.userData.interactableKey&&!object.userData.item&&!object.userData.discoveryId)object=object.parent;
    if(object?.userData.discoveryId){selectObject(object.userData.discoveryId);return;}
    if(object?.userData.interactableKey==='bag'){if(proximity('bag'))packBag();else walkTo(campus.targets.bag,'bag');return;}
    if(object?.userData.item){if(proximity('desk'))collect(object.userData.item);else walkTo(campus.targets.desk,'desk');return;}
    if(object?.userData.interactableKey){const key=object.userData.interactableKey;if(proximity(key))openInteraction(key);else walkTo(campus.targets[key],key);return;}}
  const ground=raycaster.intersectObject(campus.ground,true)[0];if(ground)walkTo(ground.point);
}
function updateProximity(){
  const phase=getPhase(state);if(interactive()&&!dialogueOpen&&phase==='entrance'&&proximity('entrance')){if(update({type:'REACH_ENTRANCE'}))notice(MISSIONS[0].success);}
  if(interactive()&&!dialogueOpen&&phase==='classroom101'&&proximity('classroom')){update({type:'REACH_CLASSROOM'});resetTalkAnimation();}
  const key=phaseTarget(),near=key&&proximity(key),spatial=['startgate','entrance','complete','classroom101'].includes(getPhase(state)),canInteract=near&&interactive()&&!dialogueOpen&&!objectReveal?.correct&&!spatial;
  $('interact').hidden=spatial||discoveryPhase()||!!objectReveal?.correct;$('interact').disabled=!canInteract;$('interact').firstElementChild.textContent=getPhase(state)==='collect-documents'?'지도와 학생증 받기':'이야기하기';$('interact').lastElementChild.textContent=canInteract?'눌러서 시작 · E':CONTENT.feedback.tooFar;
  $('pack-bag').disabled=!proximity('bag')||!interactive()||!!objectReveal?.correct;
  $('location-label').textContent=proximity('desk')?'안내 책상':proximity('classroom')?'101호 앞':proximity('entrance')?'학생회관 입구':'캠퍼스 산책길';
}
function drawMap(){
  if($('map-panel').hidden||!campus||!player)return;const canvas=$('mini-map'),ctx=canvas.getContext('2d'),b=campus.walkBounds,sx=x=>(x-b.minX)/(b.maxX-b.minX)*canvas.width,sz=z=>(z-b.minZ)/(b.maxZ-b.minZ)*canvas.height;
  ctx.fillStyle='#edf0e3';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#d4dccb';for(const rect of campus.obstacles)ctx.fillRect(sx(rect.minX),sz(rect.minZ),sx(rect.maxX)-sx(rect.minX),sz(rect.maxZ)-sz(rect.minZ));
  ctx.font='10px Arial';ctx.fillStyle='#586f55';ctx.fillText('학생회관',sx(-8),sz(-8));ctx.fillText('101호',sx(5),sz(-8));
  for(const [key,point] of Object.entries(campus.targets)){ctx.beginPath();ctx.fillStyle=objective===key?'#52876c':'#98ab8e';ctx.arc(sx(point.x),sz(point.z),objective===key?6:3,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#c57b57';ctx.beginPath();ctx.arc(sx(player.position.x),sz(player.position.z),5,0,Math.PI*2);ctx.fill();
}
function schedule(){if(active()&&!raf)raf=requestAnimationFrame(frame);}
function look(yaw,pitch){
  if(!interactive()||dialogueOpen)return;
  cameraYaw=Math.atan2(Math.sin(cameraYaw+yaw),Math.cos(cameraYaw+yaw));
  cameraPitch=THREE.MathUtils.clamp(cameraPitch+pitch,-.95,.95);
  path=[];pendingInteraction=null;
}
function visibleMesh(mesh){let parent=mesh;while(parent){if(!parent.visible)return false;parent=parent.parent;}return true;}
function safeCamera(origin,desired){const point=campusCameraCollision.resolve(origin,desired);cameraClipped=point.distanceToSquared(desired)>.0025;return point;}
function updateCamera(dt){
  const firstPerson=viewMode==='first-person'&&interactive()&&!dialogueOpen;
  player.visible=!firstPerson;$('reticle').hidden=!firstPerson;$('look-controls').hidden=dialogueOpen||!interactive();
  $('view-toggle').textContent=viewMode==='first-person'?'1인칭':'어깨 시점';$('view-toggle').setAttribute('aria-pressed',String(viewMode==='first-person'));
  const fov=dialogueOpen?43:firstPerson?60:52;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
  const forward=new THREE.Vector3(-Math.sin(cameraYaw),0,-Math.cos(cameraYaw)),right=new THREE.Vector3(Math.cos(cameraYaw),0,-Math.sin(cameraYaw));
  let focus,desired,origin=player.position.clone().add(new THREE.Vector3(0,1.45,0));
  if(dialogueOpen){
    const speaker=dialogueSpeaker==='minsu'?minsu:sua;focus=player.position.clone().add(speaker.position).multiplyScalar(.5).add(new THREE.Vector3(0,1.3,0));
    const axis=speaker.position.clone().sub(player.position);axis.y=0;if(axis.lengthSq()<.001)axis.set(1,0,0);axis.normalize();
    const side=new THREE.Vector3(axis.z,0,-axis.x);if(side.z<0)side.negate();
    const distance=camera.aspect<.85?6.4:5.4;
    const front=safeCamera(focus,focus.clone().addScaledVector(side,distance).add(new THREE.Vector3(0,1,0)));
    const opposite=safeCamera(focus,focus.clone().addScaledVector(side,-distance).add(new THREE.Vector3(0,1,0)));
    // A side view shows both talking profiles. Prefer the open foreground when
    // equally clear, and keep the moving camera outside the existing scenery.
    desired=front.distanceTo(focus)+.35>=opposite.distanceTo(focus)?front:opposite;
    camera.position.copy(safeCamera(focus,camera.position.clone().lerp(desired,1-Math.exp(-dt*7))));
  }else if(firstPerson){
    desired=player.position.clone().add(new THREE.Vector3(0,1.58,0));
    focus=desired.clone().add(new THREE.Vector3(forward.x*Math.cos(cameraPitch)*10,Math.sin(cameraPitch)*10,forward.z*Math.cos(cameraPitch)*10));
    cameraClipped=false;camera.position.copy(desired);
  }else{
    focus=origin.clone().addScaledVector(forward,2.4);focus.y+=cameraPitch*4.5;
    desired=origin.clone().addScaledVector(forward,-3.8).addScaledVector(right,.48);desired.y+=1.1-cameraPitch*2.2;
    const candidate=camera.position.clone().lerp(desired,1-Math.exp(-dt*8));camera.position.copy(safeCamera(origin,candidate));
  }
  camera.lookAt(focus);
}
function diagnostics(){
  return {phase:getPhase(state),active:active(),disposed,gameStarted,dialogueOpen,classroomEntered,classroomLoading,classroomUnlocked:canEnterClassroom(state),ambience:ambience.getInfo(),campusProgress:getProgress(state),canopyVisible:campus.canopy.visible,viewMode,cameraYaw,cameraPitch,cameraPosition:camera.position.toArray(),playerVisible:player.visible,cameraClipped,cameraDistance:camera.position.distanceTo(player.position.clone().add(new THREE.Vector3(0,1.45,0))),speakingActor:speakingActor===sua?'sua':speakingActor===minsu?'minsu':null,player:player.position.toArray(),targets:Object.fromEntries(Object.entries(campus.targets).map(([key,value])=>[key,value.toArray()])),objects:Object.fromEntries(campus.selectableObjects.map(item=>[item.userData.discoveryId,{position:new THREE.Box3().setFromObject(item).getCenter(new THREE.Vector3()).toArray(),visible:item.visible}])),discovery:objectReveal?{...objectReveal}:null,actors:Object.fromEntries([['player',player],['sua',sua],['minsu',minsu]].map(([key,actor])=>[key,{...(actor.userData.behavior||{}),speaking:actor===speakingActor,bodyYaw:actor.rotation.y,actualHeadYaw:actor.userData.rig.head.rotation.y,actualHeadPitch:actor.userData.rig.head.rotation.x}])),pathLength:path.length,pathDestination:path[0]?.toArray()||null,pathGoal:path.at(-1)?.toArray()||null,walkable:isWalkable(player.position.x,player.position.z),resources:renderer.info.memory};
}
function projectPoint(key){
  let point;
  if(typeof key==='string'){
    const mesh=key==='bag-object'?campus.supplyBag:campus.selectableObjects.find(item=>item.userData.discoveryId===key);
    point=mesh?new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()):campus.targets[key]?.clone();
  }else point=new THREE.Vector3(...key);
  if(!point)return null;point.project(camera);const rect=$('scene').getBoundingClientRect();return {x:rect.left+(point.x+1)/2*rect.width,y:rect.top+(-point.y+1)/2*rect.height};
}
function animateCast(dt,moving){
  const dialogueActor=dialogueSpeaker==='minsu'?minsu:sua;
  for(const actor of actors){
    const heldGesture=gestures.get(actor),heldExpression=expressions.get(actor);
    if(heldGesture&&heldGesture.until<=elapsed)gestures.delete(actor);
    if(heldExpression&&heldExpression.until<=elapsed)expressions.delete(actor);
    const gesture=gestures.get(actor)?.gesture||'idle';
    let target=dialogueOpen?(actor===player?dialogueActor:actor===dialogueActor?player:null):null;
    if(actor!==player&&!target&&actor.position.distanceTo(player.position)<3.1)target=player;
    if(gesture==='give'||gesture==='receive')target=actor===player?sua:player;
    let bodyYaw=actor.rotation.y;
    if(gesture==='point'&&actor===minsu)bodyYaw=Math.atan2(campus.targets.classroom.x-actor.position.x,campus.targets.classroom.z-actor.position.z);
    else if(target&&(dialogueOpen||gesture==='give'||gesture==='receive'))bodyYaw=Math.atan2(target.position.x-actor.position.x,target.position.z-actor.position.z);
    else if(actor!==player)bodyYaw=actor.userData.homeYaw;
    if(actor!==player||!moving){actor.rotation.y+=Math.atan2(Math.sin(bodyYaw-actor.rotation.y),Math.cos(bodyYaw-actor.rotation.y))*(1-Math.exp(-dt*5));if(actor===player)heading=actor.rotation.y;}
    let headYaw=0,headPitch=0;
    if(target){
      const offset=target.position.clone().sub(actor.position),worldYaw=Math.atan2(offset.x,offset.z);
      headYaw=THREE.MathUtils.clamp(Math.atan2(Math.sin(worldYaw-actor.rotation.y),Math.cos(worldYaw-actor.rotation.y)),-.55,.55);
      headPitch=THREE.MathUtils.clamp(-Math.atan2(offset.y,Math.max(.1,Math.hypot(offset.x,offset.z))),-.2,.2);
    }
    const expression=expressions.get(actor)?.expression||(dialogueOpen&&(actor===player||actor===dialogueActor)?'friendly':target?'curious':'neutral');
    actor.userData.behavior={gesture,headYaw,headPitch,expression,speaking:actor===speakingActor};
    animateActor(actor,{time:elapsed+(actor===sua?.4:actor===minsu?1.2:0),dt,moving:actor===player&&moving,...actor.userData.behavior});
  }
}
function resizeGameViewport(){
  const rect=$('scene').getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
  const touch=typeof window.matchMedia==='function'&&window.matchMedia('(pointer: coarse)').matches;
  const ratio=Math.min(devicePixelRatio||1,touch||width<=700?1.25:1.75);
  if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
  // Three floors physical pixel sizes; rounding up would resize every frame.
  if(renderer.domElement.width!==Math.floor(width*ratio)||renderer.domElement.height!==Math.floor(height*ratio))renderer.setSize(width,height,false);
  if(camera.aspect!==width/height){camera.aspect=width/height;camera.updateProjectionMatrix();}
}
function frame(now){
  raf=0;if(!active())return;
  try{
    const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;elapsed+=dt;
    if(classroomEntered){
      resizeGameViewport();
      classroomController.tick({time:elapsed,dt});schedule();return;
    }
    const directions=new Set([...keys,...heldDirections.values()]);let dx=(directions.has('right')?1:0)-(directions.has('left')?1:0),dz=(directions.has('down')?1:0)-(directions.has('up')?1:0);let moving=false;
    if(interactive()&&!dialogueOpen&&!objectReveal?.correct&&getPhase(state)!=='complete'){
      if(dx||dz){path=[];pendingInteraction=null;const length=Math.hypot(dx,dz);dx/=length;dz/=length;const x=dx*Math.cos(cameraYaw)+dz*Math.sin(cameraYaw),z=-dx*Math.sin(cameraYaw)+dz*Math.cos(cameraYaw);dx=x;dz=z;moving=true;}
      else if(path.length){const target=path[0],delta=target.clone().sub(player.position),distance=delta.length();if(distance<.07){path.shift();}else{delta.normalize();dx=delta.x;dz=delta.z;moving=true;}}
      if(moving){const speed=2.65*dt,nx=player.position.x+dx*speed,nz=player.position.z+dz*speed;if(isWalkable(nx,player.position.z))player.position.x=nx;if(isWalkable(player.position.x,nz))player.position.z=nz;const targetHeading=Math.atan2(dx,dz);heading+=Math.atan2(Math.sin(targetHeading-heading),Math.cos(targetHeading-heading))*Math.min(1,dt*14);player.rotation.y=heading;}
      if(pendingInteraction&&proximity(pendingInteraction)){const target=pendingInteraction;pendingInteraction=null;path=[];openInteraction(target);}
      else if(!path.length&&pendingInteraction){pendingInteraction=null;}
    }
    animateCast(dt,moving);
    updateProximity();drawMap();
    // Keep the foreground direction board from covering faces in conversation.
    // Its ground collision stays in place; normal exploration restores it.
    if(campus.directionSign)campus.directionSign.visible=!dialogueOpen;
    updateCanopyVisibility();
    resizeGameViewport();
    updateCamera(dt);
    renderer.render(scene,camera);schedule();
  }catch(error){fail(error);}
}
function initialize(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,alpha:false,powerPreference:'low-power'});renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
    scene=new THREE.Scene();scene.background=new THREE.Color('#e8e9df');scene.fog=new THREE.Fog('#e8e9df',27,60);camera=new THREE.PerspectiveCamera(43,1,.1,80);raycaster=new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight(0xfff7e2,0x839b7f,2.4));const sunlight=new THREE.DirectionalLight(0xfff2dd,3);sunlight.position.set(-8,14,7);sunlight.castShadow=true;sunlight.shadow.mapSize.set(1024,1024);sunlight.shadow.camera.left=-17;sunlight.shadow.camera.right=17;sunlight.shadow.camera.top=17;sunlight.shadow.camera.bottom=-17;sunlight.shadow.normalBias=.035;sunlight.shadow.bias=-.0002;scene.add(sunlight);
    campus=createCampus(scene);campusCameraCollision=createCameraCollision({THREE,getObstacles:()=>campus.cameraObstacles,getBounds:()=>campus.walkBounds});player=createActor('player');sua=createActor('sua');minsu=createActor('minsu');actors.push(player,sua,minsu);player.position.copy(campus.spawn);sua.position.copy(campus.targets.sua);minsu.position.copy(campus.targets.minsu);sua.rotation.y=sua.userData.homeYaw=Math.PI*.3;minsu.rotation.y=minsu.userData.homeYaw=-Math.PI*.25;sua.userData.interactableKey='sua';minsu.userData.interactableKey='minsu';scene.add(player,sua,minsu);
    const phase=getPhase(state);if(['greet-sua','collect-documents','thank-sua'].includes(phase))player.position.copy(campus.targets.entrance).add(new THREE.Vector3(0,0,1.7));if(phase.startsWith('find-'))player.position.copy(campus.targets.supplies).add(new THREE.Vector3(0,0,1.0));if(phase==='pack-bag')player.position.copy(campus.targets.bag).add(new THREE.Vector3(0,0,.7));if(['ask-minsu','classroom101'].includes(phase))player.position.copy(campus.targets.bag).add(new THREE.Vector3(.4,0,.7));if(phase==='complete')player.position.copy(campus.targets.classroom).add(new THREE.Vector3(0,0,1.8));player.rotation.y=heading;
    const surface=campus.deskSurface||new THREE.Vector3(-5.3,1.045,-3.8);mapProp=createDocument('map',surface.clone().add(new THREE.Vector3(-.34,0,0)));cardProp=createDocument('student-card',surface.clone().add(new THREE.Vector3(.3,0,.05)));
    camera.position.copy(player.position).add(new THREE.Vector3(0,2.7,3.8));
    syncUI();updateCanopyVisibility();$('loading').hidden=true;$('intro').hidden=getPhase(state)==='complete';$('completion').hidden=getPhase(state)!=='complete';gameStarted=false;
    resizeGameViewport();updateCamera(1);renderer.render(scene,camera);
    window.hannestPreviewReady=true;notify('ready');lastTime=performance.now();schedule();
    window.hannestGame={getState:()=>JSON.parse(JSON.stringify(state)),getInfo:diagnostics,projectPoint,classroom:{getInfo:()=>classroomController?.getInfo()||{entered:false,active:false},getState:()=>classroomController?.getState()||null,projectPoint:id=>classroomEntered?classroomController?.projectPoint(id)||null:null}};
  }catch(error){fail(error);}
}
listen($('enter-classroom'),'click',enterClassroom);
listen($('start-new-classroom'),'click',enterClassroom);
listen($('start-game'),'click',()=>{if(!active()||classroomEntered)return;update({type:'START'});gameStarted=true;ambience.setPlaying(true);ambience.unlock();$('intro').hidden=true;$('scene').focus({preventScroll:true});syncUI();});
listen($('restart-game'),'click',()=>{if(!active()||classroomEntered)return;objectReveal=null;learnedWords.clear();gestures.clear();expressions.clear();update({type:'REPLAY'});gameStarted=false;ambience.setPlaying(false);closeDialogue();path=[];player.position.copy(campus.spawn);heading=Math.PI;player.rotation.y=heading;cameraYaw=0;cameraPitch=-.08;$('completion').hidden=true;$('intro').hidden=false;syncUI();});
listen($('interact'),'click',()=>openInteraction());listen($('dialogue-close'),'click',closeDialogue);listen($('retry'),'click',()=>location.reload());
listen($('ambient-toggle'),'click',()=>{if(!active())return;ambience.setEnabled(!ambience.getInfo().enabled);ambience.setPlaying(gameStarted||classroomEntered);ambience.unlock();syncAmbientUI();});
listen($('object-next'),'click',()=>{if(!interactive()||!objectReveal?.correct)return;resetTalkAnimation();objectReveal=null;syncUI();$('scene').focus({preventScroll:true});});
listen($('pack-bag'),'click',packBag);
listen($('view-toggle'),'click',()=>{if(!active()||classroomEntered||dialogueOpen)return;viewMode=viewMode==='shoulder'?'first-person':'shoulder';keys.clear();heldDirections.clear();pointerDown=null;path=[];pendingInteraction=null;$('scene').focus({preventScroll:true});});
for(const [id,yaw,pitch] of [['look-left',.3,0],['look-right',-.3,0],['look-up',0,.12],['look-down',0,-.12]])listen($(id),'click',()=>look(yaw,pitch));
function toggleVocabulary(show){
  if(!active()||classroomEntered)return;closeDialogue();keys.clear();heldDirections.clear();path=[];pendingInteraction=null;pointerDown=null;syncUI();
  const words=getPhase(state)==='complete'?Object.keys(OBJECT_WORDS):[...new Set([...state.inventory,...learnedWords])];
  $('vocabulary-status').textContent='';
  for(const button of vocabularyButtons)button.onclick=null;vocabularyButtons.clear();$('vocabulary-items').replaceChildren();
  for(const id of words){if(!OBJECT_WORDS[id])continue;const item=document.createElement('p');item.className='vocabulary-text-item';item.textContent=OBJECT_WORDS[id];$('vocabulary-items').append(item);}
  if(!words.length){const note=document.createElement('p');note.textContent='직접 고른 물건의 낱말이 여기에 모여요.';$('vocabulary-items').append(note);}
  $('vocabulary-panel').hidden=!show;$('vocabulary-toggle').setAttribute('aria-expanded',String(show));if(show)$('vocabulary-close').focus({preventScroll:true});else $('scene').focus({preventScroll:true});
}
listen($('vocabulary-toggle'),'click',()=>toggleVocabulary(true));listen($('vocabulary-close'),'click',()=>toggleVocabulary(false));
function toggleMap(show){if(!active()||classroomEntered)return;$('map-panel').hidden=!show;$('map-toggle').setAttribute('aria-expanded',String(show));drawMap();}listen($('map-toggle'),'click',()=>toggleMap($('map-panel').hidden));listen($('map-close'),'click',()=>toggleMap(false));
function toggleHelp(show){if(!active()||classroomEntered)return;$('help').hidden=!show;keys.clear();heldDirections.clear();path=[];pendingInteraction=null;pointerDown=null;syncUI();resetTalkAnimation();if(!show)$('scene').focus({preventScroll:true});}listen($('help-toggle'),'click',()=>toggleHelp(true));listen($('help-close'),'click',()=>toggleHelp(false));listen($('help-done'),'click',()=>toggleHelp(false));
const keyMap={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'};
listen(window,'keydown',event=>{if(!active()||classroomEntered||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;if(event.key==='Escape'){if(!$('vocabulary-panel').hidden)toggleVocabulary(false);if(!$('help').hidden)toggleHelp(false);if(dialogueOpen)closeDialogue();resetTalkAnimation();return;}if(!interactive())return;if(['e','E'].includes(event.key)&&!dialogueOpen){openInteraction();return;}if(keyMap[event.key]&&!dialogueOpen){event.preventDefault();keys.add(keyMap[event.key]);}});listen(window,'keyup',event=>keys.delete(keyMap[event.key]));listen(window,'blur',()=>{keys.clear();heldDirections.clear();});
for(const button of document.querySelectorAll('[data-direction]')){listen(button,'pointerdown',event=>{if(!interactive()||dialogueOpen)return;event.preventDefault();button.setPointerCapture(event.pointerId);heldDirections.set(event.pointerId,button.dataset.direction);button.classList.add('is-held');});for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(button,type,event=>{heldDirections.delete(event.pointerId);button.classList.remove('is-held');});}
listen($('scene'),'pointerdown',event=>{if(!interactive()||dialogueOpen||pointerDown)return;pointerDown={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,id:event.pointerId,moved:false};$('scene').setPointerCapture(event.pointerId);$('scene').focus({preventScroll:true});});
listen($('scene'),'pointermove',event=>{if(classroomEntered||!pointerDown||event.pointerId!==pointerDown.id)return;if(Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y)>8)pointerDown.moved=true;if(pointerDown.moved){look(-(event.clientX-pointerDown.lastX)*.006,-(event.clientY-pointerDown.lastY)*.004);event.preventDefault();}pointerDown.lastX=event.clientX;pointerDown.lastY=event.clientY;});
listen($('scene'),'pointerup',event=>{if(classroomEntered||pointerDown?.id!==event.pointerId)return;if(!pointerDown.moved)clickWorld(event);pointerDown=null;});listen($('scene'),'pointercancel',event=>{if(pointerDown?.id===event.pointerId)pointerDown=null;});listen($('scene'),'webglcontextlost',event=>{event.preventDefault();fail(new Error('그래픽 연결이 끊겼어요. 다시 시도해 주세요.'));});
listen($('scene'),'lostpointercapture',event=>{if(pointerDown?.id===event.pointerId)pointerDown=null;});
resume();
