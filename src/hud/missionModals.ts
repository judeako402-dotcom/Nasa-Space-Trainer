import {
  destinationById, getColor, getRoomName, persistSave, specialistById, taskById,
  type MissionMetric, type MissionMetrics, type TaskDef, type TaskKind,
} from '../model';
import { routes, type DialogueOptions } from '../app/router';
import {
  activeMap, configureScene, dom, effectivePlayerHelmet, escapeHtml, isMissionActive, missionDayNumber,
  pauseForModal, pauseMissionForModal, resumeFromModal, resumeMissionAfterModal,
  session, showToast, walkStationTo,
} from '../app/session';
import { supportsHelmetArt } from '../game/assets/characterSprites';
import { StationMapUrls } from '../game/assets/AssetKeys';
import { inferTaskSystem, renderTaskGame, SYSTEM_CONSOLE_META } from '../minigames';
import { sfx } from '../sfx';
import { assignmentGameTip } from './assignmentGames';
import { COMMANDER_ART } from '../data/missionOpening';
import { criticalStatus } from '../sim/checkpoints';
import { failMissionToCheckpoint, handleEmergencyRepair, rewindMission, saveCheckpoint } from '../screens/missionScreens';
import { applyTaskCompletion, clamp, metricDeltas, taskExchange } from '../sim/mission';
import { METRIC_LABELS, renderArcadeButton, renderCharacterSpriteThumb, renderConstellationAction, renderConstellationIcon } from '../ui/icons';
import { clearActiveModals, mountCustomModal } from '../ui/modalController';
import { metricChips, setHudDrawer, syncHelmetButton, toggleHudDrawer, togglePlayerHelmet, updateHUD } from './hudController';

function resolveDialoguePortrait(speaker: string, art: string): string {
  const lowerSpeaker = speaker.toLowerCase();
  const lowerArt = art.toLowerCase();
  if (lowerSpeaker.includes('rover') || lowerArt.includes('traveller') || lowerArt.includes('explorer')) {
    return '/assets/ui/spudnaut/portrait-traveller.png';
  }
  if (lowerSpeaker.includes('pip') || lowerArt.includes('farmer')) {
    return '/assets/ui/spudnaut/portrait-farmer.png';
  }
  if (lowerSpeaker.includes('chip') || lowerSpeaker.includes('spud.i.e') || lowerArt.includes('researcher')) {
    return '/assets/ui/spudnaut/portrait-researcher.png';
  }
  if (lowerSpeaker.includes('tater') || lowerArt.includes('repairman')) {
    return '/assets/ui/spudnaut/portrait-repairman.png';
  }
  return '/assets/ui/spudnaut/portrait-default.png';
}

