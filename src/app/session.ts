import {
  DEFAULT_LOBBY, destinationById, loadSave, penaltyMaxDays, persistSave,
  specialistById, trialMaxDays,
} from '../model';
import type {
  LobbySettings, MissionMetrics, PlayerSave, SavedTrial,
} from '../model';
import { DAY } from '../data/balance';
import type { MapDefinition } from '../data/mapTypes';
import { REACTOR_POWER_SWITCH } from '../data/missionOpening';
import { surfaceHabitatFor } from '../data/surfaceHabitat';
import { TRAINING_DECK } from '../data/trainingDeck';
import type { createStationGame, GameEvent, MapId, SceneGameState } from '../game';
import { supportsHelmetArt } from '../game/assets/characterSprites';
import { configureMusic, startMusic } from '../audio/music';
import { configureSfx } from '../sfx';
import { clearActiveModals } from '../ui/modalController';
import {
  createInitialExam, createMissionState, createTrainingState,
  remainingShiftMs, shouldAutoSealHelmet,
} from './state';
import type {
  ExamState, MissionState, PendingScene, PromptState, ScreenId, TrainingState,
} from './state';
import { routes } from './router';

export type PhaserGame = ReturnType<typeof createStationGame>;
export type GameModule = typeof import('../game');

export type HudDrawerMode = 'tasks' | 'status' | null;

export const TRAINING_SYSTEM_IDS = ['sys-power', 'sys-life', 'sys-farm', 'sys-research'] as const;

export interface DomRefs {
  app: HTMLDivElement;
  screenRoot: HTMLDivElement;
  sceneShell: HTMLDivElement;
  hud: HTMLDivElement;
  trainingHud: HTMLDivElement;
  overlayRoot: HTMLDivElement;
  modalRoot: HTMLDivElement;
}

let cachedDom: DomRefs | null = null;
let cachedGameMod: GameModule | null = null;
let onGameEventHandler: ((event: GameEvent) => void) | null = null;

export function setDomRefs(refs: DomRefs): void {
  cachedDom = refs;
}

export function dom(): DomRefs {
  if (!cachedDom) throw new Error('DOM references have not been mounted yet.');
  return cachedDom;
}

export function setGameEventHandler(handler: (event: GameEvent) => void): void {
  onGameEventHandler = handler;
}

const initialSave = loadSave();

