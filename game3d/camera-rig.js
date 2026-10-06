// The camera has a small physical volume. A centre ray alone can let its near
// plane enter a wall. This helper does not modify navigation or model geometry.
export function createCameraCollision({THREE,getObstacles,getBounds,radius=.18}){
  const ray=new THREE.Ray(),cache=new WeakMap();
  function visible(node){for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;}
  function boxes(){return getObstacles().filter(visible).map(node=>{
    node.updateWorldMatrix(true,false);let entry=cache.get(node);
    if(!entry||!entry.matrix.equals(node.matrixWorld)){entry={matrix:node.matrixWorld.clone(),box:new THREE.Box3().setFromObject(node)};cache.set(node,entry);}
    return entry.box.clone().expandByScalar(radius);
  });}
  function clamp(point){const b=getBounds()||{};return point.clone().set(
    THREE.MathUtils.clamp(point.x,(b.minX??-Infinity)+radius,(b.maxX??Infinity)-radius),
    THREE.MathUtils.clamp(point.y,b.minY??.5,b.maxY??Infinity),
    THREE.MathUtils.clamp(point.z,(b.minZ??-Infinity)+radius,(b.maxZ??Infinity)-radius));}
  function resolve(origin,desired){
    const target=clamp(desired),delta=target.clone().sub(origin),length=delta.length();if(length<.001)return target;
    ray.set(origin,delta.divideScalar(length));let distance=length;
    for(const box of boxes()){
      if(box.containsPoint(origin))continue;
      const hit=ray.intersectBox(box,new THREE.Vector3());if(hit)distance=Math.min(distance,Math.max(0,hit.distanceTo(origin)-.025));
    }
    return clamp(origin.clone().addScaledVector(ray.direction,distance));
  }
  return {resolve,isClear:point=>boxes().every(box=>!box.containsPoint(point)),radius};
}

function extents(THREE,camera,boxes){
  camera.updateMatrixWorld(true);let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
  for(const box of boxes)for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).project(camera);left=Math.min(left,p.x);right=Math.max(right,p.x);bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);
  }
  return {left,right,bottom,top};
}
export function fitDialogueCamera({THREE,camera,boxes,focus,frame,minFov=43,maxFov=78}){
  const target=focus.clone();camera.fov=minFov;camera.lookAt(target);camera.updateProjectionMatrix();
  const first=extents(THREE,camera,boxes),ratio=Math.max(1,(first.right-first.left)/(frame.right-frame.left),(first.top-first.bottom)/(frame.top-frame.bottom));
  camera.fov=THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(minFov)/2)*ratio*1.08)),minFov,maxFov);camera.updateProjectionMatrix();
  for(let n=0;n<6;n++){
    const projected=extents(THREE,camera,boxes),error=(projected.top+projected.bottom-frame.top-frame.bottom)/2;
    if(Math.abs(error)<.008)break;
    target.y+=THREE.MathUtils.clamp(error*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*camera.position.distanceTo(focus),-.65,.65);camera.lookAt(target);
  }
  const projected=extents(THREE,camera,boxes);
  return {focus:target,fov:camera.fov,projected,fits:projected.left>=frame.left-.025&&projected.right<=frame.right+.025&&projected.bottom>=frame.bottom-.025&&projected.top<=frame.top+.025};
}
