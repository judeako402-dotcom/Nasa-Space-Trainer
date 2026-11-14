import Phaser from 'phaser';
import { CAMERA, MOVEMENT } from '../../data/balance';
import type { MapDefinition, PropDef } from '../../data/mapTypes';
import { TRAINING_DECK } from '../../data/trainingDeck';
import { MapGeometry } from '../../sim/navigation';
import { createPlayerState, lerp, stepPlayer, type InputSnapshot, type PlayerState } from '../../sim/movement';
import {
  applyResolvedSpriteVisual,
  getSpriteDisplaySize,
  hasAnimatedSprite,
  registerCharacterAnimations,
  resolveCharacterVisual,
  SPRITE_ORIGIN_X,
  SPRITE_ORIGIN_Y,
} from '../assets/characterSprites';
import { ensureColoredCharacterTextures } from '../assets/suitColorizer';
import {
  colorHex,
  ICON_GLYPHS,
  ICON_TEXTURES,
  playSceneBlackTransition,
  preloadSharedCharacters,
  textureKeyForArt,
  type SceneGameState,
  type StationControllableScene,
  type StationCoordinator,
  type StationTelemetrySnapshot,
} from './sceneTypes';

/**
 * Earth Orbit Training Deck Phaser scene.
 * Preloads only character art, task icons, and planet Earth — keeping all Surface
 * habitat maps/TMJ assets deferred until launch.
 */
export class TrainingScene extends Phaser.Scene implements StationControllableScene {
  private readonly coordinator: StationCoordinator;
  private readonly map: MapDefinition = TRAINING_DECK;
  private state: SceneGameState;
  private ready = false;
  private pendingState: SceneGameState | null = null;
  private pendingRespawn = false;

  private lastMoveEvent = 0;
  private lastFpsEvent = 0;
  private lastEmittedRoom = '';
  private promptKey = '';

  private geometry?: MapGeometry;
  private sim: PlayerState = createPlayerState(TRAINING_DECK.spawn.x, TRAINING_DECK.spawn.y);
  private playerRoot?: Phaser.GameObjects.Container;
  private playerBody?: Phaser.GameObjects.Container;
  private playerSprite?: Phaser.GameObjects.Sprite;
  private readonly crewSprites: Array<{ sprite: Phaser.GameObjects.Sprite; baseTextureKey: string }> = [];
  private mapLayer?: Phaser.GameObjects.Container;
  private markerLayer?: Phaser.GameObjects.Container;
  private crewLayer?: Phaser.GameObjects.Container;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private accumulator = 0;
  private camTargetX = TRAINING_DECK.spawn.x;
  private camTargetY = TRAINING_DECK.spawn.y;
  private camSnap = true;
  private transitionActive = false;

  constructor(coordinator: StationCoordinator) {
    super({ key: 'training' });
    this.coordinator = coordinator;
    this.state = coordinator.state;
  }

  preload(): void {
    this.ready = false;
    preloadSharedCharacters(this, (progress) => {
      this.coordinator.onEvent({ type: 'load-progress', progress });
    });
    for (const [name, path] of Object.entries(ICON_TEXTURES)) {
      const key = `icon-${name}`;
      if (!this.textures.exists(key)) {
        this.load.image(key, path);
      }
    }
    if (!this.textures.exists('planet-earth')) {
      this.load.image('planet-earth', '/assets/placeholders/kenney/planets/planet00.png');
    }
  }

  create(): void {
    registerCharacterAnimations(this);

    this.cameras.main.setZoom(CAMERA.zoom);
    this.cameras.main.setBackgroundColor('#03060c');

    this.keys = this.input.keyboard?.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT',
      false,
      false,
    ) as Record<string, Phaser.Input.Keyboard.Key> | undefined;

    this.input.keyboard?.on('keydown-E', () => {
      this.tryInteract();
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointer(pointer));

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
    this.syncCrewAnimations();
    this.syncPlayerAnimation();
  }

  navigateTo(x: number, y: number): boolean {
    if (!this.ready || this.state.frozen || !this.geometry) return false;
    const target = this.nearestInteraction(x, y, 90);
    const destination = target ? { x: target.x, y: target.y } : { x, y };
    this.sim.route = this.geometry.findPath({ x: this.sim.x, y: this.sim.y }, destination);
    this.sim.routeIndex = 0;
    return this.sim.route.length > 0;
  }

  interactNow(): void {
    if (!this.ready || this.state.frozen) return;
    this.tryInteract();
  }

