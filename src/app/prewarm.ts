/**
 * Idle background pre-warming for Phaser bundle & surface assets.
 * Runs silently during Menu / Story / Exam so Training Deck and Launch
 * transitions feel instant without blocking first paint or honoring Data Saver.
 */

import { StationMapUrls } from '../game/assets/AssetKeys';

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

function hasSaveDataPreference(): boolean {
  const nav = navigator as Navigator & { connection?: NetworkInformationLike };
  return Boolean(nav.connection?.saveData);
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
  if (gamePrewarmScheduled || hasSaveDataPreference()) return;
  gamePrewarmScheduled = true;

  scheduleWhenIdle(() => {
    void import('../game').catch(() => {});
  }, 1800);
}

export function scheduleSurfacePrewarm(): void {
  scheduleIdlePrewarm();
  if (surfacePrewarmScheduled || hasSaveDataPreference()) return;
  surfacePrewarmScheduled = true;

  scheduleWhenIdle(() => {
    for (const url of PREWARM_URLS) {
      if (typeof fetch === 'function') {
        void fetch(url, { priority: 'low' } as RequestInit).catch(() => {});
      }
    }
  }, 1200);
}