export function showDialogue(options: DialogueOptions): void {
  const { modalRoot } = dom();
  pauseForModal();
  let index = 0;
  let closed = false;
  const commander = options.speaker.toLowerCase().includes('russet');
  const { advanceKey, spotlight } = options;
  const spotlightSelectors = {
    tasks: '.hud-left-rail [data-action="tasks"]',
    'task-drawer': '#hud-drawer-panel[data-mode="tasks"]',
    'status-drawer': '#hud-drawer-panel[data-mode="status"]',
    guide: undefined,
  };
  const spotlightSelector = spotlight && spotlightSelectors[spotlight];
  const shade = document.createElement('div');
  shade.className = 'modal-shade spud-dialogue-backdrop';
  shade.classList.toggle('has-commander', commander);
  shade.classList.toggle('is-task-spotlight', Boolean(spotlightSelector));
  shade.classList.toggle('is-drawer-spotlight', spotlight === 'task-drawer' || spotlight === 'status-drawer');
  shade.classList.toggle('is-guide-briefing', spotlight === 'guide');
  if (advanceKey) shade.dataset.dialogueKey = advanceKey;
  const spotlightTarget = spotlightSelector ? document.querySelector(spotlightSelector) : null;
  const positionSpotlight = (): void => {
    const rect = spotlightTarget?.getBoundingClientRect();
    if (!rect) return;
    shade.style.setProperty('--spotlight-x', `${rect.x - 5}px`);
    shade.style.setProperty('--spotlight-y', `${rect.y - 5}px`);
    shade.style.setProperty('--spotlight-width', `${rect.width + 10}px`);
    shade.style.setProperty('--spotlight-height', `${rect.height + 10}px`);
  };
  if (spotlightTarget) {
    positionSpotlight();
    window.addEventListener('resize', positionSpotlight);
    spotlightTarget.addEventListener('animationend', positionSpotlight);
  }
  const finishClose = (): void => {
    if (closed) return;
    closed = true;
    clearActiveModals(modalRoot, { restoreFocus: true });
    resumeFromModal();
    options.onClose?.();
  };
  const handleShortcut = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!event.isTrusted || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey
      || event.key.toUpperCase() !== advanceKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sfx.click();
    finishClose();
  };
  mountCustomModal({
    modalRoot,
    node: shade,
    onCleanup: () => {
      window.removeEventListener('resize', positionSpotlight);
      spotlightTarget?.removeEventListener('animationend', positionSpotlight);
      document.removeEventListener('keydown', handleShortcut, true);
      if (closed) return;
      closed = true;
      resumeFromModal();
      if (!advanceKey) options.onClose?.();
    },
  });
  if (advanceKey) document.addEventListener('keydown', handleShortcut, true);
  else shade.addEventListener('click', (event) => {
    if (event.target === shade) finishClose();
  });
  const portraitSrc = resolveDialoguePortrait(options.speaker, options.art);
  const paint = (): void => {
    const line = options.lines[index] ?? '';
    const isLast = index >= options.lines.length - 1;
    const actionLabel = advanceKey ? 'CONTINUE' : isLast ? 'CLOSE' : 'NEXT';
    shade.innerHTML = `
      ${spotlightSelector ? '<div class="spud-dialogue-task-spotlight" aria-hidden="true"></div>' : ''}
      <section class="spud-dialogue-arcade${commander ? ' has-commander' : ''}" style="--accent:${options.accent}" role="dialog" aria-modal="true" aria-label="${escapeHtml(options.speaker)}" aria-describedby="commander-dialogue-line" tabindex="-1">
        ${commander
          ? `<div class="spud-commander-model" aria-hidden="true"><img src="${COMMANDER_ART}" alt="" draggable="false" /></div>`
          : `<div class="spud-dialogue-badge is-portrait" aria-hidden="true"><img src="${escapeHtml(portraitSrc)}" alt="" draggable="false" /></div>`}
        <header class="spud-dialogue-header">
          <span class="spud-dialogue-role">${escapeHtml(options.role)}</span>
          <h2 class="spud-dialogue-speaker">${escapeHtml(options.speaker)}</h2>
          <hr class="spud-dialogue-rule" />
        </header>
        <p id="commander-dialogue-line" class="dialogue-line spud-dialogue-quote">${escapeHtml(line)}</p>
        <footer class="spud-dialogue-arcade-footer">
          <span class="spud-dialogue-pager">${options.lines.length > 1 ? `${index + 1} / ${options.lines.length}` : ''}</span>
          ${advanceKey ? `<span class="spud-dialogue-key-prompt">Press <kbd>${advanceKey}</kbd> or tap the button</span>` : ''}
          ${renderArcadeButton({
            label: actionLabel,
            attrs: 'data-dialogue-next',
            ariaLabel: advanceKey ? 'Continue briefing' : isLast ? 'Close dialogue' : 'Next line',
            size: 'md',
            extraClass: 'spud-dialogue-cta',
          })}
        </footer>
      </section>
    `;
    if (advanceKey) {
      shade.querySelector<HTMLElement>('[role="dialog"]')?.focus();
    }
    const action = shade.querySelector<HTMLButtonElement>('[data-dialogue-next]')!;
    action.addEventListener('click', () => {
      sfx.click();
      // Commander briefings advance through their own key path; a tap mirrors it
      // exactly so touch players are never stranded behind an `inert` backdrop.
      if (advanceKey) {
        finishClose();
        return;
      }
      if (index < options.lines.length - 1) {
        index += 1;
        paint();
      } else finishClose();
    });
    if (!advanceKey) action.focus();
  };
  paint();
}

