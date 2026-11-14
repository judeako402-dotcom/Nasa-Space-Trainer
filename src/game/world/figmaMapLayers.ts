/**
 * Exact layer specifications ported from Figma `Station map · layered master` (node 49:2).
 *
 * Figma authors on a 2000x2000 design grid; the gameplay tilemap/world is 2048x2048
 * (64x64 tiles @ 32px), so all positions, sizes, and foot-Y depths scale by 1.024.
 */

export const FIGMA_DESIGN_SIZE = 2000;
export const WORLD_MAP_SIZE = 2048;
export const FIGMA_TO_WORLD = WORLD_MAP_SIZE / FIGMA_DESIGN_SIZE; // 1.024

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
  /** Optional crop offset if source coords differ from placement (not needed for 1:1 grid). */
  source: 'floor' | 'objects';
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
  { key: 'shadow-shield-generator', path: '/assets/maps/figma/shadows/shield-generator.svg', x: 1445.5, y: 443, w: 289, h: 14 },
  { key: 'shadow-co2-scrubber', path: '/assets/maps/figma/shadows/co2-scrubber.svg', x: 128.98, y: 735.6, w: 113.05, h: 13.4 },
  { key: 'shadow-hydroponic-rack', path: '/assets/maps/figma/shadows/hydroponic-rack.svg', x: 427.92, y: 740.6, w: 203.15, h: 12.4 },
  { key: 'shadow-twin-utility-pipes', path: '/assets/maps/figma/shadows/twin-utility-pipes.svg', x: 1021.72, y: 726.4, w: 53.55, h: 8.6 },
  { key: 'shadow-cargo-crate-stack', path: '/assets/maps/figma/shadows/cargo-crate-stack.svg', x: 1488.25, y: 775, w: 229.5, h: 14 },
  { key: 'shadow-cargo-command-terminal', path: '/assets/maps/figma/shadows/cargo-command-terminal.svg', x: 1764.38, y: 900, w: 106.25, h: 14 },
  { key: 'shadow-water-barrels', path: '/assets/maps/figma/shadows/water-barrels.svg', x: 131.2, y: 933.2, w: 149.6, h: 12.8 },
  { key: 'shadow-air-quality-panel', path: '/assets/maps/figma/shadows/air-quality-panel.svg', x: 559.05, y: 938, w: 79.9, h: 6 },
  { key: 'shadow-workshop-bench', path: '/assets/maps/figma/shadows/workshop-bench.svg', x: 1812.75, y: 1144, w: 76.5, h: 11 },
  { key: 'shadow-crew-workstation', path: '/assets/maps/figma/shadows/crew-workstation.svg', x: 164.82, y: 1149.8, w: 111.35, h: 9.2 },
  { key: 'shadow-life-support-desk', path: '/assets/maps/figma/shadows/life-support-desk.svg', x: 483.2, y: 1250.8, w: 115.6, h: 10.2 },
  { key: 'shadow-cargo-crate', path: '/assets/maps/figma/shadows/cargo-crate.svg', x: 1288.78, y: 1145, w: 133.45, h: 8 },
  { key: 'shadow-dining-table', path: '/assets/maps/figma/shadows/dining-table.svg', x: 909.17, y: 1515, w: 228.65, h: 14 },
  { key: 'shadow-eva-suit-rack', path: '/assets/maps/figma/shadows/eva-suit-rack.svg', x: 1378.4, y: 1665, w: 163.2, h: 14 },
  { key: 'shadow-cryogenic-pod-rack', path: '/assets/maps/figma/shadows/cryogenic-pod-rack.svg', x: 1732.82, y: 1509, w: 179.35, h: 14 },
  { key: 'shadow-amber-bunk', path: '/assets/maps/figma/shadows/amber-bunk.svg', x: 139.75, y: 1630, w: 144.5, h: 14 },
  { key: 'shadow-cyan-bunk', path: '/assets/maps/figma/shadows/cyan-bunk.svg', x: 347.83, y: 1630, w: 145.35, h: 14 },
  { key: 'shadow-galley-worktop', path: '/assets/maps/figma/shadows/galley-worktop.svg', x: 911.4, y: 1665, w: 265.2, h: 11 },
  { key: 'shadow-galley-front-counter', path: '/assets/maps/figma/shadows/galley-front-counter.svg', x: 830.7, y: 1767.2, w: 336.6, h: 11.8 },
];

