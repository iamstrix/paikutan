import * as THREE from 'three';
import { decal, glowDecal, groundDecal, poster } from './decals.js';
import { ball, box, cyl, mat, noiseTexture, rod, signMaterial } from './kit.js';

// Procedural low-poly barangay props. Each builder returns a Group at the
// origin, front facing +z; Barangay.ts places, rotates and bakes them.

const C = {
  wood: '#8a5a33',
  woodDark: '#5e3b20',
  bamboo: '#c9a35c',
  bambooDark: '#a07d3e',
  concrete: '#cfc6b4',
  concreteDark: '#a39a89',
  rust: '#94603e',
  galv: '#a3a9ab',
  white: '#f1ece0',
  glass: '#33424a',
  black: '#2a2522',
  leaf: '#4f8a3a',
  leafDark: '#3a6d2c',
  leafLight: '#7cb342',
};

let shared

         = null;

function sharedMats() {
  if (shared) return shared;
  const sawali = noiseTexture('#c8a466', ['#9c7a42', '#e2c88e'], { stripes: '#ad8b52', count: 900 });
  sawali.repeat.set(3, 2);
  const thatch = noiseTexture('#b48f55', ['#7f6233', '#d9b779', '#9a7742'], { count: 2600 });
  thatch.repeat.set(2, 2);
  const rust = noiseTexture('#9a6343', ['#6e3f26', '#b5825a', '#857d76'], { stripes: '#7c4c31', count: 1200 });
  rust.repeat.set(4, 1);
  const galv = noiseTexture('#a7adae', ['#7f8687', '#c4c8c8', '#9a6a4c'], { stripes: '#8e9596', count: 900 });
  galv.repeat.set(4, 1);
  const m = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, flatShading: true });
  shared = { sawali: m(sawali), thatch: m(thatch), rustRoof: m(rust), galvRoof: m(galv) };
  shared.galvRoof.metalness = 0.3;
  // Corrugated sheets are single surfaces seen from above and (under awnings) below.
  shared.rustRoof.side = THREE.DoubleSide;
  shared.galvRoof.side = THREE.DoubleSide;
  return shared;
}

/** Corrugated GI sheet: real ridges across its width (x), length along z. */
function sheet(g, w, len, material, p, r) {
  const waves = Math.max(4, Math.round(w / 0.14));
  const geo = new THREE.PlaneGeometry(w, len, waves * 4, 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) pos.setY(i, Math.sin((pos.getX(i) / w) * waves * Math.PI * 2) * 0.025);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...p);
  mesh.rotation.set(...r);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
}

/** Gable roof with the ridge along x. */
function gableRoof(g, w, d, h, y, material) {
  const slope = Math.atan2(h, d / 2);
  const len = Math.hypot(h, d / 2) + 0.15;
  sheet(g, w, len, material, [0, y + h / 2, d / 4], [slope, 0, 0]);
  sheet(g, w, len, material, [0, y + h / 2, -d / 4], [-slope, 0, 0]);
  // Ridge cap and the old tyres everyone throws on the roof against typhoon winds.
  box(g, [w + 0.05, 0.06, 0.26], C.galv, [0, y + h + 0.02, 0]);
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 5, 10), mat('#1d1d1d'));
  tire.position.set(w * 0.22, y + h * 0.55, d * 0.22);
  tire.rotation.set(Math.PI / 2 + slope, 0, 0);
  tire.castShadow = true;
  g.add(tire);
}

export function monobloc(g, p, ry = 0, color = '#f4f1ea') {
  const c = new THREE.Group();
  box(c, [0.45, 0.05, 0.42], color, [0, 0.44, 0]);
  box(c, [0.45, 0.42, 0.05], color, [0, 0.68, -0.22], [-0.15, 0, 0]);
  for (const [x, z] of [
    [-0.19, -0.18],
    [0.19, -0.18],
    [-0.19, 0.18],
    [0.19, 0.18],
  ]) {
    box(c, [0.05, 0.44, 0.05], color, [x, 0.22, z]);
  }
  c.position.set(...p);
  c.rotation.y = ry;
  g.add(c);
}

function tirePlanter(g, p, paint, flower) {
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 5, 10), mat(paint));
  tire.rotation.x = Math.PI / 2;
  tire.position.set(p[0], 0.11, p[2]);
  tire.castShadow = true;
  g.add(tire);
  ball(g, 0.3, C.leaf, [p[0], 0.35, p[2]], [1, 0.8, 1]);
  for (let i = 0; i < 4; i += 1) {
    const a = i * 1.7;
    ball(g, 0.07, flower, [p[0] + Math.cos(a) * 0.2, 0.55, p[2] + Math.sin(a) * 0.2]);
  }
}

const WARM = '#ffc46b';
const COOL = '#d4eaff';

/** Jalousie window; the glass glows warm (bombilya) or cool (fluorescent) at dusk. */
function jalousie(g, x, y, z, w = 0.9, h = 0.9, light = WARM) {
  box(g, [w + 0.12, h + 0.12, 0.08], C.white, [x, y, z]);
  box(g, [w, h, 0.06], mat(C.glass, light), [x, y, z + 0.02]);
  for (let i = 0; i < 5; i += 1) box(g, [w, 0.03, 0.1], '#c9d2d3', [x, y - h / 2 + (i + 0.5) * (h / 5), z + 0.06], [0.5, 0, 0]);
  // Iron grill swirls simplified to bars.
  for (let i = 1; i < 4; i += 1) box(g, [0.02, h, 0.02], C.black, [x - w / 2 + (i * w) / 4, y, z + 0.1]);
}

