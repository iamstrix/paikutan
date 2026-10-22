// three.js view of the plaza: chalk circle, banderitas, sari-sari store, trumpos and effects.
// Used by the desktop spectator and the phones (which follow host snapshots).
import * as THREE from 'three';
import { ARENA_R, LAUNCH_Z } from './sim.js';
import { TOPS, PLAYER_COLORS, byId } from './data.js';

const rand = (a, b) => a + Math.random() * (b - a);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}

function dirt(base, specks) {
  return (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = specks[i % specks.length];
      g.globalAlpha = rand(0.08, 0.35);
      const r = rand(0.5, i % 40 === 0 ? 9 : 2.5);
      g.beginPath(); g.arc(rand(0, w), rand(0, h), r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  };
}

// Trumpo profile (radius, height), from the steel tip up to the knob.
const TIP = [[0, 0], [0.03, 0.015], [0.045, 0.06], [0.045, 0.15]];
const BODY = [[0.045, 0.14], [0.11, 0.17], [0.25, 0.3], [0.38, 0.46], [0.43, 0.56], [0.42, 0.62],
  [0.34, 0.68], [0.14, 0.72], [0.07, 0.76], [0.07, 0.86], [0.0, 0.88]];
const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

function topTexture(colors) {
  return canvasTex(256, 256, (g, w, h) => {
    // Canvas top is the crown of the trumpo (lathe v=1).
    g.fillStyle = colors[0]; g.fillRect(0, 0, w, h);
    g.fillStyle = colors[1]; g.fillRect(0, h * 0.18, w, h * 0.12);
    g.fillStyle = '#fff8e7'; g.fillRect(0, h * 0.31, w, h * 0.03);
    // Slanted stripes make the spin readable.
    g.fillStyle = colors[1];
    for (let i = 0; i < 6; i++) {
      const x = (i / 6) * w;
      g.beginPath();
      g.moveTo(x, h * 0.36); g.lineTo(x + w * 0.07, h * 0.36);
      g.lineTo(x + w * 0.16, h * 0.75); g.lineTo(x + w * 0.09, h * 0.75);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.75, w, h * 0.25);
  });
}

function makeTop(topId, slot, low) {
  const def = byId(TOPS, topId);
  const root = new THREE.Group(), precess = new THREE.Group(), tilt = new THREE.Group(), spinner = new THREE.Group();
  root.add(precess); precess.add(tilt); tilt.add(spinner);
  const seg = low ? 20 : 36;
  const body = new THREE.Mesh(lathe(BODY, seg), new THREE.MeshStandardMaterial({ map: topTexture(def.colors), roughness: 0.55, metalness: 0.05 }));
  const tip = new THREE.Mesh(lathe(TIP, 12), new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.3, metalness: 0.9 }));
  body.castShadow = tip.castShadow = true;
  spinner.add(body, tip);
  // Coloured chalk ring under each top shows whose it is.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 40), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[slot], transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(0.78, 24, 16), new THREE.MeshBasicMaterial({ color: '#7fffd4', transparent: true, opacity: 0.22, depthWrite: false }));
  shield.position.y = 0.45; shield.visible = false;
  root.add(ring, shield);
  return { root, precess, tilt, spinner, ring, shield, prec: rand(0, 6), drop: 0, state: null, target: null, wasLaunched: false, fallT: 0 };
}

function makeDog() {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: '#b07a45' }), dark = new THREE.MeshLambertMaterial({ color: '#5a3b22' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.38, 0.36), fur); body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.3), fur); head.position.set(0.55, 0.78, 0);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), dark); snout.position.set(0.76, 0.72, 0);
  const ear1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.08), dark); ear1.position.set(0.5, 0.98, 0.1);
  const ear2 = ear1.clone(); ear2.position.z = -0.1;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.07), fur); tail.position.set(-0.55, 0.75, 0); tail.rotation.z = 0.7;
  g.add(body, head, snout, ear1, ear2, tail);
  const legs = [];
  for (const [x, z] of [[0.3, 0.12], [0.3, -0.12], [-0.3, 0.12], [-0.3, -0.12]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), fur);
    l.geometry.translate(0, -0.2, 0);
    l.position.set(x, 0.42, z); g.add(l); legs.push(l);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.legs = legs; g.userData.tail = tail;
  g.visible = false;
  return g;
}

