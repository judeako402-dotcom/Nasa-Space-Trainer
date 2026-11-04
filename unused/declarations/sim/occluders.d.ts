import type { Segment } from './navigation';
import type { Vec2 } from './movement';
export declare function castVision(origin: Vec2, radius: number, segments: Segment[], rayCount: number): Vec2[];
