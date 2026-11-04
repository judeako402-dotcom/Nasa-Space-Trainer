import { CORRIDORS, PLAYER_SPAWN, ROOMS, TASKS, WORLD_HEIGHT, WORLD_WIDTH } from '../model';
import type { MapDefinition } from './mapTypes';
import type { DestinationId } from '../model';

/* The surface habitat is the 30-day mission map. The geometry already existed in
   model.ts; this adapter gives it the same renderer contract as the Training Deck. */
export const SURFACE_HABITAT: MapDefinition = {
  id: 'surface',
  title: 'SURFACE HABITAT',
  subtitle: 'SPUDNAUT BASE · HABITATION RING',
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
    { id: 'mission-window-cafeteria', kind: 'window', x: 1010, y: 124, w: 260, h: 64, solid: false, tint: 0x83d9ed },
    { id: 'mission-window-weapons', kind: 'window', x: 1760, y: 166, w: 180, h: 58, solid: false, tint: 0x83d9ed },
    { id: 'habitat-pressure-door', kind: 'airlock', x: 1220, y: 1370, w: 60, h: 64, solid: false, tint: 0x62a6c4 },
    { id: 'greenhouse-tray-a', kind: 'planter', x: 1010, y: 290, w: 170, h: 110, solid: true, tint: 0x78ba50 },
    { id: 'greenhouse-tray-b', kind: 'planter', x: 1320, y: 290, w: 170, h: 110, solid: true, tint: 0x90cf61 },
    { id: 'power-thermal-tank', kind: 'tank', x: 1490, y: 930, w: 78, h: 150, solid: true, tint: 0xf2b544 },
    { id: 'power-control-console', kind: 'console', x: 1510, y: 1110, w: 110, h: 54, solid: true, tint: 0xd89058 },
    { id: 'life-support-tank-a', kind: 'tank', x: 1770, y: 590, w: 54, h: 120, solid: true, tint: 0x6fd4e6 },
    { id: 'life-support-tank-b', kind: 'tank', x: 1850, y: 590, w: 54, h: 120, solid: true, tint: 0x78bde2 },
    { id: 'life-support-console', kind: 'console', x: 1790, y: 720, w: 150, h: 38, solid: true, tint: 0x4d91a9 },
    { id: 'sample-bench', kind: 'table', x: 130, y: 620, w: 130, h: 64, solid: true, tint: 0x5e8e91 },
    { id: 'command-console-a', kind: 'console', x: 2320, y: 540, w: 170, h: 64, solid: true, tint: 0x7886a1 },
    { id: 'comms-console', kind: 'console', x: 1010, y: 1370, w: 150, h: 76, solid: true, tint: 0x9582cb },
    { id: 'eva-rover', kind: 'crate', x: 1400, y: 1680, w: 130, h: 80, solid: true, tint: 0xc89e63 },
    { id: 'eva-solar-rack', kind: 'console', x: 2180, y: 1660, w: 170, h: 70, solid: true, tint: 0x739ac2 },
    { id: 'eva-sample-cache', kind: 'crate', x: 1750, y: 1510, w: 80, h: 70, solid: true, tint: 0xb29875 },
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
      x: 1080, y: 260, facing: 1, accent: '#f2b544',
      lines: ['Thirty days, Spudnaut. Earth is watching the gauges, not the speeches.'],
    },
    {
      id: 'pip', name: 'Pip', role: 'Farmer', art: '/assets/potato-farmer.png',
      x: 1300, y: 250, facing: -1, accent: '#9bd15a',
      lines: ['The greenhouse is warm. The power budget is not.'],
    },
    {
      id: 'tater', name: 'Tater', role: 'Medic', art: '/assets/potato-researcher.png',
      x: 620, y: 500, facing: 1, accent: '#6fd4e6',
      lines: ['Water first, then oxygen. Thirst makes people careless.'],
    },
  ],
};

/** Apply destination-specific art direction while keeping task/save IDs stable. */
export function surfaceHabitatFor(destination: DestinationId): MapDefinition {
  const mars = destination === 'mars';
  return {
    ...SURFACE_HABITAT,
    subtitle: mars ? 'MARS OUTPOST · PRESSURIZED HABITAT · SOL WEATHER WATCH' : 'LUNAR OUTPOST · PRESSURIZED HABITAT · EVA AIRLOCK',
    palette: mars
      ? { ...SURFACE_HABITAT.palette, void: 0x17100f, floor: 0x352622, floorAlt: 0x3e2d27, wall: 0xb87958, line: 0x70473b, glow: 0xf09a66 }
      : { ...SURFACE_HABITAT.palette, void: 0x080d18, floor: 0x1b2535, floorAlt: 0x263246, wall: 0x9aaabe, line: 0x45566d, glow: 0x8dc9ef },
    props: [
      ...SURFACE_HABITAT.props,
      ...(mars
        ? [
            { id: 'mars-regolith-rock-a', kind: 'rock' as const, x: 1600, y: 1690, w: 96, h: 62, solid: true, tint: 0x984f3e },
            { id: 'mars-weather-station', kind: 'console' as const, x: 1490, y: 1480, w: 100, h: 84, solid: true, tint: 0xb96d51 },
            { id: 'mars-solar-row', kind: 'solar-panel' as const, x: 2060, y: 1470, w: 190, h: 92, solid: true, tint: 0xe59668 },
            { id: 'mars-comms-mast', kind: 'antenna' as const, x: 2350, y: 1650, w: 74, h: 104, solid: true, tint: 0xb8c2ca },
          ]
        : [
            { id: 'lunar-regolith-rock-a', kind: 'rock' as const, x: 1630, y: 1700, w: 90, h: 58, solid: true, tint: 0x858890 },
            { id: 'lunar-solar-row', kind: 'solar-panel' as const, x: 2070, y: 1470, w: 190, h: 92, solid: true, tint: 0xabc7dc },
            { id: 'lunar-retroreflector', kind: 'antenna' as const, x: 2310, y: 1640, w: 74, h: 104, solid: true, tint: 0xd7dfea },
          ]),
    ],
    rooms: SURFACE_HABITAT.rooms.map(room => room.id === 'exterior'
      ? { ...room, name: mars ? 'Mars EVA Worksite' : 'Lunar EVA Worksite', tint: mars ? 0x754638 : 0x55575d, accent: mars ? '#ee9866' : '#c9d6e8' }
      : room),
  };
}