function buildPlaza(scene, low) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90),
    new THREE.MeshLambertMaterial({ map: canvasTex(512, 512, dirt('#c49a6c', ['#8b6844', '#e3c49a', '#6f5235', '#a88a5c']), 14) }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  // Packed, darker earth inside the circle where everyone plays.
  const pit = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 0.6, 64),
    new THREE.MeshLambertMaterial({ map: canvasTex(512, 512, dirt('#a77b52', ['#7a5638', '#c9a274', '#5e432b']), 3), transparent: true, opacity: 0.95 }));
  pit.rotation.x = -Math.PI / 2; pit.position.y = 0.005; pit.receiveShadow = true;
  scene.add(pit);
  const chalk = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 0.07, ARENA_R + 0.07, 128), new THREE.MeshBasicMaterial({ color: '#fbf6ea', transparent: true, opacity: 0.9 }));
  chalk.rotation.x = -Math.PI / 2; chalk.position.y = 0.012;
  scene.add(chalk);
  // Each player's throwing line.
  [0, 1].forEach(s => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.12), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[s], transparent: true, opacity: 0.8 }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.013, (s === 0 ? 1 : -1) * (LAUNCH_Z + 0.6));
    scene.add(line);
  });

  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const add = (mesh, x, y, z, ry = 0) => { mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = !low; mesh.receiveShadow = !low; scene.add(mesh); return mesh; };

  // Sari-sari store with a hand-painted sign.
  const store = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3.4), lam('#e9d8a6'));
  wall.position.y = 1.5;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.15, 4.2), lam('#7d8fa3'));
  roof.position.set(0, 3.15, 0.2); roof.rotation.x = 0.12;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.8), new THREE.MeshBasicMaterial({ map: canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#c1121f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd23f'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText("ALING NENA'S STORE", w / 2, h / 2 + 3);
  }) }));
  sign.position.set(0, 2.55, 1.72);
  const window_ = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#3d2b1f'; g.fillRect(0, 0, w, h);
    const cs = ['#ffd23f', '#e63946', '#3a86ff', '#2a9d8f', '#f4a261', '#fff'];
    for (let i = 0; i < 40; i++) { g.fillStyle = cs[i % cs.length]; g.fillRect(8 + (i % 10) * 24, 10 + Math.floor(i / 10) * 21, 16, 15); }
    g.strokeStyle = '#2b1d14'; g.lineWidth = 3;
    for (let x = 0; x < w; x += 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  }) }));
  window_.position.set(0, 1.45, 1.71);
  store.add(wall, roof, sign, window_);
  store.traverse(o => { if (o.isMesh) { o.castShadow = !low; o.receiveShadow = !low; } });
  store.position.set(-9, 0, -8); store.rotation.y = Math.PI / 4;
  scene.add(store);

  // Bahay kubo.
  const kubo = new THREE.Group();
  const kw = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 3.4), lam('#d4b483')); kw.position.y = 2;
  const kr = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 4), lam('#8a6d3b')); kr.position.y = 4.2; kr.rotation.y = Math.PI / 4;
  kubo.add(kw, kr);
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 6), lam('#6b4f2a')); st.position.set(x, 0.5, z); kubo.add(st);
  }
  kubo.traverse(o => { if (o.isMesh) { o.castShadow = !low; o.receiveShadow = !low; } });
  kubo.position.set(10, 0, -7); kubo.rotation.y = -0.5;
  scene.add(kubo);

  // Coconut palms.
  const palm = (x, z, h) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, h, 7), lam('#8b6b47'));
    trunk.position.y = h / 2; trunk.rotation.z = 0.08;
    g.add(trunk);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.5), lam(i % 2 ? '#3f8f3a' : '#4fa64a'));
      leaf.geometry.translate(1.2, 0, 0);
      leaf.position.y = h; leaf.rotation.set(0, (i / 7) * Math.PI * 2, -0.45);
      g.add(leaf);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = !low; });
    g.position.set(x, 0, z);
    scene.add(g);
  };
  palm(-13, 4, 7); palm(13, 3, 6.5); palm(-6, -15, 7.5); palm(7, -14, 6.8); palm(15, -12, 7.2); palm(-15, -4, 6.2);

  // Bamboo poles with banderitas (fiesta flags) strung between them.
  const poles = [[-8, -8], [8, -8], [8, 8], [-8, 8]].map(([x, z]) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 7.4, 6), lam('#c2a24f')), x, 3.7, z);
    return new THREE.Vector3(x, 7.2, z);
  });
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.16, 0, 0, 0.16, 0, 0, 0, -0.38, 0], 3));
  flagGeo.computeVertexNormals();
  const flagMats = ['#e63946', '#ffd23f', '#3a86ff', '#2a9d8f', '#ff70a6', '#fff8e7'].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  const flags = [];
  // One string per side; the side facing the camera is hidden so it never blocks the circle.
  const sides = {};
  const lineMat = new THREE.LineBasicMaterial({ color: '#4a3b2a' });
  const pairs = [[0, 1, 'nz'], [1, 2, 'px'], [2, 3, 'pz'], [3, 0, 'nx']];
  pairs.forEach(([a, b, side], pi) => {
    const A = poles[a], B = poles[b], n = Math.round(A.distanceTo(B) / 0.42), sag = 0.9;
    const group = sides[side] = new THREE.Group();
    scene.add(group);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = A.clone().lerp(B, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
      if (i > 0 && i < n) {
        const f = new THREE.Mesh(flagGeo, flagMats[(i + pi) % flagMats.length]);
        f.position.copy(p);
        f.rotation.order = 'YXZ';
        f.rotation.y = Math.atan2(B.x - A.x, B.z - A.z) + Math.PI / 2;
        f.userData.phase = rand(0, 6);
        group.add(f); flags.push(f);
      }
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  });
  return { flags, sides };
}

