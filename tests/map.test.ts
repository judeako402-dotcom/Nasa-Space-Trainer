import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYER_FEET } from '../src/game/constants';
import { findPath, gridFromTiles, hasTileClearance, tileAtPixel, type Tile } from '../src/game/utils/pathing';
import {
  FIGMA_DESIGN_SIZE,
  FIGMA_LAYER_TEXTURES,
  TASK_OBJECT_OUTLINE_SPECS,
} from '../src/game/world/figmaMapLayers';
import { PLAYER_SPAWN, TASKS } from '../src/model';

/**
 * Validates the generated station map (traced from Sample mapppp.png) against
 * the foundation's layer contract and proves every room is walkable from the
 * spawn point (BFS over the walls layer).
 */

interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  polygon?: { x: number; y: number }[];
  properties?: { name: string; type: string; value: string | number | boolean }[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: {
    name: string;
    type: string;
    data?: number[];
    objects?: TiledObject[];
  }[];
  tilesets: { columns: number; tilecount: number; firstgid: number }[];
}

const map = JSON.parse(
  readFileSync('public/assets/maps/spudnaut-station.tmj', 'utf8'),
) as TiledMap;

const layer = (name: string) => {
  const l = map.layers.find((x) => x.name === name);
  if (!l) throw new Error(`missing layer "${name}"`);
  return l;
};

const walls = layer('walls').data ?? [];
const floor = layer('floor').data ?? [];
const blocked = walls.map((g) => (g === 0 ? 0 : 1));
const grid = gridFromTiles(map.width, map.height, blocked);

const prop = (obj: TiledObject, name: string): string | undefined =>
  obj.properties?.find((p) => p.name === name)?.value as string | undefined;

const spawnObj = layer('objects').objects?.filter((o) => o.type === 'SpawnPoint') ?? [];
const roomObjs = layer('objects').objects?.filter((o) => o.type === 'Room') ?? [];
const taskObjs = layer('objects').objects?.filter((o) => o.type === 'TaskStation') ?? [];
const ventObjs = layer('objects').objects?.filter((o) => o.type === 'Vent') ?? [];

const spawn = spawnObj[0];
const spawnTile = spawn ? tileAtPixel({ x: spawn.x, y: spawn.y }, map.tilewidth) : null;

/** First walkable tile in an outward spiral around `t` (room centers can sit on furniture). */
function nearestWalkable(t: Tile): Tile | null {
  if (!grid.isBlocked(t.x, t.y)) return t;
  for (let radius = 1; radius < Math.max(map.width, map.height); radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (!grid.isBlocked(t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy };
      }
    }
  }
  return null;
}

const centerOf = (obj: TiledObject): Tile =>
  tileAtPixel({ x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 }, map.tilewidth);

describe('station map structure', () => {
  it('keeps depth artwork separate from floor and collision tiles', () => {
    expect(map.layers.map((l) => l.name).sort()).toEqual([
      'depth-artwork',
      'floor',
      'objects',
      'overhead',
      'walls',
    ]);
    const artwork = layer('depth-artwork').objects ?? [];
    expect(artwork.map(object => object.name)).toContain('Cargo command terminal');
    expect(artwork.some(object => object.name.startsWith('Wall '))).toBe(true);
    for (const object of artwork) {
      expect(object.type).toBe('DepthArtwork');
      expect(object.polygon?.length, object.name).toBeGreaterThanOrEqual(4);
      expect(object.properties?.find(property => property.name === 'depth')?.value, object.name).toEqual(expect.any(Number));
    }
  });

  it('uses 32px collision tiles covering the 2048x2048 artwork', () => {
    expect(map.tilewidth).toBe(32);
    expect(map.tileheight).toBe(32);
    expect(map.width * map.tilewidth).toBe(2048);
    expect(map.height * map.tileheight).toBe(2048);
  });

  it('declares a single tileset with 2 tiles (1-based gids)', () => {
    expect(map.tilesets).toHaveLength(1);
    expect(map.tilesets[0].firstgid).toBe(1);
    expect(map.tilesets[0].columns).toBe(2);
    expect(map.tilesets[0].tilecount).toBe(2);
  });

  it('has exactly one spawn point', () => {
    expect(spawnObj).toHaveLength(1);
    expect(spawn?.point).toBe(true);
  });

  it('defines the eight rooms of the sample map', () => {
    const names = roomObjs.map((r) => prop(r, 'name') ?? r.name);
    expect(names.sort()).toEqual([
      'Cargo Bay',
      'Central Hub',
      'Comms Dome',
      'Crew Quarters',
      'Hydroponics Bay',
      'Landing Pad',
      'Med Lab',
      'Reactor Dome',
    ]);
    for (const r of roomObjs) {
      expect(r.x, `${r.name} x`).toBeGreaterThanOrEqual(0);
      expect(r.y, `${r.name} y`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width, `${r.name} right`).toBeLessThanOrEqual(map.width * map.tilewidth);
      expect(r.y + r.height, `${r.name} bottom`).toBeLessThanOrEqual(map.height * map.tileheight);
    }
  });

  it('retains task interaction anchors and removes vent objects', () => {
    expect(taskObjs).toHaveLength(3);
    expect(ventObjs).toHaveLength(0);
    for (const t of taskObjs) {
      expect(prop(t, 'promptText'), t.name).toBeTruthy();
    }
  });
});

