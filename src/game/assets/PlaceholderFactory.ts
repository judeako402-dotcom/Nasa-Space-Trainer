import Phaser from 'phaser';
import { AssetKeys } from './AssetKeys';

/**
 * Generates procedural textures at runtime for tileset collision layers,
 * vents, task consoles, and station decor props.
 */
export function createPlaceholderTextures(scene: Phaser.Scene): void {
  makeTileFloor(scene);
  makeTileWall(scene);
  makeTileset(scene);
  makeTaskConsole(scene);
  makeVent(scene);
  makeDoor(scene);
  makeSpawn(scene);
  makeCrate(scene);
  makePlant(scene);
  makeBarrel(scene);
}

function graphicsTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

function makeTileFloor(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.tileFloor, 64, 64, (g) => {
    g.fillStyle(0x2a2d38, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(1, 0x232630, 1);
    g.strokeRect(0.5, 0.5, 63, 63);
  });
}

function makeTileWall(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.tileWall, 64, 64, (g) => {
    g.fillStyle(0x4a5064, 1);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle(0x565d75, 1);
    g.fillRect(0, 0, 64, 8);
    g.lineStyle(1, 0x3a3f50, 1);
    g.strokeRect(0.5, 0.5, 63, 63);
  });
}

function makeTileset(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.tileset, 128, 64, (g) => {
    g.fillStyle(0x2a2d38, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(1, 0x232630, 1);
    g.strokeRect(0.5, 0.5, 63, 63);

    g.fillStyle(0x4a5064, 1);
    g.fillRect(64, 0, 64, 64);
    g.fillStyle(0x565d75, 1);
    g.fillRect(64, 0, 64, 8);
    g.lineStyle(1, 0x3a3f50, 1);
    g.strokeRect(64.5, 0.5, 63, 63);
  });
}

function makeTaskConsole(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.taskConsole, 56, 64, (g) => {
    g.fillStyle(0xe8b93c, 1);
    g.fillRoundedRect(0, 0, 56, 64, 6);
    g.fillStyle(0x1d2b3a, 1);
    g.fillRoundedRect(8, 8, 40, 28, 4);
    g.fillStyle(0x4ade80, 1);
    g.fillRect(13, 14, 30, 4);
    g.fillRect(13, 22, 22, 4);
    g.fillStyle(0xc79a2b, 1);
    g.fillRect(10, 44, 12, 10);
    g.fillRect(34, 44, 12, 10);
    g.lineStyle(2, 0x8a6d1f, 1);
    g.strokeRoundedRect(0, 0, 56, 64, 6);
  });
}

function makeVent(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.vent, 64, 48, (g) => {
    g.fillStyle(0x6b7280, 1);
    g.fillRoundedRect(0, 0, 64, 48, 8);
    g.fillStyle(0x4b5563, 1);
    for (let i = 0; i < 3; i++) {
      g.fillRect(10, 10 + i * 10, 44, 5);
    }
    g.lineStyle(2, 0x374151, 1);
    g.strokeRoundedRect(0, 0, 64, 48, 8);
  });
}

function makeDoor(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.door, 20, 64, (g) => {
    g.fillStyle(0x8b5a2b, 1);
    g.fillRect(0, 0, 20, 64);
    g.fillStyle(0x6f4620, 1);
    g.fillRect(4, 4, 12, 56);
    g.fillStyle(0xd9a441, 1);
    g.fillCircle(13, 32, 3);
  });
}

function makeSpawn(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.spawn, 32, 32, (g) => {
    g.lineStyle(2, 0x4ade80, 1);
    g.strokeCircle(16, 16, 14);
    g.fillStyle(0x4ade80, 0.3);
    g.fillCircle(16, 16, 14);
  });
}

function makeCrate(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.propCrate, 48, 44, (g) => {
    g.fillStyle(0xb07a3c, 1);
    g.fillRoundedRect(0, 0, 48, 44, 4);
    g.lineStyle(3, 0x8a5a28, 1);
    g.strokeRoundedRect(1.5, 1.5, 45, 41, 4);
    g.lineStyle(2, 0x8a5a28, 1);
    g.lineBetween(4, 4, 44, 40);
    g.lineBetween(44, 4, 4, 40);
    g.fillStyle(0xd9a441, 1);
    g.fillRect(18, 18, 12, 8);
  });
}

function makePlant(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.propPlant, 40, 52, (g) => {
    g.fillStyle(0x3f8f4a, 1);
    g.fillEllipse(20, 18, 30, 26);
    g.fillStyle(0x54b862, 1);
    g.fillEllipse(14, 14, 16, 16);
    g.fillEllipse(27, 16, 14, 14);
    g.fillStyle(0xc96f4a, 1);
    g.fillRoundedRect(11, 32, 18, 18, 3);
    g.lineStyle(2, 0xa35538, 1);
    g.strokeRoundedRect(11, 32, 18, 18, 3);
    g.fillStyle(0xa35538, 1);
    g.fillRect(9, 32, 22, 5);
  });
}

function makeBarrel(scene: Phaser.Scene): void {
  graphicsTexture(scene, AssetKeys.propBarrel, 36, 48, (g) => {
    g.fillStyle(0x4a7fb5, 1);
    g.fillRoundedRect(0, 0, 36, 48, 8);
    g.fillStyle(0x3a6795, 1);
    g.fillRect(0, 14, 36, 5);
    g.fillRect(0, 30, 36, 5);
    g.fillStyle(0x9fd0f5, 1);
    g.fillRoundedRect(8, 4, 20, 7, 3);
    g.lineStyle(2, 0x2f5578, 1);
    g.strokeRoundedRect(1, 1, 34, 46, 8);
  });
}

