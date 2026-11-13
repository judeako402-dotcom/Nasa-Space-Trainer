import { describe, expect, it } from 'vitest';
import {
  compressPath,
  findPath,
  gridFromTiles,
  tileAtPixel,
  type Tile,
  type WalkableGrid,
} from '../src/game/utils/pathing';

/** 5x5 open grid with a vertical wall at col 2 (gap at row 4). */
function wallGrid(): WalkableGrid {
  const cols = 5;
  const rows = 5;
  const blocked: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      blocked.push(c === 2 && r !== 4 ? 1 : 0);
    }
  }
  return gridFromTiles(cols, rows, blocked);
}

const at = (x: number, y: number): Tile => ({ x, y });

describe('tileAtPixel', () => {
  it('maps pixels to the containing tile', () => {
    expect(tileAtPixel({ x: 0, y: 0 }, 64)).toEqual({ x: 0, y: 0 });
    expect(tileAtPixel({ x: 63, y: 63 }, 64)).toEqual({ x: 0, y: 0 });
    expect(tileAtPixel({ x: 64, y: 128 }, 64)).toEqual({ x: 1, y: 2 });
    expect(tileAtPixel({ x: 127.9, y: 64.1 }, 64)).toEqual({ x: 1, y: 1 });
  });
});

describe('findPath', () => {
  it('returns a single-tile path when start equals goal', () => {
    expect(findPath(wallGrid(), at(0, 0), at(0, 0))).toEqual([at(0, 0)]);
  });

  it('finds a straight path on open ground', () => {
    const open = gridFromTiles(5, 5, new Array(25).fill(0));
    const path = findPath(open, at(0, 0), at(4, 0));
    expect(path).not.toBeNull();
    expect(path).toHaveLength(5);
    expect(path?.[0]).toEqual(at(0, 0));
    expect(path?.[4]).toEqual(at(4, 0));
  });

  it('routes around a wall through the gap', () => {
    const path = findPath(wallGrid(), at(0, 0), at(4, 0));
    expect(path).not.toBeNull();
    // Must pass through the gap at (2, 4).
    expect(path?.some((t) => t.x === 2 && t.y === 4)).toBe(true);
    // Every step is 4-connected and walkable.
    for (let i = 1; i < (path?.length ?? 0); i++) {
      const a = path![i - 1];
      const b = path![i];
      expect(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)).toBe(1);
    }
  });

  it('returns null when the goal is unreachable', () => {
    const sealed = gridFromTiles(3, 1, [0, 1, 0]);
    expect(findPath(sealed, at(0, 0), at(2, 0))).toBeNull();
  });

  it('returns null for blocked or out-of-bounds endpoints', () => {
    const grid = wallGrid();
    expect(findPath(grid, at(2, 0), at(0, 0))).toBeNull(); // start in wall
    expect(findPath(grid, at(0, 0), at(2, 0))).toBeNull(); // goal in wall
    expect(findPath(grid, at(-1, 0), at(0, 0))).toBeNull();
    expect(findPath(grid, at(0, 0), at(9, 9))).toBeNull();
  });

  it('is deterministic (same input, same path)', () => {
    const a = findPath(wallGrid(), at(0, 0), at(4, 0));
    const b = findPath(wallGrid(), at(0, 0), at(4, 0));
    expect(a).toEqual(b);
  });
});

describe('compressPath', () => {
  it('keeps endpoints and direction changes only', () => {
    const path: Tile[] = [
      at(0, 0),
      at(1, 0),
      at(2, 0),
      at(2, 1),
      at(2, 2),
      at(3, 2),
    ];
    expect(compressPath(path)).toEqual([at(0, 0), at(2, 0), at(2, 2), at(3, 2)]);
  });

  it('passes short paths through unchanged', () => {
    expect(compressPath([at(1, 1)])).toEqual([at(1, 1)]);
    expect(compressPath([at(1, 1), at(2, 1)])).toEqual([at(1, 1), at(2, 1)]);
  });
});
