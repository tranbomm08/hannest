import * as THREE from './vendor/three.module.js';

// Original HANNEST anatomy/garment prototype: real blended skinning and native clips.
// The hoodie sleeve ports and trouser crotch share vertices with their parent surfaces.
// This is a procedural game mesh, not a sculpt, scanned human or converted concept image.
export function createHumanBody(kind = 'player', {seed = 0,outfit='casual'} = {}) {
  outfit=['uniform','formal','casual'].includes(outfit)?outfit:'casual';
  const root = new THREE.Group(); root.name = `hannest-human-${kind}`;
  const bones = {}, joints = [], boneIndices = {}, ownedGeometries = new Set(), ownedMaterials = new Set();
  const palette = {cloth:0xf0e5ce,rib:0xd9ceb6,pants:0x65717d,seam:0x525f6c,skin:0xecc1a6,
    shoe:0xece9df,sole:0xcac7bc,bag:0x849279,strap:0x697760,metal:0x9e9279,ink:0x3a5149};
  if (kind === 'sua' || kind === 'hana') palette.cloth = 0xd3a3a5;
  if (kind === 'minsu' || kind === 'jiun') palette.cloth = 0x6d92a8;
  if (kind === 'sua' || kind === 'hana') palette.skin = 0xf1c7af;
  if (kind === 'minsu' || kind === 'jiun') palette.skin = 0xe3b395;
  if (kind === 'teacher') {palette.cloth=0xa99c81;palette.pants=0x4f5b62;}
  const classmates={daeun:[0xe1bd75,0xf1c7af],jun:[0x98b18a,0xe3b395],seoyeon:[0xa9a1c3,0xf1c7af],yuna:[0xc9879e,0xf1c7af]};
  if(classmates[kind]){[palette.cloth,palette.skin]=classmates[kind];palette.rib=palette.cloth;}
  if(outfit==='uniform')Object.assign(palette,{cloth:0x293c59,rib:0x26364e,pants:0x354258,seam:0x293449,ink:0xd4c494});
  if(outfit==='formal')Object.assign(palette,{cloth:0x4b565f,rib:0x46515b,pants:0x303941,seam:0x293138,shoe:0x393633,sole:0x252422,ink:0xc4b694});
  if(outfit==='casual'&&kind==='hana')Object.assign(palette,{cloth:0x995964,rib:0x824a57,pants:0x617687});
  root.userData.outfit=outfit;
  let disposed = false;
  function bone(name, parent, x, y, z) {
    const object = new THREE.Bone(); object.name = name; object.position.set(x,y,z);
    parent.add(object); bones[name] = object; boneIndices[name] = joints.length; joints.push(object); return object;
  }
  const hips = bone('Hips',root,0,.905,0);
  const spine = bone('Spine',hips,0,.15,0), chest=bone('Chest',spine,0,.235,0);
  const neck=bone('Neck',chest,0,.165,0), head=bone('Head',neck,0,.14,0);
  const limb = {};
  for (const [side,label] of [[-1,'Left'],[1,'Right']]) {
    const clavicle=bone(`${label}Clavicle`,chest,side*.135,.10,0);
    const upper=bone(`${label}UpperArm`,clavicle,side*.100,-.007,0);
    const fore=bone(`${label}ForeArm`,upper,side*.065,-.283,0);
    const hand=bone(`${label}Hand`,fore,side*.060,-.270,0);
    const thigh=bone(`${label}Thigh`,hips,side*.088,0,0);
    const shin=bone(`${label}Shin`,thigh,side*.004,-.432,0);
    const foot=bone(`${label}Foot`,shin,side*.002,-.369,0);
    const fingers=[];
    for (let i=0;i<4;i++) {
      const length=[.078,.095,.089,.073][i],x=side*(-.026+i*.017);
      const proximal=bone(`${label}Finger${i}Proximal`,hand,x,-.078,.003);
      const distal=bone(`${label}Finger${i}Distal`,proximal,0,-length*.55,0);
      fingers.push({proximal,distal,length,x});
    }
    const thumb=bone(`${label}Thumb`,hand,-side*.032,-.035,.004);
    const thumbTip=bone(`${label}ThumbTip`,thumb,-side*.022,-.027,.008);
    limb[label]={side,clavicle,upper,fore,hand,thigh,shin,foot,fingers,thumb,thumbTip};
  }
  root.updateMatrixWorld(true);
  const positions=[], indices=[], skinIndices=[], skinWeights=[], materialGroups=[];
  const materialList=[];
  function mat(name,color,roughness=.86) {
    const value=new THREE.MeshStandardMaterial({name,color,roughness,metalness:name==='hardware'?.2:0});
    materialList.push(value);ownedMaterials.add(value);return materialList.length-1;
  }
  const mats={cloth:mat(outfit==='uniform'?'school-blazer':outfit==='formal'?'teacher-blazer':'cotton-hoodie',palette.cloth),rib:mat('rib-cuffs',palette.rib),pants:mat('woven-trousers',palette.pants),
    skin:mat('hands-neck',palette.skin),shoe:mat('sneaker-upper',palette.shoe),sole:mat('sneaker-sole',palette.sole),
    bag:mat('sage-canvas',palette.bag),strap:mat('woven-strap',palette.strap),metal:mat('hardware',palette.metal),ink:mat('hannest-emblem',palette.ink)};
  if(outfit!=='casual'){mats.shirt=mat('school-shirt-and-collar',0xf5f2e9);mats.tie=mat('school-necktie',outfit==='formal'?0x72434c:0x647787);mats.lapel=mat('tailored-jacket-lapels',outfit==='formal'?0x65717a:0x425775);}
  function section(material,make) {const start=indices.length;make();if(indices.length>start)materialGroups.push({start,count:indices.length-start,materialIndex:material});}
  const clamp=THREE.MathUtils.clamp, mix=(a,b,t)=>a+(b-a)*t, smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  function weights(parts) {
    const valid=Object.entries(parts).filter(([,value])=>value>1e-6).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const total=valid.reduce((n,[,value])=>n+value,0);assertFinite(total);
    return {j:valid.map(([name])=>boneIndices[name]),w:valid.map(([,value])=>value/total)};
  }
  function assertFinite(value) {if(!Number.isFinite(value)||value<=0)throw new Error('Invalid body skin weight.');}
  function torsoWeight(y) {
    if(y>1.42){const t=smooth((y-1.42)/.09);return weights({Chest:1-t,Neck:t});}
    if(y>1.15){const t=smooth((y-1.15)/.20);return weights({Spine:1-t,Chest:t});}
    const t=smooth((y-.92)/.23);return weights({Hips:1-t,Spine:t});
  }
  function armWeight(label,y) {
    if(y>1.285){const t=smooth((1.405-y)/.12);return weights({Chest:(1-t)*.65,[`${label}Clavicle`]:(1-t)*.35,[`${label}UpperArm`]:t});}
    if(y>1.04){const t=smooth((1.19-y)/.15);return weights({[`${label}UpperArm`]:1-t,[`${label}ForeArm`]:t});}
    const t=smooth((.90-y)/.10);return weights({[`${label}ForeArm`]:1-t,[`${label}Hand`]:t});
  }
  function legWeight(label,y) {
    if(y>.765){const t=smooth((.91-y)/.145);return weights({Hips:1-t,[`${label}Thigh`]:t});}
    if(y>.39){const t=smooth((.55-y)/.16);return weights({[`${label}Thigh`]:1-t,[`${label}Shin`]:t});}
    const t=smooth((.17-y)/.11);return weights({[`${label}Shin`]:1-t,[`${label}Foot`]:t});
  }
  function vertex(x,y,z,weight=torsoWeight(y)) {
    const id=positions.length/3;positions.push(x,y,z);
    for(let i=0;i<4;i++){skinIndices.push(weight.j[i]??0);skinWeights.push(weight.w[i]??0);}return id;
  }
  function face(a,b,c){indices.push(a,b,c);}
  function stitch(a,b,reverse=false) {
    if(a.length!==b.length)throw new Error('Body surface ring mismatch.');
    for(let i=0;i<a.length;i++){const n=(i+1)%a.length;
      if(reverse){face(a[i],b[n],a[n]);face(a[i],b[i],b[n]);}
      else{face(a[i],a[n],b[n]);face(a[i],b[n],b[i]);}
    }
  }
  function cap(ring,point,weight,reverse=false){const center=vertex(...point,weight);for(let i=0;i<ring.length;i++){const n=(i+1)%ring.length;reverse?face(ring[n],ring[i],center):face(ring[i],ring[n],center);}}
  function ellipseRing(x,y,z,rx,rz,n,weight,phase=0) {
    const ring=[];for(let i=0;i<n;i++){const a=phase+i*Math.PI*2/n;ring.push(vertex(x+Math.sin(a)*rx,y,z+Math.cos(a)*rz,weight));}return ring;
  }
  function tubePath(points,radii,weightFn,n=10) {
    const rings=[];
    for(let i=0;i<points.length;i++) {
      const p=new THREE.Vector3(...points[i]),next=new THREE.Vector3(...points[Math.min(i+1,points.length-1)]),prev=new THREE.Vector3(...points[Math.max(0,i-1)]);
      const direction=next.sub(prev).normalize(),u=new THREE.Vector3(0,0,1);
      if(Math.abs(direction.dot(u))>.95)u.set(1,0,0);
      u.addScaledVector(direction,-u.dot(direction)).normalize();const v=new THREE.Vector3().crossVectors(direction,u).normalize();
      const ring=[];for(let j=0;j<n;j++){const a=j*Math.PI*2/n,point=p.clone().addScaledVector(u,Math.cos(a)*radii[i]).addScaledVector(v,Math.sin(a)*radii[i]);ring.push(vertex(point.x,point.y,point.z,weightFn(i,point)));}
      if(rings.length)stitch(rings.at(-1),ring);rings.push(ring);
    }
    cap(rings[0],points[0],weightFn(0,new THREE.Vector3(...points[0])),true);
    cap(rings.at(-1),points.at(-1),weightFn(points.length-1,new THREE.Vector3(...points.at(-1))));return rings;
  }
  // Torso rings have intentionally shaped chest, waist, underarm and collar volumes.
  section(mats.cloth,()=>{
    const levels=[[.875,.172,.117],[.925,.184,.132],[1.04,.178,.135],[1.16,.188,.139],[1.28,.218,.140],[1.38,.235,.124],[1.435,.198,.095],[1.468,.081,.072]];
    const rings=levels.map(([y,rx,rz])=>{
      const ring=[];for(let i=0;i<32;i++){const a=i*Math.PI/16,front=Math.cos(a),fold=Math.sin(a*5+y*31)*.0022;
        ring.push(vertex(Math.sin(a)*(rx+fold),y,front*(rz+fold)+(front>0?.008:0),torsoWeight(y)));}return ring;
    });
    for(let r=0;r<rings.length-1;r++)for(let i=0;i<32;i++) {
      if((r===4||r===5)&&((i>=6&&i<10)||(i>=22&&i<26)))continue;
      const n=(i+1)%32;face(rings[r][i],rings[r][n],rings[r+1][n]);face(rings[r][i],rings[r+1][n],rings[r+1][i]);
    }
    for(const [label,start] of [['Right',6],['Left',22]]) {
      const side=limb[label].side,port=label==='Right'
        ?[...rings[4].slice(start,start+5),rings[5][start+4],rings[6][start+4],...rings[6].slice(start,start+4).reverse(),rings[5][start]]
        :[...rings[4].slice(start,start+5).reverse(),rings[5][start],rings[6][start],...rings[6].slice(start+1,start+5),rings[5][start+4]];
      let previous=port;
      const centers=[[side*.265,1.326,.080],[side*.279,1.260,.076],[side*.296,1.185,.068],[side*.307,1.112,.065],[side*.325,1.040,.063],[side*.344,.940,.056],[side*.359,.858,.049]];
      for(const [x,y,radius] of centers) {
        const ring=[];for(let i=0;i<12;i++){const a=-Math.PI/4-i*Math.PI/6;
          ring.push(vertex(x+side*Math.sin(a)*radius*.963,y+Math.sin(a)*radius*.27,Math.cos(a)*radius,armWeight(label,y)));}
        stitch(previous,ring,label==='Left');previous=ring;
      }
    }
    if(outfit==='casual'){
    // The hood is a softly draped open shell behind the neck, not a separate ball.
    const hood=[];
    for(let r=0;r<7;r++){const t=r/6,ring=[];for(let j=0;j<24;j++){const a=j*Math.PI/12;
      const rx=mix(.074,.122,Math.sin(t*Math.PI*.8)),rz=mix(.076,.101,t),y=1.445-Math.sin(t*Math.PI)*.068;
      ring.push(vertex(Math.sin(a)*rx,y+Math.cos(a)*.018,-.044-Math.cos(a)*rz,torsoWeight(y)));}
      if(r)stitch(hood.at(-1),ring,true);hood.push(ring);
    }
    // Raised kangaroo pocket sewn into the front cloth, with a curved upper edge.
    const pocket=[];
    for(let r=0;r<5;r++){const row=[];for(let c=0;c<13;c++){const x=(c/12-.5)*.235,y=.965+r*.029+Math.sin(c/12*Math.PI)*.01;
      row.push(vertex(x,y,.139+.025*Math.sin(c/12*Math.PI)*Math.sin((r+1)/6*Math.PI),torsoWeight(y)));}pocket.push(row);}
    for(let r=0;r<4;r++)for(let c=0;c<12;c++){face(pocket[r][c],pocket[r][c+1],pocket[r+1][c+1]);face(pocket[r][c],pocket[r+1][c+1],pocket[r+1][c]);}
    }
  });
  if(outfit!=='casual'){
    // Shirt, folded collars, lapels and tie are actual weighted cloth surfaces.
    const panel=points=>{let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1];}if(area<0)points=[...points].reverse();const ids=points.map(p=>vertex(...p,torsoWeight(p[1])));for(let i=1;i<ids.length-1;i++)face(ids[0],ids[i],ids[i+1]);};
    section(mats.shirt,()=>{
      panel([[-.065,1.433,.104],[.065,1.433,.104],[.075,1.355,.151],[.025,1.18,.155],[-.025,1.18,.155],[-.075,1.355,.151]]);
      panel([[-.055,1.457,.079],[-.008,1.435,.108],[-.042,1.380,.150],[-.087,1.418,.124]]);
      panel([[.008,1.435,.108],[.055,1.457,.079],[.087,1.418,.124],[.042,1.380,.150]]);
    });
    section(mats.lapel,()=>{for(const side of [-1,1]){
      const points=[[side*.061,1.428,.116],[side*.132,1.393,.134],[side*.094,1.327,.161],[side*.118,1.315,.162],[side*.021,1.163,.161]];
      panel(side<0?points.reverse():points);
    }});
    section(mats.tie,()=>{
      panel([[-.012,1.416,.124],[.012,1.416,.124],[.014,1.392,.148],[0,1.381,.157],[-.014,1.392,.148]]);
      panel([[-.010,1.389,.159],[.010,1.389,.159],[.017,1.232,.173],[0,1.213,.174],[-.017,1.232,.173]]);
    });
    section(mats.metal,()=>{for(const y of [1.105,1.038,.973])tubePath([[-.002,y,.147],[.003,y,.147]],[.0038,.0038],(_,p)=>torsoWeight(p.y),8);});
  }
  section(mats.rib,()=>{
    let a=ellipseRing(0,.868,0,.173,.119,32,torsoWeight(.87));
    for(const y of [.879,.895,.906]){const b=ellipseRing(0,y,0,.175,.121,32,torsoWeight(y));stitch(a,b);a=b;}
    for(const label of ['Left','Right']){
      const side=limb[label].side;let last=null;
      for(const [x,y] of [[side*.359,.859],[side*.363,.837],[side*.365,.826]]){
        const ring=[];for(let j=0;j<12;j++){const a=-Math.PI/4-j*Math.PI/6;ring.push(vertex(x+side*Math.sin(a)*.050*.963,y+Math.sin(a)*.050*.27,Math.cos(a)*.050,armWeight(label,y)));}
        if(last)stitch(last,ring,label==='Left');last=ring;
      }
    }
    if(outfit==='casual')for(const side of [-1,1])tubePath([[side*.031,1.455,.082],[side*.046,1.408,.135],[side*.043,1.342,.150],[side*.045,1.293,.153]],[.0045,.0045,.0045,.0055],(_,point)=>torsoWeight(point.y),8);
  });
  // One trouser surface splits at a shared crotch vertex into two tapered legs.
  section(mats.pants,()=>{
    const hipRings=[[.940,.159,.119],[.892,.168,.125],[.825,.168,.120],[.763,.156,.108]].map(([y,rx,rz])=>ellipseRing(0,y,0,rx,rz,32,weights({Hips:1})));
    for(let i=0;i<hipRings.length-1;i++)stitch(hipRings[i],hipRings[i+1],true);
    const crotchWeight=weights({Hips:.6,LeftThigh:.2,RightThigh:.2});
    const crotchBack=vertex(0,.760,-.058,crotchWeight),crotch=vertex(0,.747,0,crotchWeight),crotchFront=vertex(0,.760,.058,crotchWeight);
    for(const label of ['Right','Left']){
      const side=limb[label].side,base=hipRings.at(-1);
      let previous=label==='Right'?[...base.slice(0,17),crotchBack,crotch,crotchFront]:[...base.slice(16),base[0],crotchFront,crotch,crotchBack];
      const data=[[.723,.091,.075,.096],[.655,.092,.080,.100],[.567,.092,.074,.088],[.500,.093,.063,.073],[.455,.093,.058,.068],[.407,.093,.059,.069],[.313,.094,.065,.070],[.222,.094,.058,.062],[.137,.094,.049,.056],[.112,.094,.051,.058]];
      for(const [y,x,rx,rz] of data){
        const ring=[];for(let i=0;i<20;i++){const a=(i<=16?i*Math.PI/16:Math.PI+(i-16)*Math.PI/4)+(label==='Left'?Math.PI:0),crease=.0018*Math.cos(a*3+y*48);
          ring.push(vertex(side*x+Math.sin(a)*(rx+crease),y,Math.cos(a)*(rz+crease),legWeight(label,y)));}
        stitch(previous,ring,true);previous=ring;
      }
    }
  });
  section(mats.skin,()=>{
    const nr=[1.448,1.467,1.485].map(y=>ellipseRing(0,y,-.007,.038,.030,20,weights({Neck:.8,Head:.2})));
    stitch(nr[0],nr[1]);stitch(nr[1],nr[2]);
    for(const label of ['Left','Right']){
      const {side,fingers}=limb[label];
      let prior=null;
      for(const [y,rx,rz] of [[.845,.039,.025],[.805,.036,.022],[.772,.039,.023],[.747,.033,.020]]){
        const ring=ellipseRing(side*.36,y,.003,rx,rz,16,weights({[`${label}Hand`]:1}));if(prior)stitch(prior,ring,true);prior=ring;
      }
      cap(prior,[side*.36,.742,.003],weights({[`${label}Hand`]:1}),true);
      for(let i=0;i<4;i++){
        const {length,x}=fingers[i],points=[];
        for(let r=0;r<7;r++)points.push([side*.36+x,.752-length*r/6,.005+.003*Math.sin(r/6*Math.PI)]);
        tubePath(points,[.0098,.010,.0096,.009,.0083,.0068,.0026],r=>{
          const t=smooth((r/6-.33)/.45);return weights({[`${label}Finger${i}Proximal`]:1-t,[`${label}Finger${i}Distal`]:t});},10);
      }
      tubePath([[side*.36-side*.032,.795,.004],[side*.36-side*.042,.782,.008],[side*.36-side*.054,.765,.014],[side*.36-side*.062,.748,.020],[side*.36-side*.068,.739,.023]],
        [.013,.013,.011,.009,.003],r=>weights({[`${label}Thumb`]:1-smooth((r-1)/3),[`${label}ThumbTip`]:smooth((r-1)/3)}),10);
    }
  });
  // Sneaker lofts have rounded toes, heel cups and separate contact soles.
  function shoeSurface(label,sole) {
    const side=limb[label].side;let previous=null;
    const stations=sole?[[-.105,.050,.030,.027],[-.080,.061,.034,.032],[0,.065,.035,.035],[.115,.063,.034,.027],[.175,.045,.029,.021],[.191,.022,.025,.013]]:
      [[-.105,.034,.079,.022],[-.080,.056,.092,.072],[0,.055,.092,.078],[.075,.060,.077,.055],[.14,.052,.066,.032],[.18,.029,.056,.018],[.19,.007,.053,.006]];
    for(const [z,rx,y,ry] of stations){const ring=[];for(let j=0;j<20;j++){const a=j*Math.PI/10;ring.push(vertex(side*.094+Math.cos(a)*rx,y+Math.sin(a)*ry,z,weights({[`${label}Foot`]:1})));}
      if(previous)stitch(previous,ring);else cap(ring,[side*.094,y,z],weights({[`${label}Foot`]:1}),true);previous=ring;}
    const last=stations.at(-1);cap(previous,[side*.094,last[2],last[0]],weights({[`${label}Foot`]:1}));
  }
  section(mats.sole,()=>{shoeSurface('Left',true);shoeSurface('Right',true);});
  section(mats.shoe,()=>{
    for(const label of ['Left','Right']){
      shoeSurface(label,false);const side=limb[label].side;
      for(let r=0;r<4;r++)tubePath([[side*.094-.033,.14-r*.009,-.005+r*.023],[side*.094,.153-r*.013,.008+r*.021],[side*.094+.033,.14-r*.009,-.005+r*.023]],[.003,.003,.003],()=>weights({[`${label}Foot`]:1}),6);
    }
  });
  if(outfit==='casual'){section(mats.strap,()=>{
    // The strap is a real narrow ribbon, graded across chest and waist bones.
    const points=[[.198,1.41,.095],[.155,1.335,.149],[.081,1.245,.168],[-.025,1.135,.165],[-.126,1.035,.154],[-.218,.968,.148],[-.277,.965,.072],[-.292,.974,-.034],[-.230,.970,-.043]];
    const rows=[];for(const [x,y,z] of points){const row=[vertex(x-.014,y+.014,z,torsoWeight(y)),vertex(x+.014,y-.014,z+.005,torsoWeight(y))];
      if(rows.length){const a=rows.at(-1);face(a[0],row[1],a[1]);face(a[0],row[0],row[1]);}rows.push(row);}
    // Back section completes the shoulder loop.
    tubePath([[.198,1.41,-.048],[.18,1.30,-.14],[.04,1.15,-.15],[-.17,1.0,-.13],[-.23,.968,.055]],[.014,.014,.014,.014,.014],(_,p)=>torsoWeight(p.y),8);
  });
  section(mats.bag,()=>{
    let previous=null;
    for(const [y,rx,rz] of [[.785,.066,.035],[.805,.104,.058],[.92,.112,.061],[1.016,.100,.056],[1.039,.061,.038]]){
      const ring=[];for(let j=0;j<24;j++){const a=j*Math.PI/12,px=Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.7, pz=Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.7;
        ring.push(vertex(-.230+px*rx*.90,y,-.090+pz*rz,weights({Hips:.85,Spine:.15})));}
      if(previous)stitch(previous,ring);else cap(ring,[-.230,y,-.090],weights({Hips:.85,Spine:.15}),true);previous=ring;
    }
    cap(previous,[-.230,1.039,-.090],weights({Hips:.85,Spine:.15}));
    const flap=[];for(let r=0;r<4;r++){const row=[];for(let c=0;c<9;c++){const x=-.230+(c/8-.5)*.184,y=1.035-r*.025,z=-.025+.009*Math.sin(c/8*Math.PI);row.push(vertex(x,y,z,weights({Hips:.85,Spine:.15})));}flap.push(row);}
    for(let r=0;r<3;r++)for(let c=0;c<8;c++){face(flap[r][c],flap[r+1][c+1],flap[r][c+1]);face(flap[r][c],flap[r+1][c],flap[r+1][c+1]);}
  });
  section(mats.metal,()=>{
    for(const x of [-.267,-.203])tubePath([[x,.96,-.010],[x,.943,-.005],[x+.018,.943,-.005],[x+.018,.96,-.010],[x,.96,-.010]],[.0028,.0028,.0028,.0028,.0028],()=>weights({Hips:.85,Spine:.15}),6);
  });
  }
  section(mats.ink,()=>{
    // Original small HANNEST emblem, fully geometric and bound to the shirt.
    const paths=[[[.077,1.244,.150],[.077,1.260,.147]],[[.089,1.244,.150],[.089,1.260,.147]],[[.077,1.251,.150],[.089,1.251,.150]]];
    for(const path of paths)tubePath(path,[.0018,.0018],(_,p)=>torsoWeight(p.y),6);
  });
  let geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));geometry.setIndex(indices);
  for(const group of materialGroups)geometry.addGroup(group.start,group.count,group.materialIndex);
  const coarse=geometry;geometry=refineWeightedSurface(coarse);coarse.dispose();
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();ownedGeometries.add(geometry);
  const mesh=new THREE.SkinnedMesh(geometry,materialList);mesh.name='HannestSmoothGarmentsHands';mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);
  root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(joints);mesh.bind(skeleton);mesh.normalizeSkinWeights();
  const sockets={};
  for(const label of ['Left','Right']){const grip=new THREE.Group();grip.name=`${label}PalmGrip`;grip.position.set(0,-.076,.018);bones[`${label}Hand`].add(grip);sockets[label==='Left'?'leftHand':'rightHand']=grip;}
  const bagSocket=new THREE.Group();bagSocket.position.set(-.230,.045,-.090);hips.add(bagSocket);sockets.bag=bagSocket;
  const rest=new Map(joints.map(joint=>[joint.name,{position:joint.position.clone(),quaternion:joint.quaternion.clone()}]));
  const clips=[], clipByName={}, actions={};
  function makeClip(name,duration,pose,{upper=false,markers=[]}={}) {
    const samples=name==='Walk'||name==='Run'?49:33,times=Array.from({length:samples},(_,i)=>duration*i/(samples-1));
    const channels=new Map();
    for(const time of times){const p=pose(time/duration,time);for(const [boneName,value] of Object.entries(p)){
      if(!channels.has(boneName))channels.set(boneName,{quaternions:[],positions:[]});const channel=channels.get(boneName);
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(value.rotation??[0,0,0]),'XYZ'));channel.quaternions.push(q.x,q.y,q.z,q.w);
      if(value.position)channel.positions.push(...value.position);
    }}
    const tracks=[];for(const [name,channel] of channels){tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`,times,channel.quaternions));if(channel.positions.length)tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`,times,channel.positions));}
    const clip=new THREE.AnimationClip(name,duration,tracks);if(upper)clip.blendMode=THREE.AdditiveAnimationBlendMode;
    clip.userData={upper,markers,ambient:['Read','Write','Organize','Prepare','Sleep','Makeup','Sweep'].includes(name)};clips.push(clip);clipByName[name]=clip;return clip;
  }
  function basePose(){const p={};for(const joint of joints)p[joint.name]={rotation:[0,0,0]};p.Hips.position=[0,.905,0];return p;}
  makeClip('Idle',3.2,(t)=>{const p=basePose(),breath=Math.sin(t*Math.PI*2);p.Spine.rotation=[.006*breath,0,.002*breath];p.Chest.rotation=[-.006*breath,0,0];p.Head.rotation=[0,.012*Math.sin(t*Math.PI*2+.7),0];return p;});
  function gaitPose(t,run=false){
    const p=basePose(),stance=run?.42:.60,amp=run?.33:.24,hipY=run?.80:.855;
    p.Hips.position=[0,hipY+(run?.018:.007)*Math.sin(t*Math.PI*4),0];p.Spine.rotation=[run?.10:.025,0,0];
    for(const [label,offset] of [['Left',0],['Right',.5]]){
      const phase=(t+offset)%1;let z,lift;
      if(phase<stance){z=amp*(1-2*phase/stance);lift=0;}else{const u=(phase-stance)/(1-stance);z=mix(-amp,amp,smooth(u));lift=(run?.16:.073)*Math.sin(u*Math.PI);}
      const d=p.Hips.position[1]-(.104+lift),l1=.432,l2=.369;
      const knee=Math.acos(clamp((d*d+z*z-l1*l1-l2*l2)/(2*l1*l2),-1,1));
      const theta=Math.atan2(z,d)+Math.atan2(l2*Math.sin(knee),l1+l2*Math.cos(knee));
      p[`${label}Thigh`].rotation=[-theta,0,0];p[`${label}Shin`].rotation=[knee,0,0];p[`${label}Foot`].rotation=[theta-knee,0,0];
      p[`${label}UpperArm`].rotation=[(run?.5:.22)*Math.sin(phase*Math.PI*2),0,0];
      p[`${label}ForeArm`].rotation=[run?-.60:-.10,0,0];
    }return p;
  }
  makeClip('Walk',1,(t)=>gaitPose(t));makeClip('Run',.72,(t)=>gaitPose(t,true));
  function seatedPose(amount){const p=basePose(),a=amount;p.Hips.position=[0,mix(.905,.60,a),-.04*a];p.Spine.rotation=[.06*a,0,0];
    for(const label of ['Left','Right']){p[`${label}Thigh`].rotation=[-1.27*a,0,0];p[`${label}Shin`].rotation=[1.27*a,0,0];p[`${label}Foot`].rotation=[0,0,0];p[`${label}UpperArm`].rotation=[-.20*a,0,0];p[`${label}ForeArm`].rotation=[-.45*a,0,0];}return p;}
  makeClip('Sit',1.1,(t)=>seatedPose(smooth(t)));makeClip('Stand',1.0,(t)=>seatedPose(1-smooth(t)));
  function actionPose(name,t){
    const pulse=t<.24?smooth(t/.24):t>.78?smooth((1-t)/.22):1,p={};
    const set=(joint,x=0,y=0,z=0)=>{p[joint]={rotation:[x*pulse,y*pulse,z*pulse]};};
    if(name==='Wave'){set('RightClavicle',0,0,.08);set('RightUpperArm',-.30,0,1.82);set('RightForeArm',-.96,0,.14);set('RightHand',0,0,.23*Math.sin(t*Math.PI*7));}
    if(name==='Nod')set('Head',.15*Math.sin(t*Math.PI*3),0,0);
    if(name==='Point'||name==='Prepare'){set('RightUpperArm',-1.28,0,.12);set('RightForeArm',.16,0,0);set('RightHand',-.08,0,0);set('Chest',0,-.035,0);}
    if(name==='Give'||name==='Receive'||name==='Organize'){set('RightUpperArm',-.50,0,-.65);set('RightForeArm',-.93,0,.20);set('RightHand',.13,0,0);}
    if(name==='Grab'||name==='PutDown'){set('RightUpperArm',-.40,0,-.40);set('RightForeArm',-.35,0,-.35);set('RightHand',.13,0,0);}
    if(name==='Think'){set('RightUpperArm',-.46,0,-.22);set('RightForeArm',-1.95,0,-.12);set('RightHand',.24,0,0);set('Head',.04,-.06,0);}
    if(name==='Read'||name==='Write'){for(const label of ['Left','Right']){set(`${label}UpperArm`,-.45,0,label==='Left'?.11:-.11);set(`${label}ForeArm`,-1.20,0,0);set(`${label}Hand`,.1,0,0);}if(name==='Write')set('RightHand',.12,0,.07*Math.sin(t*Math.PI*5));set('Head',.10,0,0);}
    if(['Give','Receive','Think','Write','Organize','Grab','PutDown'].includes(name))for(let i=0;i<4;i++){set(`RightFinger${i}Proximal`,-.42,0,0);set(`RightFinger${i}Distal`,-.45,0,0);}return p;
  }
  for(const name of ['Wave','Nod','Point','Receive','Give','Think','Read','Write','Organize','Prepare'])makeClip(name,['Read','Write','Organize','Prepare'].includes(name)?2.2:1.25,(t)=>actionPose(name,t),{upper:true,markers:['Give','Receive'].includes(name)?[{name:'handoff',time:.58}]:[]});
  // Additive classroom activities keep the seated/standing base and run continuously.
  // Rest both forearms over the desk; the whole torso slumps, then the head
  // droops and lifts slowly. Eye closure is driven by the native face morphs.
  makeClip('Sleep',3.8,t=>{const nod=(1-Math.cos(t*Math.PI*2))/2,breath=Math.sin(t*Math.PI*4),p={};for(const [joint,rotation]of Object.entries({Spine:[.55+.045*nod,0,0],Chest:[.28+.015*nod+.003*breath,0,0],Head:[.36+.22*nod,0,.08],LeftUpperArm:[-1.94-.13*nod,0,.30],RightUpperArm:[-1.94-.13*nod,0,-.30],LeftForeArm:[.10+.07*nod,0,.50],RightForeArm:[.10+.07*nod,0,-.50],LeftHand:[.12,0,0],RightHand:[.12,0,0]}))p[joint]={rotation};return p;},{upper:true});
  makeClip('Makeup',3.2,t=>{const stroke=Math.sin(t*Math.PI*2);return {Head:{rotation:[.025,0,0]},LeftUpperArm:{rotation:[-.38,0,.08]},LeftForeArm:{rotation:[-1.65,0,.4]},LeftHand:{rotation:[.1,0,.03]},RightUpperArm:{rotation:[-.30,0,.10]},RightForeArm:{rotation:[-2.35+.035*stroke,0,-.70]},RightHand:{rotation:[.08,.07*stroke,.06*stroke]}};},{upper:true});
  // Authored left/centre/right poses move both real palms across the body.
  // A smooth curve joins them; the prop derives its floor contact from these
  // two grips, rather than adding an unrelated clock-driven broom oscillation.
  const sweepGrips={Left:[[.20742,.53447,.79090,-2.17339],[.16682,.40728,1.39174,-1.87192],[-.32162,.51953,1.16664,-1.31797]],Right:[[-.56890,-.00250,-.78911,-.22125],[-.10916,-.02646,-.66183,-1.04977],[-.08966,-.00370,-.33320,-1.16576]]};
  makeClip('Sweep',2.6,t=>{const stroke=Math.sin(t*Math.PI*2),p={Spine:{rotation:[.09,0,.018*stroke]},Chest:{rotation:[.055,.06*stroke,0]},Head:{rotation:[.16,0,0]}};
    for(const label of ['Left','Right']){const [left,centre,right]=sweepGrips[label],angles=centre.map((v,i)=>v+(right[i]-left[i])*.5*stroke+(right[i]+left[i]-2*v)*.5*stroke*stroke);
      p[`${label}UpperArm`]={rotation:angles.slice(0,3)};p[`${label}ForeArm`]={rotation:[angles[3],0,0]};p[`${label}Hand`]={rotation:[.12,0,0]};
      for(let i=0;i<4;i++){p[`${label}Finger${i}Proximal`]={rotation:[-.42,0,0]};p[`${label}Finger${i}Distal`]={rotation:[-.45,0,0]};}
    }return p;
  },{upper:true});
  makeClip('Grab',1.25,t=>actionPose('Grab',t),{upper:true,markers:[{name:'grasp',time:.58}]});
  makeClip('PutDown',1.25,t=>actionPose('PutDown',t),{upper:true,markers:[{name:'place',time:.58}]});
  makeClip('Erase',3.6,t=>{const stroke=Math.sin(t*Math.PI*6),rise=Math.sin(t*Math.PI*4),p={
    Head:{rotation:[-.05,0,0]},Chest:{rotation:[0,.04*stroke,0]},RightUpperArm:{rotation:[-.50-.06*rise,0,-.06+.19*stroke]},RightForeArm:{rotation:[-2.18-.05*rise,0,-.08]},RightHand:{rotation:[.10,0,.04*stroke]},LeftUpperArm:{rotation:[-.08,0,.04]}};
    for(let i=0;i<4;i++){p[`RightFinger${i}Proximal`]={rotation:[-.42,0,0]};p[`RightFinger${i}Distal`]={rotation:[-.45,0,0]};}return p;
  },{upper:true,markers:[{name:'wipe-start',time:.45}]});
  const mixer=new THREE.AnimationMixer(root);
  for(const clip of clips){const action=mixer.clipAction(clip);if((clip.userData.upper&&!clip.userData.ambient)||['Sit','Stand'].includes(clip.name)){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;}actions[clip.name]=action;}
  actions.Idle.play();let base='Idle',seated=false,standing=false,gesture='idle',currentAction=null,token=0,lastTime=0;
  const gaze=new THREE.Quaternion(),appliedGaze=new THREE.Quaternion(),inverseGaze=new THREE.Quaternion();let gazeYaw=0,gazePitch=0,appliedSeatOffset=0;
  function stopUpper(reason='cancelled'){
    if(!currentAction)return;const prior=currentAction;currentAction=null;prior.cancelled=true;
    // Reevaluate the ambient driver after a manual interruption, even when its
    // requested activity is unchanged from before the manual clip.
    if(prior.manual)gesture='';
    if(prior.upper)prior.action.fadeOut(.12);token++;return reason;
  }
  function setBase(name,duration=.20){if(base===name)return;const previous=actions[base],next=actions[name];previous.fadeOut(duration);
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).fadeIn(duration).play();base=name;
  }
  function beginAction(name,{onMarker,onFinish}={},manual=true){
    const canonical=Object.keys(actions).find(key=>key.toLowerCase()===String(name).toLowerCase());
    if(disposed||!canonical||['Idle','Walk','Run'].includes(canonical))return{supported:false,cancel(){}};
    stopUpper('superseded');const clip=clipByName[canonical],action=actions[canonical],id=++token;
    const looping=clip.userData.ambient&&!manual;
    if(clip.userData.upper){action.setLoop(looping?THREE.LoopRepeat:THREE.LoopOnce,looping?Infinity:1);action.clampWhenFinished=!looping;}
    if(canonical==='Sit'){seated=true;standing=false;setBase('Sit');}
    else if(canonical==='Stand'){seated=false;standing=true;setBase('Stand');}
    else action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).fadeIn(.13).play();
    currentAction={id,action,clip,upper:clip.userData.upper,manual,looping,last:0,fired:new Set(),onMarker,onFinish,cancelled:false};
    return{supported:true,cancel(){if(currentAction?.id===id)stopUpper();}};
  }
  function playAction(name,hooks={}){return beginAction(name,hooks,true);}
  function update(options={}){
    if(disposed)return;
    // Undo the previous overlays before Mixer evaluation; clamped tracks may skip
    // unchanged setters, so an additive +=/multiply alone would accumulate.
    head.quaternion.multiply(inverseGaze.copy(appliedGaze).invert());appliedGaze.identity();
    hips.position.y-=appliedSeatOffset;appliedSeatOffset=0;
    const dt=clamp(Number.isFinite(options.dt)?options.dt:1/60,0,.10),time=Number.isFinite(options.time)?options.time:lastTime+dt;lastTime=time;
    const speed=clamp(Number.isFinite(options.speed)?options.speed:0,0,5.0);
    if(Object.hasOwn(options,'seated')){
      const next=options.seated===true;
      if(next!==seated){seated=next;standing=!next;setBase(next?'Sit':'Stand',.18);}
    }
    if(standing&&actions.Stand.time>=clipByName.Stand.duration-.0001){standing=false;setBase('Idle',.16);}
    if(!seated&&!standing){const requested=speed>.045?(speed>2.0||options.running?'Run':'Walk'):'Idle';setBase(requested,.22);}
    if(base==='Walk')actions.Walk.setEffectiveTimeScale(speed/.80);
    if(base==='Run')actions.Run.setEffectiveTimeScale(speed/2.18);
    const nextGesture=String(options.gesture??'idle').toLowerCase();
    if(nextGesture!==gesture&&!currentAction?.manual){gesture=nextGesture;if(nextGesture==='idle')stopUpper();else beginAction(nextGesture,{},false);}
    // Animation evaluation is per actor; callbacks are driven by native action time.
    mixer.update(dt);
    if(currentAction){const entry=currentAction,t=entry.action.time;
      for(const marker of entry.clip.userData.markers){if(!entry.fired.has(marker.name)&&entry.last<marker.time&&t>=marker.time){entry.fired.add(marker.name);entry.onMarker?.(marker.name,{clip:entry.clip.name,time:t});}}
      entry.last=t;
      if(!entry.looping&&t>=entry.clip.duration-.00001){currentAction=null;if(entry.manual)gesture='';if(entry.upper)entry.action.fadeOut(.15);if(!entry.cancelled)entry.onFinish?.({clip:entry.clip.name});}
    }
    if(seated&&Number.isFinite(options.seatHeight)){appliedSeatOffset=clamp(options.seatHeight-.52,-.10,.12);hips.position.y+=appliedSeatOffset;}
    const alpha=1-Math.exp(-9*dt),yaw=clamp(Number.isFinite(options.headYaw)?options.headYaw:0,-.55,.55),pitch=clamp(Number.isFinite(options.headPitch)?options.headPitch:0,-.20,.20);
    gazeYaw=mix(gazeYaw,yaw,alpha);gazePitch=mix(gazePitch,pitch,alpha);
    gaze.setFromEuler(new THREE.Euler(gazePitch,gazeYaw,0,'YXZ'));head.quaternion.multiply(gaze);appliedGaze.copy(gaze);
    root.updateMatrixWorld(true);skeleton.update();
    root.userData.bodyState={base,speed,seated,standing,action:currentAction?.clip.name??null,headYaw:gazeYaw,headPitch:gazePitch};
  }
  function diagnostics(){
    const weight=geometry.getAttribute('skinWeight');let intermediate=0,maxWeightError=0;
    for(let i=0;i<weight.count;i++){let sum=0,positive=0;for(let j=0;j<4;j++){const w=weight.array[i*4+j];sum+=w;if(w>1e-5)positive++;}if(positive>1)intermediate++;maxWeightError=Math.max(maxWeightError,Math.abs(sum-1));}
    return{kind,outfit,heightTarget:1.72,bones:joints.length,skinnedMeshes:1,vertices:geometry.attributes.position.count,triangles:geometry.index.count/3,intermediateWeightedVertices:intermediate,maxWeightError,
      clips:clips.map(clip=>({name:clip.name,duration:clip.duration,markers:clip.userData.markers})),state:root.userData.bodyState??{base},disposed};
  }
  function dispose(){if(disposed)return;disposed=true;stopUpper();mixer.stopAllAction();mixer.uncacheRoot(root);skeleton.dispose();
    for(const value of ownedGeometries)value.dispose();for(const value of ownedMaterials)value.dispose();ownedGeometries.clear();ownedMaterials.clear();root.removeFromParent();}
  const rig={body:hips,head,torso:chest,arms:[limb.Left.upper,limb.Right.upper],forearms:[limb.Left.fore,limb.Right.fore],hands:[limb.Left.hand,limb.Right.hand],
    legs:[limb.Left.thigh,limb.Right.thigh],shins:[limb.Left.shin,limb.Right.shin],feet:[limb.Left.foot,limb.Right.foot]};
  root.userData.rig=rig;root.userData.sockets=sockets;
  root.userData.humanBody={skeleton,bones,clips,mixer,actions,mesh,attachments:{head,leftHand:sockets.leftHand,rightHand:sockets.rightHand,bag:sockets.bag},update,playAction,dispose,diagnostics};
  update({dt:0,time:seed*1.7,speed:0});return root;
}

