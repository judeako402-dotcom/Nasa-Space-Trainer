import Phaser from 'phaser';
import {
  applyResolvedSpriteVisual,
  resolveCharacterVisual,
  SPRITE_CREW_DISPLAY_HEIGHT,
  SPRITE_CREW_DISPLAY_WIDTH,
  SPRITE_ORIGIN_X,
  SPRITE_ORIGIN_Y,
} from '../assets/characterSprites';
import { INTERACTION_RADIUS } from '../constants';
import type { Interactable } from './Interactable';

const LEGACY_BODY_WIDTH = 52;
const LEGACY_BODY_HEIGHT = 64;

export interface CrewNPCOptions {
  id: string;
  label: string;
  role?: string;
  accent?: string;
  lines?: string[];
  helmeted?: boolean;
  reducedMotion?: boolean;
  home: { x: number; y: number };
  wanderRadius?: number;
  findPath?: (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => { x: number; y: number }[] | null;
  onTalk?: (crew: { id: string; name: string; lines: string[] }) => void;
}

/**
 * Ambient station crewmate that plays idle/walk sprite cycles (or a gentle
 * bob for static legacy portraits), wanders along BFS-verified walkable tiles
 * near home, and implements Interactable so approaching allows dialogue.
 */
export class CrewNPC implements Interactable {
  readonly id: string;
  readonly kind = 'crew' as const;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly interactionRadius = INTERACTION_RADIUS;
  readonly promptText: string;
  enabled: boolean;

  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private readonly scene: Phaser.Scene;
  private readonly opts: Required<Pick<CrewNPCOptions, 'wanderRadius'>> & CrewNPCOptions;
  private readonly baseTextureKey: string;
  private readonly usesAnimatedSheet: boolean;
  private readonly baseScaleX: number;
  private readonly baseScaleY: number;
  private readonly bobTween?: Phaser.Tweens.Tween;
  private readonly pos = { x: 0, y: 0 };
  private walking = false;
  private helmeted: boolean;
  private reducedMotion: boolean;
  private faceLeft = false;
  private highlighted = false;

