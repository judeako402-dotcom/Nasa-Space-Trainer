import Phaser from 'phaser';
import { getColor, type PlayerColorId } from '../../model';
import { CHARACTER_SPRITES, splitColoredTextureKey } from './characterSprites';

const SUIT_BODY_START_Y = 128;
const STRIPE_START_Y = 166;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Recolor neutral spacesuit fabric and waist stripe pixels below the head line
 * into the selected suit pigment while preserving dark outlines, skin, hats,
 * flag patches, and chest telemetry displays.
 */
function recolorSpritesheetPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  targetRgb: readonly [number, number, number],
  colorId: PlayerColorId,
): void {
  const [tr, tg, tb] = targetRgb;
  const isBlack = colorId === 'black';
  for (let y = SUIT_BODY_START_Y; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = (rowOffset + x) * 4;
      const a = rgba[idx + 3] ?? 0;
      if (a < 24) continue;

      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC - minC;

      // Preserve dark outlines and boots
      if (r < 64 && g < 64 && b < 64) continue;
      // Preserve blue flag pixels and green/cyan display pixels
      if (b - Math.max(r, g) > 22) continue;
      if (g - Math.max(r, b) > 18) continue;

      // Belly accent stripe (red horizontal band on lower torso)
      if (y >= STRIPE_START_Y && r - Math.max(g, b) > 28 && g < 130) {
        const lum = r / 215;
        if (isBlack) {
          rgba[idx] = clampByte(245 * lum);
          rgba[idx + 1] = clampByte(158 * lum);
          rgba[idx + 2] = clampByte(26 * lum);
        } else {
          rgba[idx] = clampByte(tr * 0.68 * lum);
          rgba[idx + 1] = clampByte(tg * 0.68 * lum);
          rgba[idx + 2] = clampByte(tb * 0.68 * lum);
        }
        continue;
      }

      // Neutral white/light-grey suit shell
      if (sat <= 30 && maxC >= 88) {
        const lum = Math.min(1.14, Math.max(0.28, maxC / 232));
        const scale = isBlack ? 0.42 : 0.94;
        rgba[idx] = clampByte(tr * lum * scale);
        rgba[idx + 1] = clampByte(tg * lum * scale);
        rgba[idx + 2] = clampByte(tb * lum * scale);
      }
    }
  }
}

function buildRecoloredCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  targetRgb: readonly [number, number, number],
  colorId: PlayerColorId,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const width = source instanceof HTMLImageElement ? source.naturalWidth || source.width : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight || source.height : source.height;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height);
  recolorSpritesheetPixels(imgData.data, width, height, targetRgb, colorId);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Ensure colored spacesuit spritesheets and looping Phaser animations exist
 * for the requested base character key + suit color, returning the composite
 * texture key (e.g. `potato-repairman--pink`) to pass into `Player` / `resolveCharacterVisual`.
 */
export function ensureColoredCharacterTextures(
  scene: Phaser.Scene,
  baseArtOrTextureKey: string,
  colorId: PlayerColorId,
): string {
  const { baseKey } = splitColoredTextureKey(baseArtOrTextureKey);
  if (colorId === 'white') return baseKey;

  const set = CHARACTER_SPRITES[baseKey];
  if (!set) return baseKey;

  const hex = getColor(colorId).hex;
  const rgb: [number, number, number] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const compositeKey = `${baseKey}--${colorId}`;

  const slots = [
    ['idle', set.idle],
    ['idle-helmet', set.idleHelmet],
    ['walk', set.walk],
    ['walk-helmet', set.walkHelmet],
  ] as const;

  let anyCreatedOrPresent = false;
  for (const [slotName, sheet] of slots) {
    const coloredSheetKey = `${sheet.key}--${colorId}`;
    const coloredAnimKey = `${compositeKey}:${slotName}`;

    if (!scene.textures.exists(coloredSheetKey) && scene.textures.exists(sheet.key)) {
      const srcImg = scene.textures.get(sheet.key).getSourceImage() as
        | HTMLImageElement
        | HTMLCanvasElement
        | null;
      if (srcImg) {
        const recolored = buildRecoloredCanvas(srcImg, rgb, colorId);
        if (recolored) {
          scene.textures.addSpriteSheet(coloredSheetKey, recolored as unknown as HTMLImageElement, {
            frameWidth: set.frameWidth,
            frameHeight: set.frameHeight,
          });
        }
      }
    }

    if (scene.textures.exists(coloredSheetKey)) {
      anyCreatedOrPresent = true;
      if (!scene.anims.exists(coloredAnimKey)) {
        scene.anims.create({
          key: coloredAnimKey,
          frames: scene.anims.generateFrameNumbers(coloredSheetKey, {
            start: 0,
            end: sheet.frameCount - 1,
          }),
          frameRate: sheet.frameRate,
          repeat: -1,
        });
      }
    }
  }

  return anyCreatedOrPresent ? compositeKey : baseKey;
}
