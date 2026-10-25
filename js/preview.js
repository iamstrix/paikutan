// 3D previews of the characters and trumpos for the pick screens. One small WebGL renderer draws
// every model: still shots become <img> data URLs, and live views are copied into 2D canvases.
import * as THREE from 'three';
import { CHARACTERS, TOPS, CHAR_MODEL, byId } from './data.js';
import { buildTrompo } from './entities/trompo.js';
import { Avatar } from './entities/avatar.js';

const SIZE = 384; // square render size in pixels, shared by every preview
let renderer = null, failed = false;
let stage = null, camera = null;
const models = new Map(), shots = new Map(), live = new Set();
let raf = 0, last = 0;

function init() {
  if (renderer || failed) return !!renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { failed = true; return false; }
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Same look as the arena renderer.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage = new THREE.Scene();
  stage.add(new THREE.HemisphereLight('#fff4dc', '#6b4a2e', 1.6));
  const key = new THREE.DirectionalLight('#fff1d6', 2.4);
  key.position.set(2, 4, 3);
  const rim = new THREE.DirectionalLight('#9fc3ff', 1.4);
  rim.position.set(-3, 2, -3);
  stage.add(key, rim);
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  return true;
}

// Built once per model and framed by its bounding box, so every model fills the square the same way.
function model(kind, id) {
  const k = kind + ':' + id;
  if (models.has(k)) return models.get(k);
  let m;
  if (kind === 'char') {
    const c = byId(CHARACTERS, id);
    const avatar = new Avatar(CHAR_MODEL[c.id] || c.id, c.color);
    m = { kind, root: avatar.group, avatar };
  } else {
    const { body } = buildTrompo(byId(TOPS, id));
    const root = new THREE.Group();
    root.add(body);
    // Tipped toward the camera so the painted shoulder shows.
    body.rotation.x = 0.32;
    m = { kind, root, body };
  }
  m.root.visible = false;
  stage.add(m.root);
  const box = new THREE.Box3().setFromObject(m.root, true);
  m.center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  m.radius = Math.max(size.y, size.x, size.z) * (kind === 'char' ? 0.56 : 0.62);
  models.set(k, m);
  return m;
}

function pose(m, t) {
  if (m.kind === 'char') {
    m.avatar.update(1 / 60, t);
    m.root.rotation.y = -0.35 + Math.sin(t * 0.7) * 0.3;
  } else {
    m.body.rotation.y = t * 1.6;
  }
}

function draw(m) {
  for (const x of models.values()) x.root.visible = x === m;
  const dist = m.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const lift = m.kind === 'char' ? 0.12 : 0.35;
  camera.position.set(m.center.x, m.center.y + dist * lift, m.center.z + dist);
  camera.lookAt(m.center);
  renderer.render(stage, camera);
}

// A still picture of the model as a data URL, or null when WebGL is unavailable.
export function modelShot(kind, id) {
  const k = kind + ':' + id;
  if (shots.has(k)) return shots.get(k);
  if (!init()) return null;
  const m = model(kind, id);
  pose(m, 0.6);
  draw(m);
  const url = renderer.domElement.toDataURL('image/png');
  shots.set(k, url);
  return url;
}

// Animates the model into a square 2D canvas until the returned function is called.
export function liveModel(canvas, kind, id) {
  if (!init()) return () => {};
  const entry = { canvas, ctx: canvas.getContext('2d'), m: model(kind, id), t: Math.random() * 3 };
  live.add(entry);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  return () => { live.delete(entry); };
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const e of live) {
    if (!e.canvas.isConnected) { live.delete(e); continue; }
    const w = Math.round(e.canvas.clientWidth * Math.min(2, devicePixelRatio || 1));
    if (!w) continue;
    if (e.canvas.width !== w || e.canvas.height !== w) { e.canvas.width = w; e.canvas.height = w; }
    e.t += dt;
    pose(e.m, e.t);
    draw(e.m);
    e.ctx.clearRect(0, 0, w, w);
    e.ctx.drawImage(renderer.domElement, 0, 0, w, w);
  }
  raf = live.size ? requestAnimationFrame(frame) : 0;
}
