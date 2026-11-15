import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { DEPTH_FLOOR, INTERACTION_RADIUS } from '../constants';
import type { RectBounds } from '../utils/interaction';
import {
  FIGMA_DESIGN_SIZE,
  FIGMA_LAYER_TEXTURES,
  FIGMA_TO_WORLD,
  type FigmaLayerSource,
  type TaskObjectOutlineSpec,
} from '../world/figmaMapLayers';
import type { Interactable } from './Interactable';

const OUTLINE_RADIUS_PX = 10;
const OUTLINE_ALPHA_THRESHOLD = 24;
const OUTLINE_YELLOW = 0xffdc4a;
const OUTLINE_YELLOW_HIGHLIGHT = 0xfff59d;
const OUTLINE_EMERGENCY = 0xff5a5f;
const OUTLINE_EMERGENCY_HIGHLIGHT = 0xff9b8a;

/**
 * Extract an outer morphological silhouette ring mask from an RGBA image buffer.
 * Marks pixels as `1` only where source alpha is below `alphaThreshold` and at least
 * one solid pixel lies within Euclidean distance `radius`.
 */
export function extractAlphaOutlineMask(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radius = OUTLINE_RADIUS_PX,
  alphaThreshold = OUTLINE_ALPHA_THRESHOLD,
): Uint8Array {
  const total = Math.max(0, width * height);
  const mask = new Uint8Array(total);
  if (width <= 0 || height <= 0 || radius <= 0) {
    return mask;
  }

  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if ((rgba[i * 4 + 3] ?? 0) >= alphaThreshold) {
      solid[i] = 1;
    }
  }

  const offsets: Array<[number, number]> = [];
  const maxOffset = Math.ceil(radius);
  const radiusSq = radius * radius;
  for (let dy = -maxOffset; dy <= maxOffset; dy++) {
    for (let dx = -maxOffset; dx <= maxOffset; dx++) {
      if ((dx !== 0 || dy !== 0) && dx * dx + dy * dy <= radiusSq) {
        offsets.push([dx, dy]);
      }
    }
  }

  // Only solid pixels touching at least one non-solid 4-neighbor can be closest to an outer pixel.
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (!solid[idx]) continue;
      const isBoundary =
        x === 0 ||
        x === width - 1 ||
        y === 0 ||
        y === height - 1 ||
        !solid[idx - 1] ||
        !solid[idx + 1] ||
        !solid[idx - width] ||
        !solid[idx + width];
      if (!isBoundary) continue;

      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = ny * width + nx;
        if (!solid[ni]) {
          mask[ni] = 1;
        }
      }
    }
  }

  return mask;
}

function isDrawableSource(source: unknown): source is HTMLImageElement | HTMLCanvasElement {
  if (!source || typeof source !== 'object') return false;
  const candidate = source as { width?: number; height?: number };
  return (candidate.width ?? 0) > 0 && (candidate.height ?? 0) > 0;
}

function resolveOutlineSourceKey(scene: Phaser.Scene, source: FigmaLayerSource): string | null {
  const candidates: string[] = [];
  if (source === 'floor') {
    candidates.push(AssetKeys.figmaFloorPlan);
  } else if (source === 'objects') {
    candidates.push(AssetKeys.figmaObjectsSheet);
  } else {
    const layerKey = FIGMA_LAYER_TEXTURES[source]?.key;
    if (layerKey) candidates.push(layerKey);
    candidates.push(AssetKeys.figmaObjectsSheet);
  }
  candidates.push(AssetKeys.mapObjectsImage);

  for (const key of candidates) {
    if (!scene.textures.exists(key)) continue;
    const sourceImage = scene.textures.get(key).getSourceImage();
    if (isDrawableSource(sourceImage)) {
      return key;
    }
  }
  return null;
}

function createSilhouetteTexture(
  scene: Phaser.Scene,
  textureKey: string,
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  pad: number,
): boolean {
  if (scene.textures.exists(textureKey)) {
    return true;
  }
  if (typeof document === 'undefined') {
    return false;
  }

  const cw = sw + pad * 2;
  const ch = sh + pad * 2;
  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = cw;
  scratchCanvas.height = ch;
  const scratchCtx = scratchCanvas.getContext('2d');
  if (!scratchCtx) {
    return false;
  }

  scratchCtx.clearRect(0, 0, cw, ch);
  scratchCtx.drawImage(sourceImage, sx, sy, sw, sh, pad, pad, sw, sh);
  const srcData = scratchCtx.getImageData(0, 0, cw, ch).data;
  const mask = extractAlphaOutlineMask(srcData, cw, ch, OUTLINE_RADIUS_PX, OUTLINE_ALPHA_THRESHOLD);

  const outTex = scene.textures.createCanvas(textureKey, cw, ch);
  if (!outTex) {
    return false;
  }
  const outCtx = outTex.getContext();
  const outImage = outCtx.createImageData(cw, ch);
  const outBytes = outImage.data;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const offset = i * 4;
    outBytes[offset] = 255;
    outBytes[offset + 1] = 255;
    outBytes[offset + 2] = 255;
    outBytes[offset + 3] = 255;
  }
  outCtx.putImageData(outImage, 0, 0);
  outTex.refresh();
  return true;
}

