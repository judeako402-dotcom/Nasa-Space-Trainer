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

