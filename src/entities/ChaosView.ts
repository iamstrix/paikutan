import * as THREE from 'three';
import type { Snapshot } from '../game/RoundManager';
import { MANGO_WARN } from '../sim/TrompoSim';
import type { Effects } from '../systems/Effects';

// The barangay's chaos, drawn from the snapshot: piso coins at the rim, mangoes
// (falling with a growing shadow, then lying as a bump), the putik puddle and
// hangin dust. Pure view: the host sim owns where everything is.

const MANGO_DROP = 3.2;

export class ChaosView {
  readonly group = new THREE.Group();
  private readonly coins: THREE.Mesh[] = [];
  private readonly mangoes: { fruit: THREE.Mesh; shadow: THREE.Mesh }[] = [];
  private readonly mud: THREE.Mesh;
  private readonly coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 20);
  private readonly coinMat = new THREE.MeshStandardMaterial({ color: '#f2c230', metalness: 0.8, roughness: 0.3, emissive: '#5a4300' });
  private readonly fruitGeo = new THREE.SphereGeometry(0.15, 14, 10);
  private readonly fruitMat = new THREE.MeshStandardMaterial({ color: '#f5b02e', roughness: 0.55, emissive: '#3a2000' });
  private readonly shadowGeo = new THREE.CircleGeometry(0.45, 24);
  private readonly shadowMat = new THREE.MeshBasicMaterial({ color: '#2b1d12', transparent: true, opacity: 0.35, depthWrite: false });
  private windTimer = 0;

  constructor(private readonly effects: Effects) {
    this.mud = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshStandardMaterial({ color: '#4a3420', roughness: 0.12, metalness: 0.1, transparent: true, depthWrite: false }),
    );
    this.mud.rotation.x = -Math.PI / 2;
    this.mud.position.y = 0.014;
    this.mud.renderOrder = 2;
    this.group.add(this.mud);
  }

  sync(snap: Snapshot | null, dt: number, elapsed: number): void {
    const coins = snap?.coins ?? [];
    while (this.coins.length < coins.length) {
      const m = new THREE.Mesh(this.coinGeo, this.coinMat);
      m.rotation.x = Math.PI / 2;
      m.castShadow = true;
      this.group.add(m);
      this.coins.push(m);
    }
    this.coins.forEach((m, i) => {
      const c = coins[i];
      m.visible = !!c;
      if (!c) return;
      m.position.set(c[0], 0.18 + Math.sin(elapsed * 4 + i) * 0.04, c[1]);
      m.rotation.z = elapsed * 3 + i;
    });

    const mangoes = snap?.mangoes ?? [];
    while (this.mangoes.length < mangoes.length) {
      const fruit = new THREE.Mesh(this.fruitGeo, this.fruitMat);
      fruit.scale.set(0.8, 1.05, 0.8);
      fruit.castShadow = true;
      const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = 3;
      this.group.add(fruit, shadow);
      this.mangoes.push({ fruit, shadow });
    }
    this.mangoes.forEach((v, i) => {
      const m = mangoes[i];
      v.fruit.visible = v.shadow.visible = !!m;
      if (!m) return;
      const [x, z, t] = m;
      if (t < 0) {
        // Falling: the shadow grows and darkens as it comes down.
        const k = 1 - -t / MANGO_WARN;
        v.fruit.position.set(x, 0.15 + MANGO_DROP * (1 - k) * (1 - k), z);
        v.fruit.rotation.set(elapsed * 6, 0, 0.3);
        v.shadow.position.set(x, 0.02, z);
        v.shadow.scale.setScalar(0.35 + 0.65 * k);
        v.shadow.visible = true;
      } else {
        v.fruit.position.set(x, 0.12, z);
        v.fruit.rotation.set(0, i, Math.PI / 2);
        v.shadow.visible = false;
      }
    });

    const mud = snap?.mud;
    this.mud.visible = !!mud;
    if (mud) {
      this.mud.position.x = mud[0];
      this.mud.position.z = mud[1];
      this.mud.scale.setScalar(mud[2] * (0.6 + 0.4 * mud[3]));
      (this.mud.material as THREE.MeshStandardMaterial).opacity = 0.85 * mud[3];
    }

    // Hangin: dust swept along the gust.
    const wind = snap?.wind;
    if (wind && wind[2] > 0) {
      this.windTimer -= dt;
      if (this.windTimer <= 0) {
        this.windTimer = 0.05;
        const side = Math.sin(elapsed * 13.7) * 3;
        const x = -wind[0] * 3.4 - wind[1] * side;
        const z = -wind[1] * 3.4 + wind[0] * side;
        this.effects.puff(x, 0.15, z, { n: 2, speed: 0.2, up: 0.2, size: 0.3, life: 1.2, drift: [wind[0] * 6, wind[1] * 6], gravity: 0 });
      }
    }
  }
}
