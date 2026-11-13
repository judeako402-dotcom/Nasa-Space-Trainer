import {
  DEFAULT_LOBBY, DESTINATIONS, DIFFICULTY_INFO, EXAM_PASS_RATIO, EXAM_QUESTION_COUNT,
  EXAM_QUESTIONS, PLAYER_COLORS, PENALTY_MAX_DAY, SPECIALISTS, TASKS,
  TRIAL_MAX_DAY, PLAYER_SPAWN, SAVE_BACKUP_KEY, SAVE_KEY, defaultSave, destinationById, getColor, getRoomName, loadSave, persistSave, shuffle,
  specialistById, taskById,
} from './model';
import type {
  DestinationId, DifficultyId, EarthProgressReport, LobbySettings,
  MissionMetrics, PlayerColorId, PlayerSave, SavedTrial, SpecialistId, TaskKind,
} from './model';
import { DAILY_OPERATIONS_DRIFT, DAY, PASS_THRESHOLDS, SYSTEMS } from './data/balance';
import { EVENT_CARDS } from './data/events';
import type { MapDefinition } from './data/mapTypes';
import { STORY_BEATS } from './data/story';
import { surfaceHabitatFor } from './data/surfaceHabitat';
import { GAME_MODEL_NOTE, NASA_REFERENCES, scienceBrief } from './data/science';
import { TRAINING_DECK } from './data/trainingDeck';
import {
  applyDailyOperations, applyEvent, applyMissedDay, applyTaskCompletion, assignmentOffer, createMetrics, evaluateMission,
  eventForDay, metricDeltas, offersForDay, systemHealth,
} from './sim/mission';
import { createRng, seedFor } from './sim/rng';
import type { createStationGame } from './game';
import type { GameEvent, SceneGameState } from './game';
import { renderTaskGame } from './minigames';
import { configureSfx, sfx } from './sfx';
import { configureMusic, startMusic, stopMusic } from './audio/music';
import './styles/style.css';
import './styles/ui-kit.css';
import {
  createInitialExam, createMissionState, createTrainingState, remainingShiftMs,
} from './app/state';
import type {
  ExamState, MissionState, PendingScene, PromptState, ScreenId, TrainingState,
} from './app/state';

const TRAINING_TASK_KINDS: Record<string, TaskKind> = {
  'sys-power': 'calibrate',
  'sys-life': 'wiring',
  'sys-farming': 'inspect',
  'sys-shielding': 'shield',
  sample: 'inspect',
};

const TRAINING_SYSTEM_IDS = ['sys-power', 'sys-life', 'sys-farming', 'sys-shielding'] as const;

const METRIC_LABELS: Record<keyof MissionMetrics, string> = {
  power: 'Power',
  oxygen: 'Oxygen',
  water: 'Water',
  starch: 'Starch',
  hull: 'Shielding / Hull',
  morale: 'Morale',
  research: 'Research',
};

let save: PlayerSave = loadSave();
let lobby: LobbySettings = {
  ...DEFAULT_LOBBY,
  playerName: save.name,
  colorId: save.colorId,
  specialist: save.specialist,
  destination: save.destination,
};
let currentScreen: ScreenId = 'splash';
let exam: ExamState = createInitialExam();
let remediationIndex = 0;
let mission: MissionState = createMissionState();
let training: TrainingState = createTrainingState();
let trainingHudExpanded = false;
let planningEventBase: MissionMetrics | null = null;
let selectedEventChoice = '';
let game: PhaserGame | null = null;
let launchGame: PhaserGame | null = null;
let sceneReady = false;
let pendingScene: PendingScene | null = null;
let loopTimer = 0;
let splashTimer = 0;
let gameLoadPromise: Promise<PhaserGame> | null = null;
let currentPrompt: PromptState = { id: null, name: '', kind: '', room: 'Cafeteria' };

/* Phaser's full type is only needed for the game handle. Importing the namespace
   keeps this file's runtime surface focused on the DOM and the simulation. */
type PhaserGame = ReturnType<typeof createStationGame>;

function ensureStationGame(): Promise<PhaserGame> {
  if (game) return Promise.resolve(game);
  if (!gameLoadPromise) {
    gameLoadPromise = import('./game').then(({ createStationGame }) => {
      if (!game) game = createStationGame(document.querySelector<HTMLDivElement>('#game-canvas')!, onGameEvent);
      return game;
    }).finally(() => { gameLoadPromise = null; });
  }
  return gameLoadPromise;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root element.');

type ConstellationIconId =
  | 'play'
  | 'training'
  | 'options'
  | 'back'
  | 'masterVolume'
  | 'musicVolume'
  | 'sfxVolume'
  | 'reset'
  | 'abort'
  | 'map'
  | 'tasks'
  | 'log'
  | 'help'
  | 'close'
  | 'skip'
  | 'randomize'
  | 'vision'
  | 'cert'
  | 'launch'
  | 'forward'
  | 'fps';

const CONSTELLATION_ICON_MARKUP: Record<ConstellationIconId, string> = {
  fps: '<circle cx="18" cy="18" r="10" fill="none" /><line x1="18" y1="18" x2="25" y2="12" /><line x1="8" y1="18" x2="11" y2="18" /><line x1="18" y1="8" x2="18" y2="11" /><line x1="25" y1="18" x2="28" y2="18" /><circle cx="18" cy="18" r="2.3" /><circle cx="25" cy="12" r="2.0" /><circle cx="18" cy="8" r="1.7" />',
  play: '<line x1="8" y1="10" x2="26" y2="16" /><line x1="26" y1="16" x2="14" y2="27" /><line x1="14" y1="27" x2="8" y2="10" /><circle cx="8" cy="10" r="2.5" /><circle cx="26" cy="16" r="3" /><circle cx="14" cy="27" r="2.2" />',
  training: '<line x1="9" y1="9" x2="27" y2="27" /><line x1="27" y1="9" x2="9" y2="27" /><circle cx="9" cy="9" r="2.2" /><circle cx="27" cy="27" r="2.2" /><circle cx="27" cy="9" r="2.2" /><circle cx="9" cy="27" r="2.2" /><circle cx="18" cy="18" r="2.6" />',
  options: '<circle cx="18" cy="18" r="5" fill="none" /><line x1="18" y1="5" x2="18" y2="10" /><line x1="18" y1="26" x2="18" y2="31" /><line x1="5" y1="18" x2="10" y2="18" /><line x1="26" y1="18" x2="31" y2="18" />',
  back: '<line x1="21" y1="8" x2="9" y2="18" /><line x1="9" y1="18" x2="21" y2="28" /><line x1="9" y1="18" x2="27" y2="18" /><circle cx="21" cy="8" r="2.2" /><circle cx="9" cy="18" r="2.8" /><circle cx="21" cy="28" r="2.2" /><circle cx="27" cy="18" r="2.1" />',
  masterVolume: '<line x1="7" y1="14" x2="12" y2="14" /><line x1="12" y1="14" x2="19" y2="8" /><line x1="19" y1="8" x2="19" y2="28" /><line x1="19" y1="28" x2="12" y2="22" /><line x1="12" y1="22" x2="7" y2="22" /><line x1="7" y1="22" x2="7" y2="14" /><line x1="24" y1="12" x2="28" y2="18" /><line x1="28" y1="18" x2="24" y2="24" /><circle cx="7" cy="14" r="1.9" /><circle cx="19" cy="8" r="2.3" /><circle cx="19" cy="28" r="2.3" /><circle cx="7" cy="22" r="1.9" /><circle cx="24" cy="12" r="2.0" /><circle cx="28" cy="18" r="2.5" /><circle cx="24" cy="24" r="2.0" />',
  musicVolume: '<line x1="13" y1="10" x2="27" y2="7" /><line x1="13" y1="10" x2="13" y2="25" /><line x1="27" y1="7" x2="27" y2="22" /><circle cx="13" cy="10" r="2.0" /><circle cx="27" cy="7" r="2.0" /><circle cx="11.5" cy="25" r="3.0" /><circle cx="25.5" cy="22" r="3.0" />',
  sfxVolume: '<line x1="5" y1="18" x2="10" y2="18" /><line x1="10" y1="18" x2="15" y2="8" /><line x1="15" y1="8" x2="21" y2="28" /><line x1="21" y1="28" x2="26" y2="12" /><line x1="26" y1="12" x2="31" y2="18" /><circle cx="5" cy="18" r="1.9" /><circle cx="15" cy="8" r="2.4" /><circle cx="21" cy="28" r="2.4" /><circle cx="26" cy="12" r="2.2" /><circle cx="31" cy="18" r="1.9" />',
  reset: '<line x1="18" y1="8" x2="26" y2="13" /><line x1="26" y1="13" x2="26" y2="23" /><line x1="26" y1="23" x2="18" y2="28" /><line x1="18" y1="28" x2="10" y2="23" /><line x1="10" y1="23" x2="10" y2="13" /><line x1="10" y1="13" x2="15" y2="10" /><line x1="10" y1="13" x2="15" y2="16" /><circle cx="18" cy="8" r="2.0" /><circle cx="26" cy="13" r="2.0" /><circle cx="26" cy="23" r="2.0" /><circle cx="18" cy="28" r="2.0" /><circle cx="10" cy="23" r="2.0" /><circle cx="10" cy="13" r="2.5" />',
  abort: '<polygon points="18,6 30,18 18,30 6,18" fill="none" /><circle cx="18" cy="6" r="2.2" /><circle cx="30" cy="18" r="2.2" /><circle cx="18" cy="30" r="2.2" /><circle cx="6" cy="18" r="2.2" />',
  map: '<line x1="7" y1="11" x2="15" y2="8" /><line x1="15" y1="8" x2="22" y2="12" /><line x1="22" y1="12" x2="29" y2="9" /><line x1="7" y1="26" x2="15" y2="23" /><line x1="15" y1="23" x2="22" y2="27" /><line x1="22" y1="27" x2="29" y2="24" /><line x1="7" y1="11" x2="7" y2="26" /><line x1="15" y1="8" x2="15" y2="23" /><line x1="22" y1="12" x2="22" y2="27" /><line x1="29" y1="9" x2="29" y2="24" /><circle cx="7" cy="11" r="1.9" /><circle cx="15" cy="8" r="2.2" /><circle cx="22" cy="12" r="2.0" /><circle cx="29" cy="9" r="1.9" /><circle cx="15" cy="23" r="2.1" /><circle cx="22" cy="27" r="2.2" />',
  tasks: '<line x1="7" y1="10" x2="11" y2="13" /><line x1="11" y1="13" x2="15" y2="8" /><line x1="18" y1="11" x2="29" y2="11" /><line x1="7" y1="19" x2="11" y2="22" /><line x1="11" y1="22" x2="15" y2="17" /><line x1="18" y1="20" x2="29" y2="20" /><line x1="18" y1="28" x2="29" y2="28" /><circle cx="7" cy="10" r="1.8" /><circle cx="11" cy="13" r="2.1" /><circle cx="15" cy="8" r="1.9" /><circle cx="11" cy="22" r="2.1" /><circle cx="11" cy="28" r="2.2" /><circle cx="29" cy="11" r="1.7" /><circle cx="29" cy="20" r="1.7" /><circle cx="29" cy="28" r="1.7" />',
  log: '<line x1="10" y1="7" x2="26" y2="7" /><line x1="26" y1="7" x2="26" y2="29" /><line x1="26" y1="29" x2="10" y2="29" /><line x1="10" y1="29" x2="10" y2="7" /><line x1="14" y1="13" x2="22" y2="13" /><line x1="14" y1="18" x2="22" y2="18" /><line x1="14" y1="23" x2="19" y2="23" /><circle cx="10" cy="7" r="2.0" /><circle cx="26" cy="7" r="2.0" /><circle cx="26" cy="29" r="2.0" /><circle cx="10" cy="29" r="2.0" /><circle cx="14" cy="13" r="1.7" /><circle cx="14" cy="18" r="1.7" />',
  help: '<circle cx="18" cy="18" r="11" fill="none" /><line x1="18" y1="7" x2="18" y2="11" /><line x1="18" y1="25" x2="18" y2="29" /><line x1="7" y1="18" x2="11" y2="18" /><line x1="25" y1="18" x2="29" y2="18" /><circle cx="18" cy="18" r="2.6" />',
  close: '<line x1="10" y1="10" x2="26" y2="26" /><line x1="26" y1="10" x2="10" y2="26" /><circle cx="10" cy="10" r="2.1" /><circle cx="26" cy="26" r="2.1" /><circle cx="26" cy="10" r="2.1" /><circle cx="10" cy="26" r="2.1" /><circle cx="18" cy="18" r="2.3" />',
  skip: '<line x1="8" y1="10" x2="16" y2="18" /><line x1="16" y1="18" x2="8" y2="26" /><line x1="18" y1="10" x2="26" y2="18" /><line x1="26" y1="18" x2="18" y2="26" /><line x1="28" y1="10" x2="28" y2="26" /><circle cx="8" cy="10" r="1.9" /><circle cx="16" cy="18" r="2.3" /><circle cx="8" cy="26" r="1.9" /><circle cx="26" cy="18" r="2.4" /><circle cx="28" cy="10" r="1.9" /><circle cx="28" cy="26" r="1.9" />',
  randomize: '<line x1="7" y1="12" x2="15" y2="12" /><line x1="15" y1="12" x2="21" y2="24" /><line x1="21" y1="24" x2="29" y2="24" /><line x1="7" y1="24" x2="15" y2="24" /><line x1="15" y1="24" x2="21" y2="12" /><line x1="21" y1="12" x2="29" y2="12" /><circle cx="7" cy="12" r="2.0" /><circle cx="29" cy="12" r="2.2" /><circle cx="7" cy="24" r="2.0" /><circle cx="29" cy="24" r="2.2" /><circle cx="18" cy="18" r="2.1" />',
  vision: '<line x1="6" y1="18" x2="18" y2="10" /><line x1="18" y1="10" x2="30" y2="18" /><line x1="30" y1="18" x2="18" y2="26" /><line x1="18" y1="26" x2="6" y2="18" /><circle cx="6" cy="18" r="2.0" /><circle cx="30" cy="18" r="2.0" /><circle cx="18" cy="10" r="2.0" /><circle cx="18" cy="26" r="2.0" /><circle cx="18" cy="18" r="3.1" />',
  cert: '<circle cx="18" cy="15" r="8" fill="none" /><line x1="14" y1="22" x2="12" y2="30" /><line x1="12" y1="30" x2="18" y2="26" /><line x1="18" y1="26" x2="24" y2="30" /><line x1="24" y1="30" x2="22" y2="22" /><circle cx="18" cy="15" r="2.5" /><circle cx="12" cy="30" r="1.9" /><circle cx="24" cy="30" r="1.9" />',
  launch: '<line x1="18" y1="6" x2="11" y2="24" /><line x1="18" y1="6" x2="25" y2="24" /><line x1="11" y1="24" x2="18" y2="20" /><line x1="25" y1="24" x2="18" y2="20" /><line x1="18" y1="20" x2="18" y2="30" /><circle cx="18" cy="6" r="2.7" /><circle cx="11" cy="24" r="2.0" /><circle cx="25" cy="24" r="2.0" /><circle cx="18" cy="30" r="2.1" />',
  forward: '<line x1="15" y1="8" x2="27" y2="18" /><line x1="27" y1="18" x2="15" y2="28" /><line x1="9" y1="18" x2="27" y2="18" /><circle cx="15" cy="8" r="2.2" /><circle cx="27" cy="18" r="2.8" /><circle cx="15" cy="28" r="2.2" /><circle cx="9" cy="18" r="2.1" />',
};

function renderConstellationIcon(id: ConstellationIconId, extraClass = ''): string {
  const cls = extraClass ? `spud-menu-icon ${extraClass}` : 'spud-menu-icon';
  return `<svg class="${cls}" viewBox="0 0 36 36" aria-hidden="true">${CONSTELLATION_ICON_MARKUP[id]}</svg>`;
}

const GAME_MENU_BUTTONS: ReadonlyArray<{ action: string; label: string; key: string; icon: ConstellationIconId }> = [
  { action: 'map', label: 'Map', key: 'M', icon: 'map' },
  { action: 'tasks', label: 'Tasks', key: 'T', icon: 'tasks' },
  { action: 'log', label: 'Log', key: '', icon: 'log' },
  { action: 'help', label: 'Help', key: 'H', icon: 'help' },
  { action: 'options', label: 'Settings', key: 'O', icon: 'options' },
];

app.innerHTML = `
  <div class="game-frame">
    <main class="screen-root" id="screen-root"></main>
    <div class="scene-shell" id="scene-shell" hidden>
      <div id="game-canvas" class="game-canvas"></div>
      <div class="scene-vignette" aria-hidden="true"></div>
      <div class="hud mission-hud" id="hud" hidden>
        <div class="mission-hud-head">
          <div class="mission-shift-status">
            <div class="trial-day-pill" id="trial-day">DAY 01 / 30</div>
            <div class="day-clock" id="day-clock"></div>
            <div class="task-meter" aria-live="polite">
              <span class="task-meter-label" id="task-label">TASKS 0 / 3</span>
              <span class="task-meter-track" aria-hidden="true"><span id="task-fill"></span></span>
            </div>
            <span class="alive-pill" id="crew-progress">COOPERATIVE TRIAL</span>
            <span class="spud-fps-badge" id="hud-fps" hidden>-- FPS</span>
          </div>
          <nav class="mission-toolbar" aria-label="In-game menus">
            ${GAME_MENU_BUTTONS.map(({ action, label, key, icon }) => `
              <button type="button" class="mission-menu-button" data-action="${action}" title="${label}${key ? ` (${key})` : ''}"
                ${key ? `aria-keyshortcuts="${key}"` : ''} ${action === 'options' ? '' : 'aria-haspopup="dialog"'}>
                ${renderConstellationIcon(icon, 'spud-hud-icon')}
                <span>${label}</span>
                ${key ? `<kbd aria-hidden="true">${key}</kbd>` : ''}
              </button>
            `).join('')}
          </nav>
        </div>
        <div class="hud-systems" id="hud-systems"></div>
        <div class="hud-bottom-left">
          <span class="id-swatch" id="hud-color-dot"></span>
          <div class="id-copy">
            <strong id="hud-player-name">SPUDNAUT</strong>
            <small id="hud-player-meta">SPECIALIST · DESTINATION</small>
            <div class="spud-room-badge">
              <span class="spud-room-dot" aria-hidden="true"></span>
              <span id="hud-room">CENTRAL HUB</span>
            </div>
          </div>
        </div>
        <div class="action-cluster">
          <span class="interaction-prompt" id="interaction-prompt" aria-live="polite"></span>
          <button type="button" class="action-button use" data-action="use" aria-keyshortcuts="E" hidden>Interact <kbd aria-hidden="true">E</kbd></button>
        </div>
        <div class="toast" id="toast" role="status"></div>
      </div>
      <div class="training-hud" id="training-hud" hidden></div>
    </div>
    <div class="overlay-root" id="overlay-root"></div>
    <div class="modal-root" id="modal-root"></div>
  </div>
`;

const screenRoot = document.querySelector<HTMLDivElement>('#screen-root')!;
const sceneShell = document.querySelector<HTMLDivElement>('#scene-shell')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const trainingHud = document.querySelector<HTMLDivElement>('#training-hud')!;
const overlayRoot = document.querySelector<HTMLDivElement>('#overlay-root')!;
const modalRoot = document.querySelector<HTMLDivElement>('#modal-root')!;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

const SPECIALIST_STATS: Record<SpecialistId, { label: string; value: number }[]> = {
  repairman: [
    { label: 'REPAIR', value: 95 },
    { label: 'BOTANY', value: 60 },
    { label: 'EVA SPEED', value: 70 },
    { label: 'SCIENCE', value: 68 },
    { label: 'SHIELDING', value: 82 },
  ],
  farmer: [
    { label: 'REPAIR', value: 64 },
    { label: 'BOTANY', value: 96 },
    { label: 'EVA SPEED', value: 68 },
    { label: 'SCIENCE', value: 78 },
    { label: 'SHIELDING', value: 66 },
  ],
  traveller: [
    { label: 'REPAIR', value: 70 },
    { label: 'BOTANY', value: 65 },
    { label: 'EVA SPEED', value: 98 },
    { label: 'SCIENCE', value: 74 },
    { label: 'SHIELDING', value: 72 },
  ],
  researcher: [
    { label: 'REPAIR', value: 68 },
    { label: 'BOTANY', value: 76 },
    { label: 'EVA SPEED', value: 66 },
    { label: 'SCIENCE', value: 98 },
    { label: 'SHIELDING', value: 70 },
  ],
};

function renderConstellationBack(label = 'BACK', attrs = 'data-back', ariaLabel = 'Back'): string {
  return `
    <button
      class="spud-constellation-back"
      type="button"
      ${attrs}
      aria-label="${escapeHtml(ariaLabel)}"
    >
      ${renderConstellationIcon('back', 'spud-back-constellation')}
      <span class="spud-menu-label">${escapeHtml(label)}</span>
    </button>
  `;
}

function renderConstellationTitle(title: string, titleId: string, kicker?: string): string {
  return `
    <header class="spud-options-header">
      ${kicker ? `<span class="spud-constellation-kicker is-centered">${escapeHtml(kicker)}</span>` : ''}
      <div class="spud-options-title-row">
        <span class="spud-constellation-rule" aria-hidden="true"></span>
        <h1 id="${escapeHtml(titleId)}" tabindex="-1">${escapeHtml(title)}</h1>
        <span class="spud-constellation-rule is-right" aria-hidden="true"></span>
      </div>
    </header>
  `;
}

function renderConstellationAction(opts: {
  icon: ConstellationIconId;
  label: string;
  attrs?: string;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}): string {
  const variantCls = opts.variant === 'primary' ? ' is-primary' : opts.variant === 'danger' ? ' is-danger' : '';
  return `
    <button
      class="spud-constellation-action${variantCls}"
      type="button"
      ${opts.attrs ?? ''}
      ${opts.disabled ? 'disabled' : ''}
    >
      ${renderConstellationIcon(opts.icon)}
      <span class="spud-menu-label">${escapeHtml(opts.label)}</span>
    </button>
  `;
}

function renderConstellationVideoScreen(opts: {
  ariaLabel: string;
  bodyMarkup: string;
  backLabel?: string;
  backAttrs?: string;
  backAriaLabel?: string;
  utilityMarkup?: string;
  narrow?: boolean;
  extraClass?: string;
}): string {
  const reduced = save.options.reducedMotion ? 'reduce-motion' : '';
  const extra = opts.extraClass ? ` ${opts.extraClass}` : '';
  const narrowCls = opts.narrow ? ' is-narrow' : '';
  return `
    <section class="screen-menu spud-video-menu spud-constellation-screen ${reduced}${extra}" aria-label="${escapeHtml(opts.ariaLabel)}">
      <img class="menu-ambient-backdrop" src="/assets/main-menu-poster.jpg" alt="" aria-hidden="true" />
      <div class="video-menu-stage">
        <video
          class="menu-video-player"
          src="/assets/main-menu.mp4"
          poster="/assets/main-menu-poster.jpg"
          autoplay
          loop
          muted
          playsinline
          preload="auto"
          aria-hidden="true"
        ></video>
        <img class="menu-video-poster" src="/assets/main-menu-poster.jpg" alt="" aria-hidden="true" />
        <div class="menu-video-vignette" aria-hidden="true"></div>
        ${opts.backAttrs === '' ? '' : renderConstellationBack(opts.backLabel ?? 'BACK', opts.backAttrs ?? 'data-back', opts.backAriaLabel ?? 'Back')}
        ${opts.utilityMarkup ? `<div class="spud-utility-bar">${opts.utilityMarkup}</div>` : ''}
        <div class="spud-constellation-stage">
          <div class="spud-constellation-body${narrowCls}">
            ${opts.bodyMarkup}
          </div>
        </div>
      </div>
    </section>
  `;
}

function walkStationTo(x: number, y: number, label?: string): void {
  if (!game) return;
  const activeGame = game;
  const screen = currentScreen;
  void import('./game').then(({ navigateStationTo }) => {
    if (activeGame === game && currentScreen === screen) {
      const routed = navigateStationTo(activeGame, x, y);
      if (label) showToast(routed ? `Auto-piloting to ${label}...` : `No route to ${label}.`);
    }
  });
}

function setScreen(screen: ScreenId, markup: string): void {
  pendingScene = null;
  if (screen !== 'launch' && launchGame) {
    launchGame.destroy(true);
    launchGame = null;
  }
  if (game) {
    const worldVisible = screen === 'training' || screen === 'mission';
    if (worldVisible) {
      game.loop.wake();
      if (game.scene.isPaused('station')) game.scene.resume('station');
    } else {
      if (game.scene.isActive('station') && !game.scene.isPaused('station')) game.scene.pause('station');
      game.loop.sleep();
    }
  }
  currentScreen = screen;
  stopLoop();
  window.clearTimeout(splashTimer);
  overlayRoot.replaceChildren();
  modalRoot.replaceChildren();
  sceneShell.hidden = true;
  hud.hidden = true;
  trainingHud.hidden = true;
  screenRoot.hidden = false;
  screenRoot.innerHTML = markup;
  document.body.dataset.screen = screen;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function wakeStationGame(): void {
  if (!game) return;
  game.loop.wake();
  if (game.scene.isPaused('station')) game.scene.resume('station');
}

function showSplash(): void {
  setScreen('splash', `
    <section class="screen-splash ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-label="Spudnaut opening cinematic">
      <div class="opening-art" aria-hidden="true"><img class="opening-poster" src="/assets/loading.jpg" alt="" /><video class="opening-video" src="/assets/opening-cinematic.mp4" poster="/assets/loading.jpg" preload="auto" autoplay muted playsinline></video><div class="opening-stars"></div><div class="opening-horizon"></div></div>
      <div class="opening-copy"><span>HEXABYTE INTERACTIVE · YEAR 3042</span><strong>THE GREAT STARCH MIGRATION</strong><small>Earth's future is out there.</small></div>
      <div class="intro-accessibility">
        <span>HEXABYTE INTERACTIVE · YEAR 3042</span>
        <button class="intro-skip" type="button">${renderConstellationIcon('skip')} <span>SKIP INTRO</span> <kbd>ENTER</kbd></button>
      </div>
    </section>
  `);
  let finished = false;
  const finish = (): void => {
    if (finished || currentScreen !== 'splash') return;
    finished = true;
    window.clearTimeout(splashTimer);
    showMenu();
  };
  const video = screenRoot.querySelector<HTMLVideoElement>('.opening-video');
  if (video) {
    const playVideo = (): void => {
      void video.play().catch(() => { video.controls = true; });
    };
    video.addEventListener('loadeddata', () => {
      if (!finished) playVideo();
    });
    video.addEventListener('click', () => {
      if (video.paused) playVideo();
    });
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
  }
  screenRoot.querySelector('.intro-skip')?.addEventListener('click', finish);
  startMusic();
  splashTimer = window.setTimeout(finish, 30000);
}

let optionsHideTimer = 0;

function showMenu(): void {
  window.clearTimeout(optionsHideTimer);
  startMusic();
  const savedTrial = save.activeTrial;
  const badgeMain = savedTrial
    ? trialDayLabel(savedTrial)
    : '';
  const playActionMarkup = savedTrial
    ? `
            <button class="spud-menu-item" type="button" data-menu="resume" aria-label="Resume Mission ${badgeMain}">
              ${renderConstellationIcon('forward')}
              <span class="spud-menu-label">RESUME</span><small class="spud-menu-tag">${badgeMain}</small>
            </button>
            <button class="spud-menu-item" type="button" data-menu="play" aria-label="New Mission Loadout and Setup">
              ${renderConstellationIcon('play')}
              <span class="spud-menu-label">PLAY</span><small class="spud-menu-tag">NEW TRIAL</small>
            </button>`
    : `
            <button class="spud-menu-item" type="button" data-menu="play" aria-label="Play Mission">
              ${renderConstellationIcon('play')}
              <span class="spud-menu-label">PLAY</span>
            </button>`;
setScreen('menu', `
    <section class="screen-menu spud-video-menu ${save.options.reducedMotion ? 'reduce-motion' : ''}">
      <img class="menu-ambient-backdrop" src="/assets/main-menu-poster.jpg" alt="" aria-hidden="true" />

      <div class="video-menu-stage">
        <video
          class="menu-video-player"
          src="/assets/main-menu.mp4"
          poster="/assets/main-menu-poster.jpg"
          autoplay
          loop
          muted
          playsinline
          preload="auto"
          aria-hidden="true"
        ></video>
        <img class="menu-video-poster" src="/assets/main-menu-poster.jpg" alt="" aria-hidden="true" />
        <div class="menu-video-vignette" aria-hidden="true"></div>
        <div class="menu-zoom-flash" aria-hidden="true"></div>

        <div class="spud-center-menu">
          <h1 class="spud-center-brand">
            <span class="spud-center-logo">SPUD<span class="spud-center-blade" aria-hidden="true"></span>NAUT</span>
            <span class="spud-center-rule" aria-hidden="true"></span>
            <span class="spud-center-sub">THE GREAT STARCH MIGRATION</span>
          </h1>

          <nav class="spud-center-nav" aria-label="Spudnaut Main Menu">
            <span class="spud-menu-light" aria-hidden="true"></span>${playActionMarkup}
            <button class="spud-menu-item" type="button" data-menu="training" aria-label="Cadet Training">
              ${renderConstellationIcon('training')}
              <span class="spud-menu-label">TRAINING</span>
            </button>
            <button class="spud-menu-item" type="button" data-menu="options" aria-label="Game Settings">
              ${renderConstellationIcon('options')}
              <span class="spud-menu-label">OPTIONS</span>
            </button>
          </nav>
        </div>

        <div class="spud-options-overlay" hidden></div>
      </div>
    </section>
  `);

  // Moving blue selection light: follows hover, focus, and arrow-key navigation
  const menuNav = screenRoot.querySelector<HTMLElement>('.spud-center-nav');
  const menuLight = screenRoot.querySelector<HTMLElement>('.spud-menu-light');
  const menuItems = Array.from(screenRoot.querySelectorAll<HTMLButtonElement>('.spud-center-nav .spud-menu-item'));
  const setActiveMenuItem = (target: HTMLButtonElement | undefined, withSound = false): void => {
    if (!target || target.classList.contains('is-active')) return;
    menuItems.forEach(el => el.classList.toggle('is-active', el === target));
    if (menuLight && menuNav) {
      menuLight.style.transform = `translateY(${target.offsetTop + target.offsetHeight / 2}px) translateY(-50%)`;
    }
    if (withSound) sfx.click();
  };

  menuItems.forEach(button => {
    button.addEventListener('mouseenter', () => setActiveMenuItem(button, true));
    button.addEventListener('focus', () => setActiveMenuItem(button));
  });

  requestAnimationFrame(() => {
    menuLight?.classList.add('no-transition');
    setActiveMenuItem(menuItems[0]);
    requestAnimationFrame(() => menuLight?.classList.remove('no-transition'));
  });

  const launchMenuTransition = (proceed: () => void): void => {
    const menuEl = screenRoot.querySelector<HTMLElement>('.screen-menu');
    if (menuEl && !menuEl.classList.contains('is-zooming')) {
      menuEl.classList.add('is-zooming');
      sfx.launch();
      const delay = save.options.reducedMotion ? 180 : 1050;
      window.setTimeout(proceed, delay);
    } else {
      proceed();
    }
  };

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach(button => button.addEventListener('click', () => {
    switch (button.dataset.menu) {
      case 'resume':
        launchMenuTransition(() => {
          syncLobbyFromSave();
          showResumeStaging();
        });
        break;
      case 'play':
      case 'start':
        launchMenuTransition(() => {
          syncLobbyFromSave();
          showLobby();
        });
        break;
      case 'options':
        sfx.click();
        showOptions();
        break;
      case 'training':
        sfx.click();
        if (!save.trainingComplete) showStory(0);
        else showTraining();
        break;
      case 'credits':
        sfx.click();
        showCredits();
        break;
    }
  }));
}

function showStory(index: number): void {
  const panel = STORY_BEATS[index];
  if (!panel) {
    showTraining();
    return;
  }
  const stepsMarkup = STORY_BEATS.map((beat, idx) => `
    <button type="button" class="spud-step-node ${idx === index ? 'active' : ''}" data-story-jump="${idx}">
      <span class="spud-step-dot" aria-hidden="true"></span>
      <span>0${idx + 1} · ${escapeHtml(beat.cutscene.toUpperCase())}</span>
    </button>
  `).join('<span class="spud-step-bridge" aria-hidden="true"></span>');

  const utilityMarkup = `
    <button class="spud-text-toggle" type="button" data-story-skip>
      ${renderConstellationIcon('skip')}
      <span>SKIP TO DECK</span>
    </button>
  `;

  const bodyMarkup = `
    ${renderConstellationTitle(panel.title, 'story-screen-title', panel.kicker)}
    <nav class="spud-step-chain" aria-label="Transmission sequence">${stepsMarkup}</nav>
    <div class="spud-constellation-divider" aria-hidden="true"></div>
    <div class="spud-split-columns">
      <div class="spud-copy-stack">
        <div class="spud-art-frame">
          <img src="${escapeHtml(panel.art)}" alt="" />
        </div>
        <div class="spud-meta-inline">
          <span>TRANSMISSION LOG ${String(index + 1).padStart(2, '0')} / ${String(STORY_BEATS.length).padStart(2, '0')}</span>
          <span>HEXABYTE ARCHIVE · 3042</span>
        </div>
      </div>
      <div class="spud-vertical-rule" aria-hidden="true"></div>
      <aside class="spud-copy-stack">
        <div class="spud-copy-block">
          <h2>MISSION BRIEFING</h2>
          <p>${escapeHtml(panel.body)}</p>
        </div>
        <div class="spud-copy-block">
          <h2>OPERATIONAL NOTE</h2>
          <p>${escapeHtml(panel.note)}</p>
        </div>
      </aside>
    </div>
    <footer class="spud-constellation-actions">
      ${index > 0
        ? renderConstellationAction({ icon: 'back', label: 'PREVIOUS LOG', attrs: `data-story-jump="${index - 1}"` })
        : renderConstellationAction({ icon: 'back', label: 'MAIN MENU', attrs: 'data-story-back' })}
      ${renderConstellationAction({
        icon: index === STORY_BEATS.length - 1 ? 'training' : 'forward',
        label: index === STORY_BEATS.length - 1 ? 'BOARD TRAINING DECK' : 'CONTINUE',
        attrs: 'data-story-next',
        variant: 'primary',
      })}
    </footer>
  `;

  setScreen('story', renderConstellationVideoScreen({
    ariaLabel: panel.title,
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-story-back',
    backAriaLabel: 'Back to Main Menu',
    utilityMarkup,
    extraClass: 'story-screen',
  }));
  screenRoot.querySelector('.screen-menu')?.setAttribute('data-cutscene', panel.cutscene);
  screenRoot.querySelectorAll('[data-story-back]').forEach(el => el.addEventListener('click', () => {
    sfx.click();
    showMenu();
  }));
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-story-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      showStory(Number(btn.dataset.storyJump));
    });
  });
  screenRoot.querySelector('[data-story-skip]')?.addEventListener('click', () => {
    sfx.click();
    showTraining();
  });
  screenRoot.querySelector('[data-story-next]')?.addEventListener('click', () => {
    sfx.click();
    if (index + 1 < STORY_BEATS.length) showStory(index + 1);
    else showTraining();
  });
}

