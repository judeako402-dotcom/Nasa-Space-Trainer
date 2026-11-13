/** Minimal 2D vector helpers. Pure functions, no Phaser dependency. */

export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

/** Squared length of a vector (avoids sqrt for distance comparisons). */
export function lengthSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

/** Euclidean length. */
export function length(v: Vec2): number {
  return Math.sqrt(lengthSq(v));
}

/**
 * Normalize a vector. Returns (0,0) for a zero-length vector so callers
 * can detect "no input" instead of producing NaN.
 */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

/** Scale a vector by a scalar. */
export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/** Squared distance between two points. */
export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compute movement velocity from an input direction and a speed.
 * Diagonals are normalized so they are never faster than cardinals.
 */
export function moveVelocity(direction: Vec2, speed: number): Vec2 {
  const dir = normalize(direction);
  return scale(dir, speed);
}

