/**
 * Exact layer specifications ported from Figma `Station map · layered master` (node 49:2).
 *
 * Figma authors on a 2000x2000 design grid; the gameplay tilemap/world is 2048x2048
 * (64x64 tiles @ 32px), so all positions, sizes, and foot-Y depths scale by 1.024.
 */

import { AssetKeys, StationMapUrls } from '../assets/AssetKeys';

export const FIGMA_DESIGN_SIZE = 2000;
export const WORLD_MAP_SIZE = 2048;
export const FIGMA_TO_WORLD = WORLD_MAP_SIZE / FIGMA_DESIGN_SIZE; // 1.024

export type FigmaLayerSource =
  | 'floor'
  | 'objects'
  | 'walls'
  | 'core'
  | 'research'
  | 'liferoom'
  | 'liferoomTop'
  | 'hallway'
  | 'storage'
  | 'bedroom'
  | 'kitchen'
  | 'airlock';

export const FIGMA_LAYER_TEXTURES: Record<
  Exclude<FigmaLayerSource, 'floor' | 'objects'>,
  { key: string; path: string }
> = {
  walls: { key: AssetKeys.figmaLayerWalls, path: '/assets/maps/figma/layers/walls.png' },
  core: { key: AssetKeys.figmaLayerCore, path: '/assets/maps/figma/layers/core.png' },
  research: { key: AssetKeys.figmaLayerResearch, path: '/assets/maps/figma/layers/research.png' },
  liferoom: { key: AssetKeys.figmaLayerLiferoom, path: '/assets/maps/figma/layers/liferoom.png' },
  liferoomTop: { key: AssetKeys.figmaLayerLiferoomTop, path: StationMapUrls.hydroponicsCabinet },
  hallway: { key: AssetKeys.figmaLayerHallway, path: '/assets/maps/figma/layers/hallway.png' },
  storage: { key: AssetKeys.figmaLayerStorage, path: '/assets/maps/figma/layers/storage.png' },
  bedroom: { key: AssetKeys.figmaLayerBedroom, path: '/assets/maps/figma/layers/bedroom.png' },
  kitchen: { key: AssetKeys.figmaLayerKitchen, path: '/assets/maps/figma/layers/kitchen.png' },
  airlock: { key: AssetKeys.figmaLayerAirlock, path: '/assets/maps/figma/layers/airlock.png' },
};

