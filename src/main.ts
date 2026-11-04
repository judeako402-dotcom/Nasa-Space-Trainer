import {
  DEFAULT_LOBBY, DESTINATIONS, DIFFICULTY_INFO, EXAM_PASS_RATIO, EXAM_QUESTION_COUNT,
  EXAM_QUESTIONS, PLAYER_COLORS, PENALTY_MAX_DAY, SPECIALISTS, TASKS,
  TRIAL_MAX_DAY, SAVE_BACKUP_KEY, SAVE_KEY, defaultSave, destinationById, getColor, getRoomName, loadSave, persistSave, shuffle,
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
  applyDailyOperations, applyEvent, applyMissedDay, applyTaskCompletion, evaluateMission,
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
  createInitialExam, createMissionState, createTrainingState,
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

app.innerHTML = `
  <div class="game-frame">
    <main class="screen-root" id="screen-root"></main>
    <div class="scene-shell" id="scene-shell" hidden>
      <div id="game-canvas" class="game-canvas"></div>
      <div class="scene-vignette" aria-hidden="true"></div>
      <div class="hud" id="hud" hidden>
        <div class="hud-top-left">
          <button class="hud-square" data-action="options" title="Options (O)">OPTIONS</button>
          <div class="trial-day-pill" id="trial-day">DAY 01 / 30</div>
          <div class="task-meter" aria-live="polite">
            <span class="task-meter-label" id="task-label">TODAY 0 / 3</span>
            <span class="task-meter-track"><span id="task-fill"></span></span>
          </div>
          <span class="alive-pill" id="crew-progress">COOPERATIVE TRIAL</span>
        </div>
        <div class="hud-top-right">
          <button class="hud-square" data-action="map" title="Map (M)">MAP</button>
          <button class="hud-square" data-action="tasks" title="Today's assignments (Tab)">TASKS</button>
          <button class="hud-square" data-action="log" title="Mission log">LOG</button>
          <button class="hud-square" data-action="help" title="Controls">?</button>
        </div>
        <div class="hud-systems" id="hud-systems"></div>
        <div class="hud-bottom-left">
          <span class="id-swatch" id="hud-color-dot"></span>
          <div class="id-copy">
            <strong id="hud-player-name">SPUDNAUT</strong>
            <small id="hud-player-meta">SPECIALIST · DESTINATION</small>
            <span id="hud-room">CAFETERIA</span>
          </div>
        </div>
        <div class="action-cluster">
          <span class="interaction-prompt" id="interaction-prompt" aria-live="polite"></span>
          <button class="action-button use" data-action="use" hidden>USE <small>E</small></button>
        </div>
        <div class="day-clock" id="day-clock"></div>
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
  shield: [
    { label: 'REPAIR', value: 84 },
    { label: 'BOTANY', value: 62 },
    { label: 'EVA SPEED', value: 72 },
    { label: 'SCIENCE', value: 70 },
    { label: 'SHIELDING', value: 97 },
  ],
};

function renderVistaFxLayer(): string {
  return `
    <div class="vista-fx-layer" aria-hidden="true">
      <div class="vista-rocket-glow"></div>
      <div class="vista-dome-pulse"></div>
      <div class="vista-beacon-dot"></div>
      <div class="vista-star-motes"></div>
    </div>
  `;
}

function renderUniversalBackdrop(): string {
  return `
    <div class="menu-backdrop" aria-hidden="true">
      <img class="menu-bg" src="/assets/menu-bg.jpg" alt="" />
      <div class="menu-veil"></div>
      ${renderVistaFxLayer()}
      <div class="menu-grain"></div>
      <div class="menu-zoom-flash"></div>
    </div>
  `;
}

function renderPotatoOverride(showSuitBadge = false): string {
  const color = getColor(lobby.colorId || save.colorId);
  const spec = specialistById(lobby.specialist || save.specialist);
  const callsign = (lobby.playerName || save.name || 'Spudnaut').trim() || 'Spudnaut';
  return `
    <div class="menu-potato-override" aria-hidden="true">
      <img class="menu-potato-fg" src="/assets/menu-potato-fg.png" alt="" />
      ${showSuitBadge ? `
        <div class="potato-suit-badge" id="potato-suit-badge">
          <span class="potato-suit-dot" id="potato-suit-dot" style="background:${color.css};color:${color.css}"></span>
          <span id="potato-suit-label">${escapeHtml(callsign)} · ${escapeHtml(spec.shortName)}</span>
        </div>
      ` : ''}
    </div>
  `;
}

function renderUniversalTopBar(activeNav: 'play' | 'training' | 'options' | 'credits' | '' = ''): string {
  const certLabel = save.certified
    ? 'CERTIFIED'
    : save.trainingComplete ? `RANK ${save.trainingRank ?? 'B'}` : 'CADET';
  return `
    <header class="universal-top-bar" aria-label="Universal navigation">
      <button class="universal-brand-mini" type="button" data-universal-home title="Return to Main Menu">
        <span>◁ SPUDNAUT · MENU</span>
      </button>
      <nav class="duelyst-hex-bar" aria-label="Quick navigation">
        <button class="duelyst-hex-btn ${activeNav === 'play' ? 'is-certified' : ''}" type="button" data-universal-nav="play" title="Mission Loadout">
          <span class="hex-shape">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <polygon class="hex-outer" points="32,3 58,18 58,46 32,61 6,46 6,18" />
              <polygon class="hex-inner" points="32,8 53,20.5 53,43.5 32,56 11,43.5 11,20.5" />
              <path class="hex-glyph" d="M32 18L36 27L46 28L38.5 35L40.5 45L32 40L23.5 45L25.5 35L18 28L28 27Z" />
            </svg>
          </span>
          <span class="hex-label">TRIALS (${save.games})</span>
        </button>
        <button class="duelyst-hex-btn ${activeNav === 'training' || save.certified ? 'is-certified' : ''}" type="button" data-universal-nav="training" title="Training Deck">
          <span class="hex-shape">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <polygon class="hex-outer" points="32,3 58,18 58,46 32,61 6,46 6,18" />
              <polygon class="hex-inner" points="32,8 53,20.5 53,43.5 32,56 11,43.5 11,20.5" />
              <circle class="hex-glyph" cx="32" cy="26" r="7" />
              <path class="hex-glyph" d="M20 44C20 37.5 25.4 34 32 34C38.6 34 44 37.5 44 44" />
            </svg>
          </span>
          <span class="hex-label">${certLabel}</span>
        </button>
        <button class="duelyst-hex-btn ${activeNav === 'options' ? 'is-certified' : ''}" type="button" data-universal-nav="options" title="Options">
          <span class="hex-shape">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <polygon class="hex-outer" points="32,3 58,18 58,46 32,61 6,46 6,18" />
              <polygon class="hex-inner" points="32,8 53,20.5 53,43.5 32,56 11,43.5 11,20.5" />
              <circle class="hex-glyph-stroke" cx="32" cy="32" r="6" />
              <path class="hex-glyph-stroke" d="M32 17V22M32 42V47M17 32H22M42 32H47M21.4 21.4L25 25M39 39L42.6 42.6M42.6 21.4L39 25M25 39L21.4 42.6" />
            </svg>
          </span>
          <span class="hex-label">SETTINGS</span>
        </button>
        <button class="duelyst-hex-btn ${activeNav === 'credits' ? 'is-certified' : ''}" type="button" data-universal-nav="credits" title="Mission Brief & Science">
          <span class="hex-shape">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <polygon class="hex-outer" points="32,3 58,18 58,46 32,61 6,46 6,18" />
              <polygon class="hex-inner" points="32,8 53,20.5 53,43.5 32,56 11,43.5 11,20.5" />
              <circle class="hex-glyph" cx="32" cy="23" r="4" />
              <circle class="hex-glyph" cx="23" cy="38" r="4" />
              <circle class="hex-glyph" cx="41" cy="38" r="4" />
              <path class="hex-glyph-stroke" d="M32 27L25 35M32 27L39 35M27 38H37" />
            </svg>
          </span>
          <span class="hex-label">RETURNS (${save.wins})</span>
        </button>
      </nav>
    </header>
  `;
}

function wireUniversalTopBar(root: ParentNode = screenRoot): void {
  root.querySelector<HTMLButtonElement>('[data-universal-home]')?.addEventListener('click', () => {
    sfx.click();
    showMenu();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-universal-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      const target = btn.dataset.universalNav;
      if (target === 'play') {
        if (save.activeTrial) resumeTrial();
        else showLobby();
      } else if (target === 'training') {
        if (!save.trainingComplete) showStory(0);
        else showTraining();
      } else if (target === 'options') {
        showOptions();
      } else if (target === 'credits') {
        showCredits();
      }
    });
  });
}

function walkStationTo(x: number, y: number, label?: string): void {
  if (!game) return;
  const activeGame = game;
  void import('./game').then(({ navigateStationTo }) => {
    if (activeGame === game) {
      navigateStationTo(activeGame, x, y);
      if (label) showToast(`Auto-piloting to ${label}...`);
    }
  });
}

function setScreen(screen: ScreenId, markup: string): void {
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
        <button class="intro-skip" type="button">SKIP INTRO <kbd>ENTER</kbd></button>
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

function showMenu(): void {
  startMusic();
  const startCopy = save.activeTrial
    ? 'RESUME'
    : 'PLAY';
  const badgeMain = save.activeTrial
    ? `DAY ${String(save.activeTrial.penaltyDay ? TRIAL_MAX_DAY + save.activeTrial.penaltyDay : save.activeTrial.day).padStart(2, '0')} / ${TRIAL_MAX_DAY}`
    : '30 DAYS';
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
            <span class="spud-menu-light" aria-hidden="true"></span>
            <button class="spud-menu-item" type="button" data-menu="play" aria-label="${startCopy} Mission">
              <svg class="spud-menu-icon" viewBox="0 0 36 36" aria-hidden="true"><line x1="8" y1="10" x2="26" y2="16" /><line x1="26" y1="16" x2="14" y2="27" /><line x1="14" y1="27" x2="8" y2="10" /><circle cx="8" cy="10" r="2.5" /><circle cx="26" cy="16" r="3" /><circle cx="14" cy="27" r="2.2" /></svg>
              <span class="spud-menu-label">${startCopy}</span>${save.activeTrial ? `<small class="spud-menu-tag">${badgeMain}</small>` : ''}
            </button>
            <button class="spud-menu-item" type="button" data-menu="training" aria-label="Cadet Training">
              <svg class="spud-menu-icon" viewBox="0 0 36 36" aria-hidden="true"><line x1="9" y1="9" x2="27" y2="27" /><line x1="27" y1="9" x2="9" y2="27" /><circle cx="9" cy="9" r="2.2" /><circle cx="27" cy="27" r="2.2" /><circle cx="27" cy="9" r="2.2" /><circle cx="9" cy="27" r="2.2" /><circle cx="18" cy="18" r="2.6" /></svg>
              <span class="spud-menu-label">TRAINING</span>
            </button>
            <button class="spud-menu-item" type="button" data-menu="credits" aria-label="Mission Brief">
              <svg class="spud-menu-icon" viewBox="0 0 36 36" aria-hidden="true"><polygon points="18,6 30,18 18,30 6,18" fill="none" /><circle cx="18" cy="6" r="2.2" /><circle cx="30" cy="18" r="2.2" /><circle cx="18" cy="30" r="2.2" /><circle cx="6" cy="18" r="2.2" /></svg>
              <span class="spud-menu-label">MISSION BRIEF</span>
            </button>
            <button class="spud-menu-item" type="button" data-menu="options" aria-label="Game Settings">
              <svg class="spud-menu-icon" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="5" fill="none" /><line x1="18" y1="5" x2="18" y2="10" /><line x1="18" y1="26" x2="18" y2="31" /><line x1="5" y1="18" x2="10" y2="18" /><line x1="26" y1="18" x2="31" y2="18" /></svg>
              <span class="spud-menu-label">OPTIONS</span>
            </button>
          </nav>
        </div>
      </div>
    </section>
  `);

  // Moving blue selection light: follows hover, focus, and arrow-key navigation
  const menuNav = screenRoot.querySelector<HTMLElement>('.spud-center-nav');
  const menuLight = screenRoot.querySelector<HTMLElement>('.spud-menu-light');
  const menuItems = Array.from(screenRoot.querySelectorAll<HTMLButtonElement>('.spud-menu-item'));
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

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach(button => button.addEventListener('click', () => {
    switch (button.dataset.menu) {
      case 'play':
      case 'start': {
        const menuEl = screenRoot.querySelector<HTMLElement>('.screen-menu');
        const proceed = (): void => {
          if (save.activeTrial) resumeTrial();
          else showLobby();
        };

        if (menuEl && !menuEl.classList.contains('is-zooming')) {
          menuEl.classList.add('is-zooming');
          
          sfx.launch();
          const delay = save.options.reducedMotion ? 180 : 1050;
          window.setTimeout(proceed, delay);
        } else {
          proceed();
        }
        break;
      }
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
  setScreen('story', `
    <section class="universal-duelyst-screen story-screen" data-cutscene="${escapeHtml(panel.cutscene)}">
      ${renderUniversalBackdrop()}
      ${renderUniversalTopBar('training')}
      <article class="svg-inventory-window">
        <header class="svg-inventory-topbar">
          <div class="svg-inventory-title">
            <span>${escapeHtml(panel.kicker)}</span>
            <h1>${escapeHtml(panel.title)}</h1>
          </div>
          <div class="svg-tab-strip">
            ${STORY_BEATS.map((beat, idx) => `
              <button type="button" class="svg-tab-pill ${idx === index ? 'active' : ''}" data-story-jump="${idx}">
                0${idx + 1} · ${escapeHtml(beat.cutscene.toUpperCase())}
              </button>
            `).join('')}
          </div>
        </header>
        <div class="svg-master-detail-body">
          <div class="svg-slot-well" style="justify-content:center;align-items:center;">
            <img src="${escapeHtml(panel.art)}" alt="" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px;border:2px solid #566080;" />
            <div class="svg-slot-footer-bar" style="width:100%;">
              <span>TRANSMISSION LOG ${String(index + 1).padStart(2, '0')} / ${String(STORY_BEATS.length).padStart(2, '0')}</span>
              <span>HEXABYTE ARCHIVE · 3042</span>
            </div>
          </div>
          <aside class="svg-inspector-card">
            <div class="svg-inspector-box" style="font-size:14px;line-height:1.65;">
              <strong>MISSION BRIEFING</strong>
              <p style="margin:6px 0 0;">${escapeHtml(panel.body)}</p>
            </div>
            <div class="svg-inspector-box">
              <strong>OPERATIONAL NOTE</strong>
              <p style="margin:4px 0 0;">${escapeHtml(panel.note)}</p>
            </div>
            <button class="svg-tab-pill" type="button" data-story-skip style="justify-content:center;width:100%;">
              SKIP BRIEFING → BOARD TRAINING DECK
            </button>
          </aside>
        </div>
        <footer class="svg-window-footer">
          <button class="svg-back-pill-btn" type="button" data-story-back>← MENU</button>
          <button class="svg-back-pill-btn is-cyan" type="button" data-story-next>${index === STORY_BEATS.length - 1 ? 'BOARD TRAINING DECK →' : 'CONTINUE →'}</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
    </section>
  `);
  wireUniversalTopBar();
  screenRoot.querySelector('[data-story-back]')?.addEventListener('click', showMenu);
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
      <header class="training-head"><div><span class="training-kicker">EARTH SIMULATOR</span><strong>TRAINING DECK</strong></div><div class="training-head-actions"><button class="training-map" data-training-map>MAP</button><button class="training-exit" data-training-exit>EXIT</button></div></header>
      <div class="training-controls">Move <kbd>WASD</kbd> / <kbd>ARROWS</kbd> <span aria-hidden="true">·</span> Click to walk <span aria-hidden="true">·</span> <kbd>E</kbd> interact</div>
      <button class="training-toggle" data-training-toggle aria-expanded="${trainingHudExpanded}"><span>OBJECTIVES · ${inspected} / ${systems.length}</span><span>${trainingHudExpanded ? 'HIDE ▲' : 'SHOW ▼'}</span></button>
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
    pendingScene = { state, respawn: options.respawn === true };
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
  if (event.type === 'move') {
    if (currentScreen === 'training') {
      training.x = event.x;
      training.y = event.y;
      training.room = event.room;
    } else {
      mission.playerX = event.x;
      mission.playerY = event.y;
      mission.room = event.room;
      updateHUD();
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
    if (currentScreen === 'training') training.room = event.room;
    else {
      mission.room = event.room;
      updateHUD();
    }
    updateActionButtons();
    return;
  }
  if (event.type === 'interact') {
    if (currentScreen === 'training') handleTrainingInteract(event.interactionId);
    else openMissionTask(event.interactionId);
    return;
  }
  if (event.type === 'crew') {
    talkToCrew(event.crewId);
  }
}

function talkToCrew(crewId: string): void {
  const crew = activeMap().crew.find(item => item.id === crewId);
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
    <section class="training-report-screen">
      <div class="report-stars" aria-hidden="true"></div>
      <article class="training-report-card holo-panel">
        <span class="holo-kicker">S.P.U.D.I.E. · TRAINING EVALUATION</span>
        <h1>TRAINING COMPLETE</h1>
        <div class="training-rank-seal">${rank}<small>RANK</small></div>
        <p>Four survival systems inspected. ${training.crew.length} crew conversation${training.crew.length === 1 ? '' : 's'} logged. ${
          systemsDone ? 'Commander Russet has cleared you for the certification exam.' : 'Some checkpoints remain, but the exam console is unlocked for review.'
        }</p>
        <div class="training-report-grid">
          <span><b>${TRAINING_SYSTEM_IDS.filter(id => training.completed.includes(id)).length} / 4</b><small>SYSTEMS</small></span>
          <span><b>${Math.min(2, training.crew.length)} / 2</b><small>CREW TALKS</small></span>
          <span><b>${training.completed.includes('sample') ? 'YES' : 'NO'}</b><small>SAMPLE</small></span>
        </div>
        <p class="story-note">Rank S requires all four systems and two crew conversations. Your rank is recorded on the final certificate.</p>
        <button class="primary-button" data-training-report-next>TAKE THE SPUD EXAM →</button>
      </article>
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
        <section class="modal-card dialogue-card kenney-panel" style="--accent:${options.accent}">
          <div class="dialogue-head">
            <img src="${options.art}" alt="" />
            <div><span class="eyebrow">${escapeHtml(options.role)}</span><h2>${escapeHtml(options.speaker)}</h2></div>
            <button class="modal-close" data-close aria-label="Close dialogue">×</button>
          </div>
          <p class="dialogue-line">${escapeHtml(line)}</p>
          <footer class="dialogue-footer"><span>${index + 1} / ${options.lines.length}</span><button class="primary-button" data-dialogue-next>${index >= options.lines.length - 1 ? 'CLOSE' : 'NEXT →'}</button></footer>
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
  box.className = 'modal-card task-card kenney-panel';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', options.title);
  box.innerHTML = `
    <div class="modal-head"><div><span class="eyebrow">${escapeHtml(options.eyebrow)}</span><h2>${escapeHtml(options.title)}</h2></div><button class="modal-close" data-close aria-label="Close task">×</button></div>
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
}

function openMissionTask(taskId: string): void {
  const task = taskById(taskId);
  if (!task || !mission.tasks.includes(task.id) || mission.completed.includes(task.id)) return;
  if (!isMissionActive() || mission.modalOpen) return;
  if (Math.hypot(mission.playerX - task.x, mission.playerY - task.y) > 160) return;
  pauseMissionForModal();
  openMinigameModal({
    eyebrow: `DAY ${missionDayNumber()} · ${getRoomName(task.roomId).toUpperCase()}`,
    title: task.name,
    kind: task.kind,
    onClose: resumeMissionAfterModal,
    onComplete: () => {
      const beforeTask = { ...mission.metrics };
      mission.completed.push(task.id);
      mission.totalCompleted += 1;
      mission.metrics = applyTaskCompletion(mission.metrics, task, lobby.specialist);
      sfx.complete();
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
      <section class="modal-card task-result-card kenney-panel" role="dialog" aria-modal="true" aria-labelledby="task-result-title">
        <span class="eyebrow">SYSTEMS REPORT · ${escapeHtml(getRoomName(mission.room))}</span>
        <h2 id="task-result-title">${escapeHtml(taskName)} COMPLETE</h2>
        <p class="story-note">The crew logged the maintenance result. Habitat gauge changes are simplified game units.</p>
        <div class="event-deltas">${metricChips(changes)}</div>
        <footer class="modal-actions"><button class="primary-button" data-result-continue>${lastTask ? 'SEND EARTH REPORT' : 'CONTINUE SHIFT'}</button></footer>
      </section>
    </div>`;
  modalRoot.querySelector('[data-result-continue]')?.addEventListener('click', () => {
    modalRoot.replaceChildren();
    resumeMissionAfterModal();
    updateHUD();
    if (lastTask) finishDay('All daily assignments completed. Crew systems stable.');
    else {
      saveTrialProgress();
      showToast(`${mission.tasks.length - mission.completed.length} assignment${mission.tasks.length - mission.completed.length === 1 ? '' : 's'} remain today.`);
    }
  });
  modalRoot.querySelector<HTMLButtonElement>('[data-result-continue]')?.focus();
}

function showExamIntro(): void {
  setScreen('exam', `
    <section class="universal-duelyst-screen exam-screen">
      ${renderUniversalBackdrop()}
      ${renderUniversalTopBar('training')}
      <article class="svg-options-window">
        <header class="svg-window-header">
          <span class="svg-kicker">EARTH TRAINING FACILITY · CERTIFICATION</span>
          <h1>THE SPUD EXAM</h1>
        </header>
        <div class="svg-options-body">
          <div class="svg-section-block">
            <span class="svg-section-pill">FLIGHT QUALIFICATION</span>
            <div class="svg-subcard" style="padding:18px 22px;display:grid;gap:12px;">
              <p style="margin:0;color:#fff3d8;line-height:1.6;">
                Eight questions on pressure, life support, tools, farming, and crew safety. Score at least ${Math.round(EXAM_PASS_RATIO * 100)}% to earn your flight certification.
              </p>
              <div class="svg-slot-footer-bar">
                <span>TRAINING RANK: ${save.trainingRank ?? 'B'}</span>
                <span>EXAM BEST: ${save.examBest}%</span>
              </div>
            </div>
          </div>
        </div>
        <footer class="svg-window-footer">
          <button class="svg-back-pill-btn" type="button" data-exam-back-menu>← MENU</button>
          <button class="svg-back-pill-btn is-cyan" type="button" data-exam-start>TAKE THE EXAM →</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
    </section>
  `);
  wireUniversalTopBar();
  screenRoot.querySelector('[data-exam-back-menu]')?.addEventListener('click', showMenu);
  screenRoot.querySelector('[data-exam-start]')?.addEventListener('click', startExam);
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
  setScreen('exam', `
    <section class="universal-duelyst-screen exam-screen">
      ${renderUniversalBackdrop()}
      ${renderUniversalTopBar('training')}
      <article class="svg-inventory-window">
        <header class="svg-inventory-topbar">
          <div class="svg-inventory-title">
            <span>${escapeHtml(question.topic)} · QUESTION ${exam.index + 1} OF ${exam.questions.length}</span>
            <h1>${escapeHtml(question.prompt)}</h1>
          </div>
          <span class="svg-section-pill is-blue">SCORE ${exam.score} / ${exam.questions.length}</span>
        </header>
        <div class="svg-master-detail-body">
          <div class="svg-slot-well">
            <div style="display:grid;gap:10px;">
              ${question.options.map((option, index) => `
                <button class="svg-slot-card exam-option ${exam.selected.includes(index) ? 'selected' : ''}"
                  style="min-height:64px;flex-direction:row;justify-content:flex-start;padding:14px 16px;text-align:left;gap:14px;"
                  data-exam-option="${index}" ${exam.submitted ? 'disabled' : ''}>
                  <span class="svg-pct-pill" style="min-width:36px;">${String.fromCharCode(65 + index)}</span>
                  <strong style="font-size:13px;line-height:1.4;">${escapeHtml(option)}</strong>
                </button>
              `).join('')}
            </div>
            <div class="svg-slot-footer-bar">
              <span>${question.correct.length > 1 ? 'MULTI-SELECT: CHOOSE ALL CORRECT ANSWERS' : 'SINGLE-SELECT: CHOOSE ONE ANSWER'}</span>
              <span>PROGRESS ${pct}%</span>
            </div>
          </div>
          <aside class="svg-inspector-card">
            <div class="svg-inspector-preview">
              <img src="/assets/potato-researcher.png" alt="" />
              <div class="svg-inspector-title">
                <span>S.P.U.D.I.E. PROCTOR</span>
                <h3>${escapeHtml(question.topic.toUpperCase())}</h3>
                <small>Question ${exam.index + 1} of ${exam.questions.length}</small>
              </div>
            </div>
            <div class="svg-inspector-box" ${exam.submitted ? '' : 'hidden'}>
              <strong>${exam.missed.includes(question) ? 'REVIEW REQUIRED' : 'VERIFIED CORRECT'}</strong>
              <p style="margin:6px 0 0;">${escapeHtml(question.explanation)}</p>
            </div>
            <div class="svg-inspector-box" ${exam.submitted ? 'hidden' : ''}>
              <strong>CADET GUIDANCE</strong>
              <p style="margin:6px 0 0;">Select your response on the left panel, then lock in your answer to receive immediate telemetry verification.</p>
            </div>
          </aside>
        </div>
        <footer class="svg-window-footer">
          <button class="svg-back-pill-btn" type="button" data-exam-exit>EXIT EXAM</button>
          <button class="svg-back-pill-btn is-cyan" type="button" data-exam-submit>${exam.submitted ? (exam.index + 1 === exam.questions.length ? 'SEE RESULT →' : 'NEXT QUESTION →') : 'SUBMIT ANSWER'}</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
    </section>
  `);
  wireUniversalTopBar();
  screenRoot.querySelector('[data-exam-exit]')?.addEventListener('click', showMenu);
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-exam-option]').forEach(button => button.addEventListener('click', () => {
    if (exam.submitted) return;
    const option = Number(button.dataset.examOption);
    if (!Number.isInteger(option)) return;
    if (question.correct.length === 1) exam.selected = [option];
    else exam.selected = exam.selected.includes(option) ? exam.selected.filter(item => item !== option) : [...exam.selected, option];
    renderExamQuestion();
  }));
  screenRoot.querySelector('[data-exam-submit]')?.addEventListener('click', () => {
    if (exam.submitted) {
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
    setScreen('graduation', `
      <section class="universal-duelyst-screen graduation-screen">
        ${renderUniversalBackdrop()}
        ${renderUniversalTopBar('training')}
        <article class="svg-options-window">
          <header class="svg-window-header">
            <span class="svg-kicker">CERTIFICATION RESULT · ${percentage}%</span>
            <h1>FLIGHT APPROVED</h1>
          </header>
          <div class="svg-options-body" style="text-align:center;">
            <div class="svg-subcard" style="padding:24px;display:grid;gap:14px;justify-items:center;">
              <div class="diploma-seal" style="margin:0 auto;">✦<small>SPUDNAUT</small></div>
              <p style="margin:0;color:#fff3d8;">S.P.U.D.I.E. has certified you for the 30-day cooperative habitat trial.</p>
              <div class="svg-slot-footer-bar" style="width:100%;">
                <span>TRAINING RANK: ${save.trainingRank ?? 'B'}</span>
                <span>EXAM BEST: ${save.examBest}%</span>
              </div>
            </div>
          </div>
          <footer class="svg-window-footer" style="justify-content:center;">
            <button class="svg-back-pill-btn is-cyan" type="button" data-graduate>CHOOSE YOUR MISSION →</button>
          </footer>
        </article>
        ${renderPotatoOverride(true)}
      </section>
    `);
    wireUniversalTopBar();
    screenRoot.querySelector('[data-graduate]')?.addEventListener('click', showLobby);
  } else {
    remediationIndex = 0;
    showRemedial();
  }
}

function showRemedial(): void {
  const lessons = exam.missed.length ? exam.missed : exam.questions;
  const question = lessons[remediationIndex % lessons.length];
  if (!question) return showExamIntro();
  setScreen('remedial', `
    <section class="universal-duelyst-screen remedial-screen">
      ${renderUniversalBackdrop()}
      ${renderUniversalTopBar('training')}
      <article class="svg-options-window">
        <header class="svg-window-header">
          <span class="svg-kicker">REMEDIAL SPUD ACADEMY · ${remediationIndex + 1} / ${lessons.length}</span>
          <h1>REVIEW: ${escapeHtml(question.topic.toUpperCase())}</h1>
        </header>
        <div class="svg-options-body">
          <div class="svg-subcard" style="padding:20px;display:grid;gap:14px;">
            <p style="margin:0;color:#fff3d8;line-height:1.6;">${escapeHtml(question.lesson)}</p>
            <div class="svg-inspector-box">
              <strong>THE QUESTION</strong>
              <p style="margin:4px 0 8px;">${escapeHtml(question.prompt)}</p>
              <span style="color:#9beeff;font-size:11px;">Correct answer${question.correct.length > 1 ? 's' : ''}: ${question.correct.map(index => question.options[index]).map(escapeHtml).join(' · ')}</span>
            </div>
          </div>
        </div>
        <footer class="svg-window-footer">
          <button class="svg-back-pill-btn" type="button" data-remedial-next>NEXT LESSON</button>
          <button class="svg-back-pill-btn is-cyan" type="button" data-retake>RETAKE EXAM →</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
    </section>
  `);
  wireUniversalTopBar();
  screenRoot.querySelector('[data-remedial-next]')?.addEventListener('click', () => {
    remediationIndex = (remediationIndex + 1) % lessons.length;
    showRemedial();
  });
  screenRoot.querySelector('[data-retake]')?.addEventListener('click', startExam);
}

let preMuteMaster = 80;
let preMuteMusic = 70;
let preMuteSfx = 80;
let lastPreviewTick = 0;

function showOptions(): void {
  const options = save.options;
  if (typeof options.masterVolume !== 'number') options.masterVolume = 80;
  const returnScreen = currentScreen === 'training' || currentScreen === 'mission' ? currentScreen : 'menu';
  if (returnScreen === 'training') pauseTrainingForModal();
  if (returnScreen === 'mission') pauseMissionForModal();
  const difficulties: DifficultyId[] = ['cadet', 'crew', 'veteran'];

  setScreen('options', `
    <section class="universal-duelyst-screen screen-options">
      ${renderUniversalBackdrop()}
      ${renderUniversalTopBar('options')}
      <article class="svg-options-window" aria-labelledby="options-window-title">
        <header class="svg-window-header">
          <span class="svg-kicker">S.P.U.D.I.E. · CREW CONFIGURATION</span>
          <h1 id="options-window-title">OPTIONS</h1>
        </header>

        <div class="svg-options-body">
          <!-- VOLUME SECTION (Options panel.svg Archetype B) -->
          <section class="svg-section-block" aria-label="Volume Settings">
            <span class="svg-section-pill">VOLUME</span>
            <div class="svg-subcard">
              <div class="svg-slider-row">
                <div class="svg-slider-top">
                  <div>
                    <label class="svg-row-label" for="opt-master-volume">Master Volume</label>
                    <small class="svg-row-sub">Scales all station &amp; soundtrack audio</small>
                  </div>
                  <button type="button" class="svg-pct-pill ${options.masterVolume === 0 ? 'is-muted' : ''}" id="opt-master-volume-pill" data-mute-pill="master" title="Click to mute/unmute Master">
                    <output id="opt-master-volume-value">${options.masterVolume}%</output>
                  </button>
                </div>
                <input class="svg-range" id="opt-master-volume" data-slider="masterVolume" type="range" min="0" max="100" value="${options.masterVolume}" style="--fill:${options.masterVolume}%" />
              </div>

              <div class="svg-slider-row">
                <div class="svg-slider-top">
                  <div>
                    <label class="svg-row-label" for="opt-music-volume">Music Volume</label>
                    <small class="svg-row-sub">Orbital synth &amp; menu theme</small>
                  </div>
                  <button type="button" class="svg-pct-pill ${!options.music || options.musicVolume === 0 ? 'is-muted' : ''}" id="opt-music-volume-pill" data-mute-pill="music" title="Click to mute/unmute Music">
                    <output id="opt-music-volume-value">${options.music ? options.musicVolume : 0}%</output>
                  </button>
                </div>
                <input class="svg-range" id="opt-music-volume" data-slider="musicVolume" type="range" min="0" max="100" value="${options.musicVolume}" style="--fill:${options.musicVolume}%" />
              </div>

              <div class="svg-slider-row">
                <div class="svg-slider-top">
                  <div>
                    <label class="svg-row-label" for="opt-volume">Sound / SFX Volume</label>
                    <small class="svg-row-sub">Interface chimes, airlocks &amp; alerts</small>
                  </div>
                  <button type="button" class="svg-pct-pill ${!options.sound || options.volume === 0 ? 'is-muted' : ''}" id="opt-volume-pill" data-mute-pill="sound" title="Click to mute/unmute SFX">
                    <output id="opt-volume-value">${options.sound ? options.volume : 0}%</output>
                  </button>
                </div>
                <input class="svg-range" id="opt-volume" data-slider="volume" type="range" min="0" max="100" value="${options.volume}" style="--fill:${options.volume}%" />
              </div>
            </div>
          </section>

          <!-- OTHER / SIMULATION SECTION (Options panel.svg Archetype B) -->
          <section class="svg-section-block" aria-label="Other and Simulation Settings">
            <span class="svg-section-pill is-blue">OTHER &amp; SIMULATION</span>
            <div class="svg-subcard">
              <div class="svg-toggle-row">
                <div>
                  <label class="svg-row-label" for="opt-sound">Interface Sound</label>
                  <small class="svg-row-sub">Enable button &amp; console audio cues</small>
                </div>
                <div class="svg-toggle-control">
                  <span class="svg-toggle-state ${options.sound ? 'is-on' : ''}" data-state-for="sound">${options.sound ? 'ON' : 'OFF'}</span>
                  <button class="svg-pill-switch toggle ${options.sound ? 'on' : ''}" id="opt-sound" data-toggle="sound" aria-label="Interface sound" aria-pressed="${options.sound}"></button>
                </div>
              </div>

              <div class="svg-toggle-row">
                <div>
                  <label class="svg-row-label" for="opt-music">Intro &amp; Menu Music</label>
                  <small class="svg-row-sub">Ambient orbital background score</small>
                </div>
                <div class="svg-toggle-control">
                  <span class="svg-toggle-state ${options.music ? 'is-on' : ''}" data-state-for="music">${options.music ? 'ON' : 'OFF'}</span>
                  <button class="svg-pill-switch toggle ${options.music ? 'on' : ''}" id="opt-music" data-toggle="music" aria-label="Intro music" aria-pressed="${options.music}"></button>
                </div>
              </div>

              <div class="svg-toggle-row">
                <div>
                  <label class="svg-row-label" for="opt-vision">Line-of-Sight Vision</label>
                  <small class="svg-row-sub">Dynamic bulkhead shadow casting</small>
                </div>
                <div class="svg-toggle-control">
                  <span class="svg-toggle-state ${options.lineOfSight ? 'is-on' : ''}" data-state-for="lineOfSight">${options.lineOfSight ? 'ON' : 'OFF'}</span>
                  <button class="svg-pill-switch toggle ${options.lineOfSight ? 'on' : ''}" id="opt-vision" data-toggle="lineOfSight" aria-label="Line-of-sight vision" aria-pressed="${options.lineOfSight}"></button>
                </div>
              </div>

              <div class="svg-toggle-row">
                <div>
                  <label class="svg-row-label" for="opt-motion">Reduced Motion</label>
                  <small class="svg-row-sub">Disable camera zoom, parallax &amp; pulses</small>
                </div>
                <div class="svg-toggle-control">
                  <span class="svg-toggle-state ${options.reducedMotion ? 'is-on' : ''}" data-state-for="reducedMotion">${options.reducedMotion ? 'ON' : 'OFF'}</span>
                  <button class="svg-pill-switch toggle ${options.reducedMotion ? 'on' : ''}" id="opt-motion" data-toggle="reducedMotion" aria-label="Reduced motion" aria-pressed="${options.reducedMotion}"></button>
                </div>
              </div>

              <div class="svg-difficulty-pills" role="group" aria-label="Simulation Difficulty">
                ${difficulties.map(id => `
                  <button type="button" class="svg-diff-btn difficulty-card ${options.difficulty === id ? 'selected' : ''}" data-difficulty="${id}" aria-pressed="${options.difficulty === id}">
                    <strong>${DIFFICULTY_INFO[id].name}</strong>
                    <small>${escapeHtml(DIFFICULTY_INFO[id].description)}</small>
                  </button>
                `).join('')}
              </div>
            </div>
          </section>
        </div>

        <footer class="svg-window-footer">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="svg-tab-pill" type="button" data-options-credits>CREDITS &amp; SCIENCE</button>
            <button class="svg-tab-pill" type="button" data-options-reset style="border-color:rgba(255,130,130,0.5);color:#ffb4b4;">RESET SAVE</button>
          </div>
          <button class="svg-back-pill-btn" type="button" data-options-back>${returnScreen === 'menu' ? '← BACK' : '← RETURN TO GAME'}</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
    </section>
  `);

  wireUniversalTopBar();

  const syncOptionVisuals = (): void => {
    const masterVal = options.masterVolume ?? 80;
    const masterOut = screenRoot.querySelector<HTMLOutputElement>('#opt-master-volume-value');
    const masterPill = screenRoot.querySelector<HTMLElement>('#opt-master-volume-pill');
    const masterInput = screenRoot.querySelector<HTMLInputElement>('#opt-master-volume');
    if (masterOut) masterOut.value = `${masterVal}%`;
    if (masterPill) masterPill.classList.toggle('is-muted', masterVal === 0);
    if (masterInput) {
      masterInput.value = String(masterVal);
      masterInput.style.setProperty('--fill', `${masterVal}%`);
    }

    const musicOut = screenRoot.querySelector<HTMLOutputElement>('#opt-music-volume-value');
    const musicPill = screenRoot.querySelector<HTMLElement>('#opt-music-volume-pill');
    const musicInput = screenRoot.querySelector<HTMLInputElement>('#opt-music-volume');
    if (musicOut) musicOut.value = `${options.music ? options.musicVolume : 0}%`;
    if (musicPill) musicPill.classList.toggle('is-muted', !options.music || options.musicVolume === 0);
    if (musicInput) {
      musicInput.value = String(options.musicVolume);
      musicInput.style.setProperty('--fill', `${options.musicVolume}%`);
    }

    const sfxOut = screenRoot.querySelector<HTMLOutputElement>('#opt-volume-value');
    const sfxPill = screenRoot.querySelector<HTMLElement>('#opt-volume-pill');
    const sfxInput = screenRoot.querySelector<HTMLInputElement>('#opt-volume');
    if (sfxOut) sfxOut.value = `${options.sound ? options.volume : 0}%`;
    if (sfxPill) sfxPill.classList.toggle('is-muted', !options.sound || options.volume === 0);
    if (sfxInput) {
      sfxInput.value = String(options.volume);
      sfxInput.style.setProperty('--fill', `${options.volume}%`);
    }

    (['sound', 'music', 'lineOfSight', 'reducedMotion'] as const).forEach(key => {
      const btn = screenRoot.querySelector<HTMLButtonElement>(`[data-toggle="${key}"]`);
      const stateSpan = screenRoot.querySelector<HTMLElement>(`[data-state-for="${key}"]`);
      if (btn) {
        btn.classList.toggle('on', options[key]);
        btn.setAttribute('aria-pressed', String(options[key]));
      }
      if (stateSpan) {
        stateSpan.textContent = options[key] ? 'ON' : 'OFF';
        stateSpan.classList.toggle('is-on', options[key]);
      }
    });
  };

  const refresh = (): void => {
    syncOptionVisuals();
    applyOptions();
    saveSettings();
  };

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.toggle;
    if (key !== 'sound' && key !== 'music' && key !== 'lineOfSight' && key !== 'reducedMotion') return;
    options[key] = !options[key];
    sfx.click();
    refresh();
  }));

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-mute-pill]').forEach(pill => pill.addEventListener('click', () => {
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

  screenRoot.querySelectorAll<HTMLInputElement>('[data-slider]').forEach(input => input.addEventListener('input', () => {
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

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.difficulty;
    if (id !== 'cadet' && id !== 'crew' && id !== 'veteran') return;
    options.difficulty = id;
    screenRoot.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(item => {
      const selected = item === button;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    sfx.click();
    refresh();
  }));

  screenRoot.querySelector('[data-options-back]')?.addEventListener('click', () => {
    sfx.click();
    if (returnScreen === 'mission') {
      showMissionShell();
      resumeMissionAfterModal();
      startLoop();
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
    } else {
      showMenu();
    }
  });
  screenRoot.querySelector('[data-options-credits]')?.addEventListener('click', () => {
    sfx.click();
    showCredits();
  });
  screenRoot.querySelector('[data-options-reset]')?.addEventListener('click', () => {
    if (!window.confirm('Reset training progress, settings, and active mission save? This cannot be undone.')) return;
    save = defaultSave();
    lobby = { ...DEFAULT_LOBBY, playerName: save.name, colorId: save.colorId, specialist: save.specialist, destination: save.destination };
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_BACKUP_KEY); } catch { /* Storage may be unavailable. */ }
    persistSave(save);
    showMenu();
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

  setScreen('credits', `
    <section class="universal-duelyst-screen screen-credits">
      ${renderUniversalBackdrop()}
      ${renderUniversalTopBar('credits')}
      <article class="svg-inventory-window">
        <header class="svg-inventory-topbar">
          <div class="svg-inventory-title">
            <span>HEXABYTE INTERACTIVE · YEAR 3042</span>
            <h1>MISSION BRIEF &amp; ARCHIVES</h1>
          </div>
          <span class="svg-section-pill">NASA FIELD SCIENCE</span>
        </header>
        <div class="svg-master-detail-body">
          <div class="svg-slot-well">
            <div class="svg-slot-grid">
              ${archiveItems.map(item => `
                <button type="button" class="svg-slot-card ${item.id === activeId ? 'selected' : ''}" data-archive-slot="${item.id}">
                  <span class="svg-slot-badge">${item.badge}</span>
                  <strong>${escapeHtml(item.title)}</strong>
                  <small>${escapeHtml(item.sub)}</small>
                </button>
              `).join('')}
            </div>
            <div class="svg-slot-footer-bar">
              <span>ARCHIVE SLOTS · ${archiveItems.length} / ${archiveItems.length} UNLOCKED</span>
              <span>SIMULATION MODEL v3042</span>
            </div>
          </div>
          <aside class="svg-inspector-card">
            <div class="svg-inspector-box" id="credits-inspector-main">
              <strong>${escapeHtml(archiveItems[0]!.badge)} · ${escapeHtml(archiveItems[0]!.title.toUpperCase())}</strong>
              <p style="margin:6px 0 0;">${escapeHtml(archiveItems[0]!.body)}</p>
            </div>
            <div class="svg-inspector-box">
              <strong>SCIENCE NOTES &amp; NASA REFERENCES</strong>
              <p style="margin:4px 0 8px;">${escapeHtml(GAME_MODEL_NOTE)}</p>
              <ul style="margin:0;padding-left:18px;display:grid;gap:4px;">
                ${NASA_REFERENCES.map(source => `<li><a href="${source.url}" target="_blank" rel="noreferrer" style="color:#9beeff;">${escapeHtml(source.label)} ↗</a></li>`).join('')}
              </ul>
            </div>
          </aside>
        </div>
        <footer class="svg-window-footer">
          <button class="svg-back-pill-btn" type="button" data-credits-back>← BACK TO MENU</button>
          <button class="svg-back-pill-btn is-cyan" type="button" data-credits-options>OPTIONS →</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
    </section>
  `);

  wireUniversalTopBar();
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
        box.innerHTML = `<strong>${escapeHtml(found.badge)} · ${escapeHtml(found.title.toUpperCase())}</strong><p style="margin:6px 0 0;">${escapeHtml(found.body)}</p>`;
      }
    });
  });
  screenRoot.querySelector('[data-credits-back]')?.addEventListener('click', () => {
    sfx.click();
    showMenu();
  });
  screenRoot.querySelector('[data-credits-options]')?.addEventListener('click', () => {
    sfx.click();
    showOptions();
  });
}

