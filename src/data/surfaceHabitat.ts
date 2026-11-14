import { CORRIDORS, PLAYER_SPAWN, ROOMS, TASKS, WORLD_HEIGHT, WORLD_WIDTH } from '../model';
import type { MapDefinition } from './mapTypes';
import type { DestinationId } from '../model';

/* The surface habitat is the 30-day mission map backed by spudnaut-station.tmj
   and the illustrated station floorplan. Keep room/corridor bounds and task
   coordinates synchronized with tools/generate-station-map.mjs. */
export const SURFACE_HABITAT: MapDefinition = {
  id: 'surface',
  title: 'SPUDNAUT STATION',
  subtitle: 'SPUDNAUT BASE · STATION RING',
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  spawn: PLAYER_SPAWN,
  palette: {
    void: 0x05070d,
    floor: 0x16212f,
    floorAlt: 0x1b2939,
    wall: 0x8fa6bd,
    line: 0x32465c,
    glow: 0x68d2e7,
  },
  rooms: ROOMS.map(room => ({
    id: room.id,
    name: room.name,
    x: room.x,
    y: room.y,
    w: room.w,
    h: room.h,
    tint: room.tint,
    accent: '#f5c451',
    icon: room.icon,
  })),
  corridors: CORRIDORS.map(corridor => ({ ...corridor })),
  props: [
    { id: 'reactor-cylinder', kind: 'tank', x: 650, y: 40, w: 465, h: 335, solid: true, tint: 0xf2b544 },
    { id: 'comms-geodesic-dome', kind: 'console', x: 1450, y: 150, w: 300, h: 202, solid: true, tint: 0x9582cb },
    { id: 'hydro-grow-beds', kind: 'planter', x: 402, y: 470, w: 260, h: 298, solid: true, tint: 0x78ba50 },
    { id: 'cargo-command-terminal', kind: 'console', x: 1820, y: 720, w: 120, h: 215, solid: true, tint: 0xc89e63 },
    { id: 'crew-beds', kind: 'table', x: 130, y: 1478, w: 391, h: 204, solid: true, tint: 0x5e8e91 },
    { id: 'med-exam-table', kind: 'table', x: 905, y: 1287, w: 286, h: 279, solid: true, tint: 0x6fd4e6 },
    { id: 'pad-seats', kind: 'console', x: 1375, y: 1315, w: 170, h: 200, solid: true, tint: 0x739ac2 },
    { id: 'pod-shelf', kind: 'crate', x: 1760, y: 1350, w: 200, h: 160, solid: true, tint: 0xb29875 },
  ],
  interactions: TASKS.map(task => ({
    id: task.id,
    name: task.name,
    kind: 'task',
    taskKind: task.kind,
    x: task.x,
    y: task.y,
    roomId: task.roomId,
    icon: 'hammer',
    accent: '#f5c451',
  })),
  crew: [
    {
      id: 'russet', name: 'Cmdr. Russet', role: 'Mission Commander', art: '/assets/potato-repairman.png',
      x: 992, y: 864, facing: 1, accent: '#f2b544',
      lines: ['Thirty days, Spudnaut. Earth is watching the gauges, not the speeches.'],
    },
    {
      id: 'pip', name: 'Pip', role: 'Farmer', art: '/assets/potato-farmer.png',
      x: 480, y: 864, facing: -1, accent: '#9bd15a',
      lines: ['The greenhouse is warm. The power budget is not.'],
    },
    {
      id: 'tater', name: 'Tater', role: 'Medic', art: '/assets/potato-researcher.png',
      x: 800, y: 1312, facing: 1, accent: '#6fd4e6',
      lines: ['Water first, then oxygen. Thirst makes people careless.'],
    },
  ],
};

/** Apply destination-specific art direction while keeping task/save IDs stable. */
export function surfaceHabitatFor(destination: DestinationId): MapDefinition {
  const mars = destination === 'mars';
  return {
    ...SURFACE_HABITAT,
    subtitle: mars ? 'MARS OUTPOST · PRESSURIZED STATION · SOL WEATHER WATCH' : 'LUNAR OUTPOST · PRESSURIZED STATION · EVA AIRLOCK',
    palette: mars
      ? { ...SURFACE_HABITAT.palette, void: 0x17100f, floor: 0x352622, floorAlt: 0x3e2d27, wall: 0xb87958, line: 0x70473b, glow: 0xf09a66 }
      : { ...SURFACE_HABITAT.palette, void: 0x080d18, floor: 0x1b2535, floorAlt: 0x263246, wall: 0x9aaabe, line: 0x45566d, glow: 0x8dc9ef },
    props: [
      ...SURFACE_HABITAT.props,
      ...(mars
        ? [
            { id: 'mars-regolith-rock-a', kind: 'rock' as const, x: 1620, y: 1840, w: 80, h: 52, solid: false, tint: 0x984f3e },
            { id: 'mars-comms-mast', kind: 'antenna' as const, x: 1840, y: 1820, w: 68, h: 96, solid: false, tint: 0xb8c2ca },
          ]
        : [
            { id: 'lunar-regolith-rock-a', kind: 'rock' as const, x: 1620, y: 1840, w: 80, h: 52, solid: false, tint: 0x858890 },
            { id: 'lunar-retroreflector', kind: 'antenna' as const, x: 1840, y: 1820, w: 68, h: 96, solid: false, tint: 0xd7dfea },
          ]),
    ],
    rooms: SURFACE_HABITAT.rooms.map(room => room.id === 'exterior'
      ? { ...room, name: 'Landing Pad', tint: mars ? 0x754638 : 0x55575d, accent: mars ? '#ee9866' : '#c9d6e8' }
      : room),
  };
}
