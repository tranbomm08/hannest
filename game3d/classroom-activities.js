// Optional activity words have their own save. They never change the 30-object
// lesson, review order, campus tasks or exam study time.
export const ACTIVITY_STORAGE_KEY='hannest_game3d_classroom101_activities_v1';
export const ACTIVITY_WORDS=Object.freeze({
  sleep:{word:'졸다',meaning:'앉아서 잠깐 잠이 드는 거예요.',sentence:'하나가 교실 뒤에서 졸고 있어요.'},
  makeup:{word:'화장하다',meaning:'얼굴에 화장품을 바르는 거예요.',sentence:'유나가 거울을 보며 화장하고 있어요.'},
  sweep:{word:'쓸다',meaning:'빗자루로 바닥의 먼지를 모으는 거예요.',sentence:'지윤이 빗자루로 교실을 쓸고 있어요.'},
  study:{word:'공부하다',meaning:'책을 읽고 새로운 내용을 배우는 거예요.',sentence:'앞자리의 친구들이 열심히 공부하고 있어요.'},
  broom:{word:'빗자루',meaning:'바닥을 쓸 때 사용하는 청소 도구예요.',sentence:'지윤이 빗자루를 잡고 있어요.'},
  mirror:{word:'거울',meaning:'내 얼굴이나 모습을 볼 수 있는 물건이에요.',sentence:'유나가 거울을 들고 있어요.'},
  lipstick:{word:'립스틱',meaning:'입술에 색을 바르는 화장품이에요.',sentence:'유나가 입술에 립스틱을 바르고 있어요.'},
  request:{word:'부탁하다',meaning:'다른 사람에게 도움을 요청하는 거예요.',sentence:'선생님이 칠판을 지워 달라고 부탁해요.'},
  hold:{word:'잡다',meaning:'손으로 물건을 쥐는 거예요.',sentence:'제가 칠판지우개를 잡아요.'},
  erase:{word:'지우다',meaning:'쓴 글씨를 없애는 거예요.',sentence:'제가 칠판을 지워요.'},
  put:{word:'놓다',meaning:'가지고 있던 물건을 다른 곳에 두는 거예요.',sentence:'칠판지우개를 제자리에 놓아요.'},
});
export const CLASSMATE_NAMES=Object.freeze({daeun:'다은',jun:'준',seoyeon:'서연',yuna:'유나',hana:'하나',jiun:'지윤'});
export const CLASSMATE_ACTIVITIES=Object.freeze({hana:'sleep',yuna:'makeup',jiun:'sweep',daeun:'study',jun:'study',seoyeon:'study'});
const related={sleep:['sleep'],makeup:['makeup','mirror','lipstick'],sweep:['sweep','broom'],study:['study']};
export function activityWordIds(id){return Object.hasOwn(related,id)?related[id]:Object.hasOwn(ACTIVITY_WORDS,id)?[id]:[];}
export function loadActivityWords(storage){
  try{const raw=storage.getItem(ACTIVITY_STORAGE_KEY);if(raw==null)return{words:[],warning:''};const parsed=JSON.parse(raw);
    if(parsed.version!==1||!Array.isArray(parsed.words))throw new Error('Invalid activity save');
    return{words:[...new Set(parsed.words.filter(id=>Object.hasOwn(ACTIVITY_WORDS,id)))],warning:''};
  }catch(_){return{words:[],warning:'추가 낱말을 불러오지 못했어요. 저장 내용을 지우지 않아요.',protected:true};}
}
export function learnActivityWords(storage,current,id){
  // Read immediately before every write, including revisiting a known word.
  // A second tab may have learned words since this controller was created.
  const loaded=loadActivityWords(storage),words=[...new Set([...current,...loaded.words,...activityWordIds(id)])];
  if(loaded.protected)return{words,warning:loaded.warning};
  if(words.length===loaded.words.length&&words.every(word=>loaded.words.includes(word)))return{words,warning:''};
  try{storage.setItem(ACTIVITY_STORAGE_KEY,JSON.stringify({version:1,words}));return{words,warning:''};}
  catch(_){return{words,warning:'추가 낱말을 저장하지 못했어요. 이 화면에서는 계속 배울 수 있어요.'};}
}
export function getActivityDialogue(actorId){
  const activity=CLASSMATE_ACTIVITIES[actorId];if(!activity)return null;
  const text={sleep:'하나가 책상에 기대어 눈을 감고 졸고 있어요. 「졸다」는 앉아서 잠깐 잠이 드는 거예요.',makeup:'거울을 보며 립스틱을 바르고 있었어요. 「화장하다」는 얼굴에 화장품을 바르는 거예요.',sweep:'빗자루로 교실을 쓸고 있어요. 「쓸다」는 바닥의 먼지를 모으는 거예요.',study:'앞자리에서 책을 읽고 배운 내용을 적어요. 함께 공부해요!'}[activity];
  return{activity,text,...(activity==='sleep'?{speaker:'hero',listener:actorId}:{}),choices:[{id:'activity-word',label:'새 낱말과 문장 보기'},{id:'lesson-help',label:'물건 수업도 도와줄래요?'},{id:'continue',label:'고마워요. 계속해요.'}]};
}