describe('station map collision', () => {
  const fits = (x: number, y: number): boolean =>
    hasTileClearance(grid, map.tilewidth, { x, y }, PLAYER_FEET.width, PLAYER_FEET.height);

  it('fits the full player collider along the illustrated doorways', () => {
    for (const [from, to, y] of [[1120, 1344, 928], [608, 768, 1408]]) {
      for (let x = from; x <= to; x += 4) {
        expect(fits(x, y), `doorway blocked at ${x}, ${y}`).toBe(true);
      }
    }
    expect(fits(PLAYER_SPAWN.x, PLAYER_SPAWN.y + PLAYER_FEET.offsetY)).toBe(true);
  });

  it('blocks the walls beside doors and solid cargo props', () => {
    for (const [x, y] of [[1232, 800], [690, 1300], [1860, 860], [1680, 770], [1890, 1060]]) {
      expect(fits(x, y), `collider fits inside a wall or prop at ${x}, ${y}`).toBe(false);
    }
    expect(fits(1600, 940)).toBe(true);
  });

  it('blocks reactor, comms, and airlock perimeter silhouettes while keeping doorways and tasks clear', () => {
    for (const [x, y] of [
      [624, 272],
      [656, 304],
      [912, 368],
      [1360, 272],
      [1360, 336],
      [1424, 304],
      [1552, 336],
      [1488, 336],
      [1856, 288],
      [1776, 1360],
      [1552, 1360],
      [1552, 1456],
      [1808, 848],
    ]) {
      expect(fits(x, y), `collider overlaps prop perimeter at ${x}, ${y}`).toBe(false);
    }
    for (const [x, y] of [
      [1360, 368],
      [1792, 384],
      [1808, 752],
      [608, 784],
      [1104, 400],
      [1664, 1360],
    ]) {
      expect(fits(x, y), `walkable task or doorway blocked at ${x}, ${y}`).toBe(true);
    }
  });

  it('keeps the spawn tile walkable', () => {
    expect(spawnTile).not.toBeNull();
    expect(grid.isBlocked(spawnTile!.x, spawnTile!.y)).toBe(false);
  });

  it('gives every walkable tile a floor tile (no visual holes)', () => {
    for (let i = 0; i < blocked.length; i++) {
      if (blocked[i] === 0) {
        expect(floor[i], `floor missing at index ${i}`).not.toBe(0);
      }
    }
  });

  it('marks every blocked tile in the walls layer', () => {
    for (let i = 0; i < blocked.length; i++) {
      if (floor[i] !== 0) {
        expect(walls[i], `wall missing at walkable index ${i}`).toBe(0);
      }
    }
  });
});