  constructor(scene: Phaser.Scene, texture: string, x: number, y: number, options: CrewNPCOptions) {
    this.scene = scene;
    this.id = options.id;
    this.opts = { wanderRadius: 160, ...options };
    this.promptText = options.role ? `${options.label} · ${options.role}` : options.label;
    this.enabled = Boolean(options.lines?.length && options.onTalk);
    this.baseTextureKey = texture;
    this.helmeted = Boolean(options.helmeted);
    this.reducedMotion = Boolean(options.reducedMotion);

    const initialVisual = resolveCharacterVisual({
      baseTextureKey: texture,
      moving: false,
      helmeted: this.helmeted,
      reducedMotion: this.reducedMotion,
    });
    const animated = Boolean(initialVisual && scene.textures.exists(initialVisual.textureKey));
    this.usesAnimatedSheet = animated;

    this.sprite = scene.add.sprite(
      x,
      y,
      animated && initialVisual ? initialVisual.textureKey : texture,
    );
    if (animated) {
      this.sprite.setOrigin(SPRITE_ORIGIN_X, SPRITE_ORIGIN_Y);
      this.sprite.setDisplaySize(SPRITE_CREW_DISPLAY_WIDTH, SPRITE_CREW_DISPLAY_HEIGHT);
    } else {
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.setDisplaySize(LEGACY_BODY_WIDTH, LEGACY_BODY_HEIGHT);
    }
    this.baseScaleX = this.sprite.scaleX;
    this.baseScaleY = this.sprite.scaleY;

    this.shadow = scene.add.ellipse(x, y + 28, 42, 14, 0x000000, 0.3);
    this.shadow.setDepth(y + 27);

    this.nameLabel = scene.add
      .text(x, y - (animated ? 53 : 48), options.label.toUpperCase(), {
        fontFamily: 'Consolas, monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: options.accent ?? '#ffe9a8',
        backgroundColor: 'rgba(4,8,14,0.68)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 30);

    if (!animated) {
      this.bobTween = scene.tweens.add({
        targets: this.sprite,
        scaleX: this.baseScaleX * 1.03,
        scaleY: this.baseScaleY * 0.97,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inout',
      });
      if (this.reducedMotion) this.bobTween.pause();
    }

    this.updateVisualAnimation();
    this.pos.x = x;
    this.pos.y = y;
    this.scheduleWander();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (this.bobTween) {
      if (reduced || this.walking) this.bobTween.pause();
      else this.bobTween.resume();
    }
    this.updateVisualAnimation();
  }

  setHelmeted(helmeted: boolean): void {
    if (this.helmeted === helmeted) return;
    this.helmeted = helmeted;
    this.updateVisualAnimation();
  }

  get position(): { x: number; y: number } {
    this.pos.x = this.sprite.x;
    this.pos.y = this.sprite.y;
    return this.pos;
  }

  onInteract(): void {
    if (!this.enabled || !this.opts.lines?.length) return;
    this.opts.onTalk?.({
      id: this.id,
      name: this.opts.label,
      lines: this.opts.lines,
    });
  }

  setHighlighted(highlighted: boolean): void {
    this.highlighted = highlighted;
    if (highlighted && this.enabled) {
      this.sprite.setTint(0xfff3a0);
    } else {
      this.sprite.clearTint();
    }
  }

  preUpdate(): void {
    const { x, y } = this.sprite;
    const feetY = y + 28;
    this.pos.x = x;
    this.pos.y = y;
    this.sprite.setDepth(feetY);
    this.sprite.setFlipX(this.faceLeft);
    this.shadow.x = x;
    this.shadow.y = feetY;
    this.shadow.setDepth(feetY - 1);
    this.nameLabel.x = x;
    this.nameLabel.y = y - (this.usesAnimatedSheet ? 53 : 48);
    this.nameLabel.setDepth(feetY + 2);
    if (this.highlighted && this.enabled) {
      this.sprite.setTint(0xfff3a0);
    }
    this.updateVisualAnimation();
  }

  private updateVisualAnimation(): void {
    if (!this.usesAnimatedSheet) return;
    const visual = resolveCharacterVisual({
      baseTextureKey: this.baseTextureKey,
      moving: this.walking,
      helmeted: this.helmeted,
      reducedMotion: this.reducedMotion,
    });
    if (!visual) return;
    applyResolvedSpriteVisual(this.scene, this.sprite, visual);
    if (!visual.animKey) {
      this.sprite.setScale(this.baseScaleX, this.baseScaleY);
    }
  }

  private scheduleWander(): void {
    const delay = 2500 + Math.random() * 3500;
    this.scene.time.delayedCall(delay, () => {
      if (!this.sprite.active) return;
      this.wander();
    });
  }

  private wander(): void {
    if (this.walking) return;
    const { home, wanderRadius, findPath } = this.opts;
    if (!findPath) {
      this.scheduleWander();
      return;
    }
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * Math.max(20, wanderRadius - 60);
    const target = {
      x: home.x + Math.cos(angle) * dist,
      y: home.y + Math.sin(angle) * dist,
    };
    const path = findPath(this.sprite, target);
    if (!path || path.length < 2) {
      this.scheduleWander();
      return;
    }
    this.walkPath(path.slice(1));
  }

  private walkPath(points: { x: number; y: number }[]): void {
    if (points.length === 0 || !this.sprite.active) {
      this.walking = false;
      this.sprite.setScale(this.baseScaleX, this.baseScaleY);
      if (this.bobTween && !this.reducedMotion) this.bobTween.resume();
      this.updateVisualAnimation();
      this.scheduleWander();
      return;
    }
    this.walking = true;
    this.bobTween?.pause();
    this.updateVisualAnimation();
    const next = points[0];
    const dx = next.x - this.sprite.x;
    this.faceLeft = dx < 0;
    const dist = Math.hypot(dx, next.y - this.sprite.y);
    const duration = Math.max(120, (dist / 110) * 1000);
    this.scene.tweens.add({
      targets: this.sprite,
      x: next.x,
      y: next.y,
      duration,
      ease: 'linear',
      onComplete: () => {
        if (!this.sprite.active) return;
        if (!this.usesAnimatedSheet && !this.reducedMotion) {
          this.sprite.setScale(this.baseScaleX * 1.06, this.baseScaleY * 0.94);
        }
        this.walkPath(points.slice(1));
      },
    });
  }

  destroy(): void {
    this.bobTween?.stop();
    this.shadow.destroy();
    this.nameLabel.destroy();
    this.sprite.destroy();
  }
}

