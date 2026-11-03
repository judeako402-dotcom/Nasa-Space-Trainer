import Phaser from 'phaser';
import { CAMERA, MOVEMENT, VISION } from '../data/balance';
import type { MapDefinition, PropDef } from '../data/mapTypes';
import { TRAINING_DECK } from '../data/trainingDeck';
import { surfaceHabitatFor, SURFACE_HABITAT } from '../data/surfaceHabitat';
import { PLAYER_COLORS, type PlayerColorId } from '../model';
import { MapGeometry } from '../sim/navigation';
import { castVision } from '../sim/occluders';
import type { InputSnapshot, PlayerState } from '../sim/movement';
import { createPlayerState, lerp, stepPlayer } from '../sim/movement';

export type MapId = 'training' | 'surface';

export interface SceneGameState {
  mapId: MapId;
  destination?: 'moon' | 'mars';
  playerName: string;
  colorId: PlayerColorId;
  playerArt: string;
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
  | { type: 'ready' }
  | { type: 'move'; x: number; y: number; room: string }
  | { type: 'prompt'; interactionId: string | null; name: string; kind: string; room: string }
  | { type: 'interact'; interactionId: string; kind: string }
  | { type: 'crew'; crewId: string; name: string; lines: string[] }
  | { type: 'debug'; fps: number; x: number; y: number; room: string; waypoints: number; vision: boolean };

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
  return PLAYER_COLORS.find(color => color.id === id)?.hex ?? 0xef7d0d;
}

export class StationScene extends Phaser.Scene {
  private readonly onEvent: (event: GameEvent) => void;
  private state: SceneGameState;
  private map: MapDefinition = TRAINING_DECK;
  private geometry!: MapGeometry;
  private sim: PlayerState = createPlayerState(TRAINING_DECK.spawn.x, TRAINING_DECK.spawn.y);
  private playerRoot?: Phaser.GameObjects.Container;
  private playerBody?: Phaser.GameObjects.Container;
  private playerLabel?: Phaser.GameObjects.Text;
  private mapLayer?: Phaser.GameObjects.Container;
  private markerLayer?: Phaser.GameObjects.Container;
  private crewLayer?: Phaser.GameObjects.Container;
  private darkLayer?: Phaser.GameObjects.Rectangle;
  private visionGraphics?: Phaser.GameObjects.Graphics;
  private visionMask?: Phaser.Display.Masks.GeometryMask;
  private debugText?: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private accumulator = 0;
  private lastVisionAt = 0;
  private lastVisionX = Number.NaN;
  private lastVisionY = Number.NaN;
  private camTargetX = TRAINING_DECK.spawn.x;
  private camTargetY = TRAINING_DECK.spawn.y;
  private camSnap = true;
  private promptKey = '';
  private lastMoveEvent = 0;
  private debugVisible = false;
  private reducedMotion = false;
  private ready = false;
  private pendingState: SceneGameState | null = null;
  private pendingMap = false;

  constructor(onEvent: (event: GameEvent) => void, initial: SceneGameState) {
    super({ key: 'station' });
    this.onEvent = onEvent;
    this.state = initial;
    this.map = initial.mapId === 'surface' && initial.destination
      ? surfaceHabitatFor(initial.destination)
      : MAPS[initial.mapId];
    this.sim = createPlayerState(initial.x || this.map.spawn.x, initial.y || this.map.spawn.y);
    this.camTargetX = this.sim.x;
    this.camTargetY = this.sim.y;
  }