export function nipaHut() {
  const g = new THREE.Group();
  const m = sharedMats();
  for (const [x, z] of [
    [-1.4, -1.1],
    [1.4, -1.1],
    [-1.4, 1.1],
    [1.4, 1.1],
  ]) {
    cyl(g, 0.08, 0.1, 1.05, C.bambooDark, [x, 0.52, z]);
  }
  box(g, [3.3, 0.14, 2.7], '#8a6a3a', [0, 1.06, 0]);
  box(g, [3.0, 1.45, 2.4], m.sawali, [0, 1.85, 0]);
  for (const x of [-1.5, 1.5]) for (const z of [-1.2, 1.2]) cyl(g, 0.06, 0.06, 1.5, C.bambooDark, [x, 1.85, z]);
  box(g, [0.7, 1.15, 0.06], C.woodDark, [0.75, 1.72, 1.22]);
  // Gasera light inside the hut, spilling onto the yard.
  box(g, [0.9, 0.6, 0.06], mat('#22170e', '#ff9a3c'), [-0.7, 1.95, 1.22]);
  glowDecal(g, '#ff9a3c', 2.2, 1.8, -0.7, 2.2);
  box(g, [0.95, 0.06, 0.65], C.bamboo, [-0.7, 2.3, 1.5], [-0.9, 0, 0]);
  const roofGeo = new THREE.ConeGeometry(2.55, 1.7, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1.3, 1, 1.15);
  const roof = new THREE.Mesh(roofGeo, m.thatch);
  roof.position.y = 3.42;
  roof.castShadow = true;
  g.add(roof);
  // Ladder up to the door.
  rod(g, [0.45, 0, 2.0], [0.5, 1.1, 1.38], 0.04, C.bambooDark);
  rod(g, [1.05, 0, 2.0], [1.0, 1.1, 1.38], 0.04, C.bambooDark);
  for (let i = 1; i < 4; i += 1) box(g, [0.6, 0.04, 0.05], C.bamboo, [0.75, i * 0.27, 2.0 - i * 0.15]);
  // Potted plants by the stilts.
  tirePlanter(g, [-1.0, 0, 1.8], '#e85d5d', '#ffd23f');
  return g;
}

export function concreteHouse(wall, roofKind, variant) {
  const g = new THREE.Group();
  const m = sharedMats();
  const w = 4.4 + (variant % 2) * 0.8;
  const d = 3.8;
  const h = 2.8;
  box(g, [w + 0.3, 0.2, d + 0.6], C.concreteDark, [0, 0.1, 0.15]);
  box(g, [w, h, d], wall, [0, 0.2 + h / 2, 0]);
  box(g, [w + 0.02, 0.5, d + 0.02], new THREE.Color(wall).multiplyScalar(0.75).getStyle(), [0, 0.45, 0]);
  gableRoof(g, w + 0.6, d + 0.8, 1.1, 0.2 + h, roofKind === 'rust' ? m.rustRoof : m.galvRoof);
  // Gable ends.
  const gable = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, 1.05)]);
  for (const side of [-1, 1]) {
    const tri = new THREE.Mesh(new THREE.ShapeGeometry(gable), mat(wall));
    tri.rotation.y = side * Math.PI / 2;
    tri.position.set(side * (w / 2 + 0.005), 0.2 + h, 0);
    g.add(tri);
  }
  box(g, [0.9, 1.9, 0.08], C.woodDark, [w / 4, 1.15, d / 2 + 0.02]);
  box(g, [1.3, 0.06, 0.7], C.galv, [w / 4, 2.25, d / 2 + 0.35], [-0.2, 0, 0]);
  const light = variant % 2 ? COOL : WARM;
  jalousie(g, -w / 4, 1.6, d / 2 + 0.03, 0.9, 0.9, light);
  if (variant % 3 === 0) jalousie(g, w / 2 + 0.03, 1.6, 0, 0.9, 0.9, light);
  glowDecal(g, light, 2.0, 1.8, -w / 4, d / 2 + 1.4);
  monobloc(g, [-w / 4 - 0.5, 0, d / 2 + 0.7], 0.3);
  monobloc(g, [-w / 4 + 0.3, 0, d / 2 + 0.8], -0.2, '#e8473f');
  tirePlanter(g, [w / 2 - 0.3, 0, d / 2 + 0.7], '#3f8fd8', '#ff5d8f');
  tirePlanter(g, [w / 2 + 0.4, 0, d / 2 + 0.4], '#f2c230', '#ff7b39');
  // Wear: rain streaks under the eave and sill, peeled paint, moss at the base, a crack.
  const fz = d / 2 + 0.013;
  decal(g, 'streaks', w * 0.96, 1.0, [0, h - 0.3, fz]);
  decal(g, 'streaks', 1.0, 0.9, [-w / 4, 0.7, fz]);
  decal(g, 'chips', 1.1, 0.8, [variant % 2 ? -w / 2 + 0.7 : w / 2 - 0.6, 1.9 - (variant % 3) * 0.4, fz], 0, variant);
  decal(g, 'moss', w, 0.7, [0, 0.55, fz + 0.001]);
  decal(g, 'crack', 0.7, 1.2, [w / 2 - 0.4, 1.0, fz], 0, 0.2 * variant);
  decal(g, 'streaks', d * 0.96, 1.0, [w / 2 + 0.013, h - 0.3, 0], Math.PI / 2);
  decal(g, 'moss', d, 0.7, [w / 2 + 0.014, 0.55, 0], Math.PI / 2);
  const posters = [
    [['VOTE', 'KAP. BONG', 'Serbisyong Totoo'], '#f4e4a6', '#1f5fa8'],
    [['PA-LOAD', 'DITO', 'Smart · Globe · TNT'], '#ffffff', '#c0392b'],
    [['BAWAL', 'UMIHI DITO!'], '#f4efe3', '#b03a2e'],
  ];
  const [lines, bg, fg] = posters[variant % posters.length];
  poster(g, lines, { bg, fg, w: 0.55, h: 0.75, p: [-w / 2 + 0.5, 1.35, fz + 0.002], tilt: 0.04 * (variant - 2) });
  return g;
}