export function openMinigameModal(options: {
  eyebrow: string;
  title: string;
  kind: TaskKind;
  system?: MissionMetric;
  effect?: Partial<MissionMetrics>;
  tip?: string;
  onClose: () => void;
  onComplete: () => void;
}): void {
  const { modalRoot } = dom();
  const resolvedSystem: MissionMetric = options.system ?? inferTaskSystem(options.kind, options.title);
  const meta = SYSTEM_CONSOLE_META[resolvedSystem];
  const inMission = session.currentScreen === 'mission';
  const metricVal = Math.round(session.mission.metrics[resolvedSystem]);
  const isCritical = inMission && metricVal < 50;
  const spec = specialistById(session.lobby.specialist);
  const tip = options.tip ?? assignmentGameTip(options.kind);

  const shade = document.createElement('div');
  shade.className = 'modal-shade';
  const box = document.createElement('section');
  box.className = `spud-modal-frame task-card spud-console-tablet is-system-${resolvedSystem}`;
  box.style.setProperty('--console-accent', meta.accent);
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', options.title);
  box.innerHTML = `
    <div class="spud-modal-top">
      <div class="spud-console-head-copy">
        <span class="spud-console-badge">TASK CONSOLE</span>
        <span class="spud-constellation-kicker" style="margin-bottom:2px;">${escapeHtml(options.eyebrow)}</span>
        <h2 class="spud-comic-heading is-sub">${escapeHtml(options.title)}</h2>
      </div>
      <button class="spud-constellation-close" type="button" data-close aria-label="Close task">
        ${renderConstellationIcon('close')}
        <span>BACK</span>
      </button>
    </div>
    <div class="spud-console-meta-bar">
      <span class="spud-console-pill is-pillar">${escapeHtml(meta.label)}</span>
      <span class="spud-console-pill">${inMission ? `${escapeHtml(METRIC_LABELS[resolvedSystem].toUpperCase())} ${metricVal}%` : 'TRAINING SIM'}</span>
      <span class="spud-console-pill is-perk">${escapeHtml(spec.role.toUpperCase())}</span>
      ${isCritical ? '<span class="spud-console-alert"><img src="/assets/ui/spudnaut/badge-override-alert.jpg" alt="" width="20" height="20" draggable="false" />CRITICAL &lt; 50</span>' : ''}
    </div>
    ${options.effect ? `<div class="station-task-exchange"><span>When you finish</span>${metricChips(options.effect)}</div>` : ''}
    ${tip ? `<div class="minigame-tutorial">
      <button type="button" data-minigame-help aria-expanded="false" aria-controls="minigame-tip" aria-label="How to play">?</button>
      <p id="minigame-tip" hidden><strong>Commander Russet</strong> ${escapeHtml(tip)}
        <button type="button" data-minigame-ready>Got it!</button></p>
    </div>` : ''}
    <div class="task-body spud-console-stage" id="task-body"></div>
  `;
  shade.append(box);
  const cleanups: (() => void)[] = [];
  let closed = false;
  mountCustomModal({
    modalRoot,
    node: shade,
    onCleanup: () => {
      if (closed) return;
      closed = true;
      cleanups.forEach((cleanup) => cleanup());
      options.onClose();
    },
  });
  const close = (completed: boolean): void => {
    if (closed) return;
    closed = true;
    cleanups.forEach((cleanup) => cleanup());
    clearActiveModals(modalRoot, { restoreFocus: !completed });
    if (completed) options.onComplete();
    else options.onClose();
  };
  box.querySelector('[data-close]')?.addEventListener('click', () => close(false));
  shade.addEventListener('click', (event) => {
    if (event.target === shade) close(false);
  });
  renderTaskGame(
    options.kind,
    box.querySelector<HTMLDivElement>('#task-body')!,
    () => close(true),
    cleanups,
    options.title,
    resolvedSystem,
  );
  const help = box.querySelector<HTMLButtonElement>('[data-minigame-help]');
  const helpText = box.querySelector<HTMLElement>('#minigame-tip');
  const body = box.querySelector<HTMLElement>('#task-body')!;
  const ready = box.querySelector<HTMLButtonElement>('[data-minigame-ready]');
  const firstControl = (): HTMLElement | null => body.querySelector('button, input, [tabindex="0"]');
  const showTip = (show: boolean): void => {
    if (!help || !helpText) return;
    help.setAttribute('aria-expanded', String(show));
    helpText.hidden = !show;
    body.classList.toggle('minigame-controls-highlighted', show);
    if (show) {
      ready?.focus();
      if (!session.save.seenMinigames.includes(options.kind)) {
        session.save.seenMinigames.push(options.kind);
        persistSave(session.save);
      }
    } else {
      firstControl()?.focus();
    }
  };
  help?.addEventListener('click', () => showTip(helpText!.hidden));
  ready?.addEventListener('click', () => showTip(false));
  if (tip && !session.save.seenMinigames.includes(options.kind)) showTip(true);
  else (firstControl() ?? box.querySelector<HTMLElement>('[data-close]'))?.focus();
}

export function openMissionTask(taskId: string): void {
  const { mission, lobby } = session;
  const task = taskById(taskId);
  if (!task || !mission.tasks.includes(task.id) || mission.completed.includes(task.id)) return;
  if (!isMissionActive() || mission.modalOpen || session.rewinding) return;
  setHudDrawer(null);
  pauseMissionForModal();
  if (task.isEmergency) {
    handleEmergencyRepair(task.id);
    return;
  }
  openMinigameModal({
    eyebrow: `DAY ${missionDayNumber()} · ${getRoomName(task.roomId).toUpperCase()}`,
    title: task.name,
    kind: task.kind,
    system: task.system,
    effect: taskExchange(task, lobby.specialist, mission.majorEventRun.difficulty),
    onClose: resumeMissionAfterModal,
    onComplete: () => {
      const beforeTask = { ...mission.metrics };
      const next = applyTaskCompletion(mission.metrics, task, lobby.specialist, mission.majorEventRun.difficulty);
      const failed = criticalStatus(next);
      if (failed) {
        failMissionToCheckpoint(failed, `That assignment depleted your ${METRIC_LABELS[failed]} to 0%. Your mission ended and rolled back to your last major save point.`);
        return;
      }
      mission.completed = [...mission.completed, task.id];
      mission.totalCompleted += 1;
      mission.metrics = next;
      sfx.complete();
      saveCheckpoint('after-task');
      updateHUD();
      showTaskResult(task.name, beforeTask);
    },
  });
}

