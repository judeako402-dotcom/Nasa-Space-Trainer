import type { TaskKind } from '../model';

export interface MinigamePhaserHandle {
  markComplete(): void;
  destroy(): void;
}

export function mountMinigamePhaserCanvas(
  container: HTMLElement,
  kind: TaskKind | string,
  title?: string,
): MinigamePhaserHandle;