describe('station map traversability', () => {
  it('reaches every room from the spawn point (all rooms travelable)', () => {
    expect(spawnTile).not.toBeNull();
    for (const r of roomObjs) {
      const name = prop(r, 'name') ?? r.name;
      const target = nearestWalkable(
        tileAtPixel({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, map.tilewidth),
      );
      expect(target, `room "${name}" has no walkable tile`).not.toBeNull();
      const path = findPath(grid, spawnTile!, target!);
      expect(path, `no path from spawn to room "${name}"`).not.toBeNull();
      // The hub room's center may resolve to the spawn tile itself (length 1);
      // every other room must need at least one step.
      expect(path!.length).toBeGreaterThan(0);
    }
  });

  it('reaches every task console and vent from the spawn point', () => {
    expect(spawnTile).not.toBeNull();
    for (const obj of [...taskObjs, ...ventObjs]) {
      const center = centerOf(obj);
      expect(grid.isBlocked(center.x, center.y), `${obj.name} in an obstacle`).toBe(false);
      expect(
        findPath(grid, spawnTile!, center),
        `no path from spawn to ${obj.name}`,
      ).not.toBeNull();
    }
  });

  it('keeps every room reachable from every other room', () => {
    expect(spawnTile).not.toBeNull();
    const targets = roomObjs.map((r) =>
      nearestWalkable(
        tileAtPixel({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, map.tilewidth),
      ),
    );
    for (const t of targets) {
      expect(t).not.toBeNull();
      expect(findPath(grid, targets[0]!, t!)).not.toBeNull();
    }
  });

  it('keeps at least 98% of walkable tiles in one connected component', () => {
    expect(spawnTile).not.toBeNull();
    const seen = new Uint8Array(map.width * map.height);
    const startIdx = spawnTile!.y * map.width + spawnTile!.x;
    seen[startIdx] = 1;
    const queue = [startIdx];
    const dirs = [1, 0, -1, 0, 1];
    while (queue.length) {
      const cur = queue.pop()!;
      const cx = cur % map.width;
      const cy = (cur / map.width) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + dirs[d];
        const ny = cy + dirs[d + 1];
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const ni = ny * map.width + nx;
        if (seen[ni] || blocked[ni]) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
    let total = 0;
    let reached = 0;
    for (let i = 0; i < blocked.length; i++) {
      if (!blocked[i]) {
        total++;
        if (seen[i]) reached++;
      }
    }
    expect(reached / total).toBeGreaterThanOrEqual(0.98);
  });

  it('places PLAYER_SPAWN and every mission task in TASKS on a reachable walkable tile', () => {
    const modelSpawnTile = tileAtPixel(PLAYER_SPAWN, map.tilewidth);
    expect(modelSpawnTile).not.toBeNull();
    expect(grid.isBlocked(modelSpawnTile!.x, modelSpawnTile!.y)).toBe(false);

    for (const task of TASKS) {
      const taskTile = tileAtPixel({ x: task.x, y: task.y }, map.tilewidth);
      expect(taskTile, `invalid tile for task ${task.id}`).not.toBeNull();
      expect(
        grid.isBlocked(taskTile!.x, taskTile!.y),
        `task ${task.id} (${task.x}, ${task.y}) is on a blocked tile`,
      ).toBe(false);
      expect(
        findPath(grid, modelSpawnTile!, taskTile!),
        `task ${task.id} unreachable from PLAYER_SPAWN`,
      ).not.toBeNull();
    }
  });

  it('defines valid layer outline specs for every mission task in TASKS', () => {
    expect(Object.keys(TASK_OBJECT_OUTLINE_SPECS).sort()).toEqual(
      TASKS.map((t) => t.id).sort(),
    );

    for (const task of TASKS) {
      const spec = TASK_OBJECT_OUTLINE_SPECS[task.id];
      expect(spec, `missing outline spec for task ${task.id}`).toBeDefined();
      expect(spec.w).toBeGreaterThan(0);
      expect(spec.h).toBeGreaterThan(0);
      expect(spec.x).toBeGreaterThanOrEqual(0);
      expect(spec.y).toBeGreaterThanOrEqual(0);
      expect(spec.x + spec.w).toBeLessThanOrEqual(FIGMA_DESIGN_SIZE);
      expect(spec.y + spec.h).toBeLessThanOrEqual(FIGMA_DESIGN_SIZE);
      expect(spec.footY).toBeGreaterThan(0);

      if (spec.source !== 'floor' && spec.source !== 'objects') {
        const layer = FIGMA_LAYER_TEXTURES[spec.source];
        expect(layer, `invalid layer source ${spec.source} for task ${task.id}`).toBeDefined();
        expect(existsSync(`public${layer.path}`), `missing asset ${layer.path}`).toBe(true);
      }
    }
  });
});
