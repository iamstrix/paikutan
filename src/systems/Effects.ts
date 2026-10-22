import * as THREE from 'three';
import { Particles, type Burst } from './Particles';

// Event-driven VFX, all pooled: soft dust, additive sparks, ground impact
// rings, comic onomatopoeia bursts, and the pisi (string) + whip trail of
// every throw. Gameplay calls the verbs; update() animates them.

const MAX_TRAIL = 18;
const CORD_SEGS = 12;

type Ring = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; t: number; life: number; radius: number };
type Pow = { sprite: THREE.Sprite; t: number; scale: number };
type Arrow = { mesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>; t: number; life: number; length: number };
type Throw = {
  trail: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  cord: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  points: THREE.Vector3[];
  color: THREE.Color;
  hand: THREE.Vector3;
  head: THREE.Vector3;
  flying: boolean;
  retract: number;
};

const powTextures = new Map<string, THREE.CanvasTexture>();

function powTexture(word: string): THREE.CanvasTexture {
  let tex = powTextures.get(word);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
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
function writeStrip(
  geo: THREE.BufferGeometry,
  pts: THREE.Vector3[],
  cam: THREE.Vector3,
  color: THREE.Color,
  width: (k: number) => number,
  alpha: (k: number) => number,
): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
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

function stripGeometry(maxPoints: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPoints * 6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxPoints * 8), 4));
  const index: number[] = [];
  for (let i = 0; i < maxPoints - 1; i += 1) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(index);
  return geo;
}