function showTraining(): void {
  currentScreen = 'training';
  stopMusic();
  stopLoop();
  window.clearTimeout(splashTimer);
  overlayRoot.replaceChildren();
  modalRoot.replaceChildren();
  screenRoot.hidden = true;
  sceneShell.hidden = false;
  hud.hidden = true;
  trainingHud.hidden = false;
  document.body.dataset.screen = 'game';
  training = createTrainingState();
  trainingHudExpanded = false;
  currentPrompt = { id: null, name: '', kind: '', room: 'Cafeteria' };
  wakeStationGame();
  if (game) configureScene({ respawn: true });
  else void ensureStationGame().then(() => { if (currentScreen === 'training') configureScene({ respawn: true }); });
  renderTrainingHud();
  showToast('Training Deck online. Inspect all four systems.');
}

function renderTrainingHud(): void {
  const systems = TRAINING_DECK.interactions.filter(interaction => interaction.kind === 'system');
  const inspected = systems.filter(interaction => training.completed.includes(interaction.id)).length;
  const talks = Math.min(2, training.crew.length);
  const sample = training.completed.includes('sample');
  trainingHud.innerHTML = `
    <section class="training-panel ${trainingHudExpanded ? 'expanded' : ''}">
      <header class="training-head">
        <div>
          <span class="training-kicker">EARTH SIMULATOR</span>
          <strong>TRAINING DECK</strong>
          <div class="spud-room-badge is-training">
            <span class="spud-room-dot" aria-hidden="true"></span>
            <span id="training-room">${escapeHtml(training.room.toUpperCase())}</span>
          </div>
        </div>
        <div class="training-head-actions">
          <span class="spud-fps-badge" id="training-fps" ${save.options.showFps ? '' : 'hidden'}>-- FPS</span>
          <button class="training-map" type="button" data-training-map aria-haspopup="dialog" aria-keyshortcuts="M">${renderConstellationIcon('map')}<span>Map</span><kbd aria-hidden="true">M</kbd></button>
          <button class="training-exit" type="button" data-training-exit>${renderConstellationIcon('back')}<span>Exit</span></button>
        </div>
      </header>
      <button class="training-toggle" type="button" data-training-toggle aria-expanded="${trainingHudExpanded}"><span>OBJECTIVES · ${inspected} / ${systems.length}</span><span>${trainingHudExpanded ? 'HIDE ▲' : 'SHOW ▼'}</span></button>
      <div class="training-list">
        ${systems.map(interaction => `<div class="training-objective ${training.completed.includes(interaction.id) ? 'done' : ''}" style="--accent:${interaction.accent ?? '#7ad7ea'}"><img src="/assets/ui/icons/${interaction.icon}.png" alt="" /><span>${escapeHtml(interaction.name)}</span><b>${training.completed.includes(interaction.id) ? '✓' : '○'}</b></div>`).join('')}
      </div>
      <div class="training-meta"><span>CREW TALKS ${talks} / 2</span><span>SAMPLE ${sample ? 'LOGGED' : 'PENDING'}</span></div>
      <div class="training-footer">${inspected === systems.length ? 'REPORT TO THE BRIDGE CONSOLE' : `INSPECT ${systems.length - inspected} MORE SYSTEM${systems.length - inspected === 1 ? '' : 'S'}`}</div>
      <div class="toast training-toast" id="training-toast" role="status"></div>
    </section>
  `;
  trainingHud.querySelector('[data-training-exit]')?.addEventListener('click', () => {
    sfx.click();
    showMenu();
  });
  trainingHud.querySelector('[data-training-map]')?.addEventListener('click', () => {
    sfx.click();
    openMap();
  });
  trainingHud.querySelector('[data-training-toggle]')?.addEventListener('click', () => {
    trainingHudExpanded = !trainingHudExpanded;
    renderTrainingHud();
    trainingHud.querySelector<HTMLButtonElement>('[data-training-toggle]')?.focus();
  });
}

function activeMap(): MapDefinition {
  return currentScreen === 'training' ? TRAINING_DECK : surfaceHabitatFor(lobby.destination);
}

function movementSpeed(): number {
  return lobby.specialist === 'traveller' ? 1.18 : 1;
}

function trainingSceneState(): SceneGameState {
  const inspected = TRAINING_SYSTEM_IDS.filter(id => training.completed.includes(id)).length;
  return {
    mapId: 'training',
    playerName: save.name,
    colorId: save.colorId,
    playerArt: specialistById(lobby.specialist).art,
    x: training.x,
    y: training.y,
    speed: movementSpeed(),
    frozen: training.modalOpen,
    visionEnabled: save.options.lineOfSight,
    activeInteractions: TRAINING_DECK.interactions.map(interaction => interaction.id),
    completedInteractions: training.completed,
    objective: inspected >= TRAINING_SYSTEM_IDS.length ? 'REPORT TO THE BRIDGE' : 'INSPECT FOUR SYSTEMS',
  };
}

function missionSceneState(): SceneGameState {
  return {
    mapId: 'surface',
    destination: lobby.destination,
    playerName: save.name,
    colorId: save.colorId,
    playerArt: specialistById(lobby.specialist).art,
    x: mission.playerX,
    y: mission.playerY,
    speed: movementSpeed(),
    frozen: !isMissionActive() || mission.modalOpen,
    visionEnabled: save.options.lineOfSight,
    activeInteractions: mission.tasks,
    completedInteractions: mission.completed,
    objective: mission.eventCard?.name ?? 'HABITAT SHIFT',
  };
}

function configureScene(options: { respawn?: boolean } = {}): void {
  if (!game) return;
  const state = currentScreen === 'training' ? trainingSceneState() : missionSceneState();
  if (!sceneReady) {
    const respawn = options.respawn === true || (pendingScene?.state.mapId === state.mapId && pendingScene.respawn);
    pendingScene = { state, respawn };
    return;
  }
  const activeGame = game;
  void import('./game').then(({ configureStationGame }) => {
    if (activeGame === game) configureStationGame(activeGame, state, { respawn: options.respawn === true });
  });
}

function onGameEvent(event: GameEvent): void {
  if (event.type === 'ready') {
    sceneReady = true;
    if (pendingScene) {
      const pending = pendingScene;
      pendingScene = null;
      if (game) {
        const activeGame = game;
        void import('./game').then(({ configureStationGame }) => {
          if (activeGame === game) configureStationGame(activeGame, pending.state, { respawn: pending.respawn });
        });
      }
    } else {
      configureScene();
    }
    return;
  }
  if (currentScreen !== 'mission' && currentScreen !== 'training') return;
  if (event.type === 'move') {
    if (currentScreen === 'training') {
      training.x = event.x;
      training.y = event.y;
      if (training.room !== event.room) {
        training.room = event.room;
        const roomEl = document.querySelector<HTMLElement>('#training-room');
        if (roomEl) roomEl.textContent = event.room.toUpperCase();
      }
    } else {
      mission.playerX = event.x;
      mission.playerY = event.y;
      if (mission.room !== event.room) {
        mission.room = event.room;
        const roomEl = document.querySelector<HTMLElement>('#hud-room');
        if (roomEl) roomEl.textContent = event.room.toUpperCase();
      }
    }
    return;
  }
  if (event.type === 'prompt') {
    currentPrompt = {
      id: event.interactionId,
      name: event.name,
      kind: event.kind,
      room: event.room,
    };
    if (currentScreen === 'training') {
      training.room = event.room;
      const roomEl = document.querySelector<HTMLElement>('#training-room');
      if (roomEl) roomEl.textContent = event.room.toUpperCase();
    } else {
      mission.room = event.room;
      updateHUD();
    }
    updateActionButtons();
    return;
  }
  if (event.type === 'interact') {
    if (event.kind === 'vent') {
      sfx.click();
      showToast('Traversed Maintenance Duct');
      return;
    }
    if (currentScreen === 'training') handleTrainingInteract(event.interactionId);
    else openMissionTask(event.interactionId);
    return;
  }
  if (event.type === 'crew') {
    talkToCrew(event.crewId, event.name, event.lines);
    return;
  }
  if (event.type === 'route-blocked') {
    showToast('Auto-pilot stopped. Move clear of the wall and try again.');
    return;
  }
  if (event.type === 'fps') {
    if (!save.options.showFps) return;
    const text = `${event.fps} FPS`;
    const badge = currentScreen === 'training'
      ? document.querySelector<HTMLElement>('#training-fps')
      : document.querySelector<HTMLElement>('#hud-fps');
    if (badge && badge.textContent !== text) badge.textContent = text;
  }
}

