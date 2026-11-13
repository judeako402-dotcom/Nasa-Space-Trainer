import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';

/** Spawn point marker parsed from the Tiled object layer. */
export class SpawnPoint {
  readonly x: number;
  readonly y: number;
  private readonly marker: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, x: number, y: number, visible = false) {
    this.x = x;
    this.y = y;
    this.marker = scene.add.sprite(x, y, AssetKeys.spawn);
    this.marker.setDepth(y);
    this.marker.setVisible(visible);
  }

  destroy(): void {
    this.marker.destroy();
  }
}

