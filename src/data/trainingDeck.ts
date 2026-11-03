import { TRAINING } from './balance';
import type { MapDefinition } from './mapTypes';

/* The Training Deck is the first playable space: a compact ship interior used for
   movement tests, the Earth simulator, and later the in-flight emergency. */
export const TRAINING_DECK: MapDefinition = {
  id: 'training',
  title: 'TRAINING DECK',
  subtitle: 'ORBITAL HUB · EARTH SIMULATOR',
  width: TRAINING.deckWidth,
  height: TRAINING.deckHeight,
  spawn: { x: 900, y: 520 },
  palette: {
    void: 0x03060c,
    floor: 0x14202f,
    floorAlt: 0x18283b,
    wall: 0x6f879e,
    line: 0x2f455d,
    glow: 0x7ad7ea,
  },
  rooms: [
    { id: 'bridge', name: 'Bridge', x: 700, y: 60, w: 400, h: 220, tint: 0x1b2a3f, accent: '#7ad7ea', icon: '✦' },
    { id: 'cafeteria', name: 'Cafeteria', x: 620, y: 360, w: 560, h: 340, tint: 0x223248, accent: '#f5c451', icon: '☕' },
    { id: 'reactor', name: 'Reactor', x: 120, y: 300, w: 340, h: 320, tint: 0x3a2a33, accent: '#f2b544', icon: '◉' },
    { id: 'medbay', name: 'MedBay', x: 1340, y: 280, w: 340, h: 280, tint: 0x1f3a3c, accent: '#6fd4e6', icon: '✚' },
    { id: 'hydroponics', name: 'Hydroponics', x: 160, y: 760, w: 380, h: 280, tint: 0x23332a, accent: '#9bd15a', icon: '❋' },
    { id: 'storage', name: 'Storage', x: 660, y: 800, w: 480, h: 250, tint: 0x342e27, accent: '#d8b06a', icon: '▦' },
    { id: 'airlock', name: 'Airlock', x: 1300, y: 720, w: 360, h: 280, tint: 0x2a2a42, accent: '#ba9df0', icon: '◍' },
  ],
  corridors: [
    { x: 850, y: 280, w: 100, h: 80 },
    { x: 460, y: 470, w: 160, h: 100 },
    { x: 1180, y: 440, w: 160, h: 100 },
    { x: 260, y: 620, w: 100, h: 140 },
    { x: 830, y: 700, w: 100, h: 100 },
    { x: 1420, y: 560, w: 100, h: 160 },
    { x: 1140, y: 880, w: 160, h: 100 },
    { x: 540, y: 880, w: 120, h: 100 },
  ],
  props: [
    { id: 'bridge-helm', kind: 'console', x: 860, y: 110, w: 180, h: 60, solid: true, tint: 0x2b435c },
    { id: 'bridge-nav', kind: 'console', x: 760, y: 200, w: 100, h: 46, solid: true, tint: 0x2b435c },
    { id: 'bridge-comms', kind: 'console', x: 940, y: 200, w: 100, h: 46, solid: true, tint: 0x2b435c },
    { id: 'bridge-window', kind: 'window', x: 720, y: 74, w: 360, h: 26, solid: false, tint: 0x8fe6ff },
    { id: 'cafe-table-a', kind: 'table', x: 690, y: 440, w: 120, h: 54, solid: true, tint: 0x4d3c2a },
    { id: 'cafe-table-b', kind: 'table', x: 990, y: 440, w: 120, h: 54, solid: true, tint: 0x4d3c2a },
    { id: 'cafe-table-c', kind: 'table', x: 690, y: 590, w: 120, h: 54, solid: true, tint: 0x4d3c2a },
    { id: 'cafe-table-d', kind: 'table', x: 990, y: 590, w: 120, h: 54, solid: true, tint: 0x4d3c2a },
    { id: 'cafe-vent', kind: 'vent', x: 1110, y: 620, w: 50, h: 50, solid: true, tint: 0x6b7f94 },
    { id: 'reactor-core', kind: 'reactor', x: 190, y: 360, w: 200, h: 200, solid: true, tint: 0xd89058 },
    { id: 'reactor-pipe-a', kind: 'pipe', x: 130, y: 320, w: 40, h: 280, solid: false, tint: 0x8a6a4a },
    { id: 'reactor-pipe-b', kind: 'pipe', x: 410, y: 320, w: 40, h: 280, solid: false, tint: 0x8a6a4a },
    { id: 'med-bunk-a', kind: 'bunk', x: 1380, y: 320, w: 110, h: 60, solid: true, tint: 0x3e6a6c },
    { id: 'med-bunk-b', kind: 'bunk', x: 1520, y: 320, w: 110, h: 60, solid: true, tint: 0x3e6a6c },
    { id: 'med-tank', kind: 'tank', x: 1600, y: 430, w: 64, h: 100, solid: true, tint: 0x6fd4e6 },
    { id: 'hydro-planter-a', kind: 'planter', x: 200, y: 820, w: 120, h: 60, solid: true, tint: 0x5c8a3e },
    { id: 'hydro-planter-b', kind: 'planter', x: 200, y: 960, w: 120, h: 60, solid: true, tint: 0x5c8a3e },
    { id: 'hydro-planter-c', kind: 'planter', x: 380, y: 820, w: 120, h: 60, solid: true, tint: 0x5c8a3e },
    { id: 'hydro-tank', kind: 'tank', x: 400, y: 940, w: 80, h: 80, solid: true, tint: 0x6fd4e6 },
    { id: 'store-crate-a', kind: 'crate', x: 700, y: 840, w: 70, h: 70, solid: true, tint: 0x7a6140 },
    { id: 'store-crate-b', kind: 'crate', x: 790, y: 840, w: 70, h: 70, solid: true, tint: 0x7a6140 },
    { id: 'store-crate-c', kind: 'crate', x: 1000, y: 920, w: 100, h: 80, solid: true, tint: 0x7a6140 },
    { id: 'store-vent', kind: 'vent', x: 700, y: 980, w: 54, h: 54, solid: true, tint: 0x6b7f94 },
    { id: 'airlock-console', kind: 'console', x: 1390, y: 760, w: 120, h: 50, solid: true, tint: 0x4b4b74 },
    { id: 'airlock-suit-a', kind: 'bunk', x: 1540, y: 780, w: 80, h: 110, solid: true, tint: 0x5b5b86 },
    { id: 'airlock-suit-b', kind: 'bunk', x: 1540, y: 910, w: 80, h: 60, solid: true, tint: 0x5b5b86 },
    { id: 'cafe-pipe', kind: 'pipe', x: 620, y: 372, w: 560, h: 18, solid: false, tint: 0x3d596f },
  ],
  interactions: [
    {
      id: 'sys-power', name: 'Reactor Control', kind: 'system', system: 'power',
      x: 290, y: 470, roomId: 'reactor', icon: 'lightning', accent: '#f2b544',
      dialogue: ['Reactor output is stable. Route power to the scrubbers before the next shift.'],
    },
    {
      id: 'sys-life', name: 'Life Support', kind: 'system', system: 'life',
      x: 1490, y: 380, roomId: 'medbay', icon: 'water', accent: '#6fd4e6',
      dialogue: ['Oxygen loop nominal. Water reclaimer needs a filter calibration.'],
    },
    {
      id: 'sys-farming', name: 'Hydroponics', kind: 'system', system: 'farming',
      x: 340, y: 900, roomId: 'hydroponics', icon: 'sickle', accent: '#9bd15a',
      dialogue: ['The first starch batch is ready. Grow lights are drawing heavy power.'],
    },
    {
      id: 'sys-shielding', name: 'Shield Console', kind: 'system', system: 'shielding',
      x: 1440, y: 850, roomId: 'airlock', icon: 'shield', accent: '#ba9df0',
      dialogue: ['Hull integrity holding. Liquid shield barriers are at three quarters.'],
    },
    {
      id: 'spudie', name: 'S.P.U.D.I.E. Terminal', kind: 'terminal',
      x: 920, y: 520, roomId: 'cafeteria', icon: 'notepad', accent: '#7ad7ea',
      dialogue: [
        'S.P.U.D.I.E. online. Welcome to the Training Deck, recruit.',
        'Complete all four system checkpoints, then report to the Bridge for evaluation.',
      ],
    },
    {
      id: 'sample', name: 'Sample Analysis', kind: 'task', taskKind: 'inspect',
      x: 1630, y: 470, roomId: 'medbay', icon: 'notepad', accent: '#6fd4e6',
      dialogue: ['A sealed regolith sample is waiting for analysis.'],
    },
    {
      id: 'bridge-exit', name: 'Bridge Report', kind: 'exit',
      x: 900, y: 230, roomId: 'bridge', icon: 'arrow', accent: '#7ad7ea',
      dialogue: ['The evaluation console is ready when all systems are checked.'],
    },
  ],
  crew: [
    {
      id: 'russet', name: 'Cmdr. Russet', role: 'Training Officer', art: '/assets/potato-repairman.png',
      x: 780, y: 300, facing: 1, accent: '#f2b544',
      lines: [
        'Stand up straight, recruit. This deck is the closest thing to space you will get before launch.',
        'Four systems keep a habitat alive: power, life support, farming, and shielding. Ignore one and the others fail.',
        'Walk the deck. Use the consoles. Then we will talk about your exam.',
      ],
    },
    {
      id: 'pip', name: 'Pip', role: 'Hydroponics', art: '/assets/potato-farmer.png',
      x: 500, y: 860, facing: 1, accent: '#9bd15a',
      lines: [
        'The grow lights are hungry today. More light, more starch, less power. That is the trade.',
        'If you ever get lost, open the map. The gold markers are assignments.',
      ],
    },
    {
      id: 'rover', name: 'Rover', role: 'Scout', art: '/assets/potato-traveller.png',
      x: 1120, y: 380, facing: -1, accent: '#e9c27b',
      lines: [
        'Try tapping the deck to walk. The autopilot follows the corridors.',
        'Keep your suit sealed near the airlock. Habitats are polite until they are not.',
      ],
    },
    {
      id: 'tater', name: 'Tater', role: 'Medic', art: '/assets/potato-researcher.png',
      x: 1420, y: 500, facing: -1, accent: '#6fd4e6',
      lines: [
        'Life support is more than air. Water recycling is the other half of the loop.',
        'If the gauges drop, do not panic. Fix the smallest problem first.',
      ],
    },
  ],
};
