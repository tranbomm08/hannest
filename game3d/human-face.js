/* Original HANNEST procedural young-adult face, +Z forward, metres after the
 * owned .67 scale. Real vertex/normal morph targets, no face images or external
 * models. Attach group at the body's head bone centre without another scale.
 * Mouth opening is an audio-start envelope, never phoneme lip synchronisation.
 */
import * as THREE from './vendor/three.module.js';

const SCALE = .67;
const MORPHS = ['blinkLeft', 'blinkRight', 'slightSmile', 'surprise', 'focus', 'mouthOpen'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-.5 * (((x-cx)/sx)**2 + ((y-cy)/sy)**2));
const profiles = {
  player: {width:.149, height:.178, depth:.127, jaw:.19, eyeX:.060, eyeY:.025, eyeW:.031, eyeH:.0102, lipW:.036, skin:0xecc1a6, hair:0x222427, iris:0x5c3b2c},
  sua: {width:.143, height:.180, depth:.124, jaw:.30, eyeX:.058, eyeY:.028, eyeW:.0315, eyeH:.0116, lipW:.035, skin:0xf1c7af, hair:0x25201f, iris:0x654735},
  minsu: {width:.153, height:.177, depth:.130, jaw:.20, eyeX:.062, eyeY:.026, eyeW:.030, eyeH:.0110, lipW:.036, skin:0xe3b395, hair:0x26201d, iris:0x503b31},
};

function relief(x, y, s) {
  return .005*(gauss(x,y,-.079,-.035,.033,.032)+gauss(x,y,.079,-.035,.033,.032))
    -.006*(gauss(x,y,-s.eyeX,s.eyeY,.028,.018)+gauss(x,y,s.eyeX,s.eyeY,.028,.018))
    +.005*(gauss(x,y,-s.eyeX,.058,.034,.012)+gauss(x,y,s.eyeX,.058,.034,.012))
    +.017*gauss(x,y,0,-.004,.012,.042)
    +.019*gauss(x,y,0,-.037,.014,.012)
    +.004*(gauss(x,y,-.014,-.044,.010,.008)+gauss(x,y,.014,-.044,.010,.008))
    +.004*gauss(x,y,0,-.085,.039,.015)
    +.006*gauss(x,y,0,-.133,.033,.021);
}
function surface(x, y, s) {
  const yn=y/s.height, jaw=yn<-.20 ? 1+(yn+.20)*s.jaw : 1;
  return s.depth*.96*Math.sqrt(Math.max(0,1-(x/(s.width*jaw))**2-yn**2)) + relief(x,y,s);
}

function geometryGrid(cols, rows, point, flip=false) {
  const p=[],uv=[],index=[];
  for(let row=0;row<=rows;row++) for(let col=0;col<=cols;col++) {
    p.push(...point(col/cols,row/rows)); uv.push(col/cols,row/rows);
    if(row && col<cols) {const b=row*(cols+1)+col,a=b-cols-1;index.push(...(flip?[a,a+1,b,b,a+1,b+1]:[a,b,a+1,b,b+1,a+1]));}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();
  return g;
}
function mergeGeometries(pieces) {
  let size=0;const sources=pieces.map(g=>{const n=g.index?g.toNonIndexed():g.clone();size+=n.attributes.position.count;return n;});
  const p=new Float32Array(size*3),n=new Float32Array(size*3);let at=0;
  for(const g of sources) {p.set(g.attributes.position.array,at);n.set(g.attributes.normal.array,at);at+=g.attributes.position.array.length;g.dispose();}
  pieces.forEach(g=>g.dispose());
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.BufferAttribute(p,3));result.setAttribute('normal',new THREE.BufferAttribute(n,3));return result;
}
function tube(points, radius, segments=20, sides=7) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,sides,false);
}

