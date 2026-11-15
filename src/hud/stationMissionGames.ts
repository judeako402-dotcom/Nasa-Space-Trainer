import { shuffle, type TaskKind } from '../model';
import { sfx } from '../sfx';

const ASSET_ROOT = '/assets/ui/spudnaut/assignments';

export const STATION_GAME_TIPS: Partial<Record<TaskKind, string>> = {
  pipes: 'Turn the pipes to make one path from the blue arrow to the valve. Then run the water!',
  folders: 'Tap the three folders to load the rocket. Then send the science files to Earth!',
  'grow-plant': 'Turn on the grow light and watch your sprout until the bar is full.',
  'circuit-slider': 'Move the red handle to the green mark, then lock in the power level.',
  'power-switches': 'Flip each lever to match the picture. Then reset the electric box.',
};

type Sprite = readonly [number, number, number, number];
type Finish = () => void;
type Cleanups = (() => void)[];

function art(file: string, [x, y, w, h]: Sprite, sourceWidth = 3072): string {
  // Keep the supplied transparent sprites intact and show the occupied part of each sheet.
  return `<span class="assignment-art" aria-hidden="true" style="aspect-ratio:${w}/${h}"><img src="${ASSET_ROOT}/${file}.png"
    alt="" draggable="false" style="width:${100 * sourceWidth / w}%;left:${-100 * x / w}%;top:${-100 * y / h}%" /></span>`;
}

function statusMessage(host: HTMLElement, initial: string): HTMLParagraphElement {
  const status = document.createElement('p');
  status.className = 'assignment-game-status';
  status.setAttribute('role', 'status');
  status.textContent = initial;
  host.append(status);
  return status;
}

export function mountStationMissionGame(kind: TaskKind, host: HTMLElement, finish: Finish, cleanups: Cleanups): boolean {
  if (!STATION_GAME_TIPS[kind]) return false;
  host.classList.add('assignment-game', 'station-mission-game');
  const board = document.createElement('div');
  board.className = `station-mission-board is-${kind}`;
  host.append(board);
  switch (kind) {
    case 'pipes': mountPipes(board, finish); break;
    case 'folders': mountFolders(board, finish, cleanups); break;
    case 'grow-plant': mountGrowLight(board, finish, cleanups); break;
    case 'circuit-slider': mountCircuitSlider(board, finish); break;
    case 'power-switches': mountSwitches(board, finish); break;
  }
  return true;
}

const PIPE_SPRITES = {
  source: [454, 380, 270, 337],
  elbow: [860, 465, 298, 298],
  straight: [1330, 465, 412, 184],
  valve: [1801, 462, 352, 250],
} as const;

function mountPipes(board: HTMLElement, finish: Finish): void {
  const pieces = [
    { col: 2, row: 2, kind: 'elbow', target: 0 },
    { col: 2, row: 3, kind: 'elbow', target: 2 },
    { col: 3, row: 3, kind: 'straight', target: 0 },
    { col: 4, row: 3, kind: 'elbow', target: 1 },
    { col: 4, row: 2, kind: 'elbow', target: 3 },
  ] as const;
  board.innerHTML = `<p class="station-mission-instruction">Connect the blue arrow to the valve.</p>
    <div class="station-art-console pipe-console">${art('pipe-board', [308, 276, 2451, 1917])}
      <div class="station-pipe-grid" role="group" aria-label="Water pipes">
        <span class="station-pipe-terminal" style="grid-area:2/1">${art('pipe-parts', PIPE_SPRITES.source)}</span>
        <span class="station-pipe-terminal" style="grid-area:2/5">${art('pipe-parts', PIPE_SPRITES.valve)}</span>
        ${pieces.map(({ col, row, kind }, index) => `<button type="button" class="station-pipe-piece" data-pipe-piece="${index}"
          style="grid-area:${row}/${col}">${art('pipe-parts', PIPE_SPRITES[kind])}</button>`).join('')}
      </div>
    </div>
    <button type="button" class="assignment-control" data-run-water disabled>Run water</button>`;
  const check = board.querySelector<HTMLButtonElement>('[data-run-water]')!;
  const status = statusMessage(board, 'Turn each pipe to connect the path.');
  const buttons = Array.from(board.querySelectorAll<HTMLButtonElement>('[data-pipe-piece]'));
  const directions = ['up', 'right', 'down', 'left'];
  const turns = pieces.map((piece, index) => (piece.target + (index % 2 ? 3 : 1)) % 4);
  const refresh = (): void => {
    let connected = 0;
    buttons.forEach((button, index) => {
      const piece = pieces[index]!;
      const turn = turns[index]!;
      const aligned = piece.kind === 'straight' ? turn % 2 === piece.target % 2 : turn === piece.target;
      const openings = (piece.kind === 'straight' ? [1, 3] : [3, 2]).map(side => directions[(side + turn) % 4]);
      button.style.setProperty('--pipe-turn', `${turn * 90}deg`);
      button.classList.toggle('is-aligned', aligned);
      button.setAttribute('aria-label', `Turn pipe ${index + 1}. It opens ${openings.join(' and ')}.${aligned ? ' Connected.' : ''}`);
      if (aligned) connected += 1;
    });
    check.disabled = connected !== pieces.length;
    status.textContent = `${connected} of ${pieces.length} pipes connected.`;
  };
  buttons.forEach((button, index) => button.addEventListener('click', () => {
    turns[index] = (turns[index]! + 1) % 4;
    sfx.click();
    refresh();
  }));
  check.addEventListener('click', finish);
  refresh();
}

