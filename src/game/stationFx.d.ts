import type Phaser from 'phaser';

export interface StationFxUpdateParams {
  dt: number;
  time: number;
  playerX: number;
  playerY: number;
  moving: boolean;
  room: string;
  destination?: 'moon' | 'mars';
  mapId: 'training' | 'surface';
  colorHex: number;
  interactions: ReadonlyArray<{ id: string; name: string; x: number; y: number; accent?: string }>;
  activeIds: string[];
  completedIds: string[];
}

export class StationFxController {
  constructor(scene: Phaser.Scene);
  setReducedMotion(enabled: boolean): void;
  syncCompletedInteractions(
    interactions: ReadonlyArray<{ id: string; name: string; x: number; y: number; accent?: string }>,
    completedIds: string[],
  ): void;
  spawnCompletionBurst(x: number, y: number, label: string, colorHex?: number): void;
  update(params: StationFxUpdateParams): void;
  destroy(): void;
}

