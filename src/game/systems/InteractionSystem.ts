import type { Interactable } from '../entities/Interactable';
import { findNearestInteractable } from '../utils/interaction';
import type { Vec2 } from '../utils/vectors';

export interface InteractionState {
  nearest: Interactable | null;
  promptText: string | null;
}

/**
 * Tracks registered station interactables, selects and highlights the nearest
 * enabled candidate each frame, and notifies listeners on changes.
 */
export class InteractionSystem {
  private readonly items: Interactable[] = [];
  private nearest: Interactable | null = null;
  private onNearestChange: ((item: Interactable | null) => void) | null = null;

  register(item: Interactable): void {
    if (!this.items.includes(item)) {
      this.items.push(item);
    }
  }

  unregister(item: Interactable): void {
    const idx = this.items.indexOf(item);
    if (idx >= 0) {
      this.items.splice(idx, 1);
    }
    if (this.nearest === item) {
      item.setHighlighted(false);
      this.nearest = null;
      this.onNearestChange?.(null);
    }
  }

  clear(): void {
    for (const item of this.items) {
      item.setHighlighted(false);
    }
    this.items.length = 0;
    if (this.nearest) {
      this.nearest = null;
      this.onNearestChange?.(null);
    }
  }

  onSelectionChanged(cb: (item: Interactable | null) => void): void {
    this.onNearestChange = cb;
  }

  update(subjectPos: Vec2): InteractionState {
    const found = findNearestInteractable(subjectPos, this.items);

    if (found !== this.nearest) {
      this.nearest?.setHighlighted(false);
      found?.setHighlighted(true);
      this.nearest = found;
      this.onNearestChange?.(found);
    }

    return { nearest: this.nearest, promptText: this.nearest?.promptText ?? null };
  }

  interact(): Interactable | null {
    if (!this.nearest || !this.nearest.enabled) {
      return null;
    }
    const target = this.nearest;
    target.onInteract();
    return target;
  }

  getNearest(): Interactable | null {
    return this.nearest;
  }
}