// Real meshes follow the native hand sockets. The broom head stays on the
// ground while its handle reaches the animated hand; every resource is owned.
export function createClassroomActivityProps({THREE,scene,actors}){
  const geometries=new Set(),materials=new Set(),roots=[],records=new Map();let disposed=false;
  const material=(name,color,extra={})=>{const m=new THREE.MeshStandardMaterial({name,color,roughness:.7,...extra});materials.add(m);return m;};
  const wood=material('classroom-broom-wood',0xb18a57),brush=material('classroom-broom-bristles',0x837349),rose=material('classroom-compact-case',0xc8879d),glass=material('classroom-mirror-surface',0xd6e5e8,{metalness:.85,roughness:.16}),dark=material('classroom-lipstick-tube',0x47414a),red=material('classroom-lipstick-colour',0xab4560),paper=material('classroom-practice-paper',0xfffaf0),ink=material('classroom-practice-lines',0x9ea9a1);
  function mesh(geometry,mat,parent,x=0,y=0,z=0){geometries.add(geometry);const o=new THREE.Mesh(geometry,mat);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;}
  function group(name,parent,activity){const g=new THREE.Group();g.name=name;if(activity)g.userData.activityId=activity;parent.add(g);roots.push(g);return g;}
  const cleaner=actors.get('jiun');
  if(cleaner){
    const g=group('classroom-broom',scene,'broom'),shaft=mesh(new THREE.CylinderGeometry(.013,.013,1,10),wood,g),head=mesh(new THREE.BoxGeometry(.32,.07,.09),wood,g),bristles=mesh(new THREE.BoxGeometry(.30,.085,.075),brush,g);
    records.set('broom',{root:g,actor:cleaner,shaft,head,bristles,tip:new THREE.Vector3(),hand:new THREE.Vector3(),upperHand:new THREE.Vector3(),direction:new THREE.Vector3(),end:new THREE.Vector3(),up:new THREE.Vector3(0,1,0)});
  }
  const makeup=actors.get('yuna');
  if(makeup){
    const compact=group('classroom-hand-mirror',makeup.userData.sockets.leftHand,'mirror');compact.position.set(0,-.07,.015);compact.rotation.x=-.45;
    mesh(new THREE.BoxGeometry(.15,.11,.017),rose,compact);mesh(new THREE.BoxGeometry(.126,.086,.004),glass,compact,0,0,.011);
    const lipstick=group('classroom-lipstick',makeup.userData.sockets.rightHand,'lipstick');lipstick.position.set(0,-.075,.008);
    mesh(new THREE.CylinderGeometry(.015,.015,.065,12),dark,lipstick,0,-.03,0);mesh(new THREE.CylinderGeometry(.010,.011,.034,12),red,lipstick,0,-.077,0);
    records.set('mirror',{root:compact,actor:makeup});records.set('lipstick',{root:lipstick,actor:makeup});
  }
  const notebook=group('classroom-practice-notebook',scene);notebook.visible=false;
  mesh(new THREE.BoxGeometry(.28,.007,.22),paper,notebook);
  for(let i=0;i<5;i++)mesh(new THREE.BoxGeometry(.23,.001,.002),ink,notebook,0,.004,-.07+i*.03);
  records.set('practice-notebook',{root:notebook});
  const decoration=group('classroom-earned-desk-star',scene);decoration.visible=false;
  const starPoints=[];for(let i=0;i<10;i++){const angle=Math.PI/2+i*Math.PI/5,r=i%2?.035:.075;starPoints.push(new THREE.Vector2(Math.cos(angle)*r,Math.sin(angle)*r));}
  const starShape=new THREE.Shape(starPoints),star=mesh(new THREE.ShapeGeometry(starShape),material('classroom-earned-gold',0xc9953f,{side:THREE.DoubleSide}),decoration);star.rotation.x=-Math.PI/2;
  records.set('desk-reward',{root:decoration});
  function setWritingDesk(seat){notebook.visible=Boolean(seat?.desk);if(seat?.desk){notebook.position.copy(seat.deskTop);notebook.position.y+=.005;}}
  function setRewardDecoration(earned,seat){decoration.visible=Boolean(earned&&seat?.desk);if(decoration.visible){decoration.position.copy(seat.deskTop);decoration.position.x+=.22;decoration.position.z+=.16;decoration.position.y+=.014;}}
  function update(time){
    if(disposed)return;
    for(const id of ['mirror','lipstick']){const r=records.get(id);if(r)r.root.visible=r.actor.userData.behavior?.activity==='makeup';}
    const r=records.get('broom');if(!r)return;r.root.visible=r.actor.userData.behavior?.activity==='sweep';if(!r.root.visible)return;
    r.actor.userData.sockets.rightHand.getWorldPosition(r.hand);r.actor.userData.sockets.leftHand.getWorldPosition(r.upperHand);
    const yaw=r.actor.rotation.y;r.direction.copy(r.upperHand).sub(r.hand);
    // During the short native fade-in the palms have not reached their grips.
    // Keep a finite handle until they separate; settled motion uses both palms.
    if(r.direction.y>.12){r.tip.copy(r.hand).addScaledVector(r.direction,(.065-r.hand.y)/r.direction.y);r.direction.normalize();r.end.copy(r.upperHand).addScaledVector(r.direction,.11);}
    else{r.tip.set(r.hand.x+Math.sin(yaw)*.25,.065,r.hand.z+Math.cos(yaw)*.25);r.end.copy(r.hand);}
    r.tip.y=.065;r.root.position.copy(r.tip);r.direction.copy(r.end).sub(r.tip);const length=r.direction.length();r.shaft.position.copy(r.direction).multiplyScalar(.5);r.shaft.scale.y=length;r.shaft.quaternion.setFromUnitVectors(r.up,r.direction.normalize());
    r.head.rotation.y=yaw;r.bristles.position.y=-.02;r.bristles.rotation.y=yaw;
  }
  function diagnostics(){return Object.fromEntries([...records].map(([id,r])=>[id,{visible:r.root.visible,position:r.root.getWorldPosition(new THREE.Vector3()).toArray(),activityId:r.root.userData.activityId||null,attachedTo:r.root.parent?.name||null,...(r.hand?{hand:r.hand.toArray(),tip:r.tip.toArray()}:{} )}]));}
  function dispose(){if(disposed)return;disposed=true;for(const r of roots)r.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();records.clear();}
  return{update,setWritingDesk,setRewardDecoration,diagnostics,dispose,pickables:roots};
}
