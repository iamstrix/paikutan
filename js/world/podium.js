import * as THREE from 'three';
import { banderitas, wire } from './props.js';
import { box, cyl, outline } from './kit.js';

// Brawl match end: a plank podium on the circle, winner in the middle and highest,
// with fiesta banderitas strung over it. Built in barangay metres, so scale it like the barangay.

// Steps by place: 1st in the middle, 2nd on its left (from the front), 3rd on its right.
const STEPS = [
  { x: 0, h: 0.72, medal: '#f2c14e', rim: '#a8741a' },
  { x: -0.92, h: 0.5, medal: '#dfe5ea', rim: '#7d8a96' },
  { x: 0.92, h: 0.32, medal: '#e09a5c', rim: '#8c4f22' },
];
const W = 0.9, D = 0.85;

let planks = null;
function plankTexture() {
  if (planks) return planks;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const tones = ['#b98250', '#a8723f', '#c48d59', '#ae7845'];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Four boards across, each with a little grain and a nail at both ends.
  for (let i = 0; i < 4; i++) {
    const y = i * 64;
    g.fillStyle = tones[i];
    g.fillRect(0, y, 256, 64);
    g.strokeStyle = 'rgba(90, 55, 28, 0.35)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) {
      const gy = y + 8 + rnd() * 48;
      g.beginPath(); g.moveTo(0, gy);
      g.bezierCurveTo(80, gy + rnd() * 8 - 4, 170, gy + rnd() * 8 - 4, 256, gy + rnd() * 6 - 3);
      g.stroke();
    }
    g.fillStyle = '#4a2d17';
    g.fillRect(0, y + 61, 256, 3);
    for (const x of [14, 242]) { g.beginPath(); g.arc(x, y + 32, 3.2, 0, 7); g.fill(); }
  }
  planks = new THREE.CanvasTexture(c);
  planks.colorSpace = THREE.SRGBColorSpace;
  planks.anisotropy = 4;
  return planks;
}

// The painted place number, a round medal nailed to the front of the step.
function medalMaterial(n, { medal, rim }) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = rim;
  g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
  g.fillStyle = medal;
  g.beginPath(); g.arc(128, 128, 104, 0, 7); g.fill();
  g.font = '170px "Lilita One", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#2b1d12'; g.lineJoin = 'round';
  g.strokeText(String(n), 128, 140);
  g.fillStyle = '#fff8e7';
  g.fillText(String(n), 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.6 });
}

export function buildPodium() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 });
  const spots = STEPS.map((s, i) => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(W, s.h, D), wood);
    step.position.set(s.x, s.h / 2, 0);
    step.castShadow = step.receiveShadow = true;
    outline(step, 0.012);
    group.add(step);
    // A darker board along the top edge and a kick board at the foot.
    box(group, [W + 0.04, 0.05, D + 0.04], '#7a4b27', [s.x, s.h - 0.02, 0]);
    box(group, [W + 0.03, 0.06, D + 0.03], '#5e3b20', [s.x, 0.03, 0]);
    const medal = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), medalMaterial(i + 1, s));
    medal.position.set(s.x, Math.max(0.2, s.h * 0.5), D / 2 + 0.006);
    group.add(medal);
    // Where the player stands, and where their trumpo spins in front of them.
    return { stand: new THREE.Vector3(s.x, s.h, -0.12), top: new THREE.Vector3(s.x, s.h, 0.24) };
  });
  // Two bamboo poles behind, with banderitas swung between them over the winner.
  const poleH = 2.75;
  for (const x of [-1.6, 1.6]) {
    cyl(group, 0.04, 0.05, poleH, '#c9b26a', [x, poleH / 2, -0.55], undefined, 6);
    cyl(group, 0.055, 0.055, 0.04, '#8f7a3e', [x, poleH * 0.6, -0.55], undefined, 6);
  }
  const a = new THREE.Vector3(-1.6, poleH - 0.05, -0.55), b = new THREE.Vector3(1.6, poleH - 0.05, -0.55);
  const flags = banderitas(a, b, 0.22);
  group.add(flags);
  const low = banderitas(a.clone().setY(poleH - 0.45), b.clone().setY(poleH - 0.45), 0.14);
  group.add(low);
  group.add(wire(new THREE.Vector3(-1.6, poleH - 0.05, -0.55), new THREE.Vector3(-2.3, 0, -1.1), 0.02, '#e8e2d0'));
  group.add(wire(new THREE.Vector3(1.6, poleH - 0.05, -0.55), new THREE.Vector3(2.3, 0, -1.1), 0.02, '#e8e2d0'));
  return { group, spots, flags: [flags, low], height: STEPS[0].h };
}
