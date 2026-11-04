import type { MapDefinition } from './mapTypes';
import type { DestinationId } from '../model';
export declare const SURFACE_HABITAT: MapDefinition;
/** Apply destination-specific art direction while keeping task/save IDs stable. */
export declare function surfaceHabitatFor(destination: DestinationId): MapDefinition;
