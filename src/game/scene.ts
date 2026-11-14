import Phaser from 'phaser';
import { CAMERA, MOVEMENT } from '../data/balance';
import type { MapDefinition, PropDef } from '../data/mapTypes';
import { TRAINING_DECK } from '../data/trainingDeck';
import { surfaceHabitatFor, SURFACE_HABITAT } from '../data/surfaceHabitat';
import { getRoomName, PLAYER_COLORS, type PlayerColorId } from '../model';
import { MapGeometry } from '../sim/navigation';
import type { InputSnapshot, PlayerState } from '../sim/movement';
import { createPlayerState, lerp, stepPlayer } from '../sim/movement';
import { AssetKeys, MapKeys } from './assets/AssetKeys';
import {
  applyResolvedSpriteVisual,
  hasAnimatedSprite,
  preloadCharacterSprites,
  registerCharacterAnimations,
  resolveCharacterVisual,
  SPRITE_CREW_DISPLAY_HEIGHT,
  SPRITE_CREW_DISPLAY_WIDTH,
  SPRITE_DISPLAY_HEIGHT,
  SPRITE_DISPLAY_WIDTH,
  SPRITE_ORIGIN_X,
  SPRITE_ORIGIN_Y,
} from './assets/characterSprites';
import { createPlaceholderTextures } from './assets/PlaceholderFactory';
import { DEBUG_PAN_SPEED, DEMO_PAN_DURATION, PLAYER_FEET } from './constants';
import { CrewNPC } from './entities/CrewNPC';
import { Player } from './entities/Player';
import { TaskStation } from './entities/TaskStation';
import { FollowerCamera } from './systems/FollowerCamera';
import { InputSystem } from './systems/InputSystem';
import { InteractionSystem } from './systems/InteractionSystem';
import { compressPath, findPath, gridFromTiles, hasTileClearance, tileAtPixel, type Tile, type WalkableGrid } from './utils/pathing';
import { MapLoader, type LoadedMap } from './world/MapLoader';
import { FIGMA_CONTACT_SHADOWS, FIGMA_LAYER_TEXTURES, TASK_OBJECT_OUTLINE_SPECS } from './world/figmaMapLayers';
import { roomAt } from './world/Room';

export type MapId = 'training' | 'surface';

export interface SceneGameState {
  mapId: MapId;
  destination?: 'moon' | 'mars';
  playerName: string;
  colorId: PlayerColorId;
  playerArt: string;
  helmet?: boolean;
  x: number;
  y: number;
  speed: number;
  frozen: boolean;
  visionEnabled: boolean;
  activeInteractions: string[];
  completedInteractions: string[];
  objective: string;
}

export type GameEvent =
  | { type: 'load-progress'; progress: number }
  | { type: 'ready' }
  | { type: 'move'; x: number; y: number; room: string }
  | { type: 'prompt'; interactionId: string | null; name: string; kind: string; room: string }
  | { type: 'interact'; interactionId: string; kind: string }
  | { type: 'crew'; crewId: string; name: string; lines: string[] }
  | { type: 'route-blocked' }
  | { type: 'fps'; fps: number };

const MAPS: Record<MapId, MapDefinition> = {
  training: TRAINING_DECK,
  surface: SURFACE_HABITAT,
};

const POTATO_TEXTURES: Record<string, string> = {
  '/assets/potato-default.png': 'potato-default',
  '/assets/potato-farmer.png': 'potato-farmer',
  '/assets/potato-repairman.png': 'potato-repairman',
  '/assets/potato-researcher.png': 'potato-researcher',
  '/assets/potato-traveller.png': 'potato-traveller',
};

const ICON_TEXTURES: Record<string, string> = {
  lightning: '/assets/ui/icons/lightning.png',
  water: '/assets/ui/icons/water.png',
  sickle: '/assets/ui/icons/sickle.png',
  shield: '/assets/ui/icons/shield.png',
  notepad: '/assets/ui/icons/notepad.png',
  hammer: '/assets/ui/icons/hammer.png',
  arrow: '/assets/ui/icons/arrow.png',
};

const ICON_GLYPHS: Record<string, string> = {
  lightning: '⚡',
  water: '◈',
  sickle: '❋',
  shield: '⬡',
  notepad: '▤',
  hammer: '⚒',
  arrow: '→',
};

function textureKeyForArt(art: string): string {
  return POTATO_TEXTURES[art] ?? 'potato-default';
}

function colorHex(id: PlayerColorId): number {
  return PLAYER_COLORS.find((color) => color.id === id)?.hex ?? 0xef7d0d;
}