export function showTaskResult(taskName: string, before: MissionMetrics): void {
  const { modalRoot } = dom();
  const { mission } = session;
  const changes = metricDeltas(before, mission.metrics);
  const lastTask = mission.completed.length >= mission.tasks.length;
  const firstShiftComplete = lastTask && mission.opening === 'first-shift';
  let closed = false;
  mountCustomModal({
    modalRoot,
    markup: `
    <div class="modal-shade">
      <section class="spud-modal-frame task-result-card" role="dialog" aria-modal="true" aria-labelledby="task-result-title">
        <div class="spud-modal-top">
          <div class="spud-console-head-copy">
            <span class="spud-console-badge is-complete">SYSTEMS REPORT</span>
            <span class="spud-constellation-kicker" style="margin-bottom:2px;">${escapeHtml(mission.room)}</span>
            <h2 class="spud-comic-heading is-sub" id="task-result-title">${escapeHtml(taskName)} COMPLETE</h2>
          </div>
        </div>
        <div class="spud-copy-block">
          <p>Great work! See what your job helped and what it used.</p>
        </div>
        <div class="spud-telemetry-grid" style="display:flex;flex-wrap:wrap;gap:10px 18px;">${metricChips(changes)}</div>
        <footer class="spud-constellation-actions is-centered">
          ${renderConstellationAction({
            icon: lastTask ? 'cert' : 'forward',
            label: lastTask && !firstShiftComplete ? 'SEND EARTH REPORT' : 'CONTINUE SHIFT',
            attrs: 'data-result-continue',
            variant: 'primary',
          })}
        </footer>
      </section>
    </div>`,
    onCleanup: () => {
      if (closed) return;
      closed = true;
      resumeMissionAfterModal();
    },
    focusSelector: '[data-result-continue]',
  });
  modalRoot.querySelector('[data-result-continue]')?.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    clearActiveModals(modalRoot, { restoreFocus: true });
    resumeMissionAfterModal();
    updateHUD();
    if (firstShiftComplete) {
      configureScene();
      showToast('All three assignments are complete. Go to the Crew Bunk in Crew Quarters and rest until Day 2.', 6500);
    } else if (lastTask) routes.finishDay('All daily assignments completed. Crew systems stable.');
    else {
      showToast(`${mission.tasks.length - mission.completed.length} assignment${mission.tasks.length - mission.completed.length === 1 ? '' : 's'} remain today.`);
    }
  });
}

function gameMenuClose(label: string): string {
  return `<button class="game-menu-close spud-constellation-close" type="button" data-close aria-label="Close ${escapeHtml(label)}">${renderConstellationIcon('close')}<span>Close</span><kbd aria-hidden="true">Esc</kbd></button>`;
}

function showGameMenu(): () => void {
  const { modalRoot } = dom();
  setHudDrawer(null);
  const dialog = modalRoot.querySelector<HTMLDialogElement>('.game-menu-dialog')!;
  const close = (): void => {
    dialog.returnValue = '';
    dialog.close();
    clearActiveModals(modalRoot, { restoreFocus: false });
    resumeFromModal();
  };
  dialog.querySelector('[data-close]')?.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  pauseForModal();
  dialog.showModal();
  return close;
}

