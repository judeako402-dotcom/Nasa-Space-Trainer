import Phaser from 'phaser';
import {
  applyResolvedSpriteVisual,
  getSpriteDisplaySize,
  resolveCharacterVisual,
  SPRITE_ORIGIN_X,
  SPRITE_ORIGIN_Y,
} from '../assets/characterSprites';
import { INTERACTION_RADIUS } from '../constants';
import { clampPointToBounds, type RoomBounds } from '../world/Room';
import type { Interactable } from './Interactable';

const LEGACY_BODY_WIDTH = 52;
const LEGACY_BODY_HEIGHT = 64;
export const CREW_FEET_OFFSET_Y = 22;

export interface CrewNPCOptions {
  id: string;
  label: string;
  role?: string;
  accent?: string;
  lines?: string[];
  helmeted?: boolean;
  frozen?: boolean;
  reducedMotion?: boolean;
  home: { x: number; y: number };
  wanderRadius?: number;
  patrolBounds?: RoomBounds;
  waypoints?: { x: number; y: number }[];
  feetOffsetY?: number;
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
  private wanderTimer?: Phaser.Time.TimerEvent;
  private walkTween?: Phaser.Tweens.Tween;
  private readonly pos = { x: 0, y: 0 };
  private readonly feetOffsetY: number;
  private walking = false;
  private frozen: boolean;
  private helmeted: boolean;
  private reducedMotion: boolean;
  private faceLeft = false;
  private highlighted = false;
  private lastVisualKey = '';

