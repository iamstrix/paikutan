import * as THREE from 'three';
import { READY_RADIUS } from '../game/RoundManager';
import { RING_RADIUS } from '../sim/TrompoSim';
import { createSeededRandom } from '../utils/random';
import { decalMaterial, glowDecal, groundDecal } from './decals';
import { bake, ball, mat, noiseTexture, registerGlow, rod } from './kit';
import {
  askal,
  bambooFence,
  banderitas,
  bananaTree,
  barangayHall,
  basketballCourt,
  carabao,
  coconutTree,
  concreteHouse,
  electricPost,
  jeepney,
  mangoTree,
  nipaHut,
  poso,
  sampayan,
  sariSari,
  sorbetesCart,
  tarpaulin,
  tricycle,
  videoke,
  waitingShed,
  wire,
} from './props';

/** Axis-aligned footprint the avatars can't walk through. */
export type Collider = { x: number; z: number; hw: number; hd: number };

export const BOUNDS = { minX: -27, maxX: 27, minZ: -13, maxZ: 19.5 };
const POST_Z = 11.2;
export const SPAWN = new THREE.Vector3(2, 0, 5.5);

export type Barangay = {
  group: THREE.Group;
  colliders: Collider[];
  sway: THREE.Object3D[];
  flag: THREE.Mesh;
  ringLine: THREE.Mesh;
  update(elapsed: number, ring: number): void;
};