// Each semantic deformation is applied to continuous anatomical surfaces.
// Eyelid meshes also have explicit closure targets, instead of scaling the head.
function deform(x,y,z,target,s,role) {
  const front=z>0 ? clamp(z/.08,0,1) : 0;
  if(target==='slightSmile') {
    const around=gauss(x,y,0,-.081,.055,.025)*front;
    const corner=clamp(Math.abs(x)/s.lipW,0,1)**2;
    y+=around*.006*corner; x+=Math.sign(x)*around*.0008;
    z+=.0015*front*(gauss(x,y,-.073,-.047,.034,.026)+gauss(x,y,.073,-.047,.034,.026));
  } else if(target==='mouthOpen') {
    y-=.0028*gauss(x,y,0,-.118,.045,.037)*front;
  } else if(target==='surprise') {
    y+=.005*front*(gauss(x,y,-s.eyeX,.063,.035,.025)+gauss(x,y,s.eyeX,.063,.035,.025));
  } else if(target==='focus') {
    y-=.0037*front*(gauss(x,y,-.038,.061,.025,.017)+gauss(x,y,.038,.061,.025,.017));
  } else if(target.startsWith('blink') && role==='skin') {
    const cx=target==='blinkLeft'?-s.eyeX:s.eyeX;
    y-=.0020*gauss(x,y,cx,.047,.024,.014)*front;
  }
  return [x,y,z];
}

