import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {LESSON_OBJECTS} from './classroom-lesson.js';

// Use every original manifest object in the new 30-word lesson.
// Progress lives in its own module; the GLB owns only scenery.
export async function createModelClassroom(scene, {signal} = {}) {
  const url = new URL('./models/HANNEST_Phong_101.glb', import.meta.url);
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`101호 모델: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(bytes, new URL('.', url).href);
  const room = adaptModelClassroom(gltf.scene);
  if (signal?.aborted) { room.dispose(); throw new DOMException('Room load cancelled', 'AbortError'); }
  scene.add(room.root);
  return room;
}

export function adaptModelClassroom(root) {
  root.name = 'hannest-classroom-101-imported';
  root.updateMatrixWorld(true);
  const geometry = new Set(), materials = new Set(), textures = new Set(), bitmaps = new Set();
  // Collect before removing the exported guide so its resources are released too.
  root.traverse(node => {
    if (node.geometry) geometry.add(node.geometry);
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!mat) continue;
      materials.add(mat);
      for (const value of Object.values(mat)) if (value?.isTexture) {
        textures.add(value); if (value.source?.data?.close) bitmaps.add(value.source.data);
      }
    }
    if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
  });
  // The existing actor system supplies Su-a and the other classmates, with the
  // Give/Receive/Sit clips. Do not render a second static Su-a from the export.
  root.getObjectByName('Su_a_Michelle')?.removeFromParent();
  const byAssetId = new Map();
  root.traverse(node => { if (node.userData.hannest_id) byAssetId.set(node.userData.hannest_id, node); });
  const obstacles = [], cameraObstacles = [], selectableObjects = [], objectsById = new Map();
  const targets = {}, seats = [], seatObjects = new Map();
  const bounds = {minX: -3.15, maxX: 3.15, minZ: -4.35, maxZ: 4.35};
  const box = node => new THREE.Box3().setFromObject(node);
  function collide(node, name = node.name) {
    const b = box(node);
    obstacles.push({minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z,name});
  }
  function register(id, node, target) {
    if (!node) throw new Error('101호 물건을 찾지 못했어요: ' + id);
    // A centre-based wrapper avoids a prop jumping away from a hand socket
    // because the imported mesh's origin was at a remote Blender location.
    const center = box(node).getCenter(new THREE.Vector3());
    const group = new THREE.Group(); group.name = 'classroom-' + id;
    root.add(group); group.position.copy(center); group.updateWorldMatrix(true, false);
    group.attach(node);
    Object.assign(group.userData, {discoveryId:id,interactableKey:id,classroomId:id});
    group.userData.pickPadding = ['pencil','pen','eraser','ruler','chalk','scissors','glue','colored-pencils','paper','keyboard','mouse'].includes(id) ? .035 : ['book','notebook','pencil-case'].includes(id) ? .020 : 0;
    group.userData.restPosition = group.position.clone();
    group.userData.restRotation = group.rotation.clone();
    group.userData.visualBounds = box(group).applyMatrix4(group.matrixWorld.clone().invert());
    // Hollow frames/monitor stands have an empty or buried AABB centre. Aim at
    // a real visible surface so proximity/occlusion use the same thing clicked.
    if (['door','computer','locker','bookshelf','trash-bin','plant','teacher-desk'].includes(id)) {
      let chosen=null,score=-Infinity;
      group.traverse(mesh=>{
        if(!mesh.isMesh)return;const b=box(mesh),size=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
        if(id==='computer'&&c.y<.82)return;
        const area=size.x*size.y+size.z*size.y;
        if(area>score){score=area;chosen=c;}
      });
      if(chosen)group.userData.interactionCenter=group.worldToLocal(chosen);
    }
    objectsById.set(id, group); selectableObjects.push(group);
    targets[id] = new THREE.Vector3(target[0], 0, target[1]);
    return group;
  }
  for (const item of LESSON_OBJECTS) register(item.id, byAssetId.get(item.assetId), [0,0]);

  const chairNames = ['LV1_02_chair','Chair_12','Chair_13','Chair_21','Chair_22','Chair_23','Chair_31','Chair_32','Chair_33'];
  const deskNames = ['LV1_01_desk','Desk_12','Desk_13','Desk_21','Desk_22','Desk_23','Desk_31','Desk_32','Desk_33'];
  for (let index=0;index<chairNames.length;index++) {
    const object=root.getObjectByName(chairNames[index]), b=box(object), c=b.getCenter(new THREE.Vector3());
    const id=index===4?'student-seat':`seat-${index}`;
    const approach=new THREE.Vector3(c.x+(index%3===0?.90:-.82),0,c.z);
    object.userData.seatId=id; seatObjects.set(id,object);
    const desk=root.getObjectByName(deskNames[index]),deskBounds=box(desk),deskTop=deskBounds.getCenter(new THREE.Vector3());deskTop.y=deskBounds.max.y;
    seats.push({id,object,desk,deskTop,row:Math.floor(index/3),position:new THREE.Vector3(c.x,.46,c.z-.04),yaw:Math.PI,approach});
    collide(object,'chair-'+id);
  }
  for (const name of ['LV1_01_desk','Desk_12','Desk_13','Desk_21','Desk_22','Desk_23','Desk_31','Desk_32','Desk_33','LV1_21_teacher_desk','LV1_16_locker','LV1_17_bookshelf']) {
    const node=root.getObjectByName(name); if(node) collide(node);
  }
  // Camera occluders are solid meshes, excluding the floor, tiny props and
  // the removed actor; discovery rays can still hit the selected item's mesh.
  root.traverse(node => {
    if(!node.isMesh || node.name.startsWith('Floor') || node.name.startsWith('Tile')) return;
    const b=box(node),size=b.getSize(new THREE.Vector3());
    if(size.y>.30 && Math.max(size.x,size.z)>.40) cameraObstacles.push(node);
  });
  const spawn=root.getObjectByName('Player_spawn_101')?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3(2.60,0,-1.30);
  const actorSpawns={
    teacher:{position:new THREE.Vector3(.80,0,-3.40),yaw:0,seated:false,activity:'prepare'},
    sua:{position:seats[0].position.clone(),yaw:Math.PI,seated:true,seatId:seats[0].id,activity:'write'},
    daeun:{position:seats[1].position.clone(),yaw:Math.PI,seated:true,seatId:seats[1].id,activity:'read'},
    minsu:{position:seats[2].position.clone(),yaw:Math.PI,seated:true,seatId:seats[2].id,activity:'write'},
    jun:{position:seats[3].position.clone(),yaw:Math.PI,seated:true,seatId:seats[3].id,activity:'read'},
    seoyeon:{position:seats[5].position.clone(),yaw:Math.PI,seated:true,seatId:seats[5].id,activity:'organize'},
    hana:{position:seats[6].position.clone(),yaw:Math.PI,seated:true,seatId:seats[6].id,activity:'sleep'},
    yuna:{position:seats[8].position.clone(),yaw:Math.PI,seated:true,seatId:seats[8].id,activity:'makeup'},
    jiun:{position:new THREE.Vector3(2.55,0,3.65),yaw:-Math.PI/2,seated:false,activity:'sweep'},
  };
  targets.teacher=new THREE.Vector3(.80,0,-2.36);
  targets.sua=new THREE.Vector3(-1.10,0,-2.35);
  targets.minsu=new THREE.Vector3(.82,0,-2.35);
  targets.hana=new THREE.Vector3(-1.10,0,1.15);
  targets.jiun=new THREE.Vector3(1.55,0,3.65);
  for(const seat of seats)targets[seat.id]=seat.approach.clone();
  const walkable=(x,z)=>x>=bounds.minX+.12&&x<=bounds.maxX-.12&&z>=bounds.minZ+.12&&z<=bounds.maxZ-.12
    && !obstacles.some(o=>x>o.minX-.28&&x<o.maxX+.28&&z>o.minZ-.28&&z<o.maxZ+.28)
    && !Object.values(actorSpawns).some(a=>Math.hypot(x-a.position.x,z-a.position.z)<.62);
  const step=.10,key=(x,z)=>x+','+z,cell=p=>[Math.round(p.x/step),Math.round(p.z/step)];
  const first=cell(spawn),queue=[first],visited=new Set([key(...first)]);
  for(let at=0;at<queue.length;at++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const [x,z]=queue[at],next=[x+dx,z+dz],k=key(...next);
    if(!visited.has(k)&&walkable(next[0]*step,next[1]*step)){visited.add(k);queue.push(next);}
  }
  const belongsTo=(node,parent)=>{for(let n=node;n;n=n.parent)if(n===parent)return true;return false;};
  const ray=new THREE.Raycaster();
  for(const [id,object] of objectsById){
    object.updateWorldMatrix(true,true);
    const center=object.userData.interactionCenter?object.localToWorld(object.userData.interactionCenter.clone()):box(object).getCenter(new THREE.Vector3());
    const candidates=queue.map(([x,z])=>new THREE.Vector3(x*step,0,z*step))
      .filter(p=>Math.hypot(p.x-center.x,p.z-center.z)<2.20)
      .sort((a,b)=>Math.abs(Math.hypot(a.x-center.x,a.z-center.z)-1.05)-Math.abs(Math.hypot(b.x-center.x,b.z-center.z)-1.05));
    const target=candidates.find(p=>{
      const origin=p.clone().add(new THREE.Vector3(0,1.45,0)),delta=center.clone().sub(origin);ray.set(origin,delta.clone().normalize());
      if(!ray.intersectObject(object,true).length)return false;
      return !ray.intersectObjects(cameraObstacles.filter(n=>!belongsTo(n,object)),false).some(hit=>hit.distance<delta.length()-.07);
    });
    if(!target)throw new Error('이 물건에 가까이 갈 수 없어요: '+id);
    targets[id]=target;
  }
  const objective=new THREE.Group(); objective.name='classroom-objective';
  const ringGeometry=new THREE.RingGeometry(.16,.20,28),ringMaterial=new THREE.MeshBasicMaterial({color:0xc28b4e,side:THREE.DoubleSide,depthWrite:false});
  geometry.add(ringGeometry);materials.add(ringMaterial);
  const ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.rotation.x=-Math.PI/2;ring.position.y=.025;objective.add(ring);objective.visible=false;root.add(objective);
  const highlight=new THREE.BoxHelper(undefined,0xc49b48);highlight.name='classroom-objective-highlight';highlight.visible=false;highlight.material.depthTest=false;highlight.material.transparent=true;highlight.material.opacity=.85;root.add(highlight);geometry.add(highlight.geometry);materials.add(highlight.material);
  const grounds=[];root.traverse(node=>{if(!node.isMesh)return;const b=box(node);if(b.max.y<=.04&&b.min.y>=-.30&&b.max.x-b.min.x>.08&&b.max.z-b.min.z>.08)grounds.push(node);});
  let disposed=false;
  return {
    root,ground:root.getObjectByName('Floor_structure'),grounds,spawn,bounds,walkBounds:bounds,navigationStep:.20,
    obstacles,cameraObstacles,selectableObjects,objectsById,targets,seats,seatObjects,actorSpawns,
    lightingOwned:false,modelSource:'HANNEST_Phong_101.glb',
    setObjective(id,target=targets[id]){objective.visible=Boolean(target);if(target)objective.position.copy(target);const object=objectsById.get(id)||seatObjects.get(id);highlight.visible=Boolean(object);if(object)highlight.setFromObject(object);},
    reactObject(id,{time=0,active=true}={}){const node=objectsById.get(id);if(!node)return;node.position.copy(node.userData.restPosition);node.rotation.copy(node.userData.restRotation);if(active)node.position.y+=Math.sin(Math.min(1,time/1.4)*Math.PI)*.025;},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of geometry)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();for(const b of bitmaps)b.close();selectableObjects.length=0;cameraObstacles.length=0;objectsById.clear();seatObjects.clear();},
  };
}
