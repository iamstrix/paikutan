// Golden hour to dusk, ported from tromPOW (jmdgg): sun, sky gradient, haze and lamp glow keyed by
// clock minutes (15:00 → 18:30). Positions are in barangay metres, scaled like the barangay.
import * as THREE from 'three';
import { setLampGlow } from './kit.js';

const KEYS = [
  { at: 900, elev: 38, sun: '#fff0cf', sunI: 2.7, hemiSky: '#d6e6ef', hemiGround: '#7d6a48', hemiI: 1.25, top: '#5f9fd6', horizon: '#f3dcb8', fog: '#ead6b5', lamps: 0 },
  { at: 960, elev: 24, sun: '#ffd596', sunI: 2.9, hemiSky: '#f1dcbc', hemiGround: '#7a6142', hemiI: 1.15, top: '#6f9fd0', horizon: '#ffcf96', fog: '#f0cb98', lamps: 0 },
  { at: 1030, elev: 11, sun: '#ffaa5c', sunI: 2.5, hemiSky: '#e7b48a', hemiGround: '#5e4734', hemiI: 0.95, top: '#6578b2', horizon: '#ff9c5c', fog: '#e9a274', lamps: 0.15 },
  { at: 1080, elev: 2, sun: '#ff7642', sunI: 1.3, hemiSky: '#9c88a8', hemiGround: '#4a3a34', hemiI: 0.95, top: '#3c4880', horizon: '#ef7b52', fog: '#a26e6c', lamps: 1 },
  { at: 1110, elev: -6, sun: '#ff6a3a', sunI: 0.25, hemiSky: '#56608c', hemiGround: '#2c2a36', hemiI: 0.75, top: '#1c2347', horizon: '#7c4a6a', fog: '#3f3753', lamps: 1.6 },
];

// tromPOW used -2.75; from there the mango tree's shadow fell across our bigger circle.
const SUN_AZIMUTH = -0.7;
const NIGHT = new THREE.Color('#1b1035'); // Bakunawa's eclipse pulls everything toward this

// Practical lights, dark until dusk: [x, y, z, colour, strength, range]. Index 0 is the
// sari-sari fluorescent tube (it flickers). Skipped on phones: every point light costs shader time.
const LAMPS = [
  [0, 2.4, -6.2, '#e8f4ff', 6, 11],
  [0, 2.2, 12.2, '#ffcf7a', 5, 9],
  [-16.6, 2.6, 0.5, '#d9ecff', 5, 9],
  [19.4, 4.6, 0.5, '#eef6ff', 7, 13],
  [-6, 5.6, 10.8, '#ffc46b', 6, 12],
  [6, 5.6, 10.8, '#ffc46b', 6, 12],
  [-8.4, 1.3, -4.7, '#7f9cff', 3, 4.5],
  // Over the circle: keeps the tops readable after sunset (its bulb is left out of the scenery).
  [0.45, 4.2, -0.63, '#ffd48a', 9, 11],
];

export function createAtmosphere(scene, { scale = 1, low = false } = {}) {
  const sun = new THREE.DirectionalLight('#ffffff', 2.5);
  const hemi = new THREE.HemisphereLight('#ffffff', '#555555', 1);
  const sunDir = new THREE.Vector3(), c1 = new THREE.Color(), c2 = new THREE.Color();

  scene.fog = new THREE.Fog('#ead6b5', 38 * scale, 175 * scale);
  sun.castShadow = !low;
  sun.shadow.mapSize.set(2048, 2048);
  // Tight around the circle so the trumpos keep crisp shadows; far scenery goes without.
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 140 * scale });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target, hemi);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        sunColor: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          col = mix(col, horizon * 0.8, clamp(-d.y * 4.0, 0.0, 1.0));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.12);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  const lamps = low ? [] : LAMPS.map(([x, y, z, color, strength, range]) => {
    const lamp = new THREE.PointLight(color, 0, range * scale, 1.6);
    lamp.position.set(x * scale, y * scale, z * scale);
    lamp.userData.strength = strength;
    scene.add(lamp);
    return lamp;
  });

  // dark (0..1) dims the light and sky on top of the clock, for the eclipse.
  function setClock(minutes, dark = 0) {
    let i = 0;
    while (i < KEYS.length - 2 && minutes > KEYS[i + 1].at) i += 1;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((minutes - a.at) / (b.at - a.at), 0, 1);
    const lerp = (x, y) => x + (y - x) * t;
    const col = (x, y, out) => out.set(x).lerp(c2.set(y), t).lerp(NIGHT, dark);

    const elev = THREE.MathUtils.degToRad(lerp(a.elev, b.elev));
    sunDir.set(Math.cos(elev) * Math.cos(SUN_AZIMUTH), Math.sin(elev), Math.cos(elev) * Math.sin(SUN_AZIMUTH));
    sun.position.copy(sunDir).multiplyScalar(60 * scale);
    sun.target.position.set(0, 0, 0);
    col(a.sun, b.sun, sun.color);
    sun.intensity = Math.max(0, lerp(a.sunI, b.sunI)) * (1 - dark * 0.9);
    col(a.hemiSky, b.hemiSky, hemi.color);
    col(a.hemiGround, b.hemiGround, hemi.groundColor);
    hemi.intensity = lerp(a.hemiI, b.hemiI) * (1 - dark * 0.8);

    const u = sky.material.uniforms;
    col(a.top, b.top, u.top.value);
    col(a.horizon, b.horizon, u.horizon.value);
    u.sunColor.value.copy(sun.color);
    u.sunDir.value.copy(sunDir);
    col(a.fog, b.fog, c1);
    scene.fog.color.copy(c1);

    const glow = lerp(a.lamps, b.lamps);
    setLampGlow(glow);
    for (const lamp of lamps) lamp.intensity = glow * lamp.userData.strength;
    // An old fluorescent tube never quite holds steady.
    if (lamps.length && glow > 0.05 && Math.random() < 0.03) lamps[0].intensity *= 0.25;
  }

  function follow(target) { sky.position.copy(target); }

  return { sun, hemi, setClock, follow };
}
