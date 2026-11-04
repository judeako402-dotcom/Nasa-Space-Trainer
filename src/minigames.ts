import type { TaskKind } from './model';
import { shuffle } from './model';

type Complete = () => void;
type Cleanups = (() => void)[];

export function renderTaskGame(kind: TaskKind, host: HTMLElement, complete: Complete, cleanups: Cleanups, taskName?: string): void {
  switch (kind) {
    case 'wiring': renderWiring(host, complete); break;
    case 'swipe': renderSwipe(host, complete); break;
    case 'download': renderDownload(host, complete, cleanups); break;
    case 'fuel': renderClicker(host, complete, taskName ?? 'RESTORE POWER', 8, '⚡'); break;
    case 'calibrate': renderCalibrate(host, complete, cleanups); break;
    case 'inspect': renderInspect(host, complete); break;
    case 'shield': renderShield(host, complete); break;
    case 'garbage': renderHold(host, complete, cleanups, {
      help: 'Clear the reusable filter tray, then confirm the airflow indicator is back in range.',
      label: 'CLEAN FILTER',
      done: 'FILTER SERVICE COMPLETE',
      duration: 2200,
      className: 'garbage',
    }); break;
    case 'cards': renderCards(host, complete, taskName ?? 'Complete the task'); break;
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

function renderWiring(host: HTMLElement, complete: Complete): void {
  header(host, 'Connect each wire to its matching color.');
  const colors = ['#ef5350', '#42a5f5', '#ffd54f', '#66bb6a'];
  const leftColors = shuffle(colors);
  const rightColors = shuffle(colors);
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
  const status = statusLine(host, `0 / ${colors.length} CONNECTED`);
  let selected: string | null = null;
  let matched = 0;

  const makeNode = (color: string, side: 'left' | 'right'): HTMLButtonElement => {
    const button = document.createElement('button');
    button.className = `wire-node ${side}`;
    button.style.setProperty('--wire', color);
    button.setAttribute('aria-label', `${side} wire ${color}`);
    button.addEventListener('click', () => {
      if (button.classList.contains('matched')) return;
      if (side === 'left') {
        leftCol.querySelectorAll('.wire-node.selected').forEach(node => node.classList.remove('selected'));
        button.classList.add('selected');
        selected = color;
        return;
      }
      if (!selected) {
        status.textContent = 'PICK A LEFT WIRE FIRST';
        return;
      }
      if (selected === color) {
        const left = leftCol.querySelector<HTMLButtonElement>(`.wire-node.selected`);
        left?.classList.add('matched');
        left?.classList.remove('selected');
        button.classList.add('matched');
        matched += 1;
        status.textContent = `${matched} / ${colors.length} CONNECTED`;
        selected = null;
        if (matched >= colors.length) complete();
      } else {
        button.classList.add('wrong');
        window.setTimeout(() => button.classList.remove('wrong'), 320);
        status.textContent = 'WRONG WIRE — TRY AGAIN';
      }
    });
    return button;
  };

  leftColors.forEach(color => leftCol.append(makeNode(color, 'left')));
  rightColors.forEach(color => rightCol.append(makeNode(color, 'right')));
}

function renderSwipe(host: HTMLElement, complete: Complete): void {
  header(host, 'Follow the suit-lock checklist and pass the pressure-seal verification at a steady pace.');
  const track = document.createElement('div');
  track.className = 'swipe-track';
  const reader = document.createElement('div');
  reader.className = 'swipe-reader';
  reader.textContent = 'SUIT CHECK';
  const card = document.createElement('div');
  card.className = 'swipe-card';
  card.textContent = 'SEAL CHECK';
  track.append(reader, card);
  host.append(track);
  const status = statusLine(host, 'DRAG THE CARD →');
  let dragging = false;
  let startX = 0;
  let startTime = 0;
  let currentX = 0;

  const maxX = (): number => Math.max(1, track.clientWidth - card.clientWidth - 14);
  card.addEventListener('pointerdown', event => {
    dragging = true;
    startX = event.clientX;
    startTime = performance.now();
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener('pointermove', event => {
    if (!dragging) return;
    currentX = Math.max(0, Math.min(maxX(), event.clientX - startX));
    card.style.transform = `translateX(${currentX}px)`;
  });
  const release = (): void => {
    if (!dragging) return;
    dragging = false;
    const duration = performance.now() - startTime;
    const distance = currentX / maxX();
    if (distance > 0.88) {
      const speed = distance / (duration / 1000);
      if (speed > 0.32 && speed < 3.4) {
        status.textContent = 'CARD ACCEPTED';
        complete();
        return;
      }
      status.textContent = speed <= 0.32 ? 'TOO SLOW — TRY AGAIN' : 'TOO FAST — TRY AGAIN';
    }
    card.style.transform = 'translateX(0)';
    currentX = 0;
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
}

function renderDownload(host: HTMLElement, complete: Complete, cleanups: Cleanups): void {
  header(host, 'Download the station data to your tablet.');
  const visual = document.createElement('div');
  visual.className = 'download-visual';
  visual.innerHTML = '<span>▤</span><span>→</span><span>▣</span>';
  host.append(visual);
  const button = document.createElement('button');
  button.className = 'task-primary';
  button.textContent = 'START DOWNLOAD';
  host.append(button);
  const track = document.createElement('div');
  track.className = 'progress-track';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  track.append(fill);
  host.append(track);
  const status = statusLine(host, 'READY');
  let raf = 0;
  let started = false;
  button.addEventListener('click', () => {
    if (started) return;
    started = true;
    button.disabled = true;
    status.textContent = 'DOWNLOADING...';
    const start = performance.now();
    const tick = (): void => {
      const progress = Math.min(100, ((performance.now() - start) / 3000) * 100);
      fill.style.width = `${progress}%`;
      if (progress >= 100) {
        status.textContent = 'DOWNLOAD COMPLETE';
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
  header(host, `Tap the power panel targets to complete: ${label}.`);
  const grid = document.createElement('div');
  grid.className = 'clicker-grid';
  host.append(grid);
  const status = statusLine(host, `0 / ${count}`);
  let hits = 0;
  for (let i = 0; i < count; i += 1) {
    const button = document.createElement('button');
    button.className = 'clicker-target';
    button.textContent = icon;
    button.addEventListener('click', () => {
      if (button.classList.contains('done')) return;
      button.classList.add('done');
      hits += 1;
      status.textContent = `${hits} / ${count}`;
      if (hits >= count) complete();
    });
    grid.append(button);
  }
}

function renderCalibrate(host: HTMLElement, complete: Complete, cleanups: Cleanups): void {
  header(host, 'Stop the marker inside the green zone. Three clean calibrations required.');
  const track = document.createElement('div');
  track.className = 'calibrate-track';
  const zone = document.createElement('div');
  zone.className = 'calibrate-zone';
  const marker = document.createElement('div');
  marker.className = 'calibrate-marker';
  track.append(zone, marker);
  host.append(track);
  const button = document.createElement('button');
  button.className = 'task-primary';
  button.textContent = 'CALIBRATE';
  host.append(button);
  const status = statusLine(host, '0 / 3');
  let pos = 0;
  let direction = 1;
  let hits = 0;
  let raf = 0;
  const tick = (): void => {
    pos += direction * 0.011;
    if (pos >= 1) { pos = 1; direction = -1; }
    if (pos <= 0) { pos = 0; direction = 1; }
    marker.style.left = `${pos * 100}%`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  button.addEventListener('click', () => {
    if (pos > 0.42 && pos < 0.58) {
      hits += 1;
      status.textContent = `${hits} / 3`;
      if (hits >= 3) {
        cancelAnimationFrame(raf);
        complete();
      }
    } else {
      status.textContent = 'MISSED — TRY AGAIN';
    }
  });
  cleanups.push(() => cancelAnimationFrame(raf));
}

function renderInspect(host: HTMLElement, complete: Complete): void {
  header(host, 'One sample does not match the batch. Select the anomaly.');
  const odd = Math.floor(Math.random() * 5);
  const grid = document.createElement('div');
  grid.className = 'inspect-grid';
  host.append(grid);
  statusLine(host, 'SELECT A SAMPLE');
  for (let i = 0; i < 5; i += 1) {
    const button = document.createElement('button');
    button.className = `inspect-sample${i === odd ? ' odd' : ''}`;
    button.innerHTML = `<i></i><span>${String(i + 1).padStart(2, '0')}</span>`;
    button.addEventListener('click', () => {
      if (i === odd) {
        button.classList.add('selected');
        complete();
      } else {
        button.classList.add('wrong');
        window.setTimeout(() => button.classList.remove('wrong'), 320);
      }
    });
    grid.append(button);
  }
}

function renderShield(host: HTMLElement, complete: Complete): void {
  header(host, 'Activate all six shield nodes.');
  const grid = document.createElement('div');
  grid.className = 'shield-grid';
  host.append(grid);
  const status = statusLine(host, '0 / 6');
  let active = 0;
  for (let i = 0; i < 6; i += 1) {
    const button = document.createElement('button');
    button.className = 'shield-node';
    button.textContent = '⬡';
    button.addEventListener('click', () => {
      if (button.classList.contains('active')) return;
      button.classList.add('active');
      active += 1;
      status.textContent = `${active} / 6`;
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
  const help = options.help ?? 'Hold the override button for three seconds to stabilize the reactor.';
  const label = options.label ?? 'HOLD';
  const doneText = options.done ?? 'STABILIZED';
  const duration = options.duration ?? 3000;
  header(host, help);
  const button = document.createElement('button');
  button.className = `hold-button${options.className ? ` ${options.className}` : ''}`;
  button.textContent = label;
  host.append(button);
  const track = document.createElement('div');
  track.className = 'progress-track';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  track.append(fill);
  host.append(track);
  const status = statusLine(host, 'READY');
  let holding = false;
  let start = 0;
  let raf = 0;
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
  button.addEventListener('pointerdown', () => {
    holding = true;
    start = performance.now();
    status.textContent = 'HOLDING...';
    tick();
  });
  const release = (): void => {
    if (!holding) return;
    holding = false;
    cancelAnimationFrame(raf);
    fill.style.width = '0%';
    status.textContent = 'RELEASED — HOLD LONGER';
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointerleave', release);
  button.addEventListener('pointercancel', release);
  cleanups.push(() => {
    holding = false;
    cancelAnimationFrame(raf);
  });
}

function renderCards(host: HTMLElement, complete: Complete, taskName?: string): void {
  header(host, 'Match the symbols to complete the task.');
  const card = document.createElement('div');
  card.className = 'task-card-kenney';
  card.innerHTML = `
    <div class="card-head">
      <div class="eyebrow">TASK</div>
      <h2>${taskName ?? 'Cards Task'}</h2>
      <button class="close-btn" aria-label="Close task">×</button>
    </div>
    <div class="card-body">
      <div class="symbols-grid">
        <div class="symbol-box"><span>□</span></div>
        <div class="symbol-box"><span>◉</span></div>
        <div class="symbol-box"><span>✚</span></div>
        <div class="symbol-box"><span>△</span></div>
      </div>
      <p class="help-text">Match three symbols in a row to complete.</p>
    </div>
    <div class="card-footer">
      <span class="progress">0 / 3 MATCHED</span>
      <button class="primary-button">COMPLETE</button>
    </div>
  `;
  host.append(card);
  const symbols = card.querySelectorAll('.symbol-box');
  let matched = 0;
  const targetCount = 3;

  // Make symbols clickable
  symbols.forEach((symbol, _index) => {
    symbol.addEventListener('click', () => {
      symbol.classList.toggle('selected');
      if (symbol.classList.contains('selected')) {
        matched += 1;
        const progress = card.querySelector('.progress');
        if (progress) progress.textContent = `${matched} / ${targetCount} MATCHED`;
      } else {
        matched -= 1;
        const progress = card.querySelector('.progress');
        if (progress) progress.textContent = `${matched} / ${targetCount} MATCHED`;
      }
    });
  });

  card.querySelector('.primary-button')?.addEventListener('click', () => {
    if (matched >= targetCount) {
      complete();
    } else {
      // Show toast directly
      const toast = document.querySelector('#toast');
      if (toast) {
        toast.textContent = `Match ${targetCount} symbols to complete. Only ${matched} matched.`;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3400);
      }
    }
  });

  card.querySelector('.close-btn')?.addEventListener('click', () => {
    card.remove();
    complete();
  });

  card.addEventListener('click', event => {
    if (event.target === card) {
      card.remove();
      complete();
    }
  });
}
