/** Pure nearest-interactable selection. No Phaser dependency. */

import { distanceSq } from './vectors';
import type { Vec2 } from './vectors';

export interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InteractableLike {
  position: Vec2;
  bounds?: RectBounds;
  interactionRadius: number;
  enabled: boolean;
}

/**
 * Compute the squared Euclidean distance from subjectPos to the nearest point
 * between the interactable's anchor position and its optional bounding rectangle.
 */
export function distanceToInteractableSq(
  subjectPos: Vec2,
  item: Pick<InteractableLike, 'position' | 'bounds'>,
): number {
  const posDistSq = distanceSq(subjectPos, item.position);
  if (!item.bounds) {
    return posDistSq;
  }
  const dx = Math.max(
    item.bounds.x - subjectPos.x,
    0,
    subjectPos.x - (item.bounds.x + item.bounds.width),
  );
  const dy = Math.max(
    item.bounds.y - subjectPos.y,
    0,
    subjectPos.y - (item.bounds.y + item.bounds.height),
  );
  return Math.min(posDistSq, dx * dx + dy * dy);
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
    const d = distanceToInteractableSq(subjectPos, item);
    if (d <= item.interactionRadius * item.interactionRadius && d < bestDist) {
      best = item;
      bestDist = d;
    }
  }

  return best;
}