export const session = {
  save: initialSave as PlayerSave,
  lobby: {
    ...DEFAULT_LOBBY,
    playerName: initialSave.name,
    colorId: initialSave.colorId,
    specialist: initialSave.specialist,
    destination: initialSave.destination,
  } as LobbySettings,
  currentScreen: 'splash' as ScreenId,
  exam: createInitialExam() as ExamState,
  remediationIndex: 0,
  mission: createMissionState() as MissionState,
  training: createTrainingState() as TrainingState,
  trainingHudExpanded: false,
  planningEventBase: null as MissionMetrics | null,
  selectedEventChoice: '',
  game: null as PhaserGame | null,
  launchGame: null as PhaserGame | null,
  sceneReady: false,
  loadedSceneMode: null as MapId | null,
  pendingScene: null as PendingScene | null,
  loopTimer: 0,
  splashTimer: 0,
  optionsHideTimer: 0,
  gameLoadPromise: null as Promise<PhaserGame> | null,
  currentPrompt: { id: null, name: '', kind: '', room: 'Cafeteria' } as PromptState,
  countdownAlertShiftStart: 0,
  toastTimer: 0,
  sceneLoadProgress: 0,
  manualHelmetOverride: null as boolean | null,
  splashCleanup: null as (() => void) | null,
  activeHudDrawer: null as HudDrawerMode,
  lastHazardWarningAt: 0,
  evaDrainTicks: 0,
  rewinding: false,
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export function targetMusicGain(): number {
  if (!session.save.options.music) return 0;
  const master = (session.save.options.masterVolume ?? 80) / 100;
  const music = (session.save.options.musicVolume ?? 80) / 100;
  return Math.max(0, Math.min(1, master * music));
}

export function effectivePlayerHelmet(): boolean {
  if (!supportsHelmetArt(specialistById(session.lobby.specialist).art)) return false;
  if (session.manualHelmetOverride !== null) return session.manualHelmetOverride;
  if (session.currentScreen === 'training') return shouldAutoSealHelmet(session.training.room, 100);
  if (session.currentScreen !== 'mission') return false;
  return shouldAutoSealHelmet(session.mission.room, session.mission.metrics.life, {
    x: session.mission.playerX,
    y: session.mission.playerY,
  });
}

export function activeMap(): MapDefinition {
  return session.currentScreen === 'training' ? TRAINING_DECK : surfaceHabitatFor(session.lobby.destination);
}

export function movementSpeed(): number {
  return 1;
}

export function missionDayNumber(): number {
  return session.mission.day + session.mission.penaltyDay;
}

export function trialDayLabel(trial: Pick<SavedTrial, 'day' | 'penaltyDay' | 'majorEventRun'>): string {
  const difficulty = trial.majorEventRun?.difficulty ?? session.save.options.difficulty;
  return trial.penaltyDay
    ? `EXT. ${trial.penaltyDay} / ${penaltyMaxDays(difficulty)}`
    : `DAY ${String(trial.day).padStart(2, '0')} / ${trialMaxDays(difficulty)}`;
}

export function isMissionActive(): boolean {
  return session.currentScreen === 'mission'
    && session.mission.phase === 'playing'
    && (session.mission.tasks.length > 0 || session.mission.opening === 'blackout');
}

export function dayDurationMs(penaltyDay = session.mission.penaltyDay): number {
  const difficulty = session.mission.majorEventRun.difficulty;
  const base = difficulty === 'cadet'
    ? DAY.cadetMs
    : difficulty === 'veteran'
      ? DAY.veteranMs
      : DAY.baseMs;
  return Math.round(base * (penaltyDay > 0 ? DAY.penaltyScale : 1));
}

export function syncLobbyFromSave(): void {
  session.lobby = {
    playerName: session.save.name,
    colorId: session.save.colorId,
    specialist: session.save.specialist,
    destination: session.save.destination,
  };
}

export function saveSettings(): void {
  persistSave(session.save);
}

export function saveTrialProgress(): void {
  const { mission, save, selectedEventChoice, planningEventBase } = session;
  const phase: SavedTrial['phase'] = mission.phase === 'report'
    ? 'report'
    : mission.phase === 'penalty'
      ? 'penalty'
      : 'playing';
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
    donkiReport: mission.eventCard?.source,
    majorEventRun: mission.majorEventRun,
    pendingDisaster: mission.pendingDisaster,
    opening: mission.opening,
    hudBriefing: mission.hudBriefing,
    checkpoint: mission.checkpoint,
    eventChoiceId: selectedEventChoice || undefined,
    position: { x: mission.playerX, y: mission.playerY },
    reports: [...mission.reports],
    report: mission.report,
    remainingMs: mission.tasks.length ? remainingShiftMs(mission, Date.now()) : undefined,
    shiftDurationMs: mission.tasks.length ? mission.shiftDurationMs : undefined,
    planning: !mission.tasks.length && planningEventBase
      ? {
          eventBase: { ...planningEventBase },
          selected: [...mission.selected],
          offers: mission.offers.map(offer => offer.taskId),
          majorEventReportId: mission.eventCard?.majorEvent ? mission.eventCard.source?.id : undefined,
        }
      : undefined,
  };
  save.activeTrial = trial;
  save.trialDay = missionDayNumber();
  persistSave(save);
}

export function stopLoop(): void {
  if (session.loopTimer) {
    window.clearInterval(session.loopTimer);
    session.loopTimer = 0;
  }
}