function talkToCrew(crewId: string, fallbackName?: string, fallbackLines?: string[]): void {
  const crew = activeMap().crew.find(item => item.id === crewId) ?? (fallbackName && fallbackLines?.length ? {
    id: crewId,
    name: fallbackName,
    role: 'Station Specialist',
    art: '/assets/potato-researcher.png',
    x: 0,
    y: 0,
    facing: 1 as const,
    accent: '#9beeff',
    lines: fallbackLines,
  } : undefined);
  if (!crew) return;
  if (currentScreen === 'training' && !training.crew.includes(crew.id)) {
    training.crew.push(crew.id);
    renderTrainingHud();
  }
  showDialogue({
    speaker: crew.name,
    role: crew.role,
    art: crew.art,
    accent: crew.accent,
    lines: crew.lines,
  });
}

function handleTrainingInteract(interactionId: string): void {
  const interaction = TRAINING_DECK.interactions.find(item => item.id === interactionId);
  if (!interaction) return;
  if (interaction.id === 'spudie') {
    showDialogue({
      speaker: interaction.name,
      role: 'STATION INTELLIGENCE',
      art: '/assets/potato-researcher.png',
      accent: interaction.accent ?? '#7ad7ea',
      lines: interaction.dialogue ?? ['S.P.U.D.I.E. is listening.'],
    });
    return;
  }
  if (interaction.id === 'bridge-exit') {
    const inspected = TRAINING_SYSTEM_IDS.every(id => training.completed.includes(id));
    if (inspected) finishTraining();
    else {
      const remaining = TRAINING_SYSTEM_IDS.filter(id => !training.completed.includes(id));
      showDialogue({
        speaker: 'Cmdr. Russet',
        role: 'TRAINING OFFICER',
        art: '/assets/potato-repairman.png',
        accent: '#f2b544',
        lines: [
          `Not yet, recruit. ${remaining.length} system checkpoint${remaining.length === 1 ? ' is' : 's are'} still cold.`,
          'Power, life support, farming, shielding. Walk the deck and use every console.',
        ],
      });
    }
    return;
  }
  if (interaction.kind === 'system' || interaction.id === 'sample') openTrainingMinigame(interaction.id);
}

function openTrainingMinigame(interactionId: string): void {
  const interaction = TRAINING_DECK.interactions.find(item => item.id === interactionId);
  const kind = TRAINING_TASK_KINDS[interactionId];
  if (!interaction || !kind) return;
  if (training.completed.includes(interactionId)) {
    showToast('Checkpoint already logged.');
    return;
  }
  pauseTrainingForModal();
  openMinigameModal({
    eyebrow: interaction.kind === 'system' ? 'TRAINING CHECKPOINT' : 'SAMPLE ANALYSIS',
    title: interaction.name,
    kind,
    onClose: resumeTraining,
    onComplete: () => {
      training.completed.push(interactionId);
      sfx.complete();
      resumeTraining();
      renderTrainingHud();
      configureScene();
      showToast(`${interaction.name} logged. ${TRAINING_SYSTEM_IDS.filter(id => !training.completed.includes(id)).length} system checkpoint(s) remain.`);
    },
  });
}

function finishTraining(): void {
  const systemsDone = TRAINING_SYSTEM_IDS.every(id => training.completed.includes(id));
  const rank: 'S' | 'A' | 'B' = systemsDone && training.crew.length >= 2 ? 'S' : systemsDone && training.crew.length >= 1 ? 'A' : 'B';
  save.trainingComplete = true;
  save.trainingRank = rank;
  persistSave(save);
  pauseTrainingForModal();
  trainingHud.hidden = true;
  overlayRoot.innerHTML = `
    <section class="spud-canvas-overlay training-report-screen ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="training-complete-title">
      <div class="spud-canvas-inner is-narrow">
        ${renderConstellationTitle('TRAINING COMPLETE', 'training-complete-title', 'S.P.U.D.I.E. · TRAINING EVALUATION')}
        <div class="spud-orbital-seal">${escapeHtml(rank)}<small>RANK</small></div>
        <div class="spud-copy-block" style="text-align:center;">
          <p>Four survival systems inspected. ${training.crew.length} crew conversation${training.crew.length === 1 ? '' : 's'} logged. ${
            systemsDone ? 'Commander Russet has cleared you for the certification exam.' : 'Some checkpoints remain, but the exam console is unlocked for review.'
          }</p>
        </div>
        <div class="spud-telemetry-grid">
          <div class="spud-telemetry-cell">
            <span>SYSTEMS</span>
            <strong>${TRAINING_SYSTEM_IDS.filter(id => training.completed.includes(id)).length} / 4</strong>
            <small>CONSOLE TELEMETRY</small>
          </div>
          <div class="spud-telemetry-cell">
            <span>CREW TALKS</span>
            <strong>${Math.min(2, training.crew.length)} / 2</strong>
            <small>COMMAND BRIEF</small>
          </div>
          <div class="spud-telemetry-cell">
            <span>SAMPLE</span>
            <strong>${training.completed.includes('sample') ? 'LOGGED' : 'PENDING'}</strong>
            <small>CORE SPECIMEN</small>
          </div>
        </div>
        <div class="spud-copy-block" style="text-align:center;">
          <small>Rank S requires all four systems and two crew conversations. Your rank is recorded on the final certificate.</small>
        </div>
        <footer class="spud-constellation-actions is-centered">
          ${renderConstellationAction({ icon: 'cert', label: 'TAKE THE SPUD EXAM', attrs: 'data-training-report-next', variant: 'primary' })}
        </footer>
      </div>
    </section>
  `;
  overlayRoot.querySelector('[data-training-report-next]')?.addEventListener('click', () => {
    sfx.click();
    showExamIntro();
  });
}

function pauseTrainingForModal(): void {
  training.modalOpen = true;
  configureScene();
  updateActionButtons();
}

function resumeTraining(): void {
  training.modalOpen = false;
  configureScene();
  updateActionButtons();
}

function pauseMissionForModal(): void {
  if (!isMissionActive() || mission.modalOpen) return;
  mission.modalOpen = true;
  mission.pauseStartedAt = Date.now();
  configureScene();
  updateActionButtons();
}

function resumeMissionAfterModal(): void {
  if (!mission.modalOpen) return;
  if (mission.pauseStartedAt) {
    mission.pausedDuration += Date.now() - mission.pauseStartedAt;
    mission.pauseStartedAt = 0;
  }
  mission.modalOpen = false;
  configureScene();
  updateActionButtons();
}

function pauseForModal(): void {
  if (currentScreen === 'training') pauseTrainingForModal();
  else pauseMissionForModal();
}

function resumeFromModal(): void {
  if (currentScreen === 'training') resumeTraining();
  else resumeMissionAfterModal();
}

function showDialogue(options: {
  speaker: string;
  role: string;
  art: string;
  accent: string;
  lines: string[];
  onClose?: () => void;
}): void {
  pauseForModal();
  let index = 0;
  const paint = (): void => {
    const line = options.lines[index] ?? '';
    modalRoot.innerHTML = `
      <div class="modal-shade">
        <section class="spud-modal-frame dialogue-card" style="--accent:${options.accent}" role="dialog" aria-modal="true" aria-label="${escapeHtml(options.speaker)}">
          <div class="spud-modal-top">
            <div class="spud-dialogue-head" style="border-bottom:none;padding-bottom:0;">
              <img src="${options.art}" alt="" />
              <div>
                <span class="spud-constellation-kicker" style="margin-bottom:2px;">${escapeHtml(options.role)}</span>
                <h2>${escapeHtml(options.speaker)}</h2>
              </div>
            </div>
            <button class="spud-constellation-close" type="button" data-close aria-label="Close dialogue">
              ${renderConstellationIcon('close')}
              <span>CLOSE</span>
            </button>
          </div>
          <p class="dialogue-line">${escapeHtml(line)}</p>
          <footer class="dialogue-footer">
            <span>${index + 1} / ${options.lines.length}</span>
            ${renderConstellationAction({
              icon: index >= options.lines.length - 1 ? 'close' : 'forward',
              label: index >= options.lines.length - 1 ? 'CLOSE' : 'NEXT',
              attrs: 'data-dialogue-next',
              variant: 'primary',
            })}
          </footer>
        </section>
      </div>
    `;
    const close = (): void => {
      modalRoot.replaceChildren();
      resumeFromModal();
      options.onClose?.();
    };
    modalRoot.querySelector('[data-close]')?.addEventListener('click', close);
    modalRoot.querySelector('[data-dialogue-next]')?.addEventListener('click', () => {
      sfx.click();
      if (index < options.lines.length - 1) {
        index += 1;
        paint();
      } else close();
    });
    modalRoot.querySelector('.modal-shade')?.addEventListener('click', event => {
      if (event.target === event.currentTarget) close();
    });
  };
  paint();
}

function openMinigameModal(options: {
  eyebrow: string;
  title: string;
  kind: TaskKind;
  onClose: () => void;
  onComplete: () => void;
}): void {
  modalRoot.replaceChildren();
  const previousFocus = document.activeElement as HTMLElement | null;
  const shade = document.createElement('div');
  shade.className = 'modal-shade';
  const box = document.createElement('section');
  box.className = 'spud-modal-frame task-card';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', options.title);
  box.innerHTML = `
    <div class="spud-modal-top">
      <div>
        <span class="spud-constellation-kicker" style="margin-bottom:2px;">${escapeHtml(options.eyebrow)}</span>
        <h2>${escapeHtml(options.title)}</h2>
      </div>
      <button class="spud-constellation-close" type="button" data-close aria-label="Close task">
        ${renderConstellationIcon('close')}
        <span>ABORT</span>
      </button>
    </div>
    <div class="task-body" id="task-body"></div>
  `;
  shade.append(box);
  modalRoot.append(shade);
  const cleanups: (() => void)[] = [];
  let closed = false;
  const close = (completed: boolean): void => {
    if (closed) return;
    closed = true;
    cleanups.forEach(cleanup => cleanup());
    shade.remove();
    previousFocus?.focus();
    if (completed) options.onComplete();
    else options.onClose();
  };
  box.querySelector('[data-close]')?.addEventListener('click', () => close(false));
  shade.addEventListener('click', event => {
    if (event.target === shade) close(false);
  });
  renderTaskGame(options.kind, box.querySelector<HTMLDivElement>('#task-body')!, () => close(true), cleanups, options.title);
  box.querySelector<HTMLButtonElement>('[data-close]')?.focus();
}

function openMissionTask(taskId: string): void {
  const task = taskById(taskId);
  if (!task || !mission.tasks.includes(task.id) || mission.completed.includes(task.id)) return;
  if (!isMissionActive() || mission.modalOpen) return;
  pauseMissionForModal();
  openMinigameModal({
    eyebrow: `DAY ${missionDayNumber()} · ${getRoomName(task.roomId).toUpperCase()}`,
    title: task.name,
    kind: task.kind,
    onClose: resumeMissionAfterModal,
    onComplete: () => {
      const beforeTask = { ...mission.metrics };
      mission.completed = [...mission.completed, task.id];
      mission.totalCompleted += 1;
      mission.metrics = applyTaskCompletion(mission.metrics, task, lobby.specialist);
      sfx.complete();
      saveTrialProgress();
      updateHUD();
      showTaskResult(task.name, beforeTask);
    },
  });
}

function showTaskResult(taskName: string, before: MissionMetrics): void {
  const changes = metricDeltas(before, mission.metrics);
  const lastTask = mission.completed.length >= mission.tasks.length;
  modalRoot.innerHTML = `
    <div class="modal-shade">
      <section class="spud-modal-frame task-result-card" role="dialog" aria-modal="true" aria-labelledby="task-result-title">
        <div class="spud-modal-top">
          <div>
            <span class="spud-constellation-kicker" style="margin-bottom:2px;">SYSTEMS REPORT · ${escapeHtml(mission.room)}</span>
            <h2 id="task-result-title">${escapeHtml(taskName)} COMPLETE</h2>
          </div>
        </div>
        <div class="spud-copy-block">
          <p>The crew logged the maintenance result. Habitat gauge changes reflect simplified simulation units.</p>
        </div>
        <div class="spud-telemetry-grid" style="display:flex;flex-wrap:wrap;gap:10px 18px;">${metricChips(changes)}</div>
        <footer class="spud-constellation-actions is-centered">
          ${renderConstellationAction({
            icon: lastTask ? 'cert' : 'forward',
            label: lastTask ? 'SEND EARTH REPORT' : 'CONTINUE SHIFT',
            attrs: 'data-result-continue',
            variant: 'primary',
          })}
        </footer>
      </section>
    </div>`;
  modalRoot.querySelector('[data-result-continue]')?.addEventListener('click', () => {
    modalRoot.replaceChildren();
    resumeMissionAfterModal();
    updateHUD();
    if (lastTask) finishDay('All daily assignments completed. Crew systems stable.');
    else {
      showToast(`${mission.tasks.length - mission.completed.length} assignment${mission.tasks.length - mission.completed.length === 1 ? '' : 's'} remain today.`);
    }
  });
  modalRoot.querySelector<HTMLButtonElement>('[data-result-continue]')?.focus();
}

function showExamIntro(): void {
  const bodyMarkup = `
    ${renderConstellationTitle('THE SPUD EXAM', 'exam-intro-title', 'EARTH TRAINING FACILITY · CERTIFICATION')}
    <div class="spud-copy-stack">
      <div class="spud-copy-block">
        <h2>FLIGHT QUALIFICATION</h2>
        <p>
          Eight questions on pressure, life support, tools, farming, and crew safety. Score at least ${Math.round(EXAM_PASS_RATIO * 100)}% to earn your flight certification.
        </p>
      </div>
      <div class="spud-telemetry-grid">
        <div class="spud-telemetry-cell">
          <span>TRAINING RANK</span>
          <strong>${escapeHtml(save.trainingRank ?? 'B')}</strong>
          <small>DECK EVALUATION</small>
        </div>
        <div class="spud-telemetry-cell">
          <span>PASS TARGET</span>
          <strong>${Math.round(EXAM_PASS_RATIO * 100)}%</strong>
          <small>${EXAM_QUESTION_COUNT} QUESTIONS</small>
        </div>
        <div class="spud-telemetry-cell">
          <span>EXAM BEST</span>
          <strong>${save.examBest}%</strong>
          <small>RECORDED SCORE</small>
        </div>
      </div>
    </div>
    <footer class="spud-constellation-actions is-centered">
      ${renderConstellationAction({ icon: 'cert', label: 'TAKE THE EXAM', attrs: 'data-exam-start', variant: 'primary' })}
    </footer>
  `;
  setScreen('exam', renderConstellationVideoScreen({
    ariaLabel: 'Spud Certification Exam Introduction',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-exam-back-menu',
    backAriaLabel: 'Back to Main Menu',
    narrow: true,
    extraClass: 'exam-screen',
  }));
  screenRoot.querySelector('[data-exam-back-menu]')?.addEventListener('click', () => {
    sfx.click();
    showMenu();
  });
  screenRoot.querySelector('[data-exam-start]')?.addEventListener('click', () => {
    sfx.click();
    startExam();
  });
}

function startExam(): void {
  exam = { questions: shuffle(EXAM_QUESTIONS).slice(0, EXAM_QUESTION_COUNT), index: 0, score: 0, selected: [], submitted: false, missed: [] };
  renderExamQuestion();
}

