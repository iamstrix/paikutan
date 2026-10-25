// Event-driven VFX, all pooled: soft dust, additive sparks, ground impact rings, comic onomatopoeia
// bursts and the Kidlat bolt. Ported from tromPOW's Effects (jmdgg); his throw string and palo
// telegraph are left out (we have no throw flight or palo). Works in his units: scale the group
// and pass positions divided by that scale.
import * as THREE from 'three';
import { Particles } from './particles.js';

export const CLASH_WORDS = ['PAK!', 'POW!', 'TSUG!', 'BLAG!', 'BOGSH!'];
export const POWER_WORDS = { kidlat: 'ZAP!', tikbalang: 'CHARGE!', agimat: 'SHIELD!', diwata: 'BLESSED!', bakunawa: 'ECLIPSE!' };

const powTextures = new Map();

function powTexture(word) {
  let tex = powTextures.get(word);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.translate(128, 128);
  ctx.beginPath();
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const r = i % 2 ? 70 : 118 - (i % 4) * 8;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.82);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#c0392b';
  ctx.stroke();
  ctx.rotate(-0.12);
  ctx.font = '64px "Lilita One", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#2b1d12';
  ctx.strokeText(word, 0, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(word, 0, 4);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  powTextures.set(word, tex);
  return tex;
}

/** Camera-facing strip through `pts`; width and alpha are given per point (k = 0 head .. 1 tail). */
function writeStrip(geo, pts, cam, color, width, alpha) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const view = new THREE.Vector3();
  for (let i = 0; i < pts.length; i += 1) {
    const k = pts.length > 1 ? i / (pts.length - 1) : 0;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    dir.subVectors(b, a);
    view.subVectors(cam, pts[i]);
    side.crossVectors(dir, view).normalize().multiplyScalar(width(k) / 2);
    if (!Number.isFinite(side.x)) side.set(0, width(k) / 2, 0);
    pos.setXYZ(i * 2, pts[i].x + side.x, pts[i].y + side.y, pts[i].z + side.z);
    pos.setXYZ(i * 2 + 1, pts[i].x - side.x, pts[i].y - side.y, pts[i].z - side.z);
    const al = alpha(k);
    col.setXYZW(i * 2, color.r, color.g, color.b, al);
    col.setXYZW(i * 2 + 1, color.r, color.g, color.b, al);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  geo.setDrawRange(0, Math.max(0, pts.length - 1) * 6);
}

function stripGeometry(maxPoints) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPoints * 6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxPoints * 8), 4));
  const index = [];
  for (let i = 0; i < maxPoints - 1; i += 1) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(index);
  return geo;
}