export function createScene(canvas, { low = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2));
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const skyDay = new THREE.Color('#ffd9a8'), skyDark = new THREE.Color('#1b1035');
  scene.background = skyDay.clone();
  scene.fog = new THREE.Fog(skyDay.clone(), 28, 70);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

  const hemi = new THREE.HemisphereLight('#fff3d6', '#7a5a3a', 1.6);
  const sun = new THREE.DirectionalLight('#fff0d0', 2.4);
  sun.position.set(8, 16, 6);
  sun.castShadow = !low;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  const flash = new THREE.PointLight('#e8f4ff', 0, 30);
  scene.add(hemi, sun, flash);

  const plaza = buildPlaza(scene, low);
  const dog = makeDog();
  scene.add(dog);

  // Spark/dust particles.
  const MAXP = 500;
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  const pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false;
  scene.add(points);
  let pNext = 0;
  const tmpC = new THREE.Color();
  function burst(x, y, z, n, color, speed = 4, up = 2) {
    tmpC.set(color);
    for (let k = 0; k < n; k++) {
      const i = pNext; pNext = (pNext + 1) % MAXP;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
      pVel[i * 3] = Math.cos(a) * s; pVel[i * 3 + 1] = rand(0.3, 1) * up; pVel[i * 3 + 2] = Math.sin(a) * s;
      pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
      pLife[i] = rand(0.4, 0.9);
    }
  }
  function updateParticles(dt) {
    for (let i = 0; i < MAXP; i++) {
      if (pLife[i] <= 0) { pPos[i * 3 + 1] = -50; continue; }
      pLife[i] -= dt;
      pVel[i * 3 + 1] -= 6 * dt;
      for (let k = 0; k < 3; k++) pPos[i * 3 + k] += pVel[i * 3 + k] * dt;
      if (pPos[i * 3 + 1] < 0.02) { pPos[i * 3 + 1] = 0.02; pVel[i * 3 + 1] *= -0.3; }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // Lightning bolt line.
  const boltMat = new THREE.LineBasicMaterial({ color: '#fffbe0', transparent: true });
  const bolt = new THREE.Line(new THREE.BufferGeometry(), boltMat);
  bolt.visible = false; scene.add(bolt);
  let boltT = 0;
  function strike(x, z) {
    const pts = [];
    let px = x + rand(-1, 1), pz = z + rand(-1, 1);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3(THREE.MathUtils.lerp(px, x, t) + (i < 12 ? rand(-0.35, 0.35) : 0), 12 * (1 - t) + 0.4, THREE.MathUtils.lerp(pz, z, t) + (i < 12 ? rand(-0.35, 0.35) : 0)));
    }
    bolt.geometry.setFromPoints(pts);
    bolt.visible = true; boltT = 0.45;
    flash.position.set(x, 3, z); flash.intensity = 60;
  }

  let tops = [null, null];
  let topIds = [null, null];
  let shake = 0, eclipse = 0, time = 0;
  let view = 'spectator';
  let instant = true;
  let dogTarget = null;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

  function setPlayers(players) {
    for (const s of [0, 1]) {
      const id = players[s] && players[s].top;
      if (id === topIds[s]) continue;
      if (tops[s]) scene.remove(tops[s].root);
      topIds[s] = id;
      tops[s] = id ? makeTop(id, s, low) : null;
      if (tops[s]) { tops[s].root.visible = false; scene.add(tops[s].root); }
    }
  }

  // Hide both tops between rounds.
  function reset() {
    for (const t of tops) if (t) { t.root.visible = false; t.state = t.target = null; t.wasLaunched = false; t.fallT = 0; }
    dog.visible = false; dogTarget = null;
  }

  function applySnap(snap, direct = true) {
    instant = direct;
    snap.tops.forEach((s, i) => { if (tops[i]) tops[i].target = s; });
    dogTarget = snap.dog;
  }

  function fx(e) {
    switch (e.type) {
      case 'hit':
        burst(e.x, 0.45, e.z, Math.round(10 + 30 * e.i), '#ffcf5a', 3 + 5 * e.i, 3);
        shake = Math.max(shake, e.i * 0.35);
        break;
      case 'launch':
        burst(e.x, 0.05, e.z, 18, '#d8b98c', 2.5, 1.2);
        break;
      case 'fall': case 'out':
        burst(e.x, 0.1, e.z, 25, '#d8b98c', 3, 1.5);
        shake = Math.max(shake, 0.2);
        break;
      case 'bark':
        burst(e.x, 0.3, e.z, 15, '#d8b98c', 3, 2);
        break;
      case 'ability':
        if (e.top === 'kidlat') { strike(e.tx, e.tz); burst(e.tx, 0.4, e.tz, 50, '#e8f4ff', 6, 4); shake = 0.6; }
        if (e.top === 'tikbalang') burst(e.x, 0.2, e.z, 40, '#8d5524', 5, 1.5);
        if (e.top === 'agimat') burst(e.x, 0.6, e.z, 30, '#7fffd4', 2.5, 2.5);
        if (e.top === 'diwata') burst(e.x, 0.3, e.z, 60, '#ff9ecb', 1.5, 6);
        if (e.top === 'bakunawa') { eclipse = 5; burst(e.tx, 0.5, e.tz, 40, '#9b5de5', 3, 3); }
        break;
    }
  }

  function setView(v) {
    view = v;
    const front = v === 0 ? 'pz' : v === 1 ? 'nz' : 'px';
    for (const k in plaza.sides) plaza.sides[k].visible = k !== front;
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function updateTop(t, dt, slot) {
    const s = t.target;
    if (!s) return;
    if (!t.state) t.state = { ...s };
    const st = t.state, k = instant ? 1 : 1 - Math.exp(-dt * 14);
    for (const key of ['x', 'z', 'spin', 'wobble']) st[key] += (s[key] - st[key]) * k;
    Object.assign(st, { launched: s.launched, alive: s.alive, out: s.out, shield: s.shield, invert: s.invert, dash: s.dash, charge: s.charge });
    t.root.visible = st.launched;
    if (!st.launched) return;
    if (!t.wasLaunched) { t.wasLaunched = true; t.drop = 1; }
    t.drop = Math.max(0, t.drop - dt * 4);
    t.root.position.set(st.x, t.drop * t.drop * 1.5, st.z);
    if (st.alive) {
      t.prec += dt * (2 + 7 * st.wobble);
      t.precess.rotation.y = t.prec;
      t.tilt.rotation.x = 0.03 + st.wobble * 0.5;
      t.spinner.rotation.y -= Math.min(st.spin * 40, 30) * dt;
    } else {
      // Toppled: roll onto its side and settle.
      t.fallT = Math.min(1, t.fallT + dt * 2.5);
      t.tilt.rotation.x = THREE.MathUtils.lerp(t.tilt.rotation.x, 1.25, t.fallT);
      t.root.position.y = 0.3 * t.fallT;
      t.spinner.rotation.y -= dt * 3 * (1 - t.fallT);
    }
    t.shield.visible = st.shield && st.alive;
    t.shield.material.opacity = 0.18 + Math.sin(time * 8) * 0.06;
    t.ring.material.color.set(st.invert ? '#9b5de5' : PLAYER_COLORS[slot]);
    if (st.dash && st.alive && Math.random() < 0.6) burst(st.x, 0.1, st.z, 2, '#8d5524', 1, 0.8);
    if (st.alive && st.wobble > 0.55 && Math.random() < st.wobble * 0.3) burst(st.x, 0.05, st.z, 1, '#d8b98c', 1, 0.6);
  }

  function updateCamera(dt) {
    const a = camera.aspect;
    let pos, look;
    if (view === 0 || view === 1) {
      const sz = view === 0 ? 1 : -1;
      // Phones: stand behind your own throwing line; pull back in portrait so the circle fits.
      pos = new THREE.Vector3(0, a < 1 ? 10 : 8, sz * (a < 1 ? 9 : 9.5));
      look = new THREE.Vector3(0, 0, -sz * 0.6);
    } else {
      // Spectator: side-on so both players' sides read left/right, with a slow sway.
      const ang = Math.sin(time * 0.12) * 0.25;
      pos = new THREE.Vector3(Math.cos(ang) * 10.5, 8, Math.sin(ang) * 10.5);
      look = new THREE.Vector3(0, 0, 0);
      const live = tops.filter(t => t && t.state && t.state.launched);
      if (live.length) {
        const mx = live.reduce((s, t) => s + t.state.x, 0) / live.length, mz = live.reduce((s, t) => s + t.state.z, 0) / live.length;
        look.set(mx * 0.3, 0, mz * 0.3);
      }
    }
    // Widen the lens until the whole circle fits across the screen (portrait phones need more).
    const dist = pos.distanceTo(look);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.atan((ARENA_R + (a < 1 ? 2.5 : 1)) / dist)) / a));
    camera.fov = THREE.MathUtils.clamp(fov, 42, 80);
    camera.updateProjectionMatrix();
    const k = 1 - Math.exp(-dt * 3);
    if (camPos.lengthSq() === 0) { camPos.copy(pos); camLook.copy(look); }
    camPos.lerp(pos, k); camLook.lerp(look, k);
    camera.position.copy(camPos);
    if (shake > 0) camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 0.3));
    camera.lookAt(camLook);
  }

  function render(dt) {
    time += dt;
    tops.forEach((t, i) => t && updateTop(t, dt, i));
    if (dogTarget) {
      dog.visible = true;
      dog.position.x += (dogTarget.x - dog.position.x) * (instant ? 1 : 1 - Math.exp(-dt * 12));
      dog.position.z = dogTarget.z;
      dog.rotation.y = dogTarget.dir > 0 ? 0 : Math.PI;
      dog.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(time * 22 + (i % 2) * Math.PI) * 0.7; });
      dog.userData.tail.rotation.x = Math.sin(time * 30) * 0.5;
    } else dog.visible = false;
    plaza.flags.forEach(f => { f.rotation.x = Math.sin(time * 2.2 + f.userData.phase) * 0.35; });
    updateParticles(dt);
    shake = Math.max(0, shake - dt * 1.5);
    if (boltT > 0) { boltT -= dt; boltMat.opacity = Math.random() > 0.3 ? 1 : 0.2; if (boltT <= 0) bolt.visible = false; }
    flash.intensity = Math.max(0, flash.intensity - dt * 150);
    eclipse = Math.max(0, eclipse - dt);
    const dark = Math.min(1, eclipse * 1.5) * 0.75;
    hemi.intensity = 1.6 * (1 - dark * 0.8);
    sun.intensity = 2.4 * (1 - dark * 0.9);
    scene.background.copy(skyDay).lerp(skyDark, dark);
    scene.fog.color.copy(scene.background);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();
  setView('spectator');
  return { setPlayers, applySnap, fx, render, resize, setView, reset };
}
