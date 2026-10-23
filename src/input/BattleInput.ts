import type { SpinResult, ThrowResult } from './gestures';

/** 'out' = your top is down: you aim multo flicks. */
export type BattleStage = 'idle' | 'spin' | 'throw' | 'fight' | 'out';

/**
 * The seam between a device and the battle. Desktop implements it here; the
 * paired phone (src/controller/) sends the same four messages straight to the
 * host. The sim only ever sees spin / throw / steer / palo / ability / flick.
 */
export interface BattleInput {
  /** Throw aim the HUD arrow should show (-0.6..0.6 rad). */
  readonly aim: number;
  setStage(stage: BattleStage): void;
  onSpin(cb: (r: SpinResult) => void): void;
  onThrow(cb: (r: ThrowResult) => void): void;
  /** Steering in player-local space: x = right, y = away from the player. */
  onSteer(cb: (x: number, y: number) => void): void;
  onAbility(cb: () => void): void;
  /** Palo: the dash-strike; `c` 0..1 is how long it was held (charged). */
  onPalo(cb: (c: number) => void): void;
  /** Charge of a palo being held right now (0 when not charging), for the HUD and camera. */
  readonly paloCharge: number;
  /** Multo flick at a screen point (the game turns it into a spot on the ground). */
  onFlick(cb: (clientX: number, clientY: number) => void): void;
  update(dt: number): void;
  dispose(): void;
}
