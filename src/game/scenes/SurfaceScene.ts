import Phaser from 'phaser';
import { isExteriorApron } from '../../app/state';
import { CAMERA } from '../../data/balance';
import type { MapDefinition } from '../../data/mapTypes';
import { surfaceHabitatFor, SURFACE_HABITAT } from '../../data/surfaceHabitat';
import { getRoomName } from '../../model';
import { AssetKeys, MapKeys, StationMapUrls } from '../assets/AssetKeys';
import { registerCharacterAnimations } from '../assets/characterSprites';
import { createPlaceholderTextures } from '../assets/PlaceholderFactory';
import { ensureColoredCharacterTextures } from '../assets/suitColorizer';
import { DEBUG_PAN_SPEED, DEMO_PAN_DURATION, DEPTH_FLOOR, PLAYER_FEET } from '../constants';
import { CREW_FEET_OFFSET_Y, CrewNPC } from '../entities/CrewNPC';
import type { Interactable } from '../entities/Interactable';
import { Player } from '../entities/Player';
import { TaskStation } from '../entities/TaskStation';
import { FollowerCamera } from '../systems/FollowerCamera';
import { InputSystem } from '../systems/InputSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import {
  collectWalkableWaypoints,
  compressPath,
  createBoundedWalkGrid,
  findPath,
  gridFromTiles,
  hasTileClearance,
  tileAtPixel,
  type WalkableGrid,
} from '../utils/pathing';
import { FIGMA_CONTACT_SHADOWS, FIGMA_LAYER_TEXTURES, TASK_OBJECT_OUTLINE_SPECS } from '../world/figmaMapLayers';
import { MapLoader, type LoadedMap } from '../world/MapLoader';
import { findRoomByName, insetRoomBounds, roomAt } from '../world/Room';
import {
  nearestWalkableTile,
  playSceneBlackTransition,
  preloadSharedCharacters,
  textureKeyForArt,
  type SceneGameState,
  type StationControllableScene,
  type StationCoordinator,
  type StationTelemetrySnapshot,
} from './sceneTypes';

/**
 * Lunar Surface Station Phaser scene (Tiled `spudnaut-station.tmj` +
 * Figma layered art, Arcade Physics collision, FollowerCamera, Y-sorted TaskStations,
 * outlined Landing Pad bulkhead/Exit Door, and room-bounded BFS-patrolling CrewNPCs).
 */
export class SurfaceScene extends Phaser.Scene implements StationControllableScene {
  private readonly coordinator: StationCoordinator;
  private state: SceneGameState;
  private map: MapDefinition;
  private ready = false;
  private pendingState: SceneGameState | null = null;
  private pendingRespawn = false;

  private lastMoveEvent = 0;
  private lastFpsEvent = 0;
  private lastEmittedRoom = '';
  private promptKey = '';

  private tiledMap?: LoadedMap;
  private tiledGrid?: WalkableGrid;
  private tiledPlayer?: Player;
  private wallCollider?: Phaser.Physics.Arcade.Collider;
  private followerCamera?: FollowerCamera;
  private tiledInput?: InputSystem;
  private readonly tiledInteraction = new InteractionSystem();
  private readonly tiledStations: TaskStation[] = [];
  private readonly tiledCrew: CrewNPC[] = [];
  private airlockOutline?: Phaser.GameObjects.Graphics;
  private airlockDoorOutline?: Phaser.GameObjects.Graphics;
  private airlockDoorTag?: Phaser.GameObjects.Text;
  private guideLine?: Phaser.GameObjects.Graphics;
  private guideShade?: Phaser.GameObjects.Graphics;
  private blackoutElement: HTMLElement | null = null;
  private lightAngle = 0;
  private guideTarget?: { x: number; y: number; color: number; manual?: boolean };
  private guidePath: { x: number; y: number }[] = [];
  private lastGuideOrigin?: { x: number; y: number };
  private transitionActive = false;

  constructor(coordinator: StationCoordinator) {
    super({ key: 'surface' });
    this.coordinator = coordinator;
    this.state = coordinator.state;
    this.map = this.resolveMapDef(coordinator.state);
  }

