import type { MissionMetric, TaskKind } from './model';
import { shuffle } from './model';
import { sfx } from './sfx';
import { assignmentGameTip, mountAssignmentGame } from './hud/assignmentGames';
import { mountStationMissionGame } from './hud/stationMissionGames';

type Complete = () => void;
type Cleanups = (() => void)[];

export interface ConsolePillarMeta {
  id: MissionMetric;
  label: string;
  bay: string;
  toolLabel: string;
  image: string;
  accent: string;
  scanSummary: string;
}

export const SYSTEM_CONSOLE_META: Record<MissionMetric, ConsolePillarMeta> = {
  life: {
    id: 'life',
    label: 'LIFE SUPPORT',
    bay: 'HULL & AIRLOCK CONSOLE',
    toolLabel: 'PRESSURE SEAL KIT',
    image: '/assets/ui/spudnaut/minigames/console-hull-panel.jpg',
    accent: '#6ec4ff',
    scanSummary: 'Valve manifold mapped. Apply Pressure Seal Kit below to lock containment.',
  },
  power: {
    id: 'power',
    label: 'POWER GRID',
    bay: 'SOLAR & BUS RELAY DECK',
    toolLabel: 'BUS RELAY DRIVER',
    image: '/assets/ui/spudnaut/minigames/console-power-bus.jpg',
    accent: '#ffd56a',
    scanSummary: 'Load imbalance isolated on main bus. Engage Bus Relay Driver to stabilize.',
  },
  research: {
    id: 'research',
    label: 'SCIENCE BAY',
    bay: 'SPECTROMETER & TELEMETRY',
    toolLabel: 'OPTIC LAB SCANNER',
    image: '/assets/ui/spudnaut/minigames/console-lab-tray.jpg',
    accent: '#9beeff',
    scanSummary: 'Sample carrier aligned. Use Optic Lab Scanner below to finish analysis.',
  },
  farm: {
    id: 'farm',
    label: 'HYDRO FARM',
    bay: 'SPUD AEROPONICS TRAY',
    toolLabel: 'NUTRIENT & LUX KIT',
    image: '/assets/ui/spudnaut/minigames/console-hydro-tray.jpg',
    accent: '#8fe6a8',
    scanSummary: 'Root misting manifold checked. Apply Nutrient & Lux Kit to restore yield.',
  },
};

export function inferTaskSystem(kind: TaskKind, taskName = ''): MissionMetric {
  const lower = taskName.toLowerCase();
  if (lower.includes('grow-light') || lower.includes('hydroponic') || lower.includes('nutrient') || lower.includes('farm') || lower.includes('greenhouse')) {
    return lower.includes('power') ? 'power' : 'farm';
  }
  if (lower.includes('power') || lower.includes('battery') || lower.includes('solar') || lower.includes('thermal') || kind === 'fuel' || kind === 'wiring') {
    return 'power';
  }
  if (lower.includes('scrubber') || lower.includes('water') || lower.includes('suit') || lower.includes('seal') || lower.includes('pressure') || lower.includes('hull') || kind === 'shield' || kind === 'swipe' || kind === 'garbage' || kind === 'cards') {
    return 'life';
  }
  return 'research';
}