  constructor(scene: Phaser.Scene, texture: string, x: number, y: number, options: CrewNPCOptions) {
    this.scene = scene;
    this.id = options.id;
    this.opts = { wanderRadius: 160, ...options };
    this.promptText = options.role ? `${options.label} · ${options.role}` : options.label;
    this.enabled = Boolean(options.lines?.length && options.onTalk);
    this.baseTextureKey = texture;
    this.feetOffsetY = options.feetOffsetY ?? CREW_FEET_OFFSET_Y;
    this.frozen = Boolean(options.frozen);
    this.helmeted = Boolean(options.helmeted);
    this.reducedMotion = Boolean(options.reducedMotion);

    const startPos = this.clampSpriteToPatrol({ x, y });

    const initialVisual = resolveCharacterVisual({
      baseTextureKey: texture,
      moving: false,
      helmeted: this.helmeted,
      reducedMotion: this.reducedMotion,
    });
    const animated = Boolean(initialVisual && scene.textures.exists(initialVisual.textureKey));
    this.usesAnimatedSheet = animated;

    this.sprite = scene.add.sprite(
      startPos.x,
      startPos.y,
      animated && initialVisual ? initialVisual.textureKey : texture,
    );
    if (animated) {
      const { width, height } = getSpriteDisplaySize(texture, 'crew');
      this.sprite.setOrigin(SPRITE_ORIGIN_X, SPRITE_ORIGIN_Y);
      this.sprite.setDisplaySize(width, height);
    } else {
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.setDisplaySize(LEGACY_BODY_WIDTH, LEGACY_BODY_HEIGHT);
    }
    this.baseScaleX = this.sprite.scaleX;
    this.baseScaleY = this.sprite.scaleY;

    this.shadow = scene.add.ellipse(startPos.x, startPos.y + 28, 42, 14, 0x000000, 0.3);
    this.shadow.setDepth(startPos.y + 27);

    this.nameLabel = scene.add
      .text(startPos.x, startPos.y - (animated ? 53 : 48), options.label.toUpperCase(), {
        fontFamily: 'Consolas, monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: options.accent ?? '#ffe9a8',
        backgroundColor: 'rgba(4,8,14,0.68)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(startPos.y + 30);

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
      if (this.reducedMotion || this.frozen) this.bobTween.pause();
    }

    this.updateVisualAnimation(true);
    this.pos.x = startPos.x;
    this.pos.y = startPos.y;
    if (!this.frozen) this.scheduleWander();
  }

  private clampSpriteToPatrol(pos: { x: number; y: number }): { x: number; y: number } {
    const bounds = this.opts.patrolBounds;
    if (!bounds) return pos;
    const clampedFeet = clampPointToBounds({ x: pos.x, y: pos.y + this.feetOffsetY }, bounds);
    return { x: clampedFeet.x, y: clampedFeet.y - this.feetOffsetY };
  }

  setFrozen(frozen: boolean): void {
    if (this.frozen === frozen) return;
    this.frozen = frozen;
    if (frozen) {
      this.wanderTimer?.remove(false);
      this.wanderTimer = undefined;
      this.walkTween?.pause();
      if (this.walking) {
        this.walking = false;
        this.updateVisualAnimation(true);
      }
      this.bobTween?.pause();
    } else if (this.walkTween) {
      this.walking = true;
      this.walkTween.resume();
      this.updateVisualAnimation(true);
    } else {
      if (this.bobTween && !this.reducedMotion) this.bobTween.resume();
      this.scheduleWander(900);
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (this.bobTween) {
      if (reduced || this.walking || this.frozen) this.bobTween.pause();
      else this.bobTween.resume();
    }
    this.updateVisualAnimation(true);
  }

  setHelmeted(helmeted: boolean): void {
    if (this.helmeted === helmeted) return;
    this.helmeted = helmeted;
    this.updateVisualAnimation(true);
  }

  get position(): { x: number; y: number } {
    this.pos.x = this.sprite.x;
    this.pos.y = this.sprite.y;
    return this.pos;
  }

  /** Read-only state snapshot for automated verification harnesses. */
  getTelemetry(): {
    id: string;
    x: number;
    y: number;
    feetY: number;
    walking: boolean;
    frozen: boolean;
    helmeted: boolean;
    patrolBounds: RoomBounds | null;
  } {
    return {
      id: this.id,
      x: this.sprite.x,
      y: this.sprite.y,
      feetY: this.sprite.y + this.feetOffsetY,
      walking: this.walking,
      frozen: this.frozen,
      helmeted: this.helmeted,
      patrolBounds: this.opts.patrolBounds ?? null,
    };
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
    const clamped = this.clampSpriteToPatrol(this.sprite);
    if (clamped.x !== this.sprite.x || clamped.y !== this.sprite.y) {
      this.sprite.setPosition(clamped.x, clamped.y);
    }
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

  private updateVisualAnimation(force = false): void {
    if (!this.usesAnimatedSheet) return;
    const visualKey = `${this.baseTextureKey}:${this.walking ? 1 : 0}:${this.helmeted ? 1 : 0}:${this.reducedMotion ? 1 : 0}`;
    if (!force && visualKey === this.lastVisualKey) return;
    this.lastVisualKey = visualKey;
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

  private scheduleWander(baseDelayMs = 2200): void {
    if (this.frozen || !this.sprite.active) return;
    this.wanderTimer?.remove(false);
    const delay = baseDelayMs + Math.random() * 2800;
    this.wanderTimer = this.scene.time.delayedCall(delay, () => {
      this.wanderTimer = undefined;
      if (!this.sprite.active || this.frozen) return;
      this.wander();
    });
  }

  private pickWanderTarget(): { x: number; y: number } {
    const { home, wanderRadius, waypoints } = this.opts;
    if (waypoints && waypoints.length > 0) {
      const nearby = waypoints.filter((pt) => {
        const d = Math.hypot(pt.x - this.sprite.x, pt.y - this.sprite.y);
        return d >= 44 && d <= Math.max(wanderRadius, 120);
      });
      const pool = nearby.length > 0
        ? nearby
        : waypoints.filter((pt) => Math.hypot(pt.x - this.sprite.x, pt.y - this.sprite.y) >= 28);
      const source = pool.length > 0 ? pool : waypoints;
      return source[Math.floor(Math.random() * source.length)];
    }

    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * Math.max(20, wanderRadius - 60);
    return this.clampSpriteToPatrol({
      x: home.x + Math.cos(angle) * dist,
      y: home.y + Math.sin(angle) * dist,
    });
  }

  private wander(): void {
    if (this.walking || this.frozen || !this.sprite.active) return;
    const { findPath } = this.opts;
    if (!findPath) {
      this.scheduleWander();
      return;
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const target = this.pickWanderTarget();
      const path = findPath(this.sprite, target);
      if (path && path.length >= 2) {
        this.walkPath(path.slice(1));
        return;
      }
    }
    this.scheduleWander();
  }

  private walkPath(points: { x: number; y: number }[]): void {
    if (points.length === 0 || !this.sprite.active) {
      this.walkTween = undefined;
      this.walking = false;
      this.sprite.setScale(this.baseScaleX, this.baseScaleY);
      if (this.bobTween && !this.reducedMotion && !this.frozen) this.bobTween.resume();
      this.updateVisualAnimation(true);
      this.scheduleWander();
      return;
    }
    this.walking = true;
    this.bobTween?.pause();
    this.updateVisualAnimation(true);
    const next = this.clampSpriteToPatrol(points[0]);
    const dx = next.x - this.sprite.x;
    if (Math.abs(dx) > 1) this.faceLeft = dx < 0;
    const dist = Math.hypot(dx, next.y - this.sprite.y);
    const duration = Math.max(120, (dist / 100) * 1000);
    this.walkTween = this.scene.tweens.add({
      targets: this.sprite,
      x: next.x,
      y: next.y,
      duration,
      ease: 'linear',
      paused: this.frozen,
      onComplete: () => {
        this.walkTween = undefined;
        if (!this.sprite.active) return;
        if (!this.usesAnimatedSheet && !this.reducedMotion) {
          this.sprite.setScale(this.baseScaleX * 1.06, this.baseScaleY * 0.94);
        }
        this.walkPath(points.slice(1));
      },
    });
  }

  destroy(): void {
    this.wanderTimer?.remove(false);
    this.wanderTimer = undefined;
    this.walkTween?.stop();
    this.walkTween = undefined;
    this.bobTween?.stop();
    this.shadow.destroy();
    this.nameLabel.destroy();
    this.sprite.destroy();
  }
}

