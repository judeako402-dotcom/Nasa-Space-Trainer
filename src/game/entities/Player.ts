import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { GHOST_SPEED, PLAYER_FEET, WALK_SPEED } from '../constants';
import { moveVelocity } from '../utils/vectors';

const BODY_WIDTH = 56;
const BODY_HEIGHT = 70;

/**
 * Arcade-physics potato player entity with fitted feet collider, walk bob,
 * drop shadow, callsign label, specialist speed multiplier, and horizontal flip.
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private baseScaleX: number;
  private baseScaleY: number;
  private facing: 1 | -1 = 1;
  private moving = false;
  private bobTime = 0;

  canMove = true;
  isGhost = false;
  reducedMotion = false;
  speedMultiplier = 1;

  private readonly pos = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name = 'Spudnaut',
    textureKey: string = AssetKeys.playerBody,
  ) {
    this.sprite = scene.physics.add.sprite(x, y, textureKey);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setDepth(y);
    this.sprite.setDisplaySize(BODY_WIDTH, BODY_HEIGHT);
    this.baseScaleX = this.sprite.scaleX;
    this.baseScaleY = this.sprite.scaleY;

    this.syncBodyHitbox();

    this.shadow = scene.add.ellipse(x, y + 30, 46, 15, 0x000000, 0.35);
    this.shadow.setDepth(y - 1);

    this.nameLabel = scene.add
      .text(x, y - 52, name.toUpperCase(), {
        fontFamily: 'Consolas, monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fff1be',
        backgroundColor: 'rgba(4,8,14,0.72)',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 2);
  }

  get position(): { x: number; y: number } {
    this.pos.x = this.sprite.x;
    this.pos.y = this.sprite.y;
    return this.pos;
  }

  get velocity(): { x: number; y: number } {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    return { x: body.velocity.x, y: body.velocity.y };
  }

  get speed(): number {
    const base = this.isGhost ? GHOST_SPEED : WALK_SPEED;
    return base * this.speedMultiplier;
  }

  setAppearance(textureKey: string, name: string): void {
    if (this.sprite.texture.key !== textureKey && this.sprite.scene.textures.exists(textureKey)) {
      this.sprite.setTexture(textureKey);
      this.sprite.setDisplaySize(BODY_WIDTH, BODY_HEIGHT);
      this.baseScaleX = this.sprite.scaleX;
      this.baseScaleY = this.sprite.scaleY;
      this.syncBodyHitbox();
    }
    this.nameLabel.setText(name.toUpperCase());
  }

  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.reset(x, y);
    this.pos.x = x;
    this.pos.y = y;
  }

  applyInput(direction: { x: number; y: number }): void {
    if (!this.canMove) {
      this.stop();
      return;
    }
    const vel = moveVelocity(direction, this.speed);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vel.x, vel.y);
    this.moving = vel.x !== 0 || vel.y !== 0;
    if (vel.x > 0) this.facing = 1;
    else if (vel.x < 0) this.facing = -1;
  }

  stop(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.setVelocity(0, 0);
    this.moving = false;
  }

  preUpdate(delta: number): void {
    this.pos.x = this.sprite.x;
    this.pos.y = this.sprite.y;

    const y = this.sprite.y;
    const depth = y + PLAYER_FEET.offsetY;
    const baseAlpha = !this.canMove ? 0.78 : 1;
    const ghostAlpha = (this.isGhost ? 0.55 : 1) * baseAlpha;

    this.sprite.setFlipX(this.facing === -1);
    this.sprite.setDepth(depth);
    this.sprite.setAlpha(ghostAlpha);

    this.shadow.x = this.sprite.x;
    this.shadow.y = y + 30;
    this.shadow.setDepth(depth - 1);
    this.shadow.setAlpha(this.isGhost ? 0.15 : 0.35);

    this.nameLabel.x = this.sprite.x;
    this.nameLabel.y = y - 50;
    this.nameLabel.setDepth(depth + 2);
    this.nameLabel.setAlpha(ghostAlpha);

    if (this.moving && !this.reducedMotion) {
      this.bobTime += delta;
      const phase = this.bobTime / 90;
      const bob = Math.sin(phase) * 2;
      this.sprite.setScale(this.baseScaleX, this.baseScaleY * (1 + bob / 64));
      this.sprite.setAngle(Math.sin(phase) * 3);
    } else {
      this.bobTime = 0;
      this.sprite.setScale(this.baseScaleX, this.baseScaleY);
      this.sprite.setAngle(0);
    }
  }

  private syncBodyHitbox(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER_FEET.width / this.baseScaleX, PLAYER_FEET.height / this.baseScaleY, false);
    body.setOffset(
      ((BODY_WIDTH - PLAYER_FEET.width) / 2) / this.baseScaleX,
      ((BODY_HEIGHT - PLAYER_FEET.height) / 2 + PLAYER_FEET.offsetY) / this.baseScaleY,
    );
  }

  destroy(): void {
    this.nameLabel.destroy();
    this.shadow.destroy();
    this.sprite.destroy();
  }
}

