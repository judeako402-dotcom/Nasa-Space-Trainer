import type { MapDefinition, MapRoom, PropDef } from '../data/mapTypes';
import type { Vec2 } from './movement';

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export class MapGeometry {
  readonly map: MapDefinition;
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  private readonly bounds: { x: number; y: number; w: number; h: number }[];
  private readonly props: PropDef[];
  private readonly walkGrid: Uint8Array;
  private readonly visionGrid: Uint8Array;
  readonly occluders: Segment[];

  constructor(map: MapDefinition, halfWidth = 13, halfHeight = 17, cell = 50) {
    this.map = map;
    this.cell = cell;
    this.cols = Math.ceil(map.width / cell);
    this.rows = Math.ceil(map.height / cell);
    this.bounds = [...map.rooms, ...map.corridors];
    this.props = map.props.filter(prop => prop.solid);
    this.walkGrid = new Uint8Array(this.cols * this.rows);
    this.visionGrid = new Uint8Array(this.cols * this.rows);

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const x = col * cell + cell / 2;
        const y = row * cell + cell / 2;
        this.visionGrid[row * this.cols + col] = this.isFloor(x, y) && !this.inSolidProp(x, y) ? 1 : 0;
        this.walkGrid[row * this.cols + col] = this.canStand(x, y, halfWidth, halfHeight) ? 1 : 0;
      }
    }
    this.occluders = this.buildOccluders();
  }

  isFloor(x: number, y: number): boolean {
    return this.bounds.some(bound => x >= bound.x && x <= bound.x + bound.w && y >= bound.y && y <= bound.y + bound.h);
  }

  inSolidProp(x: number, y: number): boolean {
    return this.props.some(prop => x >= prop.x && x <= prop.x + prop.w && y >= prop.y && y <= prop.y + prop.h);
  }

  /* A body may stand here when its whole AABB is inside the floor and outside
     solid props. Testing corners plus edge midpoints is enough for rectangles. */
  canStand(x: number, y: number, halfWidth = 13, halfHeight = 17): boolean {
    const points: [number, number][] = [
      [x - halfWidth, y - halfHeight],
      [x + halfWidth, y - halfHeight],
      [x - halfWidth, y + halfHeight],
      [x + halfWidth, y + halfHeight],
      [x, y - halfHeight],
      [x, y + halfHeight],
      [x - halfWidth, y],
      [x + halfWidth, y],
      [x, y],
    ];
    return points.every(([px, py]) => this.isFloor(px, py) && !this.inSolidProp(px, py));
  }

  roomAt(x: number, y: number): MapRoom | undefined {
    return this.map.rooms.find(room => x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h);
  }

  isGridWalkable(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    return this.walkGrid[row * this.cols + col] === 1;
  }

  private isVisionWalkable(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    return this.visionGrid[row * this.cols + col] === 1;
  }

  cellCenter(col: number, row: number): Vec2 {
    return { x: col * this.cell + this.cell / 2, y: row * this.cell + this.cell / 2 };
  }

  private nearestCell(col: number, row: number): { col: number; row: number } | null {
    if (this.isGridWalkable(col, row)) return { col, row };
    for (let radius = 1; radius <= 8; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          if (this.isGridWalkable(col + dx, row + dy)) return { col: col + dx, row: row + dy };
        }
      }
    }
    return null;
  }

  /* Breadth-first path over the clearance grid. The map is small, so this is
     cheaper and easier to reason about than a full A* implementation. */
  findPath(from: Vec2, to: Vec2): Vec2[] {
    const start = this.nearestCell(
      Math.max(0, Math.min(this.cols - 1, Math.floor(from.x / this.cell))),
      Math.max(0, Math.min(this.rows - 1, Math.floor(from.y / this.cell))),
    );
    const goal = this.nearestCell(
      Math.max(0, Math.min(this.cols - 1, Math.floor(to.x / this.cell))),
      Math.max(0, Math.min(this.rows - 1, Math.floor(to.y / this.cell))),
    );
    if (!start || !goal) return [];

    const startIndex = start.row * this.cols + start.col;
    const goalIndex = goal.row * this.cols + goal.col;
    const parents = new Int32Array(this.cols * this.rows).fill(-1);
    const queue = new Int32Array(this.cols * this.rows);
    let head = 0;
    let tail = 0;
    parents[startIndex] = startIndex;
    queue[tail++] = startIndex;

    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < tail && parents[goalIndex] === -1) {
      const current = queue[head++]!;
      const col = current % this.cols;
      const row = Math.floor(current / this.cols);
      for (const [dx, dy] of steps) {
        const nextCol = col + dx!;
        const nextRow = row + dy!;
        if (!this.isGridWalkable(nextCol, nextRow)) continue;
        const nextIndex = nextRow * this.cols + nextCol;
        if (parents[nextIndex] !== -1) continue;
        parents[nextIndex] = current;
        queue[tail++] = nextIndex;
      }
    }
    if (parents[goalIndex] === -1) return [];

    const path: Vec2[] = [];
    for (let index = goalIndex; index !== startIndex; index = parents[index]!) {
      if (index === -1) return [];
      path.push(this.cellCenter(index % this.cols, Math.floor(index / this.cols)));
    }
    path.reverse();

    // Finish on the exact click point when it is clear.
    if (this.canStand(to.x, to.y)) path.push({ x: to.x, y: to.y });
    else if (path.length) path.push(path[path.length - 1]!);
    return path;
  }

  seamSegments(): Segment[] {
    return this.occluders;
  }

  private buildOccluders(): Segment[] {
    const segments: Segment[] = [];
    const seen = new Set<string>();
    const add = (ax: number, ay: number, bx: number, by: number): void => {
      const key = `${ax},${ay},${bx},${by}`;
      const reverse = `${bx},${by},${ax},${ay}`;
      if (seen.has(key) || seen.has(reverse)) return;
      seen.add(key);
      segments.push({ ax, ay, bx, by });
    };
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        if (!this.isVisionWalkable(col, row)) continue;
        const x = col * this.cell;
        const y = row * this.cell;
        const size = this.cell;
        if (!this.isVisionWalkable(col + 1, row)) add(x + size, y, x + size, y + size);
        if (!this.isVisionWalkable(col - 1, row)) add(x, y, x, y + size);
        if (!this.isVisionWalkable(col, row + 1)) add(x, y + size, x + size, y + size);
        if (!this.isVisionWalkable(col, row - 1)) add(x, y, x + size, y);
      }
    }
    return segments;
  }
}