export function setSceneLoadingState(active: boolean, progress?: number, label?: string): void {
  const overlay = document.querySelector<HTMLElement>('#scene-loading');
  const bar = document.querySelector<HTMLProgressElement>('#scene-loading-progress');
  const title = document.querySelector<HTMLElement>('#scene-loading-label');
  const detail = document.querySelector<HTMLElement>('#scene-loading-detail');
  if (!overlay) return;

  overlay.hidden = !active;
  if (active) {
    dom().sceneShell.setAttribute('aria-busy', 'true');
    if (bar) {
      if (typeof progress === 'number' && progress > 0) {
        const pct = Math.max(1, Math.min(100, Math.round(progress * 100)));
        bar.max = 100;
        bar.value = pct;
        if (title) title.textContent = label ?? `LOADING HABITAT SYSTEMS · ${pct}%`;
        if (detail) {
          detail.textContent = pct >= 95
            ? 'Finalizing tilemap & crew animations...'
            : 'Streaming station & crew assets';
        }
      } else {
        bar.removeAttribute('value');
        if (title) title.textContent = label ?? 'CONNECTING HABITAT ENGINE...';
        if (detail) detail.textContent = 'Initializing Phaser simulation & sprites';
      }
    }
  } else {
    dom().sceneShell.removeAttribute('aria-busy');
  }
}

