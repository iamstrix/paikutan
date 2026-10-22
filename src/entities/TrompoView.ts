import * as THREE from 'three';
import { outline } from '../world/kit';

// 3D trompo: a lathed pear of wood with a painted swirl and a steel tip.
// Spin, precession, wobble, hops and the death topple are visual only, driven
// by the sim's (x, y, spin, air, out) values.

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

const swirls = new Map<string, THREE.CanvasTexture>();
let grainNormal: THREE.CanvasTexture | null = null;

/** Wavy turned-wood growth rings across the profile (canvas u = around, v = along). */
function grainLines(ctx: CanvasRenderingContext2D, w: number, h: number, stroke: string, width = 1): void {
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
function grainNormalMap(): THREE.CanvasTexture {
  if (grainNormal) return grainNormal;
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  ctx.filter = 'blur(1px)';
  grainLines(ctx, w, h, '#2a2a2a', 1.6);
  ctx.filter = 'none';
  const src = ctx.getImageData(0, 0, w, h).data;
  const out = ctx.createImageData(w, h);
  const height = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
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

/** One painted texture per player colour, shared by the spinning top and the one held in hand. */
function swirlTexture(color: string): THREE.CanvasTexture {
  const cached = swirls.get(color);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e2b980';
  x.fillRect(0, 0, 256, 128);
  grainLines(x, 256, 128, 'rgba(128,82,40,0.45)');
  // Bands across the profile, a diagonal swirl around it so spin reads. Paint sits
  // slightly translucent over the grain, like years of lacquer and play.
  x.globalAlpha = 0.92;
  x.fillStyle = color;
  x.fillRect(0, 56, 256, 18);
  x.fillStyle = '#2b1d12';
  x.fillRect(0, 80, 256, 5);
  x.fillRect(0, 50, 256, 3);
  for (let i = 0; i < 4; i += 1) {
    x.fillStyle = i % 2 ? '#c0392b' : color;
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
  let seed = color.length * 97 + color.charCodeAt(1);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#d9ad72';
  for (let i = 0; i < 26; i += 1) x.fillRect(rnd() * 256, 52 + rnd() * 70, 2 + rnd() * 5, 1 + rnd() * 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  swirls.set(color, t);
  return t;
}

let blurTex: THREE.CanvasTexture | null = null;
let blobTex: THREE.CanvasTexture | null = null;

/** Motion-blur arcs for the spin disc and a soft contact shadow; shared by every top. */
function fxTextures(): { blur: THREE.CanvasTexture; blob: THREE.CanvasTexture } {
  if (!blurTex || !blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
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
    const y = b.getContext('2d')!;
    const g = y.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    y.fillStyle = g;
    y.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(b);
  }
  return { blur: blurTex, blob: blobTex };
}


/** What a TrompoView needs from the sim snapshot each frame. */
export type TopVisual = {
  spin: number;
  wobble: number;
  launched: boolean;
  alive: boolean;
  out: boolean;
  shield: boolean;
  invert: boolean;
};

const FLIGHT = 0.38;

export class TrompoView {
  readonly group = new THREE.Group();
  /** True for exactly one update after the throw arc touches down. */
  justLanded = false;
  private readonly tilt = new THREE.Group();
  private readonly spinner = new THREE.Group();
  private readonly target = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private flightT = -1;
  private angle = 0;
  private precession = 0;
  private hop = 0;
  private hopV = 0;
  private dead = 0;
  private readonly blur: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly blob: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly shield: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  private readonly eclipse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private v: TopVisual = { spin: 0, wobble: 0, launched: false, alive: true, out: false, shield: false, invert: false };

  constructor(color: string) {
    const wood = new THREE.Mesh(
      new THREE.LatheGeometry(PROFILE, 20),
      // Hero material: lacquered paint over turned wood.
      new THREE.MeshPhysicalMaterial({
        map: swirlTexture(color),
        normalMap: grainNormalMap(),
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughness: 0.55,
        clearcoat: 0.6,
        clearcoatRoughness: 0.28,
      }),
    );
    wood.castShadow = true;
    outline(wood, 0.01);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), new THREE.MeshStandardMaterial({ color: '#cfd4d6', metalness: 0.8, roughness: 0.3 }));
    tip.rotation.x = Math.PI;
    this.spinner.add(wood, tip);
    this.spinner.position.y = 0.015;
    this.tilt.add(this.spinner);
    // Exaggerated 1.35x so tops read at plaza camera distance; matches the sim's TOP_R * WORLD_SCALE.
    this.tilt.scale.setScalar(1.35);
    this.group.add(this.tilt);

    // Spin blur: streaked disc round the widest point, opacity follows spin speed.
    const tex = fxTextures();
    this.blur = new THREE.Mesh(
      new THREE.CircleGeometry(0.25, 24),
      new THREE.MeshBasicMaterial({ map: tex.blur, color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5), transparent: true, depthWrite: false, opacity: 0 }),
    );
    this.blur.rotation.x = -Math.PI / 2;
    this.blur.position.y = 0.26;
    this.tilt.add(this.blur);
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.group.add(this.blob);
    // Agimat shield bubble and Bakunawa eclipse ring, shown while those powers are active.
    this.shield = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshBasicMaterial({ color: '#5ff2d6', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.shield.position.y = 0.3;
    this.shield.visible = false;
    this.group.add(this.shield);
    this.eclipse = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.48, 24, 1, 0, Math.PI * 1.6), new THREE.MeshBasicMaterial({ color: '#3a1f6b', transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    this.eclipse.rotation.x = -Math.PI / 2;
    this.eclipse.position.y = 0.05;
    this.eclipse.visible = false;
    this.group.add(this.eclipse);
  }

  /** The sim places a thrown top instantly; this plays the arc from the hand to that spot. */
  throwFrom(hand: THREE.Vector3): void {
    this.from.copy(hand);
    this.flightT = 0;
    this.group.position.copy(hand);
  }

  get flying(): boolean {
    return this.flightT >= 0;
  }

  /** Feed sim state; xz are world coordinates. */
  setState(x: number, z: number, v: TopVisual, snap: boolean): void {
    this.target.set(x, 0, z);
    if (snap) this.group.position.copy(this.target);
    if (!this.v.launched && v.launched) this.dead = 0;
    this.v = v;
  }

  kick(power: number): void {
    this.hopV = Math.max(this.hopV, 0.6 + power * 0.9);
  }

  update(dt: number): void {
    this.justLanded = false;
    this.group.visible = this.v.launched;
    if (!this.v.launched) return;

    if (this.flightT >= 0) {
      this.flightT += dt;
      const k = Math.min(1, this.flightT / FLIGHT);
      this.group.position.lerpVectors(this.from, this.target, k);
      this.group.position.y = Math.sin(k * Math.PI) * 1.0 + (1 - k) * this.from.y;
      this.tilt.rotation.set(k * 6, 0, 0.4);
      this.spinner.rotation.y += dt * 30;
      this.updateFx(dt);
      if (k >= 1) {
        this.flightT = -1;
        this.justLanded = true;
        this.kick(0.6);
      }
      return;
    }

    this.group.position.x += (this.target.x - this.group.position.x) * (1 - Math.exp(-dt * 18));
    this.group.position.z += (this.target.z - this.group.position.z) * (1 - Math.exp(-dt * 18));
    this.hopV -= 9.8 * dt;
    this.hop = Math.max(0, this.hop + this.hopV * dt);
    if (this.hop === 0) this.hopV = 0;
    this.group.position.y = this.hop;
    this.updateFx(dt);

    if (!this.v.alive) {
      // Natumba: topple onto its side and roll to a stop.
      this.dead = Math.min(1, this.dead + dt * 2.5);
      this.tilt.rotation.set(0, this.precession, 1.25 * this.dead);
      this.group.position.y = Math.max(this.group.position.y, 0.15 * this.dead);
      return;
    }
    // Visual spin rate is capped so the swirl doesn't strobe at 60 fps.
    this.angle += dt * Math.min(26, 6 + this.v.spin * 22);
    this.spinner.rotation.y = this.angle;
    // The sim's wobble (0 steady .. 1 toppled) drives the lean and the precession speed.
    const lean = Math.min(1, this.v.wobble) * 0.65 + 0.02;
    this.precession += dt * (2 + lean * 9);
    this.tilt.rotation.set(Math.sin(this.precession) * lean, 0, Math.cos(this.precession) * lean);
  }

  private updateFx(dt: number): void {
    const spinning = this.v.alive && this.flightT < 0;
    this.blur.material.opacity += ((spinning ? Math.min(0.45, this.v.spin * 0.45) : 0) - this.blur.material.opacity) * Math.min(1, dt * 10);
    this.blur.rotation.z -= dt * 30;
    // Contact shadow stays on the ground and fades as the top rises.
    const h = this.group.position.y;
    this.blob.position.y = 0.012 - h;
    this.blob.scale.setScalar(1 / (1 + h));
    this.blob.material.opacity = 1 / (1 + h * 2);
    this.shield.visible = this.v.shield && this.v.alive;
    if (this.shield.visible) this.shield.scale.setScalar(1 + Math.sin(performance.now() / 120) * 0.05);
    this.eclipse.visible = this.v.invert && this.v.alive;
    this.eclipse.position.y = 0.05 - h;
    this.eclipse.rotation.z += dt * 3;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
  }
}
