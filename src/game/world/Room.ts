/** Room region definition and containment check. Pure logic. */

import type { Vec2 } from '../utils/vectors';

export interface Room {
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
}

/** True when a point lies inside the room bounds (inclusive of edges). */
export function roomContains(room: Room, point: Vec2): boolean {
  const { x, y, width, height } = room.bounds;
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
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

