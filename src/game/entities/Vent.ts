import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { INTERACTION_RADIUS } from '../constants';
import type { Interactable } from './Interactable';

/**
 * Station maintenance vent interactable extracted from spudnaut-station.tmj.
 * Flashes cyan on activation and invokes an optional handler.
 */
export class Vent implements Interactable {
  readonly id: string;
  readonly kind = 'vent' as const;
  position: { x: number; y: number };
  interactionRadius = INTERACTION_RADIUS;
  promptText = 'Maintenance Vent';
  enabled = true;

  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly scene: Phaser.Scene;
  private readonly onTrigger?: (ventId: string, position: { x: number; y: number }) => void;
  private highlighted = false;

  constructor(
    scene: Phaser.Scene,
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    onTrigger?: (ventId: string, position: { x: number; y: number }) => void,
  ) {
    this.scene = scene;
    this.id = id;
    this.onTrigger = onTrigger;
    this.position = { x: x + width / 2, y: y + height / 2 };

    this.shadow = scene.add.ellipse(this.position.x, this.position.y + 22, 58, 13, 0x000000, 0.3);
    this.shadow.setDepth(this.position.y - 1);

    this.sprite = scene.add.sprite(this.position.x, this.position.y, AssetKeys.vent);
    this.sprite.setDepth(this.position.y);
  }

  onInteract(): void {
    this.sprite.setTint(0x9be8ff);
    this.onTrigger?.(this.id, this.position);
    this.scene.time.delayedCall(380, () => {
      if (!this.sprite.active) return;
      if (this.highlighted) {
        this.sprite.setTint(0xfff3a0);
      } else {
        this.sprite.clearTint();
      }
    });
  }

  setHighlighted(highlighted: boolean): void {
    this.highlighted = highlighted;
    if (highlighted) {
      this.sprite.setTint(0xfff3a0);
    } else {
      this.sprite.clearTint();
    }
  }

  destroy(): void {
    this.shadow.destroy();
    this.sprite.destroy();
  }
}

