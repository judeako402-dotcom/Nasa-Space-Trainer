import { CORRIDORS, PLAYER_SPAWN, ROOMS, STATION_TASKS, WORLD_HEIGHT, WORLD_WIDTH } from '../model';
import type { MapDefinition } from './mapTypes';
import type { DestinationId } from '../model';
import { REACTOR_POWER_SWITCH } from './missionOpening';

/* The surface habitat is the lunar mission map backed by spudnaut-station.tmj
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
    { id: 'research-workbench', kind: 'console', x: 1476, y: 218, w: 306, h: 64, solid: true, tint: 0x9582cb },
    { id: 'hydro-grow-beds', kind: 'planter', x: 402, y: 470, w: 260, h: 298, solid: true, tint: 0x78ba50 },
    { id: 'cargo-command-terminal', kind: 'console', x: 1832, y: 714, w: 106, h: 138, solid: true, tint: 0xc89e63 },
    { id: 'crew-beds', kind: 'table', x: 130, y: 1518, w: 256, h: 164, solid: true, tint: 0x5e8e91 },
    { id: 'crew-whiteboard', kind: 'console', x: 448, y: 1518, w: 146, h: 164, solid: true, tint: 0x5e8e91 },
    { id: 'med-exam-table', kind: 'table', x: 905, y: 1287, w: 286, h: 279, solid: true, tint: 0x6fd4e6 },
    { id: 'pad-seats', kind: 'console', x: 1375, y: 1315, w: 170, h: 200, solid: true, tint: 0x739ac2 },
    { id: 'pod-shelf', kind: 'crate', x: 1760, y: 1350, w: 200, h: 160, solid: true, tint: 0xb29875 },
  ],
  interactions: [...STATION_TASKS.map(task => ({
    id: task.id,
    name: task.name,
    kind: 'task' as const,
    taskKind: task.kind,
    x: task.x,
    y: task.y,
    roomId: task.roomId,
    icon: task.isEmergency ? 'warning' : 'hammer',
    accent: task.isEmergency ? '#ff5a5f' : '#f5c451',
  })), {
    ...REACTOR_POWER_SWITCH, name: 'Restore Station Power', kind: 'task', roomId: 'reactor', icon: 'lightning', accent: '#f5c451',
  }],
  crew: [
    {
      id: 'pip', name: 'Pip', role: 'Farmer', art: '/assets/potato-farmer.png',
      x: 480, y: 864, facing: -1, accent: '#9bd15a', roomId: 'cafeteria',
      patrolBounds: { x: 123, y: 532, width: 528, height: 416 },
      lines: ['The greenhouse is warm. The power budget is not.'],
    },
    {
      id: 'tater', name: 'Tater', role: 'Medic', art: '/assets/potato-researcher.png',
      x: 800, y: 1312, facing: 1, accent: '#6fd4e6', roomId: 'medbay',
      patrolBounds: { x: 762, y: 1244, width: 452, height: 500 },
      lines: ['Water first, then oxygen. Thirst makes people careless.'],
    },
    {
      id: 'chip', name: 'Chip', role: 'Research Technician', art: '/assets/potato-researcher.png',
      x: 1664, y: 400, facing: -1, accent: '#a9b6ff', roomId: 'communications',
      patrolBounds: { x: 1380, y: 280, width: 448, height: 168 },
      lines: ['The scanner is ready. Keep the workbench clear so we can log each sample.'],
    },
    {
      id: 'rover', name: 'Rover', role: 'Surface Explorer', art: '/assets/potato-traveller.png',
      x: 1568, y: 1540, facing: 1, accent: '#e9c27b', roomId: 'exterior',
      patrolBounds: { x: 1476, y: 1380, width: 416, height: 296 },
      helmeted: true,
      exteriorOnly: false,
      futureIntegration: {
        roleTag: 'explorer',
        status: 'staged',
        missionKind: 'eva-sortie',
        zoneId: 'landing-pad-apron',
      },
      lines: [
        'Airlock gauges are green inside Landing Pad and Lunar beacon relays are holding steady.',
        'Check your suit seal here before stepping up to the hazard Exit Door to deploy outside.',
      ],
    },
  ],
};

/** Apply destination-specific art direction while keeping task/save IDs stable. */
export function surfaceHabitatFor(_destination: DestinationId): MapDefinition {
  return {
    ...SURFACE_HABITAT,
    subtitle: 'LUNAR OUTPOST · PRESSURIZED STATION · EVA AIRLOCK',
    palette: {
      ...SURFACE_HABITAT.palette,
      void: 0x080d18,
      floor: 0x1b2535,
      floorAlt: 0x263246,
      wall: 0x9aaabe,
      line: 0x45566d,
      glow: 0x8dc9ef,
    },
    props: [
      ...SURFACE_HABITAT.props,
      { id: 'lunar-regolith-rock-a', kind: 'rock' as const, x: 1620, y: 1840, w: 80, h: 52, solid: false, tint: 0x858890 },
      { id: 'lunar-retroreflector', kind: 'antenna' as const, x: 1840, y: 1820, w: 68, h: 96, solid: false, tint: 0xd7dfea },
    ],
    rooms: SURFACE_HABITAT.rooms.map(room => room.id === 'exterior'
      ? { ...room, name: 'Landing Pad', tint: 0x55575d, accent: '#c9d6e8' }
      : room),
  };
}
