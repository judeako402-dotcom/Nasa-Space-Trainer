import type {
  DifficultyId, EarthProgressReport, ExamQuestion, GamePhase, MajorEventRun, MissionCheckpoint, MissionOpening, SavedTrial, TrialProgress,
} from '../model';
import { PLAYER_SPAWN } from '../model';
import { TRAINING_DECK } from '../data/trainingDeck';
import type { EventCard } from '../data/events';
import { createMetrics, type AssignmentOffer } from '../sim/mission';
import { createMajorEventRun } from '../sim/majorEvents';
import type { SceneGameState } from '../game';

export type ScreenId =
  | 'splash' | 'menu' | 'play-intro' | 'options' | 'credits' | 'story' | 'exam'
  | 'remedial' | 'graduation' | 'lobby' | 'launch' | 'training' | 'mission' | 'ending';

export interface MissionState extends TrialProgress {
  phase: GamePhase;
  dayStartedAt: number;
  shiftDurationMs: number;
  pausedDuration: number;
  pauseStartedAt: number;
  tasks: string[];
  completed: string[];
  offers: AssignmentOffer[];
  selected: string[];
  eventCard: EventCard | null;
  majorEventRun: MajorEventRun;
  pendingDisaster: boolean;
  opening?: MissionOpening;
  hudBriefing?: SavedTrial['hudBriefing'];
  spotlightGuide?: boolean;
  checkpoint?: MissionCheckpoint;
  playerX: number;
  playerY: number;
  room: string;
  report: EarthProgressReport | null;
  reports: EarthProgressReport[];
  modalOpen: boolean;
}

export interface TrainingState {
  completed: string[];
  crew: string[];
  x: number;
  y: number;
  room: string;
  modalOpen: boolean;
}

export interface ExamState {
  questions: ExamQuestion[];
  index: number;
  score: number;
  selected: number[];
  submitted: boolean;
  missed: ExamQuestion[];
}

export interface PromptState { id: string | null; name: string; kind: string; room: string }
export interface PendingScene { state: SceneGameState; respawn: boolean }

export const createInitialExam = (): ExamState => ({
  questions: [], index: 0, score: 0, selected: [], submitted: false, missed: [],
});

export function createMissionState(difficulty: DifficultyId = 'crew'): MissionState {
  return {
    phase: 'menu', day: 1, penaltyDay: 0, totalAssigned: 0, totalCompleted: 0,
    missedDays: 0, metrics: createMetrics(), dayStartedAt: 0, shiftDurationMs: 0, pausedDuration: 0,
    pauseStartedAt: 0, tasks: [], completed: [], offers: [], selected: [],
    eventCard: null, pendingDisaster: false, majorEventRun: createMajorEventRun(undefined, difficulty),
    playerX: PLAYER_SPAWN.x, playerY: PLAYER_SPAWN.y,
    room: 'Central Hub', report: null, reports: [], modalOpen: false,
  };
}

export function remainingShiftMs(
  shift: Pick<MissionState, 'shiftDurationMs' | 'dayStartedAt' | 'pauseStartedAt' | 'pausedDuration'>,
  now: number,
): number {
  const elapsed = (shift.pauseStartedAt || now) - shift.dayStartedAt - shift.pausedDuration;
  return Math.max(0, shift.shiftDurationMs - Math.max(0, elapsed));
}

export function createTrainingState(): TrainingState {
  return {
    completed: [], crew: [], x: TRAINING_DECK.spawn.x, y: TRAINING_DECK.spawn.y,
    room: 'Cafeteria', modalOpen: false,
  };
}

/** True when a world coordinate is on the external Landing Pad apron outside the airlock door. */
export function isExteriorApron(pos: { x: number; y: number }): boolean {
  return pos.x >= 1460 && pos.x <= 1940 && pos.y >= 1776;
}

/** True when a room name or world position lies in an unpressurized EVA zone. */
function isVacuumZone(roomName: string, pos?: { x: number; y: number }): boolean {
  const normalized = roomName.toLowerCase();
  if (
    normalized.includes('airlock')
    || normalized.includes('landing pad')
    || normalized.includes('exterior')
  ) {
    return true;
  }
  return Boolean(pos && isExteriorApron(pos));
}

/** True when entering an unpressurized/airlock room or low life-support state should auto-seal the helmet. */
export function shouldAutoSealHelmet(roomName: string, life: number, pos?: { x: number; y: number }): boolean {
  return isVacuumZone(roomName, pos) || life < 45;
}

/** True when the astronaut is in an unpressurized EVA zone without a sealed helmet. */
export function isUnpressurizedHazard(
  roomName: string,
  helmetSealed: boolean,
  pos?: { x: number; y: number },
): boolean {
  return !helmetSealed && isVacuumZone(roomName, pos);
}
