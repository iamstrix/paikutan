import * as THREE from 'three';
import { setLampGlow } from './kit';

// Golden-hour to dusk: sun, sky gradient, haze and lamp glow keyed by clock
// minutes (15:00 → 18:30). One match walks the barangay from merienda to
// "Hoy, uwi na!".

type Key = {
  at: number;
  elev: number;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  top: string;
  horizon: string;
  fog: string;
  lamps: number;
};

const KEYS: Key[] = [
  { at: 900, elev: 38, sun: '#fff0cf', sunI: 2.7, hemiSky: '#d6e6ef', hemiGround: '#7d6a48', hemiI: 1.25, top: '#5f9fd6', horizon: '#f3dcb8', fog: '#ead6b5', lamps: 0 },
  { at: 960, elev: 24, sun: '#ffd596', sunI: 2.9, hemiSky: '#f1dcbc', hemiGround: '#7a6142', hemiI: 1.15, top: '#6f9fd0', horizon: '#ffcf96', fog: '#f0cb98', lamps: 0 },
  { at: 1030, elev: 11, sun: '#ffaa5c', sunI: 2.5, hemiSky: '#e7b48a', hemiGround: '#5e4734', hemiI: 0.95, top: '#6578b2', horizon: '#ff9c5c', fog: '#e9a274', lamps: 0.15 },
  { at: 1080, elev: 2, sun: '#ff7642', sunI: 1.3, hemiSky: '#9c88a8', hemiGround: '#4a3a34', hemiI: 0.95, top: '#3c4880', horizon: '#ef7b52', fog: '#a26e6c', lamps: 1 },
  { at: 1110, elev: -6, sun: '#ff6a3a', sunI: 0.25, hemiSky: '#56608c', hemiGround: '#2c2a36', hemiI: 0.75, top: '#1c2347', horizon: '#7c4a6a', fog: '#3f3753', lamps: 1.6 },
];

const SUN_AZIMUTH = -2.75;

export class Atmosphere {
  readonly sun = new THREE.DirectionalLight('#ffffff', 2.5);
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#555555', 1);
  readonly lamps: THREE.PointLight[] = [];
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly sunDir = new THREE.Vector3();
  private readonly c1 = new THREE.Color();
  private readonly c2 = new THREE.Color();

  constructor(private readonly scene: THREE.Scene) {
    scene.fog = new THREE.Fog('#ead6b5', 38, 175);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -30;
    cam.right = 30;
    cam.top = 30;
    cam.bottom = -30;
    cam.near = 1;
    cam.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target, this.hemi);

    this.sky = new THREE.Mesh(
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
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    // Practical lights, dark until dusk: [x, y, z, colour, strength, range].
    // Index 0 is the sari-sari fluorescent tube (it flickers).
    for (const [x, y, z, color, strength, range] of [
      [0, 2.4, -4.6, '#e8f4ff', 6, 11],
      [0, 2.2, 12.2, '#ffcf7a', 5, 9],
      [-16.6, 2.6, 0.5, '#d9ecff', 5, 9],
      [19.4, 4.6, 0.5, '#eef6ff', 7, 13],
      [-6, 5.6, 10.8, '#ffc46b', 6, 12],
      [6, 5.6, 10.8, '#ffc46b', 6, 12],
      [-8.4, 1.3, -4.7, '#7f9cff', 3, 4.5],
      // The bombilya over the bilog: keeps the tops readable after sunset.
      [0.45, 4.2, -0.63, '#ffd48a', 9, 11],
    ] as const) {
      const lamp = new THREE.PointLight(color, 0, range, 1.6);
      lamp.position.set(x, y, z);
      lamp.userData.strength = strength;
      this.lamps.push(lamp);
      scene.add(lamp);
    }
  }

  setClock(minutes: number): void {
    let i = 0;
    while (i < KEYS.length - 2 && minutes > KEYS[i + 1].at) i += 1;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((minutes - a.at) / (b.at - a.at), 0, 1);
    const lerp = (x: number, y: number) => x + (y - x) * t;
    const col = (x: string, y: string, out: THREE.Color) => out.set(x).lerp(this.c2.set(y), t);

    const elev = THREE.MathUtils.degToRad(lerp(a.elev, b.elev));
    this.sunDir.set(Math.cos(elev) * Math.cos(SUN_AZIMUTH), Math.sin(elev), Math.cos(elev) * Math.sin(SUN_AZIMUTH));
    this.sun.position.copy(this.sunDir).multiplyScalar(60);
    this.sun.target.position.set(0, 0, 0);
    col(a.sun, b.sun, this.sun.color);
    this.sun.intensity = Math.max(0, lerp(a.sunI, b.sunI));
    col(a.hemiSky, b.hemiSky, this.hemi.color);
    col(a.hemiGround, b.hemiGround, this.hemi.groundColor);
    this.hemi.intensity = lerp(a.hemiI, b.hemiI);

    const u = this.sky.material.uniforms;
    col(a.top, b.top, u.top.value);
    col(a.horizon, b.horizon, u.horizon.value);
    u.sunColor.value.copy(this.sun.color);
    u.sunDir.value.copy(this.sunDir);
    col(a.fog, b.fog, this.c1);
    (this.scene.fog as THREE.Fog).color.copy(this.c1);

    const lamps = lerp(a.lamps, b.lamps);
    setLampGlow(lamps);
    for (const lamp of this.lamps) lamp.intensity = lamps * lamp.userData.strength;
    // An old fluorescent tube never quite holds steady.
    if (lamps > 0.05 && Math.random() < 0.03) this.lamps[0].intensity *= 0.25;
  }

  follow(target: THREE.Vector3): void {
    this.sky.position.copy(target);
  }
}
