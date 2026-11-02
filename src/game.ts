import Phaser from 'phaser';
import type { PlayerColorId } from './model';
import {
  CORRIDORS, PLAYER_COLORS, PLAYER_SPAWN, ROOMS, TASKS, TASK_RANGE,
  WORLD_HEIGHT, WORLD_WIDTH, getRoomName, roomAt, taskById,
} from './model';

export interface SceneGameState {
  playerName: string;
  colorId: PlayerColorId;
  tasks: string[];
  tasksDone: string[];
  x: number;
  y: number;
  speed: number;
  frozen: boolean;
}

export type GameEvent =
  | { type: 'ready' }
  | { type: 'move'; x: number; y: number; room: string }
  | { type: 'prompt'; taskId: string | null; taskName: string; roomName: string; taskRoomName: string }
  | { type: 'task-open'; taskId: string };

const VIEW_WIDTH = 1300;
const VIEW_HEIGHT = 800;
const CELL_SIZE = 50;
const WALK_SPEED = 245;

function isWalkable(x: number, y: number): boolean {
  if (x < 18 || y < 18 || x > WORLD_WIDTH - 18 || y > WORLD_HEIGHT - 18) return false;
  return ROOMS.some(room => x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h)
    || CORRIDORS.some(corridor => x >= corridor.x && x <= corridor.x + corridor.w && y >= corridor.y && y <= corridor.y + corridor.h);
}

class StationScene extends Phaser.Scene {
  private readonly onEvent: (event: GameEvent) => void;
  private state: SceneGameState;
  private player!: Phaser.GameObjects.Container;
  private markers = new Map<string, Phaser.GameObjects.Container>();
  private route: Phaser.Math.Vector2[] = [];
  private routeIndex = 0;
  private promptKey = '';
  private lastMoveEvent = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private playerX = PLAYER_SPAWN.x;
  private playerY = PLAYER_SPAWN.y;

  constructor(onEvent: (event: GameEvent) => void, initial: SceneGameState) {
    super({ key: 'station' });
    this.onEvent = onEvent;
    this.state = initial;
  }

