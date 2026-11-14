import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  applyResolvedSpriteVisual,
  CHARACTER_SPRITES,
  hasAnimatedSprite,
  resolveCharacterVisual,
  SPRITE_FRAME_HEIGHT,
  SPRITE_FRAME_WIDTH,
  supportsHelmetArt,
} from '../src/game/assets/characterSprites';

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = readFileSync(filePath);
  expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe('characterSprites assets and resolvers', () => {
  const publicDir = resolve(process.cwd(), 'public');

  it('ships all 12 packed character spritesheets with frame-exact PNG dimensions', () => {
    for (const set of Object.values(CHARACTER_SPRITES)) {
      for (const spec of [set.idle, set.idleHelmet, set.walk, set.walkHelmet]) {
        const assetPath = resolve(publicDir, spec.path.replace(/^\//, ''));
        expect(existsSync(assetPath), `missing spritesheet ${spec.path}`).toBe(true);
        const dims = readPngDimensions(assetPath);
        expect(dims.width).toBe(SPRITE_FRAME_WIDTH * spec.frameCount);
        expect(dims.height).toBe(SPRITE_FRAME_HEIGHT);
      }
    }
  });

  it('ships the 9-frame loading screen runner sheet and poster PNG', () => {
    const stripPath = resolve(publicDir, 'assets/loading/loading-runner-sheet.png');
    const posterPath = resolve(publicDir, 'assets/loading/loading-poster.png');
    expect(existsSync(stripPath)).toBe(true);
    expect(existsSync(posterPath)).toBe(true);
    expect(readPngDimensions(stripPath)).toEqual({ width: 340 * 9, height: 440 });
    expect(readPngDimensions(posterPath)).toEqual({ width: 340, height: 440 });
  });

  it('resolves idle/walk and helmet variants across potato, farmer, and repairman', () => {
    expect(resolveCharacterVisual({
      baseTextureKey: 'potato-default',
      moving: false,
      helmeted: false,
      reducedMotion: false,
    })).toEqual({ textureKey: 'potato-idle-sheet', animKey: 'potato-default:idle' });

    expect(resolveCharacterVisual({
      baseTextureKey: 'potato-farmer',
      moving: true,
      helmeted: true,
      reducedMotion: false,
    })).toEqual({ textureKey: 'farmer-walk-helmet-sheet', animKey: 'potato-farmer:walk-helmet' });

    expect(resolveCharacterVisual({
      baseTextureKey: 'potato-repairman',
      moving: true,
      helmeted: false,
      reducedMotion: false,
    })).toEqual({ textureKey: 'repairman-walk-sheet', animKey: 'potato-repairman:walk' });
  });

  it('holds idle frame 0 under reducedMotion while still honoring helmeted variant', () => {
    expect(resolveCharacterVisual({
      baseTextureKey: 'potato-repairman',
      moving: true,
      helmeted: true,
      reducedMotion: true,
    })).toEqual({ textureKey: 'repairman-idle-helmet-sheet', animKey: null });
  });

  it('returns null for static legacy skins and matches supportsHelmetArt accurately', () => {
    expect(hasAnimatedSprite('potato-default')).toBe(true);
    expect(hasAnimatedSprite('potato-researcher')).toBe(false);
    expect(resolveCharacterVisual({
      baseTextureKey: 'potato-traveller',
      moving: true,
      helmeted: true,
      reducedMotion: false,
    })).toBeNull();

    expect(supportsHelmetArt('/assets/potato-repairman.png')).toBe(true);
    expect(supportsHelmetArt('/assets/potato-farmer.png')).toBe(true);
    expect(supportsHelmetArt('/assets/potato-default.png')).toBe(true);
    expect(supportsHelmetArt('/assets/potato-researcher.png')).toBe(false);
    expect(supportsHelmetArt('/assets/potato-traveller.png')).toBe(false);
  });

  it('applies animation poses idempotently and falls back cleanly when reducedMotion stops playback', () => {
    const play = vi.fn();
    const stop = vi.fn();
    const setTexture = vi.fn();
    const setFrame = vi.fn();

    const sprite = {
      anims: {
        currentAnim: { key: 'potato-farmer:idle' },
        play,
        stop,
      },
      texture: { key: 'farmer-idle-sheet' },
      setTexture,
      setFrame,
    } as unknown as Parameters<typeof applyResolvedSpriteVisual>[1];

    const scene = {
      anims: { exists: () => true },
      textures: { exists: () => true },
    } as unknown as Parameters<typeof applyResolvedSpriteVisual>[0];

    applyResolvedSpriteVisual(scene, sprite, {
      textureKey: 'farmer-idle-sheet',
      animKey: 'potato-farmer:idle',
    });
    expect(play).not.toHaveBeenCalled();

    applyResolvedSpriteVisual(scene, sprite, {
      textureKey: 'farmer-walk-sheet',
      animKey: 'potato-farmer:walk',
    });
    expect(play).toHaveBeenCalledWith('potato-farmer:walk', true);

    applyResolvedSpriteVisual(scene, sprite, {
      textureKey: 'farmer-idle-helmet-sheet',
      animKey: null,
    });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(setTexture).toHaveBeenCalledWith('farmer-idle-helmet-sheet', 0);
  });
});