export function openMap(): void {
  const { currentScreen, mission, training, save } = session;
  const { modalRoot } = dom();
  if (currentScreen !== 'training' && currentScreen !== 'mission') return;
  const map = activeMap();
  const blackout = currentScreen === 'mission' && mission.opening === 'blackout';
  const canRest = currentScreen === 'mission' && mission.opening === 'first-shift' && mission.tasks.length > 0
    && mission.completed.length === mission.tasks.length;
  const activeTasks = currentScreen === 'mission' ? mission.tasks : map.interactions.map((item) => item.id);
  const completed = currentScreen === 'mission' ? mission.completed : training.completed;
  const scale = 680 / map.width;
  const height = Math.round(map.height * scale);
  const marker = (x: number, y: number, tone: string, label?: string): string => (
    `<button type="button" class="spud-map-marker map-marker" ${blackout ? 'disabled' : ''} data-map-walk-x="${Math.round(x)}" data-map-walk-y="${Math.round(y)}" data-map-walk-label="${escapeHtml(label ?? 'Waypoint')}" aria-label="${escapeHtml(label ?? 'Waypoint')}" title="${escapeHtml(label ?? 'Waypoint')}" style="left:${(x / map.width) * 100}%;top:${(y / map.height) * 100}%;--marker-color:${tone};"></button>`
  );

  clearActiveModals(modalRoot, { restoreFocus: false });
  modalRoot.innerHTML = `
    <dialog class="game-menu-dialog game-map-dialog${map.id === 'surface' ? ' station-map-dialog' : ''}" aria-labelledby="game-map-title">
      <section class="spud-copy-stack map-card">
        <header class="spud-modal-top">
          <div>
            <h2 class="spud-comic-heading is-sub" id="game-map-title">${escapeHtml(map.title)}</h2>
          </div>
          ${gameMenuClose('map')}
        </header>
        <div class="${map.id === 'surface' ? 'station-map-porthole' : 'training-map-viewport'}">
        <div class="spud-map-blueprint map-canvas ${map.id === 'surface' ? 'is-surface' : ''}" style="${map.id === 'surface' ? '' : `height:min(${height}px, 54dvh);`}">
          ${map.id === 'surface' ? `<img class="spud-map-art" src="${StationMapUrls.overview}" alt="" aria-hidden="true" />` : ''}
          ${map.rooms.map((room) => `
            <button type="button" class="spud-map-room map-room" ${blackout ? 'disabled' : ''} data-map-walk-x="${Math.round(room.x + room.w / 2)}" data-map-walk-y="${Math.round(room.y + room.h / 2)}" data-map-walk-label="${escapeHtml(room.name)}" title="${escapeHtml(blackout ? room.name : `Click to walk to ${room.name}`)}" style="left:${(room.x / map.width) * 100}%;top:${(room.y / map.height) * 100}%;width:${(room.w / map.width) * 100}%;height:${(room.h / map.height) * 100}%;--room-accent:${room.accent};">
              <span>${escapeHtml(room.name.toUpperCase())}</span>
            </button>
          `).join('')}
          ${map.interactions.filter((item) => activeTasks.includes(item.id)).map((item) => marker(item.x, item.y, completed.includes(item.id) ? '#8fe6a8' : item.id.startsWith('emergency-') ? '#ff5a5f' : (item.accent ?? '#f5c451'), item.name)).join('')}
          ${canRest ? marker(416, 1584, '#8cf5ed', 'Crew Bunk') : ''}
          ${marker(currentScreen === 'training' ? training.x : mission.playerX, currentScreen === 'training' ? training.y : mission.playerY, getColor(save.colorId).css, 'Current Position')}
        </div>
        </div>
        <div class="spud-meta-inline">
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <span>● YOU</span>
            <span style="color:#f5c451;">● ASSIGNMENT</span>
            <span style="color:#ff5a5f;">● DAMAGED AREA</span>
            <span style="color:#8fe6a8;">● COMPLETE</span>
          </div>
          <span>${blackout ? 'USE THE MAP TO FIND THE REACTOR DOME' : 'CLICK ANY ROOM OR MARKER TO SHOW ROUTE LINE'}</span>
        </div>
      </section>
    </dialog>
  `;
  const close = showGameMenu();
  modalRoot.querySelectorAll<HTMLButtonElement>('[data-map-walk-x]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const x = Number(btn.dataset.mapWalkX);
      const y = Number(btn.dataset.mapWalkY);
      const label = btn.dataset.mapWalkLabel || 'Waypoint';
      sfx.click();
      close();
      walkStationTo(x, y, label);
    });
  });
}

export function openTaskList(): void {
  if (session.currentScreen !== 'mission') {
    if (session.currentScreen === 'training') {
      sfx.click();
      routes.renderTrainingHud();
    }
    return;
  }
  toggleHudDrawer('tasks');
}

