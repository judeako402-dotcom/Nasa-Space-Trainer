import { describe, expect, it } from 'vitest';
import {
  JOYSTICK_DEADZONE,
  JOYSTICK_RADIUS,
  TouchControls,
  applyDeadzone,
  clampToUnit,
  shouldUseTouchControls,
} from '../src/game/systems/TouchControls';

describe('shouldUseTouchControls', () => {
  it('enables the joystick only when the primary pointer is coarse and touch exists', () => {
    expect(shouldUseTouchControls(true, 1)).toBe(true);
    expect(shouldUseTouchControls(true, 5)).toBe(true);
  });

  it('keeps a mouse-driven desktop on the keyboard path', () => {
    expect(shouldUseTouchControls(false, 0)).toBe(false);
    // Touch-screen laptop whose primary pointer is still the trackpad.
    expect(shouldUseTouchControls(false, 10)).toBe(false);
  });

  it('never enables controls on a device that reports no touch points', () => {
    expect(shouldUseTouchControls(true, 0)).toBe(false);
  });
});

describe('applyDeadzone', () => {
  it('returns zero inside the deadzone so the pad rests cleanly', () => {
    expect(applyDeadzone(0, 0)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(JOYSTICK_DEADZONE * 0.9, 0)).toEqual({ x: 0, y: 0 });
  });

  it('rescales just past the deadzone so movement starts immediately', () => {
    const edge = applyDeadzone(JOYSTICK_DEADZONE, 0);
    expect(edge.x).toBeCloseTo(0, 6);
    expect(edge.y).toBeCloseTo(0, 6);

    const mid = applyDeadzone((JOYSTICK_DEADZONE + 1) / 2, 0);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(1);
  });

  it('passes a full deflection through at unit strength and keeps direction', () => {
    const full = applyDeadzone(1, 0);
    expect(full.x).toBeCloseTo(1, 6);
    expect(full.y).toBeCloseTo(0, 6);

    const diagonal = applyDeadzone(1, -1);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 6);
    expect(diagonal.y).toBeLessThan(0);
  });

  it('never produces an output longer than the input unit vector', () => {
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = applyDeadzone(t, t * 0.5);
      expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1.0000001);
    }
  });
});

describe('clampToUnit', () => {
  it('leaves short vectors untouched', () => {
    expect(clampToUnit(0.4, -0.3)).toEqual({ x: 0.4, y: -0.3 });
  });

  it('shrinks long vectors to the limit instead of truncating an axis', () => {
    const clamped = clampToUnit(3, 4);
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(1, 6);
    expect(clamped.x / clamped.y).toBeCloseTo(3 / 4, 6);
  });

  it('keeps a zero vector at zero', () => {
    expect(clampToUnit(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('TouchControls action bridge', () => {
  it('reports disabled and inert until a device mounts the joystick', () => {
    const controls = new TouchControls();
    expect(controls.enabled).toBe(false);
    expect(controls.getVector()).toEqual({ x: 0, y: 0 });
    controls.queueAction('snapCamera');
    expect(controls.drainActions()).toEqual(['snapCamera']);
  });

  it('collapses repeated taps of the same button into one frame-accurate press', () => {
    const controls = new TouchControls();
    controls.queueAction('demoPan');
    controls.queueAction('demoPan');
    controls.queueAction('snapCamera');
    expect(controls.drainActions().sort()).toEqual(['demoPan', 'snapCamera']);
    expect(controls.drainActions()).toEqual([]);
  });

  it('tracks the hold state of the PEEK button', () => {
    const controls = new TouchControls();
    expect(controls.isPeeking()).toBe(false);
    controls.setPeek(true);
    expect(controls.isPeeking()).toBe(true);
    controls.setPeek(false);
    expect(controls.isPeeking()).toBe(false);
  });

  it('unmount() drops pending input so a stale press cannot leak into the next scene', () => {
    const controls = new TouchControls();
    controls.setPeek(true);
    controls.queueAction('interact');
    controls.unmount();
    expect(controls.isPeeking()).toBe(false);
    expect(controls.drainActions()).toEqual([]);
  });
});

describe('joystick tuning', () => {
  it('uses a deadzone small enough to feel responsive but large enough to rest', () => {
    expect(JOYSTICK_DEADZONE).toBeGreaterThan(0.05);
    expect(JOYSTICK_DEADZONE).toBeLessThan(0.3);
  });

  it('uses a thumb-sized travel radius', () => {
    expect(JOYSTICK_RADIUS).toBeGreaterThanOrEqual(40);
    expect(JOYSTICK_RADIUS).toBeLessThanOrEqual(80);
  });
});
