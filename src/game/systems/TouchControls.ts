/**
 * Touch controls for SPUDNAUT.
 *
 * Provides the on-screen virtual joystick used for free walking on phones and
 * tablets, plus a small bridge that lets DOM buttons drive the same actions the
 * keyboard already owns (`E` interact, `R` camera snap, `P` demo pan).
 *
 * Design notes:
 * - This module is deliberately DOM-only (no Phaser import) so the maths can be
 *   unit tested without booting a game.
 * - Keyboard input always wins over the joystick in `InputSystem`, so desktop
 *   behaviour is byte-for-byte unchanged and hybrid devices never fight over
 *   the move vector.
 * - The joystick uses a floating origin: the base appears wherever the thumb
 *   first lands, then the knob travels up to `JOYSTICK_RADIUS` px from it.
 */

/** Action keys shared between the keyboard bindings and the on-screen buttons. */
export type TouchAction = 'interact' | 'snapCamera' | 'demoPan';

/** Fraction of knob travel that still counts as "at rest". */
export const JOYSTICK_DEADZONE = 0.14;

/** Knob travel radius in CSS pixels before the output saturates at 1.0. */
export const JOYSTICK_RADIUS = 52;

/**
 * Decide whether the virtual joystick should be rendered.
 *
 * The primary pointer must be coarse (touch) *and* the device must report at
 * least one touch point. That keeps desktops, including touch-screen laptops
 * whose primary pointer is still a mouse, on the keyboard-only path.
 */
export function shouldUseTouchControls(coarsePointer: boolean, maxTouchPoints: number): boolean {
  return coarsePointer && maxTouchPoints > 0;
}

/** Runtime flavour of `shouldUseTouchControls`. */
export function detectTouchControls(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const maxTouchPoints = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  return shouldUseTouchControls(coarse, maxTouchPoints);
}

/**
 * Rescale a raw joystick vector so movement starts cleanly past the deadzone
 * instead of ramping up from zero. Vectors inside the deadzone return zero.
 */
export function applyDeadzone(
  x: number,
  y: number,
  deadzone: number = JOYSTICK_DEADZONE,
): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 0 || magnitude < deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled };
}

/** Clamp a vector so its length never exceeds `max` (keeps diagonals honest). */
export function clampToUnit(x: number, y: number, max = 1): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= max || magnitude === 0) return { x, y };
  return { x: (x / magnitude) * max, y: (y / magnitude) * max };
}

interface JoystickParts {
  root: HTMLElement;
  zone: HTMLElement;
  base: HTMLElement;
  knob: HTMLElement;
}

/**
 * Singleton controller for the joystick and the camera action bridge.
 *
 * `InputSystem.update()` drains `queueAction()` once per frame, which is why
 * button presses can be queued from the DOM without holding a reference to the
 * running Phaser scene.
 */
export class TouchControls {
  private parts: JoystickParts | null = null;
  private activePointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private vector = { x: 0, y: 0 };
  private peek = false;
  private pending = new Set<TouchAction>();

  /** True once a touch-capable device has mounted the joystick. */
  get enabled(): boolean {
    return this.parts !== null;
  }

  /** Current normalised move vector, always zero when disabled. */
  getVector(): { x: number; y: number } {
    return this.parts ? { x: this.vector.x, y: this.vector.y } : { x: 0, y: 0 };
  }

  /** True while the on-screen PEEK button is held (Shift free-camera equivalent). */
  isPeeking(): boolean {
    return this.peek;
  }

  /** Queue a one-frame action for `InputSystem` to consume. */
  queueAction(action: TouchAction): void {
    this.pending.add(action);
  }

  /** Hold state for the PEEK button. */
  setPeek(active: boolean): void {
    this.peek = active;
  }

  /** Drain queued actions. Called once per `InputSystem.update()`. */
  drainActions(): TouchAction[] {
    if (this.pending.size === 0) return [];
    const actions = [...this.pending];
    this.pending.clear();
    return actions;
  }

