/* Central tuning values. Every system reads from here so balance stays in one place. */

export const WORLD = {
  width: 2600,
  height: 1560,
  cell: 50,
} as const;

export const MOVEMENT = {
  baseSpeed: 175,
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
  life: 50,
  power: 50,
  research: 55,
  farm: 50,
} as const;

export const METRIC_START = {
  life: 80,
  power: 76,
  research: 30,
  farm: 78,
} as const;

export const DIFFICULTY_EXCHANGE = {
  cadet: { benefit: 14, cost: 2 },
  crew: { benefit: 12, cost: 4 },
  veteran: { benefit: 10, cost: 6 },
} as const;

/* Per-day habitat consumption rates scaled from NASA ECLSS (98% water recovery / O2 draw),
 * Deep Space Habitation power budgets, OSDR payload calibration drift, and Veggie/PONDS food & nutrient draw. */
export const DAILY_OPERATIONS_DRIFT = {
  life: -2,
  power: -2.5,
  research: -1,
  farm: -1.5,
} as const;

/* Per-second live consumption during active shift gameplay (5x baseline, DAILY_OPERATIONS_DRIFT / 10s). */
export const LIVE_DRAIN_PER_SECOND = {
  life: -0.2,
  power: -0.25,
  research: -0.1,
  farm: -0.15,
} as const;

export const EMERGENCY_DRAIN_MULTIPLIER = 3;

export const METRIC_LIMITS = {
  min: 0,
  max: 100,
} as const;

export type SystemId = 'life' | 'power' | 'research' | 'farm';

export interface SystemDefinition {
  id: SystemId;
  name: string;
  short: string;
  accent: string;
  icon: string;
  metrics: ('life' | 'power' | 'research' | 'farm')[];
  brief: string;
}

export const SYSTEMS: SystemDefinition[] = [
  {
    id: 'life',
    name: 'Life Support',
    short: 'LIFE',
    accent: '#6fd4e6',
    icon: 'water',
    metrics: ['life'],
    brief: 'Air scrubbers, pressure seals, and water recycling keep the habitat breathable.',
  },
  {
    id: 'power',
    name: 'Power Supply',
    short: 'POWER',
    accent: '#f2b544',
    icon: 'lightning',
    metrics: ['power'],
    brief: 'Solar arrays and batteries keep every module online.',
  },
  {
    id: 'research',
    name: 'Research Lab',
    short: 'RESEARCH',
    accent: '#ba9df0',
    icon: 'notepad',
    metrics: ['research'],
    brief: 'Core spectroscopy, rover logs, and sensor surveys prove habitat viability.',
  },
  {
    id: 'farm',
    name: 'Hydroponics Farm',
    short: 'FARM',
    accent: '#9bd15a',
    icon: 'sickle',
    metrics: ['farm'],
    brief: 'Grow lights and nutrient trays sustain the starch harvest that feeds the crew.',
  },
];