export function openMissionLog(): void {
  if (session.currentScreen !== 'mission') return;
  const { modalRoot } = dom();
  const { mission, lobby } = session;
  const reports = [...mission.reports].reverse();
  let selectedDay = reports[0]?.day ?? -1;

  const renderLogInspector = (dayNum: number): string => {
    const rep = reports.find((r) => r.day === dayNum) ?? reports[0];
    if (!rep) {
      return `
      <div class="spud-copy-block">
        <h2>NO EARTH REPORTS SENT YET</h2>
        <p>Complete your first timed shift to transmit daily telemetry to Earth Command.</p>
      </div>
    `;
    }
    return `
    <div class="spud-copy-block">
      <h2>DAY ${String(rep.day).padStart(2, '0')} · ${escapeHtml(rep.event.toUpperCase())}</h2>
      <p>Assignments Completed: ${rep.completed} / ${rep.assigned}</p>
      ${rep.eventChoiceId ? `<small style="color:var(--spud-ice);">RESPONSE: ${escapeHtml(rep.eventChoiceId.toUpperCase())}</small>` : ''}
      <small>${(rep.tasks ?? []).map((id) => `${rep.completedTasks?.includes(id) ? '✓' : '×'} ${escapeHtml(taskById(id)?.name ?? id)}`).join(' · ')}</small>
    </div>
    ${rep.metrics ? `
      <div class="spud-constellation-divider" aria-hidden="true"></div>
      <div class="spud-copy-block">
        <h2>RECORDED METRICS</h2>
        <div class="spud-stat-bars" style="margin-top:6px;">
          <div class="spud-stat-row"><span>LIFE</span><div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.round(rep.metrics.life)}%"></div></div><b>${Math.round(rep.metrics.life)}</b></div>
          <div class="spud-stat-row"><span>POWER</span><div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.round(rep.metrics.power)}%"></div></div><b>${Math.round(rep.metrics.power)}</b></div>
          <div class="spud-stat-row"><span>RESEARCH</span><div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.round(rep.metrics.research)}%"></div></div><b>${Math.round(rep.metrics.research)}</b></div>
          <div class="spud-stat-row"><span>FARM</span><div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.round(rep.metrics.farm)}%"></div></div><b>${Math.round(rep.metrics.farm)}</b></div>
        </div>
      </div>
    ` : ''}
  `;
  };

  clearActiveModals(modalRoot, { restoreFocus: false });
  modalRoot.innerHTML = `
  <dialog class="game-menu-dialog" aria-labelledby="mission-log-title">
    <section class="spud-copy-stack help-card">
      <header class="spud-modal-top">
        <div>
          <span class="spud-constellation-kicker" style="margin-bottom:2px;">${escapeHtml(destinationById(lobby.destination).name)} · DAY ${missionDayNumber()}</span>
          <h2 class="spud-comic-heading is-sub" id="mission-log-title">MISSION LOG ARCHIVE</h2>
        </div>
        ${gameMenuClose('mission log')}
      </header>
      <div class="spud-split-columns">
        <div class="spud-copy-stack">
          <div class="spud-slot-list spud-scroll-region" style="max-height:max(200px, 44dvh);overflow-y:auto;">
            ${reports.length ? reports.map((rep) => `
              <button type="button" class="spud-slot-row ${rep.day === selectedDay ? 'selected' : ''}" data-log-day="${rep.day}">
                <div>
                  <strong>DAY ${String(rep.day).padStart(2, '0')}</strong>
                  <small>${escapeHtml(rep.event)}</small>
                </div>
                <span class="spud-status-tag ${rep.completed === rep.assigned ? 'is-done' : 'is-urgent'}">${rep.completed}/${rep.assigned}</span>
              </button>
            `).join('') : '<div class="spud-copy-block"><p>No Earth reports have been sent yet.</p></div>'}
          </div>
          <div class="spud-meta-inline">
            <span>LOGGED TRANSMISSIONS: ${reports.length}</span>
            <span>ACTIVE: ${escapeHtml(mission.eventCard?.name ?? 'Routine')}</span>
          </div>
        </div>
        <div class="spud-vertical-rule" aria-hidden="true"></div>
        <aside class="spud-copy-stack" id="mission-log-inspector">
          ${renderLogInspector(selectedDay)}
        </aside>
      </div>
    </section>
  </dialog>`;
  showGameMenu();
  modalRoot.querySelectorAll<HTMLButtonElement>('[data-log-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDay = Number(btn.dataset.logDay);
      sfx.click();
      modalRoot.querySelectorAll<HTMLButtonElement>('[data-log-day]').forEach((el) => el.classList.toggle('selected', el === btn));
      const inspector = modalRoot.querySelector<HTMLElement>('#mission-log-inspector');
      if (inspector) inspector.innerHTML = renderLogInspector(selectedDay);
    });
  });
}

