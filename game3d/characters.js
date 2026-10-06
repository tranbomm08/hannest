/* Original HANNEST character adapter: approved human prototypes use connected
 * weighted SkinnedMesh garments, native per-actor AnimationMixer clips and
 * independent facial vertex morphs. The earlier rigid mesh factory remains a
 * named fallback below; it is not described as a skinned asset.
 * Metres; +Y up, +Z forward. Keep createActor/animateActor/disposeActor/
 * disposeCharacters compatibility. Mouth opening is an actual-audio envelope,
 * not phoneme lip synchronisation. No Palia meshes, images or animations.
 */
import * as THREE from './vendor/three.module.js';
import {createHumanBody} from './human-body.js';
import {createHumanFace} from './human-face.js';

const geometryPool = new Map();
const materialPool = new Map();
const liveActors = new Set();
let actorSerial=0;
let fabricTexture;
const footWorldBounds=new THREE.Box3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function fabricBump() {
  if(fabricTexture) return fabricTexture;
  const size=32, pixels=new Uint8Array(size*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    pixels[y*size+x]=128+Math.round(Math.sin(x*Math.PI)*16+((x+y)%2?22:-22));
  }
  fabricTexture=new THREE.DataTexture(pixels,size,size,THREE.RedFormat);
  fabricTexture.wrapS=fabricTexture.wrapT=THREE.RepeatWrapping;
  fabricTexture.repeat.set(24,24);fabricTexture.needsUpdate=true;
  return fabricTexture;
}

function material(name, color, roughness = .82, metalness = 0) {
  if (!materialPool.has(name)) {
    const mat=new THREE.MeshStandardMaterial({name, color, roughness, metalness});
    if(/hoodie|cardigan|cotton|trousers|canvas|ribbed|ivory trousers/.test(name)) {
      mat.bumpMap=fabricBump();mat.bumpScale=.0014;
    }
    materialPool.set(name,mat);
  }
  return materialPool.get(name);
}

const palette = () => ({
  skin: material('warm ivory skin', 0xf1c5a7, .77),
  blush: material('warm cheek tint', 0xe5a693, .88),
  ear: material('inner ear', 0xd9a08d, .85),
  hair: material('soft dark brown hair', 0x30251f, .88),
  strand: material('hair strand highlights', 0x48362b, .9),
  eye: material('eye whites', 0xfff8ef, .48),
  eyeSoft: material('soft ivory sclera', 0xeee4d8, .66),
  iris: material('brown iris', 0x50332b, .53),
  pupil: material('pupils and brows', 0x241b1b, .62),
  shine: material('eye catchlights', 0xffffff, .22),
  lip: material('soft rose lips', 0xc59384, .83),
  lipLine: material('closed lip seam', 0x8d6155, .89),
  mouthInside: material('mouth interior', 0x694941, .95),
  noseShade: material('nostril shadow', 0xb58b77, .9),
  cream: material('cream hoodie', 0xf2e8d4, .94),
  creamShade: material('hoodie seams', 0xddceb3, .95),
  white: material('cotton tee', 0xfff9ea, .95),
  denim: material('blue grey trousers', 0x667887, .97),
  denimSeam: material('denim seams', 0x8797a2, .97),
  pink: material('rose cardigan', 0xd89199, .95),
  pinkEdge: material('rose ribbed cuffs', 0xc27e87, .96),
  blue: material('periwinkle cardigan', 0x7693ba, .95),
  blueEdge: material('blue ribbed cuffs', 0x5e7ea7, .96),
  ivory: material('ivory trousers and tote', 0xe9dfcc, .96),
  ivorySeam: material('ivory seams', 0xcbbfa8, .96),
  beige: material('sand trousers', 0xc7b69b, .96),
  beigeSeam: material('sand trouser seams', 0xa89a83, .96),
  sage: material('sage canvas crossbody', 0x6f7f66, .95),
  sageEdge: material('sage seams', 0x53634e, .96),
  bagBlue: material('navy canvas backpack', 0x354d69, .96),
  bagBlueEdge: material('backpack trim', 0x263c56, .9),
  sole: material('sneaker sole', 0xd9d3c9, .86),
  shoe: material('pale sneaker leather', 0xf5f0e5, .77),
  lace: material('white laces', 0xffffff, .93),
  metal: material('warm brass hardware', 0xb69a65, .45, .36),
  glasses: material('slender round glasses', 0x403e3b, .46, .38),
  map: material('map paper', 0xf6edce, .96),
  mapGreen: material('map gardens', 0x9aad83, .96),
  mapPink: material('map buildings', 0xdbaa94, .96),
  mapRoad: material('map paths', 0xddd0ad, .96),
  mapPin: material('map destination', 0xc87876, .88),
});

function primitive(key, make) {
  if (!geometryPool.has(key)) geometryPool.set(key, make());
  return geometryPool.get(key);
}
function sphere() { return primitive('sphere', () => new THREE.SphereGeometry(1, 20, 14)); }
function torus() { return primitive('torus', () => new THREE.TorusGeometry(1, .09, 8, 36)); }

function mesh(parent, geo, mat, pos = [0,0,0], scale = [1,1,1], rotation = [0,0,0]) {
  const object = new THREE.Mesh(geo, mat);
  object.position.set(...pos); object.scale.set(...scale); object.rotation.set(...rotation);
  object.castShadow = !/round glasses/.test(mat.name); object.receiveShadow = true;
  parent.add(object); return object;
}
const ellipsoid = (parent, mat, pos, scale, rotation) => mesh(parent, sphere(), mat, pos, scale, rotation);

function curve(parent, mat, points, radius = .005, segments = 18) {
  const path = new THREE.CatmullRomCurve3(points.map(p => V(...p)));
  const g = new THREE.TubeGeometry(path, segments, radius, 5, false);
  g.userData.characterTemporary = true;
  return mesh(parent, g, mat);
}

