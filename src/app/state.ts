import type {
  EarthProgressReport, ExamQuestion, GamePhase, TrialProgress,
} from '../model';
import { PLAYER_SPAWN } from '../model';
import { TRAINING_DECK } from '../data/trainingDeck';
import type { EventCard } from '../data/events';
import { createMetrics, type AssignmentOffer } from '../sim/mission';
import type { SceneGameState } from '../game';

export type ScreenId =
  | 'splash' | 'menu' | 'options' | 'credits' | 'story' | 'exam'
  | 'remedial' | 'graduation' | 'lobby' | 'launch' | 'training' | 'mission';

export interface MissionState extends TrialProgress {
  phase: GamePhase;
  dayStartedAt: number;
  pausedDuration: number;
  pauseStartedAt: number;
  tasks: string[];
  completed: string[];
  offers: AssignmentOffer[];
  selected: string[];
  eventCard: EventCard | null;
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

export function createMissionState(): MissionState {
  return {
    phase: 'menu', day: 1, penaltyDay: 0, totalAssigned: 0, totalCompleted: 0,
    missedDays: 0, metrics: createMetrics(), dayStartedAt: 0, pausedDuration: 0,
    pauseStartedAt: 0, tasks: [], completed: [], offers: [], selected: [],
    eventCard: null, playerX: PLAYER_SPAWN.x, playerY: PLAYER_SPAWN.y,
    room: 'Cafeteria', report: null, reports: [], modalOpen: false,
  };
}

export function createTrainingState(): TrainingState {
  return {
    completed: [], crew: [], x: TRAINING_DECK.spawn.x, y: TRAINING_DECK.spawn.y,
    room: 'Cafeteria', modalOpen: false,
  };
}
