import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Low-poly building blocks: shared flat-shaded materials, primitive helpers,
// a static bake that merges meshes per material, and canvas sign textures.

const materials = new Map();

export function mat(color, emissive) {
  const key = color + (emissive ?? '');
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true });
    if (emissive) {
      m.emissive.set(emissive);
      m.emissiveIntensity = 0;
      m.userData.lamp = true;
    }
    materials.set(key, m);
  }
  return m;
}

const glows = new Map();

/** Additive light-spill / halo materials: their opacity follows the lamps (up to `max`). */
export function registerGlow(m, max) {
  m.opacity = 0;
  glows.set(m, max);
}

/** Lamp materials glow as dusk comes (k runs 0 → 1.6 across the evening). */
export function setLampGlow(k) {
  for (const m of materials.values()) if (m.userData.lamp) m.emissiveIntensity = k;
  for (const [m, max] of glows) {
    m.opacity = Math.min(1, k / 1.6) * max;
    m.visible = m.opacity > 0.01;
  }
}

function place(mesh, p, r) {
  mesh.position.set(...p);
  if (r) mesh.rotation.set(...r);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function box(parent, size, color, p, r) {
  const m = place(new THREE.Mesh(new THREE.BoxGeometry(...size), typeof color === 'string' ? mat(color) : color), p, r);
  parent.add(m);
  return m;
}

export function cyl(parent, rTop, rBottom, h, color, p, r, seg = 7) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
  const m = place(new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color), p, r);
  parent.add(m);
  return m;
}

export function ball(parent, radius, color, p, scale, detail = 0) {
  const m = place(new THREE.Mesh(new THREE.IcosahedronGeometry(radius, detail), mat(color)), p);
  if (scale) m.scale.set(...scale);
  parent.add(m);
  return m;
}

/** A segment between two points (wires, ropes, bamboo). */
export function rod(parent, a, b, radius, color, seg = 5) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, seg), mat(color));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Flat-coloured meshes merge into one vertex-coloured mesh: one draw call instead of one per colour.
const vertexColorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });

function plainColor(m) {
  const s = m;
  if (!s.isMeshStandardMaterial || s.map || s.userData.lamp || s.vertexColors || s.transparent || s.side !== THREE.FrontSide) return null;
  return s.color;
}

const DIRT = new THREE.Color('#5a4128');
const tint = new THREE.Color();

/** Cheap wear baked into vertex colours: per-face value jitter plus dirt creeping up from the ground. */
function weather(colors, positions, base) {
  for (let f = 0; f < positions.count; f += 3) {
    const y = (positions.getY(f) + positions.getY(f + 1) + positions.getY(f + 2)) / 3;
    const x = positions.getX(f) + positions.getX(f + 1);
    const z = positions.getZ(f) + positions.getZ(f + 1);
    const hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233 + y * 37.719) * 43758.5453) % 1;
    const ground = 1 - THREE.MathUtils.smoothstep(y, 0.05, 0.9);
    tint.copy(base).lerp(DIRT, ground * 0.35).multiplyScalar((0.9 + hash * 0.14) * (1 - ground * 0.18));
    for (let k = 0; k < 3; k += 1) colors.set([tint.r, tint.g, tint.b], (f + k) * 3);
  }
}

