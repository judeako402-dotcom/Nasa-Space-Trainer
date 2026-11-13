/** Pure camera math for FollowerCamera. No Phaser dependency. */

import { clamp } from './vectors';
import type { Vec2 } from './vectors';

export interface CameraBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraConfig {
  followSpeed: number;
  maxStep: number;
  offset: Vec2;
}

/**
 * Distance under which the camera snaps directly onto the target so an idle
 * camera stops drifting asymptotes.
 */
export const CAMERA_SNAP_EPSILON = 0.1;

/** Exponential smoothing step with clamped per-frame alpha and idle snap. */
export function stepCamera(
  current: Vec2,
  target: Vec2,
  deltaMs: number,
  config: CameraConfig,
): Vec2 {
  const alpha = clamp((deltaMs / 1000) * config.followSpeed, 0, config.maxStep);
  let x = current.x + (target.x - current.x) * alpha;
  let y = current.y + (target.y - current.y) * alpha;

  if (Math.abs(target.x - x) < CAMERA_SNAP_EPSILON) x = target.x;
  if (Math.abs(target.y - y) < CAMERA_SNAP_EPSILON) y = target.y;

  return { x, y };
}

/** Camera target = player position + camera offset. */
export function cameraTarget(playerPos: Vec2, offset: Vec2): Vec2 {
  return { x: playerPos.x + offset.x, y: playerPos.y + offset.y };
}

/**
 * Clamp a camera center point so the viewport stays within world bounds.
 * Centers axes where the viewport exceeds bounds width/height.
 */
export function clampCameraCenter(
  center: Vec2,
  viewWidth: number,
  viewHeight: number,
  bounds: CameraBounds,
): Vec2 {
  let x: number;
  let y: number;

  if (viewWidth >= bounds.width) {
    x = bounds.x + bounds.width / 2;
  } else {
    const half = viewWidth / 2;
    x = clamp(center.x, bounds.x + half, bounds.x + bounds.width - half);
  }

  if (viewHeight >= bounds.height) {
    y = bounds.y + bounds.height / 2;
  } else {
    const half = viewHeight / 2;
    y = clamp(center.y, bounds.y + half, bounds.y + bounds.height - half);
  }

  return { x, y };
}

/** Deterministic 1D value noise in [-1, 1] for camera shake. */
export function noise1D(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

function hash1(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Continuous Perlin-style screen shake offset. */
export function perlinShakeOffset(timeMs: number, amplitude: number, speed: number): Vec2 {
  const t = (timeMs / 1000) * speed;
  return {
    x: noise1D(t) * amplitude,
    y: noise1D(t + 31.7) * amplitude,
  };
}

/** Linear decay scale for one-shot screen shake (1 full -> 0 finished). */
export function shakeDecayScale(remainingMs: number, durationMs: number): number {
  if (durationMs <= 0 || remainingMs <= 0) {
    return 0;
  }
  return clamp(remainingMs / durationMs, 0, 1);
}

/** Smoothstep easing in [0, 1]. */
export function smoothstep(t: number): number {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
}

/** Eased interpolation between two points. */
export function panPosition(from: Vec2, to: Vec2, t: number): Vec2 {
  const e = smoothstep(t);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
  };
}