  transitionThroughBlack(onCovered: () => void): void {
    if (!this.ready) {
      throw new Error('Training scene is not ready for a transition');
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
      },
    );
  }

  getTelemetrySnapshot(): StationTelemetrySnapshot {
    return {
      activeMode: 'training',
      ready: this.ready,
      room: this.lastEmittedRoom,
      frozen: Boolean(this.state.frozen),
      player: {
        x: this.sim.x,
        y: this.sim.y,
        helmeted: Boolean(this.state.helmet),
      },
      crew: [],
    };
  }

  private applyState(next: SceneGameState, respawn: boolean): void {
    this.state = next;
    if (!this.geometry || !this.playerRoot) {
      this.sim = createPlayerState(next.x || this.map.spawn.x, next.y || this.map.spawn.y);
      this.camTargetX = this.sim.x;
      this.camTargetY = this.sim.y;
      this.camSnap = true;
      this.buildMap();
      this.createPlayer();
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
    if (this.playerRoot && this.playerSkinChanged(next)) {
      this.createPlayer();
    }
    this.syncPlayerAnimation();
    this.playerRoot?.setAlpha(next.frozen ? 0.72 : 1);
    this.createMarkers();
    this.promptKey = '';
    this.updatePrompt(true);
    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);
  }

  update(time: number, deltaMs: number): void {
    if (!this.ready || !this.playerRoot || !this.geometry) return;

    const now = performance.now();
    if (now - this.lastFpsEvent >= 320) {
      this.lastFpsEvent = now;
      this.coordinator.onEvent({ type: 'fps', fps: Math.max(1, Math.round(this.game.loop.actualFps)) });
    }

    const delta = Math.min(MOVEMENT.maxFrameDelta, deltaMs / 1000);
    const input: InputSnapshot = this.state.frozen
      ? { axisX: 0, axisY: 0, moveRequest: null }
      : this.readInput();

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
    this.syncPlayerAnimation();
    if (this.playerBody) {
      const bob = !this.playerSprite && this.sim.moving && !this.coordinator.reducedMotion
        ? Math.sin(time * 0.022) * 2.2
        : 0;
      this.playerBody.setScale(this.sim.facing, 1);
      this.playerBody.y = bob;
    }

    this.updateCamera(renderX, renderY, delta);
    this.updateCrew(time);
    this.updatePrompt(false);

    const room = this.geometry.roomAt(this.sim.x, this.sim.y)?.name ?? 'Main Corridor';
    if (room !== this.lastEmittedRoom || now - this.lastMoveEvent > 140) {
      this.lastMoveEvent = now;
      this.lastEmittedRoom = room;
      this.coordinator.onEvent({ type: 'move', x: this.sim.x, y: this.sim.y, room });
    }
  }

  private canStand = (x: number, y: number): boolean => (
    this.geometry?.canStand(x, y, MOVEMENT.bodyHalfWidth, MOVEMENT.bodyHalfHeight) ?? false
  );

  private readInput(): InputSnapshot {
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
    if (this.state.frozen || !this.geometry) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const target = this.nearestInteraction(world.x, world.y, 130);
    const destination = target ? { x: target.x, y: target.y } : { x: world.x, y: world.y };
    this.sim.route = this.geometry.findPath({ x: this.sim.x, y: this.sim.y }, destination);
    this.sim.routeIndex = 0;
  }

  private updateCamera(x: number, y: number, delta: number): void {
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

    if (this.camSnap || this.coordinator.reducedMotion) {
      this.cameras.main.setScroll(targetScrollX, targetScrollY);
      this.camSnap = false;
    } else {
      const t = 1 - Math.exp(-CAMERA.smoothing * delta);
      this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetScrollX, t);
      this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, targetScrollY, t);
    }
  }

  private updateCrew(time: number): void {
    if (!this.crewLayer) return;
    for (const child of this.crewLayer.getAll()) {
      if (!(child instanceof Phaser.GameObjects.Container)) continue;
      if (child.getData('animated') === true || this.coordinator.reducedMotion) continue;
      const offset = Number(child.getData('offset') ?? 0);
      child.y = Number(child.getData('baseY') ?? child.y) + Math.sin(time * 0.002 + offset) * 2;
    }
  }

  private nearestInteraction(
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

  private updatePrompt(force: boolean): void {
    if (!this.geometry) return;
    const nearest = this.nearestInteraction(this.sim.x, this.sim.y, MOVEMENT.interactionRange);
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
    this.coordinator.onEvent({
      type: 'prompt',
      interactionId: nearest?.id ?? null,
      name: displayName,
      kind: nearest?.kind ?? '',
      room,
    });
  }

  private tryInteract(): void {
    if (this.state.frozen) return;
    const nearest = this.nearestInteraction(this.sim.x, this.sim.y, MOVEMENT.interactionRange);
    if (!nearest) return;
    if (nearest.kind === 'crew') {
      const crew = this.map.crew.find((item) => item.id === nearest.id);
      if (crew) this.coordinator.onEvent({ type: 'crew', crewId: crew.id, name: crew.name, lines: crew.lines });
      return;
    }
    this.coordinator.onEvent({ type: 'interact', interactionId: nearest.id, kind: nearest.kind });
  }

  private teardown(): void {
    this.mapLayer?.destroy(true);
    this.mapLayer = undefined;
    this.markerLayer?.destroy(true);
    this.markerLayer = undefined;
    this.crewLayer?.destroy(true);
    this.crewLayer = undefined;
    this.crewSprites.length = 0;
    this.playerRoot?.destroy(true);
    this.playerRoot = undefined;
    this.playerBody = undefined;
    this.playerSprite = undefined;
    this.geometry = undefined;
  }

  private buildMap(): void {
    this.teardown();
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
    for (const prop of this.map.props) this.drawProp(props, prop);

    this.createMarkers();
    this.createCrew();
  }

  private drawProp(graphics: Phaser.GameObjects.Graphics, prop: PropDef): void {
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

  private createMarkers(): void {
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

  private createCrew(): void {
    if (!this.crewLayer) return;
    this.crewLayer.removeAll(true);
    this.crewSprites.length = 0;
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
        reducedMotion: this.coordinator.reducedMotion,
      });
      const animated = Boolean(visual && this.textures.exists(visual.textureKey));
      root.setData('animated', animated);

      if (animated && visual) {
        const { width, height } = getSpriteDisplaySize(key, 'crew');
        const sprite = this.add.sprite(0, -32, visual.textureKey)
          .setOrigin(SPRITE_ORIGIN_X, SPRITE_ORIGIN_Y)
          .setDisplaySize(width, height);
        body.add(sprite);
        this.crewSprites.push({ sprite, baseTextureKey: key });
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
    this.syncCrewAnimations();
  }

  private createPlayer(): void {
    this.playerRoot?.destroy(true);
    this.playerSprite = undefined;
    const color = colorHex(this.state.colorId);
    const root = this.add.container(this.sim.x, this.sim.y).setDepth(30);
    const body = this.add.container(0, 0);
    const key = ensureColoredCharacterTextures(
      this,
      textureKeyForArt(this.state.playerArt),
      this.state.colorId,
    );
    const helmeted = Boolean(this.state.helmet);
    const visual = resolveCharacterVisual({
      baseTextureKey: key,
      moving: this.sim.moving,
      helmeted,
      reducedMotion: this.coordinator.reducedMotion,
    });
    const animated = Boolean(visual && this.textures.exists(visual.textureKey));

    body.add(this.add.ellipse(0, 4, 42, 13, 0x02060b, 0.42));
    if (animated && visual) {
      const { width, height } = getSpriteDisplaySize(key, 'player');
      const sprite = this.add.sprite(0, -32, visual.textureKey)
        .setOrigin(SPRITE_ORIGIN_X, SPRITE_ORIGIN_Y)
        .setDisplaySize(width, height);
      sprite.setData('baseTextureKey', key);
      sprite.setData('playerName', this.state.playerName);
      body.add(sprite);
      this.playerSprite = sprite;
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
    this.syncPlayerAnimation();
  }

  private playerSkinChanged(next: SceneGameState): boolean {
    const key = ensureColoredCharacterTextures(
      this,
      textureKeyForArt(next.playerArt),
      next.colorId,
    );
    const currentKey = this.playerSprite?.getData('baseTextureKey');
    const currentName = this.playerSprite?.getData('playerName');
    return (hasAnimatedSprite(key) ? currentKey !== key : Boolean(this.playerSprite))
      || (currentName !== undefined && currentName !== next.playerName);
  }

  private applySpritePose(
    sprite: Phaser.GameObjects.Sprite,
    baseTextureKey: string,
    moving: boolean,
  ): void {
    const visual = resolveCharacterVisual({
      baseTextureKey,
      moving,
      helmeted: sprite === this.playerSprite && Boolean(this.state.helmet),
      reducedMotion: this.coordinator.reducedMotion,
    });
    if (visual) applyResolvedSpriteVisual(this, sprite, visual);
  }

  private syncPlayerAnimation(): void {
    const sprite = this.playerSprite;
    if (!sprite || !sprite.active) return;
    const baseTextureKey = String(sprite.getData('baseTextureKey') ?? textureKeyForArt(this.state.playerArt));
    this.applySpritePose(sprite, baseTextureKey, this.sim.moving);
  }

  private syncCrewAnimations(): void {
    for (const entry of this.crewSprites) {
      if (!entry.sprite.active) continue;
      this.applySpritePose(entry.sprite, entry.baseTextureKey, false);
    }
  }
}
