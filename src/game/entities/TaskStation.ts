import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { INTERACTION_RADIUS } from '../constants';
import type { Interactable } from './Interactable';

export interface TaskStationOptions {
  id: string;
  name: string;
  roomName: string;
  accent?: number;
  iconKey?: string;
  assigned?: boolean;
  completed?: boolean;
  onTrigger?: (taskId: string) => void;
}

/**
 * Interactive task station console registered with InteractionSystem and depth-sorted
 * against nearby entities. Reflects assigned/completed state cleanly.
 */
export class TaskStation implements Interactable {
  readonly id: string;
  readonly kind = 'task' as const;
  readonly roomName: string;
  position: { x: number; y: number };
  interactionRadius = INTERACTION_RADIUS;
  promptText: string;
  enabled = true;

  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly iconOverlay?: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly accent: number;
  private readonly onTrigger?: (taskId: string) => void;
  private highlighted = false;
  private assigned = true;
  private completed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    options: string | TaskStationOptions,
  ) {
    const opts: TaskStationOptions = typeof options === 'string'
      ? { id: options, name: options, roomName: 'Station', promptText: options } as TaskStationOptions & { promptText?: string }
      : options;

    this.id = opts.id;
    this.roomName = opts.roomName;
    this.promptText = opts.name;
    this.accent = opts.accent ?? 0xf5c451;
    this.assigned = opts.assigned ?? true;
    this.completed = opts.completed ?? false;
    this.onTrigger = opts.onTrigger;
    this.position = { x: x + width / 2, y: y + height / 2 };

    this.shadow = scene.add.ellipse(this.position.x, this.position.y + 30, 52, 15, 0x000000, 0.34);
    this.ring = scene.add.circle(this.position.x, this.position.y + 8, 28, 0x07111c, 0.45);
    this.sprite = scene.add.sprite(this.position.x, this.position.y, AssetKeys.taskConsole);

    if (opts.iconKey && scene.textures.exists(opts.iconKey)) {
      this.iconOverlay = scene.add.image(this.position.x, this.position.y - 8, opts.iconKey).setDisplaySize(18, 18);
    }

    this.label = scene.add
      .text(this.position.x, this.position.y + 38, this.promptText.toUpperCase(), {
        color: '#e7dcc0',
        fontFamily: 'Consolas, monospace',
        fontSize: '9px',
        fontStyle: 'bold',
        backgroundColor: 'rgba(4,8,14,0.74)',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5, 0);

    this.setState(this.assigned, this.completed);
    this.syncDepths();
  }

  setState(assigned: boolean, completed: boolean): void {
    this.assigned = assigned;
    this.completed = completed;
    const shown = assigned || completed;
    this.enabled = assigned && !completed;
    this.shadow.setVisible(shown);
    this.ring.setVisible(shown);
    this.sprite.setVisible(shown);
    this.iconOverlay?.setVisible(shown);
    this.label.setVisible(shown);

    if (!shown) {
      this.highlighted = false;
      return;
    }

    if (completed) {
      this.ring.setStrokeStyle(2, 0x66d98d, 0.9);
      this.sprite.setTint(0x66d98d).setAlpha(0.75);
      this.iconOverlay?.setTint(0x66d98d).setAlpha(0.78);
      this.label.setColor('#9fc9ac').setAlpha(0.68);
    } else {
      this.ring.setStrokeStyle(2.5, this.accent, 0.95);
      this.sprite.setAlpha(1);
      this.iconOverlay?.clearTint().setAlpha(0.95);
      this.label.setColor('#e7dcc0').setAlpha(1);
    }
    this.applyHighlight();
  }

  onInteract(): void {
    if (!this.enabled) {
      return;
    }
    this.onTrigger?.(this.id);
  }

  setHighlighted(highlighted: boolean): void {
    this.highlighted = highlighted;
    this.applyHighlight();
  }

  private applyHighlight(): void {
    if (!this.assigned || this.completed) return;
    if (this.highlighted) {
      this.sprite.setTint(0xfff3a0);
      this.ring.setStrokeStyle(3.5, 0xffffff, 1);
    } else {
      this.sprite.clearTint();
      this.ring.setStrokeStyle(2.5, this.accent, 0.95);
    }
  }

  private syncDepths(): void {
    const y = this.position.y;
    this.shadow.setDepth(y - 2);
    this.ring.setDepth(y - 1);
    this.sprite.setDepth(y);
    this.iconOverlay?.setDepth(y + 1);
    this.label.setDepth(y + 2);
  }

  destroy(): void {
    this.shadow.destroy();
    this.ring.destroy();
    this.sprite.destroy();
    this.iconOverlay?.destroy();
    this.label.destroy();
  }
}