export function sariSari() {
  const g = new THREE.Group();
  const m = sharedMats();
  const w = 4.6;
  const d = 3.4;
  box(g, [w + 0.4, 0.18, d + 1.8], C.concreteDark, [0, 0.09, 0.6]);
  box(g, [w, 3.0, d], '#f0deb0', [0, 1.6, -0.1]);
  // Store front: low counter wall, window opening with grill, header.
  box(g, [w, 1.0, 0.18], '#c4473a', [0, 0.68, d / 2]);
  box(g, [w, 0.55, 0.18], '#c4473a', [0, 2.85, d / 2]);
  // Lit store interior behind the grill: the brightest thing on the street at night.
  box(g, [w - 0.2, 1.4, 0.05], mat('#3a2a1e', '#ffeec8'), [0, 1.85, d / 2 - 0.25]);
  glowDecal(g, '#fff1d0', 5.0, 1.4, 0, d / 2 + 0.75, 0.19);
  glowDecal(g, '#fff1d0', 6.0, 2.6, 0, d / 2 + 2.6);
  // Goods on shelves behind the grill.
  const goods = ['#e94b3c', '#f7c548', '#2f7dd1', '#53b36a', '#ffffff', '#ff8a3d', '#9b59b6'];
  for (let row = 0; row < 3; row += 1) {
    box(g, [w - 0.4, 0.04, 0.3], C.wood, [0, 1.3 + row * 0.42, d / 2 - 0.15]);
    for (let i = 0; i < 14; i += 1) {
      const color = goods[(i * 3 + row * 5) % goods.length];
      if ((i + row) % 3 === 0) cyl(g, 0.05, 0.05, 0.26, color, [-1.95 + i * 0.3, 1.45 + row * 0.42, d / 2 - 0.12], undefined, 6);
      else box(g, [0.18, 0.24, 0.12], color, [-1.95 + i * 0.3, 1.44 + row * 0.42, d / 2 - 0.12]);
    }
  }
  for (let i = 0; i <= 18; i += 1) box(g, [0.025, 1.4, 0.025], '#2b2b2b', [-w / 2 + 0.15 + i * ((w - 0.3) / 18), 1.85, d / 2 + 0.06]);
  box(g, [w, 0.03, 0.03], '#2b2b2b', [0, 1.4, d / 2 + 0.06]);
  // Hanging chip and shampoo sachet strips.
  for (let i = 0; i < 9; i += 1) {
    for (let k = 0; k < 4; k += 1) {
      box(g, [0.16, 0.2, 0.02], goods[(i + k * 2) % goods.length], [-2 + i * 0.5, 2.45 - k * 0.22, d / 2 + 0.12]);
    }
  }
  // Awning (single-slope GI) over the bench.
  sheet(g, w + 0.8, 2.2, m.rustRoof, [0, 3.05, d / 2 + 1.0], [0.18, 0, 0]);
  for (const x of [-w / 2 - 0.2, w / 2 + 0.2]) cyl(g, 0.06, 0.06, 2.85, C.woodDark, [x, 1.5, d / 2 + 1.95]);
  box(g, [w + 0.6, 1.0, 0.1], C.wood, [0, 3.7, d / 2 - 0.05]);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.4, 0.9),
    signMaterial(['ALING NENA', 'SARI-SARI STORE'], { bg: '#f6e7b8', fg: '#c0392b', border: '#1f5fa8', w: 512, h: 112 }),
  );
  sign.position.set(0, 3.7, d / 2 + 0.01);
  g.add(sign);
  const cola = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 1.0),
    signMaterial(['Koka-Kula', 'Isang Sarap!'], { bg: '#d62d20', fg: '#ffffff', w: 256, h: 256 }),
  );
  cola.position.set(w / 2 + 0.001, 2.3, 0.6);
  cola.rotation.y = Math.PI / 2;
  g.add(cola);
  const ice = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.45),
    signMaterial(['ICE TUBIG 5', 'ICE CANDY 3'], { bg: '#ffffff', fg: '#1f5fa8', w: 256, h: 128 }),
  );
  ice.position.set(-1.6, 0.7, d / 2 + 0.1);
  g.add(ice);
  // Bench, cooler, crate of bottles.
  box(g, [2.6, 0.08, 0.4], C.wood, [0.2, 0.45, d / 2 + 1.3]);
  for (const x of [-0.9, 1.3]) box(g, [0.08, 0.45, 0.35], C.woodDark, [x, 0.22, d / 2 + 1.3]);
  box(g, [0.7, 0.5, 0.45], '#d7372e', [-1.9, 0.25, d / 2 + 0.7]);
  box(g, [0.72, 0.08, 0.47], '#f4f1ea', [-1.9, 0.52, d / 2 + 0.7]);
  box(g, [0.55, 0.3, 0.4], '#f2c230', [1.9, 0.15, d / 2 + 0.6]);
  for (let i = 0; i < 6; i += 1) cyl(g, 0.035, 0.04, 0.32, '#3d2412', [1.72 + (i % 3) * 0.17, 0.4, d / 2 + 0.5 + Math.floor(i / 3) * 0.18], undefined, 5);
  // The famous sign, scuffed paint on the counter wall, grime on the side walls.
  poster(g, ['BAWAL ANG UTANG!', 'Bukas pwede.'], { bg: '#fffbe8', fg: '#c0392b', w: 0.9, h: 0.42, p: [1.55, 0.78, d / 2 + 0.1], tilt: -0.03 });
  poster(g, ['PA-LOAD DITO'], { bg: '#ffd23f', fg: '#1d1d1d', w: 0.7, h: 0.28, p: [-0.4, 0.95, d / 2 + 0.1], tilt: 0.04 });
  decal(g, 'chips', 1.4, 0.8, [-0.8, 0.6, d / 2 + 0.1]);
  decal(g, 'rust', w * 0.95, 0.45, [0, 0.95, d / 2 + 0.1]);
  for (const side of [-1, 1]) {
    decal(g, 'streaks', d * 0.9, 1.3, [side * (w / 2 + 0.013), 2.4, -0.1], side * Math.PI / 2);
    decal(g, 'moss', d * 0.9, 0.7, [side * (w / 2 + 0.014), 0.5, -0.1], side * Math.PI / 2);
  }
  groundDecal(g, 'stain', 1.2, 1.2, 1.9, d / 2 + 0.75, 0.6, 0.19);
  return g;
}