  create(): void {
    this.drawStation();
    this.createCrew();
    this.player = this.makeBean(this.state.colorId, this.state.playerName, true);
    this.player.setPosition(this.state.x, this.state.y).setDepth(10);
    this.playerX = this.state.x;
    this.playerY = this.state.y;
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(0.5);
    this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.input.keyboard?.on('keydown-E', () => this.tryUse());
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.state.frozen) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const task = this.nearestTask(point.x, point.y, 110);
      this.route = this.findPath(this.playerX, this.playerY, task?.x ?? point.x, task?.y ?? point.y);
      this.routeIndex = this.route.length > 1 ? 1 : 0;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.removeAllListeners();
      this.input.removeAllListeners();
    });
    this.onEvent({ type: 'ready' });
    this.configure(this.state);
  }

  configure(next: SceneGameState): void {
    this.state = next;
    if (!this.player) return;
    this.player.setPosition(next.x, next.y);
    this.playerX = next.x;
    this.playerY = next.y;
    this.player.setAlpha(next.frozen ? 0.72 : 1);
    for (const [id, marker] of this.markers) {
      const complete = next.tasksDone.includes(id);
      marker.setAlpha(complete ? 0.22 : next.tasks.includes(id) ? 1 : 0.38);
      const ring = marker.getByName('ring') as Phaser.GameObjects.Arc;
      ring.setStrokeStyle(complete ? 2 : 3, complete ? 0x66d98d : 0xf5c451, 0.92);
    }
    this.promptKey = '';
    this.updatePrompt();
  }

  update(_time: number, delta: number): void {
    if (!this.player || this.state.frozen) return;
    const body = this.keys;
    let dx = Number(body.D.isDown || body.RIGHT.isDown) - Number(body.A.isDown || body.LEFT.isDown);
    let dy = Number(body.S.isDown || body.DOWN.isDown) - Number(body.W.isDown || body.UP.isDown);
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
      this.route = [];
      this.moveBy(dx * WALK_SPEED * this.state.speed * delta / 1000, dy * WALK_SPEED * this.state.speed * delta / 1000);
    } else if (this.routeIndex < this.route.length) {
      const target = this.route[this.routeIndex];
      const distance = Phaser.Math.Distance.Between(this.playerX, this.playerY, target.x, target.y);
      const step = WALK_SPEED * this.state.speed * delta / 1000;
      if (distance <= step) {
        this.moveBy(target.x - this.playerX, target.y - this.playerY);
        this.routeIndex += 1;
      } else {
        this.moveBy((target.x - this.playerX) / distance * step, (target.y - this.playerY) / distance * step);
      }
    }
    this.updatePrompt();
    this.player.setPosition(this.playerX, this.playerY);
  }

  private drawStation(): void {
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x070d18).setDepth(-10);
    const stars = this.add.graphics().setDepth(-9);
    for (let i = 0; i < 180; i += 1) {
      const x = (i * 193) % WORLD_WIDTH;
      const y = (i * 317) % WORLD_HEIGHT;
      stars.fillStyle(i % 5 === 0 ? 0x84b7d9 : 0xffffff, i % 5 === 0 ? 0.42 : 0.24);
      stars.fillCircle(x, y, i % 13 === 0 ? 2 : 1);
    }
    const deck = this.add.graphics();
    for (const corridor of CORRIDORS) {
      deck.fillStyle(0x1b2939, 1);
      deck.fillRoundedRect(corridor.x, corridor.y, corridor.w, corridor.h, 18);
      deck.lineStyle(2, 0x566a7b, 0.52);
      deck.strokeRoundedRect(corridor.x, corridor.y, corridor.w, corridor.h, 18);
    }
    for (const room of ROOMS) {
      deck.fillStyle(room.tint, 1);
      deck.fillRoundedRect(room.x, room.y, room.w, room.h, 24);
      deck.fillStyle(0x09111d, 0.58);
      deck.fillRoundedRect(room.x + 10, room.y + 10, room.w - 20, room.h - 20, 18);
      deck.lineStyle(3, 0x8fa6bd, 0.55);
      deck.strokeRoundedRect(room.x, room.y, room.w, room.h, 24);
      this.add.text(room.x + 22, room.y + 18, `${room.icon}  ${room.name.toUpperCase()}`, {
        color: '#b8c8d8', fontFamily: 'Consolas, monospace', fontSize: '15px',
        fontStyle: 'bold',
      }).setDepth(2);
      this.drawRoomDecor(room.id, room.x, room.y, room.w, room.h);
    }
    this.markers.clear();
    for (const task of TASKS) {
      const marker = this.add.container(task.x, task.y).setDepth(4);
      const ring = this.add.circle(0, 0, 22, 0x111a26, 0.96).setStrokeStyle(3, 0xf5c451, 0.92).setName('ring');
      const dot = this.add.circle(0, 0, 6, 0xf5c451, 1);
      marker.add([ring, dot]);
      this.markers.set(task.id, marker);
    }
    this.add.text(PLAYER_SPAWN.x + 40, PLAYER_SPAWN.y - 20, 'CREW DECK', {
      color: '#8fa6bd', fontFamily: 'Consolas, monospace', fontSize: '12px',
    }).setDepth(2);
  }

  private drawRoomDecor(roomId: string, x: number, y: number, w: number, h: number): void {
    const graphics = this.add.graphics().setDepth(1);
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (roomId === 'cafeteria') {
      for (const offset of [-120, 0, 120]) {
        graphics.fillStyle(0x192a3b, 1).fillEllipse(cx + offset, cy + 40, 100, 54);
        graphics.lineStyle(2, 0x8194a8, 0.34).strokeEllipse(cx + offset, cy + 40, 100, 54);
      }
    } else if (roomId === 'reactor') {
      graphics.lineStyle(12, 0xd89058, 0.42).strokeCircle(cx, cy, Math.min(w, h) * 0.27);
      graphics.lineStyle(4, 0xf5c451, 0.5).strokeCircle(cx, cy, Math.min(w, h) * 0.18);
      graphics.fillStyle(0xffc45d, 0.48).fillCircle(cx, cy, 15);
    } else if (roomId === 'medbay') {
      graphics.fillStyle(0x97e2df, 0.18).fillRoundedRect(cx - 100, cy - 24, 200, 80, 14);
      graphics.lineStyle(3, 0x97e2df, 0.5).strokeRoundedRect(cx - 100, cy - 24, 200, 80, 14);
    } else {
      graphics.lineStyle(2, 0xc3d7e8, 0.16);
      graphics.strokeRoundedRect(x + 28, y + 72, w - 56, h - 110, 12);
    }
  }

  private createCrew(): void {
    const colors = PLAYER_COLORS.filter(color => color.id !== this.state.colorId).slice(0, 4);
    const positions = [
      { x: 1040, y: 240 }, { x: 1320, y: 220 }, { x: 1430, y: 440 }, { x: 1120, y: 470 },
    ];
    colors.forEach((color, index) => {
      const crew = this.makeBean(color.id, ['Patch', 'Tater', 'Rover', 'Pip'][index] ?? 'Crew', false);
      crew.setPosition(positions[index]?.x ?? PLAYER_SPAWN.x, positions[index]?.y ?? PLAYER_SPAWN.y).setDepth(5).setAlpha(0.88);
    });
  }

  private makeBean(colorId: PlayerColorId, label: string, isPlayer: boolean): Phaser.GameObjects.Container {
    const color = PLAYER_COLORS.find(item => item.id === colorId)?.hex ?? 0xef7d0d;
    const bean = this.add.container(0, 0);
    const shade = Phaser.Display.Color.ValueToColor(color).darken(28).color;
    bean.add([
      this.add.ellipse(-4, 24, 36, 9, 0x02060b, 0.48),
      this.add.ellipse(-10, 10, 13, 27, shade, 1),
      this.add.ellipse(7, 12, 13, 24, shade, 1),
      this.add.ellipse(0, -2, 31, 42, color, 1),
      this.add.ellipse(6, -7, 22, 15, 0x95e2ee, 1).setStrokeStyle(3, 0xe7fbff, 0.92),
    ]);
    if (label) {
      bean.add(this.add.text(0, 36, label.toUpperCase(), {
        color: isPlayer ? '#fff1be' : '#c5d3e2', fontFamily: 'Consolas, monospace', fontSize: '10px',
        fontStyle: 'bold',
      }).setOrigin(0.5));
    }
    return bean;
  }

  private moveBy(dx: number, dy: number): void {
    const nextX = this.playerX + dx;
    if (isWalkable(nextX, this.playerY)) this.playerX = nextX;
    const nextY = this.playerY + dy;
    if (isWalkable(this.playerX, nextY)) this.playerY = nextY;
    const room = roomAt(this.playerX, this.playerY)?.name ?? 'Main Corridor';
    const now = this.time.now;
    if (now - this.lastMoveEvent > 140) {
      this.lastMoveEvent = now;
      this.onEvent({ type: 'move', x: this.playerX, y: this.playerY, room });
    }
  }

  private findPath(fromX: number, fromY: number, toX: number, toY: number): Phaser.Math.Vector2[] {
    const cols = Math.ceil(WORLD_WIDTH / CELL_SIZE);
    const rows = Math.ceil(WORLD_HEIGHT / CELL_SIZE);
    const toIndex = (x: number, y: number): number => y * cols + x;
    const startX = Phaser.Math.Clamp(Math.floor(fromX / CELL_SIZE), 0, cols - 1);
    const startY = Phaser.Math.Clamp(Math.floor(fromY / CELL_SIZE), 0, rows - 1);
    const goalX = Phaser.Math.Clamp(Math.floor(toX / CELL_SIZE), 0, cols - 1);
    const goalY = Phaser.Math.Clamp(Math.floor(toY / CELL_SIZE), 0, rows - 1);
    const start = toIndex(startX, startY);
    const goal = toIndex(goalX, goalY);
    const queue = [start];
    const parents = new Int32Array(cols * rows).fill(-1);
    parents[start] = start;
    for (let cursor = 0; cursor < queue.length && parents[goal] === -1; cursor += 1) {
      const current = queue[cursor]!;
      const x = current % cols;
      const y = Math.floor(current / cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = toIndex(nx, ny);
        if (parents[next] !== -1 || !isWalkable(nx * CELL_SIZE + CELL_SIZE / 2, ny * CELL_SIZE + CELL_SIZE / 2)) continue;
        parents[next] = current;
        queue.push(next);
      }
    }
    if (parents[goal] === -1) return [];
    const path: Phaser.Math.Vector2[] = [];
    for (let index = goal; index !== start; index = parents[index]!) {
      path.push(new Phaser.Math.Vector2(
        (index % cols) * CELL_SIZE + CELL_SIZE / 2,
        Math.floor(index / cols) * CELL_SIZE + CELL_SIZE / 2,
      ));
    }
    path.reverse();
    path.unshift(new Phaser.Math.Vector2(fromX, fromY));
    if (isWalkable(toX, toY)) path.push(new Phaser.Math.Vector2(toX, toY));
    return path;
  }

  private nearestTask(x: number, y: number, range: number): ReturnType<typeof taskById> {
    return this.state.tasks
      .filter(id => !this.state.tasksDone.includes(id))
      .map(id => taskById(id))
      .filter((task): task is NonNullable<typeof task> => Boolean(task))
      .sort((a, b) => Phaser.Math.Distance.Between(x, y, a.x, a.y) - Phaser.Math.Distance.Between(x, y, b.x, b.y))
      .find(task => Phaser.Math.Distance.Between(x, y, task.x, task.y) <= range);
  }

  private updatePrompt(): void {
    const task = this.nearestTask(this.playerX, this.playerY, TASK_RANGE);
    const roomName = roomAt(this.playerX, this.playerY)?.name ?? 'Main Corridor';
    const taskId = task?.id ?? null;
    const key = `${taskId ?? ''}:${roomName}`;
    if (key === this.promptKey) return;
    this.promptKey = key;
    this.onEvent({
      type: 'prompt',
      taskId,
      taskName: task?.name ?? '',
      roomName,
      taskRoomName: task ? getRoomName(task.roomId) : '',
    });
  }

  private tryUse(): void {
    if (this.state.frozen) return;
    const task = this.nearestTask(this.playerX, this.playerY, TASK_RANGE);
    if (task) this.onEvent({ type: 'task-open', taskId: task.id });
  }
}

function emptyState(): SceneGameState {
  return {
    playerName: 'Spudnaut',
    colorId: 'orange',
    tasks: [],
    tasksDone: [],
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
    speed: 1,
    frozen: true,
  };
}

export function createStationGame(parent: HTMLElement, onEvent: (event: GameEvent) => void): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    backgroundColor: '#050912',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false },
    scene: [new StationScene(onEvent, emptyState())],
  });
}

export function configureStationGame(game: Phaser.Game, state: SceneGameState): void {
  const scene = game.scene.getScene('station') as StationScene | null;
  scene?.configure(state);
}