export function renderTaskGame(
  kind: TaskKind,
  host: HTMLElement,
  complete: Complete,
  cleanups: Cleanups,
  taskName?: string,
  system?: MissionMetric,
): void {
  if (mountStationMissionGame(kind, host, complete, cleanups)) return;
  if (mountAssignmentGame(kind, host, complete, cleanups)) return;
  if (kind === 'wiring' && taskName === 'Spark-Wire Color Match') {
    renderWiring(host, complete, cleanups);
    return;
  }
  const resolvedSystem = system ?? inferTaskSystem(kind, taskName);
  const meta = SYSTEM_CONSOLE_META[resolvedSystem];

  const shell = document.createElement('div');
  shell.className = `spud-console-shell is-system-${resolvedSystem}`;
  shell.style.setProperty('--console-accent', meta.accent);
  shell.innerHTML = `
    <div class="spud-console-banner">
      <img class="spud-console-art" src="${meta.image}" alt="" draggable="false" />
      <div class="spud-console-banner-scrim" aria-hidden="true"></div>
      <div class="spud-console-banner-copy">
        <span class="spud-console-bay">${meta.bay}</span>
        <strong class="spud-console-step-tag" data-step-tag>STEP 1 OF 2 · DIAGNOSTIC SCAN</strong>
      </div>
    </div>
    <div class="spud-tool-dock" role="group" aria-label="Console diagnostic tool dock">
      <button type="button" class="spud-tool-btn is-scan is-ready" data-tool-btn="scan">
        <span class="spud-tool-index">01</span>
        <span class="spud-tool-text">
          <strong>SCAN FAULT</strong>
          <small>Run telemetry check</small>
        </span>
      </button>
      <button type="button" class="spud-tool-btn is-kit" data-tool-btn="kit" disabled>
        <span class="spud-tool-index">02</span>
        <span class="spud-tool-text">
          <strong>${meta.toolLabel}</strong>
          <small data-kit-state>Locked until scan</small>
        </span>
      </button>
    </div>
    <p class="spud-console-scan-note" data-scan-note aria-live="polite">Step 1: Press SCAN FAULT to unlock the ${meta.toolLabel.toLowerCase()} board.</p>
    <div class="spud-console-board is-locked" data-console-board></div>
  `;
  host.append(shell);

  const scanBtn = shell.querySelector<HTMLButtonElement>('[data-tool-btn="scan"]')!;
  const kitBtn = shell.querySelector<HTMLButtonElement>('[data-tool-btn="kit"]')!;
  const kitState = shell.querySelector<HTMLElement>('[data-kit-state]')!;
  const stepTag = shell.querySelector<HTMLElement>('[data-step-tag]')!;
  const scanNote = shell.querySelector<HTMLElement>('[data-scan-note]')!;
  const board = shell.querySelector<HTMLDivElement>('[data-console-board]')!;

  let boardMounted = false;
  const unlockBoard = (): void => {
    if (boardMounted) return;
    boardMounted = true;
    sfx.click();
    scanBtn.classList.remove('is-ready');
    scanBtn.classList.add('is-done');
    scanBtn.setAttribute('aria-pressed', 'true');
    scanBtn.disabled = true;
    kitBtn.disabled = false;
    kitBtn.classList.add('is-active');
    kitBtn.setAttribute('aria-pressed', 'true');
    kitState.textContent = 'Active on console';
    stepTag.textContent = `STEP 2 OF 2 · ${meta.toolLabel}`;
    scanNote.textContent = meta.scanSummary;
    board.classList.remove('is-locked');
    mountBoardKind(kind, board, complete, cleanups, taskName, resolvedSystem);
    const firstControl = board.querySelector<HTMLElement>('button, [tabindex="0"]');
    firstControl?.focus({ preventScroll: true });
  };

  scanBtn.addEventListener('click', unlockBoard);
  kitBtn.addEventListener('click', () => {
    if (!boardMounted) return;
    board.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  });
}

function mountBoardKind(
  kind: TaskKind,
  host: HTMLElement,
  complete: Complete,
  cleanups: Cleanups,
  taskName: string | undefined,
  system: MissionMetric,
): void {
  switch (kind) {
    case 'wiring': renderWiring(host, complete, cleanups); break;
    case 'swipe': renderSwipe(host, complete, cleanups); break;
    case 'download': renderDownload(host, complete, cleanups); break;
    case 'fuel': renderClicker(host, complete, taskName ?? 'RESTORE POWER', 8, '⚡'); break;
    case 'calibrate': renderCalibrate(host, complete, cleanups, system); break;
    case 'inspect': renderInspect(host, complete, cleanups, system); break;
    case 'shield': renderShield(host, complete); break;
    case 'garbage': renderHold(host, complete, cleanups, {
      help: 'Hold to purge clogged intake particulates until airflow returns to nominal.',
      label: 'CLEAN FILTER',
      done: 'FILTER SERVICE COMPLETE',
      duration: 2000,
      className: 'garbage',
    }); break;
    case 'cards': renderCards(host, complete); break;
  }
}

function header(host: HTMLElement, help: string): void {
  const p = document.createElement('p');
  p.className = 'task-help';
  p.textContent = help;
  host.append(p);
}

function statusLine(host: HTMLElement, text: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'task-status';
  div.setAttribute('role', 'status');
  div.setAttribute('aria-live', 'polite');
  div.textContent = text;
  host.append(div);
  return div;
}