export function mangoTree() {
  const g = new THREE.Group();
  cyl(g, 0.28, 0.42, 3.2, '#5b4130', [0, 1.6, 0], undefined, 7);
  rod(g, [0, 2.6, 0], [1.4, 3.8, 0.4], 0.14, '#5b4130');
  rod(g, [0, 2.8, 0], [-1.2, 4.0, -0.6], 0.14, '#5b4130');
  const blobs = [
    [0, 4.6, 0, 2.2],
    [1.7, 4.1, 0.6, 1.6],
    [-1.6, 4.2, -0.5, 1.7],
    [0.4, 4.0, -1.6, 1.5],
    [-0.5, 4.1, 1.6, 1.5],
    [0.2, 5.6, 0.2, 1.4],
  ];
  blobs.forEach(([x, y, z, r], i) => ball(g, r, i % 2 ? C.leafDark : '#3f7a33', [x, y, z], [1, 0.75, 1], 1));
  for (let i = 0; i < 7; i += 1) {
    const a = i * 0.9;
    ball(g, 0.1, '#e8c547', [Math.cos(a) * 1.9, 3.3 + (i % 3) * 0.2, Math.sin(a) * 1.9], [0.8, 1.2, 0.8]);
  }
  return g;
}

export function coconutTree(height, lean) {
  const g = new THREE.Group();
  const segs = 6;
  let x = 0;
  let y = 0;
  for (let i = 0; i < segs; i += 1) {
    const nx = x + lean * (i / segs) * 0.5;
    const ny = y + height / segs;
    rod(g, [x, y, 0], [nx, ny, 0], 0.17 - i * 0.012, i % 2 ? '#8b6b4a' : '#7b5d3f', 6);
    x = nx;
    y = ny;
  }
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    const frond = new THREE.Group();
    box(frond, [1.4, 0.03, 0.42], i % 2 ? C.leaf : C.leafLight, [0.7, 0, 0], [0, 0, 0.25]);
    box(frond, [1.3, 0.03, 0.32], i % 2 ? C.leafDark : C.leaf, [1.95, -0.45, 0], [0, 0, -0.55]);
    frond.position.set(x, y, 0);
    frond.rotation.y = a;
    g.add(frond);
  }
  for (let i = 0; i < 3; i += 1) ball(g, 0.15, '#6b8f2a', [x + Math.cos(i * 2.1) * 0.22, y - 0.25, Math.sin(i * 2.1) * 0.22]);
  return g;
}

export function bananaTree() {
  const g = new THREE.Group();
  cyl(g, 0.12, 0.18, 2.0, '#7f8f45', [0, 1.0, 0]);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Group();
    box(leaf, [1.7, 0.02, 0.55], i % 2 ? C.leafLight : '#8bc34a', [0.85, 0, 0], [0.2, 0, 0.5 - (i % 3) * 0.25]);
    leaf.position.y = 2.0;
    leaf.rotation.y = i * 1.05;
    g.add(leaf);
  }
  ball(g, 0.16, '#6d3b47', [0.25, 1.75, 0.1], [0.8, 1.4, 0.8]);
  return g;
}

export function basketballCourt() {
  const g = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 448;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b9b2a2';
  ctx.fillRect(0, 0, 512, 448);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 428);
  ctx.strokeRect(186, 10, 140, 170);
  ctx.beginPath();
  ctx.arc(256, 180, 70, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(256, 40, 230, 0.05, Math.PI - 0.05);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(8, 0.08, 7), [
    mat(C.concreteDark),
    mat(C.concreteDark),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
    mat(C.concreteDark),
    mat(C.concreteDark),
    mat(C.concreteDark),
  ]);
  slab.position.y = 0.04;
  slab.receiveShadow = true;
  slab.rotation.y = Math.PI;
  g.add(slab);
  cyl(g, 0.07, 0.07, 3.6, '#2f6fd1', [0, 1.8, -3.9]);
  rod(g, [0, 3.2, -3.9], [0, 3.2, -3.2], 0.06, '#2f6fd1');
  box(g, [1.8, 1.1, 0.06], '#d9c497', [0, 3.35, -3.15]);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.0),
    signMaterial(['', 'Kap. Bong', ''], { bg: '#e6d3a5', fg: '#b03a2e', border: '#ffffff', w: 256, h: 150 }),
  );
  board.position.set(0, 3.35, -3.11);
  g.add(board);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 4, 12), mat('#e8622c'));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 3.0, -2.85);
  g.add(ring);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    rod(g, [Math.cos(a) * 0.23, 3.0, -2.85 + Math.sin(a) * 0.23], [Math.cos(a) * 0.12, 2.6, -2.85 + Math.sin(a) * 0.12], 0.008, '#f4f1ea', 3);
  }
  return g;
}

