/** Stable texture keys for station gameplay. */
export const AssetKeys = {
  /** Default potato specialist sprite. */
  playerBody: 'potato-default',
  tileFloor: 'tile_floor',
  tileWall: 'tile_wall',
  tileset: 'placeholder',
  door: 'prop_door',
  spawn: 'prop_spawn',
  collisionMask: 'station_collision_mask',
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
  /** Figma direct room layers (3072x3072 transparent PNGs). */
  figmaLayerWalls: 'figma_layer_walls',
  figmaLayerCore: 'figma_layer_core',
  figmaLayerShields: 'figma_layer_shields',
  figmaLayerLiferoom: 'figma_layer_liferoom',
  figmaLayerLiferoomTop: 'figma_layer_liferoom_top',
  figmaLayerHallway: 'figma_layer_hallway',
  figmaLayerStorage: 'figma_layer_storage',
  figmaLayerBedroom: 'figma_layer_bedroom',
  figmaLayerKitchen: 'figma_layer_kitchen',
  figmaLayerAirlock: 'figma_layer_airlock',
  /** Crew NPC potato textures. */
  crewFarmer: 'potato-farmer',
  crewResearcher: 'potato-researcher',
  crewRepairman: 'potato-repairman',
  /** Loading screen animated sheet. */
  loadingRunnerSheet: 'loading-runner-sheet',
  /** Station floor decor placeholders. */
  propCrate: 'prop_crate',
  propPlant: 'prop_plant',
  propBarrel: 'prop_barrel',
} as const;

/** Tiled map keys. */
export const MapKeys = {
  station: 'spudnaut-station',
} as const;

