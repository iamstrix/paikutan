import * as THREE from 'three';

/** Keyboard state for walking, dashing and hotkeys. Throw/palo input lives in src/input/. */
export class InputController {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if (!event.repeat) this.pressed.add(event.code);
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = () => this.keys.clear();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** x = right, y = toward the camera; normalized. */
  readMovement(target: THREE.Vector2): THREE.Vector2 {
    target.set(0, 0);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) target.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) target.x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) target.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) target.y += 1;
    if (target.lengthSq() > 1) target.normalize();
    return target;
  }

  isDashHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** True once per key press. */
  consume(code: string): boolean {
    return this.pressed.delete(code);
  }

  endFrame(): void {
    this.pressed.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