export function waitingShed() {
  const g = new THREE.Group();
  box(g, [3.6, 0.15, 1.8], C.concrete, [0, 0.07, 0]);
  for (const x of [-1.6, 1.6]) for (const z of [-0.7, 0.7]) box(g, [0.18, 2.4, 0.18], C.concrete, [x, 1.25, z]);
  box(g, [4.0, 0.15, 2.3], '#3f8fd8', [0, 2.5, 0], [0.08, 0, 0]);
  box(g, [3.2, 0.1, 0.45], C.concreteDark, [0, 0.5, -0.4]);
  box(g, [3.2, 0.45, 0.1], C.concreteDark, [0, 0.8, -0.65]);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 0.5),
    signMaterial(['WAITING SHED', 'Proyekto ni Kap. Bong Dimagiba'], { bg: '#ffffff', fg: '#1f5fa8', w: 512, h: 96 }),
  );
  sign.position.set(0, 2.3, 1.16);
  g.add(sign);
  // Marker graffiti on the backrest: every waiting shed has one.
  poster(g, ['J ♥ M', 'forever 2009'], { bg: null, fg: '#2b2b2b', w: 0.9, h: 0.38, p: [0.6, 0.82, -0.59], tilt: 0.08, hand: true });
  poster(g, ['RENZ WAS HERE'], { bg: null, fg: '#c0392b', w: 0.9, h: 0.22, p: [-0.9, 0.9, -0.59], tilt: -0.05, hand: true });
  decal(g, 'stain', 1.0, 0.4, [0, 0.62, -0.59]);
  return g;
}

export function barangayHall() {
  const g = new THREE.Group();
  box(g, [7.4, 0.3, 5.6], C.concreteDark, [0, 0.15, 0]);
  box(g, [7, 3.2, 5], '#f4efe3', [0, 1.9, 0]);
  box(g, [7.05, 0.3, 5.05], '#1f5fa8', [0, 3.4, 0]);
  box(g, [7.05, 0.5, 5.05], '#1f5fa8', [0, 0.55, 0]);
  gableRoof(g, 7.6, 5.8, 1.3, 3.5, sharedMats().rustRoof);
  for (const x of [-2.4, 2.4]) jalousie(g, x, 1.9, 2.53, 1.3, 1.0, COOL);
  glowDecal(g, COOL, 6.5, 2.2, 0, 4.3);
  box(g, [1.4, 2.2, 0.08], '#6d4527', [0, 1.4, 2.53]);
  box(g, [2.2, 0.15, 0.8], C.concrete, [0, 0.07, 3.1]);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 0.8),
    signMaterial(['BARANGAY HALL', 'Brgy. Maligaya'], { bg: '#1f5fa8', fg: '#ffffff', border: '#f2c230', w: 512, h: 96 }),
  );
  sign.position.set(0, 2.95, 2.54);
  g.add(sign);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.9),
    signMaterial(['PAALALA', 'Bawal magtapon', 'ng basura dito!'], { bg: '#f8f3e3', fg: '#b03a2e', w: 256, h: 192 }),
  );
  board.position.set(-3.51, 1.7, 1.2);
  board.rotation.y = -Math.PI / 2;
  g.add(board);
  decal(g, 'streaks', 6.8, 1.2, [0, 2.6, 2.513]);
  decal(g, 'moss', 7, 0.8, [0, 0.75, 2.514]);
  decal(g, 'chips', 1.2, 0.9, [-1.2, 1.2, 2.513], 0, 1);
  decal(g, 'crack', 0.8, 1.4, [3.0, 1.6, 2.513]);
  poster(g, ['BARANGAY ASSEMBLY', 'Linggo, 3:00 PM', 'Libreng merienda!'], { bg: '#ffffff', fg: '#1f5fa8', w: 0.8, h: 0.6, p: [-1.4, 1.75, 2.53], tilt: -0.05 });
  poster(g, ['BAKUNA', 'PARA SA BATA', 'Huwebes'], { bg: '#e8f4ff', fg: '#2f7dd1', w: 0.6, h: 0.6, p: [1.35, 1.8, 2.53], tilt: 0.06 });
  // Flagpole with the Philippine flag.
  cyl(g, 0.05, 0.07, 6.5, '#d8d8d8', [4.8, 3.25, 3.4]);
  box(g, [0.8, 0.3, 0.8], C.concrete, [4.8, 0.15, 3.4]);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8, 8, 1), new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.8 }));
  flag.geometry.translate(0.8, 0, 0);
  flag.position.set(4.85, 6.0, 3.4);
  flag.castShadow = true;
  return { group: g, flag };
}