function mountFolders(board: HTMLElement, finish: Finish, cleanups: Cleanups): void {
  board.innerHTML = `<p class="station-mission-instruction">Load the three folders into the rocket.</p>
    <div class="station-art-console folder-console">${art('folder-console', [118, 538, 2799, 2062])}
      <span class="station-folder-rocket">${art('folder-rocket', [1232, 1517, 227, 437])}</span>
      <div class="station-file-slots" role="group" aria-label="Science folders">
        ${[1, 2, 3].map(number => `<button type="button" data-load-folder aria-label="Load folder ${number}">${art('folder', [1638, 1517, 584, 437])}</button>`).join('')}
      </div>
      <button type="button" class="station-send-files" data-send-folders aria-label="Send files to Earth" disabled>Send</button>
    </div>`;
  const status = statusMessage(board, '0 of 3 folders loaded.');
  const send = board.querySelector<HTMLButtonElement>('[data-send-folders]')!;
  const folders = Array.from(board.querySelectorAll<HTMLButtonElement>('[data-load-folder]'));
  let loaded = 0;
  let launchTimer = 0;
  folders.forEach(folder => folder.addEventListener('click', () => {
    folder.disabled = true;
    folder.classList.add('is-loaded');
    folder.innerHTML = '<span aria-hidden="true">✓</span>';
    loaded += 1;
    send.disabled = loaded !== folders.length;
    status.textContent = loaded === folders.length ? 'All files ready. Send them to Earth!' : `${loaded} of ${folders.length} folders loaded.`;
    if (!send.disabled) send.focus();
    sfx.click();
  }));
  send.addEventListener('click', () => {
    send.disabled = true;
    board.classList.add('has-launched');
    status.textContent = 'Science files on their way!';
    launchTimer = window.setTimeout(finish, 560);
  });
  cleanups.push(() => window.clearTimeout(launchTimer));
}

function mountGrowLight(board: HTMLElement, finish: Finish, cleanups: Cleanups): void {
  board.innerHTML = `<div class="station-art-console grow-light-console">${art('grow-light', [353, 115, 3160, 1585], 3840)}</div>
    <progress class="station-growth-meter" max="100" value="0" aria-label="Plant growth"></progress>
    <button type="button" class="assignment-control" data-grow-light aria-pressed="false">Turn on grow light</button>`;
  const status = statusMessage(board, 'Your sprout is ready for some light!');
  const meter = board.querySelector<HTMLProgressElement>('progress')!;
  const light = board.querySelector<HTMLButtonElement>('[data-grow-light]')!;
  let interval = 0;
  light.addEventListener('click', () => {
    const wasOn = interval !== 0;
    window.clearInterval(interval);
    interval = 0;
    board.classList.toggle('is-lit', !wasOn);
    light.setAttribute('aria-pressed', String(!wasOn));
    light.textContent = wasOn ? 'Turn on grow light' : 'Turn off grow light';
    sfx.click();
    status.textContent = wasOn ? 'The sprout is waiting for light.' : 'Watch your sprout grow!';
    if (wasOn) return;
    interval = window.setInterval(() => {
      meter.value += 5;
      if (meter.value === meter.max) finish();
    }, 110);
  });
  cleanups.push(() => window.clearInterval(interval));
}