export class Effects {
  readonly group = new THREE.Group();
  readonly dust = new Particles('soft', 600);
  readonly sparks = new Particles('spark', 300);
  private readonly rings: Ring[] = [];
  private readonly pows: Pow[] = [];
  private readonly throws = new Map<number, Throw>();
  private readonly arrows: Arrow[] = [];
  private arrowNext = 0;
  private readonly danger: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly bolts: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; pts: THREE.Vector3[]; t: number }[] = [];
  private dangerLevel = 0;
  private dangerT = 0;
  private ringNext = 0;
  private powNext = 0;
  private powCooldown = 0;

  constructor(private readonly rng: () => number) {
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
    // Palo telegraph: a flat arrow on the dirt that charges up before the strike.
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.05);
    shape.lineTo(0.72, -0.05);
    shape.lineTo(0.72, -0.16);
    shape.lineTo(1, 0);
    shape.lineTo(0.72, 0.16);
    shape.lineTo(0.72, 0.05);
    shape.lineTo(0, 0.05);
    shape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(shape);
    arrowGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i += 1) {
      const mesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.arrows.push({ mesh, t: 1, life: 1, length: 1 });
    }
    // Kidlat: a jagged camera-facing bolt from the sky to the target.
    for (let i = 0; i < 2; i += 1) {
      const mesh = new THREE.Mesh(stripGeometry(12), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.bolts.push({ mesh, pts: [], t: 1 });
    }
    this.danger = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, depthWrite: false }));
    this.danger.rotation.x = -Math.PI / 2;
    this.danger.renderOrder = 3;
    this.danger.visible = false;
    this.group.add(this.danger);
    for (let i = 0; i < 4; i += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.group.add(sprite);
      this.pows.push({ sprite, t: 1, scale: 1 });
    }
  }

  puff(x: number, y: number, z: number, b: Partial<Burst> & { n: number }): void {
    this.dust.emit(x, y, z, { color: '#cdb08a', speed: 1.2, up: 0.6, life: 0.9, size: 0.45, grow: 2.4, gravity: -0.2, ...b }, this.rng);
  }

  spark(x: number, y: number, z: number, n: number, power: number): void {
    this.sparks.emit(x, y, z, { n, color: '#ffcf5a', speed: 2.5 + power, up: 1.8, life: 0.45, size: 0.12, grow: 0.3, gravity: 7 }, this.rng);
  }

  /** Show a palo wind-up from (x0, z0) toward (x1, z1); it fills over `life` seconds. */
  telegraph(x0: number, z0: number, x1: number, z1: number, life: number): void {
    const a = this.arrows[this.arrowNext];
    this.arrowNext = (this.arrowNext + 1) % this.arrows.length;
    const dx = x1 - x0;
    const dz = z1 - z0;
    a.length = Math.min(2.4, Math.max(0.8, Math.hypot(dx, dz)));
    a.mesh.position.set(x0, 0.07, z0);
    a.mesh.rotation.y = -Math.atan2(dz, dx);
    a.mesh.visible = true;
    a.t = 0;
    a.life = life;
  }

  /** Pulsing red ring under the local top; level 0..1 (0 hides it). */
  setDanger(x: number, z: number, level: number): void {
    this.danger.position.set(x, 0.065, z);
    this.dangerLevel = level;
  }

  /** Kidlat: lightning strikes (x, z). */
  lightning(x: number, z: number): void {
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
  sparkle(x: number, z: number): void {
    this.dust.emit(x, 0.3, z, { n: 30, color: '#ffffff', palette: ['#f6bdc0', '#c77dff', '#ffffff'], speed: 0.8, up: 2.4, life: 1.4, size: 0.12, grow: 0.6, gravity: -0.6 }, this.rng);
  }

  /** Alitaptap: a slow blinking speck that drifts up and fades. */
  firefly(x: number, y: number, z: number): void {
    this.sparks.emit(x, y, z, { n: 1, color: '#d8ff6a', speed: 0.18, up: 0.08, life: 2.8, size: 0.08, grow: 1, gravity: -0.04 }, this.rng);
  }

  confetti(x: number, y: number, z: number, n = 60): void {
    this.dust.emit(
      x,
      y,
      z,
      { n, color: '#ffffff', palette: ['#e94b3c', '#f7c548', '#2f7dd1', '#53b36a', '#ffffff', '#e94b8a'], speed: 2.2, up: 5, life: 2.2, size: 0.1, grow: 1, gravity: 4 },
      this.rng,
    );
  }

  ring(x: number, z: number, color: string, radius: number, life = 0.5): void {
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
  pow(x: number, y: number, z: number, word: string, scale = 1.3): void {
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

  /** Call every frame a top is airborne: the pisi runs from the thrower's hand to the top. */
  trackThrow(id: number, hand: THREE.Vector3, head: THREE.Vector3, color: string): void {
    let fx = this.throws.get(id);
    if (!fx) {
      const mat = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      fx = {
        trail: new THREE.Mesh(stripGeometry(MAX_TRAIL), mat()),
        cord: new THREE.Mesh(stripGeometry(CORD_SEGS + 1), mat()),
        points: [],
        color: new THREE.Color(),
        hand: new THREE.Vector3(),
        head: new THREE.Vector3(),
        flying: false,
        retract: 1,
      };
      fx.trail.frustumCulled = fx.cord.frustumCulled = false;
      this.group.add(fx.trail, fx.cord);
      this.throws.set(id, fx);
    }
    if (!fx.flying) fx.points.length = 0;
    fx.flying = true;
    fx.retract = 0;
    fx.color.set(color).lerp(new THREE.Color('#ffffff'), 0.35);
    fx.hand.copy(hand);
    fx.head.copy(head);
    fx.points.unshift(head.clone());
    if (fx.points.length > MAX_TRAIL) fx.points.pop();
  }

  /** The top has landed: the string snaps back to the hand and the trail fades. */
  landThrow(id: number, hand: THREE.Vector3): void {
    const fx = this.throws.get(id);
    if (!fx || !fx.flying) return;
    fx.flying = false;
    fx.hand.copy(hand);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    const projScale = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
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

    for (const a of this.arrows) {
      if (!a.mesh.visible) continue;
      a.t += dt;
      const k = a.t / a.life;
      // Charge up (grow + fast pulse), then a short fade after the strike.
      a.mesh.scale.set(a.length * Math.min(1, 0.35 + k * 0.65), 1, 1 + Math.min(1, k) * 0.4);
      a.mesh.material.opacity = k < 1 ? 0.35 + 0.5 * Math.abs(Math.sin(a.t * 22)) : Math.max(0, 1 - (k - 1) * 5);
      if (k > 1.2) a.mesh.visible = false;
    }
    for (const b of this.bolts) {
      if (!b.mesh.visible) continue;
      b.t += dt;
      const a = Math.max(0, 1 - b.t / 0.35);
      writeStrip(b.mesh.geometry, b.pts, camera.position, new THREE.Color('#fff6b0'), () => 0.14, () => a * (b.t % 0.1 < 0.05 ? 1 : 0.6));
      if (a <= 0) b.mesh.visible = false;
    }
    this.dangerT += dt;
    this.danger.visible = this.dangerLevel > 0.02;
    this.danger.material.opacity = this.dangerLevel * (0.45 + 0.4 * Math.sin(this.dangerT * 14));
    this.danger.scale.setScalar(1 + 0.12 * Math.sin(this.dangerT * 14));

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

    const cam = camera.position;
    const mid = new THREE.Vector3();
    const cordPts: THREE.Vector3[] = [];
    for (const fx of this.throws.values()) {
      if (!fx.flying) {
        // Trail eats itself from the tail; the cord reels back in.
        fx.points.splice(-2, 2);
        fx.retract = Math.min(1, fx.retract + dt / 0.28);
      }
      writeStrip(fx.trail.geometry, fx.points, cam, fx.color, (k) => 0.12 * (1 - k), (k) => 0.75 * (1 - k));
      fx.cord.visible = fx.retract < 1;
      if (!fx.cord.visible) continue;
      const end = mid.copy(fx.head).lerp(fx.hand, fx.retract);
      cordPts.length = 0;
      for (let i = 0; i <= CORD_SEGS; i += 1) {
        const k = i / CORD_SEGS;
        const p = new THREE.Vector3().lerpVectors(fx.hand, end, k);
        // A loose string sags and whips; it straightens as it pays out.
        p.y -= Math.sin(k * Math.PI) * 0.25 * (fx.flying ? 0.4 : 1 - fx.retract);
        p.x += Math.sin(k * Math.PI * 2) * 0.06 * (1 - fx.retract);
        cordPts.push(p);
      }
      writeStrip(fx.cord.geometry, cordPts, cam, new THREE.Color('#f3ead2'), () => 0.03, () => 1);
    }
  }
}