function renderExamQuestion(): void {
  const question = exam.questions[exam.index];
  if (!question) {
    finishExam();
    return;
  }
  const pct = Math.round(((exam.index + (exam.submitted ? 1 : 0)) / exam.questions.length) * 100);
  const utilityMarkup = `
    <span class="spud-metric-chip">SCORE <b>${exam.score} / ${exam.questions.length}</b></span>
    <span class="spud-metric-chip">PROGRESS <b>${pct}%</b></span>
  `;
  const bodyMarkup = `
    ${renderConstellationTitle(
      `QUESTION ${String(exam.index + 1).padStart(2, '0')} OF ${String(exam.questions.length).padStart(2, '0')}`,
      'exam-question-title',
      `${question.topic} · SPUD CERTIFICATION`,
    )}
    <div class="spud-copy-block">
      <p style="font-size:clamp(15px,1.5vw,18px);color:#ffffff;">${escapeHtml(question.prompt)}</p>
    </div>
    <div class="spud-constellation-divider" aria-hidden="true"></div>
    <div class="spud-split-columns">
      <div class="spud-copy-stack">
        <div class="spud-constellation-heading">
          ${question.correct.length > 1 ? 'MULTI-SELECT · CHOOSE ALL CORRECT ANSWERS' : 'SINGLE-SELECT · CHOOSE ONE ANSWER'}
        </div>
        <div class="spud-exam-options">
          ${question.options.map((option, index) => `
            <button
              class="spud-exam-choice exam-option ${exam.selected.includes(index) ? 'selected' : ''}"
              type="button"
              data-exam-option="${index}"
              ${exam.submitted ? 'disabled' : ''}
            >
              <span class="spud-choice-letter">${String.fromCharCode(65 + index)}</span>
              <strong>${escapeHtml(option)}</strong>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="spud-vertical-rule" aria-hidden="true"></div>
      <aside class="spud-copy-stack">
        <div class="spud-loadout-portrait">
          <div class="spud-portrait-ring"><img src="/assets/potato-researcher.png" alt="" /></div>
          <div class="spud-loadout-meta">
            <span>S.P.U.D.I.E. PROCTOR</span>
            <h3>${escapeHtml(question.topic.toUpperCase())}</h3>
            <small>Question ${exam.index + 1} of ${exam.questions.length}</small>
          </div>
        </div>
        <div class="spud-copy-block" ${exam.submitted ? '' : 'hidden'}>
          <h2>${exam.missed.includes(question) ? 'REVIEW REQUIRED' : 'VERIFIED CORRECT'}</h2>
          <p>${escapeHtml(question.explanation)}</p>
        </div>
        <div class="spud-copy-block" ${exam.submitted ? 'hidden' : ''}>
          <h2>CADET GUIDANCE</h2>
          <p>Select your response on the left, then lock in your answer to receive immediate telemetry verification.</p>
        </div>
      </aside>
    </div>
    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'back', label: 'EXIT EXAM', attrs: 'data-exam-exit' })}
      ${renderConstellationAction({
        icon: exam.submitted ? 'forward' : 'cert',
        label: exam.submitted ? (exam.index + 1 === exam.questions.length ? 'SEE RESULT' : 'NEXT QUESTION') : 'SUBMIT ANSWER',
        attrs: 'data-exam-submit',
        variant: 'primary',
      })}
    </footer>
  `;

  setScreen('exam', renderConstellationVideoScreen({
    ariaLabel: 'Spud Certification Exam Question',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-exam-exit',
    backAriaLabel: 'Exit Exam to Main Menu',
    utilityMarkup,
    extraClass: 'exam-screen',
  }));
  screenRoot.querySelectorAll('[data-exam-exit]').forEach(el => el.addEventListener('click', () => {
    sfx.click();
    showMenu();
  }));
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-exam-option]').forEach(button => button.addEventListener('click', () => {
    if (exam.submitted) return;
    const option = Number(button.dataset.examOption);
    if (!Number.isInteger(option)) return;
    sfx.click();
    if (question.correct.length === 1) exam.selected = [option];
    else exam.selected = exam.selected.includes(option) ? exam.selected.filter(item => item !== option) : [...exam.selected, option];
    renderExamQuestion();
  }));
  screenRoot.querySelector('[data-exam-submit]')?.addEventListener('click', () => {
    if (exam.submitted) {
      sfx.click();
      exam.index += 1;
      exam.selected = [];
      exam.submitted = false;
      renderExamQuestion();
      return;
    }
    if (!exam.selected.length) {
      showToast('Choose an answer before submitting.');
      return;
    }
    const correct = [...exam.selected].sort().join(',') === [...question.correct].sort().join(',');
    exam.submitted = true;
    if (correct) exam.score += 1;
    else exam.missed.push(question);
    if (correct) sfx.correct();
    else sfx.wrong();
    renderExamQuestion();
  });
}

function finishExam(): void {
  const percentage = Math.round((exam.score / exam.questions.length) * 100);
  save.examBest = Math.max(save.examBest, percentage);
  save.certified = percentage >= EXAM_PASS_RATIO * 100;
  saveSettings();
  if (save.certified) {
    const bodyMarkup = `
      ${renderConstellationTitle('FLIGHT APPROVED', 'graduation-title', `CERTIFICATION RESULT · ${percentage}%`)}
      <div class="spud-orbital-seal">✦<small>SPUDNAUT</small></div>
      <div class="spud-copy-block" style="text-align:center;">
        <p>S.P.U.D.I.E. has certified you for the 30-day cooperative habitat trial.</p>
      </div>
      <div class="spud-telemetry-grid">
        <div class="spud-telemetry-cell">
          <span>TRAINING RANK</span>
          <strong>${escapeHtml(save.trainingRank ?? 'B')}</strong>
          <small>DECK RECORD</small>
        </div>
        <div class="spud-telemetry-cell">
          <span>THIS ATTEMPT</span>
          <strong>${percentage}%</strong>
          <small>FLIGHT SCORE</small>
        </div>
        <div class="spud-telemetry-cell">
          <span>EXAM BEST</span>
          <strong>${save.examBest}%</strong>
          <small>CERTIFIED</small>
        </div>
      </div>
      <footer class="spud-constellation-actions is-centered">
        ${renderConstellationAction({ icon: 'play', label: 'CHOOSE YOUR MISSION', attrs: 'data-graduate', variant: 'primary' })}
      </footer>
    `;
    setScreen('graduation', renderConstellationVideoScreen({
      ariaLabel: 'Flight Approved Certification',
      bodyMarkup,
      backLabel: 'MENU',
      backAttrs: 'data-graduate-menu',
      backAriaLabel: 'Back to Main Menu',
      narrow: true,
      extraClass: 'graduation-screen',
    }));
    screenRoot.querySelector('[data-graduate-menu]')?.addEventListener('click', () => {
      sfx.click();
      showMenu();
    });
    screenRoot.querySelector('[data-graduate]')?.addEventListener('click', () => {
      sfx.click();
      showLobby();
    });
  } else {
    remediationIndex = 0;
    showRemedial();
  }
}

function showRemedial(): void {
  const lessons = exam.missed.length ? exam.missed : exam.questions;
  const question = lessons[remediationIndex % lessons.length];
  if (!question) return showExamIntro();
  const bodyMarkup = `
    ${renderConstellationTitle(
      `REVIEW: ${question.topic.toUpperCase()}`,
      'remedial-title',
      `REMEDIAL SPUD ACADEMY · ${remediationIndex + 1} / ${lessons.length}`,
    )}
    <div class="spud-copy-stack">
      <div class="spud-copy-block">
        <h2>FIELD PRINCIPLE</h2>
        <p>${escapeHtml(question.lesson)}</p>
      </div>
      <div class="spud-constellation-divider" aria-hidden="true"></div>
      <div class="spud-copy-block">
        <h2>MISSED QUESTION</h2>
        <p>${escapeHtml(question.prompt)}</p>
        <small style="color:var(--spud-ice);">
          Correct answer${question.correct.length > 1 ? 's' : ''}: ${question.correct.map(index => question.options[index]).map(escapeHtml).join(' · ')}
        </small>
      </div>
    </div>
    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'forward', label: 'NEXT LESSON', attrs: 'data-remedial-next' })}
      ${renderConstellationAction({ icon: 'cert', label: 'RETAKE EXAM', attrs: 'data-retake', variant: 'primary' })}
    </footer>
  `;
  setScreen('remedial', renderConstellationVideoScreen({
    ariaLabel: 'Remedial Academy Review',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-remedial-back',
    backAriaLabel: 'Back to Main Menu',
    narrow: true,
    extraClass: 'remedial-screen',
  }));
  screenRoot.querySelector('[data-remedial-back]')?.addEventListener('click', () => {
    sfx.click();
    showMenu();
  });
  screenRoot.querySelector('[data-remedial-next]')?.addEventListener('click', () => {
    sfx.click();
    remediationIndex = (remediationIndex + 1) % lessons.length;
    showRemedial();
  });
  screenRoot.querySelector('[data-retake]')?.addEventListener('click', () => {
    sfx.click();
    startExam();
  });
}

let preMuteMaster = 80;
let preMuteMusic = 70;
let preMuteSfx = 80;
let lastPreviewTick = 0;

interface VolumeControlSpec {
  sliderKey: 'masterVolume' | 'musicVolume' | 'volume';
  muteKey: 'master' | 'music' | 'sound';
  inputId: string;
  pillId: string;
  outputId: string;
  icon: ConstellationIconId;
  label: string;
  sub: string;
  muteTitle: string;
  isMuted: (opts: PlayerSave['options']) => boolean;
  displayVal: (opts: PlayerSave['options']) => number;
  sliderVal: (opts: PlayerSave['options']) => number;
}

const VOLUME_CONTROLS: readonly VolumeControlSpec[] = [
  {
    sliderKey: 'masterVolume',
    muteKey: 'master',
    inputId: 'opt-master-volume',
    pillId: 'opt-master-volume-pill',
    outputId: 'opt-master-volume-value',
    icon: 'masterVolume',
    label: 'Master Volume',
    sub: 'Scales all station & soundtrack audio',
    muteTitle: 'Click to mute/unmute Master',
    isMuted: opts => (opts.masterVolume ?? 80) === 0,
    displayVal: opts => opts.masterVolume ?? 80,
    sliderVal: opts => opts.masterVolume ?? 80,
  },
  {
    sliderKey: 'musicVolume',
    muteKey: 'music',
    inputId: 'opt-music-volume',
    pillId: 'opt-music-volume-pill',
    outputId: 'opt-music-volume-value',
    icon: 'musicVolume',
    label: 'Music Volume',
    sub: 'Orbital synth & menu theme',
    muteTitle: 'Click to mute/unmute Music',
    isMuted: opts => !opts.music || opts.musicVolume === 0,
    displayVal: opts => (opts.music ? opts.musicVolume : 0),
    sliderVal: opts => opts.musicVolume,
  },
  {
    sliderKey: 'volume',
    muteKey: 'sound',
    inputId: 'opt-volume',
    pillId: 'opt-volume-pill',
    outputId: 'opt-volume-value',
    icon: 'sfxVolume',
    label: 'Sound / SFX Volume',
    sub: 'Interface chimes, airlocks & alerts',
    muteTitle: 'Click to mute/unmute SFX',
    isMuted: opts => !opts.sound || opts.volume === 0,
    displayVal: opts => (opts.sound ? opts.volume : 0),
    sliderVal: opts => opts.volume,
  },
];

function renderOptionsContentMarkup(returnScreen: 'menu' | 'training' | 'mission', options: PlayerSave['options']): string {
  return `
    <button
      class="spud-menu-item spud-constellation-back"
      type="button"
      data-options-back
      ${returnScreen === 'menu' ? '' : 'data-game-return'}
      aria-label="${returnScreen === 'menu' ? 'Back to Main Menu' : 'Return to Game'}"
    >
      ${renderConstellationIcon('back', 'spud-back-constellation')}
      <span class="spud-menu-label">BACK</span>
    </button>

    <article class="spud-options-panel" aria-labelledby="options-window-title">
      <header class="spud-options-header">
        <div class="spud-options-title-row">
          <span class="spud-constellation-rule" aria-hidden="true"></span>
          <h1 id="options-window-title" tabindex="-1">OPTIONS</h1>
          <span class="spud-constellation-rule is-right" aria-hidden="true"></span>
        </div>
      </header>

      <div class="spud-options-body">
        <section class="spud-volume-section" aria-label="Volume Settings">
          <div class="spud-section-heading">VOLUME</div>
          <div class="spud-volume-list">
            ${VOLUME_CONTROLS.map(ctrl => {
              const shown = ctrl.displayVal(options);
              const val = ctrl.sliderVal(options);
              const muted = ctrl.isMuted(options);
              return `
                <div class="spud-vol-row">
                  <div class="spud-vol-icon-wrap">${renderConstellationIcon(ctrl.icon, 'spud-vol-icon')}</div>
                  <div class="spud-vol-main">
                    <div class="spud-vol-top">
                      <div class="spud-vol-copy">
                        <label class="spud-vol-label" for="${ctrl.inputId}">${ctrl.label}</label>
                        <small class="spud-vol-sub">${ctrl.sub}</small>
                      </div>
                      <button
                        type="button"
                        class="spud-pct-readout ${muted ? 'is-muted' : ''}"
                        id="${ctrl.pillId}"
                        data-mute-pill="${ctrl.muteKey}"
                        title="${ctrl.muteTitle}"
                      >
                        <output id="${ctrl.outputId}">${shown}%</output>
                      </button>
                    </div>
                    <input
                      class="spud-range"
                      id="${ctrl.inputId}"
                      data-slider="${ctrl.sliderKey}"
                      type="range"
                      min="0"
                      max="100"
                      value="${val}"
                      style="--fill:${val}%"
                    />
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <section class="spud-display-section" aria-label="Telemetry Settings">
          <div class="spud-section-heading">DISPLAY</div>
          <div class="spud-toggle-row">
            <div class="spud-vol-icon-wrap">${renderConstellationIcon('fps', 'spud-vol-icon')}</div>
            <div class="spud-vol-copy">
              <label class="spud-vol-label" for="opt-show-fps">Show FPS</label>
              <small class="spud-vol-sub">Displays live frame rate during gameplay</small>
            </div>
            <button
              type="button"
              class="spud-constellation-switch ${options.showFps ? 'is-on' : ''}"
              id="opt-show-fps"
              data-toggle-option="showFps"
              role="switch"
              aria-checked="${options.showFps ? 'true' : 'false'}"
              aria-label="Toggle FPS readout"
            >
              <span class="spud-switch-track" aria-hidden="true"><span class="spud-switch-node"></span></span>
              <span class="spud-switch-state">${options.showFps ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </section>
      </div>

      <footer class="spud-options-footer">
        ${returnScreen === 'mission' ? `
          <button class="spud-menu-item spud-options-action is-warn" type="button" data-abort-mission aria-haspopup="dialog">
            ${renderConstellationIcon('abort')}
            <span class="spud-menu-label">ABORT MISSION</span>
          </button>
        ` : ''}
        <button class="spud-menu-item spud-options-action is-reset" type="button" data-options-reset aria-label="Reset progress and settings">
          ${renderConstellationIcon('reset', 'spud-reset-constellation')}
          <span class="spud-menu-label">RESET</span>
        </button>
      </footer>
    </article>
  `;
}

function showOptions(): void {
  window.clearTimeout(optionsHideTimer);
  const options = save.options;
  if (typeof options.masterVolume !== 'number') options.masterVolume = 80;
  const returnScreen = currentScreen === 'training' || currentScreen === 'mission' ? currentScreen : 'menu';
  if (returnScreen === 'training') pauseTrainingForModal();
  if (returnScreen === 'mission') {
    pauseMissionForModal();
    if (isMissionActive()) saveTrialProgress();
  }

  const existingMenuStage = returnScreen === 'menu'
    ? screenRoot.querySelector<HTMLElement>('.screen-menu.spud-video-menu')
    : null;
  const existingOverlayHost = existingMenuStage?.querySelector<HTMLElement>('.spud-options-overlay') ?? null;

  let optionsRoot: HTMLElement;

  if (existingMenuStage && existingOverlayHost) {
    currentScreen = 'options';
    document.body.dataset.screen = 'options';
    existingOverlayHost.innerHTML = renderOptionsContentMarkup(returnScreen, options);
    existingOverlayHost.hidden = false;
    void existingOverlayHost.offsetWidth;
    existingMenuStage.classList.add('is-options-open');
    optionsRoot = existingOverlayHost;
  } else {
    setScreen('options', `
      <section class="screen-menu spud-video-menu is-options-open is-standalone-options ${options.reducedMotion ? 'reduce-motion' : ''}">
        <img class="menu-ambient-backdrop" src="/assets/main-menu-poster.jpg" alt="" aria-hidden="true" />
        <div class="video-menu-stage">
          <video
            class="menu-video-player"
            src="/assets/main-menu.mp4"
            poster="/assets/main-menu-poster.jpg"
            autoplay
            loop
            muted
            playsinline
            preload="auto"
            aria-hidden="true"
          ></video>
          <img class="menu-video-poster" src="/assets/main-menu-poster.jpg" alt="" aria-hidden="true" />
          <div class="menu-video-vignette" aria-hidden="true"></div>
          <div class="spud-options-overlay">${renderOptionsContentMarkup(returnScreen, options)}</div>
        </div>
      </section>
    `);
    optionsRoot = screenRoot;
  }

  optionsRoot.querySelector<HTMLElement>('#options-window-title')?.focus();
  optionsRoot.querySelector('[data-abort-mission]')?.addEventListener('click', showAbortMissionConfirmation);

  const syncOptionVisuals = (): void => {
    for (const ctrl of VOLUME_CONTROLS) {
      const shown = ctrl.displayVal(options);
      const val = ctrl.sliderVal(options);
      const out = optionsRoot.querySelector<HTMLOutputElement>(`#${ctrl.outputId}`);
      const pill = optionsRoot.querySelector<HTMLElement>(`#${ctrl.pillId}`);
      const input = optionsRoot.querySelector<HTMLInputElement>(`#${ctrl.inputId}`);
      if (out) out.value = `${shown}%`;
      if (pill) pill.classList.toggle('is-muted', ctrl.isMuted(options));
      if (input) {
        input.value = String(val);
        input.style.setProperty('--fill', `${val}%`);
      }
    }
    const fpsSwitch = optionsRoot.querySelector<HTMLButtonElement>('[data-toggle-option="showFps"]');
    if (fpsSwitch) {
      const enabled = Boolean(options.showFps);
      fpsSwitch.classList.toggle('is-on', enabled);
      fpsSwitch.setAttribute('aria-checked', enabled ? 'true' : 'false');
      const stateEl = fpsSwitch.querySelector<HTMLElement>('.spud-switch-state');
      if (stateEl) stateEl.textContent = enabled ? 'ON' : 'OFF';
    }
  };

  const refresh = (): void => {
    syncOptionVisuals();
    applyOptions();
    saveSettings();
  };

  optionsRoot.querySelector('[data-toggle-option="showFps"]')?.addEventListener('click', () => {
    options.showFps = !options.showFps;
    sfx.click();
    refresh();
  });

  optionsRoot.querySelectorAll<HTMLButtonElement>('[data-mute-pill]').forEach(pill => pill.addEventListener('click', () => {
    const target = pill.dataset.mutePill;
    if (target === 'master') {
      const current = options.masterVolume ?? 80;
      if (current > 0) {
        preMuteMaster = current;
        options.masterVolume = 0;
      } else {
        options.masterVolume = preMuteMaster || 80;
      }
    } else if (target === 'music') {
      if (options.music && options.musicVolume > 0) {
        preMuteMusic = options.musicVolume;
        options.music = false;
      } else {
        options.music = true;
        if (options.musicVolume === 0) options.musicVolume = preMuteMusic || 70;
      }
    } else if (target === 'sound') {
      if (options.sound && options.volume > 0) {
        preMuteSfx = options.volume;
        options.sound = false;
      } else {
        options.sound = true;
        if (options.volume === 0) options.volume = preMuteSfx || 80;
      }
    }
    sfx.click();
    refresh();
  }));

  optionsRoot.querySelectorAll<HTMLInputElement>('[data-slider]').forEach(input => input.addEventListener('input', () => {
    const key = input.dataset.slider;
    if (key !== 'volume' && key !== 'musicVolume' && key !== 'masterVolume') return;
    const val = Number(input.value);
    options[key] = val;
    if (key === 'volume' && val > 0 && !options.sound) options.sound = true;
    if (key === 'musicVolume' && val > 0 && !options.music) options.music = true;
    refresh();
    if ((key === 'volume' || key === 'masterVolume') && Date.now() - lastPreviewTick > 140) {
      lastPreviewTick = Date.now();
      sfx.click();
    }
  }));

  optionsRoot.querySelector('[data-options-back]')?.addEventListener('click', () => {
    sfx.click();
    if (returnScreen === 'mission') {
      showMissionShell();
      resumeMissionAfterModal();
      startLoop();
      hud.querySelector<HTMLButtonElement>('[data-action="options"]')?.focus();
    } else if (returnScreen === 'training') {
      currentScreen = 'training';
      screenRoot.hidden = true;
      sceneShell.hidden = false;
      hud.hidden = true;
      trainingHud.hidden = false;
      document.body.dataset.screen = 'game';
      wakeStationGame();
      renderTrainingHud();
      applyOptions();
      resumeTraining();
    } else if (existingMenuStage && existingOverlayHost) {
      currentScreen = 'menu';
      document.body.dataset.screen = 'menu';
      existingMenuStage.classList.remove('is-options-open');
      window.clearTimeout(optionsHideTimer);
      optionsHideTimer = window.setTimeout(() => {
        if (currentScreen === 'menu') {
          existingOverlayHost.hidden = true;
          existingOverlayHost.replaceChildren();
        }
      }, options.reducedMotion ? 0 : 280);
      existingMenuStage.querySelector<HTMLButtonElement>('.spud-center-nav [data-menu="options"]')?.focus();
    } else {
      showMenu();
    }
  });

  optionsRoot.querySelector('[data-options-reset]')?.addEventListener('click', () => {
    if (!window.confirm('Reset training progress, settings, and active mission save? This cannot be undone.')) return;
    save = defaultSave();
    lobby = { ...DEFAULT_LOBBY, playerName: save.name, colorId: save.colorId, specialist: save.specialist, destination: save.destination };
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_BACKUP_KEY); } catch { /* Storage may be unavailable. */ }
    persistSave(save);
    applyOptions();
    showMenu();
  });
}

function openConstellationConfirmDialog(opts: {
  kicker: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmIcon: ConstellationIconId;
  confirmVariant?: 'primary' | 'danger';
  errorText?: string;
  onConfirm: (ctx: { close: () => void; showError: () => void }) => void;
}): void {
  sfx.click();
  modalRoot.innerHTML = `
    <dialog class="game-menu-dialog mission-abort-dialog" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-description">
      <section class="spud-copy-stack">
        <div class="spud-modal-top">
          <div>
            <span class="spud-constellation-kicker" style="margin-bottom:2px;">${escapeHtml(opts.kicker)}</span>
            <h2 id="confirm-modal-title">${escapeHtml(opts.title)}</h2>
          </div>
        </div>
        <div class="spud-copy-block">
          <p id="confirm-modal-description">${escapeHtml(opts.description)}</p>
          ${opts.errorText ? `<p class="mission-abort-error" style="color:var(--spud-danger);" role="alert" hidden>${escapeHtml(opts.errorText)}</p>` : ''}
        </div>
        <footer class="spud-constellation-actions">
          ${renderConstellationAction({ icon: 'back', label: opts.cancelLabel, attrs: 'data-confirm-cancel autofocus' })}
          ${renderConstellationAction({ icon: opts.confirmIcon, label: opts.confirmLabel, attrs: 'data-confirm-accept', variant: opts.confirmVariant ?? 'primary' })}
        </footer>
      </section>
    </dialog>
  `;
  const dialog = modalRoot.querySelector<HTMLDialogElement>('dialog')!;
  const close = (): void => {
    dialog.close();
    modalRoot.replaceChildren();
  };
  const showError = (): void => {
    const errEl = dialog.querySelector<HTMLElement>('.mission-abort-error');
    if (errEl) errEl.hidden = false;
  };
  dialog.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => {
    sfx.click();
    close();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
  dialog.querySelector('[data-confirm-accept]')?.addEventListener('click', () => {
    opts.onConfirm({ close, showError });
  });
  dialog.showModal();
}

function showAbortMissionConfirmation(): void {
  openConstellationConfirmDialog({
    kicker: 'COMMAND OVERRIDE',
    title: 'ABORT THIS MISSION?',
    description: 'This ends your current trial and clears its shift progress and reports. Your training progress and settings are kept.',
    cancelLabel: 'KEEP MISSION',
    confirmLabel: 'ABORT & RETURN',
    confirmIcon: 'abort',
    confirmVariant: 'danger',
    errorText: 'Could not clear the saved trial. Your mission is still active.',
    onConfirm: ({ close, showError }) => {
      const nextSave: PlayerSave = { ...save, activeTrial: null, trialDay: 0 };
      if (!persistSave(nextSave, { replaceBackup: true })) {
        showError();
        return;
      }
      sfx.click();
      save = nextSave;
      mission = createMissionState();
      planningEventBase = null;
      selectedEventChoice = '';
      close();
      showMenu();
    },
  });
}

function confirmReplaceSavedTrial(opts: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmIcon?: ConstellationIconId;
  variant?: 'primary' | 'danger';
  onConfirm: () => void;
}): void {
  openConstellationConfirmDialog({
    kicker: 'ACTIVE TRIAL IN PROGRESS',
    title: opts.title,
    description: opts.description,
    cancelLabel: 'KEEP SAVED TRIAL',
    confirmLabel: opts.confirmLabel,
    confirmIcon: opts.confirmIcon ?? 'forward',
    confirmVariant: opts.variant ?? 'primary',
    onConfirm: ({ close }) => {
      sfx.click();
      close();
      opts.onConfirm();
    },
  });
}

