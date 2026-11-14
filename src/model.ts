export type PlayerColorId =
  | 'red'
  | 'blue'
  | 'green'
  | 'pink'
  | 'orange'
  | 'yellow'
  | 'black'
  | 'white'
  | 'purple'
  | 'cyan'
  | 'lime'
  | 'brown';

export interface PlayerColor {
  id: PlayerColorId;
  name: string;
  hex: number;
  css: string;
}

export type GamePhase = 'menu' | 'story' | 'exam' | 'launch' | 'playing' | 'report' | 'penalty' | 'complete';
export type DestinationId = 'moon';
export type SpecialistId = 'repairman' | 'farmer' | 'traveller' | 'researcher';
export type DifficultyId = 'cadet' | 'crew' | 'veteran';
export type MissionMetric = 'life' | 'power' | 'research' | 'farm';

export interface MissionMetrics {
  life: number;
  power: number;
  research: number;
  farm: number;
}

export interface EarthProgressReport {
  day: number;
  completed: number;
  assigned: number;
  event: string;
  eventId?: string;
  eventChoiceId?: string;
  metrics?: MissionMetrics;
  tasks?: string[];
  completedTasks?: string[];
}

export interface TrialProgress {
  day: number;
  penaltyDay: number;
  totalAssigned: number;
  totalCompleted: number;
  missedDays: number;
  metrics: MissionMetrics;
}

export interface DonkiReport {
  id: string;
  type: 'FLR' | 'CME' | 'SEP' | 'GST';
  date: string;
  url: string;
  summary: string;
  simulated?: boolean;
}

export interface MajorEventCandidate {
  report: DonkiReport;
  triggered: boolean;
}

export interface MajorEventRun {
  seed: number;
  difficulty: DifficultyId;
  reportsLoaded: boolean;
  candidates: MajorEventCandidate[];
  nextCandidateIndex: number;
}

export interface SavedTrial extends TrialProgress {
  phase: 'playing' | 'report' | 'penalty';
  tasks: string[];
  completed: string[];
  eventId: string | null;
  reports: EarthProgressReport[];
  report: EarthProgressReport | null;
  remainingMs?: number;
  shiftDurationMs?: number;
  eventChoiceId?: string;
  donkiReport?: DonkiReport;
  majorEventRun?: MajorEventRun;
  position?: { x: number; y: number };
  planning?: { eventBase: MissionMetrics; selected: string[]; majorEventReportId?: string; offers?: string[] };
  pendingDisaster?: boolean;
  checkpoint?: MissionCheckpoint;
}

export interface MissionCheckpoint {
  reason: 'shift-start' | 'after-task' | 'before-major-event';
  metrics: MissionMetrics;
  completed: string[];
  totalCompleted: number;
  remainingMs: number;
  position: { x: number; y: number };
  pendingDisaster: boolean;
  failures: number;
}

export interface RoomDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tint: number;
  icon: string;
}