  preload(): void {
    for (const [path, key] of Object.entries(POTATO_TEXTURES)) {
      this.load.image(key, path);
    }
    for (const [key, path] of Object.entries(ICON_TEXTURES)) {
      this.load.image(`icon-${key}`, path);
    }
    this.load.image('planet-earth', '/assets/placeholders/kenney/planets/planet00.png');
    this.load.image('planet-moon', '/assets/placeholders/kenney/planets/planet05.png');
    this.load.image('planet-mars', '/assets/placeholders/kenney/planets/planet08.png');
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);
    this.cameras.main.setZoom(CAMERA.zoom);
    this.cameras.main.setBackgroundColor('#03060c');
    this.input.keyboard?.on('keydown-E', () => this.tryInteract());
    this.input.keyboard?.on('keydown-F3', (event: KeyboardEvent) => {
      event.preventDefault();
      this.debugVisible = !this.debugVisible;
      this.debugText?.setVisible(this.debugVisible);
    });
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointer(pointer));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.removeAllListeners();
      this.input.removeAllListeners();
    });

    this.buildMap();
    this.createPlayer();
    this.createOverlay();
    this.ready = true;
    this.onEvent({ type: 'ready' });
    if (this.pendingState) {
      const next = this.pendingState;
      this.pendingState = null;
      this.applyState(next, this.pendingMap);
    } else {
      this.applyState(this.state, false);
    }
  }

  configure(next: SceneGameState, options: { respawn?: boolean } = {}): void {
    if (!this.ready) {
      this.pendingState = next;
      this.pendingMap = next.mapId !== this.state.mapId || options.respawn === true;
      return;
    }
    this.applyState(next, options.respawn === true);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  navigateTo(x: number, y: number): void {
    if (!this.ready || !this.geometry) return;
    const target = this.nearestInteraction(x, y, 90);
    const destination = target ? { x: target.x, y: target.y } : { x, y };
    const path = this.geometry.findPath({ x: this.sim.x, y: this.sim.y }, destination);
    if (path.length) {
      this.sim.route = path;
      this.sim.routeIndex = 0;
    }
  }

  private applyState(next: SceneGameState, respawn: boolean): void {
    const mapChanged = next.mapId !== this.state.mapId
      || (next.mapId === 'surface' && next.destination !== this.state.destination);
    const lengthBefore = [...next.activeInteractions].sort().join(',');
    this.state = next;
    if (mapChanged) {
      this.map = next.mapId === 'surface' && next.destination
        ? surfaceHabitatFor(next.destination)
        : MAPS[next.mapId];
      this.sim = createPlayerState(next.x || this.map.spawn.x, next.y || this.map.spawn.y);
      this.camTargetX = this.sim.x;
      this.camTargetY = this.sim.y;
      this.camSnap = true;
      this.buildMap();
      this.createPlayer();
      this.createOverlay();
    } else if (respawn) {
      this.sim.x = next.x;
      this.sim.y = next.y;
      this.sim.prevX = next.x;
      this.sim.prevY = next.y;
      this.camTargetX = next.x;
      this.camTargetY = next.y;
      this.camSnap = true;
    } else if (this.playerRoot) {
      this.sim.x = next.x;
      this.sim.y = next.y;
      this.sim.prevX = next.x;
      this.sim.prevY = next.y;
    }
    this.playerRoot?.setAlpha(next.frozen ? 0.72 : 1);
    this.updateMarkers(lengthBefore);
    this.updateVision(true);
    if (this.darkLayer) this.darkLayer.setVisible(next.visionEnabled);
    this.promptKey = '';
    this.updatePrompt(true);
    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);
  }

  update(time: number, deltaMs: number): void {
    if (!this.ready || !this.playerRoot) return;
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
    if (this.playerBody) {
      const bob = this.sim.moving && !this.reducedMotion ? Math.sin(time * 0.022) * 2.2 : 0;
      this.playerBody.setScale(this.sim.facing, 1);
      this.playerBody.y = bob;
    }
    if (this.playerLabel) this.playerLabel.setScale(1);

    this.updateCamera(renderX, renderY, delta);
    this.updateCrew(time);
    this.updateVision(false, renderX, renderY);
    this.updatePrompt(false);

    const now = performance.now();
    if (now - this.lastMoveEvent > 140) {
      this.lastMoveEvent = now;
      const room = this.geometry.roomAt(this.sim.x, this.sim.y)?.name ?? 'Main Corridor';
      this.onEvent({ type: 'move', x: this.sim.x, y: this.sim.y, room });
    }

    if (this.debugVisible && this.debugText) {
      const room = this.geometry.roomAt(this.sim.x, this.sim.y)?.name ?? 'Main Corridor';
      this.debugText.setText([
        `FPS ${Math.round(this.game.loop.actualFps)}  POS ${Math.round(this.sim.x)},${Math.round(this.sim.y)}`,
        `ROOM ${room.toUpperCase()}`,
        `ROUTE ${Math.max(0, this.sim.route.length - this.sim.routeIndex)} WAYPOINTS`,
        `VISION ${this.state.visionEnabled ? 'ON' : 'OFF'}  BODY ${MOVEMENT.bodyHalfWidth * 2}x${MOVEMENT.bodyHalfHeight * 2}`,
      ].join('\n'));
      if (now % 500 < 20) {
        this.onEvent({
          type: 'debug', fps: Math.round(this.game.loop.actualFps), x: Math.round(this.sim.x),
          y: Math.round(this.sim.y), room, waypoints: Math.max(0, this.sim.route.length - this.sim.routeIndex),
          vision: this.state.visionEnabled,
        });
      }
    }
  }

  private canStand = (x: number, y: number): boolean => (
    this.geometry.canStand(x, y, MOVEMENT.bodyHalfWidth, MOVEMENT.bodyHalfHeight)
  );

  private readInput(): InputSnapshot {
    const keys = this.keys;
    if (!keys) return { axisX: 0, axisY: 0, moveRequest: null };
    const axisX = Number(keys.D?.isDown || keys.RIGHT?.isDown) - Number(keys.A?.isDown || keys.LEFT?.isDown);
    const axisY = Number(keys.S?.isDown || keys.DOWN?.isDown) - Number(keys.W?.isDown || keys.UP?.isDown);
    return { axisX, axisY, moveRequest: null };
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (this.state.frozen) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const target = this.nearestInteraction(world.x, world.y, 130);
    const destination = target ? { x: target.x, y: target.y } : { x: world.x, y: world.y };
    if (!this.geometry.isFloor(destination.x, destination.y)) {
      const path = this.geometry.findPath({ x: this.sim.x, y: this.sim.y }, destination);
      if (!path.length) return;
      this.sim.route = path;
      this.sim.routeIndex = 0;
      return;
    }
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

    if (this.camSnap || this.reducedMotion) {
      this.cameras.main.setScroll(targetScrollX, targetScrollY);
      this.camSnap = false;
    } else {
      const t = 1 - Math.exp(-CAMERA.smoothing * delta);
      this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetScrollX, t);
      this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, targetScrollY, t);
    }
  }

  private updateVision(force: boolean, renderX = this.sim.x, renderY = this.sim.y): void {
    if (!this.visionGraphics || !this.visionMask) return;
    if (!this.state.visionEnabled) {
      this.visionGraphics.clear();
      this.visionMask.setInvertAlpha(true);
      return;
    }
    const now = performance.now();
    const moved = Math.hypot(renderX - this.lastVisionX, renderY - this.lastVisionY);
    const interval = 1000 / VISION.updateHz;
    if (!force && moved < VISION.minMoveBeforeUpdate && now - this.lastVisionAt < interval) return;
    if (!force && now - this.lastVisionAt < interval) return;
    this.lastVisionAt = now;
    this.lastVisionX = renderX;
    this.lastVisionY = renderY;

    const polygon = castVision({ x: renderX, y: renderY }, VISION.radius, this.geometry.seamSegments(), VISION.rays);
    this.visionGraphics.clear();
    this.visionGraphics.fillStyle(0xffffff, 1);
    this.visionGraphics.fillPoints(polygon, true);
    this.visionMask.setInvertAlpha(true);
  }

  private updateCrew(time: number): void {
    if (!this.crewLayer) return;
    for (const child of this.crewLayer.getAll()) {
      if (!(child instanceof Phaser.GameObjects.Container)) continue;
      const offset = Number(child.getData('offset') ?? 0);
      if (this.reducedMotion) continue;
      child.y = Number(child.getData('baseY') ?? child.y) + Math.sin(time * 0.002 + offset) * 2;
    }
  }

  private nearestInteraction(x: number, y: number, range: number): { id: string; name: string; kind: string; x: number; y: number } | null {
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
    const nearest = this.nearestInteraction(this.sim.x, this.sim.y, MOVEMENT.interactionRange);
    const room = this.geometry.roomAt(this.sim.x, this.sim.y)?.name ?? 'Main Corridor';
    const key = `${nearest?.id ?? ''}:${nearest?.kind ?? ''}:${room}`;
    if (!force && key === this.promptKey) return;
    this.promptKey = key;
    const detail = nearest
      ? nearest.kind === 'crew'
        ? this.map.crew.find(crew => crew.id === nearest.id)
        : this.map.interactions.find(interaction => interaction.id === nearest.id)
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

  private tryInteract(): void {
    if (this.state.frozen) return;
    const nearest = this.nearestInteraction(this.sim.x, this.sim.y, MOVEMENT.interactionRange);
    if (!nearest) return;
    if (nearest.kind === 'crew') {
      const crew = this.map.crew.find(item => item.id === nearest.id);
      if (crew) this.onEvent({ type: 'crew', crewId: crew.id, name: crew.name, lines: crew.lines });
      return;
    }
    this.onEvent({ type: 'interact', interactionId: nearest.id, kind: nearest.kind });
  }

  private buildMap(): void {
    this.mapLayer?.destroy(true);
    this.markerLayer?.destroy(true);
    this.crewLayer?.destroy(true);
    this.darkLayer?.destroy(true);
    this.visionGraphics?.destroy();
    this.visionMask?.destroy();
    this.debugText?.destroy();

    this.geometry = new MapGeometry(this.map, MOVEMENT.bodyHalfWidth, MOVEMENT.bodyHalfHeight, 25);
    this.mapLayer = this.add.container(0, 0).setDepth(0);
    this.markerLayer = this.add.container(0, 0).setDepth(25);
    this.crewLayer = this.add.container(0, 0).setDepth(12);

    const background = this.add.rectangle(0, 0, this.map.width, this.map.height, this.map.palette.void, 1).setOrigin(0, 0);
    this.mapLayer.add(background);
    this.drawStars();

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
        color: room.accent, fontFamily: 'Consolas, monospace', fontSize: '13px', fontStyle: 'bold',
      }).setAlpha(0.92);
      this.mapLayer.add(label);
    }

    const props = this.add.graphics();
    this.mapLayer.add(props);
    for (const prop of this.map.props) this.drawProp(props, prop);

    this.createMarkers();
    this.createCrew();
    this.createVision();    this.createPlayerIfNeeded();
  }

  private drawStars(): void {
    const stars = this.add.graphics();
    this.mapLayer?.add(stars);
    for (let index = 0; index < 220; index += 1) {
      const x = (index * 193) % this.map.width;
      const y = (index * 317) % this.map.height;
      stars.fillStyle(index % 7 === 0 ? 0x84b7d9 : 0xffffff, index % 5 === 0 ? 0.3 : 0.16);
      stars.fillCircle(x, y, index % 13 === 0 ? 2 : 1);
    }
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
      case 'pipe':
        graphics.fillStyle(tint, 1).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        graphics.lineStyle(2, 0xffffff, 0.12).lineBetween(prop.x + 6, prop.y + prop.h / 2, prop.x + prop.w - 6, prop.y + prop.h / 2);
        break;
      case 'vent':
        graphics.fillStyle(tint, 1).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 6);
        graphics.lineStyle(2, 0x1b2939, 0.8);
        for (let index = 6; index < prop.h - 4; index += 8) {
          graphics.lineBetween(prop.x + 6, prop.y + index, prop.x + prop.w - 6, prop.y + index);
        }
        break;
      case 'bunk':
        graphics.fillStyle(tint, 1).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 10);
        graphics.fillStyle(0xd6e0f0, 0.35).fillRoundedRect(prop.x + 8, prop.y + 8, prop.w * 0.32, prop.h - 16, 6);
        break;
      case 'tank':
        graphics.fillStyle(tint, 0.5).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, prop.w / 2);
        graphics.lineStyle(2, 0xcff6ff, 0.55).strokeRoundedRect(prop.x, prop.y, prop.w, prop.h, prop.w / 2);
        break;
      case 'planter':
        graphics.fillStyle(0x2f4324, 1).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        graphics.fillStyle(tint, 0.9).fillRoundedRect(prop.x + 6, prop.y + 6, prop.w - 12, prop.h - 12, 6);
        graphics.fillStyle(0x9bd15a, 0.85);
        for (let index = 0; index < 6; index += 1) {
          graphics.fillCircle(prop.x + 18 + (index % 3) * 40, prop.y + 24 + Math.floor(index / 3) * 34, 7);
        }
        break;
      case 'reactor':
        graphics.fillStyle(0x1b1418, 1).fillCircle(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w / 2);
        graphics.lineStyle(7, tint, 0.5).strokeCircle(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w * 0.38);
        graphics.lineStyle(3, 0xf5c451, 0.7).strokeCircle(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w * 0.24);
        graphics.fillStyle(0xffc45d, 0.7).fillCircle(prop.x + prop.w / 2, prop.y + prop.h / 2, 16);
        break;
      case 'window':
        graphics.fillStyle(0x07111f, 0.98).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        const planetKey = this.state.mapId === 'training'
          ? 'planet-earth'
          : this.state.destination === 'mars' ? 'planet-mars' : 'planet-moon';
        if (this.textures.exists(planetKey)) {
          const size = Math.max(16, Math.min(prop.h - 8, prop.w - 12));
          const planet = this.add.image(prop.x + prop.w / 2, prop.y + prop.h / 2, planetKey)
            .setDisplaySize(size, size).setAlpha(0.9);
          this.mapLayer?.add(planet);
        }
        const frame = this.add.graphics();
        frame.lineStyle(3, tint, 0.9).strokeRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        frame.lineStyle(1, 0xcff6ff, 0.72).strokeRoundedRect(prop.x + 4, prop.y + 4, prop.w - 8, prop.h - 8, 6);
        this.mapLayer?.add(frame);
        break;
      case 'rock':
        graphics.fillStyle(tint, 1).fillEllipse(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w, prop.h);
        graphics.fillStyle(0xffffff, 0.13).fillEllipse(prop.x + prop.w * 0.38, prop.y + prop.h * 0.35, prop.w * 0.42, prop.h * 0.28);
        graphics.lineStyle(2, 0x10151d, 0.65).strokeEllipse(prop.x + prop.w / 2, prop.y + prop.h / 2, prop.w, prop.h);
        break;
      case 'solar-panel':
        graphics.fillStyle(0x172b44, 1).fillRect(prop.x, prop.y, prop.w, prop.h);
        graphics.lineStyle(3, tint, 0.9).strokeRect(prop.x, prop.y, prop.w, prop.h);
        graphics.lineStyle(1, 0xa7d5ef, 0.45);
        for (let x = prop.x + 20; x < prop.x + prop.w; x += 24) graphics.lineBetween(x, prop.y + 2, x, prop.y + prop.h - 2);
        for (let y = prop.y + 20; y < prop.y + prop.h; y += 20) graphics.lineBetween(prop.x + 2, y, prop.x + prop.w - 2, y);
        break;
      case 'antenna':
        graphics.lineStyle(5, tint, 1).lineBetween(prop.x + prop.w / 2, prop.y + prop.h, prop.x + prop.w / 2, prop.y + 8);
        graphics.lineStyle(3, tint, 0.9).lineBetween(prop.x + prop.w * 0.25, prop.y + prop.h * 0.75, prop.x + prop.w * 0.75, prop.y + prop.h * 0.75);
        graphics.lineStyle(2, 0x9be5f5, 0.8).strokeCircle(prop.x + prop.w / 2, prop.y + prop.h * 0.25, Math.min(prop.w, prop.h) * 0.28);
        break;
      case 'airlock':
        graphics.fillStyle(0x182838, 1).fillRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        graphics.lineStyle(4, tint, 0.95).strokeRoundedRect(prop.x, prop.y, prop.w, prop.h, 8);
        graphics.lineStyle(2, 0x9be5f5, 0.72).lineBetween(prop.x + prop.w / 2, prop.y + 8, prop.x + prop.w / 2, prop.y + prop.h - 8);
        graphics.fillStyle(0x8fe6a8, 0.85).fillCircle(prop.x + prop.w - 10, prop.y + 12, 4);
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
          color: complete ? '#66d98d' : (interaction.accent ?? '#f5c451'), fontFamily: 'Consolas, monospace', fontSize: '15px',
        }).setOrigin(0.5);
        container.add(glyph);
      }
      const label = this.add.text(0, 32, interaction.name.toUpperCase(), {
        color: complete ? '#9fc9ac' : '#e7dcc0', fontFamily: 'Consolas, monospace', fontSize: '9px', fontStyle: 'bold',
        backgroundColor: 'rgba(4,8,14,0.72)', padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setAlpha(complete ? 0.6 : 1);
      container.add(label);
      this.markerLayer.add(container);
    }
  }

  private createCrew(): void {
    if (!this.crewLayer) return;
    this.crewLayer.removeAll(true);
    this.map.crew.forEach((crew, index) => {
      const root = this.add.container(crew.x, crew.y);
      root.setData('baseY', crew.y);
      root.setData('offset', index * 1.7);
      const body = this.add.container(0, 0);
      const key = textureKeyForArt(crew.art);
      if (this.textures.exists(key)) {
        body.add(this.add.image(0, -38, key).setDisplaySize(46, 56).setOrigin(0.5, 0.5));
      } else {
        body.add(this.add.ellipse(0, -32, 44, 56, colorHex('green'), 1));
      }
      body.setScale(crew.facing, 1);
      root.add(body);
      root.add(this.add.text(0, -74, crew.name.toUpperCase(), {
        color: '#dce7f5', fontFamily: 'Consolas, monospace', fontSize: '10px', fontStyle: 'bold',
        backgroundColor: 'rgba(4,8,14,0.62)', padding: { x: 4, y: 2 },
      }).setOrigin(0.5));
      root.add(this.add.text(0, -62, crew.role.toUpperCase(), {
        color: crew.accent, fontFamily: 'Consolas, monospace', fontSize: '8px',
      }).setOrigin(0.5));
      this.crewLayer?.add(root);
    });
  }

  private createPlayerIfNeeded(): void {
    if (!this.playerRoot) this.createPlayer();
  }

  private createPlayer(): void {
    this.playerRoot?.destroy(true);
    const color = colorHex(this.state.colorId);
    const root = this.add.container(this.sim.x, this.sim.y).setDepth(30);
    const body = this.add.container(0, 0);
    const key = textureKeyForArt(this.state.playerArt);
    if (this.textures.exists(key)) {
      body.add(this.add.image(0, -38, key).setDisplaySize(52, 64).setOrigin(0.5, 0.5));
    } else {
      body.add(this.add.ellipse(0, -30, 44, 58, color, 1));
    }
    body.add(this.add.ellipse(0, 4, 42, 13, 0x02060b, 0.42));
    root.add(body);
    const label = this.add.text(0, -80, this.state.playerName.toUpperCase(), {
      color: '#fff1be', fontFamily: 'Consolas, monospace', fontSize: '11px', fontStyle: 'bold',
      backgroundColor: 'rgba(4,8,14,0.7)', padding: { x: 5, y: 2 },
    }).setOrigin(0.5);
    root.add(label);
    const marker = this.add.triangle(0, -96, 0, 0, 8, 0, 4, 8, 0xf5c451, 1).setName('caret');
    root.add(marker);
    this.playerRoot = root;
    this.playerBody = body;
    this.playerLabel = label;
  }

  private createVision(): void {
    this.createOverlay();
  }

  private createOverlay(): void {
    this.visionGraphics?.destroy();
    this.visionMask?.destroy();

    this.visionGraphics = this.add.graphics().setVisible(false);
    this.visionMask = this.visionGraphics.createGeometryMask();
    this.visionMask.setInvertAlpha(true);

    // Removed darkLayer - vision is now purely a visibility mask, not full darkness
    // this.darkLayer = this.add.rectangle(0, 0, this.map.width, this.map.height, 0x02040a, VISION.darkness)
    //   .setOrigin(0, 0).setDepth(20);
    // this.darkLayer.setMask(this.visionMask);
    // this.darkLayer.setVisible(this.state.visionEnabled);

    this.debugText = this.add.text(16, this.cameras.main.height - 108, '', {
      color: '#9be8ff', fontFamily: 'Consolas, monospace', fontSize: '12px', backgroundColor: 'rgba(3,8,14,0.82)',
      padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(60).setVisible(this.debugVisible);
  }

  private updateMarkers(_previous: string): void {
    this.createMarkers();
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
    activeInteractions: TRAINING_DECK.interactions.map(interaction => interaction.id),
    completedInteractions: [],
    objective: 'MOVEMENT CHECK',
  };
}

export function createStationGame(parent: HTMLElement, onEvent: (event: GameEvent) => void): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CAMERA.viewWidth,
    height: CAMERA.viewHeight,
    backgroundColor: '#03060c',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
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

export function navigateStationTo(game: Phaser.Game, x: number, y: number): void {
  const scene = game.scene.getScene('station') as StationScene | null;
  scene?.navigateTo(x, y);
}
