import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import { extractAlphaOutlineMask, TaskStation } from '../src/game/entities/TaskStation';
import { findNearestInteractable, type RectBounds } from '../src/game/utils/interaction';
import { roomAt } from '../src/game/world/Room';

interface Item {
  position: { x: number; y: number };
  bounds?: RectBounds;
  interactionRadius: number;
  enabled: boolean;
  name: string;
}

function item(name: string, x: number, y: number, enabled = true, bounds?: RectBounds): Item {
  return { name, position: { x, y }, bounds, interactionRadius: 96, enabled };
}

describe('findNearestInteractable', () => {
  it('returns null when nothing is in range', () => {
    const items = [item('far', 1000, 1000)];
    expect(findNearestInteractable({ x: 0, y: 0 }, items)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(findNearestInteractable({ x: 0, y: 0 }, [])).toBeNull();
  });

  it('picks the nearest item among candidates', () => {
    const items = [item('a', 80, 0), item('b', 50, 0), item('c', 90, 0)];
    const nearest = findNearestInteractable({ x: 0, y: 0 }, items);
    expect(nearest?.name).toBe('b');
  });

  it('ignores disabled items', () => {
    const items = [item('disabled', 10, 0, false), item('enabled', 80, 0)];
    const nearest = findNearestInteractable({ x: 0, y: 0 }, items);
    expect(nearest?.name).toBe('enabled');
  });

  it('prefers an active repair at the airlock only within the repair radius', () => {
    const exit = item('exit', 0, 0, true, { x: -100, y: -100, width: 200, height: 200 });
    const repair = { ...item('repair', 0, 30), priority: 1, interactionRadius: 62 };
    expect(findNearestInteractable({ x: 0, y: 0 }, [exit, repair])?.name).toBe('repair');
    expect(findNearestInteractable({ x: 0, y: -40 }, [exit, repair])?.name).toBe('exit');
    expect(findNearestInteractable({ x: 0, y: 0 }, [exit, { ...repair, enabled: false }])?.name).toBe('exit');
  });

  it('excludes items exactly at the radius edge boundary plus epsilon', () => {
    const items = [item('edge', 96.5, 0)];
    expect(findNearestInteractable({ x: 0, y: 0 }, items)).toBeNull();
  });

  it('includes items inside the radius', () => {
    const items = [item('inside', 95, 0)];
    expect(findNearestInteractable({ x: 0, y: 0 }, items)?.name).toBe('inside');
  });

  it('matches items whose bounds are within range even when anchor position is farther', () => {
    const bounds = { x: 40, y: -20, width: 120, height: 80 };
    const items = [item('prop', 300, 300, true, bounds)];
    expect(findNearestInteractable({ x: 0, y: 0 }, items)?.name).toBe('prop');
  });

  it('ignores disabled items even when player is inside their bounds', () => {
    const bounds = { x: -40, y: -40, width: 80, height: 80 };
    const items = [item('completed', 0, 0, false, bounds)];
    expect(findNearestInteractable({ x: 0, y: 0 }, items)).toBeNull();
  });
});

describe('extractAlphaOutlineMask', () => {
  it('returns an empty mask for a fully transparent buffer', () => {
    const rgba = new Uint8ClampedArray(10 * 10 * 4);
    const mask = extractAlphaOutlineMask(rgba, 10, 10, 2, 24);
    expect(mask.every((v) => v === 0)).toBe(true);
  });

  it('marks only outer pixels within radius of solid pixels and never marks interior pixels', () => {
    const w = 9;
    const h = 9;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Solid 3x3 square at x=3..5, y=3..5
    for (let y = 3; y <= 5; y++) {
      for (let x = 3; x <= 5; x++) {
        rgba[(y * w + x) * 4 + 3] = 255;
      }
    }
    const mask = extractAlphaOutlineMask(rgba, w, h, 2, 24);
    // Solid interior pixels must stay 0
    for (let y = 3; y <= 5; y++) {
      for (let x = 3; x <= 5; x++) {
        expect(mask[y * w + x]).toBe(0);
      }
    }
    // Directly adjacent ring pixel must be 1
    expect(mask[3 * w + 2]).toBe(1);
    expect(mask[1 * w + 4]).toBe(1);
    // Pixel beyond radius=2 must stay 0
    expect(mask[0 * w + 4]).toBe(0);
    expect(mask[0 * w + 0]).toBe(0);
  });
});

describe('TaskStation mission-only outline visibility', () => {
  function mockSceneAndStation(assigned: boolean, completed: boolean) {
    const visibleCalls: boolean[] = [];
    const graphicsMock = {
      clear: vi.fn(),
      setDepth: vi.fn().mockReturnThis(),
      setVisible: vi.fn((v: boolean) => {
        visibleCalls.push(v);
        return graphicsMock;
      }),
      lineStyle: vi.fn(),
      strokeRoundedRect: vi.fn(),
      destroy: vi.fn(),
    };
    const scene = {
      add: { graphics: vi.fn(() => graphicsMock) },
      textures: { exists: vi.fn(() => false) },
    } as unknown as import('phaser').Scene;
    const target = {
      depth: 100,
      getBounds: () => ({ x: 10, y: 20, width: 30, height: 40 }),
    } as unknown as import('phaser').GameObjects.Image;

    const station = new TaskStation(scene, 0, 0, 56, 64, {
      id: 'inspect',
      name: 'Analyze Regolith Sample',
      roomName: 'MedBay',
      target,
      assigned,
      completed,
    });
    return { station, graphicsMock, visibleCalls };
  }

  it('shows the outline only when assigned and not completed', () => {
    const { station, visibleCalls, graphicsMock } = mockSceneAndStation(false, false);
    expect(visibleCalls.at(-1)).toBe(false);
    expect(station.enabled).toBe(false);

    station.setState(true, false);
    expect(visibleCalls.at(-1)).toBe(true);
    expect(graphicsMock.strokeRoundedRect).toHaveBeenCalledTimes(1);
    expect(station.enabled).toBe(true);

    station.setState(true, true);
    expect(visibleCalls.at(-1)).toBe(false);
    expect(station.enabled).toBe(false);
  });
});

describe('roomAt', () => {
  const rooms = [
    { name: 'Cafeteria', bounds: { x: 0, y: 0, width: 500, height: 400 } },
    { name: 'MedBay', bounds: { x: 600, y: 0, width: 400, height: 400 } },
  ];

  it('returns the room containing the point', () => {
    expect(roomAt(rooms, { x: 100, y: 100 })).toBe('Cafeteria');
    expect(roomAt(rooms, { x: 700, y: 100 })).toBe('MedBay');
  });

  it('returns null outside every room', () => {
    expect(roomAt(rooms, { x: 550, y: 100 })).toBeNull();
  });

  it('returns the first matching room when overlapping', () => {
    const overlapping = [
      { name: 'first', bounds: { x: 0, y: 0, width: 200, height: 200 } },
      { name: 'second', bounds: { x: 0, y: 0, width: 200, height: 200 } },
    ];
    expect(roomAt(overlapping, { x: 10, y: 10 })).toBe('first');
  });
});
