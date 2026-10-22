import * as THREE from 'three';
import { ball, box, cyl } from '../world/kit';

/** Asong gala: the stray askal that runs through the bilog once per round (paikutan's stray dog). */
export class DogView {
  readonly group = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly tail = new THREE.Group();
  private readonly target = new THREE.Vector3();
  private dir = 1;

  constructor() {
    const fur = '#b07a45';
    const body = new THREE.Group();
    body.position.y = 0.32;
    ball(body, 0.22, fur, [0, 0, 0], [1.6, 0.8, 0.85]);
    ball(body, 0.15, fur, [0.36, 0.1, 0], [1.1, 0.95, 1]);
    box(body, [0.14, 0.09, 0.1], '#3a2a1e', [0.53, 0.08, 0]);
    for (const z of [-0.07, 0.07]) box(body, [0.06, 0.12, 0.04], '#8a5a33', [0.33, 0.25, z], [0, 0, 0.3]);
    this.tail.position.set(-0.34, 0.06, 0);
    cyl(this.tail, 0.025, 0.02, 0.22, fur, [-0.05, 0.1, 0], [0, 0, 0.6]);
    body.add(this.tail);
    for (const [x, z] of [
      [0.22, -0.1],
      [0.22, 0.1],
      [-0.22, -0.1],
      [-0.22, 0.1],
    ]) {
      const leg = new THREE.Group();
      leg.position.set(x, -0.08, z);
      cyl(leg, 0.03, 0.025, 0.22, fur, [0, -0.11, 0]);
      body.add(leg);
      this.legs.push(leg);
    }
    this.group.add(body);
    this.group.visible = false;
  }

  /** Feed the snapshot's dog ([x, z, dir] in world metres) or null when it's gone. */
  set(dog: [number, number, number] | null): void {
    if (!dog) {
      this.group.visible = false;
      return;
    }
    if (!this.group.visible) this.group.position.set(dog[0], 0, dog[1]);
    this.group.visible = true;
    this.target.set(dog[0], 0, dog[1]);
    this.dir = dog[2];
  }

  update(dt: number, elapsed: number): void {
    if (!this.group.visible) return;
    this.group.position.lerp(this.target, 1 - Math.exp(-dt * 15));
    this.group.rotation.y = this.dir > 0 ? 0 : Math.PI;
    this.legs.forEach((leg, i) => (leg.rotation.z = Math.sin(elapsed * 22 + (i % 2 ? Math.PI : 0) + (i > 1 ? 1 : 0)) * 0.8));
    this.tail.rotation.z = Math.sin(elapsed * 18) * 0.5;
    this.group.position.y = Math.abs(Math.sin(elapsed * 22)) * 0.05;
  }
}