export function createHumanFace(kind='player', options={}) {
  const variant=Object.hasOwn(profiles,kind)?kind:'player',s=profiles[variant];
  const group=new THREE.Group();group.name=`HANNEST ${variant} anatomical face`;
  group.scale.setScalar(SCALE);group.userData.faceScale=SCALE;
  const geometries=new Set(),materials=new Set(),morphMeshes=[],eyes=[];
  let disposed=false,random=(finite(options.seed,variant==='player'?13:variant==='sua'?29:47)>>>0)||1;
  const rand=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
  const mat=(name,color,roughness=.86,other={})=>{const m=new THREE.MeshStandardMaterial({name,color,roughness,metalness:0,...other});materials.add(m);return m;};
  const skin=mat('HANNEST matte warm skin',0xffffff,.87,{vertexColors:true});
  const plainSkin=mat('HANNEST eyelid and ear skin',s.skin,.88);
  const whites=mat('HANNEST warm sclera',0xece6dc,.66);
  const catchlightMat=mat('HANNEST tiny eye catchlight',0xfffcf1,.35);
  const irisMat=mat('HANNEST iris radial pigment',0xffffff,.60,{vertexColors:true});
  const browMat=mat('HANNEST brows',variant==='player'?0x302d2c:0x3a2c27,.92);
  const lipMat=mat('HANNEST understated lips',variant==='sua'?0xb8857a:0xb88a7a,.89);
  const seamMat=mat('HANNEST mouth recess',0x66483e,.98);
  const hairMat=mat('HANNEST sculpted hair',s.hair,.84);
  const earMat=mat('HANNEST subtle ear fold',0xc89480,.91);

  function mesh(name,g,m,targetPoint) {
    geometries.add(g);const object=new THREE.Mesh(g,m);object.name=name;object.castShadow=true;object.receiveShadow=true;group.add(object);
    if(targetPoint) {
      const base=g.attributes.position;
      g.morphAttributes.position=[];g.morphAttributes.normal=[];
      for(const target of MORPHS) {
        const attr=base.clone();attr.name=target;
        for(let i=0;i<base.count;i++) attr.setXYZ(i,...targetPoint(base.getX(i),base.getY(i),base.getZ(i),target,i));
        const temp=g.clone();temp.morphAttributes={};temp.setAttribute('position',attr);temp.computeVertexNormals();
        g.morphAttributes.position.push(attr);const normal=temp.attributes.normal.clone();normal.name=target;g.morphAttributes.normal.push(normal);temp.dispose();
      }
      g.computeBoundingSphere();object.updateMorphTargets();morphMeshes.push(object);
    }
    return object;
  }
  const headGeometry=new THREE.SphereGeometry(1,64,48),position=headGeometry.attributes.position;
  const color=[],baseColor=new THREE.Color(s.skin),cheekColor=new THREE.Color(0xdba18f);
  for(let i=0;i<position.count;i++) {
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i),jaw=y<-.2?1+(y+.2)*s.jaw:1;
    const px=x*s.width*jaw,py=y*s.height,pz=z*s.depth*(z>0?.96:1)+(z>0?relief(px,py,s):0);
    position.setXYZ(i,px,py,pz);
    const warm=(z>0?.11:0)*(gauss(px,py,-.081,-.037,.032,.029)+gauss(px,py,.081,-.037,.032,.029));
    color.push(...baseColor.clone().lerp(cheekColor,warm).toArray());
  }
  headGeometry.setAttribute('color',new THREE.Float32BufferAttribute(color,3));headGeometry.computeVertexNormals();
  const head=mesh('HANNEST HeadSkin morph mesh',headGeometry,skin,(x,y,z,t)=>deform(x,y,z,t,s,'skin'));
  head.userData.faceMorphRole='skin';

  const lidPieces=[],lidMetadata=[];
  for(const sign of [-1,1]) {
    const cx=sign*s.eyeX,cy=s.eyeY,side=sign<0?'Left':'Right';
    const eyeGeo=geometryGrid(28,10,(u,v)=>{
      const dx=(u*2-1)*s.eyeW,h=s.eyeH*Math.pow(Math.max(0,1-(dx/s.eyeW)**2),.64),dy=(v*2-1)*h+sign*dx*.035;
      return [cx+dx,cy+dy,surface(cx+dx,cy+dy,s)+.0012+.0029*Math.sin(v*Math.PI)*(1-(dx/s.eyeW)**2)];
    },true);
    const eye=mesh(`HANNEST ${side} almond sclera`,eyeGeo,whites,(x,y,z,t)=>{
      const close=t===`blink${side}`,open=t==='surprise'?1.12:t==='focus'?.90:1;
      return [x,close?cy+sign*(x-cx)*.035:cy+(y-cy)*open,z];
    });eye.userData.faceMorphRole='sclera';eye.userData.eyeSide=side;
    // Radial colour is solid vertex geometry, not a painted/projected face.
    const irisGeo=geometryGrid(40,6,(u,v)=>{
      const a=u*Math.PI*2,r=v*.0100,dx=Math.cos(a)*r,dy=Math.sin(a)*r;
      const limit=s.eyeH*Math.pow(Math.max(0,1-(dx/s.eyeW)**2),.64)*.94;
      const yy=cy+clamp(dy,-limit,limit);
      return [cx+dx,yy,surface(cx+dx,yy,s)+.0050+.0006*(1-v)];
    });
    const irisColors=[],irisColor=new THREE.Color(s.iris),pupil=new THREE.Color(0x171c1d),edge=new THREE.Color(0x382d28);
    for(let row=0;row<=6;row++)for(let col=0;col<=40;col++) {
      const r=row/6;irisColors.push(...(r<.42?pupil:irisColor.clone().lerp(edge,r>.85?.5:0)).toArray());
    }
    irisGeo.setAttribute('color',new THREE.Float32BufferAttribute(irisColors,3));
    const iris=mesh(`HANNEST ${side} iris and pupil`,irisGeo,irisMat,(x,y,z,t)=>[x,t===`blink${side}`?cy+sign*(x-cx)*.035:y,z]);
    iris.userData.faceMorphRole='iris';iris.userData.eyeSide=side;eyes.push({iris,cx,cy,side});
    const spotGeo=new THREE.CircleGeometry(.00095,10);spotGeo.translate(cx-.0028,cy+.0033,surface(cx-.0028,cy+.0033,s)+.0060);
    const spot=mesh(`HANNEST ${side} small catchlight`,spotGeo,catchlightMat,(x,y,z,t)=>[x,t===`blink${side}`?cy+sign*(x-cx)*.035:y,z]);
    spot.castShadow=false;spot.userData.faceMorphRole='catchlight';iris.add(spot);
    // Upper and lower skin strips retain a fixed outer crease. Their inner
    // edges meet on the same seam at blink=1; the exposed white also closes.
    for(const upper of [true,false]) {
      const metadata=[];
      const g=geometryGrid(28,5,(u,v)=>{
        const dx=(u*2-1)*s.eyeW,h=s.eyeH*Math.pow(Math.max(0,1-(dx/s.eyeW)**2),.64),slant=sign*dx*.035;
        const inner=cy+(upper?h:-h)+slant,outer=inner+(upper?1:-1)*(.0065+.0035*(1-(dx/s.eyeW)**2));
        const y=inner*(1-v)+outer*v;metadata.push({cx,cy,dx,h,slant,v,upper,side});
        return [cx+dx,y,surface(cx+dx,y,s)+.0020];
      },upper);
      lidPieces.push(g);lidMetadata.push(metadata);
    }
  }
  // Keep indexed lids separate: indices are stable so closure metadata is exact.
  lidPieces.forEach((g,i)=>{
    const metadata=lidMetadata[i];
    const lid=mesh(`HANNEST anatomical eyelid ${i+1}`,g,plainSkin,(x,y,z,t,index)=>{
      const d=metadata[index];let ny=y;
      if(t===`blink${d.side}`) ny+= (d.upper?-1:1)*d.h*(1-d.v);
      if(t==='surprise')ny+=(d.upper?1:-1)*d.h*.12*(1-d.v);
      if(t==='focus')ny-=(d.upper?1:-1)*d.h*.10*(1-d.v);
      return [x,ny,surface(x,ny,s)+.0020];
    });lid.userData.faceMorphRole='lid';lid.userData.lidMetadata=metadata;
  });

  const brows=[];
  for(const sign of [-1,1]) {
    const points=[];
    for(let i=0;i<=10;i++) {const dx=(i/10*2-1)*s.eyeW,y=.058+.004*Math.sin(i/10*Math.PI)-sign*dx*.035;const x=sign*s.eyeX+dx;points.push([x,y,surface(x,y,s)+.0018]);}
    brows.push(tube(points,.0018,20,6));
  }
  const brow=mesh('HANNEST tapered brows',mergeGeometries(brows),browMat,(x,y,z,t)=>deform(x,y,z,t,s,'brows'));
  brow.userData.faceMorphRole='brows';

  const eyeEdges=[];
  for(const sign of [-1,1]) {
    const cx=sign*s.eyeX,cy=s.eyeY,points=[];
    for(let i=0;i<=16;i++) {const dx=(i/16*2-1)*s.eyeW,h=s.eyeH*Math.pow(Math.max(0,1-(dx/s.eyeW)**2),.64),y=cy+h+sign*dx*.035;points.push([cx+dx,y,surface(cx+dx,y,s)+.0025]);}
    eyeEdges.push(tube(points,.00065,20,5));
  }
  const edge=mesh('HANNEST fine upper eyelid crease',mergeGeometries(eyeEdges),browMat,(x,y,z,t)=>{
    const sign=x<0?-1:1,cx=sign*s.eyeX,dx=x-cx,side=sign<0?'Left':'Right',h=s.eyeH*Math.pow(Math.max(0,1-(dx/s.eyeW)**2),.64);
    let ny=y;if(t===`blink${side}`)ny-=h;if(t==='surprise')ny+=h*.12;if(t==='focus')ny-=h*.10;
    return [x,ny,z+surface(x,ny,s)-surface(x,y,s)];
  });edge.userData.faceMorphRole='lid-edge';

  const nostrils=[];
  for(const sign of [-1,1]) {
    nostrils.push(geometryGrid(10,3,(u,v)=>{const x=sign*.011+(u*2-1)*.004,y=-.043+(v*2-1)*.0008*Math.sqrt(Math.max(0,1-(u*2-1)**2));return[x,y,surface(x,y,s)+.0006];},true));
  }
  mesh('HANNEST inset nostril shadows',mergeGeometries(nostrils),earMat);

  const mouthY=-.083,lipMetadata=[],lipPieces=[];
  for(const upper of [true,false]) {
    const metadata=[];
    const g=geometryGrid(36,5,(u,v)=>{
      const x=(u*2-1)*s.lipW,envelope=Math.pow(Math.max(0,1-(x/s.lipW)**2),.70);
      const cupid=upper?.0009*Math.exp(-(((Math.abs(x)-.008)/.006)**2)):0;
      const seam=mouthY+.0015*(x/s.lipW)**2;
      const thickness=(upper?.0029:.0035)*envelope+cupid;
      const y=seam+(upper?1:-1)*v*thickness;
      metadata.push({x,v,upper,envelope,seam});
      return [x,y,surface(x,y,s)+.0014+.0008*Math.sin(v*Math.PI)*envelope];
    },upper);lipPieces.push(g);lipMetadata.push(metadata);
  }
  lipPieces.forEach((g,i)=>{
    const lip=mesh(`HANNEST integrated ${i?'lower':'upper'} lip`,g,lipMat,(x,y,z,t,index)=>{
      const d=lipMetadata[i][index];let ny=y;
      if(t==='slightSmile') ny+=.0060*(Math.abs(x)/s.lipW)**2;
      if(t==='mouthOpen') ny+=(d.upper?.0018:-.0045)*d.envelope;
      return [x,ny,z+surface(x,ny,s)-surface(x,y,s)];
    });lip.userData.faceMorphRole='lip';
  });
  const cavityGeo=geometryGrid(36,5,(u,v)=>{
    const x=(u*2-1)*s.lipW*.95,h=.00065*Math.sqrt(Math.max(0,1-(x/(s.lipW*.95))**2)),y=mouthY+(v*2-1)*h+.0015*(x/s.lipW)**2;
    return [x,y,surface(x,y,s)+.0015];
  },true);
  const cavity=mesh('HANNEST subtle mouth opening',cavityGeo,seamMat,(x,y,z,t)=>{
    let ny=y;
    if(t==='slightSmile')ny+=.0060*(Math.abs(x)/s.lipW)**2;
    if(t==='mouthOpen') {const h=Math.sqrt(Math.max(0,1-(x/(s.lipW*.95))**2));ny+=(y>mouthY+.0015*(x/s.lipW)**2?.0018:-.0045)*h;}
    return [x,ny,z+surface(x,ny,s)-surface(x,y,s)];
  });cavity.userData.faceMorphRole='mouth';

  const earPieces=[],innerPieces=[];
  for(const sign of [-1,1]) {
    const ear=new THREE.SphereGeometry(1,20,14);ear.scale(.022,.035,.015);ear.translate(sign*(s.width+.005),-.013,-.003);earPieces.push(ear);
    const p=[];for(let i=0;i<=14;i++){const a=-1.3+i/14*4.5;p.push([sign*(s.width+.010+.010*Math.cos(a)),-.010+.022*Math.sin(a),.011]);}
    innerPieces.push(tube(p,.002,18,6));
  }
  mesh('HANNEST anatomical ears',mergeGeometries(earPieces),plainSkin);
  mesh('HANNEST ear folds',mergeGeometries(innerPieces),earMat);
  const hairGeo=geometryGrid(56,22,(u,v)=>{
    const a=u*Math.PI*2,front=Math.max(0,Math.cos(a));
    const boundary=variant==='sua'?1.52-.50*front:1.60-.52*front+.12*Math.sin(a*2+.7)*front;
    const theta=v*boundary;
    const ridge=.0020*Math.sin(a*8+theta*5)*(Math.sin(theta)**1.2);
    const sweep=.0028*Math.sin(a*3-theta*3)*front*Math.sin(theta);
    return [(s.width+.008+ridge)*Math.sin(theta)*Math.sin(a),(s.height+.011)*Math.cos(theta)+sweep,(s.depth+.008+ridge)*Math.sin(theta)*Math.cos(a)];
  });
  mesh('HANNEST continuous sculpted hair cap',hairGeo,hairMat);
  if(variant!=='sua') {
    const locks=[],ridges=[];
    // Swept, tapered volumes share a cap. Unlike spherical locks, each strand
    // has a continuous curved root-to-tip silhouette and a shallow ridge.
    for(const side of [-1,1])for(let i=0;i<4;i++) {
      const p=side<0?
        [[.030-i*.009,.184-i*.002,-.018+i*.006],[.009-i*.020,.171-i*.007,.063+i*.004],[-.055-i*.014,.128-i*.014,.116-i*.004],[-.087-i*.011,.082-i*.018,.113-i*.011]]:
        [[.019+i*.011,.183-i*.004,-.025+i*.003],[.056+i*.009,.158-i*.006,.062+i*.003],[.095+i*.007,.119-i*.012,.101-i*.009],[.111+i*.007,.077-i*.018,.086-i*.015]];
      const path=new THREE.CatmullRomCurve3(p.map((a,j)=>new THREE.Vector3(a[0],a[1]+(j<2?.004:0),a[2]+(j? .009:.002))));const width=.029-i*.0018;
      locks.push(geometryGrid(8,14,(u,v)=>{
        const centre=path.getPoint(v),tangent=path.getTangent(v).normalize(),normal=new THREE.Vector3(centre.x,.065,centre.z+.02).normalize();
        const across=new THREE.Vector3().crossVectors(tangent,normal).normalize();normal.crossVectors(across,tangent).normalize();
        const taper=(.45+.55*Math.sin(v*Math.PI))*(1-v)**.36,a=u*Math.PI*2;
        const result=centre.addScaledVector(across,Math.cos(a)*width*taper).addScaledVector(normal,Math.sin(a)*.012*taper);
        return result.toArray();
      }));
      if(i%2===0)ridges.push(tube(path.getPoints(12).slice(1,-1).map(p=>[p.x,p.y+.002,p.z+.007]),.00060,12,5));
    }
    mesh('HANNEST flowing tapered hair volumes',mergeGeometries(locks),hairMat);
    const strandMat=mat('HANNEST subtle hair ridge',variant==='player'?0x363a3d:0x423a34,.89);
    mesh('HANNEST hair ridge geometry',mergeGeometries(ridges),strandMat);
  }
  if(variant==='sua') {
    const braid=geometryGrid(14,34,(u,v)=>{
      const a=u*Math.PI*2,r=.020*(1-v*.45),x=.115+.032*Math.sin(v*2.6),y=.02-v*.35,z=-.040+v*.088;
      const weave=1+.10*Math.cos(a*3-v*Math.PI*12);
      return [x+Math.cos(a)*r*weave,y,z+Math.sin(a)*r*weave];
    });mesh('HANNEST continuous braided ponytail',braid,hairMat);
  }
  const glasses=options.glasses ?? variant!=='sua';
  if(glasses) {
    const frameMat=mat('HANNEST slender warm metal frame',0x655d4b,.48,{metalness:.32}),pieces=[];
    for(const sign of [-1,1]) {
      const frame=new THREE.TorusGeometry(.037,.00155,6,44);frame.scale(1,.88,1);frame.translate(sign*s.eyeX,s.eyeY+.001,.137);pieces.push(frame);
      pieces.push(tube([[sign*(s.eyeX+.034),.038,.133],[sign*(s.width+.009),.024,.058],[sign*(s.width+.017),.003,-.024]],.00145,14,5));
    }
    pieces.push(tube([[-.025,s.eyeY+.006,.139],[0,s.eyeY+.011,.148],[.025,s.eyeY+.006,.139]],.00145,10,5));
    const frames=mesh('HANNEST thin round glasses',mergeGeometries(pieces),frameMat);frames.castShadow=false;
  }

  // Names and indices are discovered from the created meshes. No code relies
  // on a target's numeric position; a loaded face can reorder its dictionary.
  const names=Object.keys(head.morphTargetDictionary);
  const state={clock:0,nextBlink:1.2+rand()*2.8,blinkAge:-1,blinkSkew:rand()*.014,mouth:0,gazeX:0,gazeY:0,blinks:0};
  const targets=Object.fromEntries(names.map(name=>[name,0]));
  function update(options={}) {
    if(disposed)return;
    const dt=clamp(finite(options.dt,1/60),0,.10);state.clock+=dt;
    if(state.blinkAge<0 && state.clock>=state.nextBlink) {state.blinkAge=0;state.blinks++;}
    let left=0,right=0;
    if(state.blinkAge>=0) {
      state.blinkAge+=dt;
      const blink=age=>age<=0||age>=.17?0:Math.sin(age/.17*Math.PI)**2;
      left=blink(state.blinkAge);right=blink(state.blinkAge-state.blinkSkew);
      if(state.blinkAge>.17+state.blinkSkew) {state.blinkAge=-1;state.nextBlink=state.clock+2.0+rand()*3.8;}
    }
    const expression=['neutral','friendly','curious','thinking'].includes(options.expression)?options.expression:'neutral';
    const smooth=1-Math.exp(-10*dt);
    const sleeping=options.sleeping===true;
    const desired={blinkLeft:sleeping?1:left,blinkRight:sleeping?1:right,slightSmile:sleeping?0:expression==='friendly'?.75:.05,surprise:sleeping?0:expression==='curious'?.60:0,focus:sleeping?0:expression==='thinking'?.75:0,mouthOpen:!sleeping&&options.speaking===true?.65:0};
    state.mouth+=(desired.mouthOpen-state.mouth)*(1-Math.exp(-16*dt));
    // A bounded opening while audio is playing, without invented phonemes or
    // random syllables. Audio cancellation/end passes false to close it.
    desired.mouthOpen=state.mouth;
    for(const name of names)targets[name]=name.startsWith('blink')?desired[name]:targets[name]+(finite(desired[name])-targets[name])*smooth;
    for(const part of morphMeshes)for(const [name,index]of Object.entries(part.morphTargetDictionary))part.morphTargetInfluences[index]=clamp(finite(targets[name]),0,1);
    state.gazeX+=(clamp(finite(options.lookYaw),-.62,.62)/.62*.0052-state.gazeX)*smooth;
    // Match the body's +X head rotation: positive pitch looks downward.
    state.gazeY+=(-clamp(finite(options.lookPitch),-.28,.28)/.28*.0026-state.gazeY)*smooth;
    for(const eye of eyes) {
      const dx=state.gazeX,dy=state.gazeY*(1-targets[`blink${eye.side}`]);
      // A rigid iris patch moves over a curved socket. Moving it backwards
      // made the inner eye sink beneath the sclera when looking at the nose.
      // Sample the patch centre/cardinals/corners and preserve front clearance.
      let clearance=0;
      for(const [x,y]of [[0,0],[-.010,0],[.010,0],[0,-.009],[0,.009],[-.007,-.007],[-.007,.007],[.007,-.007],[.007,.007]]) {
        clearance=Math.max(clearance,surface(eye.cx+x+dx,eye.cy+y+dy,s)-surface(eye.cx+x,eye.cy+y,s));
      }
      eye.iris.position.set(dx,dy,clearance);
    }
  }
  function diagnostics() {
    let vertices=0,triangles=0,meshCount=0;group.traverse(o=>{if(o.isMesh){meshCount++;vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
    return {kind:variant,disposed,scale:SCALE,meshCount,geometryCount:geometries.size,materialCount:materials.size,vertices,triangles,morphNames:[...names],weights:{...targets},blinkCount:state.blinks,gaze:[state.gazeX,state.gazeY],speechOpening:state.mouth};
  }
  function dispose() {if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();group.clear();}
  const face={group,mesh:head,morphNames:[...names],update,dispose,diagnostics};
  group.userData.humanFace=face;update({dt:0});return face;
}
