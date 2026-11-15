import type Phaser from 'phaser';
import { PLAYER_COLORS, type PlayerColorId } from '../../model';
import { preloadCharacterSprites } from '../assets/characterSprites';
import type { CrewNPC } from '../entities/CrewNPC';
import type { Tile, WalkableGrid } from '../utils/pathing';

export type MapId = 'training' | 'surface';

export interface SceneGameState {
  mapId: MapId;
  destination?: 'moon';
  playerName: string;
  colorId: PlayerColorId;
  playerArt: string;
  helmet?: boolean;
  x: number;
  y: number;
  speed: number;
  frozen: boolean;
  visionEnabled: boolean;
  blackout?: boolean;
  spotlightGuide?: boolean;
  restAtBunk?: boolean;
  activeInteractions: string[];
  completedInteractions: string[];
  objective: string;
}

export type GameEvent =
  | { type: 'load-progress'; progress: number }
  | { type: 'ready' }
  | { type: 'move'; x: number; y: number; room: string; moving: boolean }
  | { type: 'prompt'; interactionId: string | null; name: string; kind: string; room: string }
  | { type: 'interact'; interactionId: string; kind: string }
  | { type: 'crew'; crewId: string; name: string; lines: string[] }
  | { type: 'route-blocked' }
  | { type: 'fps'; fps: number }
  | { type: 'error'; message: string };

export interface StationTelemetrySnapshot {
  activeMode: MapId | null;
  ready: boolean;
  room: string;
  frozen: boolean;
  player: { x: number; y: number; helmeted: boolean };
  crew: ReturnType<CrewNPC['getTelemetry']>[];
  guide?: { x: number; y: number; path: { x: number; y: number }[]; isEmergency: boolean } | null;
}

export interface StationControllableScene extends Phaser.Scene {
  configure(next: SceneGameState, options?: { respawn?: boolean }): void;
  setReducedMotion(reduced: boolean): void;
  navigateTo(x: number, y: number): boolean;
  interactNow(): void;
  transitionThroughBlack(onCovered: () => void, onFinished?: () => void): void;
  getTelemetrySnapshot(): StationTelemetrySnapshot;
}

export interface StationCoordinator {
  targetMode: MapId;
  activeKey: MapId | null;
  state: SceneGameState;
  respawn: boolean;
  reducedMotion: boolean;
  paused: boolean;
  readonly onEvent: (event: GameEvent) => void;
}

export const POTATO_TEXTURES: Record<string, string> = {
  '/assets/potato-default.png': 'potato-default',
  '/assets/potato-farmer.png': 'potato-farmer',
  '/assets/potato-repairman.png': 'potato-repairman',
  '/assets/potato-researcher.png': 'potato-researcher',
  '/assets/potato-traveller.png': 'potato-traveller',
};

export const ICON_TEXTURES: Record<string, string> = {
  lightning: '/assets/ui/icons/lightning.png',
  water: '/assets/ui/icons/water.png',
  sickle: '/assets/ui/icons/sickle.png',
  shield: '/assets/ui/icons/shield.png',
  notepad: '/assets/ui/icons/notepad.png',
  hammer: '/assets/ui/icons/hammer.png',
  arrow: '/assets/ui/icons/arrow.png',
};

export const ICON_GLYPHS: Record<string, string> = {
  lightning: '⚡',
  water: '◈',
  sickle: '❋',
  shield: '⬡',
  notepad: '▤',
  hammer: '⚒',
  arrow: '→',
};

export function textureKeyForArt(art: string): string {
  return POTATO_TEXTURES[art] ?? 'potato-default';
}

export function colorHex(id: PlayerColorId): number {
  return PLAYER_COLORS.find((color) => color.id === id)?.hex ?? 0xef7d0d;
}

export function nearestWalkableTile(grid: WalkableGrid, target: Tile): Tile | null {
  if (!grid.isBlocked(target.x, target.y)) return target;
  const limit = Math.max(grid.cols, grid.rows);
  for (let radius = 1; radius < limit; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = target.x + dx;
        const y = target.y + dy;
        if (!grid.isBlocked(x, y)) return { x, y };
      }
    }
  }
  return null;
}

/** Queue shared character stills & animated sprite sheets once across scenes. */
export function preloadSharedCharacters(
  scene: Phaser.Scene,
  onProgress: (progress: number) => void,
): void {
  scene.load.on('progress', onProgress);
  for (const [path, key] of Object.entries(POTATO_TEXTURES)) {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, path);
    }
  }
  preloadCharacterSprites(scene);
}

/** Sweep a black curtain across the viewport, invoke callback when covered, then clear. */
export function playSceneBlackTransition(
  scene: Phaser.Scene,
  reducedMotion: boolean,
  onCovered: () => void,
  onFinished: () => void,
): void {
  const cover = scene.add
    .rectangle(0, 0, 1, 1, 0x000000)
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(100_000);
  const progress = { value: 0 };
  const updateCover = (): void => {
    const { width, height } = scene.scale;
    cover
      .setSize(width, height)
      .setPosition(width / 2, height * (1.5 - progress.value));
  };
  const animate = (target: number, onComplete: () => void): void => {
    scene.tweens.add({
      targets: progress,
      value: target,
      duration: reducedMotion ? 1 : 550,
      ease: 'Linear',
      onUpdate: updateCover,
      onComplete,
    });
  };

  updateCover();
  animate(1, () => {
    try {
      onCovered();
    } finally {
      animate(2, () => {
        cover.destroy();
        onFinished();
      });
    }
  });
}