export function buildBarangay(): Barangay {
  const root = new THREE.Group();
  const scenery = new THREE.Group();
  const colliders: Collider[] = [];
  const rng = createSeededRandom(2026);

  const put = (obj: THREE.Object3D, x: number, z: number, ry = 0, hw = 0, hd = 0) => {
    obj.position.set(x, obj.position.y, z);
    obj.rotation.y = ry;
    scenery.add(obj);
    if (hw > 0) {
      const swap = Math.abs(Math.sin(ry)) > 0.7;
      colliders.push({ x, z, hw: swap ? hd : hw, hd: swap ? hw : hd });
    }
  };

  // Ground layers: grass, the dirt plaza, the concrete road, the bilog.
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshStandardMaterial({ map: noiseTexture('#7d9a45', ['#5f7d32', '#a3b85a', '#6b8a3a'], { count: 3000, repeat: 60 }), roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  root.add(grass);

  const plazaShape = new THREE.Shape();
  for (let i = 0; i <= 40; i += 1) {
    const a = (i / 40) * Math.PI * 2;
    const r = 1 + (rng() - 0.5) * 0.08;
    const x = Math.cos(a) * 31 * r;
    const z = Math.sin(a) * 17 * r + 3;
    // Shape space y = -world z, so rotating -90° about x lays it flat facing up.
    if (i === 0) plazaShape.moveTo(x, -z);
    else plazaShape.lineTo(x, -z);
  }
  const plaza = new THREE.Mesh(
    new THREE.ShapeGeometry(plazaShape),
    new THREE.MeshStandardMaterial({ map: noiseTexture('#b08a5e', ['#8f6c47', '#c9a77a', '#9c7b55', '#7d8a4a'], { count: 2600, repeat: 0.12 }), roughness: 1 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;
  plaza.receiveShadow = true;
  root.add(plaza);

  const roadTex = noiseTexture('#b9b3a6', ['#9d978a', '#cfc9bb', '#8a8478'], { count: 1800 });
  roadTex.repeat.set(30, 1);
  const road = new THREE.Mesh(new THREE.BoxGeometry(160, 0.1, 4.6), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 }));
  road.position.set(0, 0.04, 9);
  road.receiveShadow = true;
  root.add(road);
  for (let x = -78; x <= 78; x += 4.5) {
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 4.6), mat('#7d786d'));
    j.position.set(x, 0.1, 9);
    scenery.add(j);
  }
  const canal = new THREE.Mesh(new THREE.BoxGeometry(160, 0.03, 0.6), mat('#4b4136'));
  canal.position.set(0, 0.02, 11.7);
  root.add(canal);

  const bilog = new THREE.Mesh(new THREE.CircleGeometry(RING_RADIUS + 0.45, 40), mat('#8d6a46'));
  bilog.rotation.x = -Math.PI / 2;
  bilog.position.y = 0.025;
  bilog.receiveShadow = true;
  root.add(bilog);
  const line = new THREE.Mesh(new THREE.RingGeometry(RING_RADIUS - 0.04, RING_RADIUS + 0.04, 64), mat('#efe2c4'));
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.035;
  root.add(line);
  const ringLine = new THREE.Mesh(
    new THREE.RingGeometry(0.985, 1.0, 72),
    new THREE.MeshBasicMaterial({ color: '#fff3c8', transparent: true, opacity: 0.9 }),
  );
  ringLine.rotation.x = -Math.PI / 2;
  ringLine.position.y = 0.04;
  ringLine.visible = false;
  root.add(ringLine);

  // Pebbles mark the ready zone: stand inside to join the next match.
  for (let i = 0; i < 34; i += 1) {
    const a = (i / 34) * Math.PI * 2 + rng() * 0.05;
    ball(scenery, 0.09 + rng() * 0.06, rng() > 0.5 ? '#c9c2b2' : '#a49d8e', [Math.cos(a) * READY_RADIUS, 0.04, Math.sin(a) * READY_RADIUS], [1, 0.6, 1]);
  }

  // Ground storytelling: the worn band round the bilog, leaf litter, a road that has seen years of jeepneys.
  groundDecal(scenery, 'scuff', 11, 11, 0, 0, 0, 0.02);
  groundDecal(scenery, 'leaves', 5, 5, -4.6, -4.2, 0.5, 0.018);
  groundDecal(scenery, 'leaves', 3, 3, -2.8, -2.4, 2.1, 0.018);
  for (let i = 0; i < 9; i += 1) {
    const x = -24 + i * 6 + rng() * 3;
    groundDecal(scenery, i % 3 === 0 ? 'patch' : 'crack', 1.6 + rng(), 1.6 + rng(), x, 8.2 + rng() * 1.6, rng() * 6, 0.095);
    if (i % 2) groundDecal(scenery, 'stain', 1.4, 1.1, x + 2, 9.4 - rng(), rng() * 6, 0.096);
  }
  groundDecal(scenery, 'tire', 12, 2.2, -8, 9.0, 0, 0.097);
  groundDecal(scenery, 'tire', 10, 2.2, 10, 8.8, 0.05, 0.097);
  groundDecal(scenery, 'tire', 6, 1.8, -5.5, 4.6, 1.3, 0.015);
  groundDecal(scenery, 'stain', 2.2, 1.6, -13.5, 9.6, 0.3, 0.097);
  groundDecal(scenery, 'stain', 1.4, 1.4, -5.2, 6.3, 1.1, 0.015);
  groundDecal(scenery, 'stain', 1.4, 1.4, 11, 6.6, 2.2, 0.097);
  groundDecal(scenery, 'stain', 1.2, 1.2, 5.8, 4.6, 0.4, 0.015);

  // Buildings.
  put(sariSari(), 0, -8, 0, 2.6, 1.9);
  put(concreteHouse('#f2b8c6', 'rust', 0), -8.6, -8.6, 0, 2.5, 2.1);
  put(concreteHouse('#9fd3c7', 'galv', 1), 8.8, -8.8, 0, 2.9, 2.1);
  put(concreteHouse('#f6d880', 'rust', 2), -15.6, -9.6, 0, 2.5, 2.1);
  put(nipaHut(), 15.6, -9.4, 0, 1.7, 1.4);
  const hall = barangayHall();
  put(hall.group, -19.5, 0.5, Math.PI / 2, 3.7, 2.8);
  put(basketballCourt(), 17, 0.5, -Math.PI / 2);
  colliders.push({ x: 20.9, z: 0.5, hw: 0.2, hd: 0.2 });
  put(waitingShed(), 0, 12.9, Math.PI, 1.9, 0.95);
  put(nipaHut(), -9, 15.6, Math.PI, 1.7, 1.4);
  put(nipaHut(), 7.6, 16.2, Math.PI + 0.15, 1.7, 1.4);
  put(concreteHouse('#a8c8ec', 'galv', 3), 16.4, 15.6, Math.PI, 2.5, 2.1);
  put(concreteHouse('#f4efe3', 'rust', 4), -17, 15.2, Math.PI, 2.9, 2.1);
  put(tarpaulin(), -4.6, 12.2, Math.PI);

  // Street life.
  put(jeepney(), -13.5, 9.6, 0, 2.7, 1.0);
  put(tricycle('#d6453d'), -5.2, 6.3, 0.25, 1.0, 1.0);
  put(tricycle('#2f9e6f'), 11, 6.6, Math.PI, 1.0, 1.0);
  put(poso(), 6.6, -4.4, 0.4, 0.7, 0.6);
  put(videoke(), -8.6, -5.4, 0.35, 0.6, 0.5);
  put(sorbetesCart(), 5.8, 4.6, -0.6, 0.7, 0.6);
  put(sampayan(['#e94b3c', '#ffffff', '#2f7dd1', '#f7c548', '#e94b8a', '#53b36a', '#ffffff']), 12.6, -5.2, 0.1);
  put(carabao(), -23, 17, 0.5, 1.0, 0.6);
  put(askal(), 2.7, -5.0, 2.6);
  put(mangoTree(), -4.6, -4.2, 0, 0.5, 0.5);

  const trees: [number, number][] = [
    [-24, -12], [-7, -14.5], [5, -14], [22, -13], [-27, 3], [27, 7], [-13, 20.5], [12, 21],
    [25, 20], [-2, 20.5], [-30, -6], [30, -3], [-20, -15.5], [18, -15.5], [0, -16.5], [-31, 12], [31, 14],
  ];
  for (const [x, z] of trees) {
    put(coconutTree(6 + rng() * 3.5, (rng() - 0.5) * 2.4), x, z, rng() * Math.PI * 2, 0.3, 0.3);
  }
  for (const [x, z] of [
    [-12, -12.5], [12, -12.5], [22.5, -5], [-23.5, 8], [3.6, 19.5], [-6, 19], [-25, -3], [24.5, 12],
  ] as [number, number][]) {
    put(bananaTree(), x, z, rng() * Math.PI * 2, 0.3, 0.3);
  }
  for (const [x, z] of [
    [-6, -6.3], [6, -6.5], [-11.5, -6.4], [11.5, -6.6], [-3, 11.6], [3, 11.6], [-20.5, 4.2], [20, 12.6],
  ] as [number, number][]) {
    const bush = new THREE.Group();
    ball(bush, 0.55, '#3f7a33', [0, 0.45, 0], [1.2, 0.85, 1], 1);
    for (let i = 0; i < 6; i += 1) ball(bush, 0.08, '#e3263b', [Math.cos(i) * 0.5, 0.55 + (i % 2) * 0.25, Math.sin(i) * 0.45]);
    put(bush, x, z, 0, 0.5, 0.4);
  }
  for (const [x, z, len, ry] of [
    [-20, -12.6, 6, 0], [-4, -12.2, 5, 0], [20, -12.6, 6, 0], [-4.5, 18.6, 4, 0], [20.5, 18.8, 5, 0],
  ] as [number, number, number, number][]) {
    put(bambooFence(len), x, z, ry);
  }

  // Background: rice paddies to the south, hazy mountains all round.
  const paddy = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 50),
    new THREE.MeshStandardMaterial({ map: noiseTexture('#7fae4a', ['#9cc45c', '#5e8f35'], { stripes: '#8fbb52', count: 2000 }), roughness: 1 }),
  );
  (paddy.material as THREE.MeshStandardMaterial).map!.repeat.set(20, 6);
  paddy.rotation.x = -Math.PI / 2;
  paddy.position.set(0, 0.015, 48);
  paddy.receiveShadow = true;
  root.add(paddy);
  for (let z = 26; z < 70; z += 7) {
    const dike = new THREE.Mesh(new THREE.BoxGeometry(160, 0.18, 0.4), mat('#8a7650'));
    dike.position.set(0, 0.09, z);
    scenery.add(dike);
  }
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 + rng() * 0.3;
    const r = 120 + rng() * 40;
    const h = 22 + rng() * 26;
    const m = new THREE.Mesh(new THREE.ConeGeometry(35 + rng() * 20, h, 6), mat(i % 2 ? '#5f7f86' : '#6c8a7a'));
    m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    m.rotation.y = rng() * 3;
    root.add(m);
  }

  // Power lines, plus the bulbs that glow at dusk.
  const postXs = [-30, -18, -6, 6, 18, 30];
  for (const x of postXs) {
    put(electricPost(x === -6 || x === 18), x, POST_Z, 0, 0.15, 0.15);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.3), mat('#fff6d8', '#ffd98a'));
    bulb.position.set(x, 5.8, POST_Z - 0.35);
    scenery.add(bulb);
  }
  const wires = new THREE.Group();
  for (let i = 0; i < postXs.length - 1; i += 1) {
    for (const z of [-0.7, 0, 0.7]) {
      wires.add(wire(new THREE.Vector3(postXs[i], 6.75, POST_Z + z), new THREE.Vector3(postXs[i + 1], 6.75, POST_Z + z), 0.55 + rng() * 0.2));
    }
    // Extra cable-TV and jumper lines: the spaghetti.
    for (let k = 0; k < 3; k += 1) {
      wires.add(wire(new THREE.Vector3(postXs[i], 5.2 - k * 0.2, POST_Z), new THREE.Vector3(postXs[i + 1], 5.0 - k * 0.15, POST_Z), 0.9 + rng() * 0.8));
    }
  }
  // Service drops to the houses across the road.
  wires.add(wire(new THREE.Vector3(-6, 5.4, POST_Z), new THREE.Vector3(-9, 3.0, 13.8), 0.4));
  wires.add(wire(new THREE.Vector3(6, 5.4, POST_Z), new THREE.Vector3(7.6, 3.0, 14.4), 0.4));
  // Fiesta bamboo poles that hold the plaza banderitas.
  for (const x of [-7, 7]) {
    const pole = new THREE.Group();
    rod(pole, [0, 0, 0], [0, 6.6, 0], 0.06, '#c9a35c');
    put(pole, x, 4, 0, 0.1, 0.1);
  }
  // Bombilya over the bilog: a wire from the mango tree to the fiesta pole, a drop cord, a bulb.
  wires.add(wire(new THREE.Vector3(-4.6, 4.8, -4.2), new THREE.Vector3(7, 6.3, 4), 1.0));
  wires.add(wire(new THREE.Vector3(0.45, 4.47, -0.63), new THREE.Vector3(0.45, 4.3, -0.63), 0));
  root.add(wires);

  // Fluorescent tube under the awning and the parol at the shed.
  const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), mat('#f2f8ff', '#dff0ff'));
  tube.position.set(0, 2.85, -5.7);
  scenery.add(tube);
  const parol = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), mat('#ffd36b', '#ffb43a'));
  parol.position.set(0, 2.1, 12.2);
  parol.scale.set(1, 1, 0.3);
  scenery.add(parol);

  // Bulbs for the hall door and the court floodlight, plus light pools under every practical.
  for (const [x, y, z] of [
    [-16.75, 2.6, 0.5],
    [20.6, 4.6, 0.5],
    [0.45, 4.22, -0.63],
  ] as [number, number, number][]) {
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), mat('#f2f8ff', '#dff0ff'));
    bulb.position.set(x, y, z);
    scenery.add(bulb);
  }
  const flood = new THREE.Group();
  rod(flood, [21.3, 0, 1.6], [21.3, 4.9, 1.6], 0.06, '#8a9496');
  rod(flood, [21.3, 4.8, 1.6], [20.6, 4.65, 0.5], 0.04, '#8a9496');
  scenery.add(flood);
  for (const x of [-6, 6]) glowDecal(scenery, '#ffc46b', 6, 6, x, 10, 0.1);
  glowDecal(scenery, '#ffcf7a', 4, 3, 0, 12.6, 0.16);
  glowDecal(scenery, '#d9ecff', 3.5, 4, -15.4, 0.5);
  glowDecal(scenery, '#eef6ff', 8, 7, 17.5, 0.5, 0.1);
  glowDecal(scenery, '#7f9cff', 2.2, 2.2, -8.4, -4.4);

  root.add(bake(scenery));

  // Additive halos round each bulb; they fade in with the lamps.
  const haloMats = new Map<string, THREE.SpriteMaterial>();
  const halo = (x: number, y: number, z: number, color: string, size: number) => {
    let m = haloMats.get(color);
    if (!m) {
      m = new THREE.SpriteMaterial({ color, alphaMap: decalMaterial('puddle').alphaMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      registerGlow(m, 0.75);
      haloMats.set(color, m);
    }
    const sprite = new THREE.Sprite(m);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    root.add(sprite);
  };
  for (const x of postXs) halo(x, 5.8, POST_Z - 0.35, '#ffc46b', 1.6);
  halo(0, 2.85, -5.7, '#e8f4ff', 1.3);
  halo(0, 2.1, 12.2, '#ffcf7a', 1.8);
  halo(-16.75, 2.6, 0.5, '#d9ecff', 1.4);
  halo(20.6, 4.6, 0.5, '#eef6ff', 2.4);
  halo(-8.6, 1.0, -5.1, '#7f9cff', 1.2);
  halo(0.45, 4.2, -0.63, '#ffd48a', 1.8);

  const sway: THREE.Object3D[] = [];
  for (const [a, b, sag] of [
    [[-8.6, 3.3, -6.3], [8.8, 3.3, -6.6], 0.5],
    [[-7, 6.5, 4], [0, 4.0, -6.2], 0.5],
    [[7, 6.5, 4], [0, 4.0, -6.2], 0.5],
    [[-7, 6.5, 4], [7, 6.5, 4], 0.45],
    [[-18, 5.4, POST_Z], [-6, 5.4, POST_Z], 0.6],
    [[6, 5.4, POST_Z], [18, 5.4, POST_Z], 0.6],
    [[-4.6, 4.8, -4.2], [-8.6, 3.3, -6.3], 0.3],
  ] as [[number, number, number], [number, number, number], number][]) {
    const b2 = banderitas(new THREE.Vector3(...a), new THREE.Vector3(...b), sag);
    sway.push(b2);
    root.add(b2);
  }
  // Flag sits in hall-local space; reparent it at the hall's transform.
  const flagHolder = new THREE.Group();
  flagHolder.position.set(-19.5, 0, 0.5);
  flagHolder.rotation.y = Math.PI / 2;
  flagHolder.add(hall.flag);
  root.add(flagHolder);
  const flagBase = Float32Array.from(hall.flag.geometry.attributes.position.array);

  return {
    group: root,
    colliders,
    sway,
    flag: hall.flag,
    ringLine,
    update(elapsed: number, ring: number) {
      sway.forEach((s, i) => s.setRotationFromAxisAngle(s.userData.axis, Math.sin(elapsed * 1.6 + i) * 0.18));
      const pos = hall.flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 1) {
        const x = flagBase[i * 3];
        pos.setZ(i, Math.sin(x * 3 - elapsed * 4) * 0.08 * (x / 1.6));
      }
      pos.needsUpdate = true;
      const shrinking = ring < RING_RADIUS - 0.01;
      ringLine.visible = shrinking;
      ringLine.scale.setScalar(ring);
    },
  };
}
