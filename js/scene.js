// three.js view: the barangay around the chalk circle, the trumpos, the players and effects.
// Used by the desktop spectator and the phones (which follow host snapshots).
import * as THREE from 'three';
import { ARENA_R, TOP_R, LAUNCH_Z, EGG_WARN, EGG_R, MAX_SEATS, seatDir } from './sim.js';
import { TOPS, CHARACTERS, PLAYER_COLORS, CHAR_MODEL, byId } from './data.js';
import { buildBarangay, WORLD_SCALE } from './world/barangay.js';
import { buildPodium } from './world/podium.js';
import { createAtmosphere } from './world/atmosphere.js';
import { buildTrompo } from './entities/trompo.js';
import { Avatar, BOWL_RELEASE } from './entities/avatar.js';
import { Critters, chicken } from './entities/critters.js';
import { Effects, CLASH_WORDS } from './fx/effects.js';
import { SkillEffects } from './fx/skills.js';
import { QUICK_CHAT } from './chat.js';
import { arenaCameraDistance } from './camera-fit.js';
import { ArenaZoneViews } from './entities/arena-zones.js';

const CLOCK = 15 * 60 + 30; // merienda time: warm light, lamps still off

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

function makeTop(topId, slot, low) {
  const def = byId(TOPS, topId);
  const root = new THREE.Group(), precess = new THREE.Group(), tilt = new THREE.Group(), spinner = new THREE.Group();
  root.add(precess); precess.add(tilt); tilt.add(spinner);
  const model = buildTrompo(def, low);
  // The turned wood and shallow trim fit the model's .25-unit radial envelope.
  // Match that envelope to the unchanged collision radius so clashes read correctly.
  const size = TOP_R / 0.25;
  model.body.scale.setScalar(size);
  model.blur.scale.setScalar(size); model.blur.position.y *= size;
  model.blob.scale.setScalar(size * 1.2); model.blob.position.y = 0.015;
  spinner.add(model.body);
  // Share the selected model's geometry and paint with the first-person held copy.
  const held = model.body.clone(true);
  held.scale.setScalar(0.7); held.rotation.x = Math.PI; held.visible = false;
  tilt.add(model.blur);
  model.aura.scale.multiplyScalar(size); model.aura.position.y *= size;
  tilt.add(model.aura);
  root.add(model.blob);
  // Coloured chalk ring under each top shows whose it is.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 40), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[slot], transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  // Ground arrow showing where the player is steering.
  const shape = new THREE.Shape();
  shape.moveTo(-0.07, 0.65); shape.lineTo(0.07, 0.65); shape.lineTo(0.07, 1.2); shape.lineTo(0.2, 1.2);
  shape.lineTo(0, 1.6); shape.lineTo(-0.2, 1.2); shape.lineTo(-0.07, 1.2); shape.closePath();
  const arrowMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[slot], transparent: true, opacity: 0.85, depthWrite: false }));
  arrowMesh.rotation.x = -Math.PI / 2;
  const arrow = new THREE.Group();
  arrow.position.y = 0.025; arrow.visible = false; arrow.add(arrowMesh);
  root.add(ring, arrow);
  return { root, precess, tilt, spinner, held, ring, arrow, aura: model.aura, topId, vfxTime: 0, auraMaterials: [...new Set(model.aura.children.map(o => o.material))], blur: model.blur, blob: model.blob, prec: rand(0, 6), drop: 0, state: null, target: null, wasLaunched: false, fallT: 0 };
}

// Our characters wear tromPOW's closest outfits: Tambay is his Mang Totoy, Aling Nena his Tita Marites.

// A player as one of tromPOW's big-head characters, scaled into our world like the barangay.
function makePerson(charId, slot, brawl) {
  const c = byId(CHARACTERS, charId);
  const avatar = new Avatar(CHAR_MODEL[c.id] || c.id, c.color);
  const root = avatar.group;
  root.scale.setScalar(WORLD_SCALE);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  if (brawl) {
    // A brawl rings the circle with players, each well back behind their own line and a step to the
    // side (the same side as in 1v1): any closer, the ones nearest the TV camera hide the circle.
    const [sx, sz] = seatDir(slot), back = ARENA_R + 2.8;
    root.position.set(sx * back - sz * 0.9, 0, sz * back + sx * 0.9);
    root.rotation.y = Math.atan2(-sx, -sz);
    return { root, avatar, home: [root.position.clone(), root.rotation.y] };
  }
  // Beside their own throwing line, on their right, facing the circle.
  const sz = slot === 0 ? 1 : -1;
  // Out to the side: these characters are big enough to cover the circle from the phone camera.
  root.position.set(-sz * 3, 0, sz * (LAUNCH_Z + 1.3));
  root.rotation.y = slot === 0 ? Math.PI : 0;
  return { root, avatar, home: [root.position.clone(), root.rotation.y] };
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
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.38, 5), new THREE.MeshBasicMaterial({ color: '#eec647', transparent: true, opacity: 0.55 }));
  stream.position.set(-0.3, 0.22, 0.27); stream.rotation.x = -0.6; stream.visible = false; g.add(stream);
  g.add(body, head, snout, ear1, ear2, tail);
  const legs = [];
  for (const [x, z] of [[0.3, 0.12], [0.3, -0.12], [-0.3, 0.12], [-0.3, -0.12]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), fur);
    l.geometry.translate(0, -0.2, 0);
    l.position.set(x, 0.42, z); g.add(l); legs.push(l);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.legs = legs; g.userData.tail = tail; g.userData.stream = stream;
  g.visible = false;
  return g;
}

// Our circle on top of the barangay's plaza: packed earth, the chalk line, each player's throwing line.
function buildCircle(scene) {
  // Packed, darker earth inside the circle where everyone plays.
  const pit = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 0.6, 64),
    new THREE.MeshLambertMaterial({ map: canvasTex(512, 512, dirt('#a77b52', ['#7a5638', '#c9a274', '#5e432b']), 3) }));
  pit.rotation.x = -Math.PI / 2; pit.position.y = 0.005; pit.receiveShadow = true;
  scene.add(pit);
  const chalk = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 0.07, ARENA_R + 0.07, 128), new THREE.MeshBasicMaterial({ color: '#fbf6ea', transparent: true, opacity: 0.9 }));
  chalk.rotation.x = -Math.PI / 2; chalk.position.y = 0.012;
  scene.add(chalk);
  // One throwing line per seat; a brawl shows the lines of the seats in use.
  chalk.userData.lines = Array.from({ length: MAX_SEATS }, (_, s) => {
    const [sx, sz] = seatDir(s);
    const seat = new THREE.Group();
    seat.rotation.y = Math.atan2(sx, sz);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.12), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[s], transparent: true, opacity: 0.8 }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.013, LAUNCH_Z + 0.6);
    seat.add(line);
    seat.visible = s < 2;
    scene.add(seat);
    return seat;
  });
  return chalk;
}