export interface CorridorDef {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TaskKind =
  | 'wiring'
  | 'swipe'
  | 'download'
  | 'fuel'
  | 'calibrate'
  | 'inspect'
  | 'shield'
  | 'garbage'
  | 'cards'
  | 'rainbow' | 'harvest' | 'scrub' | 'pipes' | 'solar' | 'crystals' | 'signal';

export interface TaskDef {
  id: string;
  name: string;
  kind: TaskKind;
  roomId: string;
  x: number;
  y: number;
  system?: MissionMetric;
  cost?: MissionMetric;
  isEmergency?: boolean;
}

export interface GameOptions {
  masterVolume?: number;
  sound: boolean;
  volume: number;
  music: boolean;
  musicVolume: number;
  lineOfSight: boolean;
  reducedMotion: boolean;
  showFps: boolean;
  difficulty: DifficultyId;
}

export interface PlayerSave {
  version: 8;
  colorId: PlayerColorId;
  name: string;
  wins: number;
  losses: number;
  games: number;
  certified: boolean;
  trainingComplete: boolean;
  trainingRank: 'S' | 'A' | 'B' | null;
  tutorialComplete: boolean;
  seenMinigames: string[];
  medals: number;
  examBest: number;
  trialDay: number;
  activeTrial: SavedTrial | null;
  specialist: SpecialistId;
  destination: DestinationId;
  options: GameOptions;
}

export interface Specialist {
  id: SpecialistId;
  name: string;
  shortName: string;
  role: string;
  art: string;
  perk: string;
  description: string;
  accent: string;
}

export interface Destination {
  id: DestinationId;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  gravity: string;
  hazard: string;
}

export interface ExamQuestion {
  id: string;
  topic: string;
  prompt: string;
  options: string[];
  correct: number[];
  explanation: string;
  lesson: string;
}

export interface LobbySettings {
  playerName: string;
  colorId: PlayerColorId;
  specialist: SpecialistId;
  destination: DestinationId;
}

export const WORLD_WIDTH = 2048;
export const WORLD_HEIGHT = 2048;

export const PLAYER_COLORS: PlayerColor[] = [
  { id: 'red', name: 'Red', hex: 0xc51111, css: '#c51111' },
  { id: 'blue', name: 'Blue', hex: 0x132ed1, css: '#132ed1' },
  { id: 'green', name: 'Green', hex: 0x117f2d, css: '#117f2d' },
  { id: 'pink', name: 'Pink', hex: 0xed54ba, css: '#ed54ba' },
  { id: 'orange', name: 'Orange', hex: 0xef7d0d, css: '#ef7d0d' },
  { id: 'yellow', name: 'Yellow', hex: 0xf5f557, css: '#f5f557' },
  { id: 'black', name: 'Black', hex: 0x3f474e, css: '#3f474e' },
  { id: 'white', name: 'White', hex: 0xd6e0f0, css: '#d6e0f0' },
  { id: 'purple', name: 'Purple', hex: 0x6b2fbb, css: '#6b2fbb' },
  { id: 'cyan', name: 'Cyan', hex: 0x38fedc, css: '#38fedc' },
  { id: 'lime', name: 'Lime', hex: 0x50ef39, css: '#50ef39' },
  { id: 'brown', name: 'Brown', hex: 0x71491e, css: '#71491e' },
];

export function getColor(id: PlayerColorId): PlayerColor {
  return PLAYER_COLORS.find(color => color.id === id) ?? PLAYER_COLORS[0];
}

export const ROOMS: RoomDef[] = [
  { id: 'reactor', name: 'Reactor Dome', x: 555, y: 10, w: 622, h: 460, tint: 0x5b4654, icon: '◉' },
  { id: 'communications', name: 'Researcher Room', x: 1278, y: 115, w: 685, h: 355, tint: 0x4b4470, icon: '⌁' },
  { id: 'cafeteria', name: 'Hydroponics Bay', x: 105, y: 445, w: 560, h: 520, tint: 0x3e6a58, icon: '❀' },
  { id: 'admin', name: 'Central Hub', x: 782, y: 700, w: 365, h: 455, tint: 0x476252, icon: '▤' },
  { id: 'storage', name: 'Cargo Bay', x: 1290, y: 640, w: 670, h: 520, tint: 0x5e5040, icon: '▦' },
  { id: 'security', name: 'Crew Quarters', x: 105, y: 1035, w: 540, h: 625, tint: 0x45516b, icon: '◈' },
  { id: 'medbay', name: 'Med Lab', x: 665, y: 1155, w: 560, h: 610, tint: 0x3f6a69, icon: '✚' },
  { id: 'exterior', name: 'Landing Pad', x: 1315, y: 1185, w: 680, h: 808, tint: 0x544b45, icon: 'E' },
];

export const CORRIDORS: CorridorDef[] = [
  { x: 1088, y: 155, w: 322, h: 190 },
  { x: 830, y: 400, w: 300, h: 370 },
  { x: 1022, y: 740, w: 332, h: 110 },
  { x: 1445, y: 415, w: 175, h: 300 },
  { x: 360, y: 920, w: 110, h: 160 },
  { x: 580, y: 1280, w: 150, h: 160 },
  { x: 782, y: 1080, w: 240, h: 140 },
  { x: 1548, y: 1120, w: 155, h: 180 },
];

const PREVIOUS_TASKS: TaskDef[] = [
  { id: 'fuel-upper', name: 'Balance Solar-Battery Load', kind: 'fuel', roomId: 'reactor', x: 688, y: 400, system: 'power' },
  { id: 'align-engine', name: 'Align Sun-Tracking Array', kind: 'calibrate', roomId: 'reactor', x: 784, y: 400, system: 'power' },
  { id: 'wiring-cafeteria', name: 'Route Greenhouse Power', kind: 'wiring', roomId: 'cafeteria', x: 352, y: 800, system: 'power' },
  { id: 'garbage', name: 'Sort Galley Water Filters', kind: 'garbage', roomId: 'cafeteria', x: 304, y: 880, system: 'life' },
  { id: 'grow-light-balance', name: 'Balance Grow-Light Spectrum', kind: 'calibrate', roomId: 'cafeteria', x: 608, y: 784, system: 'farm' },
  { id: 'nutrient-loop', name: 'Check Hydroponics Nutrient Loop', kind: 'inspect', roomId: 'cafeteria', x: 544, y: 928, system: 'farm' },
  { id: 'asteroids', name: 'Survey EVA Safe Route', kind: 'inspect', roomId: 'admin', x: 928, y: 800, system: 'research' },
  { id: 'steering', name: 'Plan Rover Traverse', kind: 'calibrate', roomId: 'communications', x: 1360, y: 368, system: 'research' },
  { id: 'download-nav', name: 'Upload Surface Weather', kind: 'download', roomId: 'communications', x: 1776, y: 368, system: 'research' },
  { id: 'reactor-start', name: 'Tune Thermal Control', kind: 'calibrate', roomId: 'reactor', x: 736, y: 416, system: 'power' },
  { id: 'inspect', name: 'Analyze Regolith Sample', kind: 'inspect', roomId: 'medbay', x: 736, y: 1376, system: 'research' },
  { id: 'calibrate', name: 'Balance Habitat Power Bus', kind: 'calibrate', roomId: 'reactor', x: 864, y: 416, system: 'power' },
  { id: 'swipe', name: 'Check Suit Pressure Seal', kind: 'swipe', roomId: 'storage', x: 1568, y: 800, system: 'life' },
  { id: 'upload-admin', name: 'Send Earth Science Log', kind: 'download', roomId: 'communications', x: 1568, y: 352, system: 'research' },
  { id: 'fuel-storage', name: 'Replace Battery Module', kind: 'fuel', roomId: 'storage', x: 1376, y: 736, system: 'power' },
  { id: 'shields', name: 'Seal Habitat Pressure Barrier', kind: 'shield', roomId: 'security', x: 528, y: 1488, system: 'life' },
  { id: 'wiring-electrical', name: 'Reconnect Power Distribution Bus', kind: 'wiring', roomId: 'reactor', x: 1104, y: 400, system: 'power' },
  { id: 'review-cams', name: 'Review Rover Terrain Images', kind: 'download', roomId: 'security', x: 240, y: 1200, system: 'research' },
  { id: 'clean-o2', name: 'Service CO2 Scrubber Filter', kind: 'garbage', roomId: 'storage', x: 1808, y: 848, system: 'life' },
  { id: 'reboot-comms', name: 'Align Deep-Space Antenna', kind: 'calibrate', roomId: 'communications', x: 1712, y: 304, system: 'research' },
  { id: 'eva-sample', name: 'Collect Geology Sample', kind: 'inspect', roomId: 'exterior', x: 1568, y: 1568, system: 'research' },
  { id: 'eva-array', name: 'Inspect Exterior Power Cable', kind: 'wiring', roomId: 'exterior', x: 1824, y: 1568, system: 'power' },
  { id: 'eva-route', name: 'Mark Return-to-Airlock Route', kind: 'download', roomId: 'exterior', x: 1696, y: 1696, system: 'research' },
];

export const TASKS: TaskDef[] = [
  { id: 'grow-light-balance', name: 'Grow-Light Rainbow Tune', kind: 'rainbow', roomId: 'cafeteria', x: 608, y: 784, system: 'farm', cost: 'power' },
  { id: 'nutrient-loop', name: 'Potato Harvest Catch', kind: 'harvest', roomId: 'cafeteria', x: 544, y: 928, system: 'farm', cost: 'life' },
  { id: 'inspect', name: 'Moon-Dust Filter Scrub', kind: 'scrub', roomId: 'medbay', x: 736, y: 1376, system: 'life', cost: 'power' },
  { id: 'med-pipes', name: 'Oxygen & Water Pipe Connect', kind: 'pipes', roomId: 'medbay', x: 800, y: 1472, system: 'life', cost: 'farm' },
  { id: 'wiring-electrical', name: 'Spark-Wire Color Match', kind: 'wiring', roomId: 'reactor', x: 1104, y: 400, system: 'power', cost: 'life' },
  { id: 'align-engine', name: 'Sun-Beam Solar Catcher', kind: 'solar', roomId: 'reactor', x: 784, y: 400, system: 'power', cost: 'research' },
  { id: 'steering', name: 'Moon-Rock Crystal Scanner', kind: 'crystals', roomId: 'communications', x: 1776, y: 432, system: 'research', cost: 'power' },
  { id: 'upload-admin', name: 'Star-Signal Memory Beat', kind: 'signal', roomId: 'communications', x: 1568, y: 304, system: 'research', cost: 'farm' },
];

export const EMERGENCY_TASKS: TaskDef[] = [
  { id: 'emergency-flr', name: 'Damaged Area · Solar Power Bus', kind: 'calibrate', roomId: 'reactor', x: 784, y: 400, system: 'power', isEmergency: true },
  { id: 'emergency-cme', name: 'Damaged Area · Airlock & Hull Shield', kind: 'shield', roomId: 'security', x: 528, y: 1488, system: 'life', isEmergency: true },
  { id: 'emergency-sep', name: 'Damaged Area · Comms & Science Sensors', kind: 'calibrate', roomId: 'communications', x: 1776, y: 432, system: 'research', isEmergency: true },
  { id: 'emergency-gst', name: 'Damaged Area · Hydroponic Grow Pumps', kind: 'inspect', roomId: 'cafeteria', x: 544, y: 928, system: 'farm', isEmergency: true },
];

export const STATION_TASKS = [
  ...TASKS,
  ...EMERGENCY_TASKS,
  ...PREVIOUS_TASKS.filter(previous => !TASKS.some(task => task.id === previous.id)),
];

export const PLAYER_SPAWN = { x: 960, y: 950 };

export const SPECIALISTS: Specialist[] = [
  {
    id: 'repairman',
    name: 'Repairman',
    shortName: 'REPAIR',
    role: 'Station Systems',
    art: '/assets/potato-repairman.png',
    perk: 'Power jobs give +3 extra Power. You use less Power each shift.',
    description: 'You know every bolt on the station. When the alarms start, you keep the air inside.',
    accent: '#f2b544',
  },
  {
    id: 'farmer',
    name: 'Farmer',
    shortName: 'FARM',
    role: 'Hydroponics',
    art: '/assets/potato-farmer.png',
    perk: 'Farm jobs give +3 extra Farm. You save water and lose less Life each shift.',
    description: 'Soil, water, light. You can grow a meal in a crater and make it taste like home.',
    accent: '#9bd15a',
  },
  {
    id: 'traveller',
    name: 'Traveller',
    shortName: 'TRAVEL',
    role: 'Surface Scouting',
    art: '/assets/potato-traveller.png',
    perk: 'Life and airlock repairs give +3 extra Life. You walk 18% faster.',
    description: 'You have walked every dust field on the training map. A long corridor is a short walk.',
    accent: '#e9c27b',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    shortName: 'RESEARCH',
    role: 'Science & Samples',
    art: '/assets/potato-researcher.png',
    perk: 'Research jobs give +3 extra Research. You get clearer clues during alerts.',
    description: 'You ask questions for a living. The crew will hear your evidence, even twice.',
    accent: '#78d8e8',
  },
];

export const DESTINATIONS: Destination[] = [
  {
    id: 'moon',
    name: 'The Moon',
    tagline: 'Low gravity. High risk.',
    description: 'A silent grey basin with no atmosphere, brutal temperature swings, and dust that clings to everything.',
    accent: '#a9c8e8',
    gravity: '0.16 G',
    hazard: 'Regolith dust',
  },
];

export const TASK_RANGE = 82;

export const TRIAL_DAYS_BY_DIFFICULTY: Record<DifficultyId, number> = {
  cadet: 3,
  crew: 5,
  veteran: 7,
};

export const PENALTY_DAYS_BY_DIFFICULTY: Record<DifficultyId, number> = {
  cadet: 3,
  crew: 5,
  veteran: 7,
};

export function trialMaxDays(difficulty: DifficultyId = 'crew'): number {
  return TRIAL_DAYS_BY_DIFFICULTY[difficulty];
}

export function penaltyMaxDays(difficulty: DifficultyId = 'crew'): number {
  return PENALTY_DAYS_BY_DIFFICULTY[difficulty];
}

export const TRIAL_MAX_DAY = TRIAL_DAYS_BY_DIFFICULTY.crew;
export const PENALTY_MAX_DAY = PENALTY_DAYS_BY_DIFFICULTY.crew;
export const EXAM_QUESTION_COUNT = 8;
export const EXAM_PASS_RATIO = 0.7;

export const DIFFICULTY_INFO: Record<DifficultyId, { name: string; description: string }> = {
  cadet: { name: 'Cadet', description: '3 shifts · 15% alert chance · bigger boosts and smaller costs.' },
  crew: { name: 'Crew', description: '5 shifts · 30% alert chance · balanced boosts and costs.' },
  veteran: { name: 'Veteran', description: '7 shifts · 50% alert chance · tougher tradeoffs and shorter clocks.' },
};

export const DEFAULT_OPTIONS: GameOptions = {
  masterVolume: 80,
  sound: true,
  volume: 60,
  music: true,
  musicVolume: 55,
  lineOfSight: true,
  reducedMotion: false,
  showFps: false,
  difficulty: 'crew',
};

export const DEFAULT_LOBBY: LobbySettings = {
  playerName: 'Spudnaut',
  colorId: 'orange',
  specialist: 'repairman',
  destination: 'moon',
};

export const EXAM_QUESTIONS: ExamQuestion[] = [
  {
    id: 'vacuum',
    topic: 'Space Basics',
    prompt: 'What happens to an unshielded potato in a cosmic vacuum?',
    options: ['It instantly becomes a french fry', 'It freeze-dries and loses moisture', 'It grows an infinite sprout', 'It turns into a small nebula'],
    correct: [1],
    explanation: 'A vacuum boils away surface moisture and the rapid evaporation chills the object. The result is effectively freeze-dried.',
    lesson: 'Vacuum exposure is not a cartoon transformation. Depressurization boils moisture and flash-freezes the surface. Always seal your suit first.',
  },
  {
    id: 'micrometeoroid',
    topic: 'Equipment',
    prompt: 'Which part of a spacesuit helps protect astronauts from tiny micrometeoroid impacts?',
    options: ['The micrometeoroid and thermal outer layers', 'The soft underwear layer alone', 'The cotton neck seal', 'The mission patch'],
    correct: [0],
    explanation: 'EVA suits use layered outer garments for thermal control and micrometeoroid protection, along with separate pressure and mobility layers.',
    lesson: 'A spacesuit is a small spacecraft. Its layers manage pressure, temperature, movement, and small-particle impacts; no single layer makes an astronaut invulnerable.',
  },
  {
    id: 'hull-breach',
    topic: 'Pressure',
    prompt: 'A hull breach opens into the cabin. What happens to cabin pressure?',
    options: ['It rises sharply', 'It drops toward vacuum', 'It stays exactly the same', 'It becomes breathable'],
    correct: [1],
    explanation: 'Air rushes toward the lower-pressure vacuum outside. Seal the breach and get to a pressurized module.',
    lesson: 'Pressure always moves from high to low. A breach pulls air out, so the crew must isolate the module and patch the hull immediately.',
  },
  {
    id: 'scrubbers',
    topic: 'Life Support',
    prompt: 'Which system removes carbon dioxide from the station air?',
    options: ['The solar array', 'The life support scrubbers', 'The navigation gyros', 'The cargo bay'],
    correct: [1],
    explanation: 'CO2 scrubbers pull carbon dioxide from the cabin loop so the crew can keep breathing safely.',
    lesson: 'Life support handles air composition. Scrubbers remove carbon dioxide, while oxygen generators replenish the air supply.',
  },
  {
    id: 'grow-lights',
    topic: 'Farming',
    prompt: 'Why does a hydroponic greenhouse need powerful grow lights?',
    options: ['To keep the potatoes warm', 'To replace sunlight for photosynthesis', 'To sterilize the water', 'To power the navigation computer'],
    correct: [1],
    explanation: 'Plants need light for photosynthesis. Underground or shadowed habitats must supply that light artificially.',
    lesson: 'Hydroponics trades sunlight for engineered light. That light is a major power draw, so farming and power budgets must be balanced.',
  },
  {
    id: 'water-recycling',
    topic: 'Life Support',
    prompt: 'What is the best way to stretch a limited water supply on the Moon?',
    options: ['Vent greywater into space', 'Recycle urine, condensate, and greywater', 'Drink less and work slower', 'Use only bottled water from Earth'],
    correct: [1],
    explanation: 'Closed-loop recycling recovers most water from waste streams. Every kilogram launched from Earth is expensive.',
    lesson: 'Water is heavy and costly to launch. Station water loops filter and reuse every drop, including condensation and waste water.',
  },
  {
    id: 'pressure-line',
    topic: 'Repair',
    prompt: 'Before opening a pressurized line with a wrench, what must you do first?',
    options: ['Depressurize the line', 'Paint the wrench orange', 'Check the cafeteria menu', 'Turn up the music'],
    correct: [0],
    explanation: 'A pressurized line can vent violently. Isolate and depressurize it before loosening any fitting.',
    lesson: 'Maintenance starts with isolation. Close the valve, depressurize, and confirm the gauge reads zero before opening a line.',
  },
  {
    id: 'crew-report',
    topic: 'Crew Safety',
    prompt: 'A habitat sensor flags a sudden oxygen drop. What should the crew report first?',
    options: ['The location, hazard, and help needed', 'Only the names of everyone nearby', 'Wait until the next daily review', 'Ignore the alert and finish unrelated work'],
    correct: [0],
    explanation: 'Clear, actionable reports let the crew respond quickly and coordinate repairs.',
    lesson: 'Use the mission report format: location, hazard, and the assistance required. Earth reviews the daily progress record.',
  },
  {
    id: 'radiation',
    topic: 'Life Support & Protection',
    prompt: 'Why do engineers study hydrogen-rich materials such as water for radiation shielding?',
    options: ['A thin sheet of aluminum foil', 'Water-rich or polyethylene layers', 'A layer of dried potato peel', 'A painted hull'],
    correct: [1],
    explanation: 'Hydrogen-rich materials can help reduce exposure to some energetic particles, but no simple wall blocks every kind of space radiation.',
    lesson: 'Radiation protection is a design challenge involving shielding, mission timing, shelter, and monitoring. The game’s Life Support gauge models cabin air, water, and hull protection together.',
  },
  {
    id: 'gravity-turn',
    topic: 'Launch',
    prompt: 'What is the purpose of a gravity turn during launch?',
    options: ['To spin the rocket for stability', 'To trade vertical thrust for horizontal velocity', 'To cool the engines', 'To deploy the parachute'],
    correct: [1],
    explanation: 'After clearing the tower, the rocket pitches downrange and lets gravity bend its path, saving steering propellant.',
    lesson: 'A gravity turn uses gravity itself to shape the trajectory. The rocket pitches gradually, building horizontal speed toward orbit.',
  },
  {
    id: 'multi-systems',
    topic: 'Station Systems',
    prompt: 'Select every critical system pillar the crew must balance on a surface habitat.',
    options: ['Life support', 'Power supply', 'Research lab', 'Hydroponics farm', 'Cafeteria playlist'],
    correct: [0, 1, 2, 3],
    explanation: 'Life, Power, Research, and Farm are the four interconnected mission pillars. Entertainment helps morale, but is not one of the four critical systems.',
    lesson: 'The four system pillars are Life, Power, Research, and Farm. Improving one often trades time or power from another.',
  },
  {
    id: 'multi-repair',
    topic: 'Repair',
    prompt: 'Select every job that belongs to a station repairman.',
    options: ['Patch a hull breach', 'Repair electrical wiring', 'Restart a reactor coolant loop', 'Decide the crew menu'],
    correct: [0, 1, 2],
    explanation: 'Repair work covers structure, electrical systems, and machinery. Menu planning belongs to the farmer and quartermaster.',
    lesson: 'A repairman keeps structure and machinery alive: hull patches, wiring, coolant loops, and emergency restarts.',
  },
  {
    id: 'true-hatch',
    topic: 'Safety',
    prompt: 'True or false: you should open a pressurized hatch without checking the gauge.',
    options: ['True', 'False'],
    correct: [1],
    explanation: 'Never open a pressurized hatch without confirming the pressure on both sides. Equalize first.',
    lesson: 'Check the gauge, equalize pressure, and confirm the far side is safe before opening any hatch.',
  },
  {
    id: 'comms',
    topic: 'Communication',
    prompt: 'Why should a crew report include a location, a hazard, and a request?',
    options: ['It sounds more dramatic', 'It gives responders the information they need to act', 'It fills the silence', 'It is required by the cafeteria'],
    correct: [1],
    explanation: 'A clear report answers where, what, and what help is needed. That lets the crew respond without guessing.',
    lesson: 'Operational reports are structured: location, hazard, and request. Clear reporting saves time in an emergency.',
  },
];

export const SAVE_KEY = 'spudnaut-cooperative-trial-save-v8';
export const SAVE_BACKUP_KEY = 'spudnaut-cooperative-trial-save-v8-backup';
export const LEGACY_SAVE_KEYS = ['spudnaut-cooperative-trial-save-v7'] as const;

function isColorId(value: unknown): value is PlayerColorId {
  return typeof value === 'string' && PLAYER_COLORS.some(color => color.id === value);
}

function isSpecialistId(value: unknown): value is SpecialistId {
  return typeof value === 'string' && SPECIALISTS.some(specialist => specialist.id === value);
}

function isDestinationId(value: unknown): value is DestinationId {
  return value === 'moon';
}

function isDifficultyId(value: unknown): value is DifficultyId {
  return value === 'cadet' || value === 'crew' || value === 'veteran';
}

export function defaultSave(): PlayerSave {
  return {
    version: 8,
    colorId: 'orange',
    name: 'Spudnaut',
    wins: 0,
    losses: 0,
    games: 0,
    certified: false,
    trainingComplete: false,
    trainingRank: null,
    tutorialComplete: false,
    seenMinigames: [],
    medals: 0,
    examBest: 0,
    trialDay: 0,
    activeTrial: null,
    specialist: 'repairman',
    destination: 'moon',
    options: { ...DEFAULT_OPTIONS },
  };
}

function readRawSave(): string | null {
  try {
    const current = localStorage.getItem(SAVE_KEY);
    if (current) {
      try {
        JSON.parse(current);
        return current;
      } catch {
        const backup = localStorage.getItem(SAVE_BACKUP_KEY);
        return backup ?? current;
      }
    }
    for (const key of LEGACY_SAVE_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

function parseSaveRecord(parsed: unknown): PlayerSave {
  const fallback = defaultSave();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
  const record = parsed as Partial<PlayerSave> & { version?: number };
  const options = (record.options && typeof record.options === 'object' ? record.options : {}) as Partial<GameOptions>;
  const difficulty = isDifficultyId(options.difficulty) ? options.difficulty : fallback.options.difficulty;
  const maxDaySpan = trialMaxDays(difficulty) + penaltyMaxDays(difficulty);
  return {
    version: 8,
    colorId: isColorId(record.colorId) ? record.colorId : fallback.colorId,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.slice(0, 14) : fallback.name,
    wins: Number.isFinite(record.wins) ? Number(record.wins) : 0,
    losses: Number.isFinite(record.losses) ? Number(record.losses) : 0,
    games: Number.isFinite(record.games) ? Number(record.games) : 0,
    certified: Boolean(record.certified),
    trainingComplete: Boolean(record.trainingComplete),
    trainingRank: record.trainingRank === 'S' || record.trainingRank === 'A' || record.trainingRank === 'B'
      ? record.trainingRank
      : null,
    tutorialComplete: Boolean(record.tutorialComplete),
    seenMinigames: Array.isArray(record.seenMinigames)
      ? [...new Set(record.seenMinigames.filter(id => typeof id === 'string' && id.length <= 64))].slice(0, 100)
      : [],
    medals: Number.isInteger(record.medals) ? Math.max(0, Number(record.medals)) : 0,
    examBest: Number.isFinite(record.examBest) ? Number(record.examBest) : 0,
    trialDay: Number.isFinite(record.trialDay) ? Math.max(0, Math.min(Math.max(45, maxDaySpan), Number(record.trialDay))) : 0,
    activeTrial: parseSavedTrial(record.activeTrial, difficulty),
    specialist: isSpecialistId(record.specialist) ? record.specialist : fallback.specialist,
    destination: isDestinationId(record.destination) ? record.destination : fallback.destination,
    options: {
      masterVolume: typeof options.masterVolume === 'number' ? Math.max(0, Math.min(100, options.masterVolume)) : (fallback.options.masterVolume ?? 80),
      sound: typeof options.sound === 'boolean' ? options.sound : fallback.options.sound,
      volume: typeof options.volume === 'number' ? Math.max(0, Math.min(100, options.volume)) : fallback.options.volume,
      music: typeof options.music === 'boolean' ? options.music : fallback.options.music,
      musicVolume: typeof options.musicVolume === 'number' ? Math.max(0, Math.min(100, options.musicVolume)) : fallback.options.musicVolume,
      lineOfSight: typeof options.lineOfSight === 'boolean' ? options.lineOfSight : fallback.options.lineOfSight,
      reducedMotion: typeof options.reducedMotion === 'boolean' ? options.reducedMotion : fallback.options.reducedMotion,
      showFps: typeof options.showFps === 'boolean' ? options.showFps : fallback.options.showFps,
      difficulty,
    },
  };
}

export function loadSave(): PlayerSave {
  try {
    const value = readRawSave();
    if (!value) return defaultSave();
    return parseSaveRecord(JSON.parse(value));
  } catch {
    return defaultSave();
  }
}

/** Serialize the player's save state into a portable recovery JSON payload. */
export function exportSaveJson(save: PlayerSave): string {
  return JSON.stringify({
    app: 'spudnaut',
    version: save.version,
    exportedAt: new Date().toISOString(),
    save,
  }, null, 2);
}

/** Validate and normalize a pasted or uploaded JSON save file, returning null when invalid. */
export function parseImportedSaveJson(raw: string): PlayerSave | null {
  try {
    const decoded = JSON.parse(raw) as unknown;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    const candidate = 'app' in decoded && (decoded as { app?: unknown }).app === 'spudnaut' && 'save' in decoded
      ? (decoded as { save?: unknown }).save
      : decoded;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const keys = Object.keys(candidate);
    const knownFields = ['version', 'name', 'colorId', 'options', 'wins', 'certified', 'activeTrial', 'specialist'];
    if (!keys.some(key => knownFields.includes(key))) return null;
    return parseSaveRecord(candidate);
  } catch {
    return null;
  }
}

function parseSavedTrial(value: unknown, difficulty: DifficultyId = 'crew'): SavedTrial | null {
  if (!value || typeof value !== 'object') return null;
  const trial = value as Partial<SavedTrial>;
  if (trial.phase !== 'playing' && trial.phase !== 'report' && trial.phase !== 'penalty') return null;
  const majorEventRun = parseMajorEventRun(trial.majorEventRun);
  const runDifficulty = majorEventRun?.difficulty ?? difficulty;
  const maxDays = trialMaxDays(runDifficulty);
  const maxPenalty = penaltyMaxDays(runDifficulty);
  if (!Number.isInteger(trial.day) || Number(trial.day) < 1 || Number(trial.day) > 30) return null;
  if (!Number.isInteger(trial.penaltyDay) || Number(trial.penaltyDay) < 0 || Number(trial.penaltyDay) > 15) return null;
  const day = Math.min(maxDays, Number(trial.day));
  const penaltyDay = Math.min(maxPenalty, Number(trial.penaltyDay));
  if (!Array.isArray(trial.tasks) || !trial.tasks.every(id => typeof id === 'string' && Boolean(taskById(id)))) return null;
  if (!Array.isArray(trial.completed) || !trial.completed.every(id => typeof id === 'string' && trial.tasks?.includes(id))) return null;
  if (!Number.isFinite(trial.totalAssigned) || !Number.isFinite(trial.totalCompleted) || !Number.isFinite(trial.missedDays)) return null;
  const metrics = migrateMetrics(trial.metrics);
  if (!metrics) return null;
  const parseReport = (value: unknown): EarthProgressReport | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<EarthProgressReport>;
    if (!Number.isInteger(raw.day) || !Number.isInteger(raw.completed) || !Number.isInteger(raw.assigned) || typeof raw.event !== 'string') return null;
    const validTaskIds = (ids: unknown): string[] | undefined => Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string' && Boolean(taskById(id)))
      : undefined;
    return {
      day: Number(raw.day), completed: Number(raw.completed), assigned: Number(raw.assigned), event: raw.event,
      eventId: typeof raw.eventId === 'string' ? raw.eventId : undefined,
      eventChoiceId: typeof raw.eventChoiceId === 'string' ? raw.eventChoiceId : undefined,
      metrics: raw.metrics ? migrateMetrics(raw.metrics) ?? undefined : undefined,
      tasks: validTaskIds(raw.tasks), completedTasks: validTaskIds(raw.completedTasks),
    };
  };
  const reports = Array.isArray(trial.reports)
    ? trial.reports.map(parseReport).filter((item): item is EarthProgressReport => Boolean(item))
    : [];
  const report = parseReport(trial.report);
  const planningBase = trial.planning && !trial.tasks.length ? migrateMetrics(trial.planning.eventBase) : null;
  const selected = Array.isArray(trial.planning?.selected)
    ? [...new Set(trial.planning.selected.filter(id => typeof id === 'string' && Boolean(taskById(id))))]
    : [];
  const position = trial.position;
  return {
    phase: trial.phase,
    day,
    penaltyDay,
    tasks: [...trial.tasks],
    completed: [...trial.completed],
    eventId: typeof trial.eventId === 'string' ? trial.eventId : null,
    totalAssigned: Math.max(0, Number(trial.totalAssigned)),
    totalCompleted: Math.max(0, Number(trial.totalCompleted)),
    missedDays: Math.max(0, Number(trial.missedDays)),
    metrics,
    reports: reports.slice(-maxDays - maxPenalty),
    report,
    remainingMs: typeof trial.remainingMs === 'number' && Number.isFinite(trial.remainingMs)
      ? Math.max(0, Math.min(300000, trial.remainingMs)) : undefined,
    shiftDurationMs: typeof trial.shiftDurationMs === 'number' && Number.isFinite(trial.shiftDurationMs) && trial.shiftDurationMs > 0
      ? Math.min(300000, trial.shiftDurationMs) : undefined,
    eventChoiceId: typeof trial.eventChoiceId === 'string' ? trial.eventChoiceId : undefined,
    donkiReport: isSavedDonkiReport(trial.donkiReport) ? trial.donkiReport : undefined,
    majorEventRun,
    position: position && Number.isFinite(position.x) && Number.isFinite(position.y)
      && position.x > 0 && position.x < WORLD_WIDTH && position.y > 0 && position.y < WORLD_HEIGHT
      ? { x: position.x, y: position.y } : undefined,
    pendingDisaster: trial.pendingDisaster === true,
    checkpoint: parseCheckpoint(trial.checkpoint, trial.tasks),
    planning: planningBase ? {
      eventBase: planningBase,
      selected,
      majorEventReportId: typeof trial.planning?.majorEventReportId === 'string'
        ? trial.planning.majorEventReportId : undefined,
      offers: Array.isArray(trial.planning?.offers)
        ? [...new Set(trial.planning.offers.filter(id => TASKS.some(task => task.id === id)))].slice(0, 6)
        : undefined,
    } : undefined,
  };
}

function parseCheckpoint(value: unknown, tasks: string[]): MissionCheckpoint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<MissionCheckpoint>;
  const metrics = migrateMetrics(raw.metrics);
  if (!metrics || !raw.position || !Number.isFinite(raw.position.x) || !Number.isFinite(raw.position.y)
    || raw.position.x < 0 || raw.position.x > WORLD_WIDTH || raw.position.y < 0 || raw.position.y > WORLD_HEIGHT
    || !Array.isArray(raw.completed) || !raw.completed.every(id => tasks.includes(id))
    || !Number.isInteger(raw.totalCompleted) || !Number.isFinite(raw.remainingMs)
    || (raw.reason !== 'shift-start' && raw.reason !== 'after-task' && raw.reason !== 'before-major-event')) return undefined;
  return {
    reason: raw.reason,
    metrics,
    completed: [...new Set(raw.completed)],
    totalCompleted: Math.max(raw.completed.length, Number(raw.totalCompleted)),
    remainingMs: Math.max(0, Math.min(300000, Number(raw.remainingMs))),
    position: { x: raw.position.x, y: raw.position.y },
    pendingDisaster: raw.pendingDisaster === true,
    failures: Number.isInteger(raw.failures) ? Math.max(0, Number(raw.failures)) : 0,
  };
}

function isSavedDonkiReport(
  value: unknown,
): value is DonkiReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<DonkiReport>;
  return typeof report.id === 'string'
    && (report.type === 'FLR' || report.type === 'CME' || report.type === 'SEP' || report.type === 'GST')
    && typeof report.date === 'string' && Number.isFinite(Date.parse(report.date))
    && typeof report.url === 'string'
    && typeof report.summary === 'string';
}

function parseMajorEventRun(value: unknown): MajorEventRun | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const run = value as Partial<MajorEventRun>;
  if (!Number.isInteger(run.seed) || !isDifficultyId(run.difficulty)
    || typeof run.reportsLoaded !== 'boolean' || !Array.isArray(run.candidates)
    || !Number.isInteger(run.nextCandidateIndex)) return undefined;
  const candidates = run.candidates.flatMap(candidate => {
    if (!candidate || typeof candidate !== 'object'
      || typeof candidate.triggered !== 'boolean'
      || !isSavedDonkiReport(candidate.report)) return [];
    return [{ report: candidate.report, triggered: candidate.triggered }];
  });
  return {
    seed: Number(run.seed) >>> 0,
    difficulty: run.difficulty,
    reportsLoaded: run.reportsLoaded,
    candidates,
    nextCandidateIndex: Math.max(0, Math.min(candidates.length, Number(run.nextCandidateIndex))),
  };
}