function showCredits(): void {
  const archiveItems = [
    {
      id: 'brief-01',
      badge: 'PHASE 01',
      title: 'Briefing & Onboarding',
      sub: 'Earth Simulator',
      body: 'Read the transmission logs from Year 3042 and board the Earth Training Deck to familiarize yourself with station controls.',
    },
    {
      id: 'brief-02',
      badge: 'PHASE 02',
      title: 'Systems Inspection',
      sub: '4 Core Subsystems',
      body: 'Inspect Power, Life Support, Hydroponics, and Shielding consoles on the Training Deck and speak with the command crew.',
    },
    {
      id: 'brief-03',
      badge: 'PHASE 03',
      title: 'Spud Certification',
      sub: '75% Pass Threshold',
      body: 'Pass the 8-question Spud Exam covering pressure, life support, botany, and EVA safety to earn flight clearance.',
    },
    {
      id: 'brief-04',
      badge: 'PHASE 04',
      title: '30-Day Surface Trial',
      sub: 'Moon & Mars Habitats',
      body: 'Choose 3 of 5 daily assignments each timed shift, respond to orbital hazard cards, and keep all 4 systems above target.',
    },
    {
      id: 'credits-design',
      badge: 'CREDITS',
      title: 'Mission Design',
      sub: 'Hexabyte Interactive',
      body: 'Spudnaut: The Great Starch Migration — a cooperative habitat survival trial built with Phaser 3, TypeScript, and Vite.',
    },
    {
      id: 'credits-art',
      badge: 'ASSETS',
      title: 'Art, UI & Audio',
      sub: 'Project & Open Packs',
      body: 'Potato crew and lunar/Martian vista illustrations by project artists. UI frames & icons: Kenney (CC0) and Wenrexa.',
    },
  ];
  let activeId = archiveItems[0]!.id;
  const bodyMarkup = `
    ${renderConstellationTitle('MISSION BRIEF & ARCHIVES', 'credits-title', 'HEXABYTE INTERACTIVE · YEAR 3042')}
    <div class="spud-split-columns">
      <div class="spud-copy-stack">
        <div class="spud-constellation-heading">ARCHIVE SLOTS · ${archiveItems.length} / ${archiveItems.length} UNLOCKED</div>
        <div class="spud-slot-list">
          ${archiveItems.map(item => `
            <button type="button" class="spud-slot-row ${item.id === activeId ? 'selected' : ''}" data-archive-slot="${item.id}">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.sub)}</small>
              </div>
              <span class="spud-status-tag">${item.badge}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="spud-vertical-rule" aria-hidden="true"></div>
      <aside class="spud-copy-stack">
        <div class="spud-copy-block" id="credits-inspector-main">
          <h2>${escapeHtml(archiveItems[0]!.badge)} · ${escapeHtml(archiveItems[0]!.title.toUpperCase())}</h2>
          <p>${escapeHtml(archiveItems[0]!.body)}</p>
        </div>
        <div class="spud-constellation-divider" aria-hidden="true"></div>
        <div class="spud-copy-block">
          <h2>SCIENCE NOTES &amp; NASA REFERENCES</h2>
          <p>${escapeHtml(GAME_MODEL_NOTE)}</p>
          <ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:6px;">
            ${NASA_REFERENCES.map(source => `<li><a href="${source.url}" target="_blank" rel="noreferrer" style="color:var(--spud-ice);">${escapeHtml(source.label)} ↗</a></li>`).join('')}
          </ul>
        </div>
      </aside>
    </div>
    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'back', label: 'BACK TO MENU', attrs: 'data-credits-back' })}
      ${renderConstellationAction({ icon: 'options', label: 'OPTIONS', attrs: 'data-credits-options', variant: 'primary' })}
    </footer>
  `;

  setScreen('credits', renderConstellationVideoScreen({
    ariaLabel: 'Mission Brief & Archives',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-credits-back',
    backAriaLabel: 'Back to Main Menu',
    utilityMarkup: '<span class="spud-metric-chip">SIMULATION MODEL <b>v3042</b></span>',
    extraClass: 'screen-credits',
  }));

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-archive-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.archiveSlot;
      const found = archiveItems.find(item => item.id === id);
      if (!found) return;
      activeId = found.id;
      sfx.click();
      screenRoot.querySelectorAll<HTMLButtonElement>('[data-archive-slot]').forEach(el => el.classList.toggle('selected', el === btn));
      const box = screenRoot.querySelector<HTMLElement>('#credits-inspector-main');
      if (box) {
        box.innerHTML = `<h2>${escapeHtml(found.badge)} · ${escapeHtml(found.title.toUpperCase())}</h2><p>${escapeHtml(found.body)}</p>`;
      }
    });
  });
  screenRoot.querySelectorAll('[data-credits-back]').forEach(el => el.addEventListener('click', () => {
    sfx.click();
    showMenu();
  }));
  screenRoot.querySelector('[data-credits-options]')?.addEventListener('click', () => {
    sfx.click();
    showOptions();
  });
}

function syncLobbyFromSave(): void {
  lobby = {
    playerName: save.name,
    colorId: save.colorId,
    specialist: save.specialist,
    destination: save.destination,
  };
}

function renderSpecialistGrid(selectedSpecialist: SpecialistId): string {
  return `
    <div class="spud-loadout-classes" role="group" aria-labelledby="specialist-heading">
      ${SPECIALISTS.map(specialist => `
        <button
          type="button"
          class="spud-class-row loadout-choice loadout-class"
          data-specialist="${specialist.id}"
          aria-pressed="${selectedSpecialist === specialist.id}"
          style="--choice-accent:${specialist.accent}"
        >
          <img src="${specialist.art}" alt="" />
          <div>
            <strong>${escapeHtml(specialist.name)}</strong>
            <small>${escapeHtml(specialist.role)}</small>
          </div>
          <span class="spud-orbital-check" aria-hidden="true"></span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderSuitColorNodes(selectedColorId: PlayerColorId): string {
  return `
    <div class="spud-color-nodes" role="group" aria-labelledby="suit-color-heading">
      ${PLAYER_COLORS.map(color => `
        <button
          type="button"
          class="spud-color-node loadout-choice loadout-color"
          data-color="${color.id}"
          aria-pressed="${selectedColorId === color.id}"
          style="--choice-accent:${color.css}"
        >
          <i aria-hidden="true"></i>
          <span>${escapeHtml(color.name)}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderDifficultyStrip(selectedDifficulty: DifficultyId): string {
  return `
    <div class="spud-diff-strip" role="group" aria-labelledby="difficulty-heading">
      ${(Object.keys(DIFFICULTY_INFO) as DifficultyId[]).map(diff => `
        <button
          type="button"
          class="spud-diff-choice"
          data-difficulty="${diff}"
          aria-pressed="${selectedDifficulty === diff}"
        >
          <strong>${escapeHtml(DIFFICULTY_INFO[diff].name)}</strong>
          <small>${escapeHtml(DIFFICULTY_INFO[diff].description)}</small>
        </button>
      `).join('')}
    </div>
  `;
}

function renderLoadoutUtilityToggles(randomizeAttr: string, suffix: string): string {
  return `
    <button type="button" class="spud-text-toggle" ${randomizeAttr} title="Randomize Loadout">
      ${renderConstellationIcon('randomize')}
      <span>RANDOMIZE</span>
    </button>
    <button type="button" class="spud-text-toggle ${save.options.sound ? 'active' : ''}" data-toggle="sound-${suffix}" aria-pressed="${save.options.sound}">
      ${renderConstellationIcon('sfxVolume')}
      <span class="spud-toggle-text">SOUND: ${save.options.sound ? 'ON' : 'OFF'}</span>
    </button>
    <button type="button" class="spud-text-toggle ${save.options.lineOfSight ? 'active' : ''}" data-toggle="vision-${suffix}" aria-pressed="${save.options.lineOfSight}">
      ${renderConstellationIcon('vision')}
      <span class="spud-toggle-text">VISION: ${save.options.lineOfSight ? 'ON' : 'OFF'}</span>
    </button>
  `;
}

function wireLoadoutAudioVisionToggles(root: HTMLElement, suffix: string): void {
  root.querySelector<HTMLButtonElement>(`[data-toggle="sound-${suffix}"]`)?.addEventListener('click', event => {
    const btn = event.currentTarget as HTMLButtonElement;
    save.options.sound = !save.options.sound;
    btn.classList.toggle('active', save.options.sound);
    btn.setAttribute('aria-pressed', String(save.options.sound));
    const txt = btn.querySelector<HTMLElement>('.spud-toggle-text');
    if (txt) txt.textContent = `SOUND: ${save.options.sound ? 'ON' : 'OFF'}`;
    applyOptions();
    saveSettings();
    sfx.click();
  });

  root.querySelector<HTMLButtonElement>(`[data-toggle="vision-${suffix}"]`)?.addEventListener('click', event => {
    const btn = event.currentTarget as HTMLButtonElement;
    save.options.lineOfSight = !save.options.lineOfSight;
    btn.classList.toggle('active', save.options.lineOfSight);
    btn.setAttribute('aria-pressed', String(save.options.lineOfSight));
    const txt = btn.querySelector<HTMLElement>('.spud-toggle-text');
    if (txt) txt.textContent = `VISION: ${save.options.lineOfSight ? 'ON' : 'OFF'}`;
    applyOptions();
    saveSettings();
    sfx.click();
  });
}

function wireDifficultyButtons(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
    save.options.difficulty = button.dataset.difficulty as DifficultyId;
    root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(el => {
      el.setAttribute('aria-pressed', String(el === button));
    });
    applyOptions();
    saveSettings();
    sfx.click();
  }));
}

function randomCallsign(): string {
  const callsigns = ['Cmdr. Yukon', 'Nova Spud', 'Russet-7', 'Tater Prime', 'Sol-Tuber', 'Orbit Mash', 'Kennebec'];
  return callsigns[Math.floor(Math.random() * callsigns.length)] ?? 'Spudnaut';
}

function renderLobbyInspectorDetails(): string {
  const spec = specialistById(lobby.specialist);
  const color = getColor(lobby.colorId);
  const stats = SPECIALIST_STATS[lobby.specialist] ?? SPECIALIST_STATS.repairman;
  return `
    <div class="spud-loadout-portrait" style="--choice-accent:${color.css}">
      <div class="spud-portrait-ring"><img src="${spec.art}" alt="" /></div>
      <div class="spud-loadout-meta">
        <span id="loadout-callsign">${escapeHtml(lobby.playerName.trim() || 'Spudnaut')}</span>
        <h3>${escapeHtml(spec.name)}</h3>
        <small><i aria-hidden="true"></i>${escapeHtml(color.name)} suit</small>
      </div>
    </div>
    <div class="spud-copy-block">
      <h2>CLASS PERK</h2>
      <p>${escapeHtml(spec.perk)}</p>
    </div>
    <div class="spud-stat-bars">
      ${stats.map(row => `
        <div class="spud-stat-row">
          <span>${row.label}</span>
          <div class="spud-stat-track"><div class="spud-stat-fill" style="width:${row.value}%"></div></div>
          <b>${row.value}</b>
        </div>
      `).join('')}
    </div>
  `;
}

function showLobby(): void {
  const utilityMarkup = renderLoadoutUtilityToggles('data-lobby-randomize', 'lobby');

  const bodyMarkup = `
    ${renderConstellationTitle('BUILD YOUR SPUDNAUT', 'lobby-title', 'MISSION SELECT · STEP 1 OF 2')}
    <div class="spud-split-columns">
      <div class="spud-copy-stack">
        <div class="spud-constellation-heading" id="specialist-heading">SPECIALIST CLASS</div>
        ${renderSpecialistGrid(lobby.specialist)}

        <div class="spud-constellation-heading" id="suit-color-heading">SUIT COLOR</div>
        ${renderSuitColorNodes(lobby.colorId)}

        <div class="spud-constellation-heading" id="difficulty-heading">TRIAL DIFFICULTY</div>
        ${renderDifficultyStrip(save.options.difficulty)}
      </div>

      <div class="spud-vertical-rule" aria-hidden="true"></div>

      <aside class="spud-copy-stack loadout-inspector" aria-label="Crew loadout preview">
        <div class="spud-copy-block">
          <label class="spud-constellation-heading" for="lobby-name">SPUDNAUT CALLSIGN</label>
          <input class="spud-line-input" id="lobby-name" maxlength="18" value="${escapeHtml(lobby.playerName)}" />
        </div>
        <div class="loadout-details spud-copy-stack">
          ${renderLobbyInspectorDetails()}
        </div>
      </aside>
    </div>

    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'back', label: 'MAIN MENU', attrs: 'data-lobby-back' })}
      ${renderConstellationAction({ icon: 'forward', label: 'CHOOSE HABITAT', attrs: 'data-lobby-next', variant: 'primary' })}
    </footer>
  `;

  setScreen('lobby', renderConstellationVideoScreen({
    ariaLabel: 'Build Your Spudnaut',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-lobby-back',
    backAriaLabel: 'Back to Main Menu',
    utilityMarkup,
    extraClass: 'lobby-screen',
  }));

  screenRoot.querySelector<HTMLElement>('#lobby-title')?.focus();

  const refreshLobbyInPlace = (): void => {
    screenRoot.querySelectorAll<HTMLButtonElement>('.loadout-choice').forEach(button => {
      const selected = button.dataset.color === lobby.colorId || button.dataset.specialist === lobby.specialist;
      button.setAttribute('aria-pressed', String(selected));
    });
    const details = screenRoot.querySelector<HTMLElement>('.loadout-details');
    if (details) details.innerHTML = renderLobbyInspectorDetails();
  };

  screenRoot.querySelector<HTMLInputElement>('#lobby-name')?.addEventListener('input', event => {
    lobby.playerName = (event.target as HTMLInputElement).value;
    const callsign = screenRoot.querySelector<HTMLElement>('#loadout-callsign');
    if (callsign) callsign.textContent = lobby.playerName.trim() || 'Spudnaut';
  });

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => button.addEventListener('click', () => {
    lobby.colorId = button.dataset.color as PlayerColorId;
    sfx.click();
    refreshLobbyInPlace();
  }));

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-specialist]').forEach(button => button.addEventListener('click', () => {
    lobby.specialist = button.dataset.specialist as SpecialistId;
    sfx.click();
    refreshLobbyInPlace();
  }));

  wireDifficultyButtons(screenRoot);
  wireLoadoutAudioVisionToggles(screenRoot, 'lobby');

  screenRoot.querySelector('[data-lobby-randomize]')?.addEventListener('click', () => {
    lobby.playerName = randomCallsign();
    lobby.colorId = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]?.id ?? lobby.colorId;
    lobby.specialist = SPECIALISTS[Math.floor(Math.random() * SPECIALISTS.length)]?.id ?? lobby.specialist;
    const input = screenRoot.querySelector<HTMLInputElement>('#lobby-name');
    if (input) input.value = lobby.playerName;
    sfx.click();
    refreshLobbyInPlace();
  });

  screenRoot.querySelectorAll('[data-lobby-back]').forEach(el => el.addEventListener('click', () => {
    sfx.click();
    showMenu();
  }));
  screenRoot.querySelector('[data-lobby-next]')?.addEventListener('click', () => {
    sfx.click();
    showHabitat();
  });
}

function showResumeStaging(): void {
  const saved = save.activeTrial;
  if (!saved) {
    showLobby();
    return;
  }
  syncLobbyFromSave();
  const destination = destinationById(save.destination);
  const dayLabel = trialDayLabel(saved);
  const shiftStageLabel = saved.phase === 'report' && saved.report
    ? 'SAVED SHIFT REPORT'
    : saved.tasks.length > 0
      ? `SHIFT IN PROGRESS · ${saved.completed.length} / ${saved.tasks.length} TASKS`
      : 'SHIFT PLANNING READY';
  const stageShort = saved.phase === 'report' && saved.report
    ? 'REPORT'
    : saved.tasks.length > 0
      ? `${saved.completed.length} / ${saved.tasks.length} TASKS`
      : 'PLANNING';
  const metricOrder: (keyof MissionMetrics)[] = ['power', 'oxygen', 'water', 'starch', 'hull', 'morale', 'research'];
  const utilityMarkup = renderLoadoutUtilityToggles('data-resume-randomize', 'resume');

  const bodyMarkup = `
    ${renderConstellationTitle('RESUME EXPEDITION', 'resume-title', `${dayLabel} · ${destination.name.toUpperCase()} · ${shiftStageLabel}`)}
    <div class="spud-split-columns">
      <div class="spud-copy-stack">
        <div class="spud-copy-block">
          <label class="spud-constellation-heading" for="resume-name">SPUDNAUT CALLSIGN (APPLIES LIVE)</label>
          <input class="spud-line-input" id="resume-name" maxlength="18" value="${escapeHtml(lobby.playerName)}" />
        </div>

        <div class="spud-constellation-heading" id="suit-color-heading">SUIT COLOR (APPLIES LIVE)</div>
        ${renderSuitColorNodes(lobby.colorId)}

        <div class="spud-constellation-heading" id="difficulty-heading">TRIAL DIFFICULTY (NEXT SHIFT)</div>
        ${renderDifficultyStrip(save.options.difficulty)}

        <div class="spud-constellation-heading" id="specialist-heading">SPECIALIST CLASS · ACTIVE TRIAL (CHANGING OPENS NEW MISSION SETUP)</div>
        ${renderSpecialistGrid(save.specialist)}

        <div class="spud-constellation-heading" id="resume-habitat-heading">TARGET HABITAT · ACTIVE TRIAL (CHANGING OPENS NEW MISSION SETUP)</div>
        <div class="spud-diff-strip" style="grid-template-columns:repeat(2,minmax(0,1fr));" role="group" aria-labelledby="resume-habitat-heading">
          ${DESTINATIONS.map(dest => `
            <button
              type="button"
              class="spud-diff-choice"
              data-resume-destination="${dest.id}"
              aria-pressed="${save.destination === dest.id}"
            >
              <strong>${escapeHtml(dest.name)}</strong>
              <small>${escapeHtml(dest.gravity)} · ${escapeHtml(dest.hazard)}</small>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="spud-vertical-rule" aria-hidden="true"></div>

      <aside class="spud-copy-stack loadout-inspector" aria-label="Saved expedition status">
        <div class="loadout-details spud-copy-stack">
          ${renderLobbyInspectorDetails()}
        </div>
        <div class="spud-constellation-heading">SAVED HABITAT TELEMETRY</div>
        <div class="spud-telemetry-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;">
          <div class="spud-telemetry-cell">
            <span>TRIAL DAY</span>
            <strong>${dayLabel}</strong>
            <small>${escapeHtml(destination.name.toUpperCase())}</small>
          </div>
          <div class="spud-telemetry-cell">
            <span>SHIFT STAGE</span>
            <strong>${stageShort}</strong>
            <small>${saved.missedDays} MISSED SHIFTS</small>
          </div>
        </div>
        <div class="spud-stat-bars">
          ${metricOrder.map(metric => {
            const val = Math.round(saved.metrics[metric]);
            return `
              <div class="spud-stat-row">
                <span>${METRIC_LABELS[metric].split(' ')[0]!.toUpperCase()}</span>
                <div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.min(100, Math.max(0, val))}%"></div></div>
                <b>${val}%</b>
              </div>
            `;
          }).join('')}
        </div>
      </aside>
    </div>

    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'back', label: 'MAIN MENU', attrs: 'data-resume-back' })}
      ${renderConstellationAction({ icon: 'play', label: 'NEW MISSION', attrs: 'data-resume-new' })}
      ${renderConstellationAction({ icon: 'abort', label: 'ABORT TRIAL', attrs: 'data-resume-abort', variant: 'danger' })}
      ${renderConstellationAction({ icon: 'forward', label: 'CONTINUE SHIFT', attrs: 'data-resume-go', variant: 'primary' })}
    </footer>
  `;

  setScreen('lobby', renderConstellationVideoScreen({
    ariaLabel: 'Resume Expedition Loadout and Choices',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-resume-back',
    backAriaLabel: 'Back to Main Menu',
    utilityMarkup,
    extraClass: 'resume-staging-screen',
  }));

  screenRoot.querySelector<HTMLElement>('#resume-title')?.focus();

  const persistResumeCustomizations = (): void => {
    save.name = lobby.playerName.trim() || 'Spudnaut';
    save.colorId = lobby.colorId;
    persistSave(save);
  };

  const refreshResumeLoadoutInPlace = (): void => {
    screenRoot.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.color === lobby.colorId));
    });
    const details = screenRoot.querySelector<HTMLElement>('.loadout-details');
    if (details) details.innerHTML = renderLobbyInspectorDetails();
  };

  screenRoot.querySelector<HTMLInputElement>('#resume-name')?.addEventListener('input', event => {
    lobby.playerName = (event.target as HTMLInputElement).value;
    persistResumeCustomizations();
    const callsign = screenRoot.querySelector<HTMLElement>('#loadout-callsign');
    if (callsign) callsign.textContent = lobby.playerName.trim() || 'Spudnaut';
  });

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => button.addEventListener('click', () => {
    lobby.colorId = button.dataset.color as PlayerColorId;
    persistResumeCustomizations();
    sfx.click();
    refreshResumeLoadoutInPlace();
  }));

  wireDifficultyButtons(screenRoot);
  wireLoadoutAudioVisionToggles(screenRoot, 'resume');

  screenRoot.querySelector('[data-resume-randomize]')?.addEventListener('click', () => {
    lobby.playerName = randomCallsign();
    lobby.colorId = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]?.id ?? lobby.colorId;
    persistResumeCustomizations();
    const input = screenRoot.querySelector<HTMLInputElement>('#resume-name');
    if (input) input.value = lobby.playerName;
    sfx.click();
    refreshResumeLoadoutInPlace();
  });

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-specialist]').forEach(button => button.addEventListener('click', () => {
    const chosenId = button.dataset.specialist as SpecialistId;
    if (chosenId === save.specialist) {
      sfx.click();
      return;
    }
    const spec = specialistById(chosenId);
    confirmReplaceSavedTrial({
      title: `SWITCH TO ${spec.name.toUpperCase()}?`,
      description: `Changing your Specialist Class starts a new Day 01 expedition setup. Your saved ${dayLabel} mission stays safe until you confirm launch on Flight Check.`,
      confirmLabel: 'OPEN LOADOUT SETUP',
      onConfirm: () => {
        syncLobbyFromSave();
        lobby.specialist = chosenId;
        showLobby();
      },
    });
  }));

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-resume-destination]').forEach(button => button.addEventListener('click', () => {
    const chosenDest = button.dataset.resumeDestination as DestinationId;
    if (chosenDest === save.destination) {
      sfx.click();
      return;
    }
    const dest = destinationById(chosenDest);
    confirmReplaceSavedTrial({
      title: `SWITCH TO ${dest.name.toUpperCase()}?`,
      description: `Changing your Target Habitat starts a new Day 01 expedition setup. Your saved ${dayLabel} mission stays safe until you confirm launch on Flight Check.`,
      confirmLabel: 'OPEN HABITAT SETUP',
      onConfirm: () => {
        syncLobbyFromSave();
        lobby.destination = chosenDest;
        showHabitat();
      },
    });
  }));

  screenRoot.querySelectorAll('[data-resume-back]').forEach(el => el.addEventListener('click', () => {
    sfx.click();
    showMenu();
  }));

  screenRoot.querySelector('[data-resume-new]')?.addEventListener('click', () => {
    confirmReplaceSavedTrial({
      title: 'START A NEW MISSION SETUP?',
      description: `Opens full Loadout and Habitat selection for a fresh Day 01 trial. Your saved ${dayLabel} mission stays intact until you confirm Launch.`,
      confirmLabel: 'GO TO LOADOUT',
      confirmIcon: 'play',
      onConfirm: () => {
        syncLobbyFromSave();
        showLobby();
      },
    });
  });

  screenRoot.querySelector('[data-resume-abort]')?.addEventListener('click', showAbortMissionConfirmation);

  screenRoot.querySelector('[data-resume-go]')?.addEventListener('click', () => {
    persistResumeCustomizations();
    sfx.launch();
    resumeTrial();
  });
}