function mountCircuitSlider(board: HTMLElement, finish: Finish): void {
  const [target] = shuffle([35, 55, 75]);
  board.innerHTML = `<p class="station-mission-instruction">Slide the handle to ${target}%.</p>
    <div class="station-art-console circuit-slider-console">
      ${art('slider-console', [1119, 125, 812, 2907])}
      <span class="station-slider-target" aria-hidden="true"></span>
      <span class="station-slider-handle">${art('slider-handle', [1231, 730, 586, 272])}</span>
      <input type="range" min="0" max="100" step="5" value="15" data-circuit-slider aria-label="Power level, aim for ${target}%" />
    </div><button type="button" class="assignment-control" data-lock-slider disabled>Lock power level</button>`;
  const status = statusMessage(board, 'Move the handle toward the green mark.');
  const panel = board.querySelector<HTMLElement>('.circuit-slider-console')!;
  const slider = board.querySelector<HTMLInputElement>('input')!;
  const lock = board.querySelector<HTMLButtonElement>('[data-lock-slider]')!;
  const position = (value: number): string => `${92 - 68 * value / 100}%`;
  panel.style.setProperty('--slider-target', position(target!));
  const refresh = (): void => {
    const value = Number(slider.value);
    panel.style.setProperty('--slider-position', position(value));
    lock.disabled = Math.abs(value - target!) > 5;
    status.textContent = lock.disabled ? `Power level ${value}%. Aim for ${target}%.` : `Power level ${value}%. Ready to lock!`;
  };
  slider.addEventListener('input', refresh);
  lock.addEventListener('click', finish);
  refresh();
}

function mountSwitches(board: HTMLElement, finish: Finish): void {
  const targets = [true, false, true];
  board.innerHTML = `<div class="station-switch-layout">
      <div><p class="station-mission-instruction">Match this picture</p>
      ${art('switch-reference', [450, 115, 903, 852], 1920)}</div>
      <div><p class="station-mission-instruction">Your switches</p><div class="station-switch-bank" role="group" aria-label="Power switches">
        ${targets.map((_, index) => `<button type="button" class="station-switch" data-power-switch="${index}">
          <span class="station-switch-track" aria-hidden="true"><span></span></span><small></small></button>`).join('')}
      </div></div>
    </div><button type="button" class="assignment-control" data-reset-switches disabled>Reset electric box</button>`;
  const switches = Array.from(board.querySelectorAll<HTMLButtonElement>('[data-power-switch]'));
  const reset = board.querySelector<HTMLButtonElement>('[data-reset-switches]')!;
  const status = statusMessage(board, 'Flip the levers to match the picture.');
  const positions = targets.map(up => !up);
  const refresh = (): void => {
    let matches = 0;
    switches.forEach((lever, index) => {
      const up = positions[index]!;
      const matched = up === targets[index];
      lever.classList.toggle('is-up', up);
      lever.classList.toggle('is-matched', matched);
      lever.setAttribute('aria-label', `Switch ${index + 1} is ${up ? 'up' : 'down'}. Set it ${targets[index] ? 'up' : 'down'}.`);
      lever.querySelector('small')!.textContent = up ? 'Up' : 'Down';
      if (matched) matches += 1;
    });
    reset.disabled = matches !== switches.length;
    status.textContent = `${matches} of ${switches.length} switches match.`;
  };
  switches.forEach((lever, index) => lever.addEventListener('click', () => {
    positions[index] = !positions[index];
    refresh();
    sfx.click();
  }));
  reset.addEventListener('click', finish);
  refresh();
}
