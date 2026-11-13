import { describe, expect, it } from 'vitest';
import {
  GHOST_SPEED,
  GHOST_SPEED_UNITS,
  WALK_SPEED,
  WALK_SPEED_UNITS,
} from '../src/game/constants';
import { effectiveSpeed, speedMod, trueSpeed } from '../src/game/utils/speed';
import { moveVelocity, normalize } from '../src/game/utils/vectors';

describe('movement constants', () => {
  it('matches the decompiled speed values', () => {
    expect(WALK_SPEED_UNITS).toBe(4.5);
    expect(GHOST_SPEED_UNITS).toBe(3.0);
    expect(WALK_SPEED).toBe(288);
    expect(GHOST_SPEED).toBe(192);
  });
});

describe('normalize', () => {
  it('normalizes cardinal input to unit length', () => {
    const n = normalize({ x: 0, y: -1 });
    expect(n.x).toBe(0);
    expect(n.y).toBe(-1);
  });

  it('returns (0,0) for zero input instead of NaN', () => {
    const n = normalize({ x: 0, y: 0 });
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
  });
});

describe('moveVelocity', () => {
  it('never makes diagonals faster than cardinals', () => {
    const diagonal = moveVelocity({ x: 1, y: 1 }, WALK_SPEED);
    const cardinal = moveVelocity({ x: 1, y: 0 }, WALK_SPEED);
    const diagLen = Math.hypot(diagonal.x, diagonal.y);
    const cardLen = Math.hypot(cardinal.x, cardinal.y);
    expect(diagLen).toBeCloseTo(cardLen, 6);
    expect(diagLen).toBeCloseTo(WALK_SPEED, 6);
  });

  it('produces zero velocity for no input', () => {
    const v = moveVelocity({ x: 0, y: 0 }, WALK_SPEED);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });
});

describe('speed model', () => {
  it('trueSpeed applies the game speed multiplier', () => {
    expect(trueSpeed(WALK_SPEED_UNITS, 1.0)).toBe(4.5);
    expect(trueSpeed(WALK_SPEED_UNITS, 1.25)).toBeCloseTo(5.625, 6);
  });

  it('speedMod is 1 when alive and ghost ratio when dead', () => {
    expect(speedMod(false)).toBe(1);
    expect(speedMod(true)).toBeCloseTo(3.0 / 4.5, 6);
  });

  it('effectiveSpeed equals walk speed when alive', () => {
    expect(effectiveSpeed(WALK_SPEED_UNITS, 1.0, false)).toBe(4.5);
  });

  it('effectiveSpeed equals ghost speed when dead', () => {
    expect(effectiveSpeed(WALK_SPEED_UNITS, 1.0, true)).toBeCloseTo(3.0, 6);
  });
});