function renderHabitatBrief(): string {
  const destination = destinationById(lobby.destination);
  const brief = scienceBrief(destination.id);
  return `
    <div class="spud-copy-block">
      <h2>FIELD SCIENCE · ${escapeHtml(destination.name.toUpperCase())}</h2>
      <p>${escapeHtml(brief.fact)}</p>
      <small>${escapeHtml(brief.operationsNote)}</small>
    </div>
  `;
}

function showHabitat(): void {
  const bodyMarkup = `
    ${renderConstellationTitle('CHOOSE YOUR TARGET HABITAT', 'habitat-title', 'MISSION SELECT · STEP 2 OF 2')}
    <div class="spud-split-columns">
      <div class="spud-habitat-grid" role="group" aria-label="Target habitat">
        ${DESTINATIONS.map(destination => `
          <button
            type="button"
            class="spud-habitat-node habitat-choice"
            data-destination="${destination.id}"
            aria-pressed="${lobby.destination === destination.id}"
            style="--habitat-accent:${destination.accent}"
          >
            <span class="spud-habitat-orb">
              <img src="/assets/habitats/${destination.id}.png" alt="" width="1254" height="1254" />
            </span>
            <strong>${escapeHtml(destination.name)}</strong>
            <small>${escapeHtml(destination.gravity)} · ${escapeHtml(destination.hazard)}</small>
          </button>
        `).join('')}
      </div>
      <div class="spud-vertical-rule" aria-hidden="true"></div>
      <aside class="spud-copy-stack habitat-brief" aria-live="polite">
        ${renderHabitatBrief()}
      </aside>
    </div>
    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'back', label: 'BACK TO CLASS', attrs: 'data-habitat-back' })}
      ${renderConstellationAction({ icon: 'forward', label: 'CONTINUE TO LAUNCH', attrs: 'data-habitat-next', variant: 'primary' })}
    </footer>
  `;

  setScreen('lobby', renderConstellationVideoScreen({
    ariaLabel: 'Choose Target Habitat',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-habitat-back',
    backAriaLabel: 'Back to Class Selection',
    extraClass: 'habitat-screen',
  }));

  screenRoot.querySelector<HTMLElement>('#habitat-title')?.focus();

  const choices = screenRoot.querySelectorAll<HTMLButtonElement>('[data-destination]');
  const brief = screenRoot.querySelector<HTMLElement>('.habitat-brief');
  choices.forEach(button => button.addEventListener('click', () => {
    lobby.destination = button.dataset.destination as DestinationId;
    sfx.click();
    choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
    if (brief) brief.innerHTML = renderHabitatBrief();
  }));

  screenRoot.querySelectorAll('[data-habitat-back]').forEach(el => el.addEventListener('click', () => {
    sfx.click();
    showLobby();
  }));
  screenRoot.querySelector('[data-habitat-next]')?.addEventListener('click', () => {
    sfx.click();
    showLaunch();
  });
}

function showLaunch(): void {
  const specialist = specialistById(lobby.specialist);
  const destination = destinationById(lobby.destination);
  const name = lobby.playerName.trim() || 'Spudnaut';
  const color = getColor(lobby.colorId);
  const bodyMarkup = `
    ${renderConstellationTitle('FINAL FLIGHT CHECK', 'launch-title', 'SPUDNAUT SPACE AGENCY · LAUNCH CLEARANCE')}
    <div class="spud-loadout-portrait" style="--choice-accent:${color.css};justify-content:center;">
      <div class="spud-portrait-ring"><img src="${specialist.art}" alt="" /></div>
      <div class="spud-loadout-meta">
        <span>CREW MANIFEST LOCKED</span>
        <h3>${escapeHtml(name)} · ${escapeHtml(specialist.name)}</h3>
        <small><i aria-hidden="true"></i>${escapeHtml(specialist.perk)}</small>
      </div>
    </div>
    <div class="spud-telemetry-grid">
      <div class="spud-telemetry-cell">
        <span>TARGET</span>
        <strong>${escapeHtml(destination.name)}</strong>
        <small>SURFACE HABITAT</small>
      </div>
      <div class="spud-telemetry-cell">
        <span>GRAVITY</span>
        <strong>${escapeHtml(destination.gravity)}</strong>
        <small>FIELD ENV</small>
      </div>
      <div class="spud-telemetry-cell">
        <span>HAZARD</span>
        <strong>${escapeHtml(destination.hazard)}</strong>
        <small>PRIMARY RISK</small>
      </div>
      <div class="spud-telemetry-cell">
        <span>DURATION</span>
        <strong>${TRIAL_MAX_DAY} DAYS</strong>
        <small>CO-OP TRIAL</small>
      </div>
      <div class="spud-telemetry-cell">
        <span>SYSTEMS</span>
        <strong>4 CORE</strong>
        <small>ALL MUST PASS</small>
      </div>
      <div class="spud-telemetry-cell">
        <span>MODE</span>
        <strong>${escapeHtml(DIFFICULTY_INFO[save.options.difficulty].name)}</strong>
        <small>DIFFICULTY</small>
      </div>
    </div>
    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'back', label: 'BACK TO HABITAT', attrs: 'data-launch-back' })}
      ${renderConstellationAction({ icon: 'launch', label: 'BEGIN TRIAL · DAY 01', attrs: 'data-launch-begin', variant: 'primary' })}
    </footer>
  `;

  setScreen('launch', renderConstellationVideoScreen({
    ariaLabel: 'Final Flight Check',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-launch-back',
    backAriaLabel: 'Back to Target Habitat',
    narrow: true,
    extraClass: 'launch-screen',
  }));
  screenRoot.querySelector<HTMLElement>('#launch-title')?.focus();
  screenRoot.querySelectorAll('[data-launch-back]').forEach(el => el.addEventListener('click', () => {
    sfx.click();
    showHabitat();
  }));
  screenRoot.querySelector('[data-launch-begin]')?.addEventListener('click', () => {
    const launchNew = (): void => {
      sfx.launch();
      startLaunchSequence();
    };
    if (save.activeTrial) {
      const savedDay = save.activeTrial.penaltyDay ? TRIAL_MAX_DAY + save.activeTrial.penaltyDay : save.activeTrial.day;
      confirmReplaceSavedTrial({
        title: 'LAUNCH DAY 01 & REPLACE SAVED TRIAL?',
        description: `Launching this new expedition will overwrite your saved Day ${String(savedDay).padStart(2, '0')} mission on ${destinationById(save.destination).name}.`,
        confirmLabel: 'LAUNCH DAY 01',
        confirmIcon: 'launch',
        variant: 'danger',
        onConfirm: launchNew,
      });
      return;
    }
    launchNew();
  });
}

function startLaunchSequence(): void {
  setScreen('launch', `
    <section class="screen-splash launch-sequence" aria-label="Launch and landing cinematic">
      <div class="intro-canvas" id="launch-canvas" aria-hidden="true"></div>
      <div class="intro-accessibility">
        <span>SPUDNAUT SPACE AGENCY · FLIGHT DECK</span>
        <button class="intro-skip" type="button">${renderConstellationIcon('skip')} <span>SKIP FLIGHT</span> <kbd>ENTER</kbd></button>
      </div>
    </section>
  `);
  let finished = false;
  const finish = (): void => {
    if (finished || currentScreen !== 'launch') return;
    finished = true;
    launchGame?.destroy(true);
    launchGame = null;
    beginMission();
  };
  const host = screenRoot.querySelector<HTMLDivElement>('#launch-canvas');
  if (!host) {
    finish();
    return;
  }
  void import('./game/launch').then(({ createLaunchSequence }) => {
    if (currentScreen === 'launch') launchGame = createLaunchSequence(host, { destination: lobby.destination, onComplete: finish });
  });
  screenRoot.querySelector('.intro-skip')?.addEventListener('click', finish);
}

function beginMission(): void {
  save.name = lobby.playerName.trim() || 'Spudnaut';
  save.colorId = lobby.colorId;
  save.specialist = lobby.specialist;
  save.destination = lobby.destination;
  save.trialDay = 1;
  save.activeTrial = null;
  mission = createMissionState();
  mission.phase = 'playing';
  mission.day = 1;
  showMissionShell();
  startDay();
}

function stopLoop(): void {
  if (loopTimer) {
    window.clearInterval(loopTimer);
    loopTimer = 0;
  }
}

function missionDayNumber(): number {
  return mission.day + mission.penaltyDay;
}

function trialDayLabel(trial: Pick<SavedTrial, 'day' | 'penaltyDay'>): string {
  return trial.penaltyDay
    ? `EXT. ${trial.penaltyDay} / ${PENALTY_MAX_DAY}`
    : `DAY ${String(trial.day).padStart(2, '0')} / ${TRIAL_MAX_DAY}`;
}

function isMissionActive(): boolean {
  return currentScreen === 'mission' && mission.phase === 'playing' && mission.tasks.length > 0;
}

function dayDurationMs(penaltyDay = mission.penaltyDay): number {
  const base = save.options.difficulty === 'cadet'
    ? DAY.cadetMs
    : save.options.difficulty === 'veteran'
      ? DAY.veteranMs
      : DAY.baseMs;
  return Math.round(base * (penaltyDay > 0 ? DAY.penaltyScale : 1));
}

function showMissionShell(): void {
  currentScreen = 'mission';
  stopMusic();
  stopLoop();
  window.clearTimeout(splashTimer);
  overlayRoot.replaceChildren();
  modalRoot.replaceChildren();
  screenRoot.hidden = true;
  sceneShell.hidden = false;
  hud.hidden = false;
  trainingHud.hidden = true;
  document.body.dataset.screen = 'game';
  wakeStationGame();
  if (!game) void ensureStationGame().then(() => { if (currentScreen === 'mission') { configureScene(); applyOptions(); } });
  applyOptions();
  updateHUD();
}

function startDay(draft?: SavedTrial['planning']): void {
  stopLoop();
  mission.phase = 'playing';
  mission.completed = [];
  mission.tasks = [];
  mission.selected = [];
  mission.offers = [];
  mission.report = null;
  mission.dayStartedAt = Date.now();
  mission.shiftDurationMs = 0;
  mission.pausedDuration = 0;
  mission.pauseStartedAt = 0;
  mission.modalOpen = false;
  const rng = createRng(seedFor(mission.day, mission.penaltyDay, mission.reports.length));
  const recentReports = mission.reports.slice(-3);
  mission.eventCard = eventForDay(rng, lobby.destination, mission.penaltyDay > 0 ? missionDayNumber() : mission.day, recentReports.map(report => report.eventId ?? ''));
  planningEventBase = draft ? { ...draft.eventBase } : applyDailyOperations(mission.metrics);
  const responses = mission.eventCard.responses ?? [];
  selectedEventChoice = draft && responses.some(response => response.id === selectedEventChoice)
    ? selectedEventChoice : responses[0]?.id ?? 'default';
  applyPlanningEventChoice(selectedEventChoice);
  mission.offers = offersForDay(TASKS, lobby.specialist, rng, mission.reports.slice(-2).flatMap(report => report.tasks ?? []));
  if (draft) {
    mission.selected = draft.selected.filter(id => mission.offers.some(offer => offer.taskId === id)).slice(0, DAY.assignmentsPerDay);
  }
  configureScene({ respawn: true });
  updateHUD();
  startPlanning();
  saveTrialProgress();
}

function computeProjectedMetrics(): MissionMetrics {
  let projected = { ...mission.metrics };
  for (const id of mission.selected) {
    const task = taskById(id);
    if (task) projected = applyTaskCompletion(projected, task, lobby.specialist);
  }
  return projected;
}

function renderProjectedGaugesMarkup(): string {
  const projected = computeProjectedMetrics();
  const keys: (keyof MissionMetrics)[] = ['power', 'oxygen', 'water', 'starch', 'hull', 'morale', 'research'];
  return keys.map(key => {
    const before = Math.round(mission.metrics[key]);
    const after = Math.round(projected[key]);
    const label = key === 'hull' ? 'HULL' : METRIC_LABELS[key].toUpperCase();
    return `
      <div class="shift-gauge">
        <span>${label}</span>
        <div class="spud-stat-track" aria-hidden="true"><div class="spud-stat-fill" style="width:${after}%"></div></div>
        <b class="${after > before ? 'is-gain' : ''}">${before} → ${after}</b>
      </div>
    `;
  }).join('');
}

function startPlanning(): void {
  const event = mission.eventCard;
  const day = missionDayNumber();
  const goal = mission.penaltyDay > 0 ? 'PENALTY SHIFT' : 'DAILY SHIFT';
  const required = DAY.assignmentsPerDay;
  const duration = Math.ceil(dayDurationMs() / 1000);
  const shiftTime = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`;
  let inspectedOfferId = mission.offers[0]?.taskId;

  const renderFocusedOfferBox = (): string => {
    const offer = mission.offers.find(item => item.taskId === inspectedOfferId);
    if (!offer) return '<p>No assignment to preview.</p>';
    return `
      <strong style="color:#ffffff;font-size:15px;">${escapeHtml(offer.name)}</strong>
      <p>${escapeHtml(getRoomName(offer.roomId))} · ${escapeHtml(offer.blurb)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:4px;">${assignmentPreview(offer.taskId)}</div>
    `;
  };

  overlayRoot.innerHTML = `
    <dialog class="spud-canvas-overlay shift-planner ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="shift-planning-title">
      <div class="spud-canvas-inner">
        ${renderConstellationTitle('SHIFT PLANNING', 'shift-planning-title', `${goal} · DAY ${String(day).padStart(2, '0')} · ${destinationById(lobby.destination).name.toUpperCase()} · ${shiftTime} CLOCK`)}

        <section class="spud-copy-stack" aria-labelledby="shift-event-title">
          <div class="spud-copy-block">
            <h2 id="shift-event-title">${escapeHtml((event?.kind ?? 'routine').toUpperCase())} · ${escapeHtml((event?.name ?? 'Routine Shift').toUpperCase())}</h2>
            <p>${escapeHtml(event?.description ?? 'The habitat is quiet. Keep the systems steady.')}</p>
          </div>
          ${event?.responses?.length ? `
            <div class="spud-event-responses" role="group" aria-label="Event response">
              ${event.responses.map(choice => `
                <button type="button" class="event-response" data-event-choice="${choice.id}" aria-pressed="${selectedEventChoice === choice.id}">
                  <strong>${escapeHtml(choice.label)}</strong>
                  <small style="display:block;margin-top:3px;">${escapeHtml(choice.description)}</small>
                </button>
              `).join('')}
            </div>
          ` : `<small style="color:var(--spud-ink-muted);font-family:var(--mono);letter-spacing:0.12em;">${escapeHtml(event?.effect ?? 'No event effects today.')}</small>`}
          ${event ? `
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;">
              <span class="spud-constellation-kicker" style="margin:0;">APPLIED IMPACT</span>
              <div id="event-deltas" style="display:flex;flex-wrap:wrap;gap:8px 14px;" aria-live="polite">${metricChips(metricDeltas(eventBaseMetrics(), mission.metrics))}</div>
            </div>
          ` : ''}
        </section>

        <div class="spud-constellation-divider" aria-hidden="true"></div>

        <div class="spud-split-columns">
          <section class="spud-copy-stack" aria-labelledby="shift-assignments-title">
            <div class="spud-constellation-heading" id="shift-assignments-title">ASSIGNMENTS · CHOOSE ${required} OF ${mission.offers.length}</div>
            <div class="shift-offers" role="group" aria-labelledby="shift-assignments-title">
              ${mission.offers.map(offer => `
                <button type="button" class="shift-offer" data-offer="${offer.taskId}" aria-pressed="false" style="--offer-accent:${offer.accent}">
                  <img src="/assets/ui/icons/${offer.icon}.png" width="28" height="28" alt="" />
                  <div class="shift-offer-info">
                    <strong>${escapeHtml(offer.name)}</strong>
                    <small>${escapeHtml(getRoomName(offer.roomId))} · ${escapeHtml(SYSTEMS.find(system => system.id === offer.system)?.name ?? 'Science')}<span class="shift-urgent" style="color:var(--spud-danger);" hidden> · Critical</span></small>
                  </div>
                  <span class="spud-orbital-check" aria-hidden="true"></span>
                </button>
              `).join('')}
            </div>
          </section>

          <div class="spud-vertical-rule" aria-hidden="true"></div>

          <aside class="spud-copy-stack" aria-label="Planning details">
            <div class="spud-copy-block">
              <h2>ASSIGNMENT PREVIEW</h2>
              <div id="planning-offer-inspector">${renderFocusedOfferBox()}</div>
            </div>
            <div class="spud-constellation-divider" aria-hidden="true"></div>
            <div class="spud-copy-block">
              <h2>SHIFT FORECAST</h2>
              <small>Current → projected if all selected assignments succeed.</small>
              <div class="spud-stat-bars" id="planning-projected-gauges" style="margin-top:6px;">${renderProjectedGaugesMarkup()}</div>
              <details class="shift-drift" style="margin-top:4px;">
                <summary>DAILY OPERATING COSTS</summary>
                <div style="display:flex;flex-wrap:wrap;gap:8px 14px;padding-top:6px;">${metricChips(DAILY_OPERATIONS_DRIFT)}</div>
              </details>
            </div>
          </aside>
        </div>

        <footer class="spud-constellation-actions">
          <div class="spud-copy-block" role="status">
            <strong id="planning-count" style="color:var(--spud-ice);"></strong>
            <small id="planning-instruction"></small>
          </div>
          ${renderConstellationAction({ icon: 'launch', label: 'START SHIFT', attrs: 'data-planning-confirm', variant: 'primary', disabled: true })}
        </footer>
      </div>
    </dialog>
  `;

  const titleEl = overlayRoot.querySelector<HTMLElement>('#shift-planning-title');
  titleEl?.focus();

  const dialog = overlayRoot.querySelector<HTMLDialogElement>('.shift-planner')!;
  const count = dialog.querySelector<HTMLElement>('#planning-count')!;
  const instruction = dialog.querySelector<HTMLElement>('#planning-instruction')!;
  const confirm = dialog.querySelector<HTMLButtonElement>('[data-planning-confirm]')!;
  const gauges = dialog.querySelector<HTMLElement>('#planning-projected-gauges')!;
  const inspector = dialog.querySelector<HTMLElement>('#planning-offer-inspector')!;
  const offers = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-offer]'));

  const inspectOffer = (id: string): void => {
    if (id === inspectedOfferId) return;
    inspectedOfferId = id;
    inspector.innerHTML = renderFocusedOfferBox();
  };

  const refreshPlanning = (): void => {
    for (const button of offers) {
      const offer = mission.offers.find(item => item.taskId === button.dataset.offer)!;
      button.setAttribute('aria-pressed', String(mission.selected.includes(offer.taskId)));
      button.querySelector<HTMLElement>('.shift-urgent')!.hidden = offer.system === 'science' || systemHealth(mission.metrics, offer.system) >= 55;
    }
    const remaining = required - mission.selected.length;
    count.textContent = `${mission.selected.length} of ${required} selected`;
    instruction.textContent = remaining === 0
      ? 'Ready. The timer starts when you begin.'
      : `Select ${remaining} more ${remaining === 1 ? 'assignment' : 'assignments'}.`;
    confirm.disabled = remaining !== 0;
    gauges.innerHTML = renderProjectedGaugesMarkup();
    inspector.innerHTML = renderFocusedOfferBox();
  };

  for (const button of offers) {
    const id = button.dataset.offer!;
    button.addEventListener('pointerenter', () => inspectOffer(id));
    button.addEventListener('focus', () => inspectOffer(id));
    button.addEventListener('click', () => {
      inspectOffer(id);
      if (mission.selected.includes(id)) {
        mission.selected = mission.selected.filter(item => item !== id);
      } else if (mission.selected.length < required) {
        mission.selected = [...mission.selected, id];
      } else {
        instruction.textContent = 'Plan full. Deselect an assignment to make a swap.';
        return;
      }
      sfx.click();
      refreshPlanning();
      saveTrialProgress();
    });
  }

  const responses = dialog.querySelectorAll<HTMLButtonElement>('[data-event-choice]');
  responses.forEach(button => button.addEventListener('click', () => {
    selectedEventChoice = button.dataset.eventChoice!;
    applyPlanningEventChoice(selectedEventChoice);
    responses.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    const deltas = dialog.querySelector('#event-deltas');
    if (deltas) deltas.innerHTML = metricChips(metricDeltas(eventBaseMetrics(), mission.metrics));
    sfx.click();
    refreshPlanning();
    updateHUD();
    saveTrialProgress();
  }));

  confirm.addEventListener('click', () => {
    if (mission.selected.length !== required) return;
    sfx.launch();
    dialog.close();
    commitAssignments();
  });
  dialog.addEventListener('cancel', event => event.preventDefault());
  refreshPlanning();
  dialog.showModal();
}

function assignmentPreview(taskId: string): string {
  const task = taskById(taskId);
  if (!task) return 'Task details unavailable';
  const estimatedWalk = Math.ceil(Math.hypot(task.x - mission.playerX, task.y - mission.playerY) / (250 * movementSpeed()));
  const effect = metricDeltas(mission.metrics, applyTaskCompletion(mission.metrics, task, lobby.specialist));
  const setting = task.roomId === 'exterior' ? ' · SUITED EVA' : '';
  return `EST. WALK ${estimatedWalk}s${setting} · SUCCESS: ${metricChips(effect)}`;
}

function eventBaseMetrics(): MissionMetrics {
  return { ...(planningEventBase ?? mission.metrics) };
}

function applyPlanningEventChoice(choiceId: string): void {
  if (!mission.eventCard || !planningEventBase) return;
  const choice = mission.eventCard.responses?.find(item => item.id === choiceId);
  mission.metrics = applyEvent({ ...planningEventBase }, { ...mission.eventCard, deltas: choice?.deltas ?? mission.eventCard.deltas });
}

function metricChips(deltas: Partial<MissionMetrics>): string {
  const entries = Object.entries(deltas);
  if (!entries.length) return '<span class="spud-metric-chip">NO METRIC CHANGE</span>';
  return entries.map(([key, value]) => {
    const delta = value ?? 0;
    const toneClass = delta >= 0 ? 'is-gain' : 'is-loss';
    return `<span class="spud-metric-chip">${METRIC_LABELS[key as keyof MissionMetrics].toUpperCase()} <b class="${toneClass}">${delta >= 0 ? '+' : ''}${delta}</b></span>`;
  }).join('');
}

function commitAssignments(): void {
  mission.tasks = [...mission.selected];
  mission.totalAssigned += mission.tasks.length;
  mission.phase = 'playing';
  mission.dayStartedAt = Date.now();
  mission.shiftDurationMs = dayDurationMs();
  mission.pausedDuration = 0;
  mission.pauseStartedAt = 0;
  mission.modalOpen = false;
  overlayRoot.replaceChildren();
  configureScene({ respawn: true });
  updateHUD();
  saveTrialProgress();
  startLoop();
  showToast(`Shift started. ${mission.tasks.length} assignments across the habitat.`);
}

function startLoop(): void {
  stopLoop();
  tickClock();
  if (isMissionActive()) loopTimer = window.setInterval(tickClock, 400);
}

function tickClock(): void {
  if (!isMissionActive()) return;
  if (mission.modalOpen) return;
  const remaining = remainingShiftMs(mission, Date.now());
  const clock = document.querySelector<HTMLDivElement>('#day-clock');
  if (clock) {
    const total = Math.ceil(remaining / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    clock.textContent = `SHIFT ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    clock.classList.toggle('urgent', remaining < 30000);
  }
  if (remaining <= 0) finishDay('The shift clock expired. Unfinished assignments were logged as missed.');
}

