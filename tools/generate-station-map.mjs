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
const poly = (pts) => ({ t: 'poly', pts });
const rectangleOutline = ({ x, y, w, h }) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// The floor footprint blocks movement. The artwork outline also includes the
// height above that footprint so it can cover a character standing behind it.
function prop(name, footprint, outline) {
  const resolvedOutline = outline
    ?? (footprint.t === 'poly' ? footprint.pts : rectangleOutline(footprint));
  const depth = footprint.t === 'rect'
    ? footprint.y + footprint.h
    : footprint.t === 'ellipse'
      ? footprint.cy + footprint.ry
      : Math.max(...footprint.pts.map(([, py]) => py));
  return { name, footprint, outline: resolvedOutline, depth };
}

const PROPS = [
  prop(
    'Reactor tank and rail',
    poly([[580, 14], [1195, 14], [1195, 255], [1120, 255], [1120, 348], [1088, 358], [1024, 382], [768, 382], [724, 360], [670, 336], [628, 304], [580, 276]]),
    [[612, 219], [616, 212], [724, 265], [725, 59], [738, 25], [778, 14], [999, 11], [1053, 23], [1080, 46], [1084, 153], [1100, 212], [1095, 268], [1157, 244], [1191, 222], [1181, 275], [1097, 342], [1032, 368], [856, 376], [752, 350], [672, 309], [615, 253]],
  ),
  prop('Reactor cabinet', rect(1111, 250, 97, 130), [[1105, 277], [1164, 252], [1208, 262], [1208, 380], [1107, 353]]),
  prop(
    'Comms left conduit',
    poly([[1120, 140], [1448, 140], [1448, 326], [1394, 338], [1312, 338], [1312, 288], [1120, 288]]),
  ),
  prop(
    'Comms dome',
    poly([[1440, 208], [1488, 110], [1568, 76], [1696, 76], [1776, 150], [1816, 215], [1812, 295], [1748, 352], [1504, 352], [1440, 310]]),
    [[1452, 239], [1480, 206], [1512, 132], [1559, 91], [1617, 76], [1676, 85], [1723, 113], [1757, 157], [1776, 207], [1803, 240], [1797, 291], [1735, 313], [1716, 354], [1539, 354], [1533, 326], [1475, 308], [1453, 285]],
  ),
  prop('Comms console', rect(1825, 215, 99, 254)),
  prop('Yellow pipes', rect(1032, 428, 82, 326), [[1032, 457], [1052, 440], [1068, 439], [1080, 428], [1098, 429], [1114, 443], [1105, 718], [1114, 735], [1100, 754], [1075, 754], [1042, 746], [1032, 732], [1040, 711]]),
  prop('CO2 tanks', rect(120, 415, 162, 355), [[115, 458], [137, 431], [168, 420], [180, 406], [199, 410], [206, 432], [229, 449], [248, 475], [248, 526], [267, 544], [282, 564], [255, 770], [119, 770], [115, 544]]),
  prop('Grow beds', rect(402, 470, 260, 298), [[402, 462], [664, 462], [664, 772], [402, 772]]),
  prop('Blue barrels', ellipse(204, 868, 106, 104), [[117, 819], [121, 795], [144, 775], [180, 771], [209, 782], [221, 822], [241, 810], [275, 816], [299, 839], [308, 919], [290, 945], [229, 950], [218, 968], [146, 968], [125, 952]]),
  prop('Hydroponics monitor', rect(563, 812, 99, 155)),
  prop('Stacked crates', rect(1498, 631, 176, 168), [[1498, 631], [1677, 631], [1677, 799], [1498, 799]]),
  prop('Cargo carton', rect(1674, 725, 108, 86)),
  prop('Angled crate', rect(1825, 720, 121, 85), [[1825, 729], [1897, 692], [1948, 728], [1947, 782], [1877, 805], [1825, 784]]),
  prop(
    'Cargo command terminal',
    poly([[1824, 720], [1940, 692], [1940, 932], [1832, 932], [1796, 852], [1820, 816]]),
  ),
  prop('Orange crate', rect(1303, 1068, 169, 113)),
  prop('Cargo tool bench', rect(1836, 957, 110, 225)),
  prop('Crew desk', rect(157, 1126, 139, 62), [[157, 1126], [172, 1126], [172, 1064], [278, 1064], [278, 1126], [296, 1126], [296, 1188], [157, 1188]]),
  prop('Crew whiteboard', rect(478, 1115, 149, 183)),
  prop('Amber bunk', rect(130, 1478, 175, 204)),
  prop('Cyan bunk', rect(341, 1480, 180, 204)),
  prop('Exam table and benches', rect(905, 1287, 286, 279), [[905, 1311], [939, 1311], [939, 1287], [1135, 1287], [1135, 1311], [1191, 1311], [1191, 1566], [905, 1566]]),
  prop('Lab counter', rect(906, 1629, 325, 88)),
  prop('Rear lab cabinet', rect(812, 1757, 416, 65)),
  prop(
    'Landing pad seats',
    poly([[1376, 1413], [1472, 1288], [1536, 1254], [1598, 1258], [1598, 1426], [1568, 1468], [1536, 1500], [1518, 1572], [1500, 1718], [1440, 1720], [1376, 1644]]),
    [[1390, 1520], [1410, 1430], [1478, 1332], [1555, 1268], [1597, 1255], [1597, 1394], [1558, 1418], [1512, 1480], [1489, 1548], [1496, 1704], [1448, 1719], [1418, 1647]],
  ),
  prop(
    'Pod shelf',
    poly([[1728, 1326], [1792, 1280], [1860, 1280], [1984, 1438], [1984, 1536], [1920, 1560], [1880, 1562], [1756, 1430], [1728, 1388]]),
    [[1755, 1338], [1817, 1297], [1857, 1329], [1924, 1400], [1978, 1484], [1978, 1516], [1903, 1560], [1755, 1368]],
  ),
];

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

const inRegion = (r, x, y) => {
  if (r.t === 'rect') return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  if (r.t === 'ellipse') return ((x - r.cx) / r.rx) ** 2 + ((y - r.cy) / r.ry) ** 2 < 1;
  return pointInPoly(r.pts, x, y);
};

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

const vents = [];

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
