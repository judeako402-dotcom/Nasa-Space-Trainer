/**
 * Generates public/assets/maps/spudnaut-station.tmj — the Spudnaut station
 * layout traced from assets/Sample mapppp.png (2048x2048, 32x32 tiles @64px).
 *
 * The artwork renders as the visual layer in-game; this generator derives the
 * collision/minimap grid from hand-authored pixel regions that follow the
 * drawing: rooms, corridors, and obstacles (reactor cylinder, dome, crates,
 * beds, tables...). Walkable = tile center inside a walk region and not
 * inside an obstacle. Every room/task/vent must be BFS-reachable from spawn
 * or the generator fails loudly.
 *
 * Run: node tools/generate-station-map.mjs   (npm run map:gen)
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TS = 64;
const COLS = 32;
const ROWS = 32;

// --- regions (pixel space, traced from the sample map) ---------------------
const WALK = [
  // rooms
  { t: 'ellipse', cx: 866, cy: 240, rx: 311, ry: 230 }, // Reactor Dome
  { t: 'rect', x: 1278, y: 115, w: 685, h: 355 }, // Comms Dome
  { t: 'rect', x: 105, y: 445, w: 560, h: 520 }, // Hydroponics Bay
  { t: 'rect', x: 782, y: 700, w: 240, h: 455 }, // Hub vertical arm
  { t: 'rect', x: 782, y: 897, w: 365, h: 80 }, // Hub horizontal arm
  { t: 'ellipse', cx: 922, cy: 942, rx: 135, ry: 135 }, // Hub bulge
  { t: 'rect', x: 1290, y: 640, w: 670, h: 520 }, // Cargo Bay
  { t: 'rect', x: 105, y: 1035, w: 540, h: 625 }, // Crew Quarters
  { t: 'rect', x: 665, y: 1155, w: 560, h: 610 }, // Med Lab
  { t: 'ellipse', cx: 1655, cy: 1515, rx: 340, ry: 330 }, // Landing Pad
  { t: 'rect', x: 1493, y: 1803, w: 390, h: 190 }, // Airlock (below pad)
  // corridors
  { t: 'rect', x: 1088, y: 155, w: 322, h: 190 }, // reactor -> comms
  { t: 'rect', x: 830, y: 400, w: 300, h: 370 }, // reactor -> hub
  { t: 'rect', x: 1022, y: 740, w: 332, h: 110 }, // hub -> cargo
  { t: 'rect', x: 360, y: 920, w: 110, h: 160 }, // hydro -> crew
  { t: 'rect', x: 1445, y: 415, w: 175, h: 300 }, // comms -> cargo
  { t: 'rect', x: 1548, y: 1120, w: 155, h: 180 }, // cargo -> landing
];

const BLOCK = [
  { t: 'rect', x: 745, y: 20, w: 330, h: 340 }, // reactor cylinder
  { t: 'ellipse', cx: 1592, cy: 230, rx: 180, ry: 120 }, // geodesic dome
  { t: 'rect', x: 945, y: 445, w: 70, h: 305 }, // yellow pipes
  { t: 'rect', x: 140, y: 475, w: 195, h: 305 }, // CO2 tanks
  { t: 'rect', x: 335, y: 445, w: 295, h: 305 }, // grow beds
  { t: 'rect', x: 145, y: 775, w: 165, h: 155 }, // blue barrels
  { t: 'rect', x: 570, y: 825, w: 95, h: 140 }, // hydro monitor
  { t: 'rect', x: 1420, y: 860, w: 390, h: 200 }, // cargo container
  { t: 'rect', x: 1540, y: 655, w: 180, h: 120 }, // stacked crates
  { t: 'rect', x: 1855, y: 700, w: 110, h: 90 }, // small crate
  { t: 'rect', x: 1310, y: 1075, w: 240, h: 95 }, // orange crate
  { t: 'rect', x: 155, y: 1150, w: 160, h: 95 }, // crew desk
  { t: 'rect', x: 475, y: 1105, w: 145, h: 150 }, // crew whiteboard
  { t: 'rect', x: 140, y: 1470, w: 390, h: 180 }, // crew beds
  { t: 'rect', x: 875, y: 1265, w: 230, h: 330 }, // exam table
  { t: 'rect', x: 745, y: 1605, w: 330, h: 90 }, // lab counter
  { t: 'rect', x: 1370, y: 1310, w: 190, h: 250 }, // pad seats
  { t: 'rect', x: 1745, y: 1345, w: 240, h: 190 }, // pod shelf
];

const inRegion = (r, x, y) =>
  r.t === 'rect'
    ? x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
    : ((x - r.cx) / r.rx) ** 2 + ((y - r.cy) / r.ry) ** 2 < 1;

// --- grid -------------------------------------------------------------------
const walkableAt = (x, y) =>
  WALK.some((r) => inRegion(r, x, y)) && !BLOCK.some((r) => inRegion(r, x, y));

const floor = new Array(COLS * ROWS).fill(0);
const walls = new Array(COLS * ROWS).fill(0);
const overhead = new Array(COLS * ROWS).fill(0);
const idx = (c, r) => r * COLS + c;

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x = c * TS + TS / 2;
    const y = r * TS + TS / 2;
    if (walkableAt(x, y)) floor[idx(c, r)] = 1;
    else walls[idx(c, r)] = 2;
  }
}

// --- rooms / objects --------------------------------------------------------
const room = (name, x, y, w, h) => ({ name, x, y, width: w, height: h });

const rooms = [
  room('Reactor Dome', 555, 10, 622, 460),
  room('Comms Dome', 1278, 115, 685, 355),
  room('Hydroponics Bay', 105, 445, 560, 520),
  room('Central Hub', 782, 700, 365, 455),
  room('Cargo Bay', 1290, 640, 670, 520),
  room('Crew Quarters', 105, 1035, 540, 625),
  room('Med Lab', 665, 1155, 560, 610),
  room('Landing Pad', 1315, 1185, 680, 808),
];

const spawn = { x: 960, y: 950 };

const task = (id, name, cx, cy, promptText) => ({
  id,
  name,
  type: 'TaskStation',
  x: cx - 28,
  y: cy - 32,
  width: 56,
  height: 64,
  promptText,
});

const tasks = [
  task(2, 'task_reactor', 765, 290, 'Patch Hull Breach'),
  task(3, 'task_hydro', 555, 890, 'Calibrate Grow Lamps'),
  task(4, 'task_comms', 1620, 325, 'Reconnect Nav Relay'),
];

const vent = (id, name, cx, cy) => ({
  id,
  name,
  type: 'Vent',
  x: cx - 32,
  y: cy - 24,
  width: 64,
  height: 48,
});

const vents = [
  vent(5, 'vent_hub', 800, 1120),
  vent(6, 'vent_cargo', 1696, 1120),
];

// --- invariants --------------------------------------------------------------
function assert(cond, msg) {
  if (!cond) throw new Error(`map invariant violated: ${msg}`);
}

const blocked = walls.map((g) => (g === 0 ? 0 : 1));

function bfs(start, goal) {
  const seen = new Uint8Array(COLS * ROWS);
  const si = start.y * COLS + start.x;
  const gi = goal.y * COLS + goal.x;
  if (seen[si]) return false;
  seen[si] = 1;
  const q = [si];
  const dirs = [1, 0, -1, 0, 1];
  while (q.length) {
    const cur = q.shift();
    if (cur === gi) return true;
    const cx = cur % COLS;
    const cy = (cur / COLS) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d];
      const ny = cy + dirs[d + 1];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const ni = ny * COLS + nx;
      if (seen[ni] || blocked[ni]) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return false;
}

const tileOf = (x, y) => ({ x: Math.floor(x / TS), y: Math.floor(y / TS) });

// 1. Spawn walkable.
const spawnTile = tileOf(spawn.x, spawn.y);
assert(blocked[idx(spawnTile.x, spawnTile.y)] === 0, 'spawn is inside an obstacle');

// 2. Rooms have a walkable tile near their center (spiral search).
function nearestWalkable(t) {
  if (!blocked[idx(t.x, t.y)]) return t;
  for (let radius = 1; radius < COLS; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = t.x + dx;
        const y = t.y + dy;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        if (!blocked[idx(x, y)]) return { x, y };
      }
    }
  }
  return null;
}

for (const rm of rooms) {
  const center = nearestWalkable(tileOf(rm.x + rm.width / 2, rm.y + rm.height / 2));
  assert(center, `room "${rm.name}" has no walkable tile`);
  assert(bfs(spawnTile, center), `room "${rm.name}" not reachable from spawn`);
}

// 3. Tasks and vents sit on walkable tiles reachable from spawn.
for (const obj of [...tasks, ...vents]) {
  const t = tileOf(obj.x + obj.width / 2, obj.y + obj.height / 2);
  assert(!blocked[idx(t.x, t.y)], `"${obj.name}" sits in an obstacle`);
  assert(bfs(spawnTile, t), `"${obj.name}" not reachable from spawn`);
}

// 4. Walkable coverage: >=98% of walkable tiles share spawn's component.
{
  const seen = new Uint8Array(COLS * ROWS);
  const queue = [idx(spawnTile.x, spawnTile.y)];
  seen[queue[0]] = 1;
  const dirs = [1, 0, -1, 0, 1];
  while (queue.length) {
    const cur = queue.pop();
    const cx = cur % COLS;
    const cy = (cur / COLS) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d];
      const ny = cy + dirs[d + 1];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const ni = ny * COLS + nx;
      if (seen[ni] || blocked[ni]) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  let total = 0;
  let reached = 0;
  for (let i = 0; i < blocked.length; i++) {
    if (!blocked[i]) {
      total++;
      if (seen[i]) reached++;
    }
  }
  assert(reached / total >= 0.98, `walkable coverage ${(reached / total).toFixed(3)} < 0.98`);
}

// 5. Unique room names, inside map bounds.
assert(new Set(rooms.map((r) => r.name)).size === rooms.length, 'duplicate room names');
for (const rm of rooms) {
  assert(
    rm.x >= 0 && rm.y >= 0 && rm.x + rm.width <= COLS * TS && rm.y + rm.height <= ROWS * TS,
    `room "${rm.name}" out of bounds`,
  );
}

// --- emit Tiled JSON ---------------------------------------------------------
const fmtGrid = (grid) =>
  '[\n' +
  Array.from({ length: ROWS }, (_, r) => '        ' + grid.slice(r * COLS, (r + 1) * COLS).join(',')).join(',\n') +
  '\n      ]';

const objects = [
  { id: 1, name: 'spawn', type: 'SpawnPoint', point: true, x: spawn.x, y: spawn.y, width: 0, height: 0 },
  ...tasks.map(({ promptText, ...t }) => ({
    ...t,
    properties: [{ name: 'promptText', type: 'string', value: promptText }],
  })),
  ...vents.map((v) => ({ ...v, properties: [] })),
  ...rooms.map((rm, i) => ({
    id: 7 + i,
    name: rm.name,
    type: 'Room',
    x: rm.x,
    y: rm.y,
    width: rm.width,
    height: rm.height,
    properties: [{ name: 'name', type: 'string', value: rm.name }],
  })),
];

const map = `{
  "compressionlevel": -1,
  "height": ${ROWS},
  "width": ${COLS},
  "infinite": false,
  "layers": [
    {
      "data": ${fmtGrid(floor)},
      "height": ${ROWS},
      "id": 1,
      "name": "floor",
      "opacity": 1,
      "type": "tilelayer",
      "visible": true,
      "width": ${COLS},
      "x": 0,
      "y": 0
    },
    {
      "data": ${fmtGrid(walls)},
      "height": ${ROWS},
      "id": 2,
      "name": "walls",
      "opacity": 1,
      "type": "tilelayer",
      "visible": true,
      "width": ${COLS},
      "x": 0,
      "y": 0
    },
    {
      "data": ${fmtGrid(overhead)},
      "height": ${ROWS},
      "id": 3,
      "name": "overhead",
      "opacity": 1,
      "type": "tilelayer",
      "visible": true,
      "width": ${COLS},
      "x": 0,
      "y": 0
    },
    {
      "draworder": "topdown",
      "id": 4,
      "name": "objects",
      "objects": ${JSON.stringify(objects, null, 8).split('\n').join('\n      ')},
      "opacity": 1,
      "type": "objectgroup",
      "visible": true,
      "x": 0,
      "y": 0
    }
  ],
  "nextlayerid": 5,
  "nextobjectid": ${objects.length + 1},
  "orientation": "orthogonal",
  "renderorder": "right-down",
  "tiledversion": "1.11.0",
  "tileheight": ${TS},
  "tilewidth": ${TS},
  "tilesets": [
    {
      "columns": 2,
      "firstgid": 1,
      "image": "placeholder.png",
      "imageheight": 64,
      "imagewidth": 128,
      "margin": 0,
      "name": "placeholder",
      "spacing": 0,
      "tilecount": 2,
      "tileheight": 64,
      "tilewidth": 64
    }
  ],
  "type": "map",
  "version": "1.10"
}
`;

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'assets', 'maps', 'spudnaut-station.tmj');
writeFileSync(out, map, 'utf8');

const parsed = JSON.parse(map);
assert(parsed.width === COLS && parsed.height === ROWS, 'round-trip dimensions');
assert(parsed.layers.length === 4, 'round-trip layers');

let walkCount = 0;
for (const g of floor) if (g) walkCount++;
console.log(
  `wrote ${out} (${COLS}x${ROWS}, ${rooms.length} rooms, ${tasks.length} tasks, ` +
    `${vents.length} vents, ${walkCount} walkable tiles)`,
);
