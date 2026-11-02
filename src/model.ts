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
export type DestinationId = 'moon' | 'mars';
export type SpecialistId = 'repairman' | 'farmer' | 'traveller' | 'researcher' | 'shield';
export type DifficultyId = 'cadet' | 'crew' | 'veteran';
export type MissionMetric = 'oxygen' | 'starch' | 'morale' | 'research';

export interface MissionMetrics {
  oxygen: number;
  starch: number;
  morale: number;
  research: number;
}

export interface EarthProgressReport {
  day: number;
  completed: number;
  assigned: number;
  event: string;
}

export interface TrialProgress {
  day: number;
  penaltyDay: number;
  totalAssigned: number;
  totalCompleted: number;
  missedDays: number;
  metrics: MissionMetrics;
}

export interface SavedTrial extends TrialProgress {
  phase: 'playing' | 'report' | 'penalty';
  tasks: string[];
  completed: string[];
  reports: EarthProgressReport[];
  report: EarthProgressReport | null;
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
  | 'asteroids'
  | 'shield'
  | 'garbage';

export interface TaskDef {
  id: string;
  name: string;
  kind: TaskKind;
  roomId: string;
  x: number;
  y: number;
}


export interface GameOptions {
  sound: boolean;
  volume: number;
  reducedMotion: boolean;
  difficulty: DifficultyId;
}

export interface PlayerSave {
  version: 7;
  colorId: PlayerColorId;
  name: string;
  wins: number;
  losses: number;
  games: number;
  certified: boolean;
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

export const WORLD_WIDTH = 2600;
export const WORLD_HEIGHT = 1560;

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
  { id: 'upper-engine', name: 'Upper Engine', x: 120, y: 130, w: 300, h: 300, tint: 0x49556a, icon: '⚙' },
  { id: 'reactor', name: 'Reactor', x: 120, y: 520, w: 320, h: 360, tint: 0x5b4654, icon: '◉' },
  { id: 'lower-engine', name: 'Lower Engine', x: 120, y: 1000, w: 300, h: 300, tint: 0x49556a, icon: '⚙' },
  { id: 'medbay', name: 'MedBay', x: 520, y: 380, w: 340, h: 300, tint: 0x3f6a69, icon: '✚' },
  { id: 'cafeteria', name: 'Cafeteria', x: 960, y: 110, w: 600, h: 430, tint: 0x5a6b86, icon: '☕' },
  { id: 'weapons', name: 'Weapons', x: 1720, y: 150, w: 320, h: 300, tint: 0x4c5874, icon: '✦' },
  { id: 'navigation', name: 'Navigation', x: 2160, y: 240, w: 320, h: 300, tint: 0x3d5574, icon: '✧' },
  { id: 'o2', name: 'O2', x: 1740, y: 540, w: 250, h: 230, tint: 0x3e6a58, icon: '❋' },
  { id: 'admin', name: 'Admin', x: 2050, y: 650, w: 340, h: 300, tint: 0x476252, icon: '▤' },
  { id: 'storage', name: 'Storage', x: 920, y: 860, w: 460, h: 420, tint: 0x5e5040, icon: '▦' },
  { id: 'electrical', name: 'Electrical', x: 1450, y: 1010, w: 290, h: 300, tint: 0x625c3d, icon: '⚡' },
  { id: 'security', name: 'Security', x: 540, y: 980, w: 300, h: 290, tint: 0x45516b, icon: '◈' },
  { id: 'shields', name: 'Shields', x: 1800, y: 1040, w: 340, h: 300, tint: 0x3f6268, icon: '◍' },
  { id: 'communications', name: 'Comms', x: 2200, y: 1050, w: 300, h: 260, tint: 0x4b4470, icon: '⌁' },
];

export const CORRIDORS: CorridorDef[] = [
  { x: 420, y: 250, w: 546, h: 100 },
  { x: 1560, y: 260, w: 166, h: 100 },
  { x: 2040, y: 320, w: 126, h: 100 },
  { x: 1780, y: 444, w: 100, h: 100 },
  { x: 1984, y: 655, w: 72, h: 100 },
  { x: 2220, y: 540, w: 100, h: 116 },
  { x: 2160, y: 944, w: 100, h: 112 },
  { x: 2140, y: 1120, w: 66, h: 100 },
  { x: 1210, y: 540, w: 100, h: 326 },
  { x: 1380, y: 1080, w: 76, h: 100 },
  { x: 1734, y: 1080, w: 72, h: 100 },
  { x: 840, y: 1070, w: 86, h: 100 },
  { x: 420, y: 1070, w: 126, h: 100 },
  { x: 220, y: 874, w: 100, h: 132 },
  { x: 440, y: 650, w: 86, h: 100 },
  { x: 220, y: 430, w: 100, h: 96 },
  { x: 860, y: 460, w: 106, h: 100 },
  { x: 660, y: 680, w: 100, h: 306 },
];

export const TASKS: TaskDef[] = [
  { id: 'fuel-upper', name: 'Fuel Engines', kind: 'fuel', roomId: 'upper-engine', x: 280, y: 210 },
  { id: 'align-engine', name: 'Align Engine', kind: 'calibrate', roomId: 'upper-engine', x: 200, y: 330 },
  { id: 'wiring-cafeteria', name: 'Fix Wiring', kind: 'wiring', roomId: 'cafeteria', x: 1170, y: 200 },
  { id: 'garbage', name: 'Empty Garbage', kind: 'garbage', roomId: 'cafeteria', x: 1090, y: 450 },
  { id: 'asteroids', name: 'Clear Asteroids', kind: 'asteroids', roomId: 'weapons', x: 1880, y: 260 },
  { id: 'steering', name: 'Stabilize Steering', kind: 'calibrate', roomId: 'navigation', x: 2280, y: 330 },
  { id: 'download-nav', name: 'Download Data', kind: 'download', roomId: 'navigation', x: 2390, y: 450 },
  { id: 'reactor-start', name: 'Start Reactor', kind: 'calibrate', roomId: 'reactor', x: 260, y: 650 },
  { id: 'inspect', name: 'Inspect Sample', kind: 'inspect', roomId: 'medbay', x: 650, y: 470 },
  { id: 'calibrate', name: 'Calibrate Distributor', kind: 'calibrate', roomId: 'electrical', x: 1590, y: 1100 },
  { id: 'swipe', name: 'Swipe Card', kind: 'swipe', roomId: 'admin', x: 2230, y: 750 },
  { id: 'upload-admin', name: 'Upload Data', kind: 'download', roomId: 'admin', x: 2130, y: 860 },
  { id: 'fuel-storage', name: 'Fuel Storage', kind: 'fuel', roomId: 'storage', x: 1040, y: 1120 },
  { id: 'shields', name: 'Prime Shields', kind: 'shield', roomId: 'shields', x: 1960, y: 1160 },
  { id: 'wiring-electrical', name: 'Fix Wiring', kind: 'wiring', roomId: 'electrical', x: 1520, y: 1210 },
  { id: 'review-cams', name: 'Review Cameras', kind: 'download', roomId: 'security', x: 640, y: 1080 },
  { id: 'clean-o2', name: 'Clean O2 Filter', kind: 'garbage', roomId: 'o2', x: 1850, y: 610 },
  { id: 'reboot-comms', name: 'Reboot Comms', kind: 'calibrate', roomId: 'communications', x: 2330, y: 1140 },
];

export const PLAYER_SPAWN = { x: 1120, y: 360 };

export const SPECIALISTS: Specialist[] = [
  {
    id: 'repairman',
    name: 'Repairman',
    shortName: 'REPAIR',
    role: 'Station Systems',
    art: '/assets/potato-repairman.png',
    perk: 'Improves oxygen recovery after completed repairs.',
    description: 'You know every bolt on the station. When the alarms start, you keep the air inside.',
    accent: '#f2b544',
  },
  {
    id: 'farmer',
    name: 'Farmer',
    shortName: 'FARM',
    role: 'Hydroponics',
    art: '/assets/potato-farmer.png',
    perk: 'Improves starch integrity after completed assignments.',
    description: 'Soil, water, light. You can grow a meal in a crater and make it taste like home.',
    accent: '#9bd15a',
  },
  {
    id: 'traveller',
    name: 'Traveller',
    shortName: 'TRAVEL',
    role: 'Surface Scouting',
    art: '/assets/potato-traveller.png',
    perk: 'Moves 18% faster through the station.',
    description: 'You have walked every dust field on the training map. A long corridor is a short walk.',
    accent: '#e9c27b',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    shortName: 'RESEARCH',
    role: 'Science & Samples',
    art: '/assets/potato-researcher.png',
    perk: 'Adds research progress for completed science assignments.',
    description: 'You ask questions for a living. The crew will hear your evidence, even twice.',
    accent: '#78d8e8',
  },
  {
    id: 'shield',
    name: 'Shield Expert',
    shortName: 'SHIELD',
    role: 'Radiation & Hull',
    art: '/assets/potato-default.png',
    perk: 'Reduces the habitat impact of missed assignments.',
    description: 'You build walls around problems. The reactor will hold while you get there.',
    accent: '#ba9df0',
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
  {
    id: 'mars',
    name: 'Mars',
    tagline: 'Thin air. Long horizon.',
    description: 'A rust-red basin beneath a butterscotch sky, with thin carbon dioxide air and seasonal dust storms.',
    accent: '#e98a5c',
    gravity: '0.38 G',
    hazard: 'Solar dust storms',
  },
];

export const TASK_RANGE = 82;
export const TRIAL_MAX_DAY = 30;
export const PENALTY_MAX_DAY = 15;
export const EXAM_QUESTION_COUNT = 8;
export const EXAM_PASS_RATIO = 0.7;

export const DIFFICULTY_INFO: Record<DifficultyId, { name: string; description: string }> = {
  cadet: { name: 'Cadet', description: 'A little more time to finish each day.' },
  crew: { name: 'Crew', description: 'The intended trial experience.' },
  veteran: { name: 'Veteran', description: 'A tighter schedule and harsher conditions.' },
};

export const DEFAULT_OPTIONS: GameOptions = {
  sound: true,
  volume: 60,
  reducedMotion: false,
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
    prompt: 'Which suit layer is designed to stop tiny micrometeoroids?',
    options: ['The soft thermal underlayer', 'The hard upper torso shell', 'The cotton neck seal', 'The mission patch'],
    correct: [1],
    explanation: 'The hard upper torso distributes impacts across a rigid shell. The soft layers handle temperature and flexibility.',
    lesson: 'Suit layers have separate jobs: thermal control, pressure retention, mobility, and impact protection. The rigid shell absorbs micrometeoroid hits.',
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
    topic: 'Shielding',
    prompt: 'Which shielding approach is most effective against cosmic radiation?',
    options: ['A thin sheet of aluminum foil', 'Water-rich or polyethylene layers', 'A layer of dried potato peel', 'A painted hull'],
    correct: [1],
    explanation: 'Hydrogen-rich materials such as water and polyethylene slow energetic particles effectively.',
    lesson: 'Cosmic rays are best slowed by dense, hydrogen-rich material. Water walls and polyethylene panels are practical habitat shields.',
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
    prompt: 'Select every critical system the crew must balance on a surface habitat.',
    options: ['Power supply', 'Life support', 'Farming', 'Radiation and hull shielding', 'Cafeteria playlist'],
    correct: [0, 1, 2, 3],
    explanation: 'Power, air and water, food, and shielding are the four interconnected survival systems. Entertainment helps morale, but it is not critical.',
    lesson: 'The four system conflicts are power, life support, farming, and radiation/hull shielding. Improving one usually costs another.',
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

export const SAVE_KEY = 'spudnaut-cooperative-trial-save-v7';

function isColorId(value: unknown): value is PlayerColorId {
  return typeof value === 'string' && PLAYER_COLORS.some(color => color.id === value);
}

function isSpecialistId(value: unknown): value is SpecialistId {
  return typeof value === 'string' && SPECIALISTS.some(specialist => specialist.id === value);
}

function isDestinationId(value: unknown): value is DestinationId {
  return value === 'moon' || value === 'mars';
}

function isDifficultyId(value: unknown): value is DifficultyId {
  return value === 'cadet' || value === 'crew' || value === 'veteran';
}

function defaultSave(): PlayerSave {
  return {
    version: 7,
    colorId: 'orange',
    name: 'Spudnaut',
    wins: 0,
    losses: 0,
    games: 0,
    certified: false,
    examBest: 0,
    trialDay: 0,
    activeTrial: null,
    specialist: 'repairman',
    destination: 'moon',
    options: { ...DEFAULT_OPTIONS },
  };
}

export function loadSave(): PlayerSave {
  try {
    const value = localStorage.getItem(SAVE_KEY);
    if (!value) return defaultSave();
    const parsed = JSON.parse(value) as Partial<PlayerSave> & { version?: number };
    const fallback = defaultSave();
    const options = (parsed.options ?? {}) as Partial<GameOptions>;
    return {
      version: 7,
      colorId: isColorId(parsed.colorId) ? parsed.colorId : fallback.colorId,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.slice(0, 14) : fallback.name,
      wins: Number.isFinite(parsed.wins) ? Number(parsed.wins) : 0,
      losses: Number.isFinite(parsed.losses) ? Number(parsed.losses) : 0,
      games: Number.isFinite(parsed.games) ? Number(parsed.games) : 0,
      certified: Boolean(parsed.certified),
      examBest: Number.isFinite(parsed.examBest) ? Number(parsed.examBest) : 0,
      trialDay: Number.isFinite(parsed.trialDay) ? Math.max(0, Math.min(TRIAL_MAX_DAY, Number(parsed.trialDay))) : 0,
      activeTrial: parseSavedTrial(parsed.activeTrial),
      specialist: isSpecialistId(parsed.specialist) ? parsed.specialist : fallback.specialist,
      destination: isDestinationId(parsed.destination) ? parsed.destination : fallback.destination,
      options: {
        sound: typeof options.sound === 'boolean' ? options.sound : fallback.options.sound,
        volume: typeof options.volume === 'number' ? Math.max(0, Math.min(100, options.volume)) : fallback.options.volume,
        reducedMotion: typeof options.reducedMotion === 'boolean' ? options.reducedMotion : fallback.options.reducedMotion,
        difficulty: isDifficultyId(options.difficulty) ? options.difficulty : fallback.options.difficulty,
      },
    };
  } catch {
    return defaultSave();
  }
}

function parseSavedTrial(value: unknown): SavedTrial | null {
  if (!value || typeof value !== 'object') return null;
  const trial = value as Partial<SavedTrial>;
  if (trial.phase !== 'playing' && trial.phase !== 'report' && trial.phase !== 'penalty') return null;
  if (!Number.isInteger(trial.day) || Number(trial.day) < 1 || Number(trial.day) > TRIAL_MAX_DAY) return null;
  if (!Number.isInteger(trial.penaltyDay) || Number(trial.penaltyDay) < 0 || Number(trial.penaltyDay) > PENALTY_MAX_DAY) return null;
  if (!Array.isArray(trial.tasks) || !trial.tasks.every(id => typeof id === 'string' && TASKS.some(task => task.id === id))) return null;
  if (!Array.isArray(trial.completed) || !trial.completed.every(id => typeof id === 'string' && trial.tasks?.includes(id))) return null;
  if (!Number.isFinite(trial.totalAssigned) || !Number.isFinite(trial.totalCompleted) || !Number.isFinite(trial.missedDays)) return null;
  if (!trial.metrics || !['oxygen', 'starch', 'morale', 'research'].every(key => {
    const metric = trial.metrics?.[key as keyof MissionMetrics];
    return typeof metric === 'number' && Number.isFinite(metric) && metric >= 0 && metric <= 100;
  })) return null;
  const reports = Array.isArray(trial.reports) ? trial.reports.filter((report): report is EarthProgressReport => (
    Boolean(report)
    && Number.isInteger(report.day)
    && Number.isInteger(report.completed)
    && Number.isInteger(report.assigned)
    && typeof report.event === 'string'
  )) : [];
  const report = trial.report && Number.isInteger(trial.report.day)
    && Number.isInteger(trial.report.completed) && Number.isInteger(trial.report.assigned)
    && typeof trial.report.event === 'string'
    ? trial.report
    : null;
  return {
    phase: trial.phase,
    day: Number(trial.day),
    penaltyDay: Number(trial.penaltyDay),
    tasks: [...trial.tasks],
    completed: [...trial.completed],
    totalAssigned: Math.max(0, Number(trial.totalAssigned)),
    totalCompleted: Math.max(0, Number(trial.totalCompleted)),
    missedDays: Math.max(0, Number(trial.missedDays)),
    metrics: { ...trial.metrics },
    reports: reports.slice(-TRIAL_MAX_DAY - PENALTY_MAX_DAY),
    report,
  };
}

export function persistSave(save: PlayerSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* Storage can be disabled in private browsing. */
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
  return roomById(id)?.name ?? 'Unknown room';
}

export function roomAt(x: number, y: number): RoomDef | undefined {
  return ROOMS.find(room => x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h);
}

export function taskById(id: string): TaskDef | undefined {
  return TASKS.find(task => task.id === id);
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