function renderLobbyInspectorDetails(): string {
  const spec = specialistById(lobby.specialist);
  const dest = destinationById(lobby.destination);
  const brief = scienceBrief(lobby.destination);
  const stats = SPECIALIST_STATS[lobby.specialist] ?? SPECIALIST_STATS.repairman;
  return `
    <div class="svg-inspector-preview">
      <img src="${spec.art}" alt="" />
      <div class="svg-inspector-title">
        <span>${escapeHtml(spec.role)} · ${escapeHtml(dest.name.toUpperCase())}</span>
        <h3>${escapeHtml(spec.name)}</h3>
        <small>${escapeHtml(spec.perk)}</small>
      </div>
    </div>
    <div class="svg-stat-bars">
      ${stats.map(row => `
        <div class="svg-stat-row">
          <span>${row.label}</span>
          <div class="svg-stat-track"><div class="svg-stat-fill" style="width:${row.value}%"></div></div>
          <b>${row.value}</b>
        </div>
      `).join('')}
    </div>
    <div class="svg-inspector-box">
      <strong>FIELD SCIENCE · ${escapeHtml(dest.name.toUpperCase())} (${dest.gravity})</strong>
      <p style="margin:4px 0 6px;">${escapeHtml(brief.fact)}</p>
      <small style="display:block;color:#9beeff;">${escapeHtml(brief.operationsNote)}</small>
    </div>
  `;
}

