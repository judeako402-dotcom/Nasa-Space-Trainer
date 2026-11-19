/**
 * Idle background pre-warming for Phaser bundle & surface assets.
 * Runs silently during Menu / Story / Exam so Training Deck and Launch
 * transitions feel instant without blocking first paint or honoring Data Saver.
 */

import { StationMapUrls } from '../game/assets/AssetKeys';
import { detectTouchControls } from '../game/systems/TouchControls';

interface NetworkInformationLike {
  saveData?: boolean;
}

const PREWARM_URLS = [
  '/assets/habitats/moon.webp',
  '/assets/ui/spudnaut/design/moon.webp',
  StationMapUrls.tiles,
  StationMapUrls.floorPlan,
  StationMapUrls.objectsSheet,
];

let gamePrewarmScheduled = false;
let surfacePrewarmScheduled = false;

export function shouldPrewarmAssets(saveData: boolean, touchDevice: boolean): boolean {
  return !saveData && !touchDevice;
}

function canPrewarmAssets(): boolean {
  const nav = navigator as Navigator & { connection?: NetworkInformationLike };
  return shouldPrewarmAssets(Boolean(nav.connection?.saveData), detectTouchControls());
}

function scheduleWhenIdle(task: () => void, timeoutMs: number): void {
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(task, { timeout: timeoutMs });
  } else {
    window.setTimeout(task, Math.min(timeoutMs, 650));
  }
}

export function scheduleIdlePrewarm(): void {
  if (gamePrewarmScheduled || !canPrewarmAssets()) return;
  gamePrewarmScheduled = true;

  scheduleWhenIdle(() => {
    void import('../game').catch((error: unknown) => {
      console.warn('Idle Phaser prewarm failed; the game will load when requested.', error);
    });
  }, 1800);
}

export function scheduleSurfacePrewarm(): void {
  scheduleIdlePrewarm();
  if (surfacePrewarmScheduled || !canPrewarmAssets()) return;
  surfacePrewarmScheduled = true;

  scheduleWhenIdle(() => {
    for (const url of PREWARM_URLS) {
      if (typeof fetch !== 'function') return;
      void fetch(url, { priority: 'low' } as RequestInit).catch((error: unknown) => {
        console.warn(`Optional surface prewarm failed for ${url}.`, error);
      });
    }
  }, 1200);
}
