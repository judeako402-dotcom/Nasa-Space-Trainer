import type { MapDefinition, MapRoom } from '../data/mapTypes';
import type { Vec2 } from './movement';
export interface Segment {
    ax: number;
    ay: number;
    bx: number;
    by: number;
}
export declare class MapGeometry {
    readonly map: MapDefinition;
    readonly cols: number;
    readonly rows: number;
    readonly cell: number;
    private readonly bounds;
    private readonly props;
    private readonly walkGrid;
    private readonly visionGrid;
    readonly occluders: Segment[];
    constructor(map: MapDefinition, halfWidth?: number, halfHeight?: number, cell?: number);
    isFloor(x: number, y: number): boolean;
    inSolidProp(x: number, y: number): boolean;
    canStand(x: number, y: number, halfWidth?: number, halfHeight?: number): boolean;
    roomAt(x: number, y: number): MapRoom | undefined;
    isGridWalkable(col: number, row: number): boolean;
    private isVisionWalkable;
    cellCenter(col: number, row: number): Vec2;
    private nearestCell;
    findPath(from: Vec2, to: Vec2): Vec2[];
    seamSegments(): Segment[];
    private buildOccluders;
}
