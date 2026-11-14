/** Stable texture keys for station gameplay. */
export const AssetKeys = {
  /** Default potato specialist sprite. */
  playerBody: 'potato-default',
  tileFloor: 'tile_floor',
  tileWall: 'tile_wall',
  tileset: 'placeholder',
  taskConsole: 'prop_task_console',
  vent: 'prop_vent',
  door: 'prop_door',
  spawn: 'prop_spawn',
  /** Illustrated station artwork traced by spudnaut-station.tmj. */
  mapImage: 'station_map_art',
  /** Separated base floor & walls artwork (rendered at DEPTH_FLOOR). */
  mapFloorImage: 'station_map_floor',
  /** Separated transparent station objects overlay (sliced for Y-sorting). */
  mapObjectsImage: 'station_map_objects',
  /** Figma layered master: 00 Ground and fixed floor plan (3072x3072). */
  figmaFloorPlan: 'figma_floor_plan',
  /** Figma layered master: 01/02 Objects & flat decals spritesheet (6144x6144). */
  figmaObjectsSheet: 'figma_objects_sheet',
  /** Figma layered master: 0750 Built-in hydroponics raised platform occluder. */
  figmaHydroponicsPlatform: 'figma_hydroponics_platform',
  /** Crew NPC potato textures. */
  crewFarmer: 'potato-farmer',
  crewResearcher: 'potato-researcher',
  crewRepairman: 'potato-repairman',
  /** Station floor decor placeholders. */
  propCrate: 'prop_crate',
  propPlant: 'prop_plant',
  propBarrel: 'prop_barrel',
} as const;

/** Tiled map keys. */
export const MapKeys = {
  station: 'spudnaut-station',
} as const;