function updateLobbySuitBadge(): void {
  const color = getColor(lobby.colorId);
  const spec = specialistById(lobby.specialist);
  const callsign = (lobby.playerName || 'Spudnaut').trim() || 'Spudnaut';
  const dot = screenRoot.querySelector<HTMLElement>('#potato-suit-dot');
  const label = screenRoot.querySelector<HTMLElement>('#potato-suit-label');
  if (dot) {
    dot.style.background = color.css;
    dot.style.color = color.css;
  }
  if (label) {
    label.textContent = `${callsign} · ${spec.shortName}`;
  }
  const footerNote = screenRoot.querySelector<HTMLElement>('#lobby-summary-note');
  if (footerNote) {
    footerNote.textContent = `${spec.role} · ${destinationById(lobby.destination).name} · ${DIFFICULTY_INFO[save.options.difficulty].name}`;
  }
}

function showLobby(): void {
  const colors = PLAYER_COLORS;
  setScreen('lobby', `
    <section class="universal-duelyst-screen is-zoomed-vista lobby-screen">
      ${renderUniversalBackdrop()}
      ${renderUniversalTopBar('play')}
      <article class="svg-inventory-window">
        <header class="svg-inventory-topbar">
          <div class="svg-inventory-title">
            <span>MISSION SELECT · LOADOUT &amp; DESTINATION</span>
            <h1>BUILD YOUR SPUDNAUT</h1>
          </div>
          <div class="svg-tab-strip">
            <button type="button" class="svg-tab-pill" data-lobby-randomize title="Randomize Loadout">🎲 RANDOMIZE</button>
            <button type="button" class="svg-tab-pill ${save.options.sound ? 'active' : ''}" data-toggle="sound-lobby" aria-pressed="${save.options.sound}">SOUND: ${save.options.sound ? 'ON' : 'OFF'}</button>
            <button type="button" class="svg-tab-pill ${save.options.lineOfSight ? 'active' : ''}" data-toggle="vision-lobby" aria-pressed="${save.options.lineOfSight}">VISION: ${save.options.lineOfSight ? 'ON' : 'OFF'}</button>
          </div>
        </header>

        <div class="svg-master-detail-body">
          <!-- Left Slot Grid Well (Inventory.svg Archetype A) -->
          <div class="svg-slot-well">
            <div>
              <span class="svg-section-pill" style="margin-bottom:10px;">01 · SPECIALIST CLASS</span>
              <div class="svg-slot-grid">
                ${SPECIALISTS.map(specialist => `
                  <button type="button" class="svg-slot-card specialist-tile ${lobby.specialist === specialist.id ? 'selected' : ''}" data-specialist="${specialist.id}" style="--accent:${specialist.accent}">
                    <span class="svg-slot-badge">${escapeHtml(specialist.shortName)}</span>
                    <img src="${specialist.art}" alt="" />
                    <strong>${escapeHtml(specialist.name)}</strong>
                    <small>${escapeHtml(specialist.role)}</small>
                  </button>
                `).join('')}
                <div class="svg-slot-card is-empty" aria-hidden="true">
                  <span style="font-size:22px;line-height:1;">+</span>
                  <small>EXPANSION SLOT</small>
                </div>
              </div>
            </div>

            <div>
              <span class="svg-section-pill is-blue" style="margin-bottom:10px;">02 · TARGET HABITAT &amp; SUIT SWATCH</span>
              <div class="svg-slot-grid" style="margin-bottom:12px;">
                ${DESTINATIONS.map(destination => `
                  <button type="button" class="svg-slot-card destination-tile ${lobby.destination === destination.id ? 'selected' : ''}" data-destination="${destination.id}" style="--accent:${destination.accent}">
                    <span class="svg-slot-badge">${escapeHtml(destination.gravity)}</span>
                    <strong>${escapeHtml(destination.name)}</strong>
                    <small>${escapeHtml(destination.hazard)}</small>
                  </button>
                `).join('')}
                <div class="svg-slot-card is-empty" aria-hidden="true">
                  <span style="font-size:20px;line-height:1;">+</span>
                  <small>EUROPA · LOCKED</small>
                </div>
              </div>

              <div class="color-grid" style="grid-template-columns:repeat(auto-fit,minmax(62px,1fr));gap:8px;">
                ${colors.map(color => `
                  <button type="button" class="color-swatch ${lobby.colorId === color.id ? 'selected' : ''}" data-color="${color.id}" style="--swatch:${color.css};padding:6px;border-radius:8px;">
                    <i style="display:block;width:18px;height:18px;margin:0 auto 4px;border-radius:50%;background:${color.css}"></i>
                    <span style="font-size:10px;">${color.name}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="svg-slot-footer-bar">
              <span>LOADOUT SLOTS · 3 / 3 ACTIVE</span>
              <span id="lobby-summary-note">${escapeHtml(specialistById(lobby.specialist).role)} · ${destinationById(lobby.destination).name} · ${DIFFICULTY_INFO[save.options.difficulty].name}</span>
            </div>
          </div>

          <!-- Right Inspector Card (Inventory.svg Archetype A) -->
          <aside class="svg-inspector-card" id="lobby-inspector">
            <div>
              <label class="svg-row-sub" for="lobby-name" style="margin-bottom:6px;">SPUDNAUT CALLSIGN</label>
              <input class="lobby-input" id="lobby-name" maxlength="18" value="${escapeHtml(lobby.playerName)}" />
            </div>
            <div id="lobby-inspector-details" style="display:grid;gap:12px;">
              ${renderLobbyInspectorDetails()}
            </div>
          </aside>
        </div>

        <footer class="svg-window-footer">
          <button class="svg-back-pill-btn" type="button" data-lobby-back>← BACK</button>
          <button class="svg-back-pill-btn is-cyan" type="button" data-lobby-launch>CONTINUE TO LAUNCH →</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
    </section>
  `);

  wireUniversalTopBar();

  const refreshLobbyInPlace = (): void => {
    screenRoot.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.color === lobby.colorId);
    });
    screenRoot.querySelectorAll<HTMLButtonElement>('[data-specialist]').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.specialist === lobby.specialist);
    });
    screenRoot.querySelectorAll<HTMLButtonElement>('[data-destination]').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.destination === lobby.destination);
    });
    const details = screenRoot.querySelector<HTMLElement>('#lobby-inspector-details');
    if (details) details.innerHTML = renderLobbyInspectorDetails();
    updateLobbySuitBadge();
  };

  screenRoot.querySelector<HTMLInputElement>('#lobby-name')?.addEventListener('input', event => {
    lobby.playerName = (event.target as HTMLInputElement).value;
    updateLobbySuitBadge();
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

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-destination]').forEach(button => button.addEventListener('click', () => {
    lobby.destination = button.dataset.destination as DestinationId;
    sfx.click();
    refreshLobbyInPlace();
  }));

  screenRoot.querySelector('[data-lobby-randomize]')?.addEventListener('click', () => {
    const callsigns = ['Cmdr. Yukon', 'Nova Spud', 'Russet-7', 'Tater Prime', 'Sol-Tuber', 'Orbit Mash', 'Kennebec'];
    lobby.playerName = callsigns[Math.floor(Math.random() * callsigns.length)] ?? 'Spudnaut';
    lobby.colorId = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]?.id ?? lobby.colorId;
    lobby.specialist = SPECIALISTS[Math.floor(Math.random() * SPECIALISTS.length)]?.id ?? lobby.specialist;
    lobby.destination = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)]?.id ?? lobby.destination;
    const input = screenRoot.querySelector<HTMLInputElement>('#lobby-name');
    if (input) input.value = lobby.playerName;
    sfx.click();
    refreshLobbyInPlace();
  });

  screenRoot.querySelector<HTMLButtonElement>('[data-toggle="sound-lobby"]')?.addEventListener('click', event => {
    const btn = event.currentTarget as HTMLButtonElement;
    save.options.sound = !save.options.sound;
    btn.classList.toggle('active', save.options.sound);
    btn.setAttribute('aria-pressed', String(save.options.sound));
    btn.textContent = `SOUND: ${save.options.sound ? 'ON' : 'OFF'}`;
    applyOptions();
    saveSettings();
    sfx.click();
  });

  screenRoot.querySelector<HTMLButtonElement>('[data-toggle="vision-lobby"]')?.addEventListener('click', event => {
    const btn = event.currentTarget as HTMLButtonElement;
    save.options.lineOfSight = !save.options.lineOfSight;
    btn.classList.toggle('active', save.options.lineOfSight);
    btn.setAttribute('aria-pressed', String(save.options.lineOfSight));
    btn.textContent = `VISION: ${save.options.lineOfSight ? 'ON' : 'OFF'}`;
    applyOptions();
    saveSettings();
    sfx.click();
  });

  screenRoot.querySelector('[data-lobby-back]')?.addEventListener('click', () => {
    sfx.click();
    showMenu();
  });
  screenRoot.querySelector('[data-lobby-launch]')?.addEventListener('click', () => {
    sfx.click();
    showLaunch();
  });
}

function showLaunch(): void {
  const specialist = specialistById(lobby.specialist);
  const destination = destinationById(lobby.destination);
  const name = lobby.playerName.trim() || 'Spudnaut';
  setScreen('launch', `
    <section class="universal-duelyst-screen is-zoomed-vista launch-screen">
      ${renderUniversalBackdrop()}
      ${renderUniversalTopBar('play')}
      <article class="svg-options-window" style="width:min(760px,calc(100vw - 28px));">
        <header class="svg-window-header">
          <span class="svg-kicker">SPUDNAUT SPACE AGENCY · LAUNCH CLEARANCE</span>
          <h1>FINAL FLIGHT CHECK</h1>
        </header>
        <div class="svg-options-body">
          <div class="svg-inspector-preview">
            <img src="${specialist.art}" alt="" />
            <div class="svg-inspector-title">
              <span>CREW MANIFEST LOCKED</span>
              <h3>${escapeHtml(name)} · ${escapeHtml(specialist.name)}</h3>
              <small>${escapeHtml(specialist.perk)}</small>
            </div>
          </div>
          <div class="svg-slot-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));">
            <div class="svg-slot-card" style="min-height:84px;cursor:default;"><span class="svg-slot-badge">TARGET</span><strong>${escapeHtml(destination.name)}</strong><small>SURFACE HABITAT</small></div>
            <div class="svg-slot-card" style="min-height:84px;cursor:default;"><span class="svg-slot-badge">GRAVITY</span><strong>${escapeHtml(destination.gravity)}</strong><small>FIELD ENV</small></div>
            <div class="svg-slot-card" style="min-height:84px;cursor:default;"><span class="svg-slot-badge">HAZARD</span><strong>${escapeHtml(destination.hazard)}</strong><small>PRIMARY RISK</small></div>
            <div class="svg-slot-card" style="min-height:84px;cursor:default;"><span class="svg-slot-badge">DURATION</span><strong>${TRIAL_MAX_DAY} DAYS</strong><small>CO-OP TRIAL</small></div>
            <div class="svg-slot-card" style="min-height:84px;cursor:default;"><span class="svg-slot-badge">SYSTEMS</span><strong>4 CORE</strong><small>ALL MUST PASS</small></div>
            <div class="svg-slot-card" style="min-height:84px;cursor:default;"><span class="svg-slot-badge">MODE</span><strong>${escapeHtml(DIFFICULTY_INFO[save.options.difficulty].name)}</strong><small>DIFFICULTY</small></div>
          </div>
        </div>
        <footer class="svg-window-footer">
          <button class="svg-back-pill-btn" type="button" data-launch-back>← MISSION SELECT</button>
          <button class="svg-back-pill-btn is-cyan" type="button" data-launch-begin>BEGIN TRIAL · DAY 01 →</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
    </section>
  `);
  wireUniversalTopBar();
  screenRoot.querySelector('[data-launch-back]')?.addEventListener('click', () => {
    sfx.click();
    showLobby();
  });
  screenRoot.querySelector('[data-launch-begin]')?.addEventListener('click', () => {
    sfx.launch();
    startLaunchSequence();
  });
}

function startLaunchSequence(): void {
  setScreen('launch', `
    <section class="screen-splash launch-sequence" aria-label="Launch and landing cinematic">
      <div class="intro-canvas" id="launch-canvas" aria-hidden="true"></div>
      <div class="intro-accessibility"><span>SPUDNAUT SPACE AGENCY · FLIGHT DECK</span><button class="intro-skip" type="button">SKIP FLIGHT <kbd>ENTER</kbd></button></div>
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
  persistSave(save);
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

function startDay(): void {
  stopLoop();
  mission.phase = 'playing';
  mission.completed = [];
  mission.tasks = [];
  mission.selected = [];
  mission.offers = [];
  mission.report = null;
  mission.dayStartedAt = Date.now();
  mission.pausedDuration = 0;
  mission.pauseStartedAt = 0;
  mission.modalOpen = false;
  const rng = createRng(seedFor(mission.day, mission.penaltyDay, mission.reports.length));
  const recentReports = mission.reports.slice(-3);
  mission.eventCard = eventForDay(rng, lobby.destination, mission.penaltyDay > 0 ? missionDayNumber() : mission.day, recentReports.map(report => report.eventId ?? ''));
  mission.metrics = applyDailyOperations(mission.metrics);
  planningEventBase = { ...mission.metrics };
  selectedEventChoice = mission.eventCard.responses?.[0]?.id ?? 'default';
  if (!mission.eventCard.responses?.length) mission.metrics = applyEvent(mission.metrics, mission.eventCard);
  else applyPlanningEventChoice(selectedEventChoice);
  mission.offers = offersForDay(TASKS, lobby.specialist, rng, mission.reports.slice(-2).flatMap(report => report.tasks ?? []));
  configureScene({ respawn: true });
  updateHUD();
  startPlanning();
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
  const keys: (keyof MissionMetrics)[] = ['power', 'oxygen', 'water', 'starch', 'hull', 'research'];
  return keys.map(key => {
    const before = Math.round(mission.metrics[key]);
    const after = Math.round(projected[key]);
    const diff = after - before;
    const diffLabel = diff > 0 ? `+${diff} ▲` : diff < 0 ? `${diff} ▼` : '0';
    const diffColor = diff > 0 ? '#8fe6a8' : diff < 0 ? '#ff9e9e' : '#9aa6cb';
    return `
      <div class="svg-stat-row" style="grid-template-columns:84px 1fr 78px;">
        <span>${METRIC_LABELS[key].split(' ')[0]!.toUpperCase()}</span>
        <div class="svg-stat-track"><div class="svg-stat-fill" style="width:${Math.min(100, Math.max(0, after))}%"></div></div>
        <b style="text-align:right;color:${diffColor};">${before}→${after} <small>(${diffLabel})</small></b>
      </div>
    `;
  }).join('');
}

function startPlanning(): void {
  const event = mission.eventCard;
  const day = missionDayNumber();
  const goal = mission.penaltyDay > 0 ? 'PENALTY SHIFT' : 'DAILY SHIFT';
  let inspectedOfferId = mission.offers[0]?.taskId ?? '';

  const renderFocusedOfferBox = (taskId: string): string => {
    const offer = mission.offers.find(item => item.taskId === taskId) ?? mission.offers[0];
    if (!offer) return '<div class="svg-inspector-box"><strong>ASSIGNMENT</strong><p>No offer available.</p></div>';
    const sysHealth = offer.system === 'science' ? Math.round(mission.metrics.research) : systemHealth(mission.metrics, offer.system);
    return `
      <div class="svg-inspector-preview">
        <img src="/assets/ui/icons/${offer.icon}.png" alt="" />
        <div class="svg-inspector-title">
          <span>${escapeHtml(getRoomName(offer.roomId))} · ${offer.system.toUpperCase()} (${sysHealth}%)</span>
          <h3>${escapeHtml(offer.name)}</h3>
          <small>${escapeHtml(offer.blurb)}</small>
        </div>
      </div>
      <div class="svg-inspector-box">
        <strong>ASSIGNMENT TELEMETRY</strong>
        <div style="margin-top:4px;">${assignmentPreview(offer.taskId)}</div>
      </div>
    `;
  };

  overlayRoot.innerHTML = `
    <section class="universal-duelyst-screen is-zoomed-vista planning-panel" style="background:rgba(6,10,22,0.72);">
      ${renderUniversalBackdrop()}
      <article class="svg-inventory-window">
        <header class="svg-inventory-topbar">
          <div class="svg-inventory-title">
            <span>${goal} · DAY ${String(day).padStart(2, '0')} · ${ebbOptionsSummary()}</span>
            <h1>SHIFT PLANNING</h1>
          </div>
          <span class="svg-section-pill is-gold">CHOOSE ${DAY.assignmentsPerDay} OF ${mission.offers.length}</span>
        </header>

        <div class="svg-master-detail-body">
          <div class="svg-slot-well">
            <div class="svg-inspector-box event-brief" style="margin:0;">
              <strong>EVENT CARD · ${event ? event.kind.toUpperCase() : 'ROUTINE'} — ${escapeHtml(event?.name ?? 'Routine Shift')}</strong>
              <p style="margin:4px 0 6px;">${escapeHtml(event?.description ?? 'The habitat is quiet. Keep the systems steady.')}</p>
              <p class="story-note" id="event-effect" style="margin:0 0 8px;color:#9beeff;">${escapeHtml(event?.responses?.find(choice => choice.id === selectedEventChoice)?.description ?? event?.effect ?? 'No event effects today.')}</p>
              ${event?.responses?.length ? `
                <div class="event-response-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:8px;">
                  ${event.responses.map(choice => `
                    <button type="button" class="svg-diff-btn event-response ${selectedEventChoice === choice.id ? 'selected' : ''}" data-event-choice="${choice.id}" style="text-align:left;">
                      <strong>${escapeHtml(choice.label)}</strong>
                      <small>${escapeHtml(choice.description)}</small>
                    </button>
                  `).join('')}
                </div>
              ` : ''}
              ${event ? `<div class="event-deltas" id="event-deltas" style="display:flex;flex-wrap:wrap;gap:6px;">${metricChips(metricDeltas(eventBaseMetrics(), mission.metrics))}</div>` : ''}
            </div>

            <div class="svg-slot-grid" id="offers-grid">
              ${mission.offers.map(offer => {
                const selected = mission.selected.includes(offer.taskId);
                const urgent = offer.system !== 'science' && systemHealth(mission.metrics, offer.system) < 55;
                return `
                  <button type="button" class="svg-slot-card offer-card ${selected ? 'selected' : ''}" data-offer="${offer.taskId}" style="--accent:${offer.accent}">
                    <span class="svg-slot-status-dot offer-mark">${selected ? '✓' : '○'}</span>
                    <span class="svg-slot-badge ${urgent ? 'is-urgent' : ''}">${urgent ? 'CRITICAL' : offer.system.toUpperCase()}</span>
                    <img src="/assets/ui/icons/${offer.icon}.png" alt="" />
                    <strong>${escapeHtml(offer.name)}</strong>
                    <small>${escapeHtml(getRoomName(offer.roomId))}</small>
                  </button>
                `;
              }).join('')}
              <div class="svg-slot-card is-empty" aria-hidden="true">
                <span style="font-size:20px;line-height:1;">+</span>
                <small>MAX ${DAY.assignmentsPerDay} / SHIFT</small>
              </div>
            </div>

            <div class="svg-slot-footer-bar">
              <span id="planning-count">${mission.selected.length} / ${DAY.assignmentsPerDay} SELECTED</span>
              <span>DAILY DRIFT: ${metricChips(DAILY_OPERATIONS_DRIFT)}</span>
            </div>
          </div>

          <aside class="svg-inspector-card">
            <div id="planning-offer-inspector" style="display:grid;gap:10px;">
              ${renderFocusedOfferBox(inspectedOfferId)}
            </div>
            <div class="svg-inspector-box">
              <strong>PROJECTED END-OF-SHIFT GAUGES</strong>
              <div class="svg-stat-bars" id="planning-projected-gauges" style="margin-top:8px;">
                ${renderProjectedGaugesMarkup()}
              </div>
            </div>
          </aside>
        </div>

        <footer class="svg-window-footer">
          <span class="story-note">Select ${DAY.assignmentsPerDay} assignments to unlock the airlock &amp; station shift.</span>
          <button class="svg-back-pill-btn is-cyan" type="button" data-planning-confirm ${mission.selected.length === DAY.assignmentsPerDay ? '' : 'disabled'}>START SHIFT →</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
    </section>
  `;

  const refreshPlanning = (): void => {
    overlayRoot.querySelectorAll<HTMLButtonElement>('[data-offer]').forEach(button => {
      const id = button.dataset.offer ?? '';
      const selected = mission.selected.includes(id);
      button.classList.toggle('selected', selected);
      const mark = button.querySelector('.offer-mark');
      if (mark) mark.textContent = selected ? '✓' : '○';
    });
    const count = overlayRoot.querySelector('#planning-count');
    if (count) count.textContent = `${mission.selected.length} / ${DAY.assignmentsPerDay} SELECTED`;
    const confirm = overlayRoot.querySelector<HTMLButtonElement>('[data-planning-confirm]');
    if (confirm) confirm.disabled = mission.selected.length !== DAY.assignmentsPerDay;
    const gauges = overlayRoot.querySelector<HTMLElement>('#planning-projected-gauges');
    if (gauges) gauges.innerHTML = renderProjectedGaugesMarkup();
    const inspector = overlayRoot.querySelector<HTMLElement>('#planning-offer-inspector');
    if (inspector && inspectedOfferId) inspector.innerHTML = renderFocusedOfferBox(inspectedOfferId);
  };

  overlayRoot.querySelectorAll<HTMLButtonElement>('[data-offer]').forEach(button => {
    button.addEventListener('pointerenter', () => {
      const id = button.dataset.offer;
      if (!id) return;
      inspectedOfferId = id;
      const inspector = overlayRoot.querySelector<HTMLElement>('#planning-offer-inspector');
      if (inspector) inspector.innerHTML = renderFocusedOfferBox(inspectedOfferId);
    });
    button.addEventListener('click', () => {
      const id = button.dataset.offer;
      if (!id) return;
      inspectedOfferId = id;
      if (mission.selected.includes(id)) {
        mission.selected = mission.selected.filter(item => item !== id);
      } else if (mission.selected.length < DAY.assignmentsPerDay) {
        mission.selected = [...mission.selected, id];
      } else {
        showToast(`Only ${DAY.assignmentsPerDay} assignments can be scheduled today.`);
        return;
      }
      sfx.click();
      refreshPlanning();
    });
  });

  overlayRoot.querySelectorAll<HTMLButtonElement>('[data-event-choice]').forEach(button => button.addEventListener('click', () => {
    const choiceId = button.dataset.eventChoice;
    if (!choiceId) return;
    selectedEventChoice = choiceId;
    applyPlanningEventChoice(choiceId);
    overlayRoot.querySelectorAll<HTMLButtonElement>('[data-event-choice]').forEach(item => item.classList.toggle('selected', item === button));
    const deltas = overlayRoot.querySelector('#event-deltas');
    if (deltas) deltas.innerHTML = metricChips(metricDeltas(eventBaseMetrics(), mission.metrics));
    const effect = overlayRoot.querySelector('#event-effect');
    if (effect) effect.textContent = mission.eventCard?.responses?.find(item => item.id === choiceId)?.description ?? mission.eventCard?.effect ?? '';
    refreshPlanning();
    updateHUD();
  }));

  overlayRoot.querySelector('[data-planning-confirm]')?.addEventListener('click', () => {
    if (mission.selected.length !== DAY.assignmentsPerDay) return;
    sfx.launch();
    commitAssignments();
  });
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
  if (!entries.length) return '<span class="story-note">No metric change.</span>';
  return entries.map(([key, value]) => {
    const delta = value ?? 0;
    const color = delta >= 0 ? '#8fe6a8' : '#ff9e9e';
    return `<span class="metric-chip" style="padding:6px 12px;border:1px solid rgba(150,190,240,0.3);font-size:11px;letter-spacing:0.16em;">${METRIC_LABELS[key as keyof MissionMetrics].toUpperCase()} <b style="color:${color}">${delta >= 0 ? '+' : ''}${delta}</b></span>`;
  }).join('');
}

function ebbOptionsSummary(): string {
  return `${SYSTEMS.length} SYSTEMS · ${DAY.assignmentsPerDay} TASKS / TIMED SHIFT`;
}

function commitAssignments(): void {
  mission.tasks = [...mission.selected];
  mission.totalAssigned += mission.tasks.length;
  mission.phase = 'playing';
  mission.dayStartedAt = Date.now();
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
  loopTimer = window.setInterval(tickClock, 400);
}

function tickClock(): void {
  if (currentScreen !== 'mission' || mission.phase !== 'playing') return;
  if (mission.modalOpen) return;
  const remaining = Math.max(0, dayDurationMs() - (Date.now() - mission.dayStartedAt - mission.pausedDuration));
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
  const baselineMetrics = prevReport?.metrics ?? planningEventBase ?? mission.metrics;

  overlayRoot.innerHTML = `
    <section class="universal-duelyst-screen earth-report-full" style="background:rgba(6,10,22,0.78);">
      ${renderUniversalBackdrop()}
      <article class="svg-inventory-window report-card ${isFinalDay ? (verdict.passed ? 'final-review passed' : 'final-review below-target') : ''}">
        <header class="svg-inventory-topbar">
          <div class="svg-inventory-title">
            <span>EARTH PROGRESS REPORT · DAY ${String(report.day).padStart(2, '0')} OF ${TRIAL_MAX_DAY + PENALTY_MAX_DAY}</span>
            <h1>${isFinalDay ? 'FINAL HABITAT REVIEW' : 'SHIFT TELEMETRY REPORT'}</h1>
          </div>
          <span class="svg-section-pill ${report.completed === report.assigned ? '' : 'is-gold'}">
            ASSIGNMENTS ${report.completed} / ${report.assigned}
          </span>
        </header>

        <div class="svg-master-detail-body">
          <div class="svg-slot-well">
            <div class="svg-inspector-box" style="margin:0;">
              <strong>SHIFT SUMMARY · ${escapeHtml(report.event.toUpperCase())}</strong>
              <p style="margin:4px 0 0;">${escapeHtml(reason)}</p>
            </div>
            <div class="svg-slot-grid">
              ${mission.tasks.map(id => {
                const task = taskById(id);
                const done = mission.completed.includes(id);
                return `
                  <div class="svg-slot-card report-task ${done ? 'selected done' : ''}" style="cursor:default;">
                    <span class="svg-slot-badge ${done ? 'is-done' : 'is-urgent'}">${done ? 'DONE ✓' : 'MISSED'}</span>
                    <strong>${escapeHtml(task?.name ?? id)}</strong>
                    <small>${escapeHtml(getRoomName(task?.roomId ?? ''))}</small>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="svg-slot-footer-bar">
              <span>MISSED SHIFT DAYS: ${mission.missedDays}</span>
              <span>CUMULATIVE TASKS: ${mission.totalCompleted} / ${mission.totalAssigned}</span>
            </div>
          </div>

          <aside class="svg-inspector-card">
            <div class="svg-inspector-box">
              <strong>HABITAT GAUGES &amp; SHIFT NET DELTA</strong>
              <div class="svg-stat-bars" style="margin-top:10px;">
                ${metricOrder.map(metric => {
                  const value = Math.round(mission.metrics[metric]);
                  const prevVal = Math.round(baselineMetrics[metric]);
                  const delta = value - prevVal;
                  const deltaBadge = delta > 0 ? `+${delta} ▲` : delta < 0 ? `${delta} ▼` : '0';
                  const deltaColor = delta > 0 ? '#8fe6a8' : delta < 0 ? '#ff9e9e' : '#9aa6cb';
                  const target = PASS_THRESHOLDS[metric as keyof typeof PASS_THRESHOLDS];
                  return `
                    <div class="svg-stat-row" style="grid-template-columns:92px 1fr 90px;">
                      <span>${METRIC_LABELS[metric].split(' ')[0]!.toUpperCase()}</span>
                      <div class="svg-stat-track"><div class="svg-stat-fill" style="width:${Math.min(100, Math.max(0, value))}%"></div></div>
                      <b style="text-align:right;">${value} <small style="color:${deltaColor}">(${deltaBadge})</small> <small style="color:#9aa6cb">/ ${typeof target === 'number' ? Math.round(target) : '—'}</small></b>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
            ${isFinalDay ? `
              <div class="svg-inspector-box">
                <strong>CERTIFICATION TARGETS</strong>
                <div class="report-requirements" style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:6px;">
                  ${verdict.requirements.map(item => `<div class="${item.met ? 'met' : 'unmet'}" style="font-size:11px;"><span>${escapeHtml(item.label)}:</span> <strong>${item.value}/${item.target}</strong></div>`).join('')}
                </div>
              </div>
            ` : ''}
          </aside>
        </div>

        <footer class="svg-window-footer">
          <button class="svg-back-pill-btn" type="button" data-report-save>SAVE &amp; EXIT</button>
          <button class="svg-back-pill-btn is-cyan" type="button" data-report-next>${isFinalDay && (verdict.passed || mission.penaltyDay >= PENALTY_MAX_DAY) ? 'SEE FINAL RESULT →' : 'NEXT SHIFT →'}</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
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
  overlayRoot.innerHTML = `
    <section class="universal-duelyst-screen mission-end">
      ${renderUniversalBackdrop()}
      <article class="svg-inventory-window end-card">
        <header class="svg-inventory-topbar">
          <div class="svg-inventory-title">
            <span>SPUDNAUT SPACE AGENCY · FINAL EVALUATION</span>
            <h1>${passed ? 'HABITAT CERTIFIED ★' : 'TRIAL BELOW TARGET'}</h1>
          </div>
          <span class="svg-section-pill ${passed ? '' : 'is-gold'}">${passed ? 'CERTIFIED' : 'REVIEW LOGGED'}</span>
        </header>
        <div class="svg-master-detail-body">
          <div class="svg-slot-well">
            <div class="svg-inspector-preview">
              <img src="${specialist.art}" alt="" />
              <div class="svg-inspector-title">
                <span>${passed ? 'CERTIFICATE OF HABITABILITY' : 'FIELD RECORD'}</span>
                <h3>${escapeHtml(save.name)} · ${escapeHtml(specialist.name)}</h3>
                <small>${escapeHtml(destination.name)} · ${save.trainingRank ?? 'B'} Training Rank</small>
              </div>
            </div>
            <p style="margin:0;color:#fff3d8;line-height:1.6;">
              ${passed
                ? `${escapeHtml(save.name)} and the crew held all four systems together for ${TRIAL_MAX_DAY + mission.penaltyDay} days on ${escapeHtml(destination.name)}. Earth approves the habitat design.`
                : `${escapeHtml(save.name)} completed the trial on ${escapeHtml(destination.name)}, but the final metrics fell below certification targets. Earth has logged the telemetry for the next crew.`}
            </p>
            <div class="svg-slot-grid" style="grid-template-columns:repeat(4,1fr);">
              <div class="svg-slot-card" style="min-height:76px;cursor:default;"><span class="svg-slot-badge">DAYS</span><strong>${mission.day + mission.penaltyDay}</strong></div>
              <div class="svg-slot-card" style="min-height:76px;cursor:default;"><span class="svg-slot-badge">TASKS</span><strong>${mission.totalCompleted}/${mission.totalAssigned}</strong></div>
              <div class="svg-slot-card" style="min-height:76px;cursor:default;"><span class="svg-slot-badge">MISSED</span><strong>${mission.missedDays}</strong></div>
              <div class="svg-slot-card" style="min-height:76px;cursor:default;"><span class="svg-slot-badge">EXAM</span><strong>${save.examBest}%</strong></div>
            </div>
          </div>
          <aside class="svg-inspector-card">
            <div class="svg-inspector-box">
              <strong>CERTIFICATION CHECKLIST</strong>
              <div class="report-requirements" style="display:grid;gap:8px;margin-top:8px;">
                ${verdict.requirements.map(item => `
                  <div class="${item.met ? 'met' : 'unmet'}" style="display:flex;justify-content:space-between;padding:6px 10px;border-radius:6px;background:rgba(12,18,34,0.65);">
                    <span>${escapeHtml(item.label)}</span>
                    <strong style="color:${item.met ? '#8fe6a8' : '#ff9e9e'}">${item.value} / ${item.target} ${item.met ? '✓' : '×'}</strong>
                  </div>
                `).join('')}
              </div>
            </div>
          </aside>
        </div>
        <footer class="svg-window-footer">
          <button class="svg-back-pill-btn" type="button" data-end-menu>RETURN TO MENU</button>
          <button class="svg-back-pill-btn is-cyan" type="button" data-end-retry>NEW TRIAL →</button>
        </footer>
      </article>
      ${renderPotatoOverride(true)}
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
    dayStartedAt: Date.now(),
    pausedDuration: saved.remainingMs === undefined ? 0 : Math.max(0, dayDurationMs(saved.penaltyDay) - saved.remainingMs),
    pauseStartedAt: 0,
    modalOpen: false,
    report: saved.report,
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
    startLoop();
    showToast('Trial resumed. Finish the shift before the clock runs out.');
  } else {
    startDay();
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
    reports: [...mission.reports],
    report: mission.report,
    remainingMs: mission.tasks.length
      ? Math.max(0, dayDurationMs() - (Date.now() - mission.dayStartedAt - mission.pausedDuration - (mission.pauseStartedAt ? Date.now() - mission.pauseStartedAt : 0)))
      : dayDurationMs(),
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
  if (dayPill) dayPill.textContent = `DAY ${String(missionDayNumber()).padStart(2, '0')} / ${TRIAL_MAX_DAY + PENALTY_MAX_DAY}`;
  const taskLabel = document.querySelector<HTMLSpanElement>('#task-label');
  if (taskLabel) taskLabel.textContent = mission.tasks.length ? `TODAY ${mission.completed.length} / ${mission.tasks.length}` : 'PLANNING';
  const fill = document.querySelector<HTMLSpanElement>('#task-fill');
  if (fill) {
    const pct = mission.tasks.length ? (mission.completed.length / mission.tasks.length) * 100 : 0;
    fill.style.width = `${pct}%`;
  }
  const crew = document.querySelector<HTMLSpanElement>('#crew-progress');
  if (crew) crew.textContent = mission.penaltyDay ? `PENALTY SHIFT ${mission.penaltyDay} / ${PENALTY_MAX_DAY}` : `COOPERATIVE TRIAL · MISSED ${mission.missedDays}`;
  const name = document.querySelector<HTMLElement>('#hud-player-name');
  if (name) name.textContent = save.name.toUpperCase();
  const meta = document.querySelector<HTMLElement>('#hud-player-meta');
  if (meta) meta.textContent = `${specialistById(lobby.specialist).shortName} · ${destinationById(lobby.destination).name.toUpperCase()}`;
  const room = document.querySelector<HTMLElement>('#hud-room');
  if (room) room.textContent = (mission.room || 'Cafeteria').toUpperCase();
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
  const relevant = Boolean(id) && (currentScreen === 'training' || mission.tasks.includes(id ?? ''));
  if (currentScreen === 'training') {
    prompt.textContent = id ? `${currentPrompt.name} · ${currentPrompt.room}` : 'WASD / ARROWS MOVE · E INTERACT';
  } else {
    prompt.textContent = id && relevant
      ? `${currentPrompt.name} · ${currentPrompt.room}`
      : id
        ? `${currentPrompt.name} · NOT SCHEDULED TODAY`
        : 'WASD / ARROWS MOVE · E INTERACT';
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

function openMap(): void {
  if (currentScreen !== 'training' && currentScreen !== 'mission') return;
  const map = activeMap();
  const activeTasks = currentScreen === 'mission' ? mission.tasks : map.interactions.map(item => item.id);
  const completed = currentScreen === 'mission' ? mission.completed : training.completed;
  const scale = 680 / map.width;
  const height = Math.round(map.height * scale);
  const marker = (x: number, y: number, tone: string, label?: string): string => {
    return `<button type="button" class="map-marker" data-map-walk-x="${Math.round(x)}" data-map-walk-y="${Math.round(y)}" data-map-walk-label="${escapeHtml(label ?? 'Waypoint')}" title="${escapeHtml(label ? `Walk to ${label}` : 'You')}" style="left:${(x / map.width) * 100}%;top:${(y / map.height) * 100}%;background:${tone};cursor:pointer;border:2px solid #fff;"></button>`;
  };
  modalRoot.innerHTML = `
    <div class="modal-shade">
      <section class="svg-options-window map-card" style="width:min(820px,calc(100vw - 24px));">
        <header class="svg-window-header" style="display:flex;justify-content:space-between;align-items:center;text-align:left;padding:16px 24px;">
          <div><span class="svg-kicker">${escapeHtml(map.subtitle)} · CLICK ANY ROOM TO AUTO-PILOT</span><h2>${escapeHtml(map.title)}</h2></div>
          <button class="svg-tab-pill" data-close aria-label="Close map">✕ CLOSE</button>
        </header>
        <div class="svg-options-body" style="padding:18px 24px;">
          <div class="map-canvas" style="position:relative;width:100%;height:${height}px;max-height:56vh;background:rgba(10,16,32,0.92);border:2px solid #566080;border-radius:12px;overflow:hidden;">
            ${map.rooms.map(room => `
              <button type="button" class="map-room" data-map-walk-x="${Math.round(room.x + room.w / 2)}" data-map-walk-y="${Math.round(room.y + room.h / 2)}" data-map-walk-label="${escapeHtml(room.name)}" title="Click to walk to ${escapeHtml(room.name)}" style="position:absolute;left:${(room.x / map.width) * 100}%;top:${(room.y / map.height) * 100}%;width:${(room.w / map.width) * 100}%;height:${(room.h / map.height) * 100}%;border:1.5px solid ${room.accent};background:rgba(52,52,86,0.28);cursor:pointer;padding:0;text-align:left;">
                <span style="position:absolute;left:6px;top:4px;font:700 9px/1 var(--mono);letter-spacing:0.14em;color:${room.accent};">${escapeHtml(room.name.toUpperCase())}</span>
              </button>
            `).join('')}
            ${map.interactions.filter(item => activeTasks.includes(item.id)).map(item => marker(item.x, item.y, completed.includes(item.id) ? '#8fe6a8' : (item.accent ?? '#f5c451'), item.name)).join('')}
            ${marker(currentScreen === 'training' ? training.x : mission.playerX, currentScreen === 'training' ? training.y : mission.playerY, getColor(save.colorId).css, 'Current Position')}
          </div>
          <div class="svg-slot-footer-bar">
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
              <span>● YOU</span>
              <span style="color:#f5c451;">● ASSIGNMENT</span>
              <span style="color:#8fe6a8;">● COMPLETE</span>
            </div>
            <span>TIP: CLICK ANY ROOM OR MARKER TO WALK THERE</span>
          </div>
        </div>
        <footer class="svg-window-footer" style="justify-content:flex-end;">
          <button class="svg-back-pill-btn" type="button" data-close>CLOSE MAP</button>
        </footer>
      </section>
    </div>
  `;
  const close = (): void => {
    modalRoot.replaceChildren();
    if (currentScreen === 'training') resumeTraining();
    else resumeMissionAfterModal();
  };
  pauseForModal();
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
  modalRoot.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
  modalRoot.querySelector('.modal-shade')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) close();
  });
}

function openTaskList(): void {
  if (currentScreen !== 'mission') {
    if (currentScreen === 'training') renderTrainingHud();
    return;
  }
  pauseMissionForModal();
  let selectedTaskId = mission.tasks[0] ?? '';

  const renderTaskInspector = (taskId: string): string => {
    const task = taskById(taskId);
    if (!task) return '<div class="svg-inspector-box"><strong>NO TASK SELECTED</strong><p>Plan the shift to receive assignments.</p></div>';
    const offer = mission.offers.find(item => item.taskId === task.id);
    const iconName = offer?.icon ?? 'gear';
    const sysName = (task.system ?? offer?.system ?? 'station').toUpperCase();
    const blurbText = offer?.blurb ?? `Complete the ${task.kind} maintenance protocol in ${getRoomName(task.roomId)}.`;
    const done = mission.completed.includes(task.id);
    return `
      <div class="svg-inspector-preview">
        <img src="/assets/ui/icons/${iconName}.png" alt="" />
        <div class="svg-inspector-title">
          <span>${escapeHtml(getRoomName(task.roomId).toUpperCase())} · ${escapeHtml(sysName)}</span>
          <h3>${escapeHtml(task.name)}</h3>
          <small>${done ? 'COMPLETED ✓' : 'PENDING MAINTENANCE'}</small>
        </div>
      </div>
      <div class="svg-inspector-box">
        <strong>TELEMETRY &amp; WALK ESTIMATE</strong>
        <p style="margin:6px 0;">${escapeHtml(blurbText)}</p>
        <div>${assignmentPreview(task.id)}</div>
      </div>
      ${!done ? `
        <button class="svg-back-pill-btn is-cyan" type="button" data-walk-task="${task.id}" style="width:100%;">
          WALK TO STATION (${escapeHtml(getRoomName(task.roomId).toUpperCase())}) →
        </button>
      ` : ''}
    `;
  };

  modalRoot.innerHTML = `
    <div class="modal-shade">
      <section class="svg-inventory-window task-list-card">
        <header class="svg-inventory-topbar">
          <div class="svg-inventory-title">
            <span>DAY ${String(missionDayNumber()).padStart(2, '0')} · ${escapeHtml(mission.eventCard?.name ?? 'ROUTINE SHIFT')}</span>
            <h2>TODAY'S ASSIGNMENTS</h2>
          </div>
          <button class="svg-tab-pill" data-close aria-label="Close tasks">✕ CLOSE</button>
        </header>
        <div class="svg-master-detail-body">
          <div class="svg-slot-well">
            <div class="svg-slot-grid">
              ${mission.tasks.length
                ? mission.tasks.map(id => {
                  const task = taskById(id);
                  const done = mission.completed.includes(id);
                  return `
                    <button type="button" class="svg-slot-card report-task ${id === selectedTaskId ? 'selected' : ''} ${done ? 'done' : ''}" data-task-slot="${id}">
                      <span class="svg-slot-badge ${done ? 'is-done' : ''}">${done ? 'DONE ✓' : 'ACTIVE'}</span>
                      ${task ? `<img src="/assets/ui/icons/${mission.offers.find(o => o.taskId === task.id)?.icon ?? 'gear'}.png" alt="" />` : ''}
                      <strong>${escapeHtml(task?.name ?? id)}</strong>
                      <small>${escapeHtml(getRoomName(task?.roomId ?? ''))}</small>
                    </button>
                  `;
                }).join('')
                : '<p class="story-note">No assignments scheduled yet.</p>'}
            </div>
            <div class="svg-slot-footer-bar">
              <span>COMPLETED: ${mission.completed.length} / ${mission.tasks.length}</span>
              <span>PRESS TAB TO TOGGLE</span>
            </div>
          </div>
          <aside class="svg-inspector-card" id="task-modal-inspector">
            ${renderTaskInspector(selectedTaskId)}
          </aside>
        </div>
        <footer class="svg-window-footer" style="justify-content:flex-end;">
          <button class="svg-back-pill-btn" type="button" data-close>CLOSE</button>
        </footer>
      </section>
    </div>
  `;
  const close = (): void => {
    modalRoot.replaceChildren();
    resumeMissionAfterModal();
  };
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
  modalRoot.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
}

function openMissionLog(): void {
  if (currentScreen !== 'mission') return;
  pauseMissionForModal();
  const reports = [...mission.reports].reverse();
  let selectedDay = reports[0]?.day ?? -1;

  const renderLogInspector = (dayNum: number): string => {
    const rep = reports.find(r => r.day === dayNum) ?? reports[0];
    if (!rep) {
      return `
        <div class="svg-inspector-box">
          <strong>NO EARTH REPORTS SENT YET</strong>
          <p style="margin:6px 0 0;">Complete your first timed shift to transmit daily telemetry to Earth Command.</p>
        </div>
      `;
    }
    return `
      <div class="svg-inspector-box">
        <strong>DAY ${String(rep.day).padStart(2, '0')} · ${escapeHtml(rep.event.toUpperCase())}</strong>
        <p style="margin:6px 0;">Assignments Completed: ${rep.completed} / ${rep.assigned}</p>
        ${rep.eventChoiceId ? `<small style="display:block;color:#9beeff;margin-bottom:6px;">RESPONSE: ${escapeHtml(rep.eventChoiceId.toUpperCase())}</small>` : ''}
        <small style="display:block;color:#c8baff;">${(rep.tasks ?? []).map(id => `${rep.completedTasks?.includes(id) ? '✓' : '×'} ${escapeHtml(taskById(id)?.name ?? id)}`).join(' · ')}</small>
      </div>
      ${rep.metrics ? `
        <div class="svg-inspector-box">
          <strong>RECORDED METRICS</strong>
          <div class="svg-stat-bars" style="margin-top:8px;">
            <div class="svg-stat-row"><span>POWER</span><div class="svg-stat-track"><div class="svg-stat-fill" style="width:${Math.round(rep.metrics.power)}%"></div></div><b>${Math.round(rep.metrics.power)}</b></div>
            <div class="svg-stat-row"><span>OXYGEN</span><div class="svg-stat-track"><div class="svg-stat-fill" style="width:${Math.round(rep.metrics.oxygen)}%"></div></div><b>${Math.round(rep.metrics.oxygen)}</b></div>
            <div class="svg-stat-row"><span>WATER</span><div class="svg-stat-track"><div class="svg-stat-fill" style="width:${Math.round(rep.metrics.water)}%"></div></div><b>${Math.round(rep.metrics.water)}</b></div>
            <div class="svg-stat-row"><span>STARCH</span><div class="svg-stat-track"><div class="svg-stat-fill" style="width:${Math.round(rep.metrics.starch)}%"></div></div><b>${Math.round(rep.metrics.starch)}</b></div>
            <div class="svg-stat-row"><span>HULL</span><div class="svg-stat-track"><div class="svg-stat-fill" style="width:${Math.round(rep.metrics.hull)}%"></div></div><b>${Math.round(rep.metrics.hull)}</b></div>
          </div>
        </div>
      ` : ''}
    `;
  };

  modalRoot.innerHTML = `
    <div class="modal-shade">
      <section class="svg-inventory-window help-card" role="dialog" aria-modal="true" aria-labelledby="mission-log-title">
        <header class="svg-inventory-topbar">
          <div class="svg-inventory-title">
            <span>${escapeHtml(destinationById(lobby.destination).name)} · DAY ${missionDayNumber()}</span>
            <h2 id="mission-log-title">MISSION LOG ARCHIVE</h2>
          </div>
          <button class="svg-tab-pill" data-close aria-label="Close mission log">✕ CLOSE</button>
        </header>
        <div class="svg-master-detail-body">
          <div class="svg-slot-well">
            <div class="svg-slot-grid" style="max-height:46vh;overflow:auto;">
              ${reports.length ? reports.map(rep => `
                <button type="button" class="svg-slot-card ${rep.day === selectedDay ? 'selected' : ''}" data-log-day="${rep.day}">
                  <span class="svg-slot-badge ${rep.completed === rep.assigned ? 'is-done' : 'is-urgent'}">${rep.completed}/${rep.assigned}</span>
                  <strong>DAY ${String(rep.day).padStart(2, '0')}</strong>
                  <small>${escapeHtml(rep.event)}</small>
                </button>
              `).join('') : '<p class="story-note">No Earth reports have been sent yet.</p>'}
            </div>
            <div class="svg-slot-footer-bar">
              <span>LOGGED TRANSMISSIONS: ${reports.length}</span>
              <span>ACTIVE: ${escapeHtml(mission.eventCard?.name ?? 'Routine')}</span>
            </div>
          </div>
          <aside class="svg-inspector-card" id="mission-log-inspector">
            ${renderLogInspector(selectedDay)}
          </aside>
        </div>
        <footer class="svg-window-footer" style="justify-content:flex-end;">
          <button class="svg-back-pill-btn" type="button" data-close>CLOSE</button>
        </footer>
      </section>
    </div>`;
  const close = (): void => { modalRoot.replaceChildren(); resumeMissionAfterModal(); };
  modalRoot.querySelectorAll<HTMLButtonElement>('[data-log-day]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDay = Number(btn.dataset.logDay);
      sfx.click();
      modalRoot.querySelectorAll<HTMLButtonElement>('[data-log-day]').forEach(el => el.classList.toggle('selected', el === btn));
      const inspector = modalRoot.querySelector<HTMLElement>('#mission-log-inspector');
      if (inspector) inspector.innerHTML = renderLogInspector(selectedDay);
    });
  });
  modalRoot.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
}

function openHelp(): void {
  pauseForModal();
  modalRoot.innerHTML = `
    <div class="modal-shade">
      <section class="svg-options-window help-card" style="width:min(740px,calc(100vw - 24px));">
        <header class="svg-window-header" style="display:flex;justify-content:space-between;align-items:center;text-align:left;padding:16px 24px;">
          <div><span class="svg-kicker">S.P.U.D.I.E. · FIELD MANUAL</span><h2>CONTROLS &amp; SYSTEMS</h2></div>
          <button class="svg-tab-pill" data-close aria-label="Close help">✕ CLOSE</button>
        </header>
        <div class="svg-options-body">
          <div class="svg-subcard" style="padding:18px 22px;display:grid;gap:14px;">
            <div>
              <strong style="color:#9beeff;letter-spacing:0.12em;">01 · MOVEMENT &amp; AUTO-PILOT</strong>
              <p style="margin:4px 0 0;color:#fff3d8;">Use <b>WASD</b> or <b>Arrow keys</b> to walk, or <b>Click / Tap</b> any room on the deck or inside the <b>MAP (M)</b> and <b>TASKS (Tab)</b> modals to auto-pilot.</p>
            </div>
            <div style="border-top:1px solid #343c5b;padding-top:12px;">
              <strong style="color:#c8baff;letter-spacing:0.12em;">02 · DAILY SHIFT LOOP</strong>
              <p style="margin:4px 0 0;color:#fff3d8;">Choose 3 of 5 assignments during Shift Planning, inspect projected gauge deltas, then complete each console task before the shift clock expires.</p>
            </div>
            <div style="border-top:1px solid #343c5b;padding-top:12px;">
              <strong style="color:#f4d38b;letter-spacing:0.12em;">03 · FOUR CORE SYSTEMS</strong>
              <p style="margin:4px 0 0;color:#fff3d8;">Keep Power, Life Support, Hydroponics, and Shielding above certification targets for 30 days. Press <b>E</b> near any active station to interact.</p>
            </div>
          </div>
        </div>
        <footer class="svg-window-footer" style="justify-content:flex-end;">
          <button class="svg-back-pill-btn is-cyan" type="button" data-close>UNDERSTOOD</button>
        </footer>
      </section>
    </div>
  `;
  const close = (): void => {
    modalRoot.replaceChildren();
    resumeFromModal();
  };
  modalRoot.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
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
    } else if (!document.hidden && mission.modalOpen && !modalRoot.childElementCount) {
      resumeMissionAfterModal();
    }
  });
  document.addEventListener('keydown', event => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    if (currentScreen === 'menu' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const items = Array.from(screenRoot.querySelectorAll<HTMLButtonElement>('.duelyst-nav-item'));
      if (items.length) {
        event.preventDefault();
        const activeIdx = items.indexOf(document.activeElement as HTMLButtonElement);
        const nextIdx = event.key === 'ArrowDown'
          ? (activeIdx + 1) % items.length
          : (activeIdx <= 0 ? items.length - 1 : activeIdx - 1);
        items[nextIdx]?.focus();
        sfx.click();
      }
      return;
    }

    if (currentScreen === 'menu' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const items = Array.from(screenRoot.querySelectorAll<HTMLButtonElement>('.spud-menu-item'));
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
        const resultContinue = modalRoot.querySelector<HTMLButtonElement>('[data-result-continue]');
        if (resultContinue) resultContinue.click();
        else {
          modalRoot.replaceChildren();
          resumeFromModal();
        }
      }
      return;
    }
    if (currentScreen !== 'mission' && currentScreen !== 'training') return;
    const key = event.key.toLowerCase();
    if (key === 'm') {
      event.preventDefault();
      openMap();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      if (currentScreen === 'mission') openTaskList();
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
    else openMissionTask(currentPrompt.id);
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