  preload(): void {
    this.ready = false;
    preloadSharedCharacters(this, (progress) => {
      this.coordinator.onEvent({ type: 'load-progress', progress });
    });

    if (!this.textures.exists('planet-moon')) {
      this.load.image('planet-moon', '/assets/placeholders/kenney/planets/planet05.png');
    }

    if (!this.textures.exists(AssetKeys.figmaFloorPlan)) {
      this.load.image(AssetKeys.figmaFloorPlan, StationMapUrls.floorPlan);
    }
    if (!this.textures.exists(AssetKeys.figmaObjectsSheet)) {
      this.load.image(AssetKeys.figmaObjectsSheet, StationMapUrls.objectsSheet);
    }
    if (!this.textures.exists(AssetKeys.figmaHydroponicsPlatform)) {
      this.load.image(AssetKeys.figmaHydroponicsPlatform, StationMapUrls.fallbackHydroponicsCabinet);
    }
    for (const layer of Object.values(FIGMA_LAYER_TEXTURES)) {
      if (!this.textures.exists(layer.key)) {
        this.load.image(layer.key, layer.path);
      }
    }
    for (const shadow of FIGMA_CONTACT_SHADOWS) {
      if (!this.textures.exists(shadow.key)) {
        this.load.svg(shadow.key, shadow.path);
      }
    }
    if (!this.cache.tilemap.exists(MapKeys.station)) {
      this.load.tilemapTiledJSON(MapKeys.station, StationMapUrls.tiles);
    }
  }

