/** Pure grid pathfinding (BFS, 4-directional). No Phaser dependency. */

export interface Tile {
  x: number;
  y: number;
}

/** Walkable grid abstraction over a tile matrix. */
export interface WalkableGrid {
  cols: number;
  rows: number;
  /** True when the tile blocks movement (wall / out-of-layout). */
  isBlocked(col: number, row: number): boolean;
}

/** Build a WalkableGrid from a flat row-major tile array (Tiled order). */
export function gridFromTiles(
  cols: number,
  rows: number,
  blocked: ArrayLike<number>,
): WalkableGrid {
  return {
    cols,
    rows,
    isBlocked(col, row) {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return true;
      return blocked[row * cols + col] !== 0;
    },
  };
}

/** Convert a world-pixel position to its tile coordinate. */
export function tileAtPixel(pos: { x: number; y: number }, tileSize: number): Tile {
  return { x: Math.floor(pos.x / tileSize), y: Math.floor(pos.y / tileSize) };
}

/** Test the full collision rectangle against every tile it overlaps. */
export function hasTileClearance(
  grid: WalkableGrid, tileSize: number, center: Tile, width: number, height: number,
): boolean {
  const left = Math.floor((center.x - width / 2) / tileSize);
  const right = Math.ceil((center.x + width / 2) / tileSize);
  const top = Math.floor((center.y - height / 2) / tileSize);
  const bottom = Math.ceil((center.y + height / 2) / tileSize);
  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      if (grid.isBlocked(col, row)) return false;
    }
  }
  return true;
}

function inBounds(grid: WalkableGrid, t: Tile): boolean {
  return t.x >= 0 && t.y >= 0 && t.x < grid.cols && t.y < grid.rows;
}

/**
 * Breadth-first search over walkable tiles. Returns the path from `start`
 * to `goal` inclusive (4-connected, fewest steps), or null when unreachable.
 */
export function findPath(grid: WalkableGrid, start: Tile, goal: Tile): Tile[] | null {
  if (!inBounds(grid, start) || !inBounds(grid, goal)) return null;
  if (grid.isBlocked(start.x, start.y) || grid.isBlocked(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ ...start }];

  const total = grid.cols * grid.rows;
  const prev = new Int32Array(total).fill(-1);
  const visited = new Uint8Array(total);
  const startIdx = start.y * grid.cols + start.x;
  const goalIdx = goal.y * grid.cols + goal.x;
  visited[startIdx] = 1;

  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIdx;

  const dirs = [1, 0, -1, 0, 1];

  while (head < tail) {
    const cur = queue[head++];
    if (cur === goalIdx) break;
    const cx = cur % grid.cols;
    const cy = (cur / grid.cols) | 0;

    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d];
      const ny = cy + dirs[d + 1];
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
      const ni = ny * grid.cols + nx;
      if (visited[ni]) continue;
      if (grid.isBlocked(nx, ny)) continue;
      visited[ni] = 1;
      prev[ni] = cur;
      queue[tail++] = ni;
    }
  }

  if (!visited[goalIdx]) return null;

  const path: Tile[] = [];
  for (let at = goalIdx; at !== -1; at = prev[at]) {
    path.push({ x: at % grid.cols, y: (at / grid.cols) | 0 });
    if (at === startIdx) break;
  }
  path.reverse();
  return path;
}

/** Drop intermediate collinear tiles, keeping direction turns and endpoints. */
export function compressPath(path: readonly Tile[]): Tile[] {
  if (path.length <= 2) return path.map((t) => ({ ...t }));
  const out: Tile[] = [{ ...path[0] }];
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1];
    const b = path[i];
    const c = path[i + 1];
    const dirInX = Math.sign(b.x - a.x);
    const dirInY = Math.sign(b.y - a.y);
    const dirOutX = Math.sign(c.x - b.x);
    const dirOutY = Math.sign(c.y - b.y);
    if (dirInX !== dirOutX || dirInY !== dirOutY) {
      out.push({ ...b });
    }
  }
  out.push({ ...path[path.length - 1] });
  return out;
}