function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#0038a8';
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#ce1126';
  x.fillRect(0, 64, 256, 64);
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(0, 0);
  x.lineTo(111, 64);
  x.lineTo(0, 128);
  x.fill();
  x.fillStyle = '#fcd116';
  x.beginPath();
  x.arc(38, 64, 13, 0, Math.PI * 2);
  x.fill();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    x.fillRect(38 + Math.cos(a) * 20 - 2, 64 + Math.sin(a) * 20 - 2, 4, 4);
  }
  for (const [sx, sy] of [
    [9, 12],
    [9, 116],
    [92, 64],
  ]) {
    x.beginPath();
    x.arc(sx, sy, 5, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wheel(g, p, r, w = 0.12) {
  cyl(g, r, r, w, '#1d1d1d', p, [Math.PI / 2, 0, 0], 10);
  cyl(g, r * 0.5, r * 0.5, w + 0.01, C.galv, p, [Math.PI / 2, 0, 0], 8);
}

export function tricycle(color) {
  const g = new THREE.Group();
  // Motorcycle along x, sidecar on +z.
  wheel(g, [0.75, 0.3, 0], 0.3);
  wheel(g, [-0.6, 0.3, 0], 0.3);
  box(g, [1.1, 0.3, 0.25], '#222', [0.05, 0.6, 0]);
  box(g, [0.55, 0.12, 0.3], '#111', [-0.2, 0.82, 0]);
  rod(g, [0.75, 0.3, 0], [0.55, 1.05, 0], 0.03, C.galv);
  rod(g, [0.55, 1.05, -0.32], [0.55, 1.05, 0.32], 0.025, C.galv);
  box(g, [0.3, 0.3, 0.3], color, [0.45, 0.75, 0]);
  wheel(g, [0.1, 0.3, 1.25], 0.28);
  box(g, [1.7, 0.75, 1.0], color, [0.05, 0.85, 1.05]);
  box(g, [1.75, 0.08, 1.15], '#f4f1ea', [0.05, 1.85, 1.0]);
  for (const x of [-0.75, 0.85]) box(g, [0.06, 0.95, 0.06], '#f4f1ea', [x, 1.38, 1.5]);
  box(g, [0.05, 0.55, 0.9], '#9ecfe0', [0.88, 1.5, 1.05]);
  box(g, [1.72, 0.12, 0.05], '#f2c230', [0.05, 1.15, 1.56]);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), signMaterial(['MALIGAYA TODA'], { bg: '#f2c230', fg: '#1d1d1d', w: 256, h: 64 }));
  plate.position.set(0.05, 1.7, 1.58);
  g.add(plate);
  return g;
}

export function jeepney() {
  const g = new THREE.Group();
  // Long axis along x, front at +x.
  for (const x of [1.7, -1.8]) for (const z of [-0.8, 0.8]) wheel(g, [x, 0.38, z], 0.38, 0.22);
  box(g, [4.4, 1.0, 1.75], '#e9e2cf', [-0.5, 1.15, 0]);
  box(g, [1.4, 0.75, 1.6], '#e9e2cf', [2.4, 1.0, 0]);
  box(g, [0.1, 0.55, 1.5], '#9ea7a9', [3.12, 0.95, 0]);
  box(g, [0.25, 0.15, 1.9], C.galv, [3.2, 0.55, 0]);
  for (const z of [-0.55, 0.55]) ball(g, 0.12, '#fff7c2', [3.15, 1.0, z]);
  box(g, [4.4, 0.7, 1.7], C.glass, [-0.5, 2.0, 0]);
  for (let i = 0; i < 7; i += 1) box(g, [0.08, 0.7, 1.78], '#e9e2cf', [-2.6 + i * 0.68, 2.0, 0]);
  box(g, [5.0, 0.12, 1.9], '#e9e2cf', [-0.3, 2.42, 0]);
  box(g, [0.2, 0.9, 1.75], '#e9e2cf', [1.65, 1.95, 0]);
  box(g, [0.06, 0.5, 1.4], '#9ecfe0', [1.78, 2.0, 0], [0, 0, 0.25]);
  for (const [y, c] of [
    [0.85, '#d62d20'],
    [1.0, '#f2c230'],
    [1.5, '#1f5fa8'],
  ]) {
    box(g, [4.42, 0.08, 1.77], c, [-0.5, y, 0]);
  }
  // Chrome horses on the hood.
  for (const z of [-0.5, 0, 0.5]) box(g, [0.25, 0.25, 0.05], C.galv, [2.6, 1.5, z]);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), signMaterial(['MALIGAYA - BAYAN'], { bg: '#ffffff', fg: '#d62d20', w: 256, h: 64 }));
  sign.position.set(1.8, 2.65, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  box(g, [1.7, 0.4, 0.06], '#ffffff', [1.8, 2.65, 0], [0, Math.PI / 2, 0]);
  return g;
}

export function poso() {
  const g = new THREE.Group();
  box(g, [1.4, 0.25, 1.2], C.concreteDark, [0, 0.12, 0]);
  box(g, [0.9, 0.15, 0.7], '#6b7d82', [0.15, 0.32, 0.15]);
  cyl(g, 0.1, 0.12, 1.0, '#3c5a4f', [-0.2, 0.75, -0.2]);
  cyl(g, 0.13, 0.13, 0.2, '#3c5a4f', [-0.2, 1.3, -0.2]);
  rod(g, [-0.2, 0.95, -0.2], [0.15, 0.95, 0.15], 0.04, '#3c5a4f');
  rod(g, [-0.2, 1.35, -0.2], [-0.95, 1.1, -0.65], 0.03, '#3c5a4f');
  cyl(g, 0.18, 0.15, 0.32, '#2f7dd1', [0.4, 0.55, 0.3]);
  cyl(g, 0.09, 0.07, 0.1, '#f2c230', [0.35, 0.72, -0.3]);
  groundDecal(g, 'puddle', 1.6, 1.3, 0.9, 0.7, 0.4);
  groundDecal(g, 'stain', 2.2, 2.0, 0.6, 0.4, 1.2, 0.02);
  decal(g, 'rust', 0.25, 0.5, [-0.2, 0.9, -0.08]);
  return g;
}

