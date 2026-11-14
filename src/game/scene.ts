import Phaser from 'phaser';
import { CAMERA } from '../data/balance';
import { TRAINING_DECK } from '../data/trainingDeck';
import {
  type GameEvent,
  type MapId,
  type SceneGameState,
  type StationControllableScene,
  type StationCoordinator,
  type StationTelemetrySnapshot,
} from './scenes/sceneTypes';
import { SurfaceScene } from './scenes/SurfaceScene';
import { TrainingScene } from './scenes/TrainingScene';

export type { GameEvent, MapId, SceneGameState, StationTelemetrySnapshot };
export { SurfaceScene, TrainingScene };

class BootScene extends Phaser.Scene {
  constructor(private readonly coordinator: StationCoordinator) {
    super({ key: 'boot' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#03060c');
    this.coordinator.activeKey = this.coordinator.targetMode;
    this.scene.start(this.coordinator.targetMode);
  }
}

const coordinators = new WeakMap<Phaser.Game, StationCoordinator>();

function defaultState(initialMode: MapId = 'training'): SceneGameState {
  return {
    mapId: initialMode,
    playerName: 'Spudnaut',
    colorId: 'orange',
    playerArt: '/assets/potato-default.png',
    x: TRAINING_DECK.spawn.x,
    y: TRAINING_DECK.spawn.y,
    speed: 1,
    frozen: false,
    visionEnabled: true,
    activeInteractions: TRAINING_DECK.interactions.map((interaction) => interaction.id),
    completedInteractions: [],
    objective: 'MOVEMENT CHECK',
  };
}

function activeStationScene(game: Phaser.Game): StationControllableScene | null {
  const coordinator = coordinators.get(game);
  if (!coordinator?.activeKey) return null;
  return (game.scene.getScene(coordinator.activeKey) as StationControllableScene | null) ?? null;
}

/** Create the main Phaser station canvas with dedicated Training & Surface scenes. */
export function createStationGame(
  parent: HTMLElement,
  onEvent: (event: GameEvent) => void,
  initialMode: MapId = 'training',
): Phaser.Game {
  const coordinator: StationCoordinator = {
    targetMode: initialMode,
    activeKey: null,
    state: defaultState(initialMode),
    respawn: true,
    reducedMotion: false,
    paused: false,
    onEvent,
  };

  let game: Phaser.Game;
  try {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: CAMERA.viewWidth,
      height: CAMERA.viewHeight,
      backgroundColor: '#03060c',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      scene: [
        new BootScene(coordinator),
        new TrainingScene(coordinator),
        new SurfaceScene(coordinator),
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to initialize WebGL / Canvas renderer.';
    onEvent({ type: 'error', message });
    throw error;
  }

  coordinators.set(game, coordinator);
  game.events.on('contextlost', () => {
    onEvent({ type: 'error', message: 'Graphics context was lost. Click Retry Canvas to restore the view.' });
  });

  const telemetryEnabled = import.meta.env.DEV
    || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('telemetry'));
  if (telemetryEnabled) {
    (globalThis as { __spudTelemetry?: () => unknown }).__spudTelemetry = () => (
      activeStationScene(game)?.getTelemetrySnapshot() ?? null
    );
  }

  return game;
}

export function configureStationGame(
  game: Phaser.Game,
  state: SceneGameState,
  options: { respawn?: boolean } = {},
): void {
  const coordinator = coordinators.get(game);
  if (!coordinator) return;

  coordinator.state = state;
  coordinator.targetMode = state.mapId;
  coordinator.respawn = coordinator.respawn || options.respawn === true;

  if (!coordinator.activeKey) {
    // BootScene hasn't switched yet; it will launch targetMode with this state.
    return;
  }

  if (coordinator.activeKey !== state.mapId) {
    const prevKey = coordinator.activeKey;
    coordinator.paused = false;
    coordinator.onEvent({ type: 'load-progress', progress: 0 });
    coordinator.activeKey = state.mapId;
    game.scene.stop(prevKey);
    game.scene.start(state.mapId);
    return;
  }

  const scene = game.scene.getScene(state.mapId) as StationControllableScene | null;
  scene?.configure(state, options);
}

export function setSceneReducedMotion(game: Phaser.Game, reduced: boolean): void {
  const coordinator = coordinators.get(game);
  if (coordinator) coordinator.reducedMotion = reduced;
  activeStationScene(game)?.setReducedMotion(reduced);
}

export function navigateStationTo(game: Phaser.Game, x: number, y: number): boolean {
  return activeStationScene(game)?.navigateTo(x, y) ?? false;
}

export function interactStation(game: Phaser.Game): void {
  activeStationScene(game)?.interactNow();
}

export function transitionStationThroughBlack(game: Phaser.Game, onCovered: () => void): void {
  const scene = activeStationScene(game);
  if (!scene) {
    throw new Error('Station scene is not available for a transition');
  }
  scene.transitionThroughBlack(onCovered);
}

/** Pause or resume whichever station scene (`training` or `surface`) is active. */
export function setStationPaused(game: Phaser.Game, paused: boolean): void {
  const coordinator = coordinators.get(game);
  if (!coordinator) return;
  coordinator.paused = paused;
  const key = coordinator.activeKey ?? coordinator.targetMode;
  if (paused) {
    if (game.scene.isActive(key)) game.scene.pause(key);
  } else if (game.scene.isPaused(key)) {
    game.scene.resume(key);
  }
}
