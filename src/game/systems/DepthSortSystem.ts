import { DEPTH_FLOOR, DEPTH_OVERHEAD, DEPTH_WALL } from '../constants';

interface Sortable {
  setDepth(depth: number): unknown;
}

interface SortEntry {
  obj: Sortable;
  getDepthY: () => number;
}

/**
 * Fixed-depth layers plus dynamic Y-sorting so entities, props, and consoles
 * sort naturally behind or in front of each other.
 */
export class DepthSortSystem {
  private readonly entries: SortEntry[] = [];

  register(obj: Sortable, getDepthY: () => number): void {
    this.entries.push({ obj, getDepthY });
  }

  unregister(obj: Sortable): void {
    const idx = this.entries.findIndex((e) => e.obj === obj);
    if (idx >= 0) {
      this.entries.splice(idx, 1);
    }
  }

  clear(): void {
    this.entries.length = 0;
  }

  update(): void {
    for (const entry of this.entries) {
      entry.obj.setDepth(entry.getDepthY());
    }
  }

  static depthForY(y: number): number {
    return y;
  }

  static readonly FLOOR = DEPTH_FLOOR;
  static readonly WALL = DEPTH_WALL;
  static readonly OVERHEAD = DEPTH_OVERHEAD;
}