/* Migrate v7 and earlier v8 multi-metric saves cleanly to the four core pillars:
   life, power, research, and farm. */
export function migrateMetrics(value: unknown): MissionMetrics | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const readNum = (key: string): number | null | undefined => {
    if (raw[key] === undefined) return undefined;
    const metric = Number(raw[key]);
    return Number.isFinite(metric) ? Math.max(0, Math.min(100, metric)) : null;
  };
  const lifeRaw = readNum('life');
  const powerRaw = readNum('power');
  const researchRaw = readNum('research');
  const farmRaw = readNum('farm');
  const oxygen = readNum('oxygen');
  const water = readNum('water');
  const hull = readNum('hull');
  const starch = readNum('starch');
  const morale = readNum('morale');
  if ([lifeRaw, powerRaw, researchRaw, farmRaw, oxygen, water, hull, starch, morale].some(metric => metric === null)) {
    return null;
  }
  const lifeParts = [oxygen, water, hull].filter((v): v is number => v !== undefined);
  const life = lifeRaw ?? (lifeParts.length
    ? Math.round(lifeParts.reduce((sum, v) => sum + v, 0) / lifeParts.length)
    : 80);
  const farm = farmRaw ?? (starch ?? 78);
  return {
    life,
    power: powerRaw ?? 76,
    research: researchRaw ?? 30,
    farm,
  };
}