function renderWiring(host: HTMLElement, complete: Complete, cleanups: Cleanups): void {
  header(host, assignmentGameTip('wiring')!);
  const channels = [
    { color: '#ef5350', name: 'RED 24V' },
    { color: '#42a5f5', name: 'CYAN BUS' },
    { color: '#ffd54f', name: 'AMBER AUX' },
    { color: '#66bb6a', name: 'GREEN GND' },
  ];
  const leftColors = shuffle(channels);
  const rightColors = shuffle(channels);
  const board = document.createElement('div');
  board.className = 'wiring-board';
  const leftCol = document.createElement('div');
  leftCol.className = 'wire-column';
  const middle = document.createElement('div');
  middle.className = 'wire-middle';
  middle.textContent = '⚡';
  const rightCol = document.createElement('div');
  rightCol.className = 'wire-column';
  board.append(leftCol, middle, rightCol);
  host.append(board);
  const status = statusLine(host, `0 / ${channels.length} CONNECTED`);
  let selected: string | null = null;
  let matched = 0;
  const wrongTimers: number[] = [];
  cleanups.push(() => {
    while (wrongTimers.length) window.clearTimeout(wrongTimers.pop());
  });

  const makeNode = (entry: { color: string; name: string }, side: 'left' | 'right'): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `wire-node ${side}`;
    button.style.setProperty('--wire', entry.color);
    button.setAttribute('aria-label', `${side} ${entry.name} wire`);
    button.addEventListener('click', () => {
      if (button.classList.contains('matched')) return;
      if (side === 'left') {
        leftCol.querySelectorAll('.wire-node.selected').forEach((node) => node.classList.remove('selected'));
        button.classList.add('selected');
        selected = entry.color;
        sfx.click();
        status.textContent = `${entry.name} SELECTED — PICK MATCHING SOCKET`;
        return;
      }
      if (!selected) {
        status.textContent = 'PICK A LEFT TERMINAL FIRST';
        return;
      }
      if (selected === entry.color) {
        const left = leftCol.querySelector<HTMLButtonElement>('.wire-node.selected');
        left?.classList.add('matched');
        left?.classList.remove('selected');
        button.classList.add('matched');
        matched += 1;
        sfx.click();
        status.textContent = `${matched} / ${channels.length} CONNECTED`;
        selected = null;
        if (matched >= channels.length) complete();
      } else {
        button.classList.add('wrong');
        wrongTimers.push(window.setTimeout(() => button.classList.remove('wrong'), 320));
        status.textContent = 'WRONG TERMINAL — TRY AGAIN';
      }
    });
    return button;
  };

  leftColors.forEach((entry) => leftCol.append(makeNode(entry, 'left')));
  rightColors.forEach((entry) => rightCol.append(makeNode(entry, 'right')));
}