function finishDay(reason: string): void {
  if (mission.phase !== 'playing') return;
  stopLoop();
  mission.phase = 'report';
  const assigned = mission.tasks.length;
  const completed = mission.completed.length;
  if (completed < assigned) {
    mission.metrics = applyMissedDay(mission.metrics, lobby.specialist);
    mission.missedDays += 1;
  }
  const report: EarthProgressReport = {
    day: missionDayNumber(),
    completed,
    assigned,
    event: mission.eventCard?.name ?? 'Routine Shift',
    eventId: mission.eventCard?.id,
    eventChoiceId: selectedEventChoice,
    metrics: { ...mission.metrics },
    tasks: [...mission.tasks],
    completedTasks: [...mission.completed],
  };
  mission.report = report;
  mission.reports.push(report);
  configureScene();
  updateHUD();
  saveTrialProgress();
  renderReport(reason);
}

function renderReport(reason: string): void {
  const report = mission.report;
  if (!report) {
    advanceAfterReport();
    return;
  }
  const verdict = evaluateMission(mission.metrics, mission.totalAssigned, mission.totalCompleted);
  const isFinalDay = mission.day >= TRIAL_MAX_DAY;
  const metricOrder: (keyof MissionMetrics)[] = ['power', 'oxygen', 'water', 'starch', 'hull', 'morale', 'research'];
  const prevReport = mission.reports.length >= 2 ? mission.reports[mission.reports.length - 2] : null;
  const baselineMetrics = prevReport?.metrics ?? (report.day === 1 ? createMetrics() : mission.metrics);

  overlayRoot.innerHTML = `
    <section class="spud-canvas-overlay earth-report-full ${isFinalDay ? (verdict.passed ? 'final-review passed' : 'final-review below-target') : ''} ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="report-screen-title">
      <div class="spud-canvas-inner">
        ${renderConstellationTitle(
          isFinalDay ? 'FINAL HABITAT REVIEW' : 'SHIFT TELEMETRY REPORT',
          'report-screen-title',
          `EARTH PROGRESS REPORT · DAY ${String(report.day).padStart(2, '0')} OF ${TRIAL_MAX_DAY + PENALTY_MAX_DAY} · ASSIGNMENTS ${report.completed} / ${report.assigned}`,
        )}

        <div class="spud-split-columns">
          <div class="spud-copy-stack">
            <div class="spud-copy-block">
              <h2>SHIFT SUMMARY · ${escapeHtml(report.event.toUpperCase())}</h2>
              <p>${escapeHtml(reason)}</p>
            </div>
            <div class="spud-slot-list">
              ${mission.tasks.map(id => {
                const task = taskById(id);
                const done = mission.completed.includes(id);
                return `
                  <div class="spud-slot-row report-task ${done ? 'selected' : ''}">
                    <div>
                      <strong>${escapeHtml(task?.name ?? id)}</strong>
                      <small>${escapeHtml(getRoomName(task?.roomId ?? ''))}</small>
                    </div>
                    <span class="spud-status-tag ${done ? 'is-done' : 'is-urgent'}">${done ? 'DONE ✓' : 'MISSED'}</span>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="spud-meta-inline">
              <span>MISSED SHIFT DAYS: ${mission.missedDays}</span>
              <span>CUMULATIVE TASKS: ${mission.totalCompleted} / ${mission.totalAssigned}</span>
            </div>
          </div>

          <div class="spud-vertical-rule" aria-hidden="true"></div>

          <aside class="spud-copy-stack">
            <div class="spud-constellation-heading">HABITAT GAUGES &amp; SHIFT NET DELTA</div>
            <div class="spud-stat-bars">
              ${metricOrder.map(metric => {
                const value = Math.round(mission.metrics[metric]);
                const prevVal = Math.round(baselineMetrics[metric]);
                const delta = value - prevVal;
                const deltaBadge = delta > 0 ? `+${delta} ▲` : delta < 0 ? `${delta} ▼` : '0';
                const deltaColor = delta > 0 ? 'var(--spud-gain)' : delta < 0 ? 'var(--spud-danger)' : 'var(--spud-ink-muted)';
                const target = PASS_THRESHOLDS[metric as keyof typeof PASS_THRESHOLDS];
                return `
                  <div class="spud-stat-row" style="grid-template-columns:86px 1fr 94px;">
                    <span>${METRIC_LABELS[metric].split(' ')[0]!.toUpperCase()}</span>
                    <div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.min(100, Math.max(0, value))}%"></div></div>
                    <b style="text-align:right;">${value} <small style="color:${deltaColor};font-weight:600;">(${deltaBadge})</small> <small style="color:var(--spud-ink-muted);font-weight:500;">/ ${typeof target === 'number' ? Math.round(target) : '—'}</small></b>
                  </div>
                `;
              }).join('')}
            </div>
            ${isFinalDay ? `
              <div class="spud-constellation-divider" aria-hidden="true"></div>
              <div class="spud-copy-block">
                <h2>CERTIFICATION TARGETS</h2>
                <div class="spud-telemetry-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;">
                  ${verdict.requirements.map(item => `
                    <div class="spud-telemetry-cell">
                      <span>${escapeHtml(item.label)}</span>
                      <strong style="color:${item.met ? 'var(--spud-gain)' : 'var(--spud-danger)'};">${item.value} / ${item.target}</strong>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </aside>
        </div>

        <footer class="spud-constellation-actions">
          ${renderConstellationAction({ icon: 'back', label: 'SAVE & EXIT', attrs: 'data-report-save' })}
          ${renderConstellationAction({
            icon: isFinalDay && (verdict.passed || mission.penaltyDay >= PENALTY_MAX_DAY) ? 'cert' : 'forward',
            label: isFinalDay && (verdict.passed || mission.penaltyDay >= PENALTY_MAX_DAY) ? 'SEE FINAL RESULT' : 'NEXT SHIFT',
            attrs: 'data-report-next',
            variant: 'primary',
          })}
        </footer>
      </div>
    </section>
  `;
  overlayRoot.querySelector('[data-report-save]')?.addEventListener('click', () => {
    sfx.click();
    saveTrialProgress();
    showMenu();
  });
  overlayRoot.querySelector('[data-report-next]')?.addEventListener('click', () => {
    sfx.click();
    advanceAfterReport();
  });
}

function advanceAfterReport(): void {
  const verdict = evaluateMission(mission.metrics, mission.totalAssigned, mission.totalCompleted);
  if (mission.day >= TRIAL_MAX_DAY) {
    if (verdict.passed || mission.penaltyDay >= PENALTY_MAX_DAY) {
      completeMission();
      return;
    }
    mission.penaltyDay += 1;
  } else {
    mission.day += 1;
  }
  startDay();
}

function completeMission(): void {
  stopLoop();
  mission.phase = 'complete';
  const verdict = evaluateMission(mission.metrics, mission.totalAssigned, mission.totalCompleted);
  const passed = verdict.passed;
  save.games += 1;
  if (passed) save.wins += 1;
  else save.losses += 1;
  save.activeTrial = null;
  save.trialDay = 1;
  persistSave(save);
  const destination = destinationById(lobby.destination);
  const specialist = specialistById(lobby.specialist);
  const color = getColor(lobby.colorId);
  overlayRoot.innerHTML = `
    <section class="spud-canvas-overlay mission-end ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="mission-end-title">
      <div class="spud-canvas-inner">
        ${renderConstellationTitle(
          passed ? 'HABITAT CERTIFIED ★' : 'TRIAL BELOW TARGET',
          'mission-end-title',
          `SPUDNAUT SPACE AGENCY · FINAL EVALUATION · ${passed ? 'CERTIFIED' : 'REVIEW LOGGED'}`,
        )}
        <div class="spud-split-columns">
          <div class="spud-copy-stack">
            <div class="spud-loadout-portrait" style="--choice-accent:${color.css}">
              <div class="spud-portrait-ring"><img src="${specialist.art}" alt="" /></div>
              <div class="spud-loadout-meta">
                <span>${passed ? 'CERTIFICATE OF HABITABILITY' : 'FIELD RECORD'}</span>
                <h3>${escapeHtml(save.name)} · ${escapeHtml(specialist.name)}</h3>
                <small><i aria-hidden="true"></i>${escapeHtml(destination.name)} · Rank ${escapeHtml(save.trainingRank ?? 'B')}</small>
              </div>
            </div>
            <div class="spud-copy-block">
              <p>
                ${passed
                  ? `${escapeHtml(save.name)} and the crew held all four systems together for ${TRIAL_MAX_DAY + mission.penaltyDay} days on ${escapeHtml(destination.name)}. Earth approves the habitat design.`
                  : `${escapeHtml(save.name)} completed the trial on ${escapeHtml(destination.name)}, but the final metrics fell below certification targets. Earth has logged the telemetry for the next crew.`}
              </p>
            </div>
            <div class="spud-telemetry-grid is-four">
              <div class="spud-telemetry-cell">
                <span>DAYS</span>
                <strong>${mission.day + mission.penaltyDay}</strong>
                <small>TRIAL SPAN</small>
              </div>
              <div class="spud-telemetry-cell">
                <span>TASKS</span>
                <strong>${mission.totalCompleted}/${mission.totalAssigned}</strong>
                <small>COMPLETED</small>
              </div>
              <div class="spud-telemetry-cell">
                <span>MISSED</span>
                <strong>${mission.missedDays}</strong>
                <small>SHIFTS</small>
              </div>
              <div class="spud-telemetry-cell">
                <span>EXAM</span>
                <strong>${save.examBest}%</strong>
                <small>CERT BEST</small>
              </div>
            </div>
          </div>

          <div class="spud-vertical-rule" aria-hidden="true"></div>

          <aside class="spud-copy-stack">
            <div class="spud-constellation-heading">CERTIFICATION CHECKLIST</div>
            <div class="spud-slot-list">
              ${verdict.requirements.map(item => `
                <div class="spud-slot-row">
                  <strong>${escapeHtml(item.label)}</strong>
                  <span class="spud-status-tag ${item.met ? 'is-done' : 'is-urgent'}">${item.value} / ${item.target} ${item.met ? '✓' : '×'}</span>
                </div>
              `).join('')}
            </div>
          </aside>
        </div>

        <footer class="spud-constellation-actions">
          ${renderConstellationAction({ icon: 'back', label: 'RETURN TO MENU', attrs: 'data-end-menu' })}
          ${renderConstellationAction({ icon: 'launch', label: 'NEW TRIAL', attrs: 'data-end-retry', variant: 'primary' })}
        </footer>
      </div>
    </section>
  `;
  overlayRoot.querySelector('[data-end-menu]')?.addEventListener('click', () => {
    sfx.click();
    showMenu();
  });
  overlayRoot.querySelector('[data-end-retry]')?.addEventListener('click', () => {
    sfx.click();
    showLobby();
  });
}

function resumeTrial(): void {
  const saved = save.activeTrial;
  if (!saved) {
    showLobby();
    return;
  }
  lobby = {
    playerName: save.name,
    colorId: save.colorId,
    specialist: save.specialist,
    destination: save.destination,
  };
  const restoredEvent = saved.eventId ? EVENT_CARDS.find(event => event.id === saved.eventId) ?? null : null;
  const shiftDurationMs = saved.shiftDurationMs ?? Math.max(dayDurationMs(saved.penaltyDay), saved.remainingMs ?? 0);
  const elapsedMs = Math.max(0, shiftDurationMs - (saved.remainingMs ?? shiftDurationMs));
  planningEventBase = null;
  selectedEventChoice = saved.eventChoiceId ?? saved.report?.eventChoiceId ?? '';
  mission = {
    ...createMissionState(),
    ...saved,
    metrics: { ...saved.metrics },
    tasks: [...saved.tasks],
    completed: [...saved.completed],
    reports: [...saved.reports],
    offers: [],
    selected: [],
    eventCard: restoredEvent,
    dayStartedAt: Date.now() - elapsedMs,
    shiftDurationMs,
    pausedDuration: 0,
    pauseStartedAt: 0,
    modalOpen: false,
    report: saved.report,
    playerX: saved.position?.x ?? PLAYER_SPAWN.x,
    playerY: saved.position?.y ?? PLAYER_SPAWN.y,
  };
  showMissionShell();
  configureScene({ respawn: true });
  updateHUD();
  if (saved.phase === 'report' && saved.report) {
    mission.phase = 'report';
    renderReport('Saved shift report restored.');
    return;
  }
  mission.phase = 'playing';
  if (mission.tasks.length > 0) {
    if (mission.completed.length === mission.tasks.length) {
      finishDay('All daily assignments completed. Crew systems stable.');
      return;
    }
    startLoop();
    if (isMissionActive()) showToast('Trial resumed. Finish the shift before the clock runs out.');
  } else {
    startDay(saved.planning);
  }
}

function saveTrialProgress(): void {
  const phase: SavedTrial['phase'] = mission.phase === 'report' ? 'report' : mission.phase === 'penalty' ? 'penalty' : 'playing';
  const trial: SavedTrial = {
    phase,
    day: mission.day,
    penaltyDay: mission.penaltyDay,
    totalAssigned: mission.totalAssigned,
    totalCompleted: mission.totalCompleted,
    missedDays: mission.missedDays,
    metrics: { ...mission.metrics },
    tasks: [...mission.tasks],
    completed: [...mission.completed],
    eventId: mission.eventCard?.id ?? null,
    eventChoiceId: selectedEventChoice || undefined,
    position: { x: mission.playerX, y: mission.playerY },
    reports: [...mission.reports],
    report: mission.report,
    remainingMs: mission.tasks.length ? remainingShiftMs(mission, Date.now()) : undefined,
    shiftDurationMs: mission.tasks.length ? mission.shiftDurationMs : undefined,
    planning: !mission.tasks.length && planningEventBase
      ? { eventBase: { ...planningEventBase }, selected: [...mission.selected] } : undefined,
  };
  save.activeTrial = trial;
  save.trialDay = missionDayNumber();
  persistSave(save);
}

function systemsMarkup(): string {
  return SYSTEMS.map(system => {
    const value = systemHealth(mission.metrics, system.id);
    const detail = system.metrics.map(metric => `${METRIC_LABELS[metric]} ${Math.round(mission.metrics[metric])}`).join(' · ');
    return `<div class="system-bar" style="--accent:${system.accent}">
      <div style="display:flex;justify-content:space-between;align-items:center;"><span>${system.short}</span><b>${value}</b></div>
      <div class="system-bar-track"><div class="system-bar-fill" style="width:${value}%;background:linear-gradient(90deg,${system.accent},rgba(255,255,255,0.7));"></div></div>
      <small>${detail}</small>
    </div>`;
  }).join('');
}

function updateHUD(): void {
  if (currentScreen !== 'mission') return;
  const dayPill = document.querySelector<HTMLDivElement>('#trial-day');
  if (dayPill) dayPill.textContent = trialDayLabel(mission);
  const taskLabel = document.querySelector<HTMLSpanElement>('#task-label');
  const taskStatus = mission.tasks.length ? `TASKS ${mission.completed.length} / ${mission.tasks.length}` : 'PLANNING';
  if (taskLabel && taskLabel.textContent !== taskStatus) taskLabel.textContent = taskStatus;
  const fill = document.querySelector<HTMLSpanElement>('#task-fill');
  if (fill) {
    const pct = mission.tasks.length ? (mission.completed.length / mission.tasks.length) * 100 : 0;
    fill.style.width = `${pct}%`;
  }
  const crew = document.querySelector<HTMLSpanElement>('#crew-progress');
  if (crew) crew.textContent = `MISSED SHIFTS ${mission.missedDays}`;
  const name = document.querySelector<HTMLElement>('#hud-player-name');
  if (name) name.textContent = save.name.toUpperCase();
  const meta = document.querySelector<HTMLElement>('#hud-player-meta');
  if (meta) meta.textContent = `${specialistById(lobby.specialist).shortName} · ${destinationById(lobby.destination).name.toUpperCase()}`;
  const room = document.querySelector<HTMLElement>('#hud-room');
  if (room) room.textContent = (mission.room || 'Central Hub').toUpperCase();
  const fpsBadge = document.querySelector<HTMLElement>('#hud-fps');
  if (fpsBadge) fpsBadge.hidden = !save.options.showFps;
  const dot = document.querySelector<HTMLElement>('#hud-color-dot');
  if (dot) dot.style.background = getColor(save.colorId).css;
  const systems = document.querySelector<HTMLDivElement>('#hud-systems');
  if (systems) systems.innerHTML = systemsMarkup();
  const clock = document.querySelector<HTMLDivElement>('#day-clock');
  if (clock && mission.phase === 'playing' && !mission.tasks.length) clock.textContent = 'PLANNING';
  updateActionButtons();
}

function updateActionButtons(): void {
  const prompt = document.querySelector<HTMLSpanElement>('#interaction-prompt');
  const use = document.querySelector<HTMLButtonElement>('[data-action="use"]');
  if (!prompt || !use) return;
  const id = currentPrompt.id;
  const isSpecial = currentPrompt.kind === 'crew' || currentPrompt.kind === 'vent';
  const relevant = Boolean(id) && (currentScreen === 'training' || (isMissionActive() && (isSpecial || mission.tasks.includes(id ?? ''))));
  if (!id) {
    prompt.textContent = '';
    prompt.hidden = true;
  } else if (currentScreen === 'training') {
    prompt.textContent = `${currentPrompt.name} · ${currentPrompt.room}`;
    prompt.hidden = false;
  } else {
    prompt.textContent = relevant
      ? `${currentPrompt.name} · ${currentPrompt.room}`
      : `${currentPrompt.name} · NOT SCHEDULED TODAY`;
    prompt.hidden = false;
  }
  prompt.classList.toggle('has-task', relevant);
  use.hidden = !relevant;
}

function showToast(message: string): void {
  const target = currentScreen === 'training'
    ? document.querySelector<HTMLDivElement>('#training-toast')
    : document.querySelector<HTMLDivElement>('#toast');
  if (!target) return;
  target.textContent = message;
  target.classList.add('visible');
  window.setTimeout(() => {
    if (target.textContent === message) target.classList.remove('visible');
  }, 3400);
}

function gameMenuClose(label: string): string {
  return `<button class="game-menu-close spud-constellation-close" type="button" data-close aria-label="Close ${escapeHtml(label)}">${renderConstellationIcon('close')}<span>Close</span><kbd aria-hidden="true">Esc</kbd></button>`;
}

function showGameMenu(): () => void {
  const dialog = modalRoot.querySelector<HTMLDialogElement>('.game-menu-dialog')!;
  const close = (): void => {
    dialog.close();
    modalRoot.replaceChildren();
    resumeFromModal();
  };
  dialog.querySelector('[data-close]')?.addEventListener('click', close);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
  pauseForModal();
  dialog.showModal();
  return close;
}

function openMap(): void {
  if (currentScreen !== 'training' && currentScreen !== 'mission') return;
  const map = activeMap();
  const activeTasks = currentScreen === 'mission' ? mission.tasks : map.interactions.map(item => item.id);
  const completed = currentScreen === 'mission' ? mission.completed : training.completed;
  const scale = 680 / map.width;
  const height = Math.round(map.height * scale);
  const marker = (x: number, y: number, tone: string, label?: string): string => {
    return `<button type="button" class="spud-map-marker map-marker" data-map-walk-x="${Math.round(x)}" data-map-walk-y="${Math.round(y)}" data-map-walk-label="${escapeHtml(label ?? 'Waypoint')}" title="${escapeHtml(label ? `Walk to ${label}` : 'You')}" style="left:${(x / map.width) * 100}%;top:${(y / map.height) * 100}%;background:${tone};color:${tone};"></button>`;
  };
  modalRoot.innerHTML = `
    <dialog class="game-menu-dialog game-map-dialog" aria-labelledby="game-map-title">
      <section class="spud-copy-stack map-card">
        <header class="spud-modal-top">
          <div>
            <span class="spud-constellation-kicker" style="margin-bottom:2px;">${escapeHtml(map.subtitle)} · SELECT A ROOM TO AUTO-PILOT</span>
            <h2 id="game-map-title">${escapeHtml(map.title)}</h2>
          </div>
          ${gameMenuClose('map')}
        </header>
        <div class="spud-map-blueprint map-canvas ${map.id === 'surface' ? 'is-surface' : ''}" style="${map.id === 'surface' ? '' : `height:${height}px;`}">
          ${map.id === 'surface' ? '<img class="spud-map-art" src="/assets/maps/spudnaut-station.png" alt="" aria-hidden="true" />' : ''}
          ${map.rooms.map(room => `
            <button type="button" class="spud-map-room map-room" data-map-walk-x="${Math.round(room.x + room.w / 2)}" data-map-walk-y="${Math.round(room.y + room.h / 2)}" data-map-walk-label="${escapeHtml(room.name)}" title="Click to walk to ${escapeHtml(room.name)}" style="left:${(room.x / map.width) * 100}%;top:${(room.y / map.height) * 100}%;width:${(room.w / map.width) * 100}%;height:${(room.h / map.height) * 100}%;--room-accent:${room.accent};">
              <span>${escapeHtml(room.name.toUpperCase())}</span>
            </button>
          `).join('')}
          ${map.interactions.filter(item => activeTasks.includes(item.id)).map(item => marker(item.x, item.y, completed.includes(item.id) ? '#8fe6a8' : (item.accent ?? '#f5c451'), item.name)).join('')}
          ${marker(currentScreen === 'training' ? training.x : mission.playerX, currentScreen === 'training' ? training.y : mission.playerY, getColor(save.colorId).css, 'Current Position')}
        </div>
        <div class="spud-meta-inline">
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <span>● YOU</span>
            <span style="color:#f5c451;">● ASSIGNMENT</span>
            <span style="color:#8fe6a8;">● COMPLETE</span>
          </div>
          <span>CLICK ANY ROOM OR MARKER TO WALK THERE</span>
        </div>
      </section>
    </dialog>
  `;
  const close = showGameMenu();
  modalRoot.querySelectorAll<HTMLButtonElement>('[data-map-walk-x]').forEach(btn => {
    btn.addEventListener('click', () => {
      const x = Number(btn.dataset.mapWalkX);
      const y = Number(btn.dataset.mapWalkY);
      const label = btn.dataset.mapWalkLabel || 'Waypoint';
      sfx.click();
      close();
      walkStationTo(x, y, label);
    });
  });
}

function openTaskList(): void {
  if (currentScreen !== 'mission') {
    if (currentScreen === 'training') renderTrainingHud();
    return;
  }
  let selectedTaskId = mission.tasks[0] ?? '';

  const renderTaskInspector = (taskId: string): string => {
    const task = taskById(taskId);
    if (!task) return '<div class="spud-copy-block"><h2>NO TASK SELECTED</h2><p>Plan the shift to receive assignments.</p></div>';
    const offer = assignmentOffer(task);
    const sysName = offer.system.toUpperCase();
    const done = mission.completed.includes(task.id);
    return `
      <div class="spud-loadout-portrait">
        <div class="spud-portrait-ring"><img src="/assets/ui/icons/${offer.icon}.png" alt="" style="width:40px;height:40px;" /></div>
        <div class="spud-loadout-meta">
          <span>${escapeHtml(getRoomName(task.roomId).toUpperCase())} · ${escapeHtml(sysName)}</span>
          <h3>${escapeHtml(task.name)}</h3>
          <small>${done ? 'COMPLETED ✓' : 'PENDING MAINTENANCE'}</small>
        </div>
      </div>
      <div class="spud-copy-block">
        <h2>TELEMETRY &amp; WALK ESTIMATE</h2>
        <p>${escapeHtml(offer.blurb)}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:4px;">${assignmentPreview(task.id)}</div>
      </div>
      ${!done ? renderConstellationAction({
        icon: 'launch',
        label: `WALK TO STATION (${getRoomName(task.roomId).toUpperCase()})`,
        attrs: `data-walk-task="${task.id}"`,
        variant: 'primary',
      }) : ''}
    `;
  };

  modalRoot.innerHTML = `
    <dialog class="game-menu-dialog" aria-labelledby="game-tasks-title">
      <section class="spud-copy-stack task-list-card">
        <header class="spud-modal-top">
          <div>
            <span class="spud-constellation-kicker" style="margin-bottom:2px;">DAY ${String(missionDayNumber()).padStart(2, '0')} · ${escapeHtml(mission.eventCard?.name ?? 'ROUTINE SHIFT')}</span>
            <h2 id="game-tasks-title">TODAY'S ASSIGNMENTS</h2>
          </div>
          ${gameMenuClose('tasks')}
        </header>
        <div class="spud-split-columns">
          <div class="spud-copy-stack">
            <div class="spud-slot-list">
              ${mission.tasks.length
                ? mission.tasks.map(id => {
                  const task = taskById(id);
                  const done = mission.completed.includes(id);
                  return `
                    <button type="button" class="spud-slot-row report-task ${id === selectedTaskId ? 'selected' : ''}" data-task-slot="${id}">
                      <div>
                        <strong>${escapeHtml(task?.name ?? id)}</strong>
                        <small>${escapeHtml(getRoomName(task?.roomId ?? ''))}</small>
                      </div>
                      <span class="spud-status-tag ${done ? 'is-done' : ''}">${done ? 'DONE ✓' : 'ACTIVE'}</span>
                    </button>
                  `;
                }).join('')
                : '<div class="spud-copy-block"><p>No assignments scheduled yet.</p></div>'}
            </div>
            <div class="spud-meta-inline">
              <span>COMPLETED: ${mission.completed.length} / ${mission.tasks.length}</span>
            </div>
          </div>
          <div class="spud-vertical-rule" aria-hidden="true"></div>
          <aside class="spud-copy-stack" id="task-modal-inspector">
            ${renderTaskInspector(selectedTaskId)}
          </aside>
        </div>
      </section>
    </dialog>
  `;
  const close = showGameMenu();
  const wireWalkBtn = (): void => {
    modalRoot.querySelector<HTMLButtonElement>('[data-walk-task]')?.addEventListener('click', event => {
      const id = (event.currentTarget as HTMLButtonElement).dataset.walkTask ?? '';
      const task = taskById(id);
      if (!task) return;
      sfx.click();
      close();
      walkStationTo(task.x, task.y, task.name);
    });
  };
  wireWalkBtn();
  modalRoot.querySelectorAll<HTMLButtonElement>('[data-task-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTaskId = btn.dataset.taskSlot ?? '';
      sfx.click();
      modalRoot.querySelectorAll<HTMLButtonElement>('[data-task-slot]').forEach(el => el.classList.toggle('selected', el === btn));
      const inspector = modalRoot.querySelector<HTMLElement>('#task-modal-inspector');
      if (inspector) {
        inspector.innerHTML = renderTaskInspector(selectedTaskId);
        wireWalkBtn();
      }
    });
  });
}

function openMissionLog(): void {
  if (currentScreen !== 'mission') return;
  const reports = [...mission.reports].reverse();
  let selectedDay = reports[0]?.day ?? -1;

  const renderLogInspector = (dayNum: number): string => {
    const rep = reports.find(r => r.day === dayNum) ?? reports[0];
    if (!rep) {
      return `
        <div class="spud-copy-block">
          <h2>NO EARTH REPORTS SENT YET</h2>
          <p>Complete your first timed shift to transmit daily telemetry to Earth Command.</p>
        </div>
      `;
    }
    return `
      <div class="spud-copy-block">
        <h2>DAY ${String(rep.day).padStart(2, '0')} · ${escapeHtml(rep.event.toUpperCase())}</h2>
        <p>Assignments Completed: ${rep.completed} / ${rep.assigned}</p>
        ${rep.eventChoiceId ? `<small style="color:var(--spud-ice);">RESPONSE: ${escapeHtml(rep.eventChoiceId.toUpperCase())}</small>` : ''}
        <small>${(rep.tasks ?? []).map(id => `${rep.completedTasks?.includes(id) ? '✓' : '×'} ${escapeHtml(taskById(id)?.name ?? id)}`).join(' · ')}</small>
      </div>
      ${rep.metrics ? `
        <div class="spud-constellation-divider" aria-hidden="true"></div>
        <div class="spud-copy-block">
          <h2>RECORDED METRICS</h2>
          <div class="spud-stat-bars" style="margin-top:6px;">
            <div class="spud-stat-row"><span>POWER</span><div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.round(rep.metrics.power)}%"></div></div><b>${Math.round(rep.metrics.power)}</b></div>
            <div class="spud-stat-row"><span>OXYGEN</span><div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.round(rep.metrics.oxygen)}%"></div></div><b>${Math.round(rep.metrics.oxygen)}</b></div>
            <div class="spud-stat-row"><span>WATER</span><div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.round(rep.metrics.water)}%"></div></div><b>${Math.round(rep.metrics.water)}</b></div>
            <div class="spud-stat-row"><span>STARCH</span><div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.round(rep.metrics.starch)}%"></div></div><b>${Math.round(rep.metrics.starch)}</b></div>
            <div class="spud-stat-row"><span>HULL</span><div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.round(rep.metrics.hull)}%"></div></div><b>${Math.round(rep.metrics.hull)}</b></div>
          </div>
        </div>
      ` : ''}
    `;
  };

  modalRoot.innerHTML = `
    <dialog class="game-menu-dialog" aria-labelledby="mission-log-title">
      <section class="spud-copy-stack help-card">
        <header class="spud-modal-top">
          <div>
            <span class="spud-constellation-kicker" style="margin-bottom:2px;">${escapeHtml(destinationById(lobby.destination).name)} · DAY ${missionDayNumber()}</span>
            <h2 id="mission-log-title">MISSION LOG ARCHIVE</h2>
          </div>
          ${gameMenuClose('mission log')}
        </header>
        <div class="spud-split-columns">
          <div class="spud-copy-stack">
            <div class="spud-slot-list spud-scroll-region" style="max-height:44vh;overflow-y:auto;">
              ${reports.length ? reports.map(rep => `
                <button type="button" class="spud-slot-row ${rep.day === selectedDay ? 'selected' : ''}" data-log-day="${rep.day}">
                  <div>
                    <strong>DAY ${String(rep.day).padStart(2, '0')}</strong>
                    <small>${escapeHtml(rep.event)}</small>
                  </div>
                  <span class="spud-status-tag ${rep.completed === rep.assigned ? 'is-done' : 'is-urgent'}">${rep.completed}/${rep.assigned}</span>
                </button>
              `).join('') : '<div class="spud-copy-block"><p>No Earth reports have been sent yet.</p></div>'}
            </div>
            <div class="spud-meta-inline">
              <span>LOGGED TRANSMISSIONS: ${reports.length}</span>
              <span>ACTIVE: ${escapeHtml(mission.eventCard?.name ?? 'Routine')}</span>
            </div>
          </div>
          <div class="spud-vertical-rule" aria-hidden="true"></div>
          <aside class="spud-copy-stack" id="mission-log-inspector">
            ${renderLogInspector(selectedDay)}
          </aside>
        </div>
      </section>
    </dialog>`;
  showGameMenu();
  modalRoot.querySelectorAll<HTMLButtonElement>('[data-log-day]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDay = Number(btn.dataset.logDay);
      sfx.click();
      modalRoot.querySelectorAll<HTMLButtonElement>('[data-log-day]').forEach(el => el.classList.toggle('selected', el === btn));
      const inspector = modalRoot.querySelector<HTMLElement>('#mission-log-inspector');
      if (inspector) inspector.innerHTML = renderLogInspector(selectedDay);
    });
  });
}

function openHelp(): void {
  modalRoot.innerHTML = `
    <dialog class="game-menu-dialog game-help-dialog" aria-labelledby="game-help-title">
      <section class="spud-copy-stack help-card">
        <header class="spud-modal-top">
          <div>
            <span class="spud-constellation-kicker" style="margin-bottom:2px;">S.P.U.D.I.E. · FIELD MANUAL</span>
            <h2 id="game-help-title">CONTROLS &amp; SYSTEMS</h2>
          </div>
          ${gameMenuClose('help')}
        </header>
        <div class="spud-copy-stack">
          <div class="spud-copy-block">
            <h2>01 · MOVEMENT &amp; AUTO-PILOT</h2>
            <p>Use <b>WASD</b> or the <b>arrow keys</b> to walk. Click or tap the deck, a room in <b>Map (M)</b>, or a destination in <b>Tasks (T)</b> to auto-pilot.</p>
          </div>
          <div class="spud-constellation-divider" aria-hidden="true"></div>
          <div class="spud-copy-block">
            <h2>02 · DAILY SHIFT LOOP</h2>
            <p>Choose 3 of 5 assignments during Shift Planning, inspect projected gauge deltas, then complete each console task before the shift clock expires.</p>
          </div>
          <div class="spud-constellation-divider" aria-hidden="true"></div>
          <div class="spud-copy-block">
            <h2>03 · FOUR CORE SYSTEMS</h2>
            <p>Keep Power, Life Support, Hydroponics, and Shielding above certification targets for 30 days. Press <b>E</b> near any active station to interact.</p>
          </div>
        </div>
      </section>
    </dialog>
  `;
  showGameMenu();
}

function applyOptions(): void {
  const master = (save.options.masterVolume ?? 80) / 100;
  configureSfx({ enabled: save.options.sound && master > 0, volume: Math.round(save.options.volume * master) });
  configureMusic({ enabled: save.options.music && master > 0, volume: Math.round(save.options.musicVolume * master) });
  document.body.classList.toggle('reduce-motion', Boolean(save.options.reducedMotion));
  if (save.options.reducedMotion) {
    document.documentElement.style.setProperty('--parallax-x', '0');
    document.documentElement.style.setProperty('--parallax-y', '0');
  }
  if (game && sceneReady) void import('./game').then(({ setSceneReducedMotion }) => setSceneReducedMotion(game!, save.options.reducedMotion));
  const fpsEnabled = Boolean(save.options.showFps);
  const hudFps = document.querySelector<HTMLElement>('#hud-fps');
  if (hudFps) hudFps.hidden = !fpsEnabled;
  const trainingFps = document.querySelector<HTMLElement>('#training-fps');
  if (trainingFps) trainingFps.hidden = !fpsEnabled;
  if (currentScreen === 'mission' || currentScreen === 'training') configureScene();
}

function saveSettings(): void {
  persistSave(save);
}

function wireControls(): void {
  document.addEventListener('pointermove', event => {
    if (save.options.reducedMotion) return;
    if (currentScreen === 'training' || currentScreen === 'mission') return;
    const nx = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const ny = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    document.documentElement.style.setProperty('--parallax-x', nx.toFixed(3));
    document.documentElement.style.setProperty('--parallax-y', ny.toFixed(3));
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isMissionActive()) {
      pauseMissionForModal();
      saveTrialProgress();
    } else if (!document.hidden && currentScreen === 'mission' && mission.modalOpen && !modalRoot.childElementCount) {
      resumeMissionAfterModal();
    }
  });
  window.addEventListener('pagehide', () => {
    if (isMissionActive() && !document.hidden) saveTrialProgress();
  });
  document.addEventListener('keydown', event => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('dialog[open]')) return;
    if (event.key === 'Escape' && currentScreen === 'options') {
      (screenRoot.querySelector<HTMLButtonElement>('[data-game-return]')
        ?? screenRoot.querySelector<HTMLButtonElement>('[data-options-back]'))?.click();
      return;
    }
    if (target?.closest('input, textarea')) return;

    if (event.key === 'Enter' && (currentScreen === 'splash' || currentScreen === 'launch') && !target?.closest('button, a')) {
      const skipBtn = screenRoot.querySelector<HTMLButtonElement>('.intro-skip');
      if (skipBtn) {
        event.preventDefault();
        skipBtn.click();
        return;
      }
    }

    if (currentScreen === 'menu' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const items = Array.from(screenRoot.querySelectorAll<HTMLButtonElement>('.spud-center-nav .spud-menu-item'));
      if (items.length) {
        event.preventDefault();
        const activeIdx = items.findIndex(el => el.classList.contains('is-active'));
        const nextIdx = event.key === 'ArrowDown'
          ? (activeIdx + 1) % items.length
          : (activeIdx <= 0 ? items.length - 1 : activeIdx - 1);
        items[nextIdx]?.focus();
        sfx.click();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (modalRoot.childElementCount) {
        const close = modalRoot.querySelector<HTMLButtonElement>('[data-result-continue], [data-close]');
        if (close) close.click();
        else {
          modalRoot.replaceChildren();
          resumeFromModal();
        }
      }
      return;
    }
    if (currentScreen !== 'mission' && currentScreen !== 'training') return;
    if (currentScreen === 'mission' && !isMissionActive()) return;
    if (modalRoot.childElementCount || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'm') {
      event.preventDefault();
      openMap();
    } else if (key === 't' && currentScreen === 'mission') {
      event.preventDefault();
      openTaskList();
    } else if (key === 'o' && currentScreen === 'mission') {
      event.preventDefault();
      showOptions();
    } else if (key === '?' || key === 'h') {
      event.preventDefault();
      openHelp();
    }
  });

  document.querySelector('[data-action="map"]')?.addEventListener('click', () => {
    sfx.click();
    openMap();
  });
  document.querySelector('[data-action="options"]')?.addEventListener('click', () => {
    if (!isMissionActive()) return;
    sfx.click();
    showOptions();
  });
  document.querySelector('[data-action="tasks"]')?.addEventListener('click', () => {
    sfx.click();
    openTaskList();
  });
  document.querySelector('[data-action="log"]')?.addEventListener('click', () => {
    sfx.click();
    openMissionLog();
  });
  document.querySelector('[data-action="help"]')?.addEventListener('click', () => {
    sfx.click();
    openHelp();
  });
  document.querySelector('[data-action="use"]')?.addEventListener('click', () => {
    if (!currentPrompt.id) return;
    sfx.click();
    if (currentScreen === 'training') handleTrainingInteract(currentPrompt.id);
    else if (game) void import('./game').then(({ interactStation }) => interactStation(game!));
  });

  const unlockAudio = (): void => {
    if (save.options.music) startMusic();
    document.removeEventListener('pointerdown', unlockAudio);
  };
  document.addEventListener('pointerdown', unlockAudio);
}

function init(): void {
  applyOptions();
  wireControls();
  showSplash();
}

init();
