/** Room region definition and containment check. Pure logic. */

import type { Vec2 } from '../utils/vectors';

export interface RoomBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Room {
  name: string;
  bounds: RoomBounds;
}

/** Shrink a bounding box uniformly without inverting width or height. */
export function insetRoomBounds(bounds: RoomBounds, paddingPx: number): RoomBounds {
  const padX = Math.min(Math.max(0, paddingPx), bounds.width / 2);
  const padY = Math.min(Math.max(0, paddingPx), bounds.height / 2);
  return {
    x: bounds.x + padX,
    y: bounds.y + padY,
    width: Math.max(0, bounds.width - padX * 2),
    height: Math.max(0, bounds.height - padY * 2),
  };
}

/** Clamp a point inside the bounding box. */
export function clampPointToBounds(point: Vec2, bounds: RoomBounds): Vec2 {
  return {
    x: Math.min(bounds.x + bounds.width, Math.max(bounds.x, point.x)),
    y: Math.min(bounds.y + bounds.height, Math.max(bounds.y, point.y)),
  };
}

/** True when a point lies inside the room bounds (inclusive of edges). */
export function roomContains(room: Room, point: Vec2): boolean {
  const { x, y, width, height } = room.bounds;
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

/** Find a named room definition (case-insensitive). */
export function findRoomByName(rooms: readonly Room[], name: string): Room | undefined {
  const target = name.trim().toLowerCase();
  return rooms.find((room) => room.name.trim().toLowerCase() === target);
}

/** Return the name of the first room containing the point, or null. */
export function roomAt(rooms: readonly Room[], point: Vec2): string | null {
  for (const room of rooms) {
    if (roomContains(room, point)) {
      return room.name;
    }
  }
  return null;
}

