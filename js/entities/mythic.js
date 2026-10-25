// Raised, top-facing insignia shared by the trumpos and their ability manifestations.
// Each has a different outline, so identity survives spinning and distant cameras.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MYTHIC = {
  kidlat: { base: '#1d3557', metal: '#e9b83e', glow: '#ffd23f', lobes: 6 },
  tikbalang: { base: '#713c21', metal: '#b97842', glow: '#e63946', lobes: 3 },
  agimat: { base: '#167b70', metal: '#e9c46a', glow: '#71ead0', lobes: 3 },
  diwata: { base: '#7b2cbf', metal: '#f6bdc0', glow: '#ffdcf0', lobes: 5 },
  bakunawa: { base: '#0b132b', metal: '#83b8bb', glow: '#5bc0be', lobes: 1 },
};

export function buildSigil(id, low = false, energy = false, ability = false) {
  const theme = MYTHIC[id] || MYTHIC.kidlat;
  const group = new THREE.Group();
  const metal = energy
    ? new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    : new THREE.MeshStandardMaterial({ color: theme.metal, roughness: 0.35, metalness: 0.7 });
  const glow = new THREE.MeshBasicMaterial({ color: theme.glow, toneMapped: false });
  const dark = new THREE.MeshStandardMaterial({ color: theme.base, roughness: 0.5, metalness: 0.25 });
  if (energy) for (const m of [metal, glow, dark]) {
    m.transparent = true; m.depthWrite = false;
    m.opacity = m === dark ? 0.28 : 0.75;
  }
  const buckets = new Map();
  function add(geometry, material, x = 0, y = 0, z = 0, angle = 0) {
    geometry.rotateY(angle); geometry.translate(x, y, z);
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geometry);
  }
  function plate(points, material, y = 0, angle = 0) {
    const shape = new THREE.Shape();
    points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: energy ? 0.003 : 0.014, bevelEnabled: false, steps: 1 });
    geo.rotateX(-Math.PI / 2);
    add(geo, material, 0, y, 0, angle);
  }
  function ring(radius, tube, material, y = 0, arc = Math.PI * 2, angle = 0) {
    const geo = new THREE.TorusGeometry(radius, tube, low ? 4 : 6, low ? 24 : 40, arc);
    geo.rotateX(-Math.PI / 2);
    add(geo, material, 0, y, 0, angle);
  }
  if (id === 'kidlat') {
    // Six sharp lightning teeth, with dark gaps instead of another circular swirl.
    if (ability) {
      plate([[0.03, -0.25], [-0.12, 0.015], [-0.025, -0.005], [-0.07, 0.25], [0.14, -0.07], [0.035, -0.045]], metal);
      ring(0.21, 0.008, glow, -0.015, Math.PI * 1.8);
    } else {
      for (let i = 0; i < 6; i++) plate([[0.07, 0.025], [0.18, -0.045], [0.15, 0.015], [0.25, -0.025], [0.17, 0.115], [0.18, 0.045]], metal, 0, i * Math.PI / 3);
      ring(0.073, 0.009, glow, 0.018);
    }
  } else if (id === 'tikbalang') {
    // Three swept horse-head crests: pointed ears, long muzzle and a jagged mane.
    const horse = [[-0.04, 0.07], [-0.075, -0.01], [-0.11, -0.045], [-0.08, -0.08], [-0.1, -0.15], [-0.045, -0.125], [-0.018, -0.21], [0.02, -0.15], [0.062, -0.13], [0.09, -0.04], [0.035, -0.008], [0.015, -0.075], [0.005, 0.055]];
    for (let i = 0; i < (ability ? 1 : 3); i++) {
      const angle = i * Math.PI * 2 / 3;
      plate(horse, metal, 0, angle);
      plate([[-0.07, -0.1], [-0.095, -0.2], [-0.045, -0.15], [-0.01, -0.247], [0.005, -0.19]], glow, 0.016, angle);
    }
    ring(0.067, 0.012, dark, 0.02);
  } else if (id === 'agimat') {
    // A broad triangular anting-anting and a raised sun; the corners break the rim.
    plate([[0, -0.25], [0.2165, 0.125], [-0.2165, 0.125]], metal);
    plate([[0, -0.205], [0.1775, 0.1025], [-0.1775, 0.1025]], dark, 0.015);
    for (let i = 0; i < 8; i++) plate([[-0.012, -0.065], [0, -0.13], [0.012, -0.065]], metal, 0.03, i * Math.PI / 4);
    add(new THREE.CylinderGeometry(0.057, 0.057, 0.018, 16), glow, 0, 0.043);
  } else if (id === 'diwata') {
    // Five broad ivory-pink petals, pointed at the ends and cupped toward the pearl.
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      plate([[0, -0.045], [-0.075, -0.12], [-0.058, -0.2], [0, -0.25], [0.058, -0.2], [0.075, -0.12]], metal, 0, a);
      plate([[0, -0.055], [-0.015, -0.13], [0, -0.215], [0.015, -0.13]], glow, 0.016, a);
    }
    add(new THREE.SphereGeometry(0.047, 12, 8), glow, 0, 0.052);
  } else {
    // Crescent sea-serpent: an open coil, finned spine and a broad fang-lined jaw.
    ring(0.202, 0.027, metal, 0, Math.PI * 1.63, 0.12);
    ring(0.202, 0.009, glow, 0.027, Math.PI * 1.55, 0.16);
    for (let i = 0; i < 7; i++) plate([[0.185, -0.015], [0.249, 0], [0.185, 0.028]], dark, 0, i * 0.7);
    plate([[0.09, -0.2], [0.015, -0.245], [-0.08, -0.22], [-0.045, -0.168], [0.02, -0.14]], metal, 0.012);
    plate([[-0.04, -0.19], [-0.025, -0.125], [-0.005, -0.18]], glow, 0.03);
    add(new THREE.SphereGeometry(0.014, 8, 6), glow, 0.022, 0.042, -0.203);
    add(new THREE.CylinderGeometry(0.092, 0.092, 0.012, 24), dark, 0, -0.005);
    ring(0.098, 0.008, glow, 0.003);
  }
  for (const [material, geometries] of buckets) {
    const plain = geometries.map(g => g.index ? g.toNonIndexed() : g);
    const geometry = mergeGeometries(plain);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !energy; group.add(mesh);
    for (const g of geometries) g.dispose();
    for (let i = 0; i < plain.length; i++) if (plain[i] !== geometries[i]) plain[i].dispose();
  }
  group.name = `${id}-${energy ? 'manifestation' : 'crown'}`;
  // Do not retain materials unused by this particular emblem.
  for (const m of [metal, glow, dark]) if (!buckets.has(m)) m.dispose();
  return group;
}