function buildOutlineImage(
  scene: Phaser.Scene,
  taskId: string,
  spec: TaskObjectOutlineSpec,
): Phaser.GameObjects.Image | undefined {
  const sourceKey = resolveOutlineSourceKey(scene, spec.source);
  if (!sourceKey) return undefined;
  const sourceImage = scene.textures.get(sourceKey).getSourceImage();
  if (!isDrawableSource(sourceImage)) return undefined;

  const scale = sourceImage.width / FIGMA_DESIGN_SIZE;
  if (scale <= 0) return undefined;

  const sx = Math.max(0, Math.round(spec.x * scale));
  const sy = Math.max(0, Math.round(spec.y * scale));
  const sw = Math.min(sourceImage.width - sx, Math.max(1, Math.round(spec.w * scale)));
  const sh = Math.min(sourceImage.height - sy, Math.max(1, Math.round(spec.h * scale)));
  const pad = OUTLINE_RADIUS_PX + 2;
  const textureKey = `task-outline-${taskId}-${spec.source}-${spec.x}-${spec.y}-${spec.w}-${spec.h}-r${OUTLINE_RADIUS_PX}`;

  if (!createSilhouetteTexture(scene, textureKey, sourceImage, sx, sy, sw, sh, pad)) {
    return undefined;
  }

  const padWorld = (pad / scale) * FIGMA_TO_WORLD;
  const worldX = spec.x * FIGMA_TO_WORLD - padWorld;
  const worldY = spec.y * FIGMA_TO_WORLD - padWorld;
  const worldW = spec.w * FIGMA_TO_WORLD + padWorld * 2;
  const worldH = spec.h * FIGMA_TO_WORLD + padWorld * 2;
  const depth = spec.flat ? DEPTH_FLOOR + 4 : Math.round(spec.footY * FIGMA_TO_WORLD) + 1;

  return scene.add
    .image(worldX, worldY, textureKey)
    .setOrigin(0, 0)
    .setDisplaySize(worldW, worldH)
    .setDepth(depth)
    .setVisible(false);
}

export interface TaskStationOptions {
  id: string;
  name: string;
  roomName: string;
  accent?: number;
  target?: Phaser.GameObjects.Image;
  outlineSpec?: TaskObjectOutlineSpec;
  assigned?: boolean;
  completed?: boolean;
  onTrigger?: (taskId: string) => void;
}

/**
 * Interactable task target whose pixel-accurate outline marks an existing
 * station prop only while actively assigned and incomplete.
 */
export class TaskStation implements Interactable {
  readonly id: string;
  readonly kind = 'task' as const;
  readonly roomName: string;
  readonly priority: number;
  position: { x: number; y: number };
  bounds?: RectBounds;
  interactionRadius = INTERACTION_RADIUS;
  promptText: string;
  enabled = true;

  private readonly outline: Phaser.GameObjects.Graphics;
  private readonly outlineImage?: Phaser.GameObjects.Image;
  private readonly outlineBounds?: RectBounds;
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
    const emergency = this.id.startsWith('emergency-');
    this.priority = emergency ? 1 : 0;
    if (emergency) this.interactionRadius = 62;
    this.roomName = opts.roomName;
    this.promptText = opts.name;
    this.assigned = opts.assigned ?? true;
    this.completed = opts.completed ?? false;
    this.onTrigger = opts.onTrigger;
    this.position = { x: x + width / 2, y: y + height / 2 };

    if (opts.outlineSpec) {
      this.outlineBounds = {
        x: opts.outlineSpec.x * FIGMA_TO_WORLD,
        y: opts.outlineSpec.y * FIGMA_TO_WORLD,
        width: opts.outlineSpec.w * FIGMA_TO_WORLD,
        height: opts.outlineSpec.h * FIGMA_TO_WORLD,
      };
      this.outlineImage = buildOutlineImage(scene, this.id, opts.outlineSpec);
    } else if (opts.target) {
      const targetBounds = opts.target.getBounds();
      this.outlineBounds = {
        x: targetBounds.x,
        y: targetBounds.y,
        width: targetBounds.width,
        height: targetBounds.height,
      };
    }
    // The artwork can be tall or wide. Emergency cards unlock near the walkable repair spot.
    if (!emergency) this.bounds = this.outlineBounds;

    this.outline = scene.add.graphics();
    if (opts.target && this.outlineBounds) {
      this.outline.setDepth(opts.target.depth + 1);
    } else {
      this.outline.setDepth(this.position.y + 2);
    }
    this.setState(this.assigned, this.completed);
  }

  setState(assigned: boolean, completed: boolean): void {
    this.assigned = assigned;
    this.completed = completed;
    this.enabled = assigned && !completed;
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
    const missionActive = this.assigned && !this.completed;
    const isEmergency = this.id.startsWith('emergency-');
    const color = isEmergency
      ? (this.highlighted ? OUTLINE_EMERGENCY_HIGHLIGHT : OUTLINE_EMERGENCY)
      : (this.highlighted ? OUTLINE_YELLOW_HIGHLIGHT : OUTLINE_YELLOW);
    if (this.outlineImage) {
      this.outline.clear();
      this.outline.setVisible(false);
      this.outlineImage.setVisible(missionActive);
      if (!missionActive) return;
      this.outlineImage.setTint(color);
      this.outlineImage.setAlpha(this.highlighted ? 1 : 0.98);
      return;
    }

    this.outline.clear();
    const bounds = this.outlineBounds;
    this.outline.setVisible(missionActive && Boolean(bounds));
    if (!bounds || !missionActive) return;
    const padding = 6;
    this.outline.lineStyle(this.highlighted ? 7 : 5, color, 1);
    this.outline.strokeRoundedRect(
      bounds.x - padding,
      bounds.y - padding,
      bounds.width + padding * 2,
      bounds.height + padding * 2,
      8,
    );
  }

  destroy(): void {
    this.outline.destroy();
    this.outlineImage?.destroy();
  }
}