  /**
   * Wire up the joystick markup rendered by `ui/layout.ts`.
   * Returns false on non-touch devices, leaving the markup hidden.
   */
  mount(root: HTMLElement | null): boolean {
    if (this.parts) return true;
    if (!root) return false;
    if (!detectTouchControls()) return false;
    const zone = root.querySelector<HTMLElement>('.touch-joystick');
    const base = root.querySelector<HTMLElement>('.touch-joystick-base');
    const knob = root.querySelector<HTMLElement>('.touch-joystick-knob');
    if (!zone || !base || !knob) return false;

    this.parts = { root, zone, base, knob };
    root.hidden = false;
    zone.addEventListener('pointerdown', this.onPointerDown);
    zone.addEventListener('pointermove', this.onPointerMove);
    zone.addEventListener('pointerup', this.onPointerUp);
    zone.addEventListener('pointercancel', this.onPointerUp);
    zone.addEventListener('lostpointercapture', this.onPointerUp);

    // Secondary camera cluster is mission-only chrome; the mission HUD hides it
    // again whenever the training deck takes over the scene shell.
    document.getElementById('camera-cluster')?.removeAttribute('hidden');
    document.body.dataset.touchControls = '1';
    return true;
  }

  /** Detach listeners and return to the keyboard-only path. Safe to call cold. */
  unmount(): void {
    const parts = this.parts;
    if (parts) {
      parts.zone.removeEventListener('pointerdown', this.onPointerDown);
      parts.zone.removeEventListener('pointermove', this.onPointerMove);
      parts.zone.removeEventListener('pointerup', this.onPointerUp);
      parts.zone.removeEventListener('pointercancel', this.onPointerUp);
      parts.zone.removeEventListener('lostpointercapture', this.onPointerUp);
      parts.root.hidden = true;
      parts.zone.classList.remove('is-active');
      this.parts = null;
      document.getElementById('camera-cluster')?.setAttribute('hidden', '');
      delete document.body.dataset.touchControls;
    }
    this.activePointer = null;
    this.vector = { x: 0, y: 0 };
    this.peek = false;
    this.pending.clear();
  }

  private onPointerDown = (event: PointerEvent): void => {
    const parts = this.parts;
    if (!parts || this.activePointer !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    this.activePointer = event.pointerId;
    const local = this.toLocal(event);
    this.origin = local;
    parts.base.style.left = `${local.x}px`;
    parts.base.style.top = `${local.y}px`;
    parts.zone.classList.add('is-active');
    try {
      parts.zone.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an optimisation; dragging still works without it.
    }
    this.updateVector(local);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointer) return;
    event.preventDefault();
    this.updateVector(this.toLocal(event));
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.type !== 'lostpointercapture' && event.pointerId !== this.activePointer) return;
    if (event.type === 'lostpointercapture' && this.activePointer === null) return;
    this.release();
  };

  private release(): void {
    const parts = this.parts;
    this.activePointer = null;
    this.vector = { x: 0, y: 0 };
    if (!parts) return;
    parts.zone.classList.remove('is-active');
    parts.base.style.left = '';
    parts.base.style.top = '';
    parts.knob.style.transform = '';
  }

  private toLocal(event: PointerEvent): { x: number; y: number } {
    const rect = this.parts!.zone.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private updateVector(local: { x: number; y: number }): void {
    const parts = this.parts;
    if (!parts) return;
    const dx = local.x - this.origin.x;
    const dy = local.y - this.origin.y;
    const distance = Math.hypot(dx, dy);
    const unitX = distance > 0 ? dx / distance : 0;
    const unitY = distance > 0 ? dy / distance : 0;
    const travel = Math.min(1, distance / JOYSTICK_RADIUS);
    this.vector = applyDeadzone(unitX * travel, unitY * travel);

    const knobDistance = Math.min(distance, JOYSTICK_RADIUS);
    parts.knob.style.transform =
      `translate(-50%, -50%) translate(${(unitX * knobDistance).toFixed(1)}px, ${(unitY * knobDistance).toFixed(1)}px)`;
  }
}

export const touchControls = new TouchControls();
