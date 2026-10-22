import * as THREE from 'three';

export type Burst = {
  n: number;
  color: string;
  speed: number;
  up: number;
  life: number;
  /** World-space diameter at birth. */
  size: number;
  /** Size multiplier reached at end of life (dust billows, sparks shrink). */
  grow?: number;
  gravity?: number;
  /** Pick each particle's colour from this list instead of `color` (confetti). */
  palette?: string[];
};

function spriteTexture(kind: 'soft' | 'spark'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  if (kind === 'soft') {
    // Lumpy dust puff: a few offset soft blobs.
    for (const [x, y, r] of [
      [32, 32, 28],
      [24, 28, 18],
      [40, 36, 18],
      [34, 22, 14],
    ]) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
  } else {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

/** Pooled sprite particles with per-particle size and alpha (one draw call per pool). */
export class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly grow: Float32Array;
  private readonly gravity: Float32Array;
  private readonly material: THREE.ShaderMaterial;
  private next = 0;
  private readonly tmp = new THREE.Color();

  constructor(
    kind: 'soft' | 'spark',
    private readonly count = 400,
  ) {
    this.pos = new Float32Array(count * 3).fill(-999);
    this.col = new Float32Array(count * 3);
    this.alpha = new Float32Array(count);
    this.size = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.baseSize = new Float32Array(count);
    this.grow = new Float32Array(count);
    this.gravity = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: spriteTexture(kind) }, projScale: { value: 500 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float projScale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * projScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() {
          float a = texture2D(map, gl_PointCoord).a * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, b: Burst, rng: () => number): void {
    for (let k = 0; k < b.n; k += 1) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      this.tmp.set(b.palette ? b.palette[Math.floor(rng() * b.palette.length)] : b.color);
      const a = rng() * Math.PI * 2;
      const s = b.speed * (0.4 + rng() * 0.6);
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(a) * s, b.up * (0.5 + rng()), Math.sin(a) * s], i * 3);
      this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
      this.life[i] = this.maxLife[i] = b.life * (0.6 + rng() * 0.4);
      this.baseSize[i] = b.size * (0.7 + rng() * 0.6);
      this.grow[i] = b.grow ?? 1;
      this.gravity[i] = b.gravity ?? 4;
    }
  }

  /** projScale = canvas height in px / (2 tan(fov/2)), so sizes are world units. */
  update(dt: number, projScale: number): void {
    this.material.uniforms.projScale.value = projScale;
    for (let i = 0; i < this.count; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.pos[o + 1] = -999;
        continue;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.vel[o + 1] -= this.gravity[i] * dt;
      const drag = Math.exp(-dt * 2.5);
      this.vel[o] *= drag;
      this.vel[o + 2] *= drag;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] = Math.max(0.02, this.pos[o + 1] + this.vel[o + 1] * dt);
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.size[i] = this.baseSize[i] * (1 + (this.grow[i] - 1) * t);
      // Quick fade-in, long fade-out.
      this.alpha[i] = Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
    }
    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.alpha.needsUpdate = true;
    attrs.size.needsUpdate = true;
    attrs.color.needsUpdate = true;
  }
}
