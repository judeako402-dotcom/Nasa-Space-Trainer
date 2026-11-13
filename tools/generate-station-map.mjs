/**
 * Generates public/assets/maps/spudnaut-station.tmj — the Spudnaut station
 * layout traced from the station artwork (2048x2048, 64x64 tiles @32px).
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

const TS = 32;
const COLS = 2048 / TS;
const ROWS = 2048 / TS;

// --- regions (pixel space, traced from the sample map) ---------------------
const WALK = [
  // rooms
  { t: 'ellipse', cx: 900, cy: 276, rx: 302, ry: 226 }, // Reactor Dome
  { t: 'rect', x: 1328, y: 218, w: 596, h: 250 }, // Comms Dome
  { t: 'rect', x: 123, y: 532, w: 536, h: 428 }, // Hydroponics Bay
  { t: 'rect', x: 746, y: 732, w: 400, h: 420 }, // Central Hub
  { t: 'rect', x: 1302, y: 722, w: 645, h: 459 }, // Cargo Bay
  { t: 'rect', x: 130, y: 1137, w: 493, h: 544 }, // Crew Quarters
  { t: 'rect', x: 748, y: 1224, w: 477, h: 590 }, // Med Lab
  { t: 'ellipse', cx: 1692, cy: 1533, rx: 296, ry: 287 }, // Landing Pad
  { t: 'rect', x: 1498, y: 1696, w: 391, h: 75 }, // South edge of the pad
  // corridors
  { t: 'rect', x: 1100, y: 382, w: 262, h: 64 }, // reactor -> comms
  { t: 'rect', x: 817, y: 474, w: 147, h: 276 }, // reactor -> hub
  { t: 'rect', x: 1125, y: 896, w: 192, h: 72 }, // hub -> cargo
  { t: 'rect', x: 320, y: 949, w: 145, h: 207 }, // hydro -> crew
  { t: 'rect', x: 1358, y: 450, w: 114, h: 286 }, // comms -> cargo
  { t: 'rect', x: 1610, y: 1165, w: 119, h: 200 }, // cargo -> landing
  { t: 'rect', x: 873, y: 1133, w: 106, h: 110 }, // hub -> med lab
  { t: 'rect', x: 607, y: 1361, w: 155, h: 92 }, // crew -> med lab
];

const rect = (x, y, w, h) => ({ t: 'rect', x, y, w, h });
const ellipse = (cx, cy, rx, ry) => ({ t: 'ellipse', cx, cy, rx, ry });
const rectangleOutline = ({ x, y, w, h }) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// The floor footprint blocks movement. The artwork outline also includes the
// height above that footprint so it can cover a character standing behind it.
function prop(name, footprint, outline = rectangleOutline(footprint)) {
  const depth = footprint.t === 'rect' ? footprint.y + footprint.h : footprint.cy + footprint.ry;
  return { name, footprint, outline, depth };
}

const PROPS = [
  prop('Reactor tank and rail', ellipse(899, 213, 290, 158), [[600, 219], [616, 212], [724, 265], [725, 59], [738, 25], [778, 14], [999, 11], [1053, 23], [1080, 46], [1084, 153], [1100, 212], [1095, 268], [1157, 244], [1191, 222], [1181, 275], [1097, 342], [1032, 368], [856, 376], [752, 350], [672, 309], [615, 253]]),
  prop('Reactor cabinet', rect(1111, 262, 97, 110), [[1105, 277], [1164, 252], [1205, 262], [1201, 372], [1107, 353]]),
  prop('Comms dome', ellipse(1628, 252, 175, 87), [[1452, 239], [1480, 206], [1512, 132], [1559, 91], [1617, 76], [1676, 85], [1723, 113], [1757, 157], [1776, 207], [1803, 240], [1797, 291], [1735, 313], [1716, 350], [1539, 350], [1533, 326], [1475, 308], [1453, 285]]),
  prop('Comms console', rect(1829, 335, 95, 131)),
  prop('Yellow pipes', rect(1039, 437, 69, 307), [[1039, 457], [1052, 440], [1068, 439], [1080, 427], [1098, 429], [1108, 443], [1105, 718], [1111, 735], [1100, 749], [1075, 753], [1042, 746], [1033, 732], [1040, 711]]),
  prop('CO2 tanks', rect(124, 522, 145, 238), [[113, 458], [137, 431], [168, 420], [180, 405], [199, 410], [206, 432], [229, 449], [248, 475], [248, 526], [267, 544], [276, 564], [255, 767], [119, 767], [113, 544]]),
  prop('Grow beds', rect(316, 535, 346, 224), [[315, 539], [403, 539], [419, 477], [431, 462], [444, 478], [663, 477], [663, 772], [416, 770], [405, 747], [315, 747]]),
  prop('Blue barrels', ellipse(207, 881, 94, 91), [[116, 819], [121, 795], [144, 775], [180, 768], [209, 782], [221, 822], [241, 810], [275, 816], [299, 839], [304, 919], [290, 945], [229, 950], [218, 968], [146, 968], [125, 952]]),
  prop('Hydroponics monitor', rect(563, 827, 98, 140)),
  prop('Cargo container', rect(1419, 841, 373, 207)),
  prop('Stacked crates', rect(1503, 718, 171, 73), [[1500, 632], [1677, 632], [1677, 795], [1500, 795]]),
  prop('Cargo carton', rect(1675, 729, 107, 78)),
  prop('Angled crate', rect(1827, 721, 121, 81), [[1825, 729], [1897, 692], [1949, 728], [1947, 782], [1877, 815], [1825, 784]]),
  prop('Orange crate', rect(1306, 1078, 164, 100)),
  prop('Cargo tool bench', rect(1849, 959, 95, 220)),
  prop('Crew desk', rect(158, 1128, 136, 59), [[158, 1128], [172, 1128], [172, 1075], [278, 1075], [278, 1128], [295, 1128], [295, 1179], [245, 1179], [245, 1188], [193, 1188], [193, 1179], [158, 1179]]),
  prop('Crew whiteboard', rect(480, 1120, 143, 166)),
  prop('Crew beds', rect(130, 1478, 388, 204), [[130, 1478], [304, 1478], [304, 1682], [342, 1682], [342, 1478], [518, 1478], [518, 1683], [130, 1683]]),
  prop('Exam table and benches', rect(907, 1288, 283, 274), [[905, 1311], [939, 1311], [939, 1287], [1135, 1287], [1135, 1311], [1190, 1311], [1190, 1566], [905, 1566]]),
  prop('Lab counter', rect(908, 1629, 318, 87)),
  prop('Rear lab cabinet', rect(821, 1759, 405, 61)),
  prop('Landing pad seats', ellipse(1430, 1499, 101, 212), [[1390, 1520], [1410, 1430], [1478, 1332], [1555, 1268], [1594, 1259], [1594, 1394], [1558, 1418], [1512, 1480], [1489, 1548], [1496, 1704], [1448, 1718], [1418, 1647]]),
  prop('Pod shelf', ellipse(1868, 1439, 71, 112), [[1756, 1338], [1817, 1312], [1857, 1329], [1924, 1400], [1978, 1484], [1978, 1516], [1903, 1561], [1755, 1368]]),
];

const inRegion = (r, x, y) =>
  r.t === 'rect'
    ? x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
    : ((x - r.cx) / r.rx) ** 2 + ((y - r.cy) / r.ry) ** 2 < 1;

// --- grid -------------------------------------------------------------------
const insideStation = (x, y) => WALK.some((r) => inRegion(r, x, y));
const walkableAt = (x, y) => insideStation(x, y) && !PROPS.some(({ footprint }) => inRegion(footprint, x, y));

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
  task(2, 'task_reactor', 784, 400, 'Patch Hull Breach'),
  task(3, 'task_hydro', 528, 880, 'Calibrate Grow Lamps'),
  task(4, 'task_comms', 1616, 368, 'Reconnect Nav Relay'),
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

// Keep the wall faces at the walkable perimeter in the same depth-sorted
// layer as props. Merge neighboring tiles into one artwork strip per edge.
const wallFaces = [];
for (let row = 0; row < ROWS; row++) {
  const isWallFace = (col) => {
    if (col >= COLS || !walls[idx(col, row)]) return false;
    const x = (col + 0.5) * TS;
    const y = (row + 0.5) * TS;
    return !insideStation(x, y)
      && !PROPS.some(({ footprint }) => inRegion(footprint, x, y))
      && [floor[idx(col, row - 1)], floor[idx(col, row + 1)], col > 0 && floor[idx(col - 1, row)], col < COLS - 1 && floor[idx(col + 1, row)]].some(Boolean);
  };
  for (let col = 0; col < COLS; col++) {
    if (!isWallFace(col)) continue;
    const start = col;
    while (isWallFace(col + 1)) col++;
    wallFaces.push(prop(`Wall ${row}-${start}`, rect(start * TS, row * TS, (col - start + 1) * TS, TS)));
  }
}

function artworkObject({ name, outline, depth }, index) {
  const x = Math.min(...outline.map(point => point[0]));
  const y = Math.min(...outline.map(point => point[1]));
  return {
    id: index + 1,
    name,
    type: 'DepthArtwork',
    x,
    y,
    polygon: outline.map(([px, py]) => ({ x: px - x, y: py - y })),
    properties: [{ name: 'depth', type: 'int', value: depth }],
  };
}

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
const artwork = [...wallFaces, ...PROPS].map((item, index) => artworkObject(item, objects.length + index));

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
    },
    {
      "draworder": "topdown",
      "id": 5,
      "name": "depth-artwork",
      "objects": [\n        ${artwork.map(item => JSON.stringify(item)).join(',\n        ')}\n      ],
      "opacity": 1,
      "type": "objectgroup",
      "visible": true,
      "x": 0,
      "y": 0
    }
  ],
  "nextlayerid": 6,
  "nextobjectid": ${objects.length + artwork.length + 1},
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
      "imageheight": ${TS},
      "imagewidth": ${2 * TS},
      "margin": 0,
      "name": "placeholder",
      "spacing": 0,
      "tilecount": 2,
      "tileheight": ${TS},
      "tilewidth": ${TS}
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
assert(parsed.layers.length === 5, 'round-trip layers');

let walkCount = 0;
for (const g of floor) if (g) walkCount++;
console.log(
  `wrote ${out} (${COLS}x${ROWS}, ${rooms.length} rooms, ${tasks.length} tasks, ` +
    `${vents.length} vents, ${walkCount} walkable tiles)`,
);