export async function ensureStationGame(initialMode?: MapId): Promise<PhaserGame> {
  if (session.game) return session.game;
  if (!session.gameLoadPromise) {
    const mode: MapId = initialMode ?? (session.currentScreen === 'mission' ? 'surface' : 'training');
    session.gameLoadPromise = import('../game').then((mod) => {
      cachedGameMod = mod;
      if (!session.game) {
        const canvasHost = document.querySelector<HTMLDivElement>('#game-canvas')!;
        try {
          session.loadedSceneMode = mode;
          session.game = mod.createStationGame(
            canvasHost,
            (event) => onGameEventHandler?.(event),
            mode,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unable to start canvas engine.';
          routes.onSceneFailure(msg);
          throw error;
        }
      }
      return session.game;
    }).finally(() => {
      session.gameLoadPromise = null;
    });
  }
  return session.gameLoadPromise;
}

export function resetStationGame(): void {
  if (session.game) {
    try {
      session.game.destroy(true);
    } catch {
      // Ignore cleanup errors from a broken WebGL/Canvas context.
    }
    session.game = null;
  }
  session.sceneReady = false;
  session.loadedSceneMode = null;
  session.pendingScene = null;
  session.sceneLoadProgress = 0;
}

export function wakeStationGame(): void {
  if (!session.game) return;
  session.game.loop.wake();
  if (cachedGameMod) {
    cachedGameMod.setStationPaused(session.game, false);
  } else {
    const active = session.game;
    void import('../game').then((mod) => {
      cachedGameMod = mod;
      if (active === session.game) mod.setStationPaused(active, false);
    });
  }
}

export function setScreen(screen: ScreenId, markup: string): void {
  const { overlayRoot, modalRoot, sceneShell, hud, trainingHud, screenRoot } = dom();
  session.pendingScene = null;
  session.splashCleanup?.();
  session.splashCleanup = null;
  if (screen !== 'launch' && session.launchGame) {
    session.launchGame.destroy(true);
    session.launchGame = null;
  }
  if (session.game) {
    const worldVisible = screen === 'training' || screen === 'mission';
    if (worldVisible) {
      wakeStationGame();
    } else {
      if (cachedGameMod) {
        cachedGameMod.setStationPaused(session.game, true);
      } else {
        const active = session.game;
        void import('../game').then((mod) => {
          cachedGameMod = mod;
          if (active === session.game) mod.setStationPaused(active, true);
        });
      }
      session.game.loop.sleep();
    }
  }
  session.currentScreen = screen;
  routes.dismissTutorial(false);
  routes.setHudDrawer(null);
  stopLoop();
  window.clearTimeout(session.splashTimer);
  overlayRoot.replaceChildren();
  clearActiveModals(modalRoot, { restoreFocus: false });
  sceneShell.hidden = true;
  setSceneLoadingState(false);
  hud.hidden = true;
  trainingHud.hidden = true;
  screenRoot.hidden = false;
  screenRoot.innerHTML = markup;
  document.body.dataset.screen = screen;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function trainingSceneState(): SceneGameState {
  const inspected = TRAINING_SYSTEM_IDS.filter((id) => session.training.completed.includes(id)).length;
  return {
    mapId: 'training',
    playerName: session.save.name,
    colorId: session.save.colorId,
    playerArt: specialistById(session.lobby.specialist).art,
    helmet: effectivePlayerHelmet(),
    x: session.training.x,
    y: session.training.y,
    speed: movementSpeed(),
    frozen: session.training.modalOpen,
    visionEnabled: session.save.options.lineOfSight,
    activeInteractions: TRAINING_DECK.interactions.map((interaction) => interaction.id),
    completedInteractions: session.training.completed,
    objective: inspected >= TRAINING_SYSTEM_IDS.length ? 'REPORT TO THE BRIDGE' : 'INSPECT FOUR SYSTEMS',
  };
}

export function missionSceneState(): SceneGameState {
  const { mission } = session;
  const blackout = mission.opening === 'blackout';
  return {
    mapId: 'surface',
    destination: session.lobby.destination,
    playerName: session.save.name,
    colorId: session.save.colorId,
    playerArt: specialistById(session.lobby.specialist).art,
    helmet: effectivePlayerHelmet(),
    x: session.mission.playerX,
    y: session.mission.playerY,
    speed: movementSpeed(),
    frozen: !isMissionActive() || session.mission.modalOpen || session.rewinding,
    visionEnabled: session.save.options.lineOfSight,
    blackout,
    spotlightGuide: mission.spotlightGuide,
    restAtBunk: mission.opening === 'first-shift' && mission.tasks.length > 0
      && mission.tasks.length === mission.completed.length,
    activeInteractions: blackout ? [REACTOR_POWER_SWITCH.id] : mission.tasks,
    completedInteractions: session.mission.completed,
    objective: session.mission.eventCard?.name ?? 'HABITAT SHIFT',
  };
}

export function configureScene(options: { respawn?: boolean; onConfigured?: () => void } = {}): void {
  if (!session.game) return;
  const state = session.currentScreen === 'training' ? trainingSceneState() : missionSceneState();
  const modeSwitching = session.loadedSceneMode !== null && session.loadedSceneMode !== state.mapId;
  if (modeSwitching) {
    session.loadedSceneMode = state.mapId;
    session.sceneReady = false;
    session.sceneLoadProgress = 0;
    setSceneLoadingState(
      true,
      0,
      state.mapId === 'surface' ? 'LOADING SURFACE HABITAT...' : 'LOADING TRAINING DECK...',
    );
  }
  if (!session.sceneReady && !modeSwitching) {
    const respawn = options.respawn === true
      || (session.pendingScene?.state.mapId === state.mapId && session.pendingScene.respawn);
    session.pendingScene = { state, respawn };
    return;
  }
  if (modeSwitching) {
    session.pendingScene = { state, respawn: options.respawn === true };
  }
  const activeGame = session.game;
  void import('../game').then((mod) => {
    cachedGameMod = mod;
    if (activeGame === session.game) {
      mod.configureStationGame(activeGame, state, { respawn: options.respawn === true });
      options.onConfigured?.();
    }
  });
}

export function walkStationTo(x: number, y: number, label?: string): void {
  if (!session.game) return;
  const activeGame = session.game;
  const screen = session.currentScreen;
  void import('../game').then((mod) => {
    cachedGameMod = mod;
    if (activeGame === session.game && session.currentScreen === screen) {
      const routed = mod.navigateStationTo(activeGame, x, y);
      if (label) showToast(routed ? `Follow the route line to ${label}.` : `No route to ${label}.`);
    }
  });
}

export function interactActiveStation(): void {
  if (!session.game) return;
  const activeGame = session.game;
  void import('../game').then((mod) => {
    cachedGameMod = mod;
    if (activeGame === session.game) mod.interactStation(activeGame);
  });
}

export function showToast(message: string, durationMs = 3400): void {
  const target = session.currentScreen === 'training'
    ? document.querySelector<HTMLDivElement>('#training-toast')
    : document.querySelector<HTMLDivElement>('#toast');
  if (!target) return;
  window.clearTimeout(session.toastTimer);
  target.textContent = message;
  target.classList.add('visible');
  target.classList.toggle('countdown-warning', message === '30 SECONDS LEFT' || message.startsWith('VACUUM HAZARD'));
  session.toastTimer = window.setTimeout(() => {
    if (target.textContent === message) {
      target.classList.remove('visible', 'countdown-warning');
    }
  }, durationMs);
}

export function applyOptions(): void {
  const { save, currentScreen, game, sceneReady } = session;
  const master = (save.options.masterVolume ?? 80) / 100;
  configureSfx({ enabled: save.options.sound && master > 0, volume: Math.round(save.options.volume * master) });
  configureMusic({ enabled: save.options.music && master > 0, volume: Math.round(save.options.musicVolume * master) });
  if (currentScreen === 'splash') {
    const introVideo = dom().screenRoot.querySelector<HTMLVideoElement>('.opening-video');
    if (introVideo) {
      const gain = targetMusicGain();
      introVideo.muted = gain <= 0;
      introVideo.volume = gain;
    }
  }
  document.body.classList.toggle('reduce-motion', Boolean(save.options.reducedMotion));
  if (save.options.reducedMotion) {
    document.documentElement.style.setProperty('--parallax-x', '0');
    document.documentElement.style.setProperty('--parallax-y', '0');
  }
  if (game && sceneReady) {
    const activeGame = game;
    void import('../game').then((mod) => {
      cachedGameMod = mod;
      if (activeGame === session.game) {
        mod.setSceneReducedMotion(activeGame, save.options.reducedMotion);
      }
    });
  }
  const fpsEnabled = Boolean(save.options.showFps);
  const hudFps = document.querySelector<HTMLElement>('#hud-fps');
  if (hudFps) hudFps.hidden = !fpsEnabled;
  const trainingFps = document.querySelector<HTMLElement>('#training-fps');
  if (trainingFps) trainingFps.hidden = !fpsEnabled;
  if (currentScreen === 'mission' || currentScreen === 'training') configureScene();
}

export function pauseTrainingForModal(): void {
  session.training.modalOpen = true;
  configureScene();
  routes.updateActionButtons();
}

export function resumeTraining(): void {
  session.training.modalOpen = false;
  configureScene();
  routes.updateActionButtons();
}

export function pauseMissionForModal(): void {
  if (!isMissionActive() || session.mission.modalOpen) return;
  session.mission.modalOpen = true;
  session.mission.pauseStartedAt = Date.now();
  configureScene();
  routes.updateActionButtons();
}

export function resumeMissionAfterModal(): void {
  if (!session.mission.modalOpen) return;
  if (session.mission.pauseStartedAt) {
    session.mission.pausedDuration += Date.now() - session.mission.pauseStartedAt;
    session.mission.pauseStartedAt = 0;
  }
  session.mission.modalOpen = false;
  configureScene();
  routes.updateActionButtons();
}

export function pauseForModal(): void {
  if (session.currentScreen === 'training') pauseTrainingForModal();
  else pauseMissionForModal();
}

export function resumeFromModal(): void {
  if (session.currentScreen === 'training') resumeTraining();
  else resumeMissionAfterModal();
}

export function talkToCrew(crewId: string, fallbackName?: string, fallbackLines?: string[]): void {
  const crew = activeMap().crew.find((item) => item.id === crewId) ?? (fallbackName && fallbackLines?.length ? {
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
  if (session.currentScreen === 'training' && !session.training.crew.includes(crew.id)) {
    session.training.crew.push(crew.id);
    routes.renderTrainingHud();
  }

  let lines = [...crew.lines];
  if (crew.id === 'rover' && session.currentScreen === 'mission') {
    const dest = destinationById(session.lobby.destination);
    const helmetSealed = effectivePlayerHelmet();
    const statusLine = helmetSealed
      ? `EVA link green on ${dest.name} (${dest.gravity}). Your helmet seal is verified for exterior apron patrols.`
      : `Warning from ${dest.name} Pad: your EVA visor is unsealed. Press G to seal your helmet outside the airlock.`;
    lines = [statusLine, ...crew.lines];
  }

  routes.showDialogue({
    speaker: crew.name,
    role: crew.role,
    art: crew.art,
    accent: crew.accent,
    lines,
  });
}

export function resumeMusicIfAllowed(): void {
  const { currentScreen, save } = session;
  if (currentScreen === 'splash' || currentScreen === 'mission' || currentScreen === 'training') return;
  if (save.options.music) startMusic();
}
