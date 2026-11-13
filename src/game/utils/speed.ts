/** Effective speed calculation for normal and ghost movement states. */

import { GHOST_SPEED_UNITS, WALK_SPEED_UNITS } from '../constants';

/** Compute speed scaled by game speed multiplier. */
export function trueSpeed(baseSpeed: number, gameSpeedMultiplier: number): number {
  return baseSpeed * gameSpeedMultiplier;
}

/** Speed modifier applied when the player is in ghost mode. */
export function speedMod(isDead: boolean): number {
  if (!isDead) {
    return 1;
  }
  return GHOST_SPEED_UNITS / WALK_SPEED_UNITS;
}

/** Effective speed for the current movement state. */
export function effectiveSpeed(
  baseSpeed: number,
  gameSpeedMultiplier: number,
  isDead: boolean,
): number {
  return trueSpeed(baseSpeed, gameSpeedMultiplier) * speedMod(isDead);
}