/** 01 · Flat floor decals from objects-sheet.png — always below actors (DEPTH_FLOOR + 1). */
export const FIGMA_FLAT_DECALS: readonly Omit<FigmaSliceSpec, 'footY' | 'source'>[] = [
  { name: 'Flat central floor vent', x: 720, y: 1030, w: 90, h: 95 },
  { name: 'Flat airlock threshold', x: 1545, y: 1685, w: 220, h: 55 },
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

/** 02 · Built-in hydroponics raised platform (standalone PNG, foot Y=750). */
export const FIGMA_HYDROPONICS_PLATFORM = {
  name: '0750 · Occluder · built-in hydroponics raised platform',
  x: 309,
  y: 523,
  w: 340,
  h: 226,
  footY: 750,
} as const;

/** 02 · Depth-sorted wall occluders (from floor-plan.png) and 3D props (from objects-sheet.png). */
export const FIGMA_DEPTH_SLICES: readonly FigmaSliceSpec[] = [
  // Wall & edge occluders (doorways and corridors excluded)
  { name: '0218 · Occluder · Shield-room rear wall', source: 'floor', x: 1288, y: 143, w: 598, h: 75, footY: 218 },
  { name: '0526 · Occluder · Hydroponics rear wall', source: 'floor', x: 112, y: 451, w: 543, h: 75, footY: 526 },
  { name: '0709 · Occluder · Cargo rear left panel', source: 'floor', x: 1271, y: 638, w: 48, h: 71, footY: 709 },
  { name: '0709 · Occluder · Cargo rear right panel', source: 'floor', x: 1444, y: 638, w: 465, h: 71, footY: 709 },
  { name: '0953 · Occluder · Hydroponics front left', source: 'floor', x: 110, y: 931, w: 196, h: 22, footY: 953 },
  { name: '0953 · Occluder · Hydroponics front right', source: 'floor', x: 464, y: 931, w: 191, h: 22, footY: 953 },
  { name: '1114 · Occluder · Crew quarters rear left', source: 'floor', x: 123, y: 1040, w: 182, h: 74, footY: 1114 },
  { name: '1114 · Occluder · Crew quarters rear right', source: 'floor', x: 463, y: 1040, w: 154, h: 74, footY: 1114 },
  { name: '1167 · Occluder · Cargo front left', source: 'floor', x: 1267, y: 1148, w: 298, h: 19, footY: 1167 },
  { name: '1167 · Occluder · Cargo front right', source: 'floor', x: 1694, y: 1148, w: 216, h: 19, footY: 1167 },
  { name: '1199 · Occluder · Hub front left', source: 'floor', x: 721, y: 1127, w: 119, h: 72, footY: 1199 },
  { name: '1199 · Occluder · Hub front right', source: 'floor', x: 969, y: 1127, w: 236, h: 72, footY: 1199 },
  { name: '1658 · Occluder · Crew quarters front edge', source: 'floor', x: 121, y: 1638, w: 497, h: 20, footY: 1658 },
  { name: '1788 · Occluder · Galley front edge', source: 'floor', x: 725, y: 1767, w: 480, h: 21, footY: 1788 },
  { name: '1958 · Occluder · External airlock front edge', source: 'floor', x: 1464, y: 1938, w: 380, h: 20, footY: 1958 },

  // 3D Props sorted by feet Y
  { name: '0375 · Reactor vessel and left conduit', source: 'objects', x: 590, y: 0, w: 610, h: 390, footY: 375 },
  { name: '0460 · Shield generator and right conduit (1)', source: 'objects', x: 1200, y: 0, w: 700, h: 390, footY: 460 },
  { name: '0460 · Shield generator and right conduit (2)', source: 'objects', x: 1775, y: 390, w: 125, h: 80, footY: 460 },
  { name: '0738 · Twin utility pipes', source: 'objects', x: 1000, y: 405, w: 100, h: 340, footY: 738 },
  { name: '0752 · CO2 scrubber', source: 'objects', x: 95, y: 390, w: 185, h: 362, footY: 752 },
  { name: '0756 · Hydroponic rack', source: 'objects', x: 380, y: 440, w: 280, h: 320, footY: 756 },
  { name: '0792 · Cargo crate stack', source: 'objects', x: 1450, y: 605, w: 294, h: 190, footY: 792 },
  { name: '0859 · Wall power switch', source: 'objects', x: 1155, y: 815, w: 80, h: 50, footY: 859 },
  { name: '0917 · Cargo command terminal', source: 'objects', x: 1744, y: 665, w: 176, h: 260, footY: 917 },
  { name: '0947 · Air-quality control panel', source: 'objects', x: 540, y: 795, w: 115, h: 160, footY: 947 },
  { name: '0949 · Water barrels', source: 'objects', x: 100, y: 752, w: 210, h: 203, footY: 949 },
  { name: '1156 · Cargo crate', source: 'objects', x: 1260, y: 1040, w: 185, h: 125, footY: 1156 },
  { name: '1158 · Workshop bench', source: 'objects', x: 1795, y: 925, w: 115, h: 240, footY: 1158 },
  { name: '1162 · Crew workstation', source: 'objects', x: 145, y: 1025, w: 155, h: 145, footY: 1162 },
  { name: '1188 · First-aid station', source: 'objects', x: 765, y: 1128, w: 75, h: 67, footY: 1188 },
  { name: '1264 · Life-support control desk', source: 'objects', x: 455, y: 1080, w: 170, h: 195, footY: 1264 },
  { name: '1526 · Cryogenic pod rack', source: 'objects', x: 1700, y: 1255, w: 240, h: 280, footY: 1526 },
  { name: '1532 · Dining table and benches', source: 'objects', x: 870, y: 1245, w: 300, h: 295, footY: 1532 },
  { name: '1647 · Amber bunk', source: 'objects', x: 115, y: 1430, w: 190, h: 225, footY: 1647 },
  { name: '1647 · Cyan bunk', source: 'objects', x: 325, y: 1430, w: 195, h: 225, footY: 1647 },
  { name: '1679 · Galley worktop', source: 'objects', x: 875, y: 1580, w: 335, h: 110, footY: 1679 },
  { name: '1682 · EVA suit rack', source: 'objects', x: 1340, y: 1210, w: 235, h: 480, footY: 1682 },
  { name: '1782 · Galley front counter', source: 'objects', x: 790, y: 1700, w: 420, h: 90, footY: 1782 },
];