export interface FigmaShadowSpec {
  key: string;
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FigmaSliceSpec {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  footY: number;
  /** Layer texture source for extracting this slice. */
  source: FigmaLayerSource;
}

export interface FigmaRectDetail {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 01 · Floor contact shadows — rendered at DEPTH_FLOOR + 1 below all actors. */
export const FIGMA_CONTACT_SHADOWS: readonly FigmaShadowSpec[] = [
  { key: 'shadow-reactor-vessel', path: '/assets/maps/figma/shadows/reactor-vessel.svg', x: 686.75, y: 358, w: 416.5, h: 14 },
  { key: 'shadow-co2-scrubber', path: '/assets/maps/figma/shadows/co2-scrubber.svg', x: 128.98, y: 735.6, w: 113.05, h: 13.4 },
  { key: 'shadow-hydroponic-rack', path: '/assets/maps/figma/shadows/hydroponic-rack.svg', x: 426, y: 745, w: 215, h: 12.4 },
  { key: 'shadow-twin-utility-pipes', path: '/assets/maps/figma/shadows/twin-utility-pipes.svg', x: 1021.72, y: 726.4, w: 53.55, h: 8.6 },
  { key: 'shadow-cargo-crate-stack', path: '/assets/maps/figma/shadows/cargo-crate-stack.svg', x: 1488.25, y: 775, w: 229.5, h: 14 },
  { key: 'shadow-cargo-command-terminal', path: '/assets/maps/figma/shadows/cargo-command-terminal.svg', x: 1804, y: 823, w: 80, h: 12 },
  { key: 'shadow-water-barrels', path: '/assets/maps/figma/shadows/water-barrels.svg', x: 124, y: 933, w: 124, h: 12 },
  { key: 'shadow-air-quality-panel', path: '/assets/maps/figma/shadows/air-quality-panel.svg', x: 559.05, y: 938, w: 79.9, h: 6 },
  { key: 'shadow-workshop-bench', path: '/assets/maps/figma/shadows/workshop-bench.svg', x: 1812.75, y: 1144, w: 76.5, h: 11 },
  { key: 'shadow-crew-workstation', path: '/assets/maps/figma/shadows/crew-workstation.svg', x: 164.82, y: 1149.8, w: 111.35, h: 9.2 },
  { key: 'shadow-cargo-crate', path: '/assets/maps/figma/shadows/cargo-crate.svg', x: 1288.78, y: 1145, w: 133.45, h: 8 },
  { key: 'shadow-dining-table', path: '/assets/maps/figma/shadows/dining-table.svg', x: 909.17, y: 1515, w: 228.65, h: 14 },
  { key: 'shadow-eva-suit-rack', path: '/assets/maps/figma/shadows/eva-suit-rack.svg', x: 1378.4, y: 1665, w: 163.2, h: 14 },
  { key: 'shadow-cryogenic-pod-rack', path: '/assets/maps/figma/shadows/cryogenic-pod-rack.svg', x: 1732.82, y: 1509, w: 179.35, h: 14 },
  { key: 'shadow-galley-worktop', path: '/assets/maps/figma/shadows/galley-worktop.svg', x: 911.4, y: 1665, w: 265.2, h: 11 },
  { key: 'shadow-galley-front-counter', path: '/assets/maps/figma/shadows/galley-front-counter.svg', x: 830.7, y: 1767.2, w: 336.6, h: 11.8 },
];

/** 01 · Flat floor decals from room layers — always below actors (DEPTH_FLOOR + 1). */
export const FIGMA_FLAT_DECALS: readonly Omit<FigmaSliceSpec, 'footY'>[] = [
  { name: 'Flat hallway vent grate', source: 'hallway', x: 731, y: 1040, w: 70, h: 79 },
  { name: 'Flat airlock threshold', source: 'airlock', x: 1554, y: 1694, w: 202, h: 37 },
];

/** 01 · Recessed wall status lights — non-blocking detail at DEPTH_FLOOR + 1. */
export const FIGMA_STATUS_LIGHTS: readonly FigmaRectDetail[] = [
  { x: 603, y: 484, w: 25, h: 3 },
  { x: 1830, y: 672, w: 36, h: 3 },
  { x: 166, y: 1085, w: 30, h: 3 },
  { x: 750, y: 677, w: 20, h: 3 },
  { x: 1076, y: 1162, w: 30, h: 3 },
];

/** 01 · Outer void cleanup rectangle at bottom-right. */
export const FIGMA_OUTER_VOID_CLEANUP: FigmaRectDetail = { x: 1950, y: 1800, w: 50, h: 200 };

/** 02 · Built-in hydroponics raised platform (liferoom-top layer, foot Y=754). */
export const FIGMA_HYDROPONICS_PLATFORM = {
  name: '0754 · Occluder · built-in hydroponics raised platform',
  source: 'liferoomTop' as const,
  x: 392,
  y: 451,
  w: 256,
  h: 303,
  footY: 754,
} as const;

const WATER_TANK = { name: 'Water tank', source: 'liferoom', x: 115, y: 746, w: 150, h: 199, footY: 945 } as const;
const WALL_POWER_SWITCH = { name: '0856 · Wall power switch', source: 'hallway', x: 1165, y: 826, w: 57, h: 31, footY: 856 } as const;
const RESEARCH_WORKBENCH = { name: 'Research workbench', source: 'research', x: 1442, y: 159, w: 299, h: 117, footY: 276 } as const;
const HEALTH_CHECK = { name: 'Health check panel', source: 'research', x: 1750, y: 292, w: 130, h: 82, footY: 374 } as const;
const CRYSTAL_SCANNER = { name: 'Crystal scanner', source: 'research', x: 1765, y: 375, w: 115, h: 81, footY: 456 } as const;
const CARGO_TERMINAL = { name: 'Cargo command terminal', source: 'storage', x: 1756, y: 660, w: 137, h: 174, footY: 834 } as const;
const CREW_WHITEBOARD = { name: 'Crew whiteboard', source: 'bedroom', x: 436, y: 1482, w: 146, h: 161, footY: 1643 } as const;

/** 02 · Depth-sorted wall occluders (from walls layer) and 3D props (from per-room layers). */
export const FIGMA_DEPTH_SLICES: readonly FigmaSliceSpec[] = [
  // Wall & edge occluders (doorways and corridors excluded)
  { name: '0218 · Occluder · Researcher Room rear wall', source: 'walls', x: 1288, y: 143, w: 598, h: 75, footY: 218 },
  { name: '0526 · Occluder · Hydroponics rear wall', source: 'walls', x: 112, y: 451, w: 543, h: 75, footY: 526 },
  { name: '0709 · Occluder · Cargo rear left panel', source: 'walls', x: 1271, y: 638, w: 48, h: 71, footY: 709 },
  { name: '0709 · Occluder · Cargo rear right panel', source: 'walls', x: 1444, y: 638, w: 465, h: 71, footY: 709 },
  { name: '0953 · Occluder · Hydroponics front left', source: 'walls', x: 110, y: 931, w: 196, h: 22, footY: 953 },
  { name: '0953 · Occluder · Hydroponics front right', source: 'walls', x: 464, y: 931, w: 191, h: 22, footY: 953 },
  { name: '1114 · Occluder · Crew quarters rear left', source: 'walls', x: 123, y: 1040, w: 182, h: 74, footY: 1114 },
  { name: '1114 · Occluder · Crew quarters rear right', source: 'walls', x: 463, y: 1040, w: 154, h: 74, footY: 1114 },
  { name: '1167 · Occluder · Cargo front left', source: 'walls', x: 1267, y: 1148, w: 298, h: 19, footY: 1167 },
  { name: '1167 · Occluder · Cargo front right', source: 'walls', x: 1694, y: 1148, w: 216, h: 19, footY: 1167 },
  { name: '1199 · Occluder · Hub front left', source: 'walls', x: 721, y: 1127, w: 119, h: 72, footY: 1199 },
  { name: '1199 · Occluder · Hub front right', source: 'walls', x: 969, y: 1127, w: 236, h: 72, footY: 1199 },
  { name: '1658 · Occluder · Crew quarters front edge', source: 'walls', x: 121, y: 1638, w: 497, h: 20, footY: 1658 },
  { name: '1788 · Occluder · Galley front edge', source: 'walls', x: 725, y: 1767, w: 480, h: 21, footY: 1788 },
  { name: '1958 · Occluder · External airlock front edge', source: 'walls', x: 1464, y: 1938, w: 380, h: 20, footY: 1958 },

  // Prop depth uses the bottom of each floor footprint.
  { name: '0328 · Reactor left catwalk railing', source: 'core', x: 597, y: 205, w: 91, h: 125, footY: 328 },
  { name: '0371 · Reactor vessel and cabinet', source: 'core', x: 688, y: 9, w: 493, h: 363, footY: 371 },
  { name: 'Medical supply cabinet', source: 'research', x: 1291, y: 140, w: 127, h: 158, footY: 298 },
  RESEARCH_WORKBENCH,
  { name: 'Lab recycler', source: 'research', x: 1785, y: 183, w: 56, h: 73, footY: 256 },
  HEALTH_CHECK,
  CRYSTAL_SCANNER,
  { name: '0736 · Twin utility pipes', source: 'hallway', x: 1010, y: 417, w: 75, h: 320, footY: 736 },
  { name: '0752 · CO2 scrubber', source: 'liferoom', x: 111, y: 395, w: 164, h: 358, footY: 752 },
  { name: '0790 · Cargo crate stack', source: 'storage', x: 1463, y: 615, w: 277, h: 176, footY: 790 },
  WALL_POWER_SWITCH,
  CARGO_TERMINAL,
  { name: '0944 · Air-quality control panel', source: 'liferoom', x: 548, y: 803, w: 99, h: 142, footY: 944 },
  WATER_TANK,
  { name: '1154 · Cargo crate', source: 'storage', x: 1271, y: 1049, w: 167, h: 106, footY: 1154 },
  { name: '1155 · Workshop bench', source: 'storage', x: 1802, y: 933, w: 99, h: 223, footY: 1155 },
  { name: '1160 · Crew workstation', source: 'bedroom', x: 152, y: 1038, w: 138, h: 123, footY: 1160 },
  { name: '1185 · First-aid station', source: 'kitchen', x: 773, y: 1129, w: 57, h: 57, footY: 1185 },
  CREW_WHITEBOARD,
  { name: '1390 · EVA suit rack top-right', source: 'airlock', x: 1531, y: 1224, w: 32, h: 168, footY: 1390 },
  { name: '1392 · Cryogenic pod rack top-left', source: 'airlock', x: 1713, y: 1265, w: 37, h: 129, footY: 1392 },
  { name: '1431 · Cryogenic pod rack upper-mid', source: 'airlock', x: 1750, y: 1265, w: 31, h: 168, footY: 1431 },
  { name: '1444 · EVA suit rack upper-mid', source: 'airlock', x: 1500, y: 1224, w: 31, h: 222, footY: 1444 },
  { name: '1471 · Cryogenic pod rack lower-mid', source: 'airlock', x: 1781, y: 1265, w: 31, h: 208, footY: 1471 },
  { name: '1523 · Cryogenic pod rack', source: 'airlock', x: 1812, y: 1294, w: 120, h: 230, footY: 1523 },
  { name: '1526 · EVA suit rack lower-mid', source: 'airlock', x: 1469, y: 1232, w: 31, h: 296, footY: 1526 },
  { name: '1530 · Dining table and benches', source: 'kitchen', x: 882, y: 1256, w: 282, h: 275, footY: 1530 },
  { name: 'Amber bunk', source: 'bedroom', x: 125, y: 1481, w: 125, h: 164, footY: 1645 },
  { name: 'Cyan bunk', source: 'bedroom', x: 250, y: 1481, w: 128, h: 164, footY: 1645 },
  { name: '1676 · Galley worktop', source: 'kitchen', x: 883, y: 1589, w: 320, h: 88, footY: 1676 },
  { name: '1679 · EVA suit rack', source: 'airlock', x: 1356, y: 1255, w: 113, h: 425, footY: 1679 },
  { name: '1779 · Galley front counter', source: 'kitchen', x: 797, y: 1714, w: 403, h: 66, footY: 1779 },
];

/** Exact Figma-grid source crop for an interactable task's pixel-silhouette outline. */
export interface TaskObjectOutlineSpec {
  source: FigmaLayerSource;
  x: number;
  y: number;
  w: number;
  h: number;
  footY: number;
  flat?: boolean;
}

/** Explicit mapping from each surface mission task ID to its station prop artwork. */
export const TASK_OBJECT_OUTLINE_SPECS: Record<string, TaskObjectOutlineSpec> = {
  // Reactor Core (core.png)
  'fuel-upper': { source: 'core', x: 598, y: 9, w: 490, h: 362, footY: 371 },
  'align-engine': { source: 'core', x: 704, y: 9, w: 356, h: 342, footY: 371 },
  'reactor-start': { source: 'core', x: 696, y: 240, w: 72, h: 118, footY: 371 },
  'calibrate': { source: 'core', x: 597, y: 9, w: 584, h: 363, footY: 371 },
  'wiring-electrical': { source: 'core', x: 1078, y: 240, w: 102, h: 128, footY: 371 },

  // Hydroponics / Life Room (liferoom.png)
  'wiring-cafeteria': { source: 'liferoom', x: 111, y: 395, w: 164, h: 358, footY: 752 },
  'garbage': WATER_TANK,
  'med-pipes': WATER_TANK,
  'grow-light-balance': FIGMA_HYDROPONICS_PLATFORM,
  'nutrient-loop': { source: 'liferoom', x: 548, y: 803, w: 99, h: 142, footY: 944 },

  // Central Spine / Hallway (hallway.png)
  'asteroids': { source: 'hallway', x: 1010, y: 417, w: 75, h: 320, footY: 736 },
  'power-switches': WALL_POWER_SWITCH,

  // Researcher Room
  'steering': CRYSTAL_SCANNER,
  'upload-admin': RESEARCH_WORKBENCH,
  'reboot-comms': RESEARCH_WORKBENCH,
  'download-nav': HEALTH_CHECK,

  // Galley / Medbay (kitchen.png)
  'inspect': { source: 'kitchen', x: 882, y: 1256, w: 282, h: 275, footY: 1530 },

  // Cargo Bay / Storage (storage.png)
  'fuel-storage': { source: 'storage', x: 1463, y: 615, w: 165, h: 160, footY: 790 },
  'swipe': { source: 'storage', x: 1463, y: 615, w: 277, h: 176, footY: 790 },
  'clean-o2': CARGO_TERMINAL,

  // Crew Quarters / Security (bedroom.png)
  'review-cams': { source: 'bedroom', x: 152, y: 1038, w: 138, h: 123, footY: 1160 },
  'shields': CREW_WHITEBOARD,

  // Airlock / Exterior (airlock.png)
  'eva-sample': { source: 'airlock', x: 1356, y: 1224, w: 205, h: 456, footY: 1679 },
  'eva-array': { source: 'airlock', x: 1713, y: 1265, w: 219, h: 259, footY: 1523 },
  'eva-route': { source: 'airlock', x: 1554, y: 1694, w: 202, h: 37, footY: 1731, flat: true },

  // Emergency Damaged Area Highlights
  'emergency-flr': { source: 'core', x: 1078, y: 240, w: 104, h: 132, footY: 371 },
  'emergency-cme': { source: 'airlock', x: 1554, y: 1694, w: 202, h: 37, footY: 1731, flat: true },
  'emergency-sep': CRYSTAL_SCANNER,
  'emergency-gst': { source: 'liferoom', x: 548, y: 803, w: 99, h: 142, footY: 944 },
};