// One Loop subdivision pass rounds ring joins while also interpolating weights.
// It retains material groups and real topology; it is not a rigid-node proxy.
function refineWeightedSurface(source) {
  const p=source.attributes.position.array,j=source.attributes.skinIndex.array,w=source.attributes.skinWeight.array;
  const oldCount=source.attributes.position.count,faces=source.index.array,neighbors=Array.from({length:oldCount},()=>new Set()),edges=new Map();
  function edge(a,b,opposite){const lo=Math.min(a,b),hi=Math.max(a,b),key=`${lo}:${hi}`;if(!edges.has(key))edges.set(key,{a:lo,b:hi,opposites:[]});edges.get(key).opposites.push(opposite);neighbors[a].add(b);neighbors[b].add(a);}
  for(let i=0;i<faces.length;i+=3){const [a,b,c]=[faces[i],faces[i+1],faces[i+2]];edge(a,b,c);edge(b,c,a);edge(c,a,b);}
  const boundary=Array.from({length:oldCount},()=>[]);for(const e of edges.values())if(e.opposites.length===1){boundary[e.a].push(e.b);boundary[e.b].push(e.a);}
  const positions=[],joints=[],weights=[],newIndex=[];
  function blend(terms){let x=0,y=0,z=0;const influence=new Map();
    for(const [id,amount] of terms){x+=p[id*3]*amount;y+=p[id*3+1]*amount;z+=p[id*3+2]*amount;
      for(let k=0;k<4;k++){const bone=j[id*4+k],value=w[id*4+k]*amount;if(value>0)influence.set(bone,(influence.get(bone)??0)+value);}}
    const active=[...influence].sort((a,b)=>b[1]-a[1]).slice(0,4),total=active.reduce((s,a)=>s+a[1],0),id=positions.length/3;positions.push(x,y,z);
    for(let k=0;k<4;k++){joints.push(active[k]?.[0]??0);weights.push(active[k]?active[k][1]/total:0);}return id;
  }
  for(let v=0;v<oldCount;v++){
    const n=neighbors[v].size;
    if(boundary[v].length===2)blend([[v,.75],[boundary[v][0],.125],[boundary[v][1],.125]]);
    else if(boundary[v].length||n<3)blend([[v,1]]);
    else {const beta=n===3?3/16:3/(8*n);blend([[v,1-n*beta],...[...neighbors[v]].map(id=>[id,beta])]);}
  }
  for(const e of edges.values()){const terms=e.opposites.length===2?[[e.a,.375],[e.b,.375],[e.opposites[0],.125],[e.opposites[1],.125]]:[[e.a,.5],[e.b,.5]];e.id=blend(terms);}
  const get=(a,b)=>edges.get(`${Math.min(a,b)}:${Math.max(a,b)}`).id;
  for(let i=0;i<faces.length;i+=3){const [a,b,c]=[faces[i],faces[i+1],faces[i+2]],ab=get(a,b),bc=get(b,c),ca=get(c,a);newIndex.push(a,ab,ca,b,bc,ab,c,ca,bc,ab,bc,ca);}
  const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));out.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));out.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));out.setIndex(newIndex);
  for(const group of source.groups)out.addGroup(group.start*4,group.count*4,group.materialIndex);return out;
}
