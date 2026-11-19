import Phaser from 'phaser';

export type Action = 'interact' | 'snapCamera' | 'demoPan';

const KEY_BINDINGS: Record<Action, string[]> = {
  interact: ['E'],
  snapCamera: ['R'],
  demoPan: ['P'],
};

/**
 * Samples WASD/Arrow movement input, Shift free-camera peek, and action keys
 * while leaving DOM focus (Tab) and text inputs unobstructed.
 */
export class InputSystem {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private justPressedActions = new Set<Action>();
  private moveVector = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) {
      this.keys = {};
      return;
    }
    this.keys = kb.addKeys(
      {
        W: Phaser.Input.Keyboard.KeyCodes.W,
        A: Phaser.Input.Keyboard.KeyCodes.A,
        S: Phaser.Input.Keyboard.KeyCodes.S,
        D: Phaser.Input.Keyboard.KeyCodes.D,
        UP: Phaser.Input.Keyboard.KeyCodes.UP,
        DOWN: Phaser.Input.Keyboard.KeyCodes.DOWN,
        LEFT: Phaser.Input.Keyboard.KeyCodes.LEFT,
        RIGHT: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        E: Phaser.Input.Keyboard.KeyCodes.E,
        R: Phaser.Input.Keyboard.KeyCodes.R,
        P: Phaser.Input.Keyboard.KeyCodes.P,
        SHIFT: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      },
      false,
      false,
    ) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  update(): void {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      this.moveVector = { x: 0, y: 0 };
      this.justPressedActions.clear();
      return;
    }

    let x = 0;
    let y = 0;
    if (this.isDownKey('A') || this.isDownKey('LEFT')) x -= 1;
    if (this.isDownKey('D') || this.isDownKey('RIGHT')) x += 1;
    if (this.isDownKey('W') || this.isDownKey('UP')) y -= 1;
    if (this.isDownKey('S') || this.isDownKey('DOWN')) y += 1;
    this.moveVector = { x, y };

    this.justPressedActions.clear();
    for (const action of Object.keys(KEY_BINDINGS) as Action[]) {
      for (const name of KEY_BINDINGS[action]) {
        const key = this.keys[name];
        if (key && Phaser.Input.Keyboard.JustDown(key)) {
          this.justPressedActions.add(action);
          break;
        }
      }
    }
  }

  getMoveVector(): { x: number; y: number } {
    return this.moveVector;
  }

  isShiftDown(): boolean {
    return this.isDownKey('SHIFT');
  }

  isDown(action: Action): boolean {
    return KEY_BINDINGS[action].some((name) => this.keys[name]?.isDown);
  }

  justPressed(action: Action): boolean {
    return this.justPressedActions.has(action);
  }

  private isDownKey(name: string): boolean {
    const key = this.keys[name];
    return key ? key.isDown : false;
  }
}

