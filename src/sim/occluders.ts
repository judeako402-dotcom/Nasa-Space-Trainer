import type { Segment } from './navigation';
import type { Vec2 } from './movement';

/* Ray/segment intersection. Returns the distance along the unit ray or null. */
function rayHit(ox: number, oy: number, dx: number, dy: number, segment: Segment): number | null {
  const sx = segment.bx - segment.ax;
  const sy = segment.by - segment.ay;
  const denominator = dx * sy - dy * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const qx = segment.ax - ox;
  const qy = segment.ay - oy;
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * dy - qy * dx) / denominator;
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}

/* Cast rays evenly around the player and clip each one against the nearest wall.
   The resulting polygon is used as an inverted mask for the darkness layer. */
export function castVision(
  origin: Vec2,
  radius: number,
  segments: Segment[],
  rayCount: number,
): Vec2[] {
  const points: Vec2[] = [];
  const step = (Math.PI * 2) / rayCount;
  for (let index = 0; index < rayCount; index += 1) {
    const angle = index * step;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let nearest = radius;
    for (const segment of segments) {
      const hit = rayHit(origin.x, origin.y, dx, dy, segment);
      if (hit !== null && hit < nearest) nearest = hit;
    }
    points.push({ x: origin.x + dx * nearest, y: origin.y + dy * nearest });
  }
  return points;
}