function renderSwipe(host: HTMLElement, complete: Complete, cleanups: Cleanups): void {
  header(host, 'Slide the gasket lock smoothly across the track (or press Enter / Space).');
  const track = document.createElement('div');
  track.className = 'swipe-track';
  const reader = document.createElement('div');
  reader.className = 'swipe-reader';
  reader.textContent = 'SUIT CHECK';
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'swipe-card';
  card.textContent = 'SEAL CHECK';
  card.setAttribute('aria-label', 'Slide seal card right (or press Enter / Space to run verification)');
  track.append(reader, card);
  host.append(track);
  const status = statusLine(host, 'DRAG CARD TO LOCK →');
  let activePointer: number | null = null;
  let startX = 0;
  let startTime = 0;
  let currentX = 0;
  let verifyTimer = 0;
  let touchDrag = false;

  const maxX = (): number => Math.max(1, track.clientWidth - card.clientWidth - 14);
  const resetDrag = (): void => {
    activePointer = null;
    card.style.transform = 'translateX(0)';
    currentX = 0;
  };
  card.addEventListener('pointerdown', (event) => {
    if (activePointer !== null || event.button !== 0 || verifyTimer) return;
    activePointer = event.pointerId;
    touchDrag = event.pointerType !== 'mouse';
    startX = event.clientX;
    startTime = performance.now();
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener('pointermove', (event) => {
    if (activePointer !== event.pointerId) return;
    currentX = Math.max(0, Math.min(maxX(), event.clientX - startX));
    card.style.transform = `translateX(${currentX}px)`;
  });
  const release = (event: PointerEvent): void => {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    const distance = currentX / maxX();
    if (event.type === 'pointerup' && distance > (touchDrag ? 0.8 : 0.88)) {
      const speed = distance / Math.max(0.05, (performance.now() - startTime) / 1000);
      // Thumbs move more deliberately than a mouse, so relax both ends of the
      // timing window instead of rejecting a careful drag as "TOO SLOW".
      const minSpeed = touchDrag ? 0.16 : 0.32;
      const maxSpeed = touchDrag ? 6 : 3.4;
      if (speed > minSpeed && speed < maxSpeed) {
        status.textContent = 'SEAL VERIFIED';
        complete();
        return;
      }
      status.textContent = speed <= minSpeed ? 'TOO SLOW — TRY AGAIN' : 'TOO FAST — TRY AGAIN';
    }
    resetDrag();
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
  card.addEventListener('lostpointercapture', release);
  card.addEventListener('keydown', (event) => {
    if (verifyTimer || (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    status.textContent = 'VERIFYING SEAL...';
    card.style.transform = `translateX(${maxX()}px)`;
    verifyTimer = window.setTimeout(() => {
      verifyTimer = 0;
      status.textContent = 'SEAL VERIFIED';
      complete();
    }, 600);
  });
  const onWindowBlur = (): void => resetDrag();
  window.addEventListener('blur', onWindowBlur);
  cleanups.push(() => {
    window.removeEventListener('blur', onWindowBlur);
    if (verifyTimer) window.clearTimeout(verifyTimer);
  });
}

function renderDownload(host: HTMLElement, complete: Complete, cleanups: Cleanups): void {
  header(host, 'Transfer validated packet stream from the lab console to Earth Relay.');
  const visual = document.createElement('div');
  visual.className = 'download-visual';
  visual.innerHTML = '<span>▤ LAB</span><span>→</span><span>▣ EARTH</span>';
  host.append(visual);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'task-primary';
  button.textContent = 'START TRANSFER';
  host.append(button);
  const track = document.createElement('div');
  track.className = 'progress-track';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  track.append(fill);
  host.append(track);
  const status = statusLine(host, 'READY TO TRANSMIT');
  let raf = 0;
  let started = false;
  button.addEventListener('click', () => {
    if (started) return;
    started = true;
    sfx.click();
    button.disabled = true;
    status.textContent = 'TRANSFERRING TELEMETRY...';
    const start = performance.now();
    const tick = (): void => {
      const progress = Math.min(100, ((performance.now() - start) / 2400) * 100);
      fill.style.width = `${progress}%`;
      if (progress >= 100) {
        status.textContent = 'TRANSFER COMPLETE';
        complete();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  cleanups.push(() => cancelAnimationFrame(raf));
}

function renderClicker(host: HTMLElement, complete: Complete, label: string, count: number, icon: string): void {
  header(host, `Engage all ${count} battery bank breaker cells: ${label}.`);
  const grid = document.createElement('div');
  grid.className = 'clicker-grid';
  host.append(grid);
  const status = statusLine(host, `0 / ${count} ONLINE`);
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clicker-target';
    button.innerHTML = `<span>${icon}</span><small>${String(i + 1).padStart(2, '0')}</small>`;
    button.setAttribute('aria-label', `Engage breaker cell ${i + 1}`);
    button.addEventListener('click', () => {
      if (button.classList.contains('done')) return;
      button.classList.add('done');
      hits += 1;
      sfx.click();
      status.textContent = `${hits} / ${count} ONLINE`;
      if (hits >= count) complete();
    });
    grid.append(button);
  }
}

function renderCalibrate(
  host: HTMLElement,
  complete: Complete,
  cleanups: Cleanups,
  system: MissionMetric,
): void {
  const prompt = system === 'farm'
    ? 'Lock the PAR grow-light wave inside the emerald band three times.'
    : system === 'research'
      ? 'Center the spectrometer beam inside the cyan sweet spot three times.'
      : 'Lock the phase marker inside the target band three times.';
  header(host, prompt);
  const track = document.createElement('div');
  track.className = 'calibrate-track';
  const zone = document.createElement('div');
  zone.className = 'calibrate-zone';
  const marker = document.createElement('div');
  marker.className = 'calibrate-marker';
  track.append(zone, marker);
  host.append(track);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'task-primary';
  button.textContent = 'CALIBRATE';
  host.append(button);
  const status = statusLine(host, '0 / 3 LOCKED');
  // Thumbs need a slightly bigger target than a mouse cursor on a 1.55 s sweep.
  const coarsePointer = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const hitLow = coarsePointer ? 0.34 : 0.39;
  const hitHigh = coarsePointer ? 0.66 : 0.61;
  let pos = 0;
  let hits = 0;
  let raf = 0;
  let pass = 0;
  let lastHitPass = -1;
  const start = performance.now();
  const tick = (now: number): void => {
    const progress = Math.max(0, now - start) / 1550;
    pass = Math.floor(progress);
    const fraction = progress - pass;
    pos = pass % 2 === 0 ? fraction : 1 - fraction;
    marker.style.left = `${pos * 100}%`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  button.addEventListener('click', () => {
    if (pos > hitLow && pos < hitHigh) {
      if (lastHitPass === pass) return;
      lastHitPass = pass;
      hits += 1;
      sfx.click();
      status.textContent = `${hits} / 3 LOCKED`;
      if (hits >= 3) {
        cancelAnimationFrame(raf);
        complete();
      }
    } else {
      status.textContent = 'OUT OF BAND — TRY AGAIN';
    }
  });
  cleanups.push(() => cancelAnimationFrame(raf));
}

function renderInspect(
  host: HTMLElement,
  complete: Complete,
  cleanups: Cleanups,
  system: MissionMetric,
): void {
  const isFarm = system === 'farm';
  header(
    host,
    isFarm
      ? 'Four aeroponic pods hold nominal pH. Flag the imbalanced pod tray.'
      : 'One regolith core sample shows off-nominal fluorescence. Select the anomaly.',
  );
  const odd = Math.floor(Math.random() * 5);
  const grid = document.createElement('div');
  grid.className = 'inspect-grid';
  host.append(grid);
  const status = statusLine(host, isFarm ? 'INSPECT POD TRAYS' : 'SELECT ANOMALOUS CORE');
  const timers: number[] = [];
  cleanups.push(() => {
    while (timers.length) window.clearTimeout(timers.pop());
  });
  for (let i = 0; i < 5; i += 1) {
    const isOdd = i === odd;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `inspect-sample${isOdd ? ' odd' : ''}`;
    const readout = isFarm
      ? (isOdd ? 'pH 8.4' : 'pH 6.2')
      : (isOdd ? 'FLUX!' : 'NOM');
    button.innerHTML = `<i></i><span>${String(i + 1).padStart(2, '0')}</span><small>${readout}</small>`;
    button.setAttribute('aria-label', `${isFarm ? 'Pod' : 'Sample'} ${i + 1} readout ${readout}`);
    button.addEventListener('click', () => {
      if (isOdd) {
        button.classList.add('selected');
        sfx.click();
        status.textContent = 'ANOMALY ISOLATED';
        complete();
      } else {
        button.classList.add('wrong');
        status.textContent = `${isFarm ? 'POD' : 'SAMPLE'} ${String(i + 1).padStart(2, '0')} NOMINAL — KEEP CHECKING`;
        timers.push(window.setTimeout(() => button.classList.remove('wrong'), 320));
      }
    });
    grid.append(button);
  }
}

function renderShield(host: HTMLElement, complete: Complete): void {
  header(host, 'Engage all six magnetic bulkhead seal actuators.');
  const grid = document.createElement('div');
  grid.className = 'shield-grid';
  host.append(grid);
  const status = statusLine(host, '0 / 6 SEALED');
  let active = 0;
  for (let i = 0; i < 6; i += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shield-node';
    button.innerHTML = `<span>⬡</span><small>S${i + 1}</small>`;
    button.setAttribute('aria-label', `Activate shield actuator S${i + 1}`);
    button.addEventListener('click', () => {
      if (button.classList.contains('active')) return;
      button.classList.add('active');
      active += 1;
      sfx.click();
      status.textContent = `${active} / 6 SEALED`;
      if (active >= 6) complete();
    });
    grid.append(button);
  }
}

function renderHold(
  host: HTMLElement,
  complete: Complete,
  cleanups: Cleanups,
  options: { help?: string; label?: string; done?: string; duration?: number; className?: string } = {},
): void {
  const help = options.help ?? 'Hold the override switch until containment locks.';
  const label = options.label ?? 'HOLD';
  const doneText = options.done ?? 'STABILIZED';
  const duration = options.duration ?? 2200;
  header(host, help);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `hold-button${options.className ? ` ${options.className}` : ''}`;
  button.textContent = label;
  host.append(button);
  const track = document.createElement('div');
  track.className = 'progress-track';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  track.append(fill);
  host.append(track);
  const status = statusLine(host, 'HOLD BUTTON OR SPACE / ENTER');
  let holding = false;
  let start = 0;
  let raf = 0;
  let capturedPointer: number | null = null;
  const tick = (): void => {
    if (!holding) return;
    const progress = Math.min(100, ((performance.now() - start) / duration) * 100);
    fill.style.width = `${progress}%`;
    if (progress >= 100) {
      holding = false;
      status.textContent = doneText;
      complete();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const beginHold = (): void => {
    if (holding) return;
    holding = true;
    start = performance.now();
    status.textContent = 'PURGING...';
    tick();
  };
  const release = (): void => {
    if (!holding) return;
    holding = false;
    cancelAnimationFrame(raf);
    fill.style.width = '0%';
    status.textContent = 'RELEASED — HOLD UNTIL COMPLETE';
  };
  button.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    // Capture the pointer so a finger that drifts off the button keeps holding.
    // Releasing on `pointerleave` used to cancel the purge halfway through.
    capturedPointer = event.pointerId;
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an optimisation; the fallback listeners still cover us.
    }
    beginHold();
  });
  const endHold = (event?: PointerEvent): void => {
    if (event && capturedPointer !== null && event.pointerId !== capturedPointer) return;
    capturedPointer = null;
    release();
  };
  button.addEventListener('pointerup', endHold);
  button.addEventListener('pointercancel', endHold);
  button.addEventListener('lostpointercapture', endHold);
  button.addEventListener('pointerleave', (event) => {
    if (button.hasPointerCapture(event.pointerId)) return;
    endHold(event);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) beginHold();
  });
  button.addEventListener('keyup', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    release();
  });
  button.addEventListener('blur', () => endHold());
  cleanups.push(() => {
    holding = false;
    capturedPointer = null;
    cancelAnimationFrame(raf);
  });
}

function renderCards(host: HTMLElement, complete: Complete): void {
  header(host, 'Arm any three containment interlock seals, then press COMPLETE.');
  const task = document.createElement('div');
  task.className = 'spud-cards-task';
  task.innerHTML = `
    <div class="spud-symbols-grid">
      <button class="spud-symbol-tile" type="button" aria-pressed="false" aria-label="Square gasket seal"><span>□</span></button>
      <button class="spud-symbol-tile" type="button" aria-pressed="false" aria-label="Core ring seal"><span>◉</span></button>
      <button class="spud-symbol-tile" type="button" aria-pressed="false" aria-label="Cross valve seal"><span>✚</span></button>
      <button class="spud-symbol-tile" type="button" aria-pressed="false" aria-label="Delta hatch seal"><span>△</span></button>
    </div>
    <div class="spud-cards-footer">
      <span class="task-status">0 / 3 ARMED</span>
      <button class="task-primary" type="button">COMPLETE</button>
    </div>
  `;
  host.append(task);

  const tiles = [...task.querySelectorAll<HTMLButtonElement>('.spud-symbol-tile')];
  const statusEl = task.querySelector<HTMLElement>('.task-status')!;
  const submitBtn = task.querySelector<HTMLButtonElement>('.task-primary')!;
  const targetCount = 3;
  let matched = 0;

  tiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      const next = !tile.classList.contains('selected');
      tile.classList.toggle('selected', next);
      tile.setAttribute('aria-pressed', String(next));
      matched += next ? 1 : -1;
      sfx.click();
      statusEl.textContent = `${matched} / ${targetCount} ARMED`;
    });
  });

  submitBtn.addEventListener('click', () => {
    if (matched >= targetCount) {
      complete();
      return;
    }
    statusEl.textContent = `ARM ${targetCount - matched} MORE (${matched} / ${targetCount})`;
  });
}
