import type { SpinResult, ThrowResult } from './gestures';

export type BattleStage = 'idle' | 'spin' | 'throw' | 'fight';

/**
 * The seam between a device and the battle. Desktop implements it here; the
 * paired phone (src/controller/) sends the same four messages straight to the
 * host. The sim only ever sees spin / throw / steer / ability.
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
  update(dt: number): void;
  dispose(): void;
}