export class Effects {
  constructor(rng) {
    this.rng = rng;
    this.group = new THREE.Group();
    this.dust = new Particles('soft', 600);
    this.sparks = new Particles('spark', 300);
    this.rings = [];
    this.pows = [];
    this.bolts = [];
    this.ringNext = 0;
    this.powNext = 0;
    this.powCooldown = 0;
    this.cam = new THREE.Vector3();
    this.group.add(this.dust.points, this.sparks.points);
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i += 1) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rings.push({ mesh, t: 1, life: 1, radius: 1 });
    }
    // Kidlat: a jagged camera-facing bolt from the sky to the target.
    for (let i = 0; i < 2; i += 1) {
      const mesh = new THREE.Mesh(stripGeometry(12), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.bolts.push({ mesh, pts: [], t: 1 });
    }
    for (let i = 0; i < 4; i += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.group.add(sprite);
      this.pows.push({ sprite, t: 1, scale: 1 });
    }
  }

  puff(x, y, z, b) {
    this.dust.emit(x, y, z, { color: '#cdb08a', speed: 1.2, up: 0.6, life: 0.9, size: 0.45, grow: 2.4, gravity: -0.2, ...b }, this.rng);
  }

  spark(x, y, z, n, power) {
    this.sparks.emit(x, y, z, { n, color: '#ffcf5a', speed: 2.5 + power, up: 1.8, life: 0.45, size: 0.12, grow: 0.3, gravity: 7 }, this.rng);
  }

  /** Kidlat: lightning strikes (x, z). */
  lightning(x, z) {
    const b = this.bolts.find((o) => !o.mesh.visible) ?? this.bolts[0];
    b.pts = [];
    for (let i = 0; i < 12; i += 1) {
      const k = i / 11;
      const jitter = i === 0 || i === 11 ? 0 : 0.35;
      b.pts.push(new THREE.Vector3(x + (this.rng() - 0.5) * jitter, 6.5 - k * 6.2, z + (this.rng() - 0.5) * jitter));
    }
    b.t = 0;
    b.mesh.visible = true;
    this.spark(x, 0.3, z, 18, 3);
    this.ring(x, z, '#ffe066', 1.6, 0.45);
  }

  /** Diwata: a shimmer of pink and violet motes rising off a top. */
  sparkle(x, z) {
    this.dust.emit(x, 0.3, z, { n: 30, color: '#ffffff', palette: ['#f6bdc0', '#c77dff', '#ffffff'], speed: 0.8, up: 2.4, life: 1.4, size: 0.12, grow: 0.6, gravity: -0.6 }, this.rng);
  }

  confetti(x, y, z, n = 60) {
    this.dust.emit(x, y, z, { n, color: '#ffffff', palette: ['#e94b3c', '#f7c548', '#2f7dd1', '#53b36a', '#ffffff', '#e94b8a'], speed: 2.2, up: 5, life: 2.2, size: 0.1, grow: 1, gravity: 4 }, this.rng);
  }

  ring(x, z, color, radius, life = 0.5) {
    const r = this.rings[this.ringNext];
    this.ringNext = (this.ringNext + 1) % this.rings.length;
    r.mesh.position.set(x, 0.06, z);
    r.mesh.material.color.set(color);
    r.mesh.visible = true;
    r.t = 0;
    r.life = life;
    r.radius = radius;
  }

  /** Comic burst (PAK! POW!). Rate-limited so pile-ups stay readable. */
  pow(x, y, z, word, scale = 1.3) {
    if (this.powCooldown > 0) return;
    this.powCooldown = 0.35;
    const p = this.pows[this.powNext];
    this.powNext = (this.powNext + 1) % this.pows.length;
    p.sprite.material.map = powTexture(word);
    p.sprite.material.rotation = (this.rng() - 0.5) * 0.5;
    p.sprite.material.needsUpdate = true;
    p.sprite.position.set(x, y, z);
    p.sprite.visible = true;
    p.t = 0;
    p.scale = scale;
  }

  update(dt, camera, viewportHeight) {
    // Ours: particle sizes are in his units, so the group's scale joins the projection.
    const projScale = (viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * this.group.scale.x;
    this.dust.update(dt, projScale);
    this.sparks.update(dt, projScale);
    this.powCooldown -= dt;

    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      r.mesh.scale.setScalar(0.15 + r.radius * (1 - Math.pow(1 - k, 3)));
      r.mesh.material.opacity = 0.6 * (1 - k);
      if (k >= 1) r.mesh.visible = false;
    }

    // The bolt faces the camera, measured in the group's own (scaled) space.
    const cam = this.group.worldToLocal(camera.getWorldPosition(this.cam));
    for (const b of this.bolts) {
      if (!b.mesh.visible) continue;
      b.t += dt;
      const a = Math.max(0, 1 - b.t / 0.35);
      writeStrip(b.mesh.geometry, b.pts, cam, new THREE.Color('#fff6b0'), () => 0.14, () => a * (b.t % 0.1 < 0.05 ? 1 : 0.6));
      if (a <= 0) b.mesh.visible = false;
    }

    for (const p of this.pows) {
      if (!p.sprite.visible) continue;
      p.t += dt;
      const t = p.t;
      const s = t < 0.1 ? (t / 0.1) * 1.25 : Math.max(1, 1.25 - (t - 0.1) * 2);
      p.sprite.scale.setScalar(p.scale * s);
      p.sprite.position.y += dt * 0.4;
      p.sprite.material.opacity = t > 0.5 ? Math.max(0, 1 - (t - 0.5) / 0.25) : 1;
      if (t > 0.75) p.sprite.visible = false;
    }
  }
}