  create(): void {
    // Only pull legacy floor/object raster sheets if Figma canonical layers failed to load.
    const hasFigmaMaster =
      this.textures.exists(AssetKeys.figmaFloorPlan)
      && this.textures.exists(AssetKeys.figmaObjectsSheet);

    if (!hasFigmaMaster && (!this.textures.exists(AssetKeys.mapFloorImage) || !this.textures.exists(AssetKeys.mapObjectsImage))) {
      this.load.image(AssetKeys.mapFloorImage, StationMapUrls.fallbackFloor);
      this.load.image(AssetKeys.mapObjectsImage, StationMapUrls.fallbackObjects);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.scene.isActive(this.scene.key)) {
          this.finishCreate();
        }
      });
      this.load.start();
      return;
    }

    this.finishCreate();
  }

  private finishCreate(): void {
    try {
      createPlaceholderTextures(this);
      registerCharacterAnimations(this);
      this.blackoutElement = document.querySelector('#station-blackout');

      this.cameras.main.setZoom(CAMERA.zoom);
      this.cameras.main.setBackgroundColor('#080d18');

      this.tiledInput = new InputSystem(this);
      this.tiledInteraction.onSelectionChanged(() => this.emitPrompt(true));

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.ready = false;
        this.input.keyboard?.removeAllListeners();
        this.input.removeAllListeners();
        this.teardown();
      });

      this.ready = true;
      this.coordinator.onEvent({ type: 'ready' });
      if (this.pendingState) {
        const next = this.pendingState;
        const respawn = this.pendingRespawn;
        this.pendingState = null;
        this.pendingRespawn = false;
        this.applyState(next, respawn);
      } else {
        const initial = this.coordinator.state;
        const respawn = this.coordinator.respawn;
        this.coordinator.respawn = false;
        this.applyState(initial, respawn || true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to initialize habitat map.';
      this.coordinator.onEvent({ type: 'error', message });
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
    this.coordinator.reducedMotion = reduced;
    if (this.tiledPlayer) this.tiledPlayer.reducedMotion = reduced;
    for (const member of this.tiledCrew) member.setReducedMotion(reduced);
    this.followerCamera?.setReducedMotion(reduced);
  }

  navigateTo(x: number, y: number): boolean {
    if (!this.ready || this.state.frozen || this.state.blackout) return false;
    return this.routeTo(x, y);
  }

  interactNow(): void {
    if (!this.ready || this.state.frozen || !this.tiledPlayer) return;
    this.tiledInteraction.update(this.tiledPlayer.position);
    this.tiledInteraction.interact();
  }

  transitionThroughBlack(onCovered: () => void, onFinished?: () => void): void {
    if (!this.ready) {
      throw new Error('Surface scene is not ready for a transition');
    }
    if (this.transitionActive) {
      throw new Error('A station transition is already in progress');
    }
    this.transitionActive = true;
    playSceneBlackTransition(
      this,
      this.coordinator.reducedMotion,
      onCovered,
      () => {
        this.transitionActive = false;
        onFinished?.();
      },
    );
  }

  getTelemetrySnapshot(): StationTelemetrySnapshot {
    const pos = this.tiledPlayer?.position ?? { x: this.state.x, y: this.state.y };
    return {
      activeMode: 'surface',
      ready: this.ready,
      room: this.lastEmittedRoom,
      frozen: Boolean(this.state.frozen),
      player: {
        x: pos.x,
        y: pos.y,
        helmeted: Boolean(this.state.helmet),
      },
      crew: this.tiledCrew.map((npc) => npc.getTelemetry()),
      guide: this.guideTarget
        ? {
            x: this.guideTarget.x,
            y: this.guideTarget.y,
            path: this.guidePath.map((pt) => ({ x: pt.x, y: pt.y })),
            isEmergency: this.guideTarget.color === 0xff2e3d,
          }
        : null,
    };
  }

  private resolveMapDef(state: SceneGameState): MapDefinition {
    return state.destination ? surfaceHabitatFor(state.destination) : SURFACE_HABITAT;
  }

  private applyState(next: SceneGameState, respawn: boolean): void {
    const destinationChanged = next.destination !== this.state.destination;
    const guideBriefingStarted = next.spotlightGuide && !this.state.spotlightGuide;
    const prevActiveKey = [...this.state.activeInteractions].sort().join(',');
    const nextActiveKey = [...next.activeInteractions].sort().join(',');
    const prevDoneKey = [...this.state.completedInteractions].sort().join(',');
    const nextDoneKey = [...next.completedInteractions].sort().join(',');

    this.state = next;
    this.map = this.resolveMapDef(next);

    const rebuilt = destinationChanged || !this.tiledMap || !this.tiledPlayer || !this.tiledGrid;
    if (rebuilt) {
      this.buildSurface();
    } else if (this.tiledPlayer) {
      const playerTexKey = ensureColoredCharacterTextures(
        this,
        textureKeyForArt(next.playerArt),
        next.colorId,
      );
      this.tiledPlayer.setAppearance(playerTexKey, next.playerName, Boolean(next.helmet));
      this.tiledPlayer.speedMultiplier = next.speed;
      this.tiledPlayer.canMove = !next.frozen;
      this.tiledPlayer.reducedMotion = this.coordinator.reducedMotion;
      for (const member of this.tiledCrew) {
        member.setReducedMotion(this.coordinator.reducedMotion);
        member.setFrozen(next.frozen);
      }
      if (respawn) {
        this.tiledPlayer.stop();
        const position = this.safePosition(next.x, next.y);
        this.tiledPlayer.setPosition(position.x, position.y);
        this.followerCamera?.snap();
      }
    }

    if (guideBriefingStarted) this.guideTarget = undefined;
    if (prevActiveKey !== nextActiveKey || prevDoneKey !== nextDoneKey || rebuilt || guideBriefingStarted) {
      this.syncStations();
    }
    this.paintBlackout();
    this.emitPrompt(true);
    this.emitRoom(true);
  }

  update(_time: number, deltaMs: number): void {
    if (!this.ready || !this.tiledInput || !this.tiledPlayer || !this.followerCamera || !this.tiledMap) return;

    const now = performance.now();
    if (now - this.lastFpsEvent >= 320) {
      this.lastFpsEvent = now;
      this.coordinator.onEvent({ type: 'fps', fps: Math.max(1, Math.round(this.game.loop.actualFps)) });
    }

    this.tiledInput.update();
    const move = this.tiledInput.getMoveVector();
    const freeCam = this.tiledInput.isShiftDown() && !this.state.frozen && !this.state.blackout;

    if (this.tiledInput.justPressed('interact') && !this.state.frozen) {
      this.interactNow();
    }
    if (this.tiledInput.justPressed('snapCamera')) {
      this.followerCamera.snap();
    }
    if (this.tiledInput.justPressed('demoPan') && !this.state.frozen && !this.state.blackout) {
      this.followerCamera.panTo(
        this.tiledMap.bounds.width / 2,
        this.tiledMap.bounds.height / 2,
        DEMO_PAN_DURATION,
      );
    }

    if (this.state.frozen) {
      this.tiledPlayer.stop();
    } else if (freeCam) {
      this.tiledPlayer.stop();
      const step = DEBUG_PAN_SPEED * (deltaMs / 1000);
      this.followerCamera.debugPanBy(move.x * step, move.y * step);
    } else if (move.x !== 0 || move.y !== 0) {
      if (this.state.blackout) this.lightAngle = Math.atan2(move.x, -move.y) * 180 / Math.PI;
      if (this.followerCamera.isPanning()) {
        this.followerCamera.cancelPan();
      }
      this.tiledPlayer.applyInput(move);
    } else {
      this.tiledPlayer.stop();
    }

    this.updateGuideLine(now);
    this.tiledInteraction.update(this.tiledPlayer.position);
    this.tiledPlayer.preUpdate(deltaMs);

    if (!freeCam) {
      this.followerCamera.update(deltaMs);
    }
    this.paintBlackout();

    for (const member of this.tiledCrew) {
      member.preUpdate();
    }

    this.emitRoom(false, now);
    this.emitPrompt(false);
  }

  private paintBlackout(): void {
    const light = this.blackoutElement;
    if (!light || !this.tiledPlayer) return;
    light.hidden = !this.state.blackout;
    if (light.hidden) return;
    const camera = this.cameras.main;
    const { x, y } = this.tiledPlayer.position;
    const screenX = (x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2;
    const screenY = (y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2;
    light.style.setProperty('--light-x', `${100 * screenX / camera.width}%`);
    light.style.setProperty('--light-y', `${100 * screenY / camera.height}%`);
    light.style.setProperty('--light-angle', `${this.lightAngle}deg`);
  }

  private buildSurface(): void {
    this.teardown();

    this.cameras.main.setBackgroundColor('#080d18');
    this.cameras.main.setZoom(CAMERA.zoom);

    const loader = new MapLoader(this, MapKeys.station);
    this.tiledMap = loader.load({});

    const m = this.tiledMap.minimap;
    this.tiledGrid = gridFromTiles(m.cols, m.rows, m.walls);

    const bounds = this.tiledMap.bounds;
    this.physics.world.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);

    const start = this.safePosition(this.state.x, this.state.y);
    const playerTexKey = ensureColoredCharacterTextures(
      this,
      textureKeyForArt(this.state.playerArt),
      this.state.colorId,
    );
    this.tiledPlayer = new Player(
      this,
      start.x,
      start.y,
      this.state.playerName,
      playerTexKey,
      Boolean(this.state.helmet),
    );
    this.tiledPlayer.speedMultiplier = this.state.speed;
    this.tiledPlayer.canMove = !this.state.frozen;
    this.tiledPlayer.reducedMotion = this.coordinator.reducedMotion;

    this.wallCollider = this.physics.add.collider(this.tiledPlayer.sprite, this.tiledMap.wallLayer);

    this.followerCamera = new FollowerCamera(this);
    this.followerCamera.setTarget(this.tiledPlayer.position);
    this.followerCamera.setBounds(bounds);
    this.followerCamera.setReducedMotion(this.coordinator.reducedMotion);
    this.followerCamera.snap();

    this.spawnStations();
    this.spawnCrew();

    this.lastEmittedRoom = '';
    this.promptKey = '';
  }

  private teardown(): void {
    if (this.blackoutElement) this.blackoutElement.hidden = true;
    this.guideShade?.destroy();
    this.guideShade = undefined;
    this.wallCollider?.destroy();
    this.wallCollider = undefined;
    this.tiledPlayer?.destroy();
    this.tiledPlayer = undefined;
    this.followerCamera = undefined;
    this.airlockOutline?.destroy();
    this.airlockOutline = undefined;
    this.airlockDoorOutline?.destroy();
    this.airlockDoorOutline = undefined;
    this.airlockDoorTag?.destroy();
    this.airlockDoorTag = undefined;
    this.guideLine?.destroy();
    this.guideLine = undefined;
    this.guideTarget = undefined;
    this.guidePath = [];
    this.lastGuideOrigin = undefined;
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
    this.tiledInteraction.clear();
  }

  private spawnStations(): void {
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
        target: this.findTaskTarget(task.x, task.y),
        outlineSpec: TASK_OBJECT_OUTLINE_SPECS[task.id],
        assigned: activeSet.has(task.id),
        completed: doneSet.has(task.id),
        onTrigger: (taskId) => this.handleTaskInteract(taskId),
      });
      this.tiledStations.push(station);
      this.tiledInteraction.register(station);
    }
    this.spawnAirlockWallAndExit();
    this.spawnCrewBedInteractable();
  }

  private spawnCrewBedInteractable(): void {
    const scene = this;
    const bedOutline = this.add.graphics().setDepth(DEPTH_FLOOR + 3);
    const drawOutline = (highlighted: boolean): void => {
      bedOutline.clear();
      if (!highlighted) return;
      bedOutline.fillStyle(0x6fd4e6, 0.14);
      bedOutline.fillRoundedRect(130, 1518, 256, 164, 8);
      bedOutline.lineStyle(3, 0x9af1ff, 0.95);
      bedOutline.strokeRoundedRect(130, 1518, 256, 164, 8);
    };

    const crewBed: Interactable = {
      id: 'crew-bed',
      kind: 'bed',
      roomName: 'Crew Quarters',
      position: { x: 258, y: 1600 },
      bounds: { x: 130, y: 1518, width: 256, height: 164 },
      interactionRadius: 140,
      get promptText() {
        return scene.state.restAtBunk ? 'Crew Bunk · Rest Until Day 2' : 'Crew Bunk · Sleep & Skip Day (-20 All)';
      },
      enabled: true,
      onInteract: () => {
        if (this.state.frozen) return;
        this.coordinator.onEvent({ type: 'interact', interactionId: 'crew-bed', kind: 'bed' });
      },
      setHighlighted: drawOutline,
    };
    this.tiledInteraction.register(crewBed);
  }

  /**
   * Outline the Landing Pad bulkhead perimeter and south hazard Exit Door so the sealed
   * barrier is unmistakably readable and players can always trigger EVA missions outside.
   */
  private spawnAirlockWallAndExit(): void {
    const wallGfx = this.add.graphics().setDepth(DEPTH_FLOOR + 2);
    const drawBulkhead = (color: number, width: number, alpha: number): void => {
      wallGfx.lineStyle(width, color, alpha);
      wallGfx.beginPath();
      wallGfx.moveTo(1408, 1654);
      wallGfx.lineTo(1450, 1718);
      wallGfx.lineTo(1494, 1756);
      wallGfx.lineTo(1586, 1756);
      wallGfx.moveTo(1802, 1756);
      wallGfx.lineTo(1892, 1756);
      wallGfx.lineTo(1936, 1718);
      wallGfx.lineTo(1978, 1654);
      wallGfx.strokePath();
      wallGfx.strokeRect(1494, 1756, 398, 152);
    };
    drawBulkhead(0x09111b, 6, 0.9);
    drawBulkhead(0x95b2d4, 2.5, 0.92);
    this.airlockOutline = wallGfx;

    const doorGfx = this.add.graphics().setDepth(DEPTH_FLOOR + 3);
    const drawDoorOutline = (highlighted: boolean): void => {
      doorGfx.clear();
      if (highlighted) {
        doorGfx.fillStyle(0xffdc4a, 0.14);
        doorGfx.fillRoundedRect(1586, 1624, 216, 144, 6);
      }
      doorGfx.lineStyle(highlighted ? 8 : 6, 0x09111b, 0.92);
      doorGfx.strokeRoundedRect(1586, 1624, 216, 144, 6);
      doorGfx.lineStyle(highlighted ? 4 : 3, highlighted ? 0xfff59d : 0xf2a93b, 1);
      doorGfx.strokeRoundedRect(1586, 1624, 216, 144, 6);
      doorGfx.lineStyle(highlighted ? 2.5 : 2, highlighted ? 0xfff59d : 0xf2a93b, highlighted ? 0.9 : 0.58);
      doorGfx.lineBetween(1594, 1732, 1794, 1732);
    };
    drawDoorOutline(false);
    this.airlockDoorOutline = doorGfx;

    this.airlockDoorTag = this.add
      .text(1694, 1614, 'EVA EXIT Â· OUTER MISSIONS', {
        fontFamily: 'Consolas, monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffe49e',
        backgroundColor: 'rgba(8, 14, 34, 0.86)',
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_FLOOR + 4);

    const exitDoor: Interactable = {
      id: 'airlock-exit',
      kind: 'exit',
      roomName: 'Landing Pad',
      position: { x: 1696, y: 1712 },
      bounds: { x: 1584, y: 1624, width: 224, height: 148 },
      interactionRadius: 124,
      promptText: 'Airlock Exit Â· Go Outside (EVA Missions)',
      enabled: true,
      onInteract: () => {
        if (this.state.frozen) return;
        this.coordinator.onEvent({ type: 'interact', interactionId: 'airlock-exit', kind: 'exit' });
      },
      setHighlighted: (highlighted) => {
        drawDoorOutline(highlighted);
        this.airlockDoorTag?.setColor(highlighted ? '#ffffff' : '#ffe49e');
      },
    };
    this.tiledInteraction.register(exitDoor);
  }

  private findTaskTarget(x: number, y: number): Phaser.GameObjects.Image | undefined {
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

  private syncStations(): void {
    const activeSet = new Set(this.state.activeInteractions);
    const doneSet = new Set(this.state.completedInteractions);
    for (const station of this.tiledStations) {
      station.setState(activeSet.has(station.id), doneSet.has(station.id));
    }
    const emergency = this.map.interactions.find(
      (item) => item.id.startsWith('emergency-') && activeSet.has(item.id) && !doneSet.has(item.id),
    );
    if (emergency && !this.state.blackout) {
      if (!this.guideTarget?.manual) {
        this.guideTarget = { x: emergency.x, y: emergency.y, color: 0xff2e3d, manual: false };
        this.lastGuideOrigin = undefined;
      }
    } else if (this.guideTarget && !this.guideTarget.manual) {
      this.guideTarget = undefined;
      this.guidePath = [];
      this.lastGuideOrigin = undefined;
      this.guideLine?.clear();
    }
  }

  private spawnCrew(): void {
    if (!this.tiledMap || !this.tiledGrid) return;
    const tileSize = this.tiledMap.minimap.tileSize;
    const half = tileSize / 2;
    const stationCoords = this.map.interactions.map((item) => ({ x: item.x, y: item.y }));

    for (const member of this.map.crew) {
      const designatedRoom = member.roomId
        ? findRoomByName(this.tiledMap.rooms, getRoomName(member.roomId))
        : undefined;
      const patrolBounds = member.patrolBounds
        ?? (designatedRoom ? insetRoomBounds(designatedRoom.bounds, 24) : undefined);

      const roomGrid = patrolBounds
        ? createBoundedWalkGrid(this.tiledGrid, tileSize, patrolBounds, { width: 24, height: 14 })
        : this.tiledGrid;

      const startTile = nearestWalkableTile(
        roomGrid,
        tileAtPixel({ x: member.x, y: member.y + CREW_FEET_OFFSET_Y }, tileSize),
      );
      const spawnX = startTile ? startTile.x * tileSize + half : member.x;
      const spawnY = startTile ? startTile.y * tileSize + half - CREW_FEET_OFFSET_Y : member.y;
      const waypoints = patrolBounds
        ? collectWalkableWaypoints(roomGrid, tileSize, patrolBounds, {
            feetOffsetY: CREW_FEET_OFFSET_Y,
            avoid: stationCoords,
            avoidRadius: 56,
          })
        : undefined;

      const npc = new CrewNPC(
        this,
        textureKeyForArt(member.art),
        spawnX,
        spawnY,
        {
          id: member.id,
          label: member.name,
          role: member.role,
          accent: member.accent,
          lines: member.lines,
          helmeted: Boolean(member.helmeted),
          frozen: this.state.frozen,
          reducedMotion: this.coordinator.reducedMotion,
          home: { x: spawnX, y: spawnY },
          wanderRadius: member.exteriorOnly ? 140 : 165,
          patrolBounds,
          waypoints,
          feetOffsetY: CREW_FEET_OFFSET_Y,
          findPath: (from, to) =>
            this.findPath(
              from,
              { x: to.x, y: to.y + CREW_FEET_OFFSET_Y },
              CREW_FEET_OFFSET_Y,
              roomGrid,
            ),
          onTalk: (crew) => {
            if (!this.state.frozen) {
              this.coordinator.onEvent({ type: 'crew', crewId: crew.id, name: crew.name, lines: crew.lines });
            }
          },
        },
      );
      this.tiledCrew.push(npc);
      this.tiledInteraction.register(npc);
    }
  }

  private handleTaskInteract(taskId: string): void {
    if (this.state.frozen) return;
    this.coordinator.onEvent({ type: 'interact', interactionId: taskId, kind: 'task' });
  }

  private findPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    feetOffsetY = 0,
    grid: WalkableGrid | undefined = this.tiledGrid,
  ): { x: number; y: number }[] | null {
    if (!this.tiledMap || !grid) return null;
    const ts = this.tiledMap.minimap.tileSize;
    const startTile = nearestWalkableTile(grid, tileAtPixel({ x: from.x, y: from.y + feetOffsetY }, ts));
    const goalTile = nearestWalkableTile(grid, tileAtPixel(to, ts));
    if (!startTile || !goalTile) return null;
    const tiles = findPath(grid, startTile, goalTile);
    if (!tiles) return null;
    const compressed = compressPath(tiles);
    const half = ts / 2;
    return compressed.map((t) => ({ x: t.x * ts + half, y: t.y * ts + half - feetOffsetY }));
  }

  private safePosition(x: number, y: number): { x: number; y: number } {
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

  private routeTo(x: number, y: number): boolean {
    if (!this.tiledPlayer) return false;
    const isEmergencyTarget = this.map.interactions.some(
      (item) =>
        item.id.startsWith('emergency-') &&
        this.state.activeInteractions.includes(item.id) &&
        !this.state.completedInteractions.includes(item.id) &&
        Math.hypot(item.x - x, item.y - y) < 80,
    );
    const path = this.findPath(this.tiledPlayer.position, { x, y }, PLAYER_FEET.offsetY) ?? [];
    if (path.length === 0) return false;
    this.guideTarget = {
      x,
      y,
      color: isEmergencyTarget ? 0xff2e3d : 0xf5c451,
      manual: !isEmergencyTarget,
    };
    this.guidePath = path;
    this.lastGuideOrigin = { ...this.tiledPlayer.position };
    this.updateGuideLine(performance.now());
    return true;
  }

  private updateGuideLine(now: number): void {
    if (!this.tiledPlayer) return;
    const spotlight = Boolean(this.state.spotlightGuide && this.guideTarget);
    if (spotlight && !this.guideShade) {
      this.guideShade = this.add.graphics().setDepth(84_999);
      this.guideShade.fillStyle(0x030510, 0.86);
      this.guideShade.fillRect(-2000, -2000, this.map.width + 4000, this.map.height + 4000);
    }
    this.guideShade?.setVisible(spotlight);
    if (!this.guideTarget) {
      this.guideLine?.clear();
      return;
    }

    const pos = this.tiledPlayer.position;
    if (this.guideTarget.manual && Math.hypot(pos.x - this.guideTarget.x, pos.y - this.guideTarget.y) <= 28) {
      this.guideTarget = undefined;
      this.guidePath = [];
      this.lastGuideOrigin = undefined;
      this.syncStations();
      if (!this.guideTarget) {
        this.guideLine?.clear();
        return;
      }
    }

    if (
      !this.lastGuideOrigin ||
      Math.hypot(pos.x - this.lastGuideOrigin.x, pos.y - this.lastGuideOrigin.y) >= 14
    ) {
      this.guidePath = this.findPath(pos, this.guideTarget, PLAYER_FEET.offsetY) ?? [];
      this.lastGuideOrigin = { x: pos.x, y: pos.y };
    }

    if (!this.guideLine) {
      this.guideLine = this.add.graphics();
    }
    this.guideLine.setDepth(spotlight ? 85_000 : DEPTH_FLOOR + 5);
    this.guideLine.clear();
    if (this.guidePath.length === 0) return;

    const points = [{ x: pos.x, y: pos.y + PLAYER_FEET.offsetY }, ...this.guidePath.map((pt) => ({
      x: pt.x,
      y: pt.y + PLAYER_FEET.offsetY,
    }))];
    const color = this.guideTarget.color;
    const pulse = this.coordinator.reducedMotion ? 0.9 : 0.65 + 0.35 * Math.sin(now * 0.008);

    // Soft outer glow along the path
    this.guideLine.lineStyle(10, color, 0.22 * pulse);
    this.guideLine.strokePoints(points, false, false);

    // Crisp dashed line marching toward the target
    const dashLen = 14;
    const gapLen = 10;
    const period = dashLen + gapLen;
    const dashOffset = this.coordinator.reducedMotion ? 0 : (now * 0.045) % period;
    this.guideLine.lineStyle(4, color, 0.95);
    let stepStart = dashOffset - period;
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 1) continue;
      const ux = (b.x - a.x) / segLen;
      const uy = (b.y - a.y) / segLen;
      let dashStart = stepStart;
      while (dashStart < segLen) {
        const from = Math.max(0, dashStart);
        const to = Math.min(segLen, dashStart + dashLen);
        if (to > from + 0.5) {
          this.guideLine.lineBetween(
            a.x + ux * from,
            a.y + uy * from,
            a.x + ux * to,
            a.y + uy * to,
          );
        }
        dashStart += period;
      }
      stepStart = ((stepStart - segLen) % period + period) % period - period;
    }

    // Target beacon ring at destination
    const end = points[points.length - 1];
    const ringRadius = this.coordinator.reducedMotion ? 16 : 14 + 5 * Math.sin(now * 0.01);
    this.guideLine.lineStyle(3, color, 0.95);
    this.guideLine.strokeCircle(end.x, end.y, ringRadius);
    this.guideLine.fillStyle(color, 0.3);
    this.guideLine.fillCircle(end.x, end.y, 7);
  }

  private surfaceRoomName(x: number, y: number): string {
    if (!this.tiledMap) return 'Central Hub';
    if (isExteriorApron({ x, y: y + PLAYER_FEET.offsetY }) || isExteriorApron({ x, y })) {
      return 'Exterior Pad';
    }
    return roomAt(this.tiledMap.rooms, { x, y }) ?? 'Station Corridor';
  }

  private emitRoom(force: boolean, now = performance.now()): void {
    if (!this.tiledPlayer) return;
    const pos = this.tiledPlayer.position;
    const room = this.surfaceRoomName(pos.x, pos.y);
    if (force || room !== this.lastEmittedRoom || now - this.lastMoveEvent > 140) {
      this.lastMoveEvent = now;
      this.lastEmittedRoom = room;
      this.coordinator.onEvent({ type: 'move', x: pos.x, y: pos.y, room });
    }
  }

  private emitPrompt(force: boolean): void {
    if (!this.tiledPlayer) return;
    const nearest = this.tiledInteraction.getNearest();
    const room = this.surfaceRoomName(this.tiledPlayer.position.x, this.tiledPlayer.position.y);
    const key = `${nearest?.id ?? ''}:${nearest?.kind ?? ''}:${room}`;
    if (!force && key === this.promptKey) return;
    this.promptKey = key;
    this.coordinator.onEvent({
      type: 'prompt',
      interactionId: nearest?.id ?? null,
      name: nearest?.promptText ?? '',
      kind: nearest?.kind ?? '',
      room,
    });
  }
}