// 1v1 match end, in cutscene seconds: the ball hits the pin, the pin lands, the banner comes back.
// Between the two slow times everything runs at the slow rate, so the whole thing takes about 4.8 s.
const STRIKE = { hit: 2.5, land: 3.4, end: 4.2, slowFrom: 2.25, slowTo: 2.55, slow: 0.35 };

// cue(name, arg): sound for the match-end cutscene, as a method name on the audio object.
export function createScene(canvas, { low = false, cue = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2));
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The barangay's materials are tuned for filmic tone mapping.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  const chatLayer = document.createElement('div');
  chatLayer.className = 'chat-layer';
  chatLayer.setAttribute('aria-live', 'polite');
  document.body.append(chatLayer);
  const bubbles = new Map();
  const bubblePoint = new THREE.Vector3();
  // "You" tag under this device's own top, so players don't lose it in the clash effects.
  const youTag = document.createElement('div');
  youTag.className = 'you-tag'; youTag.textContent = 'You'; youTag.hidden = true;
  youTag.setAttribute('aria-hidden', 'true');
  document.body.append(youTag);
  const youPoint = new THREE.Vector3();

  const atmosphere = createAtmosphere(scene, { scale: WORLD_SCALE, low });
  const flash = new THREE.PointLight('#e8f4ff', 0, 30);
  scene.add(flash);

  const world = buildBarangay({ low });
  // Sunk a little so its ground decals stay under our circle's layers.
  world.group.position.y = -0.04;
  scene.add(world.group);
  // Chickens roam in barangay metres, so they live in its (scaled) group.
  const critters = new Critters(Math.random, low ? 4 : 6);
  world.group.add(critters.group);
  // Title screen: now and then a manok wanders up to the lens from the bottom-right corner.
  const PEEK_DIST = 2.5;
  const peeker = chicken(1);
  peeker.scale.setScalar(1.6);
  peeker.traverse(o => { o.castShadow = false; });
  peeker.visible = false;
  camera.add(peeker);
  scene.add(camera);
  let peekIn = rand(3, 6);
  // The chalk line follows the sim's circle, which shrinks late in a round (Sikip na!).
  const chalk = buildCircle(scene);
  let ringR = ARENA_R;
  const dog = makeDog();
  scene.add(dog);
  // The dog's lane across the circle: red chevrons pointing the way it will run, shown while it waits.
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_R * 2 + 2, 1.8), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineJoin = 'round';
      for (let x = 30; x < w; x += 64) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x + 24, h / 2); g.lineTo(x, h - 10); g.stroke(); }
    }),
    color: '#ff3b30', transparent: true, depthWrite: false,
  }));
  lane.material.map.wrapS = THREE.RepeatWrapping; lane.material.map.repeat.set(3, 1);
  lane.rotation.x = -Math.PI / 2; lane.position.y = 0.016; lane.visible = false;
  scene.add(lane);
  // Hens and their eggs, keyed by the sim's egg id.
  const eggViews = new Map();
  let eggSnap = [];
  const arenaZones = new ArenaZoneViews(scene);

  // tromPOW's pooled effects (dust, sparks, rings, POW! bursts, the Kidlat bolt) work in his units,
  // so the group is scaled like the barangay and every position goes in divided by WORLD_SCALE.
  const effects = new Effects(Math.random);
  effects.group.scale.setScalar(WORLD_SCALE);
  scene.add(effects.group);
  const skills = new SkillEffects({ low });
  scene.add(skills.group);
  const u = v => v / WORLD_SCALE;
  function pop(x, z, color, power) {
    flash.color.set(color); flash.position.set(x, 3, z); flash.intensity = power;
  }

  let tops = [null, null];
  let topIds = [null, null];
  let people = [null, null], charIds = [null, null], wasBrawl = false;
  let shake = 0, eclipse = 0, time = 0;
  let view = 'spectator';
  // Spectator camera: 'auto', 'top' (top-down), 'close' (low, wheel-height chase), 'orbit'.
  let camMode = 'auto';
  let party = null; // winner celebration: { slot, final, t }
  // Brawl match end: the top three on the podium, everyone else gathered round to clap.
  const stand = buildPodium();
  stand.group.scale.setScalar(WORLD_SCALE);
  stand.group.visible = false;
  scene.add(stand.group);
  let podium = null; // { places: [slot, ...] best first, crowd: [slot, ...], t }
  const podiumTags = new Map();
  const names = [];
  // 1v1 match end: the winner bowls their trumpo down an alley through the circle, the loser is the pin.
  let strike = null; // { win, lose, o: alley start [x, z], f: alley direction [x, z], c: cutscene time, ... }
  const localSteer = []; // this device's own steering, drawn without waiting for the host
  let own = -1; // slot this device plays; -1 for a spectator screen, which shows both arrows
  let chargeSlot = -1, chargeFeedback = null, windingTime = 0;
  let instant = true;
  let dogTarget = null;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

  function setPlayers(players) {
    // 1v1 has two seats, a brawl up to eight; switching modes clears the seats no longer used.
    const brawl = players.length > 2;
    players.forEach((p, s) => { names[s] = p ? p.name : ''; });
    if (brawl !== wasBrawl) {
      wasBrawl = brawl;
      people.forEach(p => p && scene.remove(p.root));
      people = []; charIds = [];
    }
    chalk.userData.lines.forEach((line, s) => { line.visible = brawl ? !!players[s] : s < 2; });
    const n = Math.max(players.length, tops.length, people.length);
    for (let s = 0; s < n; s++) {
      const id = (players[s] && players[s].top) || null;
      if (id === (topIds[s] || null)) continue;
      skills.cancel(s);
      if (tops[s]) {
        tops[s].held.removeFromParent();
        scene.remove(tops[s].root);
        tops[s].root.traverse(o => {
          if (!o.isMesh) return;
          o.geometry.dispose();
          // Painted maps and the outline shader are shared by the other player's model.
          if (!o.material.isShaderMaterial) o.material.dispose();
        });
      }
      topIds[s] = id;
      tops[s] = id ? makeTop(id, s, low) : null;
      if (tops[s]) { tops[s].root.visible = false; scene.add(tops[s].root); }
    }
    for (let s = 0; s < n; s++) {
      const id = (players[s] && players[s].char) || null;
      if (id === (charIds[s] || null)) continue;
      if (people[s]) scene.remove(people[s].root);
      charIds[s] = id;
      people[s] = id ? makePerson(id, s, brawl) : null;
      if (people[s]) scene.add(people[s].root);
    }
  }

  // Hide both tops between rounds.
  function reset() {
    setCharge(-1);
    for (const t of tops) if (t) { t.root.visible = false; t.state = t.target = null; t.wasLaunched = false; t.fallT = 0; t.dir = null; t.vfxTime = 0; }
    dog.visible = false; dogTarget = null; lane.visible = false;
    for (const v of eggViews.values()) scene.remove(v.group);
    eggViews.clear(); eggSnap = []; ringR = ARENA_R;
    arenaZones.reset();
    party = null;
    effects.reset(); skills.reset(); eclipse = 0;
    bubbles.forEach(b => b.el.remove()); bubbles.clear();
    youTag.hidden = true;
    clearPodium();
    clearStrike();
  }

  // After a match-end scene, everyone back to their own spot, standing up.
  function sendHome() {
    people.forEach(p => { if (p) { p.root.position.copy(p.home[0]); p.root.rotation.set(0, p.home[1], 0); p.root.visible = true; } });
  }

  function clearPodium() {
    if (!podium) return;
    podium = null;
    stand.group.visible = false;
    sendHome();
    tops.forEach(t => t && t.root.scale.setScalar(1));
    podiumTags.forEach(el => el.remove()); podiumTags.clear();
  }

  function clearStrike() {
    if (!strike) return;
    strike = null;
    sendHome();
    tops.forEach(t => { if (t) t.ring.visible = true; });
    document.body.classList.remove('cutscene');
  }

  // standings: every seat from first place down.
  function showPodium(standings) {
    reset();
    podium = { places: standings.slice(0, 3), crowd: standings.slice(3), t: 0 };
    stand.group.visible = true;
    podium.places.forEach((slot, i) => {
      const el = document.createElement('div');
      el.className = 'podium-tag';
      el.dataset.place = i + 1;
      el.style.setProperty('--pc', PLAYER_COLORS[slot]);
      el.innerHTML = `<b>${i + 1}</b>`;
      el.append(names[slot] || `P${slot + 1}`);
      el.hidden = true;
      chatLayer.append(el);
      podiumTags.set(slot, el);
    });
  }

  // The podium grows up out of the dirt, then each player hops on, 3rd place first.
  function updatePodium(dt) {
    podium.t += dt;
    const t = podium.t, rise = Math.min(1, t / 0.7), e = 1 - (1 - rise) ** 3;
    stand.group.position.y = (e - 1) * stand.height * WORLD_SCALE;
    stand.flags.forEach((f, i) => f.setRotationFromAxisAngle(f.userData.axis, Math.sin(time * 1.6 + i) * 0.18));
    tops.forEach(top => { if (top) top.root.visible = false; });
    podium.places.forEach((slot, i) => {
      const p = people[slot], top = tops[slot], spot = stand.spots[i];
      const hop = THREE.MathUtils.clamp((t - 0.7 - (2 - i) * 0.35) / 0.4, 0, 1);
      if (p) {
        p.root.visible = hop > 0;
        p.root.position.copy(spot.stand).multiplyScalar(WORLD_SCALE).add(stand.group.position);
        p.root.position.y += Math.sin(hop * Math.PI) * 1.2;
        p.root.rotation.y = 0;
      }
      // Their trumpo spins at their feet.
      if (top) {
        top.root.visible = hop >= 1;
        top.root.position.copy(spot.top).multiplyScalar(WORLD_SCALE).add(stand.group.position);
        top.root.scale.setScalar(0.75); // full size hides the legs of whoever stands behind it
        top.prec += dt * 2.5;
        top.precess.rotation.y = top.prec;
        top.tilt.rotation.x = 0.04;
        top.spinner.rotation.y -= dt * 60;
        top.blur.material.opacity = 0.35;
        top.blur.rotation.z -= dt * 60;
        top.blob.position.y = 0.015; top.blob.material.opacity = 1;
        top.arrow.visible = false;
        top.aura.visible = true;
      }
    });
    // The rest stand in an arc behind it, either side of the poles, facing the podium.
    podium.crowd.forEach((slot, k) => {
      const p = people[slot];
      if (!p) return;
      const a = [2.05, -2.05, 2.6, -2.6, Math.PI][k], r = 4.4;
      p.root.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
      p.root.rotation.y = Math.atan2(-p.root.position.x, -p.root.position.z);
    });
    // Confetti over the winner, a gentler sprinkle on 2nd and 3rd, fireworks over the plaza.
    if (rise >= 1) {
      podium.places.forEach((slot, i) => {
        const spot = stand.spots[i];
        if (Math.random() < [0.45, 0.15, 0.1][i]) effects.confetti(spot.stand.x + rand(-0.4, 0.4), spot.stand.y + 2.4, rand(-0.3, 0.3), 5);
      });
      if (Math.random() < 0.05) {
        const fx = rand(-7, 7), fz = rand(-6, -2);
        effects.sparks.emit(u(fx), u(rand(6, 9)), u(fz), { n: 50, color: ['#ffd23f', '#ff70a6', '#7fffd4', '#e8f4ff'][Math.floor(rand(0, 4))], speed: 3, up: 1.5, life: 0.9, size: 0.14, grow: 0.3, gravity: 2 }, Math.random);
        pop(fx, fz, '#ffd23f', 20);
      }
    }
  }

  // Name tags over the podium players' heads; after the camera moves, so they don't lag a frame.
  function placePodiumTags() {
    for (const [slot, el] of podiumTags) {
      const p = people[slot];
      if (!p || !p.root.visible) { el.hidden = true; continue; }
      p.avatar.rig.head.getWorldPosition(bubblePoint);
      bubblePoint.y += 1.3;
      bubblePoint.project(camera);
      el.hidden = bubblePoint.z < -1 || bubblePoint.z > 1;
      el.style.left = `${(bubblePoint.x + 1) * 50}%`;
      el.style.top = `${(1 - bubblePoint.y) * 50}%`;
    }
  }

  // A point on the bowling alley: metres along it from the bowler's spot, up, and to its side.
  function alley(along, up = 0, side = 0) {
    const { o, f } = strike;
    return new THREE.Vector3(o[0] + f[0] * along - f[1] * side, up, o[1] + f[1] * along + f[0] * side);
  }

  function showStrike(win, lose) {
    reset();
    if (!people[win] || !people[lose] || !tops[win]) return;
    // From just behind the winner's own throwing line, straight across the circle.
    const [sx, sz] = seatDir(win);
    strike = { win, lose, o: [sx * 5.6, sz * 5.6], f: [-sx, -sz], c: 0, dc: 0, along: 0, ball: new THREE.Vector3(), dust: 0, released: false, hit: false, done: false };
    for (const s of [win, lose]) people[s].root.rotation.order = 'YXZ'; // so the pin flips end over end along the alley
    const bowler = people[win].avatar, held = tops[win].held;
    if (bowler.held !== held) { bowler.rig.hand.add(held); bowler.held = held; }
    tops[win].ring.visible = false;
    document.body.classList.add('cutscene');
  }

  function updateStrike(dt) {
    const S = strike;
    S.dc = dt * (S.c > STRIKE.slowFrom && S.c < STRIKE.slowTo ? STRIKE.slow : 1);
    S.c += S.dc;
    const c = S.c, w = people[S.win], l = people[S.lose], top = tops[S.win];
    if (!w || !l || !top) return;
    const yaw = Math.atan2(S.f[0], S.f[1]);
    // The bowler: a couple of steps up, the delivery, and a celebration once the pin is down.
    w.root.position.copy(alley(0.6 * Math.min(1, c / BOWL_RELEASE)));
    w.root.rotation.y = yaw;
    w.avatar.bowlT = c;
    w.avatar.mode = c < STRIKE.hit + 0.3 ? 'bowl' : 'cheer';
    // The pin: panics as it comes, then flies back end over end and lands flat out, seeing stars.
    const fly = THREE.MathUtils.clamp((c - STRIKE.hit) / (STRIKE.land - STRIKE.hit), 0, 1);
    l.root.position.copy(alley(10 + 2.6 * fly, 9.6 * fly * (1 - fly) + 0.35 * fly));
    l.root.rotation.y = yaw + Math.PI;
    l.root.rotation.x = -Math.PI * 2.5 * (1 - (1 - fly) ** 2);
    l.avatar.mode = fly >= 1 ? 'ko' : c > 1.5 ? 'panic' : 'idle';
    tops.forEach((t, s) => { if (t && s !== S.win) t.root.visible = false; });
    // The ball: leaves the hand, weaves a little down the alley, and keeps spinning where it struck.
    top.root.visible = c >= BOWL_RELEASE;
    if (c >= BOWL_RELEASE) {
      if (!S.released) {
        S.released = true;
        cue('throw');
        const p = alley(0.9);
        effects.puff(u(p.x), 0.05, u(p.z), { n: 10, speed: 1.3 });
      }
      const run = Math.min(1, (c - BOWL_RELEASE) / (STRIKE.hit - BOWL_RELEASE));
      S.along = c < STRIKE.hit ? 0.9 + 8.6 * run : 9.5 + 0.9 * (1 - Math.exp(-(c - STRIKE.hit) * 3));
      S.ball.copy(alley(S.along, 0, Math.sin(run * Math.PI * 3) * 0.3 * (1 - run)));
      top.root.position.copy(S.ball);
      top.spinner.rotation.y -= S.dc * 90;
      top.prec += S.dc * 6;
      top.precess.rotation.y = top.prec;
      top.tilt.rotation.x = 0.12;
      top.blur.material.opacity = 0.4;
      top.blur.rotation.z -= S.dc * 90;
      top.blob.position.y = 0.015; top.blob.material.opacity = 1;
      top.arrow.visible = false;
      top.aura.visible = true;
      S.dust -= S.dc;
      if (S.dust <= 0 && c < STRIKE.hit + 0.4) {
        S.dust = 0.04;
        effects.puff(u(S.ball.x), 0.04, u(S.ball.z), { n: 2, size: 0.3, speed: 0.5, up: 0.4, life: 0.6 });
      }
    }
    if (c >= STRIKE.hit && !S.hit) {
      S.hit = true;
      const p = alley(9.8);
      effects.pow(u(p.x), 1.6, u(p.z), 'STRIKE!', 1.6);
      effects.spark(u(p.x), 0.6, u(p.z), 30, 3);
      effects.ring(u(p.x), u(p.z), '#ffd23f', 2, 0.6);
      effects.puff(u(p.x), 0.05, u(p.z), { n: 16, speed: 2, size: 0.5 });
      shake = 0.9;
      pop(p.x, p.z, '#ffcf5a', 45);
      cue('hit', 1);
      cue('fall');
    }
    if (c > STRIKE.land && Math.random() < 0.35) {
      const p = w.root.position;
      effects.confetti(u(p.x + rand(-1, 1)), 2.2, u(p.z + rand(-1, 1)), 5);
    }
    // Then the Kampeon banner, the HUD and the rematch buttons come back.
    if (c >= STRIKE.end && !S.done) { S.done = true; document.body.classList.remove('cutscene'); }
  }

  // The cutscene's cuts: [camera position, look-at point, fov]. Hard cuts, no easing between shots.
  function strikeShot() {
    const S = strike, c = S.c, w = people[S.win].root.position, l = people[S.lose].root.position;
    // Over the bowler's shoulder, down the alley at the pin, pushing in.
    if (c < BOWL_RELEASE) return [alley(-7 + 1.2 * c / BOWL_RELEASE, 2.4, 2.8), alley(5, 1.3), 45];
    // Chasing the ball at trumpo height.
    if (c < 1.9) return [alley(S.along - 1.8, 0.7, 0.25), alley(S.along + 3, 0.9), 65];
    // Reaction shot: close on the loser's face as they see it coming.
    if (c < STRIKE.slowFrom) return [alley(8, 1.6, 1.8), alley(10, 2.3), 40];
    // Side-on for the slow-motion hit, panning to follow the pin into the air.
    if (c < STRIKE.land + 0.2) return [alley(7.6, 1, 6.8), l.clone().setY(l.y + 1), 42];
    // Hero shot: low, looking up at the bowler.
    if (c < STRIKE.end) return [alley(5, 0.8, 2.4), w.clone().setY(2), 42];
    // The aftermath, held until the rematch: the whole alley from the side.
    return [alley(6.4, 3, 13), alley(6.4, 1.3), 50];
  }

  function makeEggView(e) {
    const group = new THREE.Group();
    const egg = new THREE.Mesh(new THREE.SphereGeometry(EGG_R * 0.9, 16, 12), new THREE.MeshStandardMaterial({ color: '#f3e6cc', roughness: 0.6 }));
    egg.scale.y = 1.25; egg.position.set(e.x, EGG_R * 1.1, e.z); egg.castShadow = !low; egg.visible = false;
    // Warning ring where the egg will land.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(e.x, 0.018, e.z);
    // The hen runs in from the edge behind the spot, and back out the same way.
    const hen = chicken(e.id);
    hen.scale.setScalar(WORLD_SCALE * 1.2);
    hen.traverse(o => { if (o.isMesh) o.castShadow = !low; });
    const d = Math.hypot(e.x, e.z) || 1;
    const from = [e.x / d * (ARENA_R + 2.5), e.z / d * (ARENA_R + 2.5)];
    group.add(egg, ring, hen);
    scene.add(group);
    return { group, egg, ring, hen, from, out: 0 };
  }

  function updateEggs(dt) {
    const seen = new Set();
    for (const e of eggSnap) {
      seen.add(e.id);
      let v = eggViews.get(e.id);
      if (!v) { v = makeEggView(e); eggViews.set(e.id, v); }
      const laid = e.t >= 0;
      // Running in: p goes 0 -> 1 as the warning runs out. Afterwards, out counts the run away.
      const p = laid ? 1 : 1 - Math.min(1, -e.t / EGG_WARN);
      if (laid) v.out += dt;
      const k = laid ? Math.min(1, v.out / 0.9) : 1 - p;
      const hx = e.x + (v.from[0] - e.x) * k, hz = e.z + (v.from[1] - e.z) * k;
      v.hen.visible = !laid || v.out < 0.9;
      v.hen.position.set(hx, Math.abs(Math.sin(time * 16)) * 0.08, hz);
      const [tx, tz] = laid ? v.from : [e.x, e.z];
      v.hen.rotation.y = Math.atan2(-(tz - hz), tx - hx);
      v.hen.userData.head.rotation.z = Math.sin(time * 18) * 0.25;
      v.ring.visible = !laid;
      v.ring.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(time * (8 + 10 * p)));
      v.ring.scale.setScalar(1.2 - 0.3 * p);
      v.egg.visible = laid;
      // About to hatch: it rocks.
      v.egg.rotation.z = laid && e.t < 1.5 ? Math.sin(time * 20) * 0.25 : 0;
    }
    for (const [id, v] of eggViews) if (!seen.has(id)) { scene.remove(v.group); eggViews.delete(id); }
  }

  function celebrate(slot, final) { party = { slot, final, t: 0 }; }
  function setCam(m) { camMode = m; }
  function setCharge(slot, feedback = null) {
    if (slot !== chargeSlot) {
      const previous = people[chargeSlot];
      if (previous) {
        previous.avatar.rig.head.visible = true;
        previous.avatar.mode = 'idle';
        if (previous.avatar.held) previous.avatar.held.visible = false;
      }
      chargeSlot = slot;
      windingTime = 0;
      // Enter at eye level, without flying through the player's body from the arena camera.
      if (slot >= 0) camPos.set(0, 0, 0);
    }
    chargeFeedback = feedback;
    const person = people[slot], top = tops[slot];
    if (!person || !top) return;
    if (person.avatar.held !== top.held) {
      person.avatar.rig.hand.add(top.held);
      person.avatar.held = top.held;
    }
    top.held.visible = true;
    person.avatar.rig.head.visible = false;
  }
  // slot < 0 clears it (spectator). A player device only shows its own arrow, never the rival's.
  function setLocalSteer(slot, v) {
    own = slot >= 0 ? slot : -1;
    localSteer.length = 0;
    if (own >= 0) localSteer[own] = v;
  }

  function applySnap(snap, direct = true) {
    instant = direct;
    snap.tops.forEach((s, i) => { if (tops[i]) tops[i].target = s; });
    dogTarget = snap.dog;
    eggSnap = snap.eggs || [];
    arenaZones.sync(snap.zones);
    ringR = snap.ring || ARENA_R;
  }

  function fx(e) {
    const x = u(e.x), z = u(e.z), tx = u(e.tx), tz = u(e.tz);
    switch (e.type) {
      case 'zoneLand':
        effects.ring(x, z, e.zone === 'swerte' ? '#ffe486' : '#e9b738', 1.1, 0.5);
        effects.pow(x, 0.9, z, e.zone === 'swerte' ? 'SWERTE!' : 'MADULAS!', 0.8);
        break;
      case 'zoneEnter':
        effects.puff(x, 0.12, z, { n: 5, color: e.zone === 'swerte' ? '#ffe595' : '#dcb549', size: 0.12, up: 0.5 });
        break;
      case 'chat': {
        if (!QUICK_CHAT[e.i] || !people[e.slot]) break;
        bubbles.get(e.slot)?.el.remove();
        const el = document.createElement('div');
        el.className = 'chat-bubble'; el.lang = 'fil';
        el.style.left = '50%'; el.style.top = '20%';
        el.textContent = QUICK_CHAT[e.i];
        el.style.setProperty('--pc', PLAYER_COLORS[e.slot]);
        chatLayer.append(el);
        const bubble = { el, until: performance.now() + 2600 };
        bubbles.set(e.slot, bubble);
        setTimeout(() => { el.remove(); if (bubbles.get(e.slot) === bubble) bubbles.delete(e.slot); }, 2600);
        break;
      }
      case 'hit': {
        skills.hit(e.x, e.z, e.i);
        const power = e.i * 4;
        effects.spark(x, 0.3, z, 8 + Math.floor(power * 5), power);
        effects.puff(x, 0.05, z, { n: 4 + Math.floor(power * 2), size: 0.35 });
        effects.ring(x, z, '#fff3c8', 0.6 + power * 0.35, 0.4);
        if (e.i > 0.45) effects.pow(x, 1.1, z, CLASH_WORDS[Math.floor(Math.random() * CLASH_WORDS.length)]);
        shake = Math.max(shake, e.i * 0.45);
        if (e.i > 0.6) pop(e.x, e.z, '#ffcf5a', 25 * e.i);
        break;
      }
      case 'launch':
        effects.puff(x, 0.05, z, { n: 10, speed: 1.3 });
        effects.ring(x, z, '#f3e2c0', 0.9);
        if (people[e.slot]) people[e.slot].avatar.release();
        break;
      case 'steal':
        // Ours: motes in the thief's colour fly off the leader.
        if (e.amt > 0.012) {
          effects.puff(u(e.fx), 0.3, u(e.fz), { n: Math.round(e.amt * 200), color: PLAYER_COLORS[e.slot], speed: 1.6, up: 1.2, size: 0.15, grow: 0.6, gravity: 2 });
          effects.ring(x, z, PLAYER_COLORS[e.slot], 0.9, 0.4);
        }
        break;
      case 'boost':
        effects.puff(x - u(e.dx * 0.4), 0.05, z - u(e.dz * 0.4), { n: 12, speed: 2.2, size: 0.45 });
        effects.ring(x, z, '#fff8e7', 0.8, 0.25);
        break;
      case 'fall': case 'out':
        effects.puff(x, 0.05, z, { n: 14, speed: 1.8, size: 0.5 });
        effects.ring(x, z, e.type === 'out' ? '#d6453d' : '#9a8a70', 1.4, 0.6);
        if (e.type === 'out') effects.pow(x, 1.0, z, 'BLAG!');
        shake = Math.max(shake, 0.7);
        break;
      case 'bark':
        effects.puff(x, 0.05, z, { n: 12, speed: 1.8, size: 0.45 });
        effects.pow(x, 1.0, z, 'ARF!', 1.1);
        shake = Math.max(shake, 0.4);
        break;
      case 'egg':
        effects.puff(x, 0.05, z, { n: 6, size: 0.3 });
        effects.pow(x, 0.8, z, 'POK!', 0.9);
        break;
      case 'crack':
        effects.pow(x, 0.9, z, 'PLOK!', 1);
        effects.puff(x, 0.05, z, { n: 10, speed: 1.2, size: 0.35, color: '#f7d154' });
        effects.ring(x, z, '#f5b02e', 0.8, 0.4);
        break;
      case 'hatch':
        effects.puff(x, 0.05, z, { n: 8, size: 0.3, color: '#fff3c8' });
        break;
      case 'stomp':
        skills.stomp(e.slot);
        // The end of a Tikbalang stampede: hooves come down.
        effects.puff(x, 0.05, z, { n: 18, speed: 2.4, size: 0.5 });
        effects.ring(x, z, '#e63946', u(2), 0.5); // the stomp's 2 m reach
        effects.pow(x, 1.0, z, 'BLAG!', 1.2);
        shake = Math.max(shake, 0.5);
        break;
      case 'ability': {
        const source = tops[e.slot];
        if (source) source.vfxTime = 1.2;
        skills.cast(e.top, { slot: e.slot, target: e.target ?? 1-e.slot, x: e.x, z: e.z, tx: e.tx, tz: e.tz });
        if (e.top === 'kidlat') {
          skills.hitTarget(e.target ?? 1-e.slot);
          pop(e.tx, e.tz, '#e8f4ff', 60); shake = 0.9;
        } else if (e.top === 'tikbalang') {
          effects.puff(x, 0.05, z, { n: 12, speed: 2.2, size: 0.45 });
          effects.ring(x, z, '#e63946', 1.1, 0.4);
          pop(e.x, e.z, '#ff6b3d', 40); shake = Math.max(shake, 0.5);
        } else if (e.top === 'agimat') {
          effects.ring(x, z, '#e9c46a', 1.0, 0.6);
          pop(e.x, e.z, '#7fffd4', 40); shake = Math.max(shake, 0.3);
        } else if (e.top === 'diwata') {
          effects.sparkle(x, z);
          pop(e.x, e.z, '#ffb3e0', 50);
        } else if (e.top === 'bakunawa') {
          eclipse = Math.max(eclipse, 0.12);
          effects.ring(tx, tz, '#5bc0be', 1.6, 0.8);
          effects.puff(tx, 0.05, tz, { n: 10, color: '#137d89', size: 0.5 });
          shake = Math.max(shake, 0.5);
        }
        break;
      }
    }
  }

  function setView(v) {
    view = v;
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
    if (!st.launched) { skills.track(slot, st); return; }
    if (!t.wasLaunched) { t.wasLaunched = true; t.drop = 1; }
    t.drop = Math.max(0, t.drop - dt * 4);
    t.root.position.set(st.x, t.drop * t.drop * 1.5, st.z);
    if (st.alive) {
      t.prec += dt * (2 + 7 * st.wobble);
      t.precess.rotation.y = t.prec;
      t.tilt.rotation.x = 0.03 + st.wobble * 0.5;
      // Fast launch rotation (up to ~16 turns/s), easing down as spin runs out.
      t.spinner.rotation.y -= Math.min(st.spin * 110, 100) * dt;
    } else {
      // Toppled: roll onto its side and settle.
      t.fallT = Math.min(1, t.fallT + dt * 2.5);
      t.tilt.rotation.x = THREE.MathUtils.lerp(t.tilt.rotation.x, 1.25, t.fallT);
      t.root.position.y = 0.3 * t.fallT;
      t.spinner.rotation.y -= dt * 3 * (1 - t.fallT);
    }
    skills.track(slot, { top: t.topId, x: st.x, z: st.z, y: t.root.position.y, alive: st.alive, launched: st.launched, shield: st.shield, invert: st.invert, dash: st.dash });
    // Always shown while alive: bright when steering, dimmed on the last direction when not
    // (tilt has a small dead zone, so hiding it made the arrow flicker).
    const [ax, az] = localSteer[slot] || [s.wx || 0, s.wz || 0];
    const am = Math.hypot(ax, az);
    if (am > 0.05) t.dir = [ax / am, az / am];
    else if (!t.dir) t.dir = [-st.x || 0, -st.z || 1];
    t.arrow.visible = st.alive && !party && (own < 0 || own === slot);
    if (t.arrow.visible) {
      t.arrow.rotation.y = Math.atan2(-t.dir[0], -t.dir[1]);
      t.arrow.scale.setScalar(0.6 + 0.4 * Math.min(1, am));
      t.arrow.children[0].material.opacity = 0.3 + 0.55 * Math.min(1, am / 0.4);
    }
    // Spin blur follows the spin; the contact shadow stays on the ground as the top drops in.
    t.blur.material.opacity += ((st.alive ? Math.min(0.45, st.spin * 0.45) : 0) - t.blur.material.opacity) * Math.min(1, dt * 10);
    t.blur.rotation.z -= dt * (st.alive ? Math.min(st.spin * 110, 100) : 3 * (1 - t.fallT));
    t.blob.position.y = 0.015 - t.root.position.y;
    t.blob.material.opacity = 1 / (1 + t.root.position.y * 2);
    // Curse art is a separate marker; player ownership stays red/blue throughout.
    t.ring.material.color.set(PLAYER_COLORS[slot]);
    t.vfxTime = Math.max(0, t.vfxTime - dt);
    t.aura.visible = st.alive;
    t.aura.rotation.y -= dt * (t.topId === 'bakunawa' ? -0.55 : 0.4);
    const auraAlpha = 0.1 + 0.05 * Math.sin(time * 3) + 0.17 * Math.min(1, st.charge || 0) + (t.vfxTime > 0 ? 0.2 : 0);
    for (const m of t.auraMaterials) m.opacity = auraAlpha;
    if (st.alive && st.wobble > 0.55 && Math.random() < st.wobble * 0.3) effects.puff(u(st.x), 0.04, u(st.z), { n: 1, size: 0.22, speed: 0.3, up: 0.3, life: 0.7 });
  }

  function updateCamera(dt) {
    const a = camera.aspect;
    let pos, look;
    if (strike && people[strike.win] && people[strike.lose]) {
      let fov;
      [pos, look, fov] = strikeShot();
      camera.fov = fov; camera.near = 0.1;
      camera.updateProjectionMatrix();
      camPos.copy(pos); camLook.copy(look);
      camera.position.copy(camPos);
      if (shake > 0) camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 0.3));
      camera.lookAt(camLook);
      return;
    }
    const winding = people[chargeSlot];
    // The match-end scenes only run on the host's screen, and take its camera even when the host plays a seat.
    if (podium) {
      // Front on to the podium with the plaza behind, swaying a little; it rises with the steps.
      const ang = Math.sin(time * 0.2) * 0.22, rise = Math.min(1, podium.t / 1.6);
      // Aimed high so the podium sits under the Kampeon banner.
      look = new THREE.Vector3(0, 1.6 + rise * 1.4, 0);
      pos = new THREE.Vector3(Math.sin(ang) * 12, 2 + rise * 2, Math.cos(ang) * 12);
    } else if (winding) {
      // Look through the chosen character's eyes at their hands and the arena beyond.
      const yaw = winding.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
      pos = winding.avatar.rig.head.getWorldPosition(new THREE.Vector3());
      pos.add(new THREE.Vector3(fx * 0.12, 0.34, fz * 0.12).multiplyScalar(WORLD_SCALE));
      look = pos.clone().add(new THREE.Vector3(fx * 1.3, -1.05, fz * 1.3).multiplyScalar(WORLD_SCALE));
    } else if (typeof view === 'number' && view >= 0) {
      const [sx, sz] = seatDir(view), back = a < 1 ? 9 : 9.5;
      // Players stand behind their own throwing line on every device; fit portrait too.
      pos = new THREE.Vector3(sx * back, a < 1 ? 10 : 8, sz * back);
      look = new THREE.Vector3(-sx * 0.6, 0, -sz * 0.6);
    } else if (camMode === 'menu') {
      // Title screen: the circle on the right with the sari-sari store behind, room on the left for the menu.
      const sway = Math.sin(time * 0.1) * 0.6;
      pos = new THREE.Vector3(1 + sway, 6, 15);
      look = new THREE.Vector3(-4 + sway, 0.5, -2);
    } else if (party && tops[party.slot] && tops[party.slot].state) {
      // Winner close-up: slow orbit around the trumpo still spinning.
      const w = tops[party.slot].state, ang = party.t * 0.6 + 0.8;
      look = new THREE.Vector3(w.x, 0.5, w.z);
      pos = look.clone().add(new THREE.Vector3(Math.cos(ang) * 3, 1.4 - Math.min(0.6, party.t * 0.3), Math.sin(ang) * 3));
    } else if (camMode === 'top') {
      pos = new THREE.Vector3(0, 15, 0.01); look = new THREE.Vector3(0, 0, 0);
    } else if (camMode === 'orbit') {
      const ang = time * 0.25;
      pos = new THREE.Vector3(Math.cos(ang) * 9, 4, Math.sin(ang) * 9); look = new THREE.Vector3(0, 0.3, 0);
    } else if (camMode === 'close') {
      // Wheel-height chase: low and tight on the middle of the action.
      const live = tops.filter(t => t && t.state && t.state.launched);
      look = new THREE.Vector3(0, 0.4, 0);
      if (live.length) look.set(live.reduce((s, t) => s + t.state.x, 0) / live.length, 0.4, live.reduce((s, t) => s + t.state.z, 0) / live.length);
      const ang = time * 0.15;
      pos = look.clone().add(new THREE.Vector3(Math.cos(ang) * 3.2, 0.35, Math.sin(ang) * 3.2));
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
    const tight = podium || (view === 'spectator' && (party || camMode === 'close' || camMode === 'menu'));
    camera.fov = winding ? 60 : tight ? 40 : 48;
    if (!winding && !tight) {
      const offset = pos.clone().sub(look);
      offset.setLength(Math.max(offset.length(), arenaCameraDistance(a, camera.fov, ARENA_R + 0.75)));
      pos = look.clone().add(offset);
    }
    camera.near = winding ? 0.03 : 0.1;
    camera.updateProjectionMatrix();
    const k = 1 - Math.exp(-dt * (tight ? 5 : 3));
    if (camPos.lengthSq() === 0) { camPos.copy(pos); camLook.copy(look); }
    camPos.lerp(pos, k); camLook.lerp(look, k);
    camera.position.copy(camPos);
    if (shake > 0) camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 0.3));
    camera.lookAt(camLook);
  }

  function updatePeek(dt) {
    peeker.visible = false;
    if (camMode !== 'menu' || view !== 'spectator') return;
    peekIn -= dt;
    if (peekIn > 0) return;
    const t = -peekIn, stay = 4.5;
    if (t > stay) { peekIn = rand(7, 14); return; }
    // Slide in from past the right edge, look around, peck at the lens, slide back out.
    const k = Math.min(1, t / 0.6, (stay - t) / 0.6), e = k * k * (3 - 2 * k);
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * PEEK_DIST, halfW = halfH * camera.aspect;
    peeker.visible = true;
    peeker.position.set(halfW + 0.5 - e * 0.95, -halfH - 0.15, -PEEK_DIST);
    peeker.rotation.set(0, Math.atan2(-0.45, -1), 0);
    const head = peeker.userData.head;
    head.rotation.x = Math.sin(t * 3) * 0.35;
    head.rotation.z = t > 2.2 && t < 3 ? -0.7 * Math.max(0, Math.sin((t - 2.2) * 12)) : 0;
  }

  function render(dt) {
    time += dt;
    if (strike) updateStrike(dt);
    else if (!podium) tops.forEach((t, i) => t && updateTop(t, dt, i));
    if (dogTarget) {
      if (!dog.visible) dog.position.x = dogTarget.x;
      dog.visible = true;
      dog.position.x += (dogTarget.x - dog.position.x) * (instant ? 1 : 1 - Math.exp(-dt * 12));
      dog.position.z = dogTarget.z;
      dog.rotation.y = dogTarget.dir > 0 ? 0 : Math.PI;
      const waiting = dogTarget.warn > 0, marking = dogTarget.mark > 0;
      // Waiting at the edge it hops on the spot; then it runs.
      dog.position.y = waiting ? Math.abs(Math.sin(time * 9)) * 0.12 : 0;
      dog.userData.legs.forEach((l, i) => {
        l.rotation.z = waiting || marking ? 0 : Math.sin(time * 22 + (i % 2) * Math.PI) * 0.7;
        l.rotation.x = marking && i === 2 ? -1.2 : 0;
      });
      dog.userData.stream.visible = marking;
      dog.userData.tail.rotation.x = Math.sin(time * 30) * 0.5;
      lane.visible = waiting;
      if (waiting) {
        lane.position.z = dogTarget.z;
        lane.rotation.z = dogTarget.dir > 0 ? 0 : Math.PI;
        lane.material.map.offset.x -= dt * 1.5;
        lane.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(time * 10));
      }
    } else { dog.visible = false; lane.visible = false; }
    updateEggs(dt);
    arenaZones.update(dt);
    chalk.scale.setScalar(ringR / ARENA_R);
    chalk.material.color.set(ringR < ARENA_R - 0.01 ? '#ff8a7a' : '#fbf6ea');
    people.forEach((p, s) => {
      if (!p) return;
      // Watch your own top, slump when it falls; the round winner cheers. The throw plays out on its own.
      const a = p.avatar, st = tops[s] && tops[s].state;
      // The match-end scenes pose everyone themselves.
      if (podium) a.mode = podium.places[0] === s ? 'cheer' : 'clap';
      else if (!strike && a.mode !== 'release') {
        a.mode = s === chargeSlot ? 'wind' : party ? (party.slot === s ? 'cheer' : 'sad')
          : st && st.launched ? (st.alive ? 'watch' : 'sad') : 'idle';
      }
      if (s === chargeSlot) {
        const speed = chargeFeedback?.speed || 0;
        windingTime += dt * Math.min(3, speed * 0.8);
        if (a.held) a.held.rotation.y += dt * speed * Math.PI * 2;
        a.update(dt, windingTime);
      } else if (strike) a.update(strike.dc, strike.c); // slow motion too
      else a.update(dt, time);
    });
    world.update(time);
    critters.update(dt, time);
    updatePeek(dt);
    if (podium) updatePodium(dt);
    if (party) {
      party.t += dt;
      const w = tops[party.slot] && tops[party.slot].state;
      // Confetti, and fireworks over the plaza for the match winner.
      if (w && Math.random() < (party.final ? 0.5 : 0.25)) effects.confetti(u(w.x + rand(-1.5, 1.5)), 1.4, u(w.z + rand(-1.5, 1.5)), 6);
      if (party.final && Math.random() < 0.06) {
        const fx = rand(-6, 6), fz = rand(-6, 6);
        effects.sparks.emit(u(fx), u(rand(5, 8)), u(fz), { n: 50, color: ['#ffd23f', '#ff70a6', '#7fffd4', '#e8f4ff'][Math.floor(rand(0, 4))], speed: 3, up: 1.5, life: 0.9, size: 0.14, grow: 0.3, gravity: 2 }, Math.random);
        pop(fx, fz, '#ffd23f', 20);
      }
    }
    shake = Math.max(0, shake - dt * 1.5);
    flash.intensity = Math.max(0, flash.intensity - dt * 150);
    const cursed = !podium && tops.some(t => t && t.state && t.state.alive && t.state.invert);
    eclipse += ((cursed ? 0.28 : 0) - eclipse) * (1 - Math.exp(-dt * 6));
    atmosphere.setClock(CLOCK, eclipse);
    updateCamera(dt);
    placePodiumTags();
    for (const [slot, bubble] of bubbles) {
      const person = people[slot];
      if (!person || performance.now() >= bubble.until) { bubble.el.remove(); bubbles.delete(slot); continue; }
      person.avatar.rig.head.getWorldPosition(bubblePoint);
      bubblePoint.y += 0.9;
      bubblePoint.project(camera);
      bubble.el.hidden = bubblePoint.z < -1 || bubblePoint.z > 1;
      bubble.el.style.left = `${THREE.MathUtils.clamp((bubblePoint.x + 1) * 50, 12, 88)}%`;
      bubble.el.style.top = `${THREE.MathUtils.clamp((1 - bubblePoint.y) * 50, 14, 80)}%`;
    }
    // Spectator screens (own < 0) have no single "you", so the tag only shows on a player's device.
    const mine = own >= 0 ? tops[own] : null;
    youTag.hidden = !(mine && mine.state && mine.root.visible && !party && !podium && !strike);
    if (!youTag.hidden) {
      // Anchor on the near edge of the ownership ring, so the tag sits just under the top on screen.
      const p = mine.root.position;
      youPoint.set(camera.position.x - p.x, 0, camera.position.z - p.z).setLength(0.7).add(p).setY(0);
      youPoint.project(camera);
      youTag.hidden = youPoint.z < -1 || youPoint.z > 1;
      youTag.style.left = `${THREE.MathUtils.clamp((youPoint.x + 1) * 50, 6, 94)}%`;
      youTag.style.top = `${THREE.MathUtils.clamp((1 - youPoint.y) * 50, 6, 94)}%`;
      youTag.style.setProperty('--pc', PLAYER_COLORS[own]);
    }
    effects.update(dt, camera, canvas.clientHeight);
    skills.update(dt, camera, canvas.clientHeight);
    atmosphere.follow(camera.position);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();
  setView('spectator');
  return { setPlayers, applySnap, fx, render, resize, setView, reset, celebrate, showPodium, showStrike, setCam, setLocalSteer, setCharge };
}