export function openHelp(): void {
  const { modalRoot } = dom();
  clearActiveModals(modalRoot, { restoreFocus: false });
  modalRoot.innerHTML = `
  <dialog class="game-menu-dialog game-help-dialog" aria-labelledby="game-help-title">
    <section class="spud-copy-stack help-card">
      <header class="spud-modal-top">
        <div>
          <span class="spud-constellation-kicker" style="margin-bottom:2px;">S.P.U.D.I.E. · FIELD MANUAL</span>
          <h2 class="spud-comic-heading is-sub" id="game-help-title">CONTROLS &amp; SYSTEMS</h2>
        </div>
        ${gameMenuClose('help')}
      </header>
      <div class="spud-copy-stack">
        <div class="spud-copy-block">
          <h2>01 · MOVEMENT &amp; AUTO-PILOT</h2>
          <p>Use <b>WASD</b> or the <b>arrow keys</b> to walk. Click a room in <b>Map (M)</b> or a task in <b>Tasks (T)</b> to show a route line to follow. Press <b>G</b> to toggle your EVA helmet.</p>
        </div>
        <div class="spud-constellation-divider" aria-hidden="true"></div>
        <div class="spud-copy-block">
          <h2>02 · DAILY SHIFT LOOP</h2>
          <p>Pick three of six jobs before the planning clock runs out, then complete every assignment and any damaged-area emergency repair to finish the shift.</p>
        </div>
        <div class="spud-constellation-divider" aria-hidden="true"></div>
        <div class="spud-copy-block">
          <h2>03 · FOUR CORE SYSTEMS</h2>
          <p>Keep Life, Power, Research, and Farm healthy for 7, 14, or 18 shifts. Press <b>E</b> or tap <b>Use</b> when you reach your job.</p>
        </div>
      </div>
    </section>
  </dialog>
`;
  showGameMenu();
}

interface ExteriorSortieMission {
  id: string;
  title: string;
  kind: TaskKind;
  system: NonNullable<TaskDef['system']>;
  subtitle: string;
  rewardSummary: string;
}

const EXTERIOR_SORTIES: readonly ExteriorSortieMission[] = [
  {
    id: 'eva-sortie-regolith',
    title: 'Regolith Core Sweep',
    kind: 'inspect',
    system: 'research',
    subtitle: 'Venture past the Landing Pad bulkhead into the crater apron to sample lunar ejecta.',
    rewardSummary: 'RESEARCH +6 · LIFE -1',
  },
  {
    id: 'eva-sortie-array',
    title: 'Exterior Array Dust Brush',
    kind: 'wiring',
    system: 'power',
    subtitle: 'Clear electrostatic regolith from the south solar wings to boost station recharge.',
    rewardSummary: 'POWER +6 · LIFE -1',
  },
  {
    id: 'eva-sortie-beacon',
    title: 'Surface Beacon Calibration',
    kind: 'calibrate',
    system: 'life',
    subtitle: 'Align perimeter micrometeoroid sensors outside the airlock threshold.',
    rewardSummary: 'LIFE +5',
  },
];

const completedSortiesByDay = new Map<number, Set<string>>();