export function videoke() {
  const g = new THREE.Group();
  box(g, [0.75, 1.3, 0.6], '#3b2a20', [0, 0.65, 0]);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.4), signMaterial(['VIDEOKE', '5 pesos isang kanta'], { bg: '#1b3d8f', fg: '#ffe066', w: 256, h: 192, emissive: true }));
  screen.position.set(0, 1.0, 0.31);
  g.add(screen);
  box(g, [0.6, 0.35, 0.05], '#111', [0, 0.45, 0.31]);
  box(g, [0.5, 0.75, 0.45], '#222', [0.75, 0.38, 0]);
  cyl(g, 0.16, 0.16, 0.03, '#555', [0.75, 0.5, 0.235], [Math.PI / 2, 0, 0], 10);
  // Table with bottles and a mic.
  cyl(g, 0.4, 0.4, 0.05, '#f4f1ea', [-0.5, 0.7, 1.1], undefined, 10);
  cyl(g, 0.05, 0.05, 0.7, '#f4f1ea', [-0.5, 0.35, 1.1]);
  for (let i = 0; i < 3; i += 1) cyl(g, 0.035, 0.04, 0.26, '#2f6b3a', [-0.6 + i * 0.12, 0.85, 1.05 + (i % 2) * 0.1], undefined, 5);
  cyl(g, 0.025, 0.02, 0.2, '#111', [-0.25, 0.75, 1.2], [0, 0, 1.4], 5);
  monobloc(g, [-1.1, 0, 1.3], 1.2);
  monobloc(g, [-0.2, 0, 1.8], 3.0, '#e8473f');
  return g;
}

export function sorbetesCart() {
  const g = new THREE.Group();
  wheel(g, [-0.4, 0.35, 0.5], 0.35, 0.05);
  wheel(g, [-0.4, 0.35, -0.5], 0.35, 0.05);
  box(g, [1.2, 0.7, 0.9], '#f2c230', [0, 0.85, 0]);
  box(g, [1.22, 0.18, 0.92], '#e94b8a', [0, 0.65, 0]);
  box(g, [1.22, 0.12, 0.92], '#2f9e6f', [0, 1.12, 0]);
  for (let i = 0; i < 3; i += 1) {
    cyl(g, 0.16, 0.16, 0.25, '#d0d4d6', [-0.35 + i * 0.35, 1.32, 0]);
    ball(g, 0.15, ['#f7e0a3', '#8b5a3c', '#7f4fb8'][i], [-0.35 + i * 0.35, 1.47, 0], [1, 0.5, 1]);
  }
  rod(g, [0.6, 0.9, 0], [1.1, 1.1, 0], 0.03, '#555');
  cyl(g, 0.03, 0.03, 1.6, '#ddd', [-0.5, 2.0, 0.35]);
  const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.45, 8, 1, true), mat('#e94b3c'));
  umbrella.position.set(-0.5, 2.85, 0.35);
  umbrella.castShadow = true;
  g.add(umbrella);
  const stripes = new THREE.Mesh(new THREE.ConeGeometry(1.01, 0.46, 8, 1, true, 0, Math.PI / 4), mat('#f4f1ea'));
  for (let i = 0; i < 4; i += 1) {
    const s = stripes.clone();
    s.rotation.y = i * (Math.PI / 2);
    s.position.copy(umbrella.position);
    g.add(s);
  }
  ball(g, 0.06, '#f2c230', [0.55, 1.3, 0.35]);
  return g;
}

export function sampayan(colors) {
  const g = new THREE.Group();
  cyl(g, 0.05, 0.06, 2.2, C.bambooDark, [-2.5, 1.1, 0]);
  cyl(g, 0.05, 0.06, 2.2, C.bambooDark, [2.5, 1.1, 0]);
  rod(g, [-2.5, 2.05, 0], [2.5, 2.05, 0], 0.01, '#ddd', 3);
  colors.forEach((c, i) => {
    const x = -2.1 + i * (4.2 / Math.max(1, colors.length - 1));
    if (i % 3 === 1) {
      box(g, [0.4, 0.45, 0.02], c, [x, 1.8, 0], [0, 0, (i % 2) * 0.06]);
    } else {
      box(g, [0.55, 0.6, 0.02], c, [x, 1.73, 0], [0, 0, -0.04]);
      box(g, [0.75, 0.15, 0.02], c, [x, 1.98, 0]);
    }
  });
  return g;
}