// Each rigid body part becomes one mesh per material, instead of drawing every
// small finger, hair lock and seam separately. Original temporary geometry goes.
function batch(group) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix();
    const source = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    source.applyMatrix4(child.matrix);
    const key = child.material.uuid;
    if (!buckets.has(key)) buckets.set(key, {material: child.material, geometry: []});
    buckets.get(key).geometry.push(source);
    if (child.geometry.userData.characterTemporary || child.geometry.userData.characterOwned) child.geometry.dispose();
    group.remove(child);
  }
  for (const {material: mat, geometry: pieces} of buckets.values()) {
    const count = pieces.reduce((n, g) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv=new Float32Array(count*2);
    let offset = 0, uvOffset=0;
    for (const g of pieces) {
      pos.set(g.attributes.position.array, offset);
      normal.set(g.attributes.normal.array, offset);
      if(g.attributes.uv) uv.set(g.attributes.uv.array,uvOffset);
      else for(let i=0;i<g.attributes.position.count;i++) {
        uv[uvOffset+i*2]=g.attributes.position.getX(i)*2;
        uv[uvOffset+i*2+1]=g.attributes.position.getY(i)*2;
      }
      offset += g.attributes.position.array.length;
      uvOffset += g.attributes.position.count*2;
      g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    g.computeBoundingSphere(); g.userData.characterOwned = true;
    mesh(group, g, mat);
  }
}

function joint(parent, name, position) {
  const g = new THREE.Group(); g.name = name; g.position.set(...position); parent.add(g); return g;
}

function profileGeometry(rings, sides = 32) {
  const curveProfile=new THREE.CatmullRomCurve3(rings.map(([y,w,d])=>V(w,y,d)),false,'catmullrom',.25);
  const yMin=rings[0][0], yMax=rings.at(-1)[0];
  rings=curveProfile.getPoints((rings.length-1)*3).map(p=>[p.y,Math.max(0,p.x),Math.max(0,p.z)]);
  const positions = [], indices = [], uv=[];
  rings.forEach(([y, width, depth], i) => {
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      positions.push(Math.sin(a) * width, y, Math.cos(a) * depth);
      uv.push(j/sides,(y-yMin)/(yMax-yMin));
      if (i && j < sides) {
        const b = i*(sides+1)+j, a0=b-sides-1;
        indices.push(a0,a0+1,b,b,a0+1,b+1);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices); g.computeVertexNormals(); g.userData.characterTemporary=true; return g;
}

const FACE={
  player:{width:.137,height:.171,depth:.122,jaw:.25,eyeX:.054,eyeY:.024,eyeW:.031,eyeH:.0105,browW:.031,browArch:.0045,bridge:.014,tip:.018,lipW:.032},
  sua:{width:.130,height:.172,depth:.120,jaw:.34,eyeX:.052,eyeY:.027,eyeW:.0325,eyeH:.0118,browW:.03,browArch:.0065,bridge:.011,tip:.0145,lipW:.033},
  minsu:{width:.142,height:.169,depth:.124,jaw:.18,eyeX:.055,eyeY:.025,eyeW:.0305,eyeH:.0103,browW:.029,browArch:.0025,bridge:.016,tip:.019,lipW:.034},
};
const gaussian=(x,y,cx,cy,sx,sy)=>Math.exp(-.5*((x-cx)**2/sx**2+(y-cy)**2/sy**2));

function faceRelief(x,y,kind) {
  const s=FACE[kind];
  return (kind==='minsu'?.003:.004)*(gaussian(x,y,-.071,-.037,.032,.026)+gaussian(x,y,.071,-.037,.032,.026))
    -.001*(gaussian(x,y,-s.eyeX,s.eyeY,.023,.018)+gaussian(x,y,s.eyeX,s.eyeY,.023,.018))
    +s.bridge*gaussian(x,y,0,-.002,.0105,.045)
    +s.tip*gaussian(x,y,0,-.031,.014,.012)
    +.004*(gaussian(x,y,-.012,-.039,.009,.007)+gaussian(x,y,.012,-.039,.009,.007))
    +.003*gaussian(x,y,0,-.074,.04,.016)
    +.003*gaussian(x,y,0,-.122,.031,.019);
}

function faceSurface(x,y,kind) {
  const s=FACE[kind], yn=y/s.height;
  const jaw=yn<-.2?1+(yn+.2)*s.jaw:1;
  const shape=Math.max(0,1-(x/(s.width*jaw))**2-yn**2);
  return s.depth*.93*Math.sqrt(shape)+faceRelief(x,y,kind);
}

function headGeometry(kind) {
  const g = new THREE.SphereGeometry(1, 64, 48);
  const p = g.attributes.position;
  for (let i=0;i<p.count;i++) {
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const s=FACE[kind], jaw=y<-.2?1+(y+.2)*s.jaw:1;
    const px=x*s.width*jaw, py=y*s.height;
    p.setXYZ(i,px,py,z*s.depth*(z>0?.93:1)+(z>0?faceRelief(px,py,kind):0));
  }
  g.computeVertexNormals(); return g;
}

function hairCapGeometry(kind) {
  const p=[], index=[], sides=40, rings=18;
  for(let i=0;i<=rings;i++) for(let j=0;j<=sides;j++) {
    const a=j/sides*Math.PI*2;
    const theta=(kind==='sua'?1.53-.48*Math.cos(a):1.52-.44*Math.cos(a))*i/rings;
    p.push(.15*Math.sin(theta)*Math.sin(a), .173*Math.cos(theta), .13*Math.sin(theta)*Math.cos(a));
    if(i&&j<sides) {
      const b=i*(sides+1)+j, a0=b-sides-1;
      index.push(a0,b,a0+1,b,b+1,a0+1);
    }
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setIndex(index); g.computeVertexNormals(); return g;
}

function almondGeometry(kind,sign) {
  const s=FACE[kind], positions=[],uv=[],indices=[], cols=24,rows=8;
  for(let i=0;i<=cols;i++) {
    const u=i/cols*2-1, dx=u*s.eyeW;
    const h=s.eyeH*Math.pow(Math.max(0,1-u*u),.62);
    for(let j=0;j<=rows;j++) {
      const v=j/rows*2-1, dy=v*h*(v<0?.82:1)+sign*dx*.07;
      const z=faceSurface(sign*s.eyeX+dx,s.eyeY+dy,kind)+.0018+.0012*(1-u*u)*(1-v*v);
      positions.push(dx,dy,z);uv.push(i/cols,j/rows);
      if(i&&j<rows) {
        const b=i*(rows+1)+j, a=b-rows-1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function lipSmileMorph(group, width, kind) {
  for(const part of group.children) {
    if(!part.isMesh) continue;
    const geometry=part.geometry,positions=geometry.attributes.position;
    const smiling=positions.clone();
    for(let i=0;i<positions.count;i++) {
      const x=positions.getX(i),y=positions.getY(i),lift=.0065*clamp(Math.abs(x)/width,0,1)**2;
      smiling.setY(i,y+lift);
      smiling.setZ(i,positions.getZ(i)+faceSurface(x,-.074+y+lift,kind)-faceSurface(x,-.074+y,kind));
    }
    const target=geometry.clone();target.setAttribute('position',smiling);target.computeVertexNormals();
    geometry.morphAttributes.position=[smiling];geometry.morphAttributes.normal=[target.attributes.normal.clone()];
    target.dispose();part.updateMorphTargets();
  }
}

function face(head, kind, m, rig) {
  const s=FACE[kind];
  mesh(head,primitive(`head ${kind}`,()=>headGeometry(kind)),m.skin);
  for(const sign of [-1,1]) {
    ellipsoid(head,m.skin,[sign*s.width,-.015,-.005],[.017,.034,.016]);
    ellipsoid(head,m.ear,[sign*(s.width+.009),-.014,.002],[.006,.021,.006]);
    ellipsoid(head,m.noseShade,[sign*.008,-.04,faceSurface(sign*.008,-.04,kind)+.0005],[.0028,.0011,.001]);
  }
  rig.eyes=[];rig.gaze=[];rig.brows=[];
  for(const sign of [-1,1]) {
    const x=sign*s.eyeX, eye=joint(head,'almond eye',[x,s.eyeY,0]);
    mesh(eye,primitive(`almond ${kind} ${sign}`,()=>almondGeometry(kind,sign)),m.eyeSoft);
    const gaze=joint(eye,'iris gaze',[0,0,faceSurface(x,s.eyeY,kind)+.005]);
    ellipsoid(gaze,m.iris,[0,0,0],[.0085,.0088,.0018]);
    ellipsoid(gaze,m.pupil,[0,0,.0015],[.0038,.0057,.0008]);
    ellipsoid(gaze,m.shine,[-.0028,.0035,.0022],[.0017,.0018,.0005]);
    batch(gaze);rig.gaze.push(gaze);
    const upper=[],lower=[];
    for(let i=0;i<=8;i++) {
      const u=i/8*2-1, dx=u*s.eyeW;
      const h=s.eyeH*Math.pow(Math.max(0,1-u*u),.62),slant=sign*dx*.07;
      upper.push([dx,h+slant,faceSurface(x+dx,s.eyeY+h+slant,kind)+.0029]);
      lower.push([dx,-h*.82+slant,faceSurface(x+dx,s.eyeY-h*.82+slant,kind)+.0024]);
    }
    curve(eye,m.skin,upper,.0022,24);
    const lashes=(sign<0?upper.slice(0,7):upper.slice(2)).map(p=>[p[0],p[1],p[2]+.0021]);
    curve(eye,m.hair,lashes,kind==='sua'?.0008:.00065,18);
    curve(eye,m.skin,lower,.0016,24);
    batch(eye);rig.eyes.push(eye);
    const baseY=.064+(kind==='sua'?.003:0),baseZ=faceSurface(x,baseY,kind)+.002;
    const brow=joint(head,'expressive brow',[x,baseY,baseZ]);
    const browPoints=[];
    for(let i=0;i<=4;i++) {
      const u=i/4*2-1, dx=u*s.browW,dy=s.browArch*(1-u*u)-sign*u*.002;
      browPoints.push([dx,dy,faceSurface(x+dx,baseY+dy,kind)+.002-baseZ]);
    }
    curve(brow,m.hair,browPoints,kind==='sua'?.0017:.0021,18);batch(brow);rig.brows.push(brow);
    brow.userData.baseY=baseY;
  }
  rig.mouth=joint(head,'expressive closed lips',[0,-.074,0]);
  const lipPoints=(vertical=0)=>[-1,-.5,0,.5,1].map(u=> {
    const x=u*s.lipW,y=.0014*u*u+vertical*Math.sqrt(Math.max(0,1-u*u));
    return [x,y,faceSurface(x,-.074+y,kind)+.0022];
  });
  rig.mouth.upper=joint(rig.mouth,'upper lip',[0,0,0]);
  rig.mouth.lower=joint(rig.mouth,'lower lip',[0,0,0]);
  rig.mouth.line=joint(rig.mouth,'closed lip seam',[0,0,0]);
  curve(rig.mouth.upper,m.lip,lipPoints(.0015),.0013,22);
  curve(rig.mouth.lower,m.lip,lipPoints(-.0021),.00155,22);
  curve(rig.mouth.line,m.lipLine,lipPoints(0),.00075,22);
  [rig.mouth.upper,rig.mouth.lower,rig.mouth.line].forEach(batch);
  [rig.mouth.upper,rig.mouth.lower,rig.mouth.line].forEach(g=>lipSmileMorph(g,s.lipW,kind));
  rig.mouth.open=joint(rig.mouth,'speaking mouth',[0,-.0005,faceSurface(0,-.074,kind)+.0014]);
  ellipsoid(rig.mouth.open,m.mouthInside,[0,0,0],[s.lipW*.84,.011,.0012]);
  ellipsoid(rig.mouth.open,m.eye,[0,.005,.0014],[s.lipW*.59,.0018,.0005]);
  batch(rig.mouth.open);rig.mouth.open.visible=false;
  if(kind==='minsu') {
    for(const sign of [-1,1]) {
      mesh(head,torus(),m.glasses,[sign*.055,.026,.131],[.046,.037,.046]);
      curve(head,m.glasses,[[sign*.097,.035,.129],[sign*.137,.022,.056],[sign*.144,.004,-.015]],.0024,12);
    }
    curve(head,m.glasses,[[-.012,.028,.134],[0,.035,.148],[.012,.028,.134]],.0024,8);
  }
  rig.face={expression:'neutral',speaking:false};
  batch(head);
}

function hair(head, kind, m) {
  mesh(head,primitive(`hair cap ${kind}`,()=>hairCapGeometry(kind)),m.hair);
  // Soft overlapping locks provide a rounded silhouette and flowing fringe.
  if(kind==='sua') {
    for(const side of [-1,1]) {
      ellipsoid(head,m.hair,[side*.106,.091,.045],[.044,.084,.048],[.08,0,side*.27]);
      curve(head,m.hair,[[side*.019,.162,.039],[side*.072,.14,.084],[side*.112,.079,.10],[side*.134,.011,.073]],.016,24);
      curve(head,m.strand,[[side*.023,.166,.054],[side*.074,.146,.098],[side*.12,.082,.108],[side*.14,.014,.071]],.0034,24);
      curve(head,m.hair,[[side*.098,.076,-.01],[side*.151,-.009,.003],[side*.145,-.097,.021],[side*.17,-.135,.015]],.022,22);
      curve(head,m.strand,[[side*.12,.063,.008],[side*.16,-.013,.019],[side*.151,-.106,.031]],.0032,18);
    }
  } else {
    const locks=kind==='minsu'?
      [[-.096,.127,.055,.058,.06,.28],[-.053,.155,.066,.059,.061,.43],[.022,.144,.081,.052,.062,-.27],[.076,.124,.067,.049,.057,-.45],[.115,.081,.042,.03,.064,-.2]]:
      [[-.103,.109,.052,.046,.052,.18],[-.062,.142,.071,.057,.06,.28],[-.018,.148,.078,.048,.059,-.11],[.037,.13,.083,.049,.06,-.37],[.093,.099,.052,.034,.063,-.45]];
    locks.forEach(([x,y,z,w,h,rz])=>ellipsoid(head,m.hair,[x,y,z],[w,h,.043],[0,0,rz]));
    for(let i=0;i<5;i++) {
      const x=(i-2)*.045;
      const shift=kind==='minsu'?.033:-.028;
      curve(head,m.strand,[[x*.6,.17,.012],[x+shift,.156,.069],[x+shift*.7,.12,.114],[x+shift*.3,.073,.107]],.0033,18);
    }
  }
  for(const sign of [-1,1]) {
    ellipsoid(head,m.hair,[sign*.129,.044,-.02],[.035,.092,.077],[.1,0,sign*.16]);
    curve(head,m.strand,[[sign*.098,.137,-.04],[sign*.149,.061,-.02],[sign*.136,-.039,.03]],.004,15);
  }
  if(kind==='sua') {
    ellipsoid(head,m.hair,[.078,.038,-.118],[.103,.103,.085]);
    // Alternating plait lobes are actual three-dimensional geometry.
    for(let i=0;i<7;i++) {
      const y=-.037-i*.047, x=.14+Math.sin(i*1.5)*.011;
      ellipsoid(head,m.hair,[x-.012,y,.008+i*.017],[.029,.041,.031],[.15,0,-.4]);
      ellipsoid(head,m.strand,[x+.013,y-.019,.014+i*.017],[.028,.038,.029],[.15,0,.4]);
    }
    ellipsoid(head,m.hair,[.145,-.37,.116],[.019,.045,.023],[.3,0,.14]);
    mesh(head,torus(),m.pinkEdge,[.147,-.336,.113],[.021,.012,.021],[Math.PI/2,0,0]);
    curve(head,m.hair,[[-.104,.123,.086],[-.137,.051,.08],[-.128,-.065,.092],[-.114,-.09,.082]],.012,20);
  }
  batch(head);
}

function hands(parent, side, m) {
  const hand=joint(parent,side<0?'left hand':'right hand',[0,-.225,0]);
  ellipsoid(hand,m.skin,[0,-.025,.005],[.032,.048,.023]);
  for(let i=0;i<4;i++) {
    const x=(i-1.5)*.013;
    const length=[.042,.052,.049,.038][i];
    curve(hand,m.skin,[[x,-.049,.006],[x,-.049-length*.55,.008],[x,-.049-length,.014]],.0072,8);
    ellipsoid(hand,m.skin,[x,-.049-length,.014],[.0072,.0072,.0072]);
  }
  curve(hand,m.skin,[[side*.021,-.019,.003],[side*.044,-.036,.017],[side*.046,-.057,.027]],.009,8);
  batch(hand); return hand;
}

function cardigan(torso, m, main, edge) {
  // Separated fronts leave a visible tee panel; collar, hem and buttons are mesh.
  ellipsoid(torso,m.white,[0,-.008,.085],[.13,.221,.037]);
  for(const side of [-1,1]) {
    ellipsoid(torso,main,[side*.12,-.005,.035],[.088,.233,.102],[0,0,side*.025]);
    curve(torso,edge,[[side*.088,.212,.114],[side*.048,.11,.134],[side*.046,-.12,.138],[side*.058,-.213,.111]],.012,22);
    curve(torso,edge,[[side*.04,-.222,.10],[side*.14,-.223,.093],[side*.18,-.199,.052]],.012,14);
    curve(torso,edge,[[side*.10,-.074,.137],[side*.157,-.074,.116]],.004,8);
    curve(torso,edge,[[side*.12,-.076,.135],[side*.12,-.141,.126],[side*.15,-.141,.116]],.003,12);
    for(let i=0;i<4;i++) curve(torso,edge,[[side*(.062+i*.015),-.21,.113],[side*(.062+i*.015),-.193,.118]],.0016,4);
  }
  for(let i=0;i<4;i++) ellipsoid(torso,m.metal,[-.049,.06-i*.077,.145],[.008,.008,.004]);
}

function hoodie(torso, m) {
  mesh(torso, profileGeometry([[-.25,0,0],[-.245,.155,.085],[-.19,.172,.111],[-.08,.186,.119],[.09,.19,.108],[.19,.168,.09],[.233,.113,.071],[.24,0,0]]),m.cream);
  ellipsoid(torso,m.creamShade,[0,-.213,.01],[.17,.036,.107]);
  // Folded hood rests behind the neck with an open, curved neckline in front.
  ellipsoid(torso,m.cream,[0,.207,-.055],[.146,.087,.115]);
  curve(torso,m.creamShade,[[-.093,.232,.059],[-.07,.164,.12],[0,.13,.131],[.071,.166,.12],[.095,.228,.061]],.019,26);
  curve(torso,m.cream,[[-.086,.223,.063],[-.064,.166,.129],[0,.147,.139],[.064,.17,.129],[.09,.228,.063]],.013,26);
  for(const side of [-1,1]) {
    curve(torso,m.white,[[side*.061,.163,.148],[side*.066,.09,.143],[side*.06,.012,.135]],.0032,15);
    ellipsoid(torso,m.metal,[side*.06,.004,.135],[.004,.009,.004]);
    curve(torso,m.creamShade,[[side*.027,-.108,.135],[side*.107,-.094,.137],[side*.136,-.129,.113]],.0028,12);
  }
  curve(torso,m.creamShade,[[-.1,-.115,.128],[-.074,-.177,.14],[0,-.18,.15],[.076,-.176,.139],[.1,-.114,.129]],.003,20);
  for(let i=0;i<9;i++) curve(torso,m.creamShade,[[(i-4)*.028,-.226,.11],[(i-4)*.028,-.206,.115]],.0018,4);
}

function shoes(leg, side, m, trim) {
  const foot=joint(leg,'sneaker',[0,-.366,0]);
  ellipsoid(foot,m.sole,[0,-.058,.043],[.071,.031,.145]);
  ellipsoid(foot,m.shoe,[0,-.027,.047],[.065,.052,.134]);
  ellipsoid(foot,m.shoe,[0,.003,-.043],[.052,.067,.072]);
  ellipsoid(foot,trim,[side*.054,-.019,.006],[.009,.019,.065]);
  curve(foot,m.sole,[[-.055,-.042,.12],[0,-.036,.174],[.055,-.042,.12]],.0024,14);
  for(let i=0;i<4;i++) curve(foot,m.lace,[[-.034,.018,.037+i*.019],[0,.031,.044+i*.017],[.034,.018,.037+i*.019]],.0026,8);
  curve(foot,m.sole,[[-.054,-.048,-.029],[0,-.051,-.087],[.054,-.048,-.029]],.0024,14);
  batch(foot); return foot;
}

function crossbody(torso,m) {
  const bag=joint(torso,'sage crossbody',[-.192,-.167,.087]);
  ellipsoid(bag,m.sage,[0,0,0],[.108,.117,.06],[0,0,-.14]);
  ellipsoid(bag,m.sageEdge,[0,.03,.042],[.11,.07,.016],[0,0,-.14]);
  curve(bag,m.sageEdge,[[-.083,.045,.061],[-.079,-.068,.058],[.004,-.098,.061],[.084,-.065,.048]],.003,20);
  ellipsoid(bag,m.metal,[.001,.015,.063],[.012,.008,.003]);
  batch(bag);
  curve(torso,m.sage,[[.168,.219,.019],[.106,.13,.128],[-.018,-.03,.155],[-.136,-.176,.14],[-.23,-.205,.073]],.016,28);
  curve(torso,m.sageEdge,[[.16,.214,.03],[.102,.13,.144],[-.021,-.03,.171],[-.136,-.176,.155]],.002,24);
}

function tote(torso,m) {
  const bag=joint(torso,'cream tote',[-.257,-.21,-.018]);
  ellipsoid(bag,m.ivory,[0,0,0],[.084,.145,.047]);
  curve(bag,m.ivorySeam,[[-.067,.105,.026],[-.055,-.116,.029],[0,-.134,.036],[.062,-.105,.027]],.0028,20);
  curve(torso,m.ivory,[[-.26,-.086,.002],[-.24,.15,.03],[-.175,.226,.017],[-.135,.171,-.045],[-.216,-.242,-.06]],.01,30);
  curve(torso,m.ivorySeam,[[-.258,-.083,.015],[-.236,.15,.043],[-.175,.232,.03],[-.135,.17,-.032]],.0016,20);
  batch(bag);
}

function backpack(torso,m) {
  const pack=joint(torso,'blue backpack',[0,-.01,-.137]);
  ellipsoid(pack,m.bagBlue,[0,0,-.055],[.153,.218,.081]);
  ellipsoid(pack,m.bagBlueEdge,[0,-.09,-.117],[.135,.091,.023]);
  curve(pack,m.bagBlueEdge,[[-.115,.14,-.119],[0,.20,-.127],[.116,.14,-.119],[.128,-.147,-.115]],.004,28);
  curve(pack,m.bagBlueEdge,[[-.037,.211,-.04],[0,.247,-.046],[.037,.211,-.04]],.008,12);
  ellipsoid(pack,m.metal,[.116,.123,-.129],[.007,.012,.004]);
  for(const side of [-1,1]) curve(torso,m.bagBlue,[[side*.114,-.19,-.088],[side*.188,.04,-.008],[side*.144,.219,.064],[side*.115,.164,.114],[side*.126,-.166,.12]],.013,26);
  batch(pack);
}

function paperMap(torso,m) {
  const map=joint(torso,'campus map',[0,-.175,.285]);
  mesh(map, primitive('map board',()=>new THREE.BoxGeometry(.26,.186,.004)),m.map);
  for(const [x,y,sx,sy] of [[-.082,.04,.042,.042],[.053,.027,.058,.023],[-.012,-.053,.056,.027],[.085,-.04,.031,.034]]) {
    mesh(map,primitive('map building',()=>new THREE.BoxGeometry(1,1,1)),m.mapPink,[x,y,.003],[sx,sy,.001]);
  }
  for(const [x,y,sx,sy] of [[-.073,-.03,.042,.033],[.024,.051,.03,.047]]) {
    mesh(map,primitive('map garden',()=>new THREE.BoxGeometry(1,1,1)),m.mapGreen,[x,y,.003],[sx,sy,.001]);
  }
  curve(map,m.mapRoad,[[-.115,-.065,.005],[-.031,.007,.005],[.035,.007,.005],[.111,.069,.005]],.005,16);
  curve(map,m.mapRoad,[[-.018,-.082,.005],[-.019,.0,.005],[-.043,.082,.005]],.0035,12);
  ellipsoid(map,m.mapPin,[.082,.046,.008],[.008,.012,.004]);
  curve(map,m.ivorySeam,[[0,-.091,.004],[0,.091,.004]],.0013,4);
  map.rotation.x=-.04; batch(map); return map;
}

function createLegacyActor(kind = 'player') {
  if(!['player','sua','minsu'].includes(kind)) throw new Error(`Unknown HANNEST actor ${kind}`);
  const m=palette(), actor=new THREE.Group(); actor.name=`HANNEST ${kind}`;
  if(kind==='sua') m.skin=material('Su-a peach complexion',0xf3cbb4,.77);
  if(kind==='minsu') m.skin=material('Min-su warm complexion',0xe7b897,.77);
  actor.userData.kind=kind; actor.userData.heightMetres=kind==='sua'?1.7:1.72;
  actor.userData.originalMesh=true;
  actor.userData.animationType='articulated rigid mesh groups';
  const rig={}; actor.userData.rig=rig;
  rig.body=joint(actor,'body root',[0,.812,0]);
  const outfit=kind==='player'?m.cream:kind==='sua'?m.pink:m.blue;
  const edge=kind==='player'?m.creamShade:kind==='sua'?m.pinkEdge:m.blueEdge;
  const trouser=kind==='player'?m.denim:kind==='sua'?m.ivory:m.beige;
  const seam=kind==='player'?m.denimSeam:kind==='sua'?m.ivorySeam:m.beigeSeam;
  ellipsoid(rig.body,trouser,[0,.008,0],[.152,.119,.098]);
  rig.torso=joint(rig.body,'torso',[0,.231,0]);
  if(kind==='player') hoodie(rig.torso,m); else cardigan(rig.torso,m,outfit,edge);
  ellipsoid(rig.torso,m.skin,[0,.252,0],[.054,.093,.05]);
  rig.head=joint(rig.torso,'head',[0,.468,.006]);
  face(rig.head,kind,m,rig); hair(rig.head,kind,m);
  rig.arms=[]; rig.forearms=[]; rig.hands=[]; rig.legs=[]; rig.shins=[]; rig.feet=[];
  for(const side of [-1,1]) {
    const arm=joint(rig.torso,`${side<0?'left':'right'} shoulder`,[side*.212,.166,0]);
    mesh(arm,profileGeometry([[-.233,0,0],[-.218,.041,.038],[-.192,.052,.048],[-.11,.063,.06],[-.035,.067,.063],[.018,.055,.051],[.038,0,0]],24),outfit);
    curve(arm,edge,[[side*.053,-.116,.032],[side*.06,-.142,.004],[side*.041,-.16,-.028]],.0026,10);
    const forearm=joint(arm,'elbow',[0,-.203,0]);
    mesh(forearm,profileGeometry([[-.22,0,0],[-.208,.042,.04],[-.18,.049,.045],[-.08,.056,.05],[0,.055,.05],[.03,0,0]],24),outfit);
    ellipsoid(forearm,edge,[0,-.185,.002],[.047,.027,.045]);
    for(let i=0;i<4;i++) curve(forearm,edge,[[-.03+i*.02,-.176,.04],[-.027+i*.019,-.2,.033]],.0016,4);
    const hand=hands(forearm,side,m);
    batch(arm);batch(forearm);
    rig.arms.push(arm);rig.forearms.push(forearm);rig.hands.push(hand);
    const thigh=joint(rig.body,`${side<0?'left':'right'} hip`,[side*.087,-.009,0]);
    mesh(thigh,profileGeometry([[-.386,0,0],[-.37,.059,.057],[-.345,.071,.067],[-.30,.073,.072],[-.18,.079,.078],[-.04,.086,.081],[.045,.082,.078],[.065,0,0]],24),trouser);
    curve(thigh,seam,[[side*.075,-.021,.005],[side*.078,-.16,.008],[side*.072,-.3,.012]],.0023,16);
    curve(thigh,seam,[[side*-.043,-.067,.067],[side*-.069,-.103,.067]],.0022,8);
    const shin=joint(thigh,'knee',[0,-.348,0]);
    mesh(shin,profileGeometry([[-.345,0,0],[-.33,.045,.044],[-.306,.056,.058],[-.274,.065,.064],[-.17,.064,.064],[-.04,.064,.063],[.018,.065,.061],[.035,0,0]],24),trouser);
    ellipsoid(shin,trouser,[0,-.286,0],[.063,.023,.064]);
    curve(shin,seam,[[side*.062,-.038,.012],[side*.061,-.13,.009],[side*.055,-.27,.022]],.002,18);
    for(let i=0;i<2;i++) curve(shin,seam,[[-.042,-.251-i*.018,.041],[0,-.265-i*.01,.065],[.043,-.244-i*.02,.041]],.002,12);
    const foot=shoes(shin,side,m,kind==='minsu'?m.blue:m.ivory);
    foot.userData.localBounds=new THREE.Box3();
    for(const piece of foot.children) {
      if(!piece.isMesh) continue;
      piece.geometry.computeBoundingBox();foot.userData.localBounds.union(piece.geometry.boundingBox);
    }
    batch(thigh);batch(shin);
    rig.legs.push(thigh);rig.shins.push(shin);rig.feet.push(foot);
  }
  if(kind==='player') crossbody(rig.torso,m);
  if(kind==='sua') {tote(rig.torso,m);rig.map=paperMap(rig.torso,m);}
  if(kind==='minsu') backpack(rig.torso,m);
  batch(rig.torso);batch(rig.body);
  actor.userData.baseBodyY=rig.body.position.y;
  actor.userData.gestureTime=0; actor.userData.previousGesture='idle';
  liveActors.add(actor); animateActor(actor,{time:0,moving:false});
  return actor;
}

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const smooth=(value,target,rate,dt)=>value+(target-value)*(1-Math.exp(-rate*dt));
const easing=t=>t*t*(3-2*t);

function motionState(kind) {
  const serial=actorSerial++,phase=({player:.45,sua:2.13,minsu:4.29}[kind])+serial*.371;
  const pair=()=>[new THREE.Vector3(),new THREE.Vector3()];
  return {initialized:false,phase,moving:0,speech:0,blink:1,blinkClock:0,blinkProgress:-1,
    nextBlink:1.3+(phase*1.137)%2.8,blinkCount:0,smile:0,browLift:0,browTilt:0,browAsym:0,eyeOpen:1,gazeX:0,gazeY:0,
    targets:{torso:new THREE.Vector3(),head:new THREE.Vector3(),arms:pair(),forearms:pair(),hands:pair(),legs:pair(),shins:pair(),feet:pair()}};
}

function blendRotation(node,target,alpha) {
  node.rotation.x+=(target.x-node.rotation.x)*alpha;
  node.rotation.y+=(target.y-node.rotation.y)*alpha;
  node.rotation.z+=(target.z-node.rotation.z)*alpha;
}

function animateLegacyActor(actor, options = {}) {
  const rig=actor?.userData?.rig;if(!rig||actor.userData.characterDisposed) return;
  const time=Number.isFinite(options.time)?options.time:0;
  const dt=Number.isFinite(options.dt)?clamp(options.dt,0,.1):1/60;
  const kind=actor.userData.kind,state=actor.userData.motionState||(actor.userData.motionState=motionState(kind));
  const pose=state.targets,phase=state.phase;
  const gestures=['idle','wave','receive','nod','think','give','point'];
  const gesture=gestures.includes(options.gesture)?options.gesture:'idle';
  const expressions=['neutral','friendly','curious','thinking'];
  const expression=expressions.includes(options.expression)?options.expression:'neutral';
  const speaking=options.speaking===true;
  rig.face.expression=expression;rig.face.speaking=speaking;
  if(actor.userData.previousGesture!==gesture) {actor.userData.gestureTime=0;actor.userData.previousGesture=gesture;}
  actor.userData.gestureTime+=dt;const t=actor.userData.gestureTime;
  state.moving=smooth(state.moving,options.moving?1:0,8,dt);
  state.speech=smooth(state.speech,speaking?1:0,16,dt);
  const stride=Math.sin(time*7.2+phase*.18)*.38*state.moving;
  rig.body.position.y=actor.userData.baseBodyY+Math.abs(Math.sin(time*7.2))*.014*state.moving;
  pose.torso.set(.035*state.moving,Math.sin(time*.83+phase)*.012*(1-state.moving)+Math.sin(time*7.2)*.028*state.moving,Math.sin(time*7.2)*.025*state.moving);
  const yaw=Number.isFinite(options.headYaw)?clamp(options.headYaw,-.62,.62):Math.sin(time*.67+phase)*.034;
  const pitch=Number.isFinite(options.headPitch)?clamp(options.headPitch,-.28,.28):Math.sin(time*1.05+phase)*.008;
  pose.head.set(pitch,yaw,Math.sin(time*.81+phase)*.009);
  for(let i=0;i<2;i++) {
    const side=i===0?-1:1;
    pose.arms[i].set(-stride*side,0,side*.055);
    pose.forearms[i].set(-.085,0,0);pose.hands[i].set(.06,0,0);
    pose.legs[i].set(stride*side,0,0);
    pose.shins[i].set(Math.max(0,-stride*side)*.85,0,0);
    pose.feet[i].set(-Math.max(0,-stride*side)*.36,0,0);
  }
  if(kind==='sua') {
    pose.arms[0].set(-.32,0,.21);pose.forearms[0].x=-1.12;pose.hands[0].z=-.08;
    pose.arms[1].set(-.32,0,-.21);pose.forearms[1].x=-1.12;pose.hands[1].z=.08;
  }
  if(gesture==='wave') {
    pose.arms[1].set(-.18,0,1.15);
    pose.forearms[1].set(-.12,0,1.7+Math.sin(t*6)*.12);
    pose.hands[1].set(0,Math.sin(t*6)*.22,-.1+Math.sin(t*6)*.1);pose.head.z=-.025;
  } else if(gesture==='receive') {
    for(let i=0;i<2;i++) {
      pose.arms[i].set(-.36,0,i===0?.18:-.18);pose.forearms[i].set(-1.02,0,0);pose.hands[i].set(-.25,0,0);
    }
    pose.head.x+=.055;
  } else if(gesture==='nod') {
    pose.head.x+=Math.sin(t*5.2)*.082;pose.torso.x+=Math.sin(t*5.2)*.009;
  } else if(gesture==='think') {
    pose.arms[1].set(-.35,0,-1.15);pose.forearms[1].set(-1.4,0,-.6);pose.hands[1].set(.05,0,.78);
    pose.head.x+=.055;pose.head.z=-.016;
  } else if(gesture==='give') {
    pose.arms[1].set(-.62,0,.08);pose.forearms[1].set(-.92,0,0);pose.hands[1].set(-.24,0,0);
    pose.torso.x+=.022;pose.head.x+=.025;
  } else if(gesture==='point') {
    // Open-hand directional gesture; the arm points along the actor's +Z axis.
    pose.arms[1].set(-1.05,0,.12);pose.forearms[1].set(-.40,0,0);pose.hands[1].set(-.15,0,-.035);
    pose.head.x-=.018;
  }
  const alpha=state.initialized?1-Math.exp(-11*dt):1;
  blendRotation(rig.torso,pose.torso,alpha);blendRotation(rig.head,pose.head,alpha);
  for(const key of ['arms','forearms','hands','legs','shins','feet']) for(let i=0;i<2;i++) blendRotation(rig[key][i],pose[key][i],alpha);
  const desired={
    neutral:{smile:.15,browLift:0,browTilt:0,browAsym:0,eyeOpen:1,gazeX:0,gazeY:0},
    friendly:{smile:1,browLift:-.0006,browTilt:.025,browAsym:0,eyeOpen:.88,gazeX:0,gazeY:0},
    curious:{smile:.24,browLift:.0045,browTilt:.08,browAsym:.002,eyeOpen:1.05,gazeX:.001,gazeY:.001},
    thinking:{smile:0,browLift:-.0015,browTilt:-.10,browAsym:0,eyeOpen:.9,gazeX:-.0025,gazeY:-.0013},
  }[expression];
  for(const key of Object.keys(desired)) state[key]=smooth(state[key],desired[key],9,dt);
  state.blinkClock+=dt;
  if(state.blinkProgress<0&&state.blinkClock>=state.nextBlink) state.blinkProgress=0;
  if(state.blinkProgress>=0) {
    state.blinkProgress+=dt;const bt=state.blinkProgress;
    state.blink=bt<.10?1-.95*easing(clamp(bt/.10,0,1)):.05+.95*easing(clamp((bt-.10)/.14,0,1));
    if(bt>=.24) {
      state.blink=1;state.blinkProgress=-1;state.blinkCount++;
      const interval=state.blinkCount%5===0?.20:3.2+(Math.sin(phase*2.3+state.blinkCount*1.67)*.5+.5)*2.7;
      state.nextBlink=state.blinkClock+interval;
    }
  }
  const gazeX=clamp(state.gazeX+yaw*.006,-.0042,.0042),gazeY=clamp(state.gazeY-pitch*.006,-.003,.003);
  rig.eyes.forEach((eye,i)=> {
    eye.scale.y=Math.max(.045,state.blink*state.eyeOpen);
    rig.gaze[i].position.x=smooth(rig.gaze[i].position.x,gazeX,12,dt);
    rig.gaze[i].position.y=smooth(rig.gaze[i].position.y,gazeY,12,dt);
    const side=i===0?-1:1,brow=rig.brows[i];
    brow.position.y=brow.userData.baseY+state.browLift+(i===1?state.browAsym:0);
    brow.rotation.z=side*state.browTilt;
  });
  const openness=state.speech*(.0045+.004*(.5+.5*Math.sin(time*11+phase)));
  rig.mouth.scale.x=1+state.smile*.055;
  for(const group of [rig.mouth.upper,rig.mouth.lower,rig.mouth.line]) for(const part of group.children) {
    if(part.morphTargetInfluences) part.morphTargetInfluences[0]=state.smile;
  }
  rig.mouth.upper.position.y=openness*.30;rig.mouth.lower.position.y=-openness*.65;
  rig.mouth.open.scale.y=Math.max(.001,openness/.022);rig.mouth.open.visible=openness>.00015;
  state.initialized=true;
  // Cached local bounds keep the supporting sole on the actor's ground plane.
  let lowest=Infinity;
  for(const foot of rig.feet) {
    foot.updateWorldMatrix(true,false);footWorldBounds.copy(foot.userData.localBounds).applyMatrix4(foot.matrixWorld);lowest=Math.min(lowest,footWorldBounds.min.y);
  }
  const groundY=actor.matrixWorld.elements[13],verticalScale=actor.matrixWorld.elements[5];
  if(Number.isFinite(lowest)&&Math.abs(verticalScale)>1e-6) rig.body.position.y+=(groundY-lowest)/verticalScale;
}

function disposeLegacyActor(actor) {
  if(!actor||actor.userData.characterDisposed) return;
  actor.traverse(object=> {
    if(object.isMesh&&object.geometry.userData.characterOwned) object.geometry.dispose();
  });
  actor.removeFromParent(); actor.userData.characterDisposed=true; liveActors.delete(actor);
}

function disposeLegacyCharacters() {
  for(const actor of [...liveActors]) disposeActor(actor);
  for(const geometry of geometryPool.values()) geometry.dispose(); geometryPool.clear();
  for(const mat of materialPool.values()) mat.dispose(); materialPool.clear();
  fabricTexture?.dispose(); fabricTexture=undefined;
}

// The original native hero passed the actual visual gate and independent rig QA.
// The legacy factory stays callable for unsupported kinds and recovery previews.
const HUMAN_CHARACTERS_APPROVED=true;
const nativeActors=new Set();let nativeSerial=0;
const nativeKinds=new Set(['player','sua','minsu','teacher','hana','jiun','daeun','jun','seoyeon','yuna']);
const nativeExpressions=new Set(['neutral','friendly','curious','thinking']);
const activityGestures={sit:'idle',read:'read',write:'write',organize:'organize',prepare:'prepare',sleep:'sleep',makeup:'makeup',sweep:'sweep'};
const number=(value,fallback=0)=>Number.isFinite(value)?value:fallback;

export function createActor(kind='player',options={}){
  if(!HUMAN_CHARACTERS_APPROVED||!nativeKinds.has(kind))return createLegacyActor(kind);
  const seed=++nativeSerial*7919+Array.from(kind).reduce((sum,c)=>sum+c.charCodeAt(0),0);
  const actor=createHumanBody(kind,{seed,outfit:options.outfit||'casual'}),body=actor.userData.humanBody;
  const faceKind={teacher:'minsu',hana:'sua',jiun:'player',daeun:'sua',jun:'minsu',seoyeon:'sua',yuna:'sua'}[kind]||kind;
  let face;
  try{
    let skinned=false;actor.traverse(object=>{if(object.isSkinnedMesh&&object.geometry.attributes.skinIndex&&object.geometry.attributes.skinWeight)skinned=true;});
    if(!skinned||!body?.mixer||!actor.userData.rig?.head)throw new Error('Native human rig is incomplete');
    face=createHumanFace(faceKind,{seed,...(['daeun','seoyeon'].includes(kind)?{glasses:true}:{})});actor.userData.rig.head.add(face.group);
    actor.userData.humanFace=face;
    if(typeof body.getInfo!=='function')body.getInfo=()=>body.diagnostics();
    actor.userData.humanCharacter={body,face,previousWorld:null,actions:new Set(),disposed:false};
    actor.userData.rig.face={mesh:face.mesh,morphNames:[...face.morphNames],expression:'neutral',speaking:false};
    actor.userData.kind=kind;actor.userData.heightMetres=1.73;
    actor.userData.originalMesh=true;actor.userData.animationType='native SkinnedMesh skeletal clips and facial vertex morphs';
    nativeActors.add(actor);return actor;
  }catch(error){face?.dispose();body?.dispose();throw error;}
}
export function animateActor(actor,options={}){
  const record=actor?.userData?.humanCharacter;
  if(!record)return animateLegacyActor(actor,options);
  if(record.disposed||actor.userData.characterDisposed)return;
  const dt=THREE.MathUtils.clamp(number(options.dt,1/60),0,.10);
  const world=actor.getWorldPosition(new THREE.Vector3());
  let measured=0;
  if(record.previousWorld&&dt>0){const distance=Math.hypot(world.x-record.previousWorld.x,world.z-record.previousWorld.z);if(distance<=Math.max(.35,dt*10))measured=distance/dt;}
  record.previousWorld=world;
  // A blocked held key is not walking. Main supplies accepted displacement;
  // callers without that field use the measured horizontal displacement.
  const speed=THREE.MathUtils.clamp(number(options.speed,measured),0,8);
  const activity=Object.hasOwn(activityGestures,options.activity)?options.activity:null;
  const gesture=options.gesture&&options.gesture!=='idle'?options.gesture:activityGestures[activity]||'idle';
  const seated=typeof options.seated==='boolean'?options.seated:['sit','read','write','sleep','makeup'].includes(activity)?true:undefined;
  const headYaw=THREE.MathUtils.clamp(number(options.headYaw),-.62,.62),headPitch=THREE.MathUtils.clamp(number(options.headPitch),-.28,.28);
  const expression=nativeExpressions.has(options.expression)?options.expression:'neutral',speaking=options.speaking===true;
  const bodyOptions={...options,dt,speed,moving:speed>.03,running:options.running===true,gesture,headYaw,headPitch};
  // Keep a manual Sit/Stand native state when the caller supplied no seating
  // instruction. Classroom movement passes an explicit boolean itself.
  if(seated!==undefined)bodyOptions.seated=seated;else delete bodyOptions.seated;
  record.body.update(bodyOptions);
  const head=actor.userData.rig.head;
  record.face.update({time:number(options.time),dt,expression,speaking,sleeping:activity==='sleep',lookYaw:headYaw-number(head.rotation.y),lookPitch:headPitch-number(head.rotation.x)});
  Object.assign(actor.userData.rig.face,{expression,speaking});
}
export function playActorAction(actor,name,{onMarker,onFinish}={}){
  const record=actor?.userData?.humanCharacter;
  if(!record||record.disposed||actor.userData.characterDisposed||typeof record.body.playAction!=='function')return {supported:false,cancel(){}};
  for(const pending of [...record.actions])pending.cancel();
  const token={active:true,cancel(){if(!token.active)return;token.active=false;handle?.cancel();record.actions.delete(token);}};
  let handle;record.actions.add(token);
  handle=record.body.playAction(name,{
    onMarker:(name,details={})=>{if(token.active&&!record.disposed&&!actor.userData.characterDisposed&&typeof onMarker==='function')onMarker({name,clip:details.clip,time:details.time});},
    onFinish:()=>{if(!token.active||record.disposed||actor.userData.characterDisposed)return;token.active=false;record.actions.delete(token);if(typeof onFinish==='function')onFinish();},
  });
  if(!handle?.supported){token.active=false;record.actions.delete(token);return {supported:false,cancel(){}};}
  return {supported:true,cancel:token.cancel};
}
export function disposeActor(actor){
  const record=actor?.userData?.humanCharacter;
  if(!record)return disposeLegacyActor(actor);
  if(record.disposed)return;record.disposed=true;
  for(const pending of [...record.actions])pending.cancel();record.actions.clear();
  record.face.dispose();record.body.dispose();actor.userData.characterDisposed=true;nativeActors.delete(actor);
}
export function disposeCharacters(){
  for(const actor of [...nativeActors])disposeActor(actor);nativeActors.clear();disposeLegacyCharacters();
}