function nearestWalkableTile(grid: WalkableGrid, target: Tile): Tile | null {
  if (!grid.isBlocked(target.x, target.y)) return target;
  const limit = Math.max(grid.cols, grid.rows);
  for (let radius = 1; radius < limit; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = target.x + dx;
        const y = target.y + dy;
        if (!grid.isBlocked(x, y)) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Unified station Phaser scene:
 * - `surface` (Main Mission): Tiled `spudnaut-station.tmj` + illustrated floorplan,
 *   Arcade Physics walls, FollowerCamera, Y-sorted TaskStations/Props, and
 *   autonomous BFS-wandering CrewNPCs.
 * - `training` (Earth Simulator): keeps Training Deck procedural map and bridge flow.
 */
export class StationScene extends Phaser.Scene {
  private readonly onEvent: (event: GameEvent) => void;
  private state: SceneGameState;
  private map: MapDefinition = TRAINING_DECK;
  private activeMode: MapId | null = null;
  private reducedMotion = false;
  private ready = false;
  private pendingState: SceneGameState | null = null;
  private pendingRespawn = false;

  private lastMoveEvent = 0;
  private lastFpsEvent = 0;
  private lastEmittedRoom = '';
  private promptKey = '';

  // Training-deck state (procedural MapGeometry)
  private geometry?: MapGeometry;
  private sim: PlayerState = createPlayerState(TRAINING_DECK.spawn.x, TRAINING_DECK.spawn.y);
  private playerRoot?: Phaser.GameObjects.Container;
  private playerBody?: Phaser.GameObjects.Container;
  private trainingPlayerSprite?: Phaser.GameObjects.Sprite;
  private readonly trainingCrewSprites: Array<{ sprite: Phaser.GameObjects.Sprite; baseTextureKey: string }> = [];
  private mapLayer?: Phaser.GameObjects.Container;
  private markerLayer?: Phaser.GameObjects.Container;
  private crewLayer?: Phaser.GameObjects.Container;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private accumulator = 0;
  private camTargetX = TRAINING_DECK.spawn.x;
  private camTargetY = TRAINING_DECK.spawn.y;
  private camSnap = true;

  // Surface-station state (merged Tiled + Arcade physics + FollowerCamera)
  private tiledMap?: LoadedMap;
  private tiledGrid?: WalkableGrid;
  private tiledPlayer?: Player;
  private wallCollider?: Phaser.Physics.Arcade.Collider;
  private followerCamera?: FollowerCamera;
  private tiledInput?: InputSystem;
  private readonly tiledInteraction = new InteractionSystem();
  private readonly tiledStations: TaskStation[] = [];
  private readonly tiledCrew: CrewNPC[] = [];
  private tiledRoute: { x: number; y: number }[] = [];
  private routeProgress?: { x: number; y: number; stalledMs: number };
  private stationTransitionActive = false;

  constructor(onEvent: (event: GameEvent) => void, initial: SceneGameState) {
    super({ key: 'station' });
    this.onEvent = onEvent;
    this.state = initial;
    this.map = this.resolveMapDef(initial);
    this.sim = createPlayerState(initial.x || this.map.spawn.x, initial.y || this.map.spawn.y);
    this.camTargetX = this.sim.x;
    this.camTargetY = this.sim.y;
  }

  preload(): void {
    this.load.on('progress', (progress: number) => {
      this.onEvent({ type: 'load-progress', progress });
    });

    for (const [path, key] of Object.entries(POTATO_TEXTURES)) {
      this.load.image(key, path);
    }
    preloadCharacterSprites(this);
    for (const [name, path] of Object.entries(ICON_TEXTURES)) {
      this.load.image(`icon-${name}`, path);
    }
    this.load.image('planet-earth', '/assets/placeholders/kenney/planets/planet00.png');
    this.load.image('planet-moon', '/assets/placeholders/kenney/planets/planet05.png');
    this.load.image('planet-mars', '/assets/placeholders/kenney/planets/planet08.png');

    // Station artwork (Figma layered master + Tiled collision JSON)
    this.load.image(AssetKeys.mapImage, '/assets/maps/spudnaut-station.png');
    this.load.image(AssetKeys.mapFloorImage, '/assets/maps/spudnaut-station-floor.png');
    this.load.image(AssetKeys.mapObjectsImage, '/assets/maps/spudnaut-station-objects.png');
    this.load.image(AssetKeys.figmaFloorPlan, '/assets/maps/figma/floor-plan.png');
    this.load.image(AssetKeys.figmaObjectsSheet, '/assets/maps/figma/objects-sheet.png');
    this.load.image(AssetKeys.figmaHydroponicsPlatform, '/assets/maps/figma/hydroponics-platform.png');
    for (const layer of Object.values(FIGMA_LAYER_TEXTURES)) {
      this.load.image(layer.key, layer.path);
    }
    this.load.image(AssetKeys.collisionMask, '/assets/maps/collision-mask.jpg');
    for (const shadow of FIGMA_CONTACT_SHADOWS) {
      this.load.svg(shadow.key, shadow.path);
    }
    this.load.tilemapTiledJSON(MapKeys.station, '/assets/maps/spudnaut-station.tmj');
  }

  create(): void {
    createPlaceholderTextures(this);
    registerCharacterAnimations(this);

    this.cameras.main.setZoom(CAMERA.zoom);
    this.cameras.main.setBackgroundColor('#03060c');

    this.tiledInput = new InputSystem(this);
    this.keys = this.input.keyboard?.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT',
      false,
      false,
    ) as Record<string, Phaser.Input.Keyboard.Key> | undefined;

    this.input.keyboard?.on('keydown-E', () => {
      if (this.activeMode === 'training') this.tryInteractTraining();
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointer(pointer));

    this.tiledInteraction.onSelectionChanged(() => {
      if (this.activeMode === 'surface') {
        this.emitSurfacePrompt(true);
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.removeAllListeners();
      this.input.removeAllListeners();
      this.teardownTraining();
      this.teardownSurface();
    });

    this.ready = true;
    this.onEvent({ type: 'ready' });
    if (this.pendingState) {
      const next = this.pendingState;
      const respawn = this.pendingRespawn;
      this.pendingState = null;
      this.pendingRespawn = false;
      this.applyState(next, respawn);
    } else {
      this.applyState(this.state, true);
    }
  }

  configure(next: SceneGameState, options: { respawn?: boolean } = {}): void {
    if (!this.ready) {
      this.pendingState = next;
      this.pendingRespawn = this.pendingRespawn || options.respawn === true;
      return;
    }
    this.applyState(next, options.respawn === true);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (this.tiledPlayer) this.tiledPlayer.reducedMotion = reduced;
    for (const member of this.tiledCrew) member.setReducedMotion(reduced);
    this.followerCamera?.setReducedMotion(reduced);
    this.syncTrainingCrewAnimations();
  }

  navigateTo(x: number, y: number): boolean {
    if (!this.ready || this.state.frozen) return false;
    if (this.activeMode === 'surface') {
      return this.routeSurfaceTo(x, y);
    }
    if (!this.geometry) return false;
    const target = this.nearestTrainingInteraction(x, y, 90);
    const destination = target ? { x: target.x, y: target.y } : { x, y };
    this.sim.route = this.geometry.findPath({ x: this.sim.x, y: this.sim.y }, destination);
    this.sim.routeIndex = 0;
    return this.sim.route.length > 0;
  }

  interactNow(): void {
    if (!this.ready || this.state.frozen) return;
    if (this.activeMode === 'surface') {
      if (!this.tiledPlayer) return;
      this.tiledInteraction.update(this.tiledPlayer.position);
      this.tiledInteraction.interact();
    } else {
      this.tryInteractTraining();
    }
  }

  transitionThroughBlack(onCovered: () => void): void {
    if (!this.ready) {
      throw new Error('Station scene is not ready for a transition');
    }
    if (this.stationTransitionActive) {
      throw new Error('A station transition is already in progress');
    }

    this.stationTransitionActive = true;
    const cover = this.add
      .rectangle(0, 0, 1, 1, 0x000000)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100_000);
    const progress = { value: 0 };
    const updateCover = (): void => {
      const { width, height } = this.scale;
      cover
        .setSize(width, height)
        .setPosition(width / 2, height * (1.5 - progress.value));
    };
    const animate = (target: number, onComplete: () => void): void => {
      this.tweens.add({
        targets: progress,
        value: target,
        duration: this.reducedMotion ? 1 : 550,
        ease: 'Linear',
        onUpdate: updateCover,
        onComplete,
      });
    };

    updateCover();
    animate(1, () => {
      try {
        onCovered();
      } finally {
        animate(2, () => {
          cover.destroy();
          this.stationTransitionActive = false;
        });
      }
    });
  }

  private resolveMapDef(state: SceneGameState): MapDefinition {
    return state.mapId === 'surface' && state.destination
      ? surfaceHabitatFor(state.destination)
      : MAPS[state.mapId];
  }

  private applyState(next: SceneGameState, respawn: boolean): void {
    console.info('apply-debug', {
      activeMode: this.activeMode,
      mapId: next.mapId,
      frozen: next.frozen,
      player: Boolean(this.tiledPlayer),
      grid: Boolean(this.tiledGrid),
      map: Boolean(this.tiledMap),
    });
    const modeChanged = this.activeMode !== next.mapId;
    const destinationChanged = next.mapId === 'surface' && next.destination !== this.state.destination;
    const prevActiveKey = [...this.state.activeInteractions].sort().join(',');
    const nextActiveKey = [...next.activeInteractions].sort().join(',');
    const prevDoneKey = [...this.state.completedInteractions].sort().join(',');
    const nextDoneKey = [...next.completedInteractions].sort().join(',');

    this.state = next;
    this.map = this.resolveMapDef(next);

    if (next.mapId === 'surface') {
      if (modeChanged || destinationChanged || !this.tiledMap || !this.tiledPlayer || !this.tiledGrid) {
        this.teardownTraining();
        this.buildSurface();
      } else if (this.tiledPlayer) {
        this.tiledPlayer.setAppearance(textureKeyForArt(next.playerArt), next.playerName, Boolean(next.helmet));
        this.tiledPlayer.speedMultiplier = next.speed;
        this.tiledPlayer.canMove = !next.frozen;
        this.tiledPlayer.reducedMotion = this.reducedMotion;
        if (respawn) {
          this.tiledRoute = [];
          this.tiledPlayer.stop();
          const position = this.safeSurfacePosition(next.x, next.y);
          this.tiledPlayer.setPosition(position.x, position.y);
          this.followerCamera?.snap();
        }
      }
      if (prevActiveKey !== nextActiveKey || prevDoneKey !== nextDoneKey || modeChanged || destinationChanged) {
        this.syncSurfaceStations();
      }
      this.emitSurfacePrompt(true);
      this.emitSurfaceRoom(true);
      return;
    }

    // Training Deck path
    if (modeChanged || destinationChanged || !this.geometry || !this.playerRoot) {
      this.teardownSurface();
      this.sim = createPlayerState(next.x || this.map.spawn.x, next.y || this.map.spawn.y);
      this.camTargetX = this.sim.x;
      this.camTargetY = this.sim.y;
      this.camSnap = true;
      this.buildTrainingMap();
      this.createTrainingPlayer();
      this.activeMode = 'training';
    } else if (respawn) {
      this.sim.x = next.x;
      this.sim.y = next.y;
      this.sim.prevX = next.x;
      this.sim.prevY = next.y;
      this.sim.route = [];
      this.sim.routeIndex = 0;
      this.camTargetX = next.x;
      this.camTargetY = next.y;
      this.camSnap = true;
    }
    if (next.frozen) {
      this.sim.route = [];
      this.sim.routeIndex = 0;
    }
    if (!modeChanged && this.playerRoot && this.trainingPlayerSkinChanged(next)) {
      this.createTrainingPlayer();
    }
    this.syncTrainingPlayerAnimation();
    this.playerRoot?.setAlpha(next.frozen ? 0.72 : 1);
    this.createTrainingMarkers();
    this.promptKey = '';
    this.updateTrainingPrompt(true);
    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);
  }

  update(time: number, deltaMs: number): void {
    if (!this.ready) return;

    const now = performance.now();
    if (now - this.lastFpsEvent >= 320) {
      this.lastFpsEvent = now;
      this.onEvent({ type: 'fps', fps: Math.max(1, Math.round(this.game.loop.actualFps)) });
    }

    if (this.activeMode === 'surface') {
      this.updateSurface(deltaMs, now);
    } else if (this.activeMode === 'training') {
      this.updateTraining(time, deltaMs, now);
    }
  }

  // ---------------------------------------------------------------------------
  // Surface Station (Merged Tiled Map + Arcade Physics + FollowerCamera)
  // ---------------------------------------------------------------------------

  private buildSurface(): void {
    this.teardownSurface();
    this.activeMode = 'surface';

    const mars = this.state.destination === 'mars';
    this.cameras.main.setBackgroundColor(mars ? '#17100f' : '#080d18');
    this.cameras.main.setZoom(CAMERA.zoom);

    const loader = new MapLoader(this, MapKeys.station);
    this.tiledMap = loader.load({
      artTint: mars ? 0xffeae0 : undefined,
    });

    const m = this.tiledMap.minimap;
    this.tiledGrid = gridFromTiles(m.cols, m.rows, m.walls);

    const bounds = this.tiledMap.bounds;
    this.physics.world.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);

    const start = this.safeSurfacePosition(this.state.x, this.state.y);
    this.tiledPlayer = new Player(
      this,
      start.x,
      start.y,
      this.state.playerName,
      textureKeyForArt(this.state.playerArt),
      Boolean(this.state.helmet),
    );
    this.tiledPlayer.speedMultiplier = this.state.speed;
    this.tiledPlayer.canMove = !this.state.frozen;
    this.tiledPlayer.reducedMotion = this.reducedMotion;

    this.wallCollider = this.physics.add.collider(this.tiledPlayer.sprite, this.tiledMap.wallLayer);

    this.followerCamera = new FollowerCamera(this);
    this.followerCamera.setTarget(this.tiledPlayer.position);
    this.followerCamera.setBounds(bounds);
    this.followerCamera.setReducedMotion(this.reducedMotion);
    this.followerCamera.snap();

    this.spawnSurfaceStations();
    this.spawnSurfaceCrew();

    this.lastEmittedRoom = '';
    this.promptKey = '';
  }

  private teardownSurface(): void {
    this.wallCollider?.destroy();
    this.wallCollider = undefined;
    this.tiledPlayer?.destroy();
    this.tiledPlayer = undefined;
    this.followerCamera = undefined;
    for (const st of this.tiledStations) st.destroy();
    this.tiledStations.length = 0;
    for (const npc of this.tiledCrew) npc.destroy();
    this.tiledCrew.length = 0;
    if (this.tiledMap) {
      this.tiledMap.spawn.destroy();
      for (const image of this.tiledMap.depthArtwork) image.destroy();
      this.tiledMap.artImage.destroy();
      this.tiledMap.floorLayer.destroy();
      this.tiledMap.wallLayer.destroy();
      this.tiledMap.overheadLayer.destroy();
      this.tiledMap.map.destroy();
      this.tiledMap = undefined;
    }
    this.tiledGrid = undefined;
    this.tiledRoute = [];
    this.tiledInteraction.clear();
  }

  private spawnSurfaceStations(): void {
    const activeSet = new Set(this.state.activeInteractions);
    const doneSet = new Set(this.state.completedInteractions);
    for (const task of SURFACE_HABITAT.interactions) {
      const accent = task.accent
        ? Phaser.Display.Color.HexStringToColor(task.accent).color
        : 0xf5c451;
      const station = new TaskStation(this, task.x - 28, task.y - 32, 56, 64, {
        id: task.id,
        name: task.name,
        roomName: getRoomName(task.roomId),
        accent,
        target: this.findSurfaceTaskTarget(task.x, task.y),
        outlineSpec: TASK_OBJECT_OUTLINE_SPECS[task.id],
        assigned: activeSet.has(task.id),
        completed: doneSet.has(task.id),
        onTrigger: (taskId) => this.handleSurfaceTaskInteract(taskId),
      });
      this.tiledStations.push(station);
      this.tiledInteraction.register(station);
    }
  }

  private findSurfaceTaskTarget(x: number, y: number): Phaser.GameObjects.Image | undefined {
    let target: Phaser.GameObjects.Image | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const artwork of this.tiledMap?.depthArtwork ?? []) {
      if (!(artwork instanceof Phaser.GameObjects.Image)) continue;
      const name = artwork.name.toLowerCase();
      const textureKey = artwork.texture.key.toLowerCase();
      if (
        name.startsWith('wall ')
        || name.includes('occluder')
        || name.startsWith('flat ')
        || textureKey.startsWith('shadow-')
        || textureKey.includes('decals')
      ) {
        continue;
      }

      const bounds = artwork.getBounds();
      const dx = Math.max(bounds.left - x, 0, x - bounds.right);
      const dy = Math.max(bounds.top - y, 0, y - bounds.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance < nearestDistance) {
        target = artwork;
        nearestDistance = distance;
      }
    }
    return target;
  }

  private syncSurfaceStations(): void {
    const activeSet = new Set(this.state.activeInteractions);
    const doneSet = new Set(this.state.completedInteractions);
    for (const station of this.tiledStations) {
      station.setState(activeSet.has(station.id), doneSet.has(station.id));
    }
  }

  private spawnSurfaceCrew(): void {
    if (!this.tiledMap) return;
    const textureById: Record<string, string> = {
      russet: AssetKeys.crewRepairman,
      pip: AssetKeys.crewFarmer,
      tater: AssetKeys.crewResearcher,
    };
    for (const member of this.map.crew) {
      const npc = new CrewNPC(
        this,
        textureById[member.id] ?? AssetKeys.crewFarmer,
        member.x,
        member.y,
        {
          id: member.id,
          label: member.name,
          role: member.role,
          accent: member.accent,
          lines: member.lines,
          reducedMotion: this.reducedMotion,
          home: { x: member.x, y: member.y },
          wanderRadius: 150,
          findPath: (from, to) => this.findSurfacePath(from, to),
          onTalk: (crew) => {
            if (!this.state.frozen) {
              this.onEvent({ type: 'crew', crewId: crew.id, name: crew.name, lines: crew.lines });
            }
          },
        },
      );
      this.tiledCrew.push(npc);
      this.tiledInteraction.register(npc);
    }

    // Add an extra ambient station specialist in Comms Dome
    const commsHome = this.roomWalkTarget('Comms Dome');
    if (commsHome) {
      const chip = new CrewNPC(this, AssetKeys.crewResearcher, commsHome.x, commsHome.y, {
        id: 'chip',
        label: 'Chip',
        role: 'Comms Tech',
        accent: '#a9b6ff',
        lines: ['Deep-space telemetry link is locked. Keep the dish aligned when solar weather hits.'],
        home: commsHome,
        wanderRadius: 140,
        findPath: (from, to) => this.findSurfacePath(from, to),
        onTalk: (crew) => {
          if (!this.state.frozen) {
            this.onEvent({ type: 'crew', crewId: crew.id, name: crew.name, lines: crew.lines });
          }
        },
      });
      this.tiledCrew.push(chip);
      this.tiledInteraction.register(chip);
    }
  }

  private handleSurfaceTaskInteract(taskId: string): void {
    if (this.state.frozen) return;
    this.tiledRoute = [];
    this.onEvent({ type: 'interact', interactionId: taskId, kind: 'task' });
  }

  private findSurfacePath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    feetOffsetY = 0,
  ): { x: number; y: number }[] | null {
    if (!this.tiledMap || !this.tiledGrid) return null;
    const ts = this.tiledMap.minimap.tileSize;
    const startTile = nearestWalkableTile(this.tiledGrid, tileAtPixel({ x: from.x, y: from.y + feetOffsetY }, ts));
    const goalTile = nearestWalkableTile(this.tiledGrid, tileAtPixel(to, ts));
    if (!startTile || !goalTile) return null;
    const tiles = findPath(this.tiledGrid, startTile, goalTile);
    if (!tiles) return null;
    const compressed = compressPath(tiles);
    const half = ts / 2;
    return compressed.map((t) => ({ x: t.x * ts + half, y: t.y * ts + half - feetOffsetY }));
  }

  private safeSurfacePosition(x: number, y: number): { x: number; y: number } {
    const map = this.tiledMap!;
    const grid = this.tiledGrid!;
    const size = map.minimap.tileSize;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: map.spawn.x, y: map.spawn.y };
    const feet = { x, y: y + PLAYER_FEET.offsetY };
    if (hasTileClearance(grid, size, feet, PLAYER_FEET.width, PLAYER_FEET.height)) return { x, y };
    const tile = nearestWalkableTile(grid, tileAtPixel(feet, size));
    return tile
      ? { x: (tile.x + 0.5) * size, y: (tile.y + 0.5) * size - PLAYER_FEET.offsetY }
      : { x: map.spawn.x, y: map.spawn.y };
  }

  private roomWalkTarget(roomName: string): { x: number; y: number } | null {
    if (!this.tiledMap || !this.tiledGrid) return null;
    const m = this.tiledMap.minimap;
    const room = m.rooms.find((r) => r.name === roomName);
    if (!room) return null;
    const center = tileAtPixel(
      { x: room.bounds.x + room.bounds.width / 2, y: room.bounds.y + room.bounds.height / 2 },
      m.tileSize,
    );
    const found = nearestWalkableTile(this.tiledGrid, center);
    if (!found) return null;
    const half = m.tileSize / 2;
    return { x: found.x * m.tileSize + half, y: found.y * m.tileSize + half };
  }

  private routeSurfaceTo(x: number, y: number): boolean {
    if (!this.tiledPlayer) return false;
    // Align with the starting tile before following the route around walls.
    this.tiledRoute = this.findSurfacePath(this.tiledPlayer.position, { x, y }, PLAYER_FEET.offsetY) ?? [];
    this.routeProgress = undefined;
    this.tiledPlayer.stop();
    return this.tiledRoute.length > 0;
  }

  private updateSurface(deltaMs: number, now: number): void {
    if (!this.tiledInput || !this.tiledPlayer || !this.followerCamera || !this.tiledMap) return;

    this.tiledInput.update();
    const move = this.tiledInput.getMoveVector();
    const freeCam = this.tiledInput.isShiftDown() && !this.state.frozen;

    if (this.tiledInput.justPressed('interact') && !this.state.frozen) {
      this.interactNow();
    }
    if (this.tiledInput.justPressed('snapCamera')) {
      this.followerCamera.snap();
    }
    if (this.tiledInput.justPressed('demoPan') && !this.state.frozen) {
      this.followerCamera.panTo(
        this.tiledMap.bounds.width / 2,
        this.tiledMap.bounds.height / 2,
        DEMO_PAN_DURATION,
      );
    }

    if (this.state.frozen) {
      this.tiledRoute = [];
      this.tiledPlayer.stop();
    } else if (freeCam) {
      this.tiledRoute = [];
      this.tiledPlayer.stop();
      const step = DEBUG_PAN_SPEED * (deltaMs / 1000);
      this.followerCamera.debugPanBy(move.x * step, move.y * step);
    } else if (move.x !== 0 || move.y !== 0) {
      this.tiledRoute = [];
      if (this.followerCamera.isPanning()) {
        this.followerCamera.cancelPan();
      }
      this.tiledPlayer.applyInput(move);
    } else if (this.tiledRoute.length > 0) {
      const next = this.tiledRoute[0];
      const { x, y } = this.tiledPlayer.position;
      const dx = next.x - x;
      const dy = next.y - y;
      if (Math.hypot(dx, dy) <= 6) {
        this.tiledRoute.shift();
        this.routeProgress = undefined;
        this.tiledPlayer.setPosition(next.x, next.y);
        this.tiledPlayer.stop();
      } else {
        const previous = this.routeProgress;
        const stalledMs = previous && Math.hypot(x - previous.x, y - previous.y) < 0.1
          ? previous.stalledMs + deltaMs : 0;
        this.routeProgress = { x, y, stalledMs };
        if (stalledMs >= 750) {
          this.tiledRoute = [];
          this.tiledPlayer.stop();
          this.onEvent({ type: 'route-blocked' });
        } else {
          this.tiledPlayer.applyInput({ x: dx, y: dy });
        }
      }
    } else {
      this.tiledPlayer.stop();
    }

    this.tiledInteraction.update(this.tiledPlayer.position);
    this.tiledPlayer.preUpdate(deltaMs);

    if (!freeCam) {
      this.followerCamera.update(deltaMs);
    }

    for (const member of this.tiledCrew) {
      member.preUpdate();
    }

    this.emitSurfacePrompt(false);
    this.emitSurfaceRoom(false, now);
  }

  private surfaceRoomName(x: number, y: number): string {
    if (!this.tiledMap) return 'Central Hub';
    return roomAt(this.tiledMap.rooms, { x, y }) ?? 'Station Corridor';
  }

  private emitSurfaceRoom(force: boolean, now = performance.now()): void {
    if (!this.tiledPlayer) return;
    const pos = this.tiledPlayer.position;
    const room = this.surfaceRoomName(pos.x, pos.y);
    if (force || room !== this.lastEmittedRoom || now - this.lastMoveEvent > 140) {
      this.lastMoveEvent = now;
      this.lastEmittedRoom = room;
      this.onEvent({ type: 'move', x: pos.x, y: pos.y, room });
    }
  }

  private emitSurfacePrompt(force: boolean): void {
    if (!this.tiledPlayer) return;
    const nearest = this.tiledInteraction.getNearest();
    const room = this.surfaceRoomName(this.tiledPlayer.position.x, this.tiledPlayer.position.y);
    const key = `${nearest?.id ?? ''}:${nearest?.kind ?? ''}:${room}`;
    if (!force && key === this.promptKey) return;
    this.promptKey = key;
    this.onEvent({
      type: 'prompt',
      interactionId: nearest?.id ?? null,
      name: nearest?.promptText ?? '',
      kind: nearest?.kind ?? '',
      room,
    });
  }

  // ---------------------------------------------------------------------------
  // Training Deck (Earth Simulator procedural canvas)
  // ---------------------------------------------------------------------------

  private updateTraining(time: number, deltaMs: number, now: number): void {
    if (!this.playerRoot || !this.geometry) return;
    const delta = Math.min(MOVEMENT.maxFrameDelta, deltaMs / 1000);
    const input: InputSnapshot = this.state.frozen
      ? { axisX: 0, axisY: 0, moveRequest: null }
      : this.readTrainingInput();

    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= MOVEMENT.fixedStep && steps < 8) {
      stepPlayer(this.sim, input, MOVEMENT.fixedStep, MOVEMENT.baseSpeed * this.state.speed, this.canStand);
      this.accumulator -= MOVEMENT.fixedStep;
      steps += 1;
    }
    if (steps === 0) {
      this.sim.prevX = this.sim.x;
      this.sim.prevY = this.sim.y;
    }

    const alpha = Math.min(1, this.accumulator / MOVEMENT.fixedStep);
    const renderX = lerp(this.sim.prevX, this.sim.x, alpha);
    const renderY = lerp(this.sim.prevY, this.sim.y, alpha);
    this.playerRoot.setPosition(renderX, renderY);
    this.syncTrainingPlayerAnimation();
    if (this.playerBody) {
      const bob = !this.trainingPlayerSprite && this.sim.moving && !this.reducedMotion
        ? Math.sin(time * 0.022) * 2.2
        : 0;
      this.playerBody.setScale(this.sim.facing, 1);
      this.playerBody.y = bob;
    }

    this.updateTrainingCamera(renderX, renderY, delta);
    this.updateTrainingCrew(time);
    this.updateTrainingPrompt(false);

    const room = this.geometry.roomAt(this.sim.x, this.sim.y)?.name ?? 'Main Corridor';
    if (room !== this.lastEmittedRoom || now - this.lastMoveEvent > 140) {
      this.lastMoveEvent = now;
      this.lastEmittedRoom = room;
      this.onEvent({ type: 'move', x: this.sim.x, y: this.sim.y, room });
    }
  }

  private canStand = (x: number, y: number): boolean => (
    this.geometry?.canStand(x, y, MOVEMENT.bodyHalfWidth, MOVEMENT.bodyHalfHeight) ?? false
  );

  private readTrainingInput(): InputSnapshot {
    const keys = this.keys;
    const tag = document.activeElement?.tagName;
    if (!keys || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return { axisX: 0, axisY: 0, moveRequest: null };
    }
    const axisX = Number(keys.D?.isDown || keys.RIGHT?.isDown) - Number(keys.A?.isDown || keys.LEFT?.isDown);
    const axisY = Number(keys.S?.isDown || keys.DOWN?.isDown) - Number(keys.W?.isDown || keys.UP?.isDown);
    return { axisX, axisY, moveRequest: null };
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (this.state.frozen) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (this.activeMode === 'surface') {
      this.routeSurfaceTo(world.x, world.y);
      return;
    }
    if (!this.geometry) return;
    const target = this.nearestTrainingInteraction(world.x, world.y, 130);
    const destination = target ? { x: target.x, y: target.y } : { x: world.x, y: world.y };
    this.sim.route = this.geometry.findPath({ x: this.sim.x, y: this.sim.y }, destination);
    this.sim.routeIndex = 0;
  }

  private updateTrainingCamera(x: number, y: number, delta: number): void {
    const deadX = CAMERA.deadzoneX;
    const deadY = CAMERA.deadzoneY;
    if (x < this.camTargetX - deadX) this.camTargetX = x + deadX;
    else if (x > this.camTargetX + deadX) this.camTargetX = x - deadX;
    if (y < this.camTargetY - deadY) this.camTargetY = y + deadY;
    else if (y > this.camTargetY + deadY) this.camTargetY = y - deadY;

    const zoom = CAMERA.zoom;
    const halfW = this.cameras.main.width / (2 * zoom);
    const halfH = this.cameras.main.height / (2 * zoom);
    const maxX = Math.max(0, this.map.width - halfW * 2);
    const maxY = Math.max(0, this.map.height - halfH * 2);
    const targetScrollX = Phaser.Math.Clamp(this.camTargetX - halfW, 0, maxX);
    const targetScrollY = Phaser.Math.Clamp(this.camTargetY - halfH, 0, maxY);

    if (this.camSnap || this.reducedMotion) {
      this.cameras.main.setScroll(targetScrollX, targetScrollY);
      this.camSnap = false;
    } else {
      const t = 1 - Math.exp(-CAMERA.smoothing * delta);
      this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetScrollX, t);
      this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, targetScrollY, t);
    }
  }

  private updateTrainingCrew(time: number): void {
    if (!this.crewLayer) return;
    for (const child of this.crewLayer.getAll()) {
      if (!(child instanceof Phaser.GameObjects.Container)) continue;
      if (child.getData('animated') === true) continue;
      const offset = Number(child.getData('offset') ?? 0);
      if (this.reducedMotion) continue;
      child.y = Number(child.getData('baseY') ?? child.y) + Math.sin(time * 0.002 + offset) * 2;
    }
  }

  private nearestTrainingInteraction(
    x: number,
    y: number,
    range: number,
  ): { id: string; name: string; kind: string; x: number; y: number } | null {
    const active = new Set(this.state.activeInteractions);
    let best: { id: string; name: string; kind: string; x: number; y: number } | null = null;
    let bestDistance = range;
    for (const interaction of this.map.interactions) {
      if (!active.has(interaction.id)) continue;
      const distance = Math.hypot(x - interaction.x, y - interaction.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { id: interaction.id, name: interaction.name, kind: interaction.kind, x: interaction.x, y: interaction.y };
      }
    }
    for (const crew of this.map.crew) {
      const distance = Math.hypot(x - crew.x, y - crew.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { id: crew.id, name: crew.name, kind: 'crew', x: crew.x, y: crew.y };
      }
    }
    return best;
  }

  private updateTrainingPrompt(force: boolean): void {
    if (!this.geometry) return;
    const nearest = this.nearestTrainingInteraction(this.sim.x, this.sim.y, MOVEMENT.interactionRange);
    const room = this.geometry.roomAt(this.sim.x, this.sim.y)?.name ?? 'Main Corridor';
    const key = `${nearest?.id ?? ''}:${nearest?.kind ?? ''}:${room}`;
    if (!force && key === this.promptKey) return;
    this.promptKey = key;
    const detail = nearest
      ? nearest.kind === 'crew'
        ? this.map.crew.find((crew) => crew.id === nearest.id)
        : this.map.interactions.find((interaction) => interaction.id === nearest.id)
      : undefined;
    const displayName = nearest
      ? nearest.kind === 'crew'
        ? `${nearest.name} · ${(detail as { role?: string } | undefined)?.role ?? 'Crew'}`
        : nearest.name
      : '';
    this.onEvent({
      type: 'prompt',
      interactionId: nearest?.id ?? null,
      name: displayName,
      kind: nearest?.kind ?? '',
      room,
    });
  }

  private tryInteractTraining(): void {
    if (this.state.frozen) return;
    const nearest = this.nearestTrainingInteraction(this.sim.x, this.sim.y, MOVEMENT.interactionRange);
    if (!nearest) return;
    if (nearest.kind === 'crew') {
      const crew = this.map.crew.find((item) => item.id === nearest.id);
      if (crew) this.onEvent({ type: 'crew', crewId: crew.id, name: crew.name, lines: crew.lines });
      return;
    }
    this.onEvent({ type: 'interact', interactionId: nearest.id, kind: nearest.kind });
  }

  private teardownTraining(): void {
    this.mapLayer?.destroy(true);
    this.mapLayer = undefined;
    this.markerLayer?.destroy(true);
    this.markerLayer = undefined;
    this.crewLayer?.destroy(true);
    this.crewLayer = undefined;
    this.trainingCrewSprites.length = 0;
    this.playerRoot?.destroy(true);
    this.playerRoot = undefined;
    this.playerBody = undefined;
    this.trainingPlayerSprite = undefined;
    this.geometry = undefined;
  }

  private buildTrainingMap(): void {
    this.teardownTraining();
    this.cameras.main.setBackgroundColor('#03060c');
    this.cameras.main.setZoom(CAMERA.zoom);

    this.geometry = new MapGeometry(this.map, MOVEMENT.bodyHalfWidth, MOVEMENT.bodyHalfHeight, 25);
    this.mapLayer = this.add.container(0, 0).setDepth(0);
    this.markerLayer = this.add.container(0, 0).setDepth(25);
    this.crewLayer = this.add.container(0, 0).setDepth(12);

    const background = this.add.rectangle(0, 0, this.map.width, this.map.height, this.map.palette.void, 1).setOrigin(0, 0);
    this.mapLayer.add(background);

    const stars = this.add.graphics();
    this.mapLayer.add(stars);
    for (let index = 0; index < 220; index += 1) {
      const x = (index * 193) % this.map.width;
      const y = (index * 317) % this.map.height;
      stars.fillStyle(index % 7 === 0 ? 0x84b7d9 : 0xffffff, index % 5 === 0 ? 0.3 : 0.16);
      stars.fillCircle(x, y, index % 13 === 0 ? 2 : 1);
    }

    const floor = this.add.graphics();
    this.mapLayer.add(floor);
    for (const corridor of this.map.corridors) {
      floor.fillStyle(this.map.palette.floorAlt, 1);
      floor.fillRoundedRect(corridor.x, corridor.y, corridor.w, corridor.h, 14);
    }
    for (const room of this.map.rooms) {
      floor.fillStyle(room.tint, 1);
      floor.fillRoundedRect(room.x, room.y, room.w, room.h, 20);
      floor.fillStyle(Phaser.Display.Color.ValueToColor(room.tint).darken(18).color, 1);
      floor.fillRoundedRect(room.x + 12, room.y + 12, room.w - 24, room.h - 24, 14);
    }

    const grid = this.add.graphics();
    this.mapLayer.add(grid);
    grid.lineStyle(1, this.map.palette.line, 0.32);
    for (const room of this.map.rooms) {
      for (let x = room.x + 50; x < room.x + room.w; x += 50) {
        grid.lineBetween(x, room.y + 14, x, room.y + room.h - 14);
      }
      for (let y = room.y + 50; y < room.y + room.h; y += 50) {
        grid.lineBetween(room.x + 14, y, room.x + room.w - 14, y);
      }
    }

    const walls = this.add.graphics();
    this.mapLayer.add(walls);
    walls.lineStyle(4, this.map.palette.wall, 0.82);
    for (const segment of this.geometry.seamSegments()) {
      walls.lineBetween(segment.ax, segment.ay, segment.bx, segment.by);
    }
    walls.lineStyle(1, 0xffffff, 0.16);
    for (const segment of this.geometry.seamSegments()) {
      walls.lineBetween(segment.ax, segment.ay, segment.bx, segment.by);
    }

    for (const room of this.map.rooms) {
      const label = this.add.text(room.x + 20, room.y + 16, `${room.icon}  ${room.name.toUpperCase()}`, {
        color: room.accent,
        fontFamily: 'Consolas, monospace',
        fontSize: '13px',
        fontStyle: 'bold',
      }).setAlpha(0.92);
      this.mapLayer.add(label);
    }

    const props = this.add.graphics();
    this.mapLayer.add(props);
    for (const prop of this.map.props) this.drawTrainingProp(props, prop);

    this.createTrainingMarkers();
    this.createTrainingCrew();
  }

  private drawTrainingProp(graphics: Phaser.GameObjects.Graphics, prop: PropDef): void {
    const tint = prop.tint ?? 0x4a5f74;
    switch (prop.kind) {
      case 'console':
        graphics.fillStyle(tint, 1).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        graphics.fillStyle(0x7ad7ea, 0.32).fillRoundedRect(prop.x + 8, prop.y + 8, prop.w - 16, prop.h - 22, 4);
        graphics.lineStyle(2, 0x9fc5d8, 0.5).strokeRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        break;
      case 'table':
        graphics.fillStyle(0x101a26, 0.5).fillEllipse(prop.x + prop.w / 2, prop.y + prop.h + 8, prop.w, 20);
        graphics.fillStyle(tint, 1).fillEllipse(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w, prop.h);
        graphics.lineStyle(2, 0xd8b06a, 0.4).strokeEllipse(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w, prop.h);
        break;
      case 'crate':
        graphics.fillStyle(tint, 1).fillRect(prop.x, prop.y, prop.w, prop.h);
        graphics.lineStyle(2, 0xc9a56a, 0.55).strokeRect(prop.x, prop.y, prop.w, prop.h);
        graphics.lineBetween(prop.x, prop.y, prop.x + prop.w, prop.y + prop.h);
        graphics.lineBetween(prop.x + prop.w, prop.y, prop.x, prop.y + prop.h);
        break;
      case 'planter':
        graphics.fillStyle(0x2f4324, 1).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        graphics.fillStyle(tint, 0.9).fillRoundedRect(prop.x + 6, prop.y + 6, prop.w - 12, prop.h - 12, 6);
        break;
      case 'tank':
        graphics.fillStyle(tint, 0.5).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, prop.w / 2);
        graphics.lineStyle(2, 0xcff6ff, 0.55).strokeRoundedRect(prop.x, prop.y, prop.w, prop.h, prop.w / 2);
        break;
      case 'window': {
        graphics.fillStyle(0x07111f, 0.98).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        if (this.textures.exists('planet-earth')) {
          const size = Math.max(16, Math.min(prop.h - 8, prop.w - 12));
          const planet = this.add.image(prop.x + prop.w / 2, prop.y + prop.h / 2, 'planet-earth')
            .setDisplaySize(size, size).setAlpha(0.9);
          this.mapLayer?.add(planet);
        }
        break;
      }
      case 'airlock':
        graphics.fillStyle(0x182838, 1).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        graphics.lineStyle(4, tint, 0.95).strokeRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        break;
      default:
        graphics.fillStyle(tint, 1).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        break;
    }
  }

  private createTrainingMarkers(): void {
    if (!this.markerLayer) return;
    this.markerLayer.removeAll(true);
    const active = new Set(this.state.activeInteractions);
    const done = new Set(this.state.completedInteractions);
    for (const interaction of this.map.interactions) {
      if (!active.has(interaction.id) && !done.has(interaction.id)) continue;
      const complete = done.has(interaction.id);
      const container = this.add.container(interaction.x, interaction.y);
      const ring = this.add.circle(0, 0, 24, 0x0b1420, 0.92)
        .setStrokeStyle(complete ? 2 : 3, complete ? 0x66d98d : (interaction.accent ? Phaser.Display.Color.HexStringToColor(interaction.accent).color : 0xf5c451), 0.95);
      container.add(ring);
      const iconKey = `icon-${interaction.icon}`;
      if (this.textures.exists(iconKey)) {
        const icon = this.add.image(0, 0, iconKey).setDisplaySize(22, 22);
        if (complete) icon.setTint(0x66d98d);
        container.add(icon);
      } else {
        const glyph = this.add.text(0, 0, ICON_GLYPHS[interaction.icon] ?? '◆', {
          color: complete ? '#66d98d' : (interaction.accent ?? '#f5c451'),
          fontFamily: 'Consolas, monospace',
          fontSize: '15px',
        }).setOrigin(0.5);
        container.add(glyph);
      }
      const label = this.add.text(0, 32, interaction.name.toUpperCase(), {
        color: complete ? '#9fc9ac' : '#e7dcc0',
        fontFamily: 'Consolas, monospace',
        fontSize: '9px',
        fontStyle: 'bold',
        backgroundColor: 'rgba(4,8,14,0.72)',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setAlpha(complete ? 0.6 : 1);
      container.add(label);
      this.markerLayer.add(container);
    }
  }

  private createTrainingCrew(): void {
    if (!this.crewLayer) return;
    this.crewLayer.removeAll(true);
    this.trainingCrewSprites.length = 0;
    this.map.crew.forEach((crew, index) => {
      const root = this.add.container(crew.x, crew.y);
      root.setData('baseY', crew.y);
      root.setData('offset', index * 1.7);
      const body = this.add.container(0, 0);
      const key = textureKeyForArt(crew.art);
      const visual = resolveCharacterVisual({
        baseTextureKey: key,
        moving: false,
        helmeted: false,
        reducedMotion: this.reducedMotion,
      });
      const animated = Boolean(visual && this.textures.exists(visual.textureKey));
      root.setData('animated', animated);

      if (animated && visual) {
        const sprite = this.add.sprite(0, -32, visual.textureKey)
          .setOrigin(SPRITE_ORIGIN_X, SPRITE_ORIGIN_Y)
          .setDisplaySize(SPRITE_CREW_DISPLAY_WIDTH, SPRITE_CREW_DISPLAY_HEIGHT);
        body.add(sprite);
        this.trainingCrewSprites.push({ sprite, baseTextureKey: key });
      } else if (this.textures.exists(key)) {
        body.add(this.add.image(0, -38, key).setDisplaySize(46, 56).setOrigin(0.5, 0.5));
      } else {
        body.add(this.add.ellipse(0, -32, 44, 56, colorHex('green'), 1));
      }
      body.setScale(crew.facing, 1);
      root.add(body);
      root.add(this.add.text(0, animated ? -82 : -74, crew.name.toUpperCase(), {
        color: '#dce7f5',
        fontFamily: 'Consolas, monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        backgroundColor: 'rgba(4,8,14,0.62)',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5));
      root.add(this.add.text(0, animated ? -70 : -62, crew.role.toUpperCase(), {
        color: crew.accent,
        fontFamily: 'Consolas, monospace',
        fontSize: '8px',
      }).setOrigin(0.5));
      this.crewLayer?.add(root);
    });
    this.syncTrainingCrewAnimations();
  }

  private createTrainingPlayer(): void {
    this.playerRoot?.destroy(true);
    this.trainingPlayerSprite = undefined;
    const color = colorHex(this.state.colorId);
    const root = this.add.container(this.sim.x, this.sim.y).setDepth(30);
    const body = this.add.container(0, 0);
    const key = textureKeyForArt(this.state.playerArt);
    const helmeted = Boolean(this.state.helmet);
    const visual = resolveCharacterVisual({
      baseTextureKey: key,
      moving: this.sim.moving,
      helmeted,
      reducedMotion: this.reducedMotion,
    });
    const animated = Boolean(visual && this.textures.exists(visual.textureKey));

    body.add(this.add.ellipse(0, 4, 42, 13, 0x02060b, 0.42));
    if (animated && visual) {
      const sprite = this.add.sprite(0, -32, visual.textureKey)
        .setOrigin(SPRITE_ORIGIN_X, SPRITE_ORIGIN_Y)
        .setDisplaySize(SPRITE_DISPLAY_WIDTH, SPRITE_DISPLAY_HEIGHT);
      sprite.setData('baseTextureKey', key);
      sprite.setData('playerName', this.state.playerName);
      body.add(sprite);
      this.trainingPlayerSprite = sprite;
    } else if (this.textures.exists(key)) {
      body.add(this.add.image(0, -38, key).setDisplaySize(52, 64).setOrigin(0.5, 0.5));
    } else {
      body.add(this.add.ellipse(0, -30, 44, 58, color, 1));
    }
    root.add(body);
    const label = this.add.text(0, animated ? -88 : -80, this.state.playerName.toUpperCase(), {
      color: '#fff1be',
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      fontStyle: 'bold',
      backgroundColor: 'rgba(4,8,14,0.7)',
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5);
    root.add(label);
    const marker = this.add.triangle(0, animated ? -104 : -96, 0, 0, 8, 0, 4, 8, 0xf5c451, 1).setName('caret');
    root.add(marker);
    this.playerRoot = root;
    this.playerBody = body;
    this.syncTrainingPlayerAnimation();
  }

  private trainingPlayerSkinChanged(next: SceneGameState): boolean {
    const key = textureKeyForArt(next.playerArt);
    const currentKey = this.trainingPlayerSprite?.getData('baseTextureKey');
    const currentName = this.trainingPlayerSprite?.getData('playerName');
    return (hasAnimatedSprite(key) ? currentKey !== key : Boolean(this.trainingPlayerSprite))
      || (currentName !== undefined && currentName !== next.playerName);
  }

  private applyTrainingSpritePose(
    sprite: Phaser.GameObjects.Sprite,
    baseTextureKey: string,
    moving: boolean,
  ): void {
    const visual = resolveCharacterVisual({
      baseTextureKey,
      moving,
      helmeted: sprite === this.trainingPlayerSprite && Boolean(this.state.helmet),
      reducedMotion: this.reducedMotion,
    });
    if (visual) applyResolvedSpriteVisual(this, sprite, visual);
  }

  private syncTrainingPlayerAnimation(): void {
    const sprite = this.trainingPlayerSprite;
    if (!sprite || !sprite.active) return;
    const baseTextureKey = String(sprite.getData('baseTextureKey') ?? textureKeyForArt(this.state.playerArt));
    this.applyTrainingSpritePose(sprite, baseTextureKey, this.sim.moving);
  }

  private syncTrainingCrewAnimations(): void {
    for (const entry of this.trainingCrewSprites) {
      if (!entry.sprite.active) continue;
      this.applyTrainingSpritePose(entry.sprite, entry.baseTextureKey, false);
    }
  }
}

function defaultState(): SceneGameState {
  return {
    mapId: 'training',
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

/** Create the main Phaser station canvas with Arcade Physics for Tiled collision. */
export function createStationGame(parent: HTMLElement, onEvent: (event: GameEvent) => void): Phaser.Game {
  return new Phaser.Game({
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
    scene: [new StationScene(onEvent, defaultState())],
  });
}

export function configureStationGame(
  game: Phaser.Game,
  state: SceneGameState,
  options: { respawn?: boolean } = {},
): void {
  const scene = game.scene.getScene('station') as StationScene | null;
  scene?.configure(state, options);
}

export function setSceneReducedMotion(game: Phaser.Game, reduced: boolean): void {
  const scene = game.scene.getScene('station') as StationScene | null;
  scene?.setReducedMotion(reduced);
}

export function navigateStationTo(game: Phaser.Game, x: number, y: number): boolean {
  const scene = game.scene.getScene('station') as StationScene | null;
  return scene?.navigateTo(x, y) ?? false;
}

export function interactStation(game: Phaser.Game): void {
  const scene = game.scene.getScene('station') as StationScene | null;
  scene?.interactNow();
}

export function transitionStationThroughBlack(game: Phaser.Game, onCovered: () => void): void {
  const scene = game.scene.getScene('station') as StationScene | null;
  if (!scene) {
    throw new Error('Station scene is not available for a transition');
  }
  scene.transitionThroughBlack(onCovered);
}
