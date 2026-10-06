// A separate classroom request; completing it never changes the main lesson.
export const BOARD_STORAGE_KEY='hannest_game3d_classroom101_board_v1';
const phases=['offered','take-eraser','erase-board','put-eraser','complete'];
const validState=state=>state?.version===1&&phases.includes(state.phase);
export const initialBoardState=()=>({version:1,phase:'offered'});
export function loadBoardState(storage){
  try{const raw=storage.getItem(BOARD_STORAGE_KEY);if(raw==null)return{state:initialBoardState(),warning:'',protected:false};const value=JSON.parse(raw);
    if(!validState(value))throw new Error('Unknown board request');
    return{state:{version:1,phase:value.phase},warning:'',protected:false};
  }catch(_){return{state:initialBoardState(),warning:'선생님의 부탁을 불러오지 못했어요. 기존 저장 내용은 그대로 두어요.',protected:true};}
}
export function boardTransition(state,event){
  if(!validState(state))return{state,changed:false};
  const transitions={'ACCEPT':['offered','take-eraser'],'TAKE':['take-eraser','erase-board'],'ERASE':['erase-board','put-eraser'],'PUT':['put-eraser','complete']},next=Object.hasOwn(transitions,event)?transitions[event]:null;
  return next&&state.phase===next[0]?{state:{version:1,phase:next[1]},changed:true}:{state,changed:false};
}
export function saveBoardState(storage,state){
  if(!validState(state))return{state,warning:'활동 내용을 확인하지 못했어요. 기존 저장 내용은 그대로 두어요.',protected:true};
  const loaded=loadBoardState(storage);
  if(loaded.protected)return{state,warning:loaded.warning,protected:true};
  const merged=phases.indexOf(loaded.state.phase)>phases.indexOf(state.phase)?loaded.state:{version:1,phase:state.phase};
  if(merged.phase===loaded.state.phase)return{state:merged,warning:'',protected:false};
  try{storage.setItem(BOARD_STORAGE_KEY,JSON.stringify(merged));return{state:merged,warning:'',protected:false};}
  catch(_){return{state:merged,warning:'선생님의 부탁을 저장하지 못했어요. 이 화면에서는 계속할 수 있어요.',protected:false};}
}
export function getBoardMission(state){
  return{
    offered:{prompt:'선생님이 부탁할 일이 있어요. 가까이 가서 이야기해요.',button:'선생님께 가기',action:'teacher'},
    'take-eraser':{prompt:'「부탁하다」 선생님이 칠판을 지워 달라고 부탁했어요. 받침의 칠판지우개를 가져와요.',button:'칠판지우개 가져가기',action:'take'},
    'erase-board':{prompt:'「잡다」 지우개를 잡았어요. 칠판 앞에서 「지우다」를 직접 해 봐요.',button:'칠판 지우러 가기',action:'erase'},
    'put-eraser':{prompt:'「지우다」 칠판을 지웠어요. 사용한 지우개를 제자리에 놓아요.',button:'지우개 제자리에 놓기',action:'put'},
    complete:{prompt:'「놓다」 지우개를 놓았어요. 선생님을 도와줘서 고마워요!',button:'지우다 · 문장 다시 보기',action:'word'},
  }[state.phase];
}
export function getTeacherBoardDialogue(state){
  if(state.phase==='offered')return{text:'칠판에 지난 시간에 쓴 글자가 남아 있네요. 칠판을 지워 줄래요? 「부탁하다」는 다른 사람에게 도움을 요청하는 거예요.',choices:[{id:'board-accept',label:'네, 선생님. 제가 지울게요.'},{id:'board-lesson',label:'물건 수업도 알려 주세요.'},{id:'continue',label:'잠깐만요, 선생님.'}]};
  if(state.phase==='complete')return{text:'칠판을 깨끗하게 지우고 지우개도 제자리에 놓았군요. 도와줘서 고마워요! 「칠판을 지워요.」라고 말해요.',choices:[{id:'board-word',label:'지우다 · 문장 보기'},{id:'board-lesson',label:'물건 수업 계속하기'},{id:'continue',label:'네, 선생님.'}]};
  return{text:getBoardMission(state).prompt,choices:[{id:'board-go',label:getBoardMission(state).button},{id:'board-lesson',label:'물건 수업도 알려 주세요.'},{id:'continue',label:'네, 알겠어요.'}]};
}

export function createBoardVisuals({THREE,room}){
  const board=room.objectsById.get('board');let surface=board;
  board.traverse(o=>{if(o.isMesh&&o.material?.name==='HN_board')surface=o;});
  const box=new THREE.Box3().setFromObject(surface),plane=box.max.z+.004;
  const contact=new THREE.Vector3(Math.min(1.29,box.max.x-.5),1.46,plane);
  const stance=new THREE.Vector3(contact.x+.31,0,plane+.30);
  const root=new THREE.Group();root.name='classroom-erasable-chalk';board.add(root);root.position.copy(board.worldToLocal(contact.clone()));
  const geometry=new Set(),materials=new Set(),parts=[];let progress=0,disposed=false;
  function stroke(parent,points,material){for(let i=1;i<points.length;i++){
    const a=new THREE.Vector3(...points[i-1]),b=new THREE.Vector3(...points[i]),delta=b.clone().sub(a),g=new THREE.CylinderGeometry(.007,.007,delta.length(),8),mesh=new THREE.Mesh(g,material);geometry.add(g);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());parent.add(mesh);
  }}
  // One erasable Hangul syllable, 가. Its three strokes fit a standing student's reach.
  const paths=[[[-.16,.12,0],[-.025,.12,0],[-.025,-.12,0]],[[.06,.12,0],[.06,-.12,0]],[[.06,0,0],[.16,0,0]]];
  for(let i=0;i<paths.length;i++){const group=new THREE.Group();group.name='classroom-chalk-stroke-'+i;root.add(group);const material=new THREE.MeshBasicMaterial({color:0xf2ead2});materials.add(material);stroke(group,paths[i],material);parts.push(group);}
  function setProgress(value){progress=THREE.MathUtils.clamp(value,0,1);for(let i=0;i<parts.length;i++)parts[i].visible=progress<(i+1)/parts.length;}
  function setPhase(phase){setProgress(['put-eraser','complete'].includes(phase)?1:0);}
  function diagnostics(){return{plane,contact:contact.toArray(),stance:stance.toArray(),progress,remainingStrokes:parts.filter(p=>p.visible).length};}
  function dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of geometry)g.dispose();for(const m of materials)m.dispose();parts.length=0;}
  return{stance,contact,setProgress,setPhase,diagnostics,dispose};
}
