import * as THREE from './vendor/three.module.js';

// Original mesh-built campus. Canvas textures contain lettering only; no photo planes.
export function createCampus(scene) {
  const campus = new THREE.Group();
  campus.name = 'hannest-campus-lv1';
  scene.add(campus);
  const geometries = new Map();
  const materials = new Map();
  const textures = new Set();
  const obstacles = [];
  let disposed = false;

  const palette = {
    grass: 0xcbdcb8,
    lawn: 0xaec9a2,
    pavement: 0xf1e8d6,
    pavingEdge: 0xe0d7c5,
    cream: 0xfff7e5,
    wall: 0xf8efdf,
    mint: 0x85b4a4,
    mintDark: 0x49796e,
    peach: 0xeab79c,
    terracotta: 0xd78b6e,
    wood: 0xbf8964,
    woodLight: 0xd4a77e,
    glass: 0x7d9d9c,
    ink: 0x344b49,
    foliage: 0x79a781,
    foliageLight: 0x9dc29a,
    flower: 0xe7a7a2,
    blossom: 0xe6bbb9,
    blossomLight: 0xf2d7cd,
    gold: 0xf4b75d,
  };

  function geometry(key, create) {
    if (!geometries.has(key)) geometries.set(key, create());
    return geometries.get(key);
  }

  function material(color, extra = {}) {
    const key = JSON.stringify([color, extra]);
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({
        color, roughness: 0.84, metalness: 0, ...extra,
      }));
    }
    return materials.get(key);
  }

  function mesh(shape, mat, x, y, z, parent = campus) {
    const object = new THREE.Mesh(shape, mat);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function box(w, h, d, color, x, y, z, parent = campus) {
    // A scaled unit box preserves the existing shapes while sharing one buffer
    // across walls, table pieces, paper lines and other rectangular solids.
    const shape = geometry('box:unit', () => new THREE.BoxGeometry(1, 1, 1));
    const object = mesh(shape, material(color), x, y, z, parent);
    object.scale.set(w, h, d);
    return object;
  }

  function cylinder(top, bottom, height, color, x, y, z, segments = 12, parent = campus) {
    const shape = geometry(`cylinder:${top}:${bottom}:${height}:${segments}`, () =>
      new THREE.CylinderGeometry(top, bottom, height, segments));
    return mesh(shape, material(color), x, y, z, parent);
  }

  function sphere(radius, color, x, y, z, scale = [1, 1, 1], parent = campus) {
    const shape = geometry(`sphere:${radius}`, () => new THREE.SphereGeometry(radius, 12, 9));
    const object = mesh(shape, material(color), x, y, z, parent);
    object.scale.set(...scale);
    return object;
  }

  function collide(x, z, w, d, name) {
    obstacles.push({minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2, name});
  }

  function roundedRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function lettering(lines, options = {}) {
    const rows = Array.isArray(lines) ? lines : [lines];
    const width = options.width || 768;
    const height = options.height || 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Campus signs could not be prepared.');
    ctx.fillStyle = options.background || '#fff7e5';
    if (options.rounded) {
      roundedRect(ctx, 3, 3, width - 6, height - 6, 32);
      ctx.fill();
    } else ctx.fillRect(0, 0, width, height);
    if (options.border) {
      ctx.strokeStyle = options.border;
      ctx.lineWidth = 7;
      roundedRect(ctx, 9, 9, width - 18, height - 18, 20);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    rows.forEach((line, index) => {
      const row = typeof line === 'string' ? {text: line} : line;
      const fontSize = row.size || (rows.length === 1 ? 100 : 76);
      ctx.font = `${row.weight || 700} ${fontSize}px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
      ctx.fillStyle = row.color || options.color || '#344b49';
      const y = row.y || height * (index + 0.5) / rows.length;
      ctx.fillText(row.text, width / 2, y, width - 60);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.add(texture);
    return texture;
  }

  function sign(lines, w, h, x, y, z, options = {}) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    (options.parent || campus).add(group);
    if (options.rotationY) group.rotation.y = options.rotationY;
    box(w + 0.14, h + 0.14, 0.12, options.frame || palette.mintDark, 0, 0, 0, group);
    const texture = lettering(lines, options);
    const mat = new THREE.MeshBasicMaterial({map: texture, toneMapped: false});
    materials.set(`sign:${materials.size}`, mat);
    const face = mesh(geometry(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)),
      mat, 0, 0, 0.067, group);
    face.castShadow = false;
    return group;
  }

  // The shared floor has its top at zero, matching the actors' feet.
  const ground = box(24, 0.12, 24, palette.grass, 0, -0.06, 0);
  ground.name = 'campus-ground';
  ground.castShadow = false;
  function paving(w, d, x, z, color = palette.pavement) {
    const slab = box(w, 0.016, d, color, x, 0.008, z);
    slab.castShadow = false;
    return slab;
  }

  // A wide spine through the gate and northward paths to both learning buildings.
  paving(3.6, 20.5, 0, 0.25);
  paving(19.7, 2.5, 0, -2);
  paving(7.6, 4.3, -6.15, -3.75);
  paving(6.5, 3.2, 6.6, -4.6);
  paving(6.2, 2.7, -2.1, 3);
  const plaza = mesh(geometry('circle:3.2', () => new THREE.CircleGeometry(3.2, 40)),
    material(palette.pavement), 0, 0.02, 1.9);
  plaza.rotation.x = -Math.PI / 2;
  plaza.castShadow = false;
  for (let z = 6.8; z > -7.8; z -= 1.5) {
    box(0.035, 0.02, 1.02, palette.pavingEdge, -1.79, 0.025, z);
    box(0.035, 0.02, 1.02, palette.pavingEdge, 1.79, 0.025, z);
  }
  // A small inlaid compass is geometry, rather than a ground photograph.
  const compass = mesh(geometry('compass:ring', () => new THREE.TorusGeometry(0.66, 0.016, 4, 32)),
    material(palette.mint), 0, 0.034, 1.9);
  compass.rotation.x = Math.PI / 2;
  box(0.035, 0.02, 1.0, palette.mint, 0, 0.038, 1.9);
  box(1.0, 0.02, 0.035, palette.mint, 0, 0.038, 1.9);

  function windowPanel(x, y, z, w = 1.12, h = 1.5) {
    box(w + 0.14, h + 0.14, 0.14, palette.cream, x, y, z);
    box(w, h, 0.15, palette.glass, x, y, z + 0.025);
    box(0.055, h, 0.16, palette.cream, x, y, z + 0.05);
    box(w, 0.055, 0.16, palette.cream, x, y + h * 0.12, z + 0.05);
    box(w + 0.25, 0.09, 0.29, palette.peach, x, y - h / 2 - 0.08, z + 0.07);
  }

  // Student center: shallow northern block leaves a sheltered, walkable forecourt.
  box(7.0, 5.7, 4.5, palette.wall, -7, 2.85, -7.25);
  collide(-7, -7.25, 7.0, 4.5, 'student-center');
  box(7.3, 0.23, 4.8, palette.mintDark, -7, 5.8, -7.25);
  box(7.0, 0.23, 0.12, palette.peach, -7, 3.02, -4.93);
  box(7.45, 0.3, 5.0, palette.mint, -7, 5.99, -7.25);
  box(6.4, 0.25, 3.8, palette.cream, -7, 6.22, -7.25);
  for (const x of [-9.3, -7, -4.7]) windowPanel(x, 4.28, -4.91, 1.25, 1.36);
  windowPanel(-9.45, 1.5, -4.91, 1.06, 1.6);
  windowPanel(-4.55, 1.5, -4.91, 1.06, 1.6);
  // A framed glazed doorway is clearly distinct from the upper floor windows.
  box(2.22, 2.53, 0.2, palette.mintDark, -6.7, 1.265, -4.88);
  box(1.98, 2.37, 0.22, palette.glass, -6.7, 1.185, -4.83);
  box(0.07, 2.37, 0.24, palette.cream, -6.7, 1.185, -4.8);
  box(0.06, 0.48, 0.09, palette.gold, -6.48, 1.13, -4.66);
  box(0.06, 0.48, 0.09, palette.gold, -6.92, 1.13, -4.66);
  sign([{text: '학생회관', size: 94, y: 78}, {text: '신입생 안내', size: 34, y: 167}],
    4.6, 1.0, -7, 3.05, -4.63, {height: 224, frame: palette.cream, background: '#49796e', color: '#fff7e5'});
  // Canopy columns have their own compact ground collisions; the roof is overhead.
  const canopy = new THREE.Group();
  canopy.name = 'student-center-canopy-roof';
  campus.add(canopy);
  box(7.5, 0.2, 2.7, palette.peach, -7, 2.72, -3.73, canopy);
  box(7.64, 0.09, 2.84, palette.cream, -7, 2.85, -3.73, canopy);
  const canopyFootprint = Object.freeze({minX: -10.82, maxX: -3.18, minZ: -5.15, maxZ: -2.31});
  for (const x of [-10.45, -3.55]) {
    box(0.24, 2.62, 0.24, palette.cream, x, 1.31, -2.68);
    box(0.36, 0.13, 0.36, palette.mint, x, 0.065, -2.68);
    collide(x, -2.68, 0.36, 0.36, 'canopy-column');
  }

  // Outdoor guidance desk. Actors approach its eastern side without entering a wall.
  box(1.65, 0.84, 0.75, palette.mint, -5.3, 0.5, -3.8);
  box(1.8, 0.14, 0.87, palette.woodLight, -5.3, 0.97, -3.8);
  box(1.55, 0.1, 0.08, palette.cream, -5.3, 0.68, -3.36);
  collide(-5.3, -3.8, 1.8, 0.87, 'guidance-desk');
  sign('안내', 1.2, 0.44, -5.3, 0.47, -3.355,
    {width: 512, height: 192, background: '#85b4a4', color: '#fff7e5', frame: palette.mint});
  // Small unoccupied planter on the desk's outer corner, away from collectable props.
  cylinder(0.11, 0.085, 0.17, palette.peach, -6.04, 1.125, -3.98, 10);
  sphere(0.13, palette.foliage, -6.04, 1.27, -3.98, [1, 1.2, 1]);

  // Classroom building to the northeast; room 101 has a bright, legible doorway.
  box(6.4, 5.2, 4.0, palette.cream, 7, 2.6, -8);
  collide(7, -8, 6.4, 4.0, 'classroom-building');
  box(6.65, 0.27, 4.25, palette.terracotta, 7, 5.34, -8);
  box(6.85, 0.12, 4.42, palette.peach, 7, 5.53, -8);
  box(6.38, 0.24, 0.12, palette.mint, 7, 2.84, -5.94);
  for (const x of [4.6, 6.7, 8.8]) windowPanel(x, 3.91, -5.91, 1.18, 1.36);
  windowPanel(8.72, 1.48, -5.91, 1.2, 1.6);
  box(1.75, 2.47, 0.19, palette.mintDark, 6, 1.235, -5.9);
  box(1.49, 2.31, 0.2, palette.woodLight, 6, 1.155, -5.84);
  box(0.78, 1.02, 0.21, palette.glass, 6, 1.58, -5.815);
  cylinder(0.043, 0.043, 0.18, palette.gold, 6.55, 1.01, -5.66, 8).rotation.x = Math.PI / 2;
  sign('101호', 1.56, 0.51, 6, 2.68, -5.72,
    {width: 512, height: 192, background: '#fff7e5', border: '#85b4a4'});
  sign([{text: '강의동', size: 94, y: 74}, {text: '강의동', size: 35, y: 164}],
    2.12, 0.83, 8.78, 2.61, -5.73,
    {width: 640, height: 224, background: '#eab79c', color: '#344b49', frame: palette.cream});
  box(2.12, 0.1, 1.1, palette.peach, 6, 2.97, -5.4);
  // No step at 101: every objective is reachable on the same ground level.
  paving(2.3, 2.0, 6, -5, palette.pavingEdge);

  // Low, open gate: its small side plaque leaves the first objective in view.
  const gate = new THREE.Group();
  gate.name = 'campus-entrance-gate';
  campus.add(gate);
  for (const x of [-3.4, 3.4]) {
    box(0.72, 3.0, 0.72, palette.cream, x, 1.5, 8, gate);
    box(0.87, 0.18, 0.87, palette.peach, x, 3.04, 8, gate);
    collide(x, 8, 0.87, 0.87, 'entrance-gate-post');
  }
  box(7.63, 0.13, 0.29, palette.mintDark, 0, 3.135, 8, gate);
  sign([{text: '한네스트', size: 84, y: 73}, {text: '캠퍼스', size: 62, y: 166}],
    1.6, 0.74, 3.4, 2.53, 8.43,
    {height: 240, background: '#49796e', color: '#fff7e5', frame: palette.cream, parent: gate});
  for (const side of [-1, 1]) {
    box(6.45, 0.14, 0.2, palette.woodLight, side * 7.37, 0.76, 8, gate);
    box(6.45, 0.14, 0.2, palette.woodLight, side * 7.37, 1.28, 8, gate);
    for (const x of [4.35, 6.3, 8.25, 10.3]) {
      box(0.15, 1.56, 0.18, palette.mintDark, side * x, 0.78, 8, gate);
      collide(side * x, 8, 0.18, 0.2, 'fence-post');
    }
    // A fence is a continuous waist-high solid, not a route through the rails.
    collide(side * 7.37, 8, 6.45, 0.2, 'gate-fence');
  }

  // Dedicated gate materials make fading safe for the rest of the campus.
  const gateMaterials = new Map();
  gate.traverse(object => {
    if (!object.material) return;
    const original = object.material;
    if (!gateMaterials.has(original)) {
      const copy = original.clone();
      gateMaterials.set(original, copy);
      materials.set(`gate:${gateMaterials.size}`, copy);
    }
    object.material = gateMaterials.get(original);
  });
  let gateOpacity = 1;

  function tree(x, z, size = 1, cherry = false) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    campus.add(group);
    cylinder(0.16 * size, 0.22 * size, 1.75 * size, palette.wood,
      0, 0.875 * size, 0, 10, group);
    sphere(1.04 * size, cherry ? palette.blossom : palette.foliage,
      0, 2.43 * size, 0, [1, 1.05, 0.93], group);
    sphere(0.77 * size, cherry ? palette.blossomLight : palette.foliageLight,
      -0.49 * size, 2.68 * size, 0.14 * size,
      [1, 1.05, 1], group);
    sphere(0.65 * size, cherry ? palette.blossomLight : palette.foliageLight,
      0.55 * size, 2.62 * size, -0.16 * size,
      [1, 1.04, 0.96], group);
    cylinder(0.56 * size, 0.62 * size, 0.12, palette.pavingEdge,
      0, 0.06, 0, 14, group);
    collide(x, z, 1.2 * size, 1.2 * size, 'tree-base');
  }
  for (const [x, z, size, cherry] of [
    [-10.4, 5.2, 0.93], [-9.7, 0.2, 1.02], [-7.3, 5.2, 0.8, true],
    [10.3, 5.1, 1], [10.25, 0, 0.91], [7.1, 5.45, 0.8, true],
    [-1.55, -10.3, 0.83], [1.5, -10.25, 0.88],
  ]) tree(x, z, size, cherry);

  function bench(x, z, rotation = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    campus.add(group);
    for (const localX of [-0.81, 0.81]) {
      box(0.12, 0.56, 0.12, palette.mintDark, localX, 0.28, -0.27, group);
      box(0.12, 0.56, 0.12, palette.mintDark, localX, 0.28, 0.27, group);
      box(0.1, 0.9, 0.1, palette.mintDark, localX, 0.68, -0.28, group);
    }
    for (const localZ of [-0.2, 0, 0.2]) {
      box(2.12, 0.1, 0.16, palette.woodLight, 0, 0.57, localZ, group);
    }
    box(2.12, 0.19, 0.09, palette.wood, 0, 0.89, -0.29, group);
    box(2.12, 0.19, 0.09, palette.woodLight, 0, 1.13, -0.29, group);
    const halfW = Math.abs(Math.cos(rotation)) * 1.06 + Math.abs(Math.sin(rotation)) * 0.38;
    const halfD = Math.abs(Math.sin(rotation)) * 1.06 + Math.abs(Math.cos(rotation)) * 0.38;
    collide(x, z, halfW * 2, halfD * 2, 'bench');
  }
  bench(-6.1, 1.05, Math.PI);
  bench(6.2, 1.1, Math.PI);

  function flowerBed(x, z, w, d) {
    box(w, 0.23, d, palette.peach, x, 0.115, z);
    box(w - 0.13, 0.05, d - 0.13, palette.lawn, x, 0.25, z);
    collide(x, z, w, d, 'flower-bed');
    // Six pooled low shrubs soften the planter edges without new geometry variants.
    for (const offset of [-0.7, 0, 0.7]) {
      sphere(1, offset === 0 ? palette.foliageLight : palette.foliage,
        x + offset, 0.38, z + 0.12, [0.44, 0.19, 0.27]);
    }
    for (let i = 0; i < 5; i++) {
      const px = x - w * 0.34 + i * w * 0.17;
      cylinder(0.014, 0.018, 0.28, palette.mintDark, px, 0.4, z, 5);
      sphere(0.09, i % 2 ? palette.cream : palette.flower, px, 0.565, z,
        [1, 0.65, 1]);
    }
  }
  flowerBed(-8.2, 2.9, 2.8, 0.82);
  flowerBed(8.2, 2.9, 2.8, 0.82);

  // Direction boards use actual Korean place names needed by the lesson.
  const directionPost = box(0.11, 1.8, 0.11, palette.wood, -2.35, 0.9, 0.15);
  const directionBoard = sign([{text: '← 학생회관 · 안내', size: 62, y: 64}, {text: '101호 · 강의동 →', size: 62, y: 157}],
    2.2, 0.73, -2.35, 1.8, 0.15,
    {width: 768, height: 224, background: '#fff7e5', border: '#85b4a4'});
  const directionSign = new THREE.Group();
  directionSign.name = 'campus-direction-sign';
  campus.add(directionSign);
  directionSign.add(directionPost, directionBoard);
  collide(-2.35, 0.15, 0.2, 0.2, 'direction-board-post');

  // Camera collision uses static campus solids, not collectible props or labels.
  // Compute this once, before discovery groups and objective sprites are added.
  const cameraObstacles = [];
  campus.updateMatrixWorld(true);
  campus.traverse(object => {
    if (!object.isMesh || object === ground) return;
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.max.y > 0.45) cameraObstacles.push(object);
  });

  // Real, unlabeled 3D objects: every visible edge/line below is mesh geometry.
  // The tabletop stays outside the canopy and leaves the central path open.
  const supplyTable = new THREE.Group();
  supplyTable.name = 'campus-discovery-table';
  supplyTable.position.set(-3.7, 0, 3);
  campus.add(supplyTable);
  box(3, 0.13, 1.55, palette.woodLight, 0, 1, 0, supplyTable);
  box(2.92, 0.09, 1.47, palette.cream, 0, 0.91, 0, supplyTable);
  for (const x of [-1.27, 1.27]) for (const z of [-0.57, 0.57]) {
    box(0.12, 0.88, 0.12, palette.mintDark, x, 0.44, z, supplyTable);
  }
  collide(-3.7, 3, 3, 1.55, 'discovery-table');
  const supplySurface = new THREE.Vector3(-3.7, 1.065, 3);
  const supplyDimensions = Object.freeze({width: 3, depth: 1.55, top: 1.065});
  const selectableObjects = [];
  const objectsById = new Map();
  function discoveryObject(id, x, z) {
    const group = new THREE.Group();
    group.name = `discovery-${id}`;
    group.userData.discoveryId = id;
    group.position.set(x, supplySurface.y, z);
    campus.add(group);
    selectableObjects.push(group);
    objectsById.set(id, group);
    return group;
  }

  const notebook = discoveryObject('notebook', -4.6, 3.3);
  notebook.rotation.y = -0.08;
  box(0.54, 0.025, 0.42, palette.terracotta, 0, 0.025, 0, notebook);
  box(0.49, 0.055, 0.38, palette.cream, 0.009, 0.061, 0, notebook);
  box(0.48, 0.009, 0.37, 0xfff9ed, 0.013, 0.094, 0, notebook);
  // Blank lined paper distinguishes the open spiral notebook from a closed book.
  for (const z of [-0.13, -0.075, -0.02, 0.035, 0.09, 0.145]) {
    box(0.34, 0.0015, 0.0025, 0xb1c6ce, 0.047, 0.1, z, notebook);
  }
  box(0.0025, 0.0015, 0.335, 0xe4aaa0, -0.13, 0.101, 0, notebook);
  for (const z of [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15]) {
    mesh(geometry('discovery:spiral', () => new THREE.TorusGeometry(0.042, 0.006, 5, 12)),
      material(palette.ink), -0.252, 0.064, z, notebook);
  }

  const pencil = discoveryObject('pencil', -3.75, 3.3);
  pencil.rotation.y = 0.2;
  cylinder(0.031, 0.031, 0.56, palette.gold, 0, 0.042, 0, 6, pencil).rotation.z = Math.PI / 2;
  cylinder(0, 0.031, 0.095, 0xdcb588, 0.327, 0.042, 0, 6, pencil).rotation.z = -Math.PI / 2;
  cylinder(0, 0.009, 0.032, palette.ink, 0.378, 0.042, 0, 6, pencil).rotation.z = -Math.PI / 2;
  cylinder(0.033, 0.033, 0.05, 0xb6bbb7, -0.286, 0.042, 0, 8, pencil).rotation.z = Math.PI / 2;
  cylinder(0.03, 0.03, 0.07, palette.flower, -0.341, 0.042, 0, 8, pencil).rotation.z = Math.PI / 2;

  const eraser = discoveryObject('eraser', -2.75, 3.3);
  eraser.rotation.y = -0.16;
  box(0.28, 0.095, 0.14, 0xf5e4d9, 0, 0.057, 0, eraser);
  box(0.14, 0.101, 0.146, palette.mint, -0.01, 0.06, 0, eraser);
  box(0.048, 0.006, 0.149, palette.cream, -0.037, 0.114, 0, eraser);

  const book = discoveryObject('book', -4.65, 2.65);
  book.rotation.y = 0.14;
  box(0.55, 0.035, 0.39, palette.mintDark, 0, 0.02, 0, book);
  box(0.50, 0.13, 0.34, palette.cream, 0.016, 0.095, 0, book);
  box(0.55, 0.035, 0.39, palette.mintDark, 0, 0.175, 0, book);
  box(0.044, 0.17, 0.39, palette.mintDark, -0.249, 0.097, 0, book);
  for (const y of [0.065, 0.10, 0.135]) {
    box(0.501, 0.002, 0.342, 0xd4ccb8, 0.016, y, 0, book);
  }
  box(0.023, 0.004, 0.29, palette.gold, 0.18, 0.195, 0, book);

  const bottle = discoveryObject('bottle', -3.75, 2.65);
  mesh(geometry('discovery:water-liquid', () => new THREE.CylinderGeometry(0.10, 0.10, 0.30, 12)),
    material(0x7cb6c0), 0, 0.172, 0, bottle);
  const shellMaterial = material(0xbce0df, {transparent: true, opacity: 0.44, depthWrite: false,
    roughness: 0.18, metalness: 0});
  mesh(geometry('discovery:water-shell', () => new THREE.CylinderGeometry(0.087, 0.12, 0.40, 12)),
    shellMaterial, 0, 0.22, 0, bottle);
  mesh(geometry('discovery:water-shoulder', () => new THREE.CylinderGeometry(0.047, 0.087, 0.075, 12)),
    shellMaterial, 0, 0.455, 0, bottle);
  cylinder(0.047, 0.047, 0.064, 0xbce0df, 0, 0.522, 0, 10, bottle);
  cylinder(0.055, 0.055, 0.043, palette.mintDark, 0, 0.575, 0, 10, bottle);
  for (const y of [0.13, 0.23, 0.33]) {
    const ridge = mesh(geometry('discovery:bottle-ridge', () => new THREE.TorusGeometry(0.108, 0.004, 4, 12)),
      material(0xcce8e1), 0, y, 0, bottle);
    ridge.rotation.x = Math.PI / 2;
  }

  const ruler = discoveryObject('ruler', -2.8, 2.65);
  ruler.rotation.y = -0.1;
  box(0.66, 0.022, 0.13, 0xd9b782, 0, 0.022, 0, ruler);
  for (let index = 0; index < 13; index++) {
    const long = index % 3 === 0;
    box(0.004, 0.002, long ? 0.055 : 0.029, palette.ink,
      -0.285 + index * 0.0475, 0.034, -0.035, ruler);
  }

  // A separate mesh-built bag provides the physical packing destination.
  const bagStand = new THREE.Group();
  bagStand.position.set(-1.5, 0, 3.45);
  campus.add(bagStand);
  box(0.78, 0.10, 0.66, palette.woodLight, 0, 0.54, 0, bagStand);
  for (const x of [-0.27, 0.27]) for (const z of [-0.20, 0.20]) {
    box(0.08, 0.49, 0.08, palette.mintDark, x, 0.245, z, bagStand);
  }
  collide(-1.5, 3.45, 0.78, 0.66, 'supply-bag-stand');
  const supplyBag = new THREE.Group();
  supplyBag.name = 'discovery-bag';
  supplyBag.userData.interactableKey = 'bag';
  supplyBag.position.set(-1.5, 0.59, 3.45);
  campus.add(supplyBag);
  box(0.54, 0.58, 0.30, palette.mint, 0, 0.31, 0, supplyBag);
  box(0.39, 0.20, 0.075, palette.mintDark, 0, 0.22, 0.185, supplyBag);
  box(0.50, 0.045, 0.26, palette.ink, 0, 0.615, 0, supplyBag);
  for (const x of [-0.19, 0.19]) {
    box(0.07, 0.53, 0.045, palette.mintDark, x, 0.32, -0.178, supplyBag);
  }
  const handle = mesh(geometry('discovery:bag-handle', () => new THREE.TorusGeometry(0.125, 0.025, 6, 16)),
    material(palette.mintDark), 0, 0.69, 0, supplyBag);
  handle.scale.y = 0.75;
  const packedContents = new THREE.Group();
  packedContents.visible = false;
  supplyBag.add(packedContents);
  box(0.28, 0.17, 0.06, palette.terracotta, -0.08, 0.67, 0, packedContents);
  cylinder(0.024, 0.024, 0.23, palette.gold, 0.12, 0.71, 0, 6, packedContents);
  box(0.12, 0.075, 0.07, palette.cream, 0.02, 0.67, 0.07, packedContents);

  const targets = {
    entrance: new THREE.Vector3(-6.7, 0, -4.5),
    sua: new THREE.Vector3(-3.2, 0, -3.5),
    desk: new THREE.Vector3(-4, 0, -4),
    supplies: new THREE.Vector3(-3.7, 0, 4.65),
    bag: new THREE.Vector3(-1.35, 0, 4.5),
    minsu: new THREE.Vector3(3, 0, -2),
    classroom: new THREE.Vector3(6, 0, -5),
  };
  const objectiveLabels = {entrance: '학생회관 입구', sua: '수아', desk: '안내',
    minsu: '민수', classroom: '101호', supplies: '준비물', bag: '정리하기'};
  const markers = new Map();
  for (const [name, position] of Object.entries(targets)) {
    const marker = new THREE.Group();
    marker.name = `objective-${name}`;
    marker.position.copy(position);
    marker.visible = false;
    campus.add(marker);
    const ring = mesh(geometry('objective:ring', () => new THREE.TorusGeometry(0.53, 0.045, 6, 32)),
      material(palette.gold, {emissive: 0x805415, emissiveIntensity: 0.18}),
      0, 0.066, 0, marker);
    ring.rotation.x = Math.PI / 2;
    const texture = lettering([{text: objectiveLabels[name], size: 78, y: 93}],
      {width: 512, height: 186, background: '#fff7e5', color: '#49796e', rounded: true, border: '#f4b75d'});
    const labelMaterial = new THREE.SpriteMaterial({map: texture, transparent: true,
      toneMapped: false, depthWrite: false});
    materials.set(`objective:${name}`, labelMaterial);
    const label = new THREE.Sprite(labelMaterial);
    label.position.set(0, name === 'entrance' ? 3.7 : 2.35, 0);
    label.scale.set(name === 'entrance' ? 2.6 : 1.65, name === 'entrance' ? 0.94 : 0.6, 1);
    marker.add(label);
    markers.set(name, marker);
  }

  return {
    walkBounds: {minX: -11.4, maxX: 11.4, minZ: -11.4, maxZ: 11.4},
    obstacles,
    targets,
    spawn: new THREE.Vector3(0, 0, 9),
    deskSurface: new THREE.Vector3(-5.3, 1.045, -3.8),
    ground,
    directionSign,
    canopy,
    canopyFootprint,
    cameraObstacles,
    selectableObjects,
    supplyTable,
    supplySurface,
    supplyDimensions,
    supplyBag,
    setCollected(ids) {
      if (disposed || !Array.isArray(ids)) return;
      for (const [id, object] of objectsById) {
        object.visible = !(['notebook', 'pencil', 'eraser'].includes(id) && ids.includes(id));
      }
    },
    setBagPacked(packed) {
      if (!disposed) packedContents.visible = packed === true;
    },
    getResourceCounts() {
      return {geometries: geometries.size, materials: materials.size, textures: textures.size};
    },
    setCanopyVisible(visible) {
      if (!disposed) canopy.visible = visible === true;
    },
    gate,
    setGateOpacity(value) {
      if (disposed || !Number.isFinite(value)) return;
      const next = THREE.MathUtils.clamp(value, 0, 1);
      if (next === gateOpacity) return;
      gateOpacity = next;
      for (const mat of gateMaterials.values()) {
        const transparent = next < 1;
        if (mat.transparent !== transparent) {
          mat.transparent = transparent;
          mat.needsUpdate = true;
        }
        mat.opacity = next;
        mat.depthWrite = !transparent;
      }
      gate.traverse(object => { if (object.isMesh) object.castShadow = next >= 0.95; });
    },
    setObjective(name) {
      if (disposed) return;
      for (const [key, marker] of markers) marker.visible = key === name;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(campus);
      for (const shape of geometries.values()) shape.dispose();
      for (const mat of materials.values()) mat.dispose();
      for (const texture of textures) texture.dispose();
      geometries.clear();
      materials.clear();
      textures.clear();
      markers.clear();
      gateMaterials.clear();
      objectsById.clear();
      selectableObjects.length = 0;
      cameraObstacles.length = 0;
    },
  };
}
