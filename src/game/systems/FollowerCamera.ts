import Phaser from 'phaser';
import { CAMERA_FOLLOW_SPEED, CAMERA_MAX_STEP } from '../constants';
import {
  cameraTarget,
  clampCameraCenter,
  panPosition,
  perlinShakeOffset,
  shakeDecayScale,
  stepCamera,
  type CameraBounds,
  type CameraConfig,
} from '../utils/cameraMath';
import type { Vec2 } from '../utils/vectors';

interface PanState {
  from: Vec2;
  to: Vec2;
  elapsed: number;
  duration: number;
  onComplete?: () => void;
}

/**
 * Custom exponential follower camera with bounds clamping, cutscene panTo,
 * Shift free-pan support, and reduced-motion-safe screen shake.
 */
export class FollowerCamera {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private target: Vec2 | null = null;
  private current: Vec2 = { x: 0, y: 0 };
  private bounds: CameraBounds | null = null;
  private pan: PanState | null = null;
  private locked = false;
  private reducedMotion = false;
  private timeMs = 0;

  private shakeRemaining = 0;
  private shakeDuration = 0;
  private shakeAmplitude = 0;
  private shakeSeed = Math.random() * 1000;

  private perlinAmplitude = 0;
  private perlinSpeed = 1;
  private shakeEnabled = true;

  private readonly config: CameraConfig = {
    followSpeed: CAMERA_FOLLOW_SPEED,
    maxStep: CAMERA_MAX_STEP,
    offset: { x: 0, y: 0 },
  };

  constructor(scene: Phaser.Scene, camera?: Phaser.Cameras.Scene2D.Camera) {
    this.camera = camera ?? scene.cameras.main;
  }

  setTarget(target: Vec2 | null): void {
    this.target = target;
  }

  setOffset(x: number, y: number): void {
    this.config.offset = { x, y };
  }

  setFollowSpeed(speed: number): void {
    this.config.followSpeed = speed;
  }

  setMaxStep(step: number): void {
    this.config.maxStep = step;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) {
      this.shakeRemaining = 0;
      this.perlinAmplitude = 0;
    }
  }

  setBounds(bounds: CameraBounds | null): void {
    this.bounds = bounds;
    if (bounds) {
      this.camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    } else {
      this.camera.removeBounds();
    }
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
  }

  isLocked(): boolean {
    return this.locked;
  }

  snap(): void {
    if (!this.target) return;
    this.current = cameraTarget(this.target, this.config.offset);
    this.applyBounds();
    this.pan = null;
    this.applyToCamera();
  }

  shake(durationMs: number, amplitude: number): void {
    if (!this.shakeEnabled || this.reducedMotion) return;
    this.shakeDuration = Math.max(durationMs, 1);
    this.shakeRemaining = this.shakeDuration;
    this.shakeAmplitude = amplitude;
    this.shakeSeed = Math.random() * 1000;
  }

  setPerlinShake(amplitude: number, speed = 1): void {
    if (this.reducedMotion) {
      this.perlinAmplitude = 0;
      return;
    }
    this.perlinAmplitude = Math.max(0, amplitude);
    this.perlinSpeed = speed;
  }

  setShakeEnabled(enabled: boolean): void {
    this.shakeEnabled = enabled;
    if (!enabled) {
      this.shakeRemaining = 0;
      this.perlinAmplitude = 0;
    }
  }

  panTo(x: number, y: number, duration: number, onComplete?: () => void): void {
    if (this.reducedMotion) {
      this.current = { x, y };
      this.applyBounds();
      this.applyToCamera();
      onComplete?.();
      return;
    }
    this.pan = {
      from: { ...this.current },
      to: { x, y },
      elapsed: 0,
      duration: Math.max(duration, 1),
      onComplete,
    };
  }

  cancelPan(): void {
    this.pan = null;
  }

  isPanning(): boolean {
    return this.pan !== null;
  }

  update(delta: number): void {
    if (this.locked) {
      return;
    }

    this.timeMs += delta;

    if (this.pan) {
      this.pan.elapsed += delta;
      const t = Math.min(this.pan.elapsed / this.pan.duration, 1);
      this.current = panPosition(this.pan.from, this.pan.to, t);
      if (t >= 1) {
        const done = this.pan.onComplete;
        this.pan = null;
        done?.();
      }
    } else if (this.target) {
      const target = cameraTarget(this.target, this.config.offset);
      this.current = this.reducedMotion
        ? target
        : stepCamera(this.current, target, delta, this.config);
    }

    this.applyBounds();
    this.advanceShake(delta);
    this.applyToCamera();
  }

  debugPanBy(dx: number, dy: number): void {
    this.pan = null;
    this.current = { x: this.current.x + dx, y: this.current.y + dy };
    this.applyBounds();
    this.applyToCamera();
  }

  getCenter(): Vec2 {
    return { ...this.current };
  }

  getTargetCenter(): Vec2 | null {
    if (!this.target) return null;
    return cameraTarget(this.target, this.config.offset);
  }

  private viewSize(): { width: number; height: number } {
    const z = this.camera.zoom || 1;
    return { width: this.camera.width / z, height: this.camera.height / z };
  }

  private applyBounds(): void {
    if (!this.bounds) return;
    const view = this.viewSize();
    this.current = clampCameraCenter(this.current, view.width, view.height, this.bounds);
  }

  private advanceShake(delta: number): void {
    if (this.shakeRemaining > 0) {
      this.shakeRemaining = Math.max(0, this.shakeRemaining - delta);
      if (this.shakeRemaining === 0) {
        this.shakeAmplitude = 0;
      }
    }
  }

  private shakeOffset(): Vec2 {
    if (this.reducedMotion || !this.shakeEnabled) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;

    if (this.shakeRemaining > 0 && this.shakeAmplitude > 0) {
      const scale = shakeDecayScale(this.shakeRemaining, this.shakeDuration);
      const t = this.shakeSeed + this.timeMs * 0.05;
      x += Math.sin(t * 2.7) * this.shakeAmplitude * scale;
      y += Math.cos(t * 3.1) * this.shakeAmplitude * scale;
    }

    if (this.perlinAmplitude > 0) {
      const offset = perlinShakeOffset(this.timeMs, this.perlinAmplitude, this.perlinSpeed);
      x += offset.x;
      y += offset.y;
    }

    return { x, y };
  }

  private applyToCamera(): void {
    const shake = this.shakeOffset();
    let center = { x: this.current.x + shake.x, y: this.current.y + shake.y };
    if (this.bounds) {
      const view = this.viewSize();
      center = clampCameraCenter(center, view.width, view.height, this.bounds);
    }
    this.camera.centerOn(center.x, center.y);
  }
}

