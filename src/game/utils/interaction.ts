/** Pure nearest-interactable selection. No Phaser dependency. */

import { distanceSq } from './vectors';
import type { Vec2 } from './vectors';

export interface InteractableLike {
  position: Vec2;
  interactionRadius: number;
  enabled: boolean;
}

/**
 * Find the nearest enabled interactable within its radius of the subject.
 * Uses squared distances to avoid sqrt. Returns null when nothing qualifies.
 */
export function findNearestInteractable<T extends InteractableLike>(
  subjectPos: Vec2,
  items: readonly T[],
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;

  for (const item of items) {
    if (!item.enabled) {
      continue;
    }
    const d = distanceSq(subjectPos, item.position);
    if (d <= item.interactionRadius * item.interactionRadius && d < bestDist) {
      best = item;
      bestDist = d;
    }
  }

  return best;
}