export function openExteriorSortieModal(): void {
  if (session.currentScreen !== 'mission') return;
  const { modalRoot } = dom();
  const { lobby, mission } = session;
  const spec = specialistById(lobby.specialist);
  const dest = destinationById(lobby.destination);
  const day = missionDayNumber();
  const doneToday = completedSortiesByDay.get(day) ?? new Set<string>();
  const helmetSupported = supportsHelmetArt(spec.art);
  const activeEvaTasks = mission.tasks
    .map((id) => taskById(id))
    .filter((task): task is TaskDef => Boolean(task && (task.roomId === 'airlock' || task.roomId === 'exterior') && !mission.completed.includes(task.id)));

  const suitPanelMarkup = (): string => {
    const sealed = effectivePlayerHelmet();
    return `
      <div class="spud-eva-suit-thumb">${renderCharacterSpriteThumb(spec.art, sealed && helmetSupported, lobby.colorId)}</div>
      <div class="spud-eva-suit-copy">
        <span class="spud-constellation-kicker">SUIT INTEGRITY · ${escapeHtml(spec.shortName.toUpperCase())}</span>
        <strong>${sealed || !helmetSupported ? 'EVA VISOR SEALED · CLEARED FOR VACUUM' : 'VISOR OPEN · AUTO-SEALS ON DEPLOYMENT'}</strong>
        <small>${escapeHtml(dest.name)} (${escapeHtml(dest.gravity)}) · Landing Pad Airlock Threshold</small>
      </div>
      ${helmetSupported ? `
        <button type="button" class="spud-constellation-pill" data-eva-toggle-helmet>
          ${sealed ? 'OPEN VISOR' : 'SEAL VISOR'}
        </button>
      ` : ''}
    `;
  };

  clearActiveModals(modalRoot, { restoreFocus: false });
  modalRoot.innerHTML = `
    <dialog class="game-menu-dialog spud-eva-dialog" aria-labelledby="eva-sortie-title">
      <section class="spud-copy-stack help-card spud-eva-card">
        <header class="spud-modal-top">
          <div>
            <span class="spud-constellation-kicker" style="margin-bottom:2px;">AIRLOCK EXIT · OUTSIDE EVA MISSIONS · DAY ${day}</span>
            <h2 class="spud-comic-heading is-sub" id="eva-sortie-title">SURFACE SORTIE DISPATCH</h2>
          </div>
          ${gameMenuClose('airlock exit')}
        </header>
        <div class="spud-eva-suit-banner" id="eva-suit-banner">${suitPanelMarkup()}</div>
        ${activeEvaTasks.length ? `
          <div class="spud-eva-section">
            <span class="spud-constellation-kicker">ASSIGNED AIRLOCK OPERATIONS TODAY</span>
            <div class="spud-eva-list">
              ${activeEvaTasks.map((task) => `
                <article class="spud-eva-row is-assigned">
                  <div>
                    <strong>${escapeHtml(task.name)}</strong>
                    <small>${escapeHtml(getRoomName(task.roomId))} · Assigned shift objective</small>
                  </div>
                  ${renderArcadeButton({
                    label: 'DEPLOY',
                    iconMarkup: renderConstellationIcon('forward'),
                    size: 'sm',
                    variant: 'amber',
                    attrs: `data-eva-task="${escapeHtml(task.id)}"`,
                  })}
                </article>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="spud-eva-section">
          <span class="spud-constellation-kicker">OUTSIDE FIELD MISSIONS · ${escapeHtml(dest.name.toUpperCase())}</span>
          <div class="spud-eva-list">
            ${EXTERIOR_SORTIES.map((sortie) => {
              const logged = doneToday.has(sortie.id);
              return `
                <article class="spud-eva-row">
                  <div>
                    <div class="spud-eva-row-head">
                      <strong>${escapeHtml(sortie.title)}</strong>
                      <span class="spud-status-tag ${logged ? 'is-done' : ''}">${logged ? 'LOGGED TODAY' : escapeHtml(sortie.rewardSummary)}</span>
                    </div>
                    <small>${escapeHtml(sortie.subtitle)}</small>
                  </div>
                  ${renderArcadeButton({
                    label: logged ? 'REPLAY' : 'GO OUTSIDE',
                    iconMarkup: renderConstellationIcon('launch'),
                    size: 'sm',
                    variant: logged ? 'dark' : 'amber',
                    attrs: `data-eva-sortie="${escapeHtml(sortie.id)}"`,
                  })}
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </section>
    </dialog>
  `;

  const close = showGameMenu();
  modalRoot.querySelector('#eva-suit-banner')?.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLElement>('[data-eva-toggle-helmet]');
    if (!btn) return;
    togglePlayerHelmet();
    const banner = modalRoot.querySelector<HTMLElement>('#eva-suit-banner');
    if (banner) banner.innerHTML = suitPanelMarkup();
  });

  const ensureHelmetForEva = (): void => {
    if (helmetSupported && !effectivePlayerHelmet()) {
      session.manualHelmetOverride = true;
      configureScene();
      syncHelmetButton();
      showToast('EVA helmet auto-sealed for exterior sortie.');
    }
  };

  modalRoot.querySelectorAll<HTMLButtonElement>('[data-eva-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.evaTask;
      if (!taskId) return;
      sfx.click();
      close();
      ensureHelmetForEva();
      openMissionTask(taskId);
    });
  });

  modalRoot.querySelectorAll<HTMLButtonElement>('[data-eva-sortie]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sortie = EXTERIOR_SORTIES.find((item) => item.id === btn.dataset.evaSortie);
      if (!sortie) return;
      sfx.click();
      close();
      ensureHelmetForEva();
      setHudDrawer(null);
      pauseMissionForModal();
      openMinigameModal({
        eyebrow: `DAY ${day} · EXTERIOR EVA SORTIE`,
        title: sortie.title,
        kind: sortie.kind,
        onClose: resumeMissionAfterModal,
        onComplete: () => {
          const set = completedSortiesByDay.get(day) ?? new Set<string>();
          const firstToday = !set.has(sortie.id);
          set.add(sortie.id);
          completedSortiesByDay.set(day, set);
          if (firstToday) {
            const syntheticTask: TaskDef = {
              id: sortie.id,
              name: sortie.title,
              roomId: 'airlock',
              kind: sortie.kind,
              system: sortie.system,
              x: 1696,
              y: 1696,
            };
            const next = applyTaskCompletion(mission.metrics, syntheticTask, lobby.specialist, mission.majorEventRun.difficulty);
            next.life = clamp(next.life - 1);
            if (criticalStatus(next)) {
              set.delete(sortie.id);
              rewindMission('Your suit ran out of air. Let’s head back to your save point.', 'life');
              return;
            }
            mission.metrics = next;
            sfx.complete();
            saveCheckpoint('after-task');
            updateHUD();
            showToast(`${sortie.title} logged (${sortie.rewardSummary}).`, 3200);
          } else {
            sfx.complete();
            showToast(`${sortie.title} drill complete (field bonus already logged today).`);
          }
          resumeMissionAfterModal();
        },
      });
    });
  });
}