function prepare(mesh, matrix, color, wear = false) {
  let geo = mesh.geometry.clone().applyMatrix4(matrix);
  if (geo.index) geo = geo.toNonIndexed();
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  }
  const count = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  if (color) {
    const colors = new Float32Array(count * 3);
    if (wear) weather(colors, geo.attributes.position, color);
    else for (let i = 0; i < count; i += 1) colors.set([color.r, color.g, color.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return geo;
}

function merge(geos, material, shadows) {
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = shadows && !material.transparent;
  mesh.receiveShadow = true;
  return mesh;
}

/** Merge every mesh under `group` into one mesh per material (all flat colours share one). Keeps draw calls low for static scenery. */
export function bake(group, shadows = true) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const out = new THREE.Group();
  group.traverse((obj) => {
    const mesh = obj;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) {
      // Multi-material meshes stay as-is.
      const copy = new THREE.Mesh(mesh.geometry, mesh.material);
      mesh.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
      copy.receiveShadow = true;
      out.add(copy);
      return;
    }
    const color = plainColor(mesh.material);
    const key = color ? vertexColorMat : mesh.material;
    const list = buckets.get(key) ?? [];
    list.push(prepare(mesh, mesh.matrixWorld, color, true));
    buckets.set(key, list);
  });
  for (const [material, geos] of buckets) {
    const mesh = merge(geos, material, shadows);
    if (mesh) out.add(mesh);
  }
  return out;
}

/** Merge a group's direct flat-coloured mesh children into one mesh (character limbs stay animatable). */
export function bakeChildren(group) {
  const geos = [];
  for (const child of [...group.children]) {
    const mesh = child;
    const color = mesh.isMesh && !Array.isArray(mesh.material) ? plainColor(mesh.material) : null;
    if (!color) continue;
    mesh.updateMatrix();
    geos.push(prepare(mesh, mesh.matrix, color));
    group.remove(mesh);
  }
  const merged = geos.length ? merge(geos, vertexColorMat, true) : null;
  if (merged) group.add(merged);
  return merged;
}

const outlineMaterials = new Map();

/** Cartoon ink line: an inverted hull pushed out along smoothed normals, as a child of `mesh`. */
export function outline(mesh, thickness = 0.016) {
  let material = outlineMaterials.get(thickness);
  if (!material) {
    material = new THREE.ShaderMaterial({
      uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color('#2b1d12') } },
      vertexShader: `uniform float thickness;
        void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * thickness, 1.0); }`,
      fragmentShader: `uniform vec3 color;
        void main() { gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
    });
    outlineMaterials.set(thickness, material);
  }
  const geo = mesh.geometry.clone();
  for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name);
  // Welded vertices give one shared normal per corner, so the hull has no cracks at hard edges.
  const hull = mergeVertices(geo, 1e-4);
  hull.computeVertexNormals();
  geo.dispose();
  const line = new THREE.Mesh(hull, material);
  line.raycast = () => {};
  mesh.add(line);
  return line;
}

/** Painted sign texture: hand-lettered look, a few lines of text. */
export function signMaterial(lines, opts) {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, w, h);
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = h * 0.06;
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
  }
  ctx.fillStyle = opts.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = h / (lines.length + 0.4);
  lines.forEach((line, i) => {
    let size = lh * (i === 0 ? 0.78 : 0.55);
    ctx.font = `${size}px ${opts.font ?? '"Lilita One", Impact, sans-serif'}`;
    while (ctx.measureText(line).width > w * 0.9 && size > 8) {
      size -= 2;
      ctx.font = `${size}px ${opts.font ?? '"Lilita One", Impact, sans-serif'}`;
    }
    ctx.fillText(line, w / 2, lh * (i + 0.7));
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  if (opts.emissive) {
    m.emissive.set('#ffffff');
    m.emissiveMap = tex;
    m.emissiveIntensity = 0;
    m.userData.lamp = true;
    materials.set(`sign-${materials.size}`, m);
  }
  return m;
}

/** Tileable noise texture for dirt, concrete, thatch, GI sheet. */
export function noiseTexture(base, speckles, opts = {}) {
  const size = opts.size ?? 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (opts.stripes) {
    ctx.fillStyle = opts.stripes;
    for (let x = 0; x < size; x += 16) ctx.fillRect(x, 0, 5, size);
  }
  for (let i = 0; i < (opts.count ?? 1400); i += 1) {
    ctx.fillStyle = speckles[i % speckles.length];
    ctx.globalAlpha = 0.25 + rnd() * 0.5;
    const s = 1 + rnd() * 4;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) tex.repeat.set(opts.repeat, opts.repeat);
  return tex;
}