export function persistSave(save: PlayerSave, { replaceBackup = false } = {}): boolean {
  try {
    const serialized = JSON.stringify(save);
    if (replaceBackup) {
      localStorage.setItem(SAVE_BACKUP_KEY, serialized);
      localStorage.setItem(SAVE_KEY, serialized);
      return true;
    }
    const previous = localStorage.getItem(SAVE_KEY);
    if (previous) {
      try {
        JSON.parse(previous);
        localStorage.setItem(SAVE_BACKUP_KEY, previous);
      } catch {
        // Keep the last known-good backup when the current value is corrupt.
      }
    }
    localStorage.setItem(SAVE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function roomById(id: string): RoomDef | undefined {
  return ROOMS.find(room => room.id === id);
}

export function getRoomName(id: string): string {
  const byId = roomById(id);
  if (byId) return byId.name;
  const byName = ROOMS.find(room => room.name.toLowerCase() === id.toLowerCase());
  return byName?.name ?? (id || 'Station Corridor');
}

export function roomAt(x: number, y: number): RoomDef | undefined {
  return ROOMS.find(room => x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h);
}

export function taskById(id: string): TaskDef | undefined {
  return STATION_TASKS.find(task => task.id === id);
}

export function specialistById(id: SpecialistId): Specialist {
  return SPECIALISTS.find(specialist => specialist.id === id) ?? SPECIALISTS[0];
}

export function destinationById(id: DestinationId): Destination {
  return DESTINATIONS.find(destination => destination.id === id) ?? DESTINATIONS[0];
}

export function cssColor(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}
