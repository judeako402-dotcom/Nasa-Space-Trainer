import type Phaser from 'phaser';

export interface SpriteSheetSpec {
  readonly key: string;
  readonly path: string;
  readonly frameCount: number;
  readonly frameRate: number;
  readonly animKey: string;
}

export interface CharacterSpriteSet {
  readonly idle: SpriteSheetSpec;
  readonly idleHelmet: SpriteSheetSpec;
  readonly walk: SpriteSheetSpec;
  readonly walkHelmet: SpriteSheetSpec;
}

export interface ResolvedCharacterVisual {
  readonly textureKey: string;
  readonly animKey: string | null;
}

/** Packed character spritesheet frame dimensions (2160px source cropped to 1050x1180 @ 1/5). */
export const SPRITE_FRAME_WIDTH = 210;
export const SPRITE_FRAME_HEIGHT = 236;

/**
 * Display size & anchor keeping the potato torso (~56x68px) and feet line
 * aligned with existing PLAYER_FEET collision bounds across hats and helmets.
 */
export const SPRITE_DISPLAY_WIDTH = 76;
export const SPRITE_DISPLAY_HEIGHT = 86;
export const SPRITE_CREW_DISPLAY_WIDTH = 70;
export const SPRITE_CREW_DISPLAY_HEIGHT = 80;
export const SPRITE_ORIGIN_X = 0.5;
export const SPRITE_ORIGIN_Y = 0.593;

const IDLE_FPS = 8;
const WALK_FPS = 12;

function buildSet(skin: string, prefix: string): CharacterSpriteSet {
  return {
    idle: {
      key: `${prefix}-idle-sheet`,
      path: `/assets/sprites/${prefix}-idle-sheet.png`,
      frameCount: 7,
      frameRate: IDLE_FPS,
      animKey: `${skin}:idle`,
    },
    idleHelmet: {
      key: `${prefix}-idle-helmet-sheet`,
      path: `/assets/sprites/${prefix}-idle-helmet-sheet.png`,
      frameCount: 7,
      frameRate: IDLE_FPS,
      animKey: `${skin}:idle-helmet`,
    },
    walk: {
      key: `${prefix}-walk-sheet`,
      path: `/assets/sprites/${prefix}-walk-sheet.png`,
      frameCount: 9,
      frameRate: WALK_FPS,
      animKey: `${skin}:walk`,
    },
    walkHelmet: {
      key: `${prefix}-walk-helmet-sheet`,
      path: `/assets/sprites/${prefix}-walk-helmet-sheet.png`,
      frameCount: 9,
      frameRate: WALK_FPS,
      animKey: `${skin}:walk-helmet`,
    },
  };
}

/** Animated spritesheets keyed by canonical character texture key. */
export const CHARACTER_SPRITES: Record<string, CharacterSpriteSet> = {
  'potato-default': buildSet('potato-default', 'potato'),
  'potato-farmer': buildSet('potato-farmer', 'farmer'),
  'potato-repairman': buildSet('potato-repairman', 'repairman'),
};

export function hasAnimatedSprite(baseTextureKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(CHARACTER_SPRITES, baseTextureKey);
}

export function resolveCharacterVisual(params: {
  baseTextureKey: string;
  moving: boolean;
  helmeted: boolean;
  reducedMotion: boolean;
}): ResolvedCharacterVisual | null {
  const set = CHARACTER_SPRITES[params.baseTextureKey];
  if (!set) return null;
  if (params.reducedMotion) {
    const pose = params.helmeted ? set.idleHelmet : set.idle;
    return { textureKey: pose.key, animKey: null };
  }
  const spec = params.moving
    ? (params.helmeted ? set.walkHelmet : set.walk)
    : (params.helmeted ? set.idleHelmet : set.idle);
  return { textureKey: spec.key, animKey: spec.animKey };
}

/** Queue all character spritesheets inside a Phaser scene preload(). */
export function preloadCharacterSprites(scene: Phaser.Scene): void {
  for (const set of Object.values(CHARACTER_SPRITES)) {
    for (const sheet of [set.idle, set.idleHelmet, set.walk, set.walkHelmet]) {
      scene.load.spritesheet(sheet.key, sheet.path, {
        frameWidth: SPRITE_FRAME_WIDTH,
        frameHeight: SPRITE_FRAME_HEIGHT,
      });
    }
  }
}

/** Register looping idle and walk animations idempotently in a Phaser scene. */
export function registerCharacterAnimations(scene: Phaser.Scene): void {
  for (const set of Object.values(CHARACTER_SPRITES)) {
    for (const sheet of [set.idle, set.idleHelmet, set.walk, set.walkHelmet]) {
      if (scene.anims.exists(sheet.animKey) || !scene.textures.exists(sheet.key)) continue;
      scene.anims.create({
        key: sheet.animKey,
        frames: scene.anims.generateFrameNumbers(sheet.key, { start: 0, end: sheet.frameCount - 1 }),
        frameRate: sheet.frameRate,
        repeat: -1,
      });
    }
  }
}

/** Determine whether a given base texture has a helmeted EVA variant. */
export function supportsHelmetArt(artPath: string): boolean {
  return artPath.includes('potato-default')
    || artPath.includes('potato-farmer')
    || artPath.includes('potato-repairman');
}

/** Apply a resolved sprite/animation pose cleanly without restarting active loops. */
export function applyResolvedSpriteVisual(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  visual: ResolvedCharacterVisual,
): void {
  if (visual.animKey && scene.anims.exists(visual.animKey)) {
    if (sprite.anims.currentAnim?.key !== visual.animKey) {
      sprite.anims.play(visual.animKey, true);
    }
    return;
  }
  sprite.anims.stop();
  if (scene.textures.exists(visual.textureKey)) {
    if (sprite.texture.key !== visual.textureKey) {
      sprite.setTexture(visual.textureKey, 0);
    } else {
      sprite.setFrame(0);
    }
  }
}
