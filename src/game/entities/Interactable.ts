import type { RectBounds } from '../utils/interaction';
import type { Vec2 } from '../utils/vectors';

/**
 * Generic interactable contract registered with InteractionSystem and selected
 * by nearest-distance each frame.
 */
export interface Interactable {
  readonly id?: string;
  readonly kind?: 'task' | 'crew';
  readonly roomName?: string;
  position: Vec2;
  bounds?: RectBounds;
  interactionRadius: number;
  promptText: string;
  enabled: boolean;
  onInteract(): void;
  setHighlighted(highlighted: boolean): void;
}