export function carabao() {
  const g = new THREE.Group();
  const hide = '#4a4446';
  box(g, [1.7, 0.85, 0.85], hide, [0, 1.05, 0]);
  ball(g, 0.5, hide, [0.1, 0.85, 0], [1.6, 0.8, 0.9]);
  for (const x of [-0.6, 0.6]) for (const z of [-0.28, 0.28]) cyl(g, 0.1, 0.08, 0.7, hide, [x, 0.35, z]);
  box(g, [0.55, 0.45, 0.45], hide, [1.05, 1.05, 0], [0, 0, -0.4]);
  box(g, [0.3, 0.25, 0.32], '#3a3436', [1.3, 0.85, 0]);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 4, 8, Math.PI * 0.75), mat('#d8cfc0'));
    horn.position.set(0.95, 1.35, side * 0.28);
    horn.rotation.set(0, side * 0.3, Math.PI * 0.62);
    if (side < 0) horn.scale.z = -1;
    g.add(horn);
  }
  rod(g, [-0.85, 1.2, 0], [-1.05, 0.6, 0.05], 0.03, hide);
  // Tied to a post.
  cyl(g, 0.07, 0.08, 1.1, C.woodDark, [2.6, 0.55, 0.4]);
  rod(g, [1.35, 0.9, 0], [2.6, 0.8, 0.4], 0.012, '#c9b37c', 3);
  const mud = new THREE.Mesh(new THREE.CircleGeometry(1.6, 10), mat('#5c4632'));
  mud.rotation.x = -Math.PI / 2;
  mud.position.y = 0.02;
  mud.receiveShadow = true;
  g.add(mud);
  return g;
}

export function askal() {
  const g = new THREE.Group();
  const fur = '#b07a45';
  ball(g, 0.3, fur, [0, 0.2, 0], [1.5, 0.65, 0.9]);
  ball(g, 0.17, fur, [0.42, 0.22, 0.08], [1.1, 0.9, 1]);
  box(g, [0.14, 0.1, 0.1], '#3a2a1e', [0.6, 0.2, 0.08]);
  box(g, [0.08, 0.12, 0.05], '#8a5a33', [0.38, 0.36, 0.0], [0, 0, 0.4]);
  box(g, [0.08, 0.12, 0.05], '#8a5a33', [0.38, 0.36, 0.16], [0, 0, 0.4]);
  rod(g, [-0.4, 0.2, 0], [-0.55, 0.12, 0.25], 0.035, fur);
  return g;
}

export function electricPost(withTransformer) {
  const g = new THREE.Group();
  cyl(g, 0.1, 0.14, 7, '#6b5844', [0, 3.5, 0]);
  box(g, [0.1, 0.1, 1.6], '#5a4a39', [0, 6.6, 0]);
  for (const z of [-0.7, 0, 0.7]) cyl(g, 0.04, 0.05, 0.15, '#e6e6e6', [0, 6.72, z]);
  if (withTransformer) {
    cyl(g, 0.28, 0.28, 0.75, '#8a9496', [0.32, 5.6, 0], undefined, 8);
    // The neighbourhood spaghetti: a tangle hanging off the post.
    for (let i = 0; i < 4; i += 1) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22 + i * 0.03, 0.015, 3, 10), mat('#1d1d1d'));
      coil.position.set(-0.15, 4.6 - i * 0.12, 0.05 * i);
      coil.rotation.set(1.2 + i * 0.3, i * 0.6, 0);
      g.add(coil);
    }
  }
  return g;
}

/** Sagging wire as a thin line. */
export function wire(a, b, sag, color = '#1d1d1d') {
  const pts = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
}

/** Fiesta banderitas: a sagging string of little triangle flags, centred on its own pivot so it can sway. */
export function banderitas(a, b, sag) {
  const colors = ['#e94b3c', '#f7c548', '#2f7dd1', '#53b36a', '#ffffff', '#e94b8a', '#ff8a3d'].map((c) => new THREE.Color(c));
  const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
  const len = a.distanceTo(b);
  const count = Math.floor(len / 0.38);
  const pos = [];
  const col = [];
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  for (let i = 0; i < count; i += 1) {
    const t0 = (i + 0.1) / count;
    const t1 = (i + 0.8) / count;
    const p0 = new THREE.Vector3().lerpVectors(a, b, t0).sub(mid).add(new THREE.Vector3(0, -sag * 4 * t0 * (1 - t0), 0));
    const p1 = new THREE.Vector3().lerpVectors(a, b, t1).sub(mid).add(new THREE.Vector3(0, -sag * 4 * t1 * (1 - t1), 0));
    const tip = p0.clone().lerp(p1, 0.5).add(new THREE.Vector3(0, -0.32, 0)).addScaledVector(dir, 0.01);
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, tip.x, tip.y, tip.z);
    const c = colors[i % colors.length];
    for (let k = 0; k < 3; k += 1) col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const flags = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
  flags.castShadow = true;
  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  pivot.add(flags);
  const string = wire(a.clone().sub(mid), b.clone().sub(mid), sag, '#e8e2d0');
  pivot.add(string);
  pivot.userData.axis = dir;
  return pivot;
}

export function bambooFence(length) {
  const g = new THREE.Group();
  for (let x = -length / 2; x <= length / 2; x += 0.5) cyl(g, 0.04, 0.045, 1.1 + ((x * 7) % 0.2), C.bamboo, [x, 0.55, 0], undefined, 5);
  for (const y of [0.4, 0.85]) box(g, [length, 0.05, 0.05], C.bambooDark, [0, y, 0.05]);
  return g;
}

export function tarpaulin() {
  const g = new THREE.Group();
  const tarp = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.4),
    signMaterial(['MALIGAYANG PISTA!', 'Brgy. Maligaya — mula kay', 'Kap. Bong Dimagiba at pamilya'], {
      bg: '#fff3c4',
      fg: '#c0392b',
      border: '#2f7dd1',
      w: 512,
      h: 224,
    }),
  );
  tarp.position.y = 2.2;
  g.add(tarp);
  cyl(g, 0.04, 0.04, 3.0, C.bambooDark, [-1.65, 1.5, -0.02]);
  cyl(g, 0.04, 0.04, 3.0, C.bambooDark, [1.65, 1.5, -0.02]);
  return g;
}
