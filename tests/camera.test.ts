import { describe, expect, it } from 'vitest';
import {
  CAMERA_FOLLOW_SPEED,
  CAMERA_MAX_STEP,
} from '../src/game/constants';
import {
  CAMERA_SNAP_EPSILON,
  cameraTarget,
  clampCameraCenter,
  noise1D,
  panPosition,
  perlinShakeOffset,
  shakeDecayScale,
  smoothstep,
  stepCamera,
  type CameraConfig,
} from '../src/game/utils/cameraMath';

const config: CameraConfig = {
  followSpeed: CAMERA_FOLLOW_SPEED,
  maxStep: CAMERA_MAX_STEP,
  offset: { x: 0, y: 0 },
};

describe('stepCamera', () => {
  it('uses alpha = deltaSeconds * followSpeed', () => {
    // delta 1000ms => alpha = 8, clamped to maxStep 0.9
    const result = stepCamera({ x: 0, y: 0 }, { x: 100, y: 0 }, 1000, config);
    expect(result.x).toBeCloseTo(90, 6); // 0 + 100 * 0.9
  });

  it('small deltas produce proportional steps', () => {
    // delta 12.5ms => alpha = 0.0125 * 8 = 0.1
    const result = stepCamera({ x: 0, y: 0 }, { x: 100, y: 100 }, 12.5, config);
    expect(result.x).toBeCloseTo(10, 6);
    expect(result.y).toBeCloseTo(10, 6);
  });

  it('never steps more than maxStep per frame', () => {
    const result = stepCamera({ x: 0, y: 0 }, { x: 1000, y: 0 }, 5000, config);
    expect(result.x).toBeCloseTo(1000 * CAMERA_MAX_STEP, 6);
  });

  it('converges toward the target over repeated frames', () => {
    let current = { x: 0, y: 0 };
    const target = { x: 500, y: 300 };
    for (let i = 0; i < 200; i++) {
      current = stepCamera(current, target, 16.67, config);
    }
    expect(current.x).toBeCloseTo(target.x, 3);
    expect(current.y).toBeCloseTo(target.y, 3);
  });

  it('is a no-op when already at the target', () => {
    const result = stepCamera({ x: 50, y: 50 }, { x: 50, y: 50 }, 16.67, config);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
  });

  it('snaps exactly onto the target inside the epsilon so idle cameras rest', () => {
    // Distance 1px with alpha 0.133 moves 0.133px -> not inside epsilon.
    const mid = stepCamera({ x: 100, y: 100 }, { x: 101, y: 100 }, 16.67, config);
    expect(mid.x).toBeCloseTo(100.133, 2);
    // Distance small enough -> exact snap, no asymptotic drift.
    const near = stepCamera({ x: 100, y: 100 }, { x: 100.05, y: 100 }, 16.67, config);
    expect(near.x).toBe(100.05);
    expect(CAMERA_SNAP_EPSILON).toBeGreaterThan(0);
  });
});

describe('noise1D', () => {
  it('stays within [-1, 1]', () => {
    for (let t = 0; t < 200; t += 0.137) {
      const n = noise1D(t);
      expect(n).toBeGreaterThanOrEqual(-1.0001);
      expect(n).toBeLessThanOrEqual(1.0001);
    }
  });

  it('is deterministic', () => {
    expect(noise1D(12.34)).toBe(noise1D(12.34));
  });

  it('is continuous (no jumps between close samples)', () => {
    let prev = noise1D(0);
    for (let t = 0.01; t < 50; t += 0.01) {
      const n = noise1D(t);
      expect(Math.abs(n - prev)).toBeLessThan(0.3);
      prev = n;
    }
  });
});

describe('perlinShakeOffset', () => {
  it('scales with amplitude', () => {
    const small = perlinShakeOffset(500, 2, 1);
    const large = perlinShakeOffset(500, 20, 1);
    expect(Math.abs(large.x)).toBeGreaterThan(Math.abs(small.x));
  });

  it('is zero for zero amplitude', () => {
    const o = perlinShakeOffset(500, 0, 1);
    expect(Math.abs(o.x)).toBe(0);
    expect(Math.abs(o.y)).toBe(0);
  });

  it('never exceeds the amplitude per axis', () => {
    for (let t = 0; t < 10000; t += 13) {
      const o = perlinShakeOffset(t, 5, 2);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(5.0001);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(5.0001);
    }
  });
});

describe('shakeDecayScale', () => {
  it('is 1 at full duration and 0 when finished', () => {
    expect(shakeDecayScale(500, 500)).toBe(1);
    expect(shakeDecayScale(0, 500)).toBe(0);
    expect(shakeDecayScale(-10, 500)).toBe(0);
  });

  it('decays linearly', () => {
    expect(shakeDecayScale(250, 500)).toBeCloseTo(0.5, 6);
  });

  it('handles invalid duration', () => {
    expect(shakeDecayScale(100, 0)).toBe(0);
  });
});

describe('smoothstep / panPosition', () => {
  it('maps endpoints to endpoints', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(-5)).toBe(0);
    expect(smoothstep(5)).toBe(1);
  });

  it('is monotonic', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = smoothstep(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('panPosition interpolates between the endpoints', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 200 };
    expect(panPosition(from, to, 0)).toEqual({ x: 0, y: 0 });
    expect(panPosition(from, to, 1)).toEqual({ x: 100, y: 200 });
    const mid = panPosition(from, to, 0.5);
    expect(mid.x).toBeCloseTo(50, 6);
    expect(mid.y).toBeCloseTo(100, 6);
  });
});

describe('cameraTarget', () => {
  it('adds the camera offset to the player position', () => {
    const t = cameraTarget({ x: 100, y: 200 }, { x: 10, y: -20 });
    expect(t.x).toBe(110);
    expect(t.y).toBe(180);
  });
});

describe('clampCameraCenter', () => {
  const bounds = { x: 0, y: 0, width: 1280, height: 960 };

  it('clamps so the viewport stays inside bounds', () => {
    const c = clampCameraCenter({ x: -100, y: 2000 }, 1280, 720, bounds);
    expect(c.x).toBe(640); // half viewport
    expect(c.y).toBe(960 - 360); // 600
  });

  it('centers the map when the viewport is larger than the bounds', () => {
    const c = clampCameraCenter({ x: 999, y: 999 }, 2000, 2000, bounds);
    expect(c.x).toBe(640);
    expect(c.y).toBe(480);
  });

  it('leaves an already-valid center untouched', () => {
    const c = clampCameraCenter({ x: 640, y: 480 }, 1280, 720, bounds);
    expect(c.x).toBe(640);
    expect(c.y).toBe(480);
  });
});
