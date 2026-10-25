import * as THREE from 'three';
import { registerGlow } from './kit.js';

// Wear and storytelling decals: thin offset planes with procedural canvas
// textures. One shared material per kind, so a baked world pays one draw call
// per kind however many decals it places.

const materials = new Map();

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function texture(size, draw, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, rng(seed), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function blob(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

const DRAW = {
  // Rain streaks running down from an eave or a window sill.
  streaks(ctx, r, s) {
    const top = ctx.createLinearGradient(0, 0, 0, s * 0.18);
    top.addColorStop(0, 'rgba(45,32,20,0.55)');
    top.addColorStop(1, 'rgba(45,32,20,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, s, s * 0.18);
    for (let i = 0; i < 34; i += 1) {
      const x = r() * s;
      const len = s * (0.3 + r() * 0.7);
      const w = 2 + r() * 7;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(48,34,22,${0.25 + r() * 0.35})`);
      g.addColorStop(1, 'rgba(48,34,22,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, w, len);
    }
  },
  rust(ctx, r, s) {
    for (let i = 0; i < 22; i += 1) {
      const x = r() * s;
      const len = s * (0.2 + r() * 0.8);
      const w = 2 + r() * 5;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(128,62,24,${0.5 + r() * 0.3})`);
      g.addColorStop(1, 'rgba(128,62,24,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, w, len);
      blob(ctx, x + w / 2, len * 0.85, w * 1.4, '110,52,20', 0.35);
    }
  },
  // Peeled paint showing the grey hollow-block render underneath.
  chips(ctx, r, s) {
    for (let i = 0; i < 16; i += 1) {
      const cx = r() * s;
      const cy = r() * s;
      const rad = 6 + r() * 24;
      ctx.beginPath();
      const n = 6 + Math.floor(r() * 4);
      for (let k = 0; k < n; k += 1) {
        const a = (k / n) * Math.PI * 2;
        const rr = rad * (0.5 + r() * 0.6);
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(178,170,156,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,70,60,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  },
  crack(ctx, r, s) {
    ctx.strokeStyle = 'rgba(38,28,22,0.85)';
    ctx.lineCap = 'round';
    const walk = (x, y, a, len, w) => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 0; i < len; i += 1) {
        a += (r() - 0.5) * 0.9;
        x += Math.cos(a) * 9;
        y += Math.sin(a) * 9;
        ctx.lineTo(x, y);
        if (r() < 0.12 && w > 1) walk(x, y, a + (r() - 0.5) * 2, len / 2, w * 0.6);
      }
      ctx.stroke();
    };
    walk(s * 0.5, s * 0.05, Math.PI / 2, 26, 2.6);
  },
  stain(ctx, r, s) {
    for (let i = 0; i < 12; i += 1) blob(ctx, s * (0.3 + r() * 0.4), s * (0.3 + r() * 0.4), s * (0.08 + r() * 0.2), '28,24,20', 0.35);
  },
  moss(ctx, r, s) {
    const g = ctx.createLinearGradient(0, s, 0, s * 0.35);
    g.addColorStop(0, 'rgba(52,70,30,0.75)');
    g.addColorStop(1, 'rgba(52,70,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i += 1) blob(ctx, r() * s, s * (0.65 + r() * 0.35), 4 + r() * 12, '60,82,34', 0.5);
  },
  // Worn band of scuffs and tsinelas prints where everyone stands round the bilog.
  scuff(ctx, r, s) {
    const c = s / 2;
    for (let i = 0; i < 260; i += 1) {
      const a = r() * Math.PI * 2;
      const rad = c * (0.58 + r() * 0.4);
      const light = r() > 0.45;
      blob(ctx, c + Math.cos(a) * rad, c + Math.sin(a) * rad, 6 + r() * 16, light ? '226,196,150' : '70,48,30', light ? 0.22 : 0.18);
    }
    ctx.fillStyle = 'rgba(60,40,24,0.28)';
    for (let i = 0; i < 70; i += 1) {
      const a = r() * Math.PI * 2;
      const rad = c * (0.7 + r() * 0.25);
      ctx.save();
      ctx.translate(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
      ctx.rotate(a + (r() - 0.5));
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  tire(ctx, r, s) {
    for (const y0 of [s * 0.3, s * 0.7]) {
      for (let x = 0; x < s; x += 3) {
        const y = y0 + Math.sin(x * 0.02) * 6;
        ctx.fillStyle = `rgba(40,30,20,${0.2 + r() * 0.2})`;
        ctx.fillRect(x, y - 7, 3, 14);
      }
    }
  },
  patch(ctx, r, s) {
    ctx.fillStyle = 'rgba(112,106,98,0.92)';
    ctx.beginPath();
    for (let k = 0; k < 14; k += 1) {
      const a = (k / 14) * Math.PI * 2;
      ctx.lineTo(s / 2 + Math.cos(a) * s * (0.38 + r() * 0.1), s / 2 + Math.sin(a) * s * (0.38 + r() * 0.1));
    }
    ctx.fill();
    for (let i = 0; i < 300; i += 1) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? '80,76,70' : '150,144,134'},0.5)`;
      ctx.fillRect(s * 0.15 + r() * s * 0.7, s * 0.15 + r() * s * 0.7, 2, 2);
    }
  },
  leaves(ctx, r, s) {
    const colors = ['111,140,52', '150,118,52', '170,90,40', '90,110,40'];
    for (let i = 0; i < 70; i += 1) {
      ctx.save();
      ctx.translate(r() * s, r() * s);
      ctx.rotate(r() * Math.PI);
      ctx.fillStyle = `rgba(${colors[i % colors.length]},0.9)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 3 + r() * 3, 8 + r() * 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  puddle(ctx, r, s) {
    for (let i = 0; i < 8; i += 1) blob(ctx, s * (0.35 + r() * 0.3), s * (0.35 + r() * 0.3), s * (0.18 + r() * 0.15), '255,255,255', 0.9);
  },
};

export function decalMaterial(kind) {
  let m = materials.get(kind);
  if (!m) {
    const size = kind === 'scuff' ? 512 : 256;
    const map = texture(size, DRAW[kind], kind.length * 977 + 13);
    const puddle = kind === 'puddle';
    m = new THREE.MeshStandardMaterial({
      map: puddle ? null : map,
      alphaMap: puddle ? map : null,
      color: puddle ? '#3e4a52' : '#ffffff',
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      roughness: puddle ? 0.08 : 0.95,
      metalness: puddle ? 0.3 : 0,
    });
    materials.set(kind, m);
  }
  return m;
}

/** A wall decal; the plane faces +z before `rot` is applied. `spin` rotates it in its own plane. */
export function decal(parent, kind, w, h, p, ry = 0, spin = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMaterial(kind));
  mesh.position.set(...p);
  mesh.rotation.set(0, ry, spin);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function groundDecal(parent, kind, w, h, x, z, spin = 0, y = 0.03) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMaterial(kind));
  mesh.position.set(x, y, z);
  mesh.rotation.set(-Math.PI / 2, 0, spin);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Sun-faded paper poster or marker graffiti, with a torn corner. */
export function poster(parent, lines, opts) {
  const W = 256;
  const H = Math.round((W * opts.h) / opts.w);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const r = rng(lines.join('').length * 31 + 7);
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, H * 0.82);
    ctx.lineTo(W * 0.8, H);
    ctx.lineTo(0, H);
    ctx.fill();
    for (let i = 0; i < 6; i += 1) blob(ctx, r() * W, r() * H, 20 + r() * 40, '150,120,60', 0.18);
  }
  ctx.fillStyle = opts.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = opts.hand ? '"Comic Sans MS", "Segoe Print", cursive' : '"Lilita One", Impact, sans-serif';
  const lh = H / (lines.length + 0.5);
  lines.forEach((line, i) => {
    let size = lh * (i === 0 ? 0.8 : 0.55);
    ctx.font = `${size}px ${font}`;
    while (ctx.measureText(line).width > W * 0.88 && size > 8) {
      size -= 2;
      ctx.font = `${size}px ${font}`;
    }
    ctx.fillText(line, W / 2, lh * (i + 0.75));
  });
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(opts.w, opts.h),
    new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  mesh.position.set(...opts.p);
  mesh.rotation.set(0, opts.ry ?? 0, opts.tilt ?? 0);
  parent.add(mesh);
  return mesh;
}

const glowMats = new Map();

/** Additive pool of lamp light on the ground; invisible by day, brightens with the lamps. */
export function glowDecal(parent, color, w, h, x, z, y = 0.03) {
  let m = glowMats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      // Reuses the puddle's soft blob mask: no extra texture.
      alphaMap: decalMaterial('puddle').alphaMap,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    registerGlow(m, 0.32);
    glowMats.set(color, m);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z);
  mesh.rotation.x = -Math.PI / 2;
  parent.add(mesh);
  return mesh;
}
