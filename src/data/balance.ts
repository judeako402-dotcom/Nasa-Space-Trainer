/* Central tuning values. Every system reads from here so balance stays in one place. */

export const WORLD = {
  width: 2600,
  height: 1560,
  cell: 50,
} as const;

export const MOVEMENT = {
  baseSpeed: 250,
  bodyHalfWidth: 13,
  bodyHalfHeight: 17,
  fixedStep: 1 / 60,
  maxFrameDelta: 0.1,
  travellerMultiplier: 1.18,
  interactionRange: 96,
  clickRange: 96,
} as const;

export const CAMERA = {
  viewWidth: 1300,
  viewHeight: 800,
  zoom: 1.1,
  deadzoneX: 62,
  deadzoneY: 42,
  smoothing: 11,
} as const;

export const VISION = {
  radius: 440,
  darkness: 0.9,
  rays: 168,
  updateHz: 30,
  minMoveBeforeUpdate: 4,
  enabledByDefault: true,
} as const;

export const DAY = {
  baseMs: 180000,
  cadetMs: 240000,
  veteranMs: 135000,
  penaltyScale: 0.72,
  assignmentsPerDay: 3,
  offerCount: 5,
} as const;

export const TRAINING = {
  deckWidth: 1800,
  deckHeight: 1100,
  systemTasks: 4,
  crewTalks: 2,
} as const;

export const PASS_THRESHOLDS = {
  completion: 0.75,
  power: 50,
  oxygen: 50,
  water: 45,
  starch: 50,
  hull: 50,
  morale: 45,
  research: 55,
} as const;

export const METRIC_START = {
  power: 74,
  oxygen: 82,
  water: 76,
  starch: 78,
  hull: 80,
  morale: 72,
  research: 8,
} as const;

/* Simplified per-day game wear and consumables, not engineering limits or NASA telemetry. */
export const DAILY_OPERATIONS_DRIFT = {
  power: -1,
  oxygen: -1,
  water: -1,
  starch: -1,
  hull: -0.5,
  morale: -1,
  research: 0,
} as const;

export const METRIC_LIMITS = {
  min: 0,
  max: 100,
} as const;

export type SystemId = 'power' | 'life' | 'farming' | 'shielding';

export interface SystemDefinition {
  id: SystemId;
  name: string;
  short: string;
  accent: string;
  icon: string;
  metrics: ('power' | 'oxygen' | 'water' | 'starch' | 'hull')[];
  brief: string;
}

export const SYSTEMS: SystemDefinition[] = [
  {
    id: 'power',
    name: 'Power Supply',
    short: 'POWER',
    accent: '#f2b544',
    icon: 'lightning',
    metrics: ['power'],
    brief: 'Solar arrays and batteries keep every module alive.',
  },
  {
    id: 'life',
    name: 'Life Support',
    short: 'LIFE',
    accent: '#6fd4e6',
    icon: 'water',
    metrics: ['oxygen', 'water'],
    brief: 'Scrubbers, oxygen generators, and the water recycling loop.',
  },
  {
    id: 'farming',
    name: 'Hydroponics',
    short: 'FARM',
    accent: '#9bd15a',
    icon: 'sickle',
    metrics: ['starch'],
    brief: 'Grow lights and nutrient pumps feed the whole crew.',
  },
  {
    id: 'shielding',
    name: 'Shielding & Hull',
    short: 'HULL',
    accent: '#ba9df0',
    icon: 'shield',
    metrics: ['hull'],
    brief: 'Radiation barriers and structural patches hold the habitat together.',
  },
];
