import { describe, expect, it } from 'vitest';
import { findNearestInteractable } from '../src/game/utils/interaction';
import { roomAt } from '../src/game/world/Room';

interface Item {
  position: { x: number; y: number };
  interactionRadius: number;
  enabled: boolean;
  name: string;
}

function item(name: string, x: number, y: number, enabled = true): Item {
  return { name, position: { x, y }, interactionRadius: 96, enabled };
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

  it('excludes items exactly at the radius edge boundary plus epsilon', () => {
    const items = [item('edge', 96.5, 0)];
    expect(findNearestInteractable({ x: 0, y: 0 }, items)).toBeNull();
  });

  it('includes items inside the radius', () => {
    const items = [item('inside', 95, 0)];
    expect(findNearestInteractable({ x: 0, y: 0 }, items)?.name).toBe('inside');
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
