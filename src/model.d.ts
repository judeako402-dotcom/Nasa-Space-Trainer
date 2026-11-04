export type PlayerColorId = 'red' | 'blue' | 'green' | 'pink' | 'orange' | 'yellow' | 'black' | 'white' | 'purple' | 'cyan' | 'lime' | 'brown';
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
export type MissionMetric = 'power' | 'oxygen' | 'water' | 'starch' | 'hull' | 'morale' | 'research';
export interface MissionMetrics {
    power: number;
    oxygen: number;
    water: number;
    starch: number;
    hull: number;
    morale: number;
    research: number;
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
export interface SavedTrial extends TrialProgress {
    phase: 'playing' | 'report' | 'penalty';
    tasks: string[];
    completed: string[];
    eventId: string | null;
    reports: EarthProgressReport[];
    report: EarthProgressReport | null;
    remainingMs?: number;
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
export type TaskKind = 'wiring' | 'swipe' | 'download' | 'fuel' | 'calibrate' | 'inspect' | 'shield' | 'garbage' | 'cards';
export interface TaskDef {
    id: string;
    name: string;
    kind: TaskKind;
    roomId: string;
    x: number;
    y: number;
    system?: 'power' | 'life' | 'farming' | 'shielding' | 'science';
}
export interface GameOptions {
    masterVolume?: number;
    sound: boolean;
    volume: number;
    music: boolean;
    musicVolume: number;
    lineOfSight: boolean;
    reducedMotion: boolean;
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
export declare const WORLD_WIDTH = 2600;
export declare const WORLD_HEIGHT = 1880;
export declare const PLAYER_COLORS: PlayerColor[];
export declare function getColor(id: PlayerColorId): PlayerColor;
export declare const ROOMS: RoomDef[];
export declare const CORRIDORS: CorridorDef[];
export declare const TASKS: TaskDef[];
export declare const PLAYER_SPAWN: {
    x: number;
    y: number;
};
export declare const SPECIALISTS: Specialist[];
export declare const DESTINATIONS: Destination[];
export declare const TASK_RANGE = 82;
export declare const TRIAL_MAX_DAY = 30;
export declare const PENALTY_MAX_DAY = 15;
export declare const EXAM_QUESTION_COUNT = 8;
export declare const EXAM_PASS_RATIO = 0.7;
export declare const DIFFICULTY_INFO: Record<DifficultyId, {
    name: string;
    description: string;
}>;
export declare const DEFAULT_OPTIONS: GameOptions;
export declare const DEFAULT_LOBBY: LobbySettings;
export declare const EXAM_QUESTIONS: ExamQuestion[];
export declare const SAVE_KEY = "spudnaut-cooperative-trial-save-v8";
export declare const SAVE_BACKUP_KEY = "spudnaut-cooperative-trial-save-v8-backup";
export declare const LEGACY_SAVE_KEYS: readonly ["spudnaut-cooperative-trial-save-v7"];
export declare function defaultSave(): PlayerSave;
export declare function loadSave(): PlayerSave;
export declare function persistSave(save: PlayerSave): void;
export declare function shuffle<T>(items: T[]): T[];
export declare function roomById(id: string): RoomDef | undefined;
export declare function getRoomName(id: string): string;
export declare function roomAt(x: number, y: number): RoomDef | undefined;
export declare function taskById(id: string): TaskDef | undefined;
export declare function specialistById(id: SpecialistId): Specialist;
export declare function destinationById(id: DestinationId): Destination;
export declare function cssColor(value: number): string;
