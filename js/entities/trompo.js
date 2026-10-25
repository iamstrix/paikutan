// Turned wooden trumpos: independent pear profiles, winding pegs, steel points and lacquer.
// Mythic identities live on the body; no flat attack discs or protruding blade crowns.
import * as THREE from 'three';
import { outline } from '../world/kit.js';
import { MYTHIC } from './mythic.js';
import { trumpoSkin, TRUMPO_PAINT } from './trumpo-skins.js';
import { shoulderGeometry, buildTrumpoRelief } from './trumpo-relief.js';

export const TRUMPO_FORMS = {
  kidlat: { radius: .238, neckRadius: .056, neck: .46, height: .59,
    profile: [[.022,.098],[.055,.132],[.112,.186],[.184,.264],[.226,.323],[.238,.354],[.235,.378],[.209,.414],[.151,.446],[.068,.464],[.056,.478],[.056,.58],[.05,.59],[0,.59]] },
  tikbalang: { radius: .236, neckRadius: .058, neck: .433, height: .575,
    profile: [[.022,.098],[.074,.144],[.149,.207],[.214,.278],[.236,.307],[.236,.338],[.228,.359],[.18,.397],[.106,.423],[.066,.437],[.058,.452],[.058,.565],[.05,.575],[0,.575]] },
  agimat: { radius: .24, neckRadius: .061, neck: .406, height: .55,
    profile: [[.023,.098],[.083,.146],[.174,.208],[.226,.26],[.24,.289],[.24,.321],[.223,.355],[.164,.386],[.077,.408],[.061,.423],[.061,.54],[.053,.55],[0,.55]] },
  diwata: { radius: .215, neckRadius: .05, neck: .474, height: .62,
    profile: [[.021,.098],[.052,.143],[.097,.213],[.161,.292],[.205,.349],[.215,.378],[.207,.407],[.17,.445],[.104,.471],[.059,.485],[.05,.498],[.05,.61],[.044,.62],[0,.62]] },
  bakunawa: { radius: .224, neckRadius: .055, neck: .449, height: .593,
    profile: [[.022,.098],[.065,.143],[.128,.212],[.193,.281],[.224,.326],[.222,.355],[.2,.394],[.15,.429],[.075,.451],[.055,.465],[.055,.583],[.047,.593],[0,.593]] },
};

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

// Every model fits a .25-unit radial envelope; scene.js scales that to the existing TOP_R.
// The tip rests at y=0. Paint maps, grain and soft shadows are cached across counterpicks.
export function buildTrompo(def, low = false) {
  const id = TRUMPO_FORMS[def.id] ? def.id : 'kidlat';
  const theme = MYTHIC[id], form = TRUMPO_FORMS[id], paint = TRUMPO_PAINT[id];
  const body = new THREE.Group(), turned = new THREE.Group();
  body.name = `${id}-trumpo`; body.add(turned);
  const segments = id === 'agimat' ? (low ? 16 : 32) : (low ? 24 : 40);
  const geometry = new THREE.LatheGeometry(form.profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  // Lathe's default V follows point index. Map real height so neck/belly paint stays in place.
  const pos = geometry.attributes.position, uv = geometry.attributes.uv;
  const bottom = form.profile[0][1], height = form.height - bottom;
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - bottom) / height);
  const lacquer = new THREE.MeshPhysicalMaterial({ map: trumpoSkin(id, form), normalMap: grainNormalMap(), normalScale: new THREE.Vector2(.16, .16), roughness: .47, metalness: .02, clearcoat: .5, clearcoatRoughness: .3 });
  const wood = new THREE.Mesh(geometry, lacquer);
  wood.name = `${id}-lacquered-wood`;
  wood.castShadow = true;
  outline(wood, .0035);
  const tip = new THREE.Mesh(new THREE.LatheGeometry([[0,0],[.006,.023],[.015,.065],[.022,.098],[.023,.117]].map(([r,y]) => new THREE.Vector2(r,y)), low ? 10 : 16), new THREE.MeshStandardMaterial({ color: '#bdc7ce', metalness: .75, roughness: .38 }));
  tip.name = 'steel-point'; tip.castShadow = true;
  turned.add(wood, tip);

  // Painted relief hugs the shoulder, retaining a solid wooden pear from every side.
  const crown = new THREE.Mesh(shoulderGeometry(form, low), new THREE.MeshPhysicalMaterial({ map: trumpoSkin(id, form, true), roughness: .46, metalness: .02, clearcoat: .5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  crown.name = `${id}-painted-shoulder`; crown.castShadow = false;
  turned.add(crown, buildTrumpoRelief(id, form, paint, low));
  // Normalize actual vertex radius, including small charms, to the existing collision envelope.
  turned.updateMatrixWorld(true);
  const point = new THREE.Vector3(); let radius = 0;
  turned.traverse(mesh => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld); radius = Math.max(radius, Math.hypot(point.x, point.z)); }
  });
  const widthScale = .25 / radius;
  turned.scale.set(widthScale, 1, widthScale);
  body.userData.radius = .25; body.userData.height = form.height;

  // Spin blur: streaked disc round the widest point, opacity follows spin speed.
  const tex = fxTextures();
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 24),
    new THREE.MeshBasicMaterial({ map: tex.blur, color: theme.glow, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }),
  );
  blur.rotation.x = -Math.PI / 2;
  blur.position.y = form.profile.find(p => p[0] === form.radius)?.[1] || .33;
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  // Soft streaks stay outside the wood; they are light, not an extra physical attack ring.
  const aura = new THREE.Group();
  const halo = new THREE.Mesh(new THREE.CircleGeometry(.29, low ? 24 : 40), new THREE.MeshBasicMaterial({ map: tex.blur, color: theme.glow, transparent: true, opacity: .12, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; aura.add(halo); aura.position.y = .04;
  return { body, blur, blob, aura, crown };
}
