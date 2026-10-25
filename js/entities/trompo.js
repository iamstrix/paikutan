// 3D trompo model, ported from tromPOW's TrompoView (jmdgg): a lathed pear of wood with a painted
// swirl and a steel tip, plus the spin-blur disc and soft contact shadow. Only the model comes over;
// scene.js still animates it from our snapshots. Built in his units; callers scale it.
import * as THREE from 'three';
import { outline } from '../world/kit.js';
import { buildSigil, MYTHIC } from './mythic.js';

const PROFILE = [
  [0.0, 0.0],
  [0.018, 0.02],
  [0.022, 0.06],
  [0.07, 0.1],
  [0.15, 0.17],
  [0.2, 0.25],
  [0.19, 0.3],
  [0.13, 0.35],
  [0.06, 0.37],
  [0.05, 0.42],
  [0.0, 0.43],
].map(([r, y]) => new THREE.Vector2(r, y));

const swirls = new Map();
let grainNormal = null;

/** Wavy turned-wood growth rings across the profile (canvas u = around, v = along). */
function grainLines(ctx, w, h, stroke, width = 1) {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.strokeStyle = stroke;
  for (let i = 0; i < 40; i += 1) {
    const y0 = (i / 40) * h + rnd() * 3;
    ctx.lineWidth = width * (0.6 + rnd() * 1.4);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      ctx.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 2.5 + Math.sin(x * 0.013 + i * 1.7) * 4);
    }
    ctx.stroke();
  }
}

/** Shared tangent-space normal map from the grain: grooves catch the lacquer highlight. */
function grainNormalMap() {
  if (grainNormal) return grainNormal;
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  ctx.filter = 'blur(1px)';
  grainLines(ctx, w, h, '#2a2a2a', 1.6);
  ctx.filter = 'none';
  const src = ctx.getImageData(0, 0, w, h).data;
  const out = ctx.createImageData(w, h);
  const height = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * 3;
      const dy = (height(x, y + 1) - height(x, y - 1)) * 3;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      out.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = (1 / len) * 255;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  grainNormal = new THREE.CanvasTexture(c);
  return grainNormal;
}

/** One painted texture per trumpo: its paint for the band, its paint and accent alternating in the swirl. */
function swirlTexture([paint, accent]) {
  const key = paint + accent;
  const cached = swirls.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e2b980';
  x.fillRect(0, 0, 256, 128);
  grainLines(x, 256, 128, 'rgba(128,82,40,0.45)');
  // Bands across the profile, a diagonal swirl around it so spin reads. Paint sits
  // slightly translucent over the grain, like years of lacquer and play.
  x.globalAlpha = 0.92;
  x.fillStyle = paint;
  x.fillRect(0, 56, 256, 18);
  x.fillStyle = '#2b1d12';
  x.fillRect(0, 80, 256, 5);
  x.fillRect(0, 50, 256, 3);
  for (let i = 0; i < 4; i += 1) {
    x.fillStyle = i % 2 ? accent : paint;
    x.beginPath();
    x.moveTo(i * 64, 74);
    x.lineTo(i * 64 + 34, 74);
    x.lineTo(i * 64 + 60, 128);
    x.lineTo(i * 64 + 26, 128);
    x.fill();
  }
  x.globalAlpha = 1;
  x.fillStyle = '#8f6a3f';
  x.fillRect(0, 0, 256, 14);
  // Chipped paint from clashes: wood shows through on the painted band.
  let seed = paint.length * 97 + paint.charCodeAt(1);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#d9ad72';
  for (let i = 0; i < 26; i += 1) x.fillRect(rnd() * 256, 52 + rnd() * 70, 2 + rnd() * 5, 1 + rnd() * 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  swirls.set(key, t);
  return t;
}

let blurTex = null;
let blobTex = null;

/** Motion-blur arcs for the spin disc and a soft contact shadow; shared by every top. */
function fxTextures() {
  if (!blurTex || !blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.lineCap = 'round';
    for (let i = 0; i < 9; i += 1) {
      const r = 22 + i * 4.5;
      x.strokeStyle = `rgba(255,255,255,${0.25 + (i % 3) * 0.2})`;
      x.lineWidth = 2.5;
      x.beginPath();
      x.arc(64, 64, r, i * 0.7, i * 0.7 + 2.2);
      x.stroke();
    }
    blurTex = new THREE.CanvasTexture(c);
    const b = document.createElement('canvas');
    b.width = b.height = 64;
    const y = b.getContext('2d');
    const g = y.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    y.fillStyle = g;
    y.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(b);
  }
  return { blur: blurTex, blob: blobTex };
}

// body: the spinning wood and tip. blur: the disc round its widest point (parent it where it leans
// but doesn't spin). blob: the ground shadow. All three in tromPOW units.
export function buildTrompo(def, low = false) {
  const { id } = def;
  const theme = MYTHIC[id] || MYTHIC.kidlat;
  const body = new THREE.Group();
  // Distinct shoulder profiles reinforce the crown silhouettes from oblique cameras.
  const width = { kidlat: 1, tikbalang: 1.06, agimat: 1.12, diwata: 0.92, bakunawa: 0.94 }[id] || 1;
  const segments = id === 'agimat' ? (low ? 6 : 12) : (low ? 16 : 28);
  const profile = PROFILE.map(p => new THREE.Vector2(p.x * width, p.y));
  const wood = new THREE.Mesh(
    new THREE.LatheGeometry(profile, segments),
    // Hero material: lacquered paint over turned wood.
    new THREE.MeshPhysicalMaterial({
      map: swirlTexture([theme.base, theme.metal]),
      normalMap: grainNormalMap(),
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.55,
      clearcoat: 0.6,
      clearcoatRoughness: 0.28,
    }),
  );
  wood.castShadow = true;
  outline(wood, 0.01);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), new THREE.MeshStandardMaterial({ color: '#cfd4d6', metalness: 0.8, roughness: 0.3 }));
  tip.rotation.x = Math.PI;
  body.add(wood, tip);
  body.position.y = 0.015;

  // Large horizontal relief, rather than side-only decoration, reads from above.
  const crown = buildSigil(id, low);
  crown.position.y = 0.38;
  body.add(crown);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.065, 0.027, id === 'agimat' ? 3 : 12),
    new THREE.MeshStandardMaterial({ color: theme.metal, roughness: 0.35, metalness: 0.7 }));
  collar.position.y = 0.4;
  body.add(collar);

  // Spin blur: streaked disc round the widest point, opacity follows spin speed.
  const tex = fxTextures();
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 24),
    new THREE.MeshBasicMaterial({ map: tex.blur, color: theme.glow, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }),
  );
  blur.rotation.x = -Math.PI / 2;
  blur.position.y = 0.26;
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  // A slow independent aura keeps the theme readable without stopping the wooden top.
  const aura = buildSigil(id, low, true);
  aura.position.y = 0.12;
  aura.scale.setScalar(1.18);
  aura.traverse(o => { if (o.isMesh) { o.material.transparent = true; o.material.opacity = 0.16; o.material.depthWrite = false; } });
  return { body, blur, blob, aura, crown };
}
