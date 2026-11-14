import {
  DIFFICULTY_INFO, PLAYER_SPAWN, TASKS,
  destinationById, getColor, getRoomName, persistSave,
  specialistById, taskById, trialMaxDays,
  type EarthProgressReport, type MissionCheckpoint, type MissionMetric, type MissionMetrics, type SavedTrial,
} from '../model';
import { DAILY_OPERATIONS_DRIFT, DAY, PASS_THRESHOLDS } from '../data/balance';
import { fetchDonkiReports } from '../data/donki';
import { EVENT_CARDS } from '../data/events';
import { stopMusic } from '../audio/music';
import { playHomecoming } from '../game/ending';
import { WALK_SPEED } from '../game/constants';
import { routes } from '../app/router';
import {
  applyOptions, configureScene, dayDurationMs, dom, ensureStationGame, escapeHtml, pauseMissionForModal,
  isMissionActive, missionDayNumber, movementSpeed, saveTrialProgress, session,
  setSceneLoadingState, showToast, stopLoop, wakeStationGame,
} from '../app/session';
import { createMissionState } from '../app/state';
import { sfx } from '../sfx';
import {
  createMajorEventRun, majorEventChance, majorEventForReport,
  storeMajorEventReports, takeNextMajorEvent,
} from '../sim/majorEvents';
import {
  applyDailyOperations, applyEvent, applyMissedDay, applyTaskCompletion,
  assignmentOffer, createMetrics, evaluateMission, eventForDay, metricDeltas, offersForDay, systemHealth, taskExchange,
} from '../sim/mission';
import { createRng, seedFor } from '../sim/rng';
import { metricChips, setHudDrawer, statusBarsMarkup, syncEvaHazardState, updateHUD } from '../hud/hudController';
import {
  METRIC_LABELS, renderCharacterSpriteThumb, renderConstellationAction, renderConstellationTitle,
} from '../ui/icons';
import { clearActiveModals } from '../ui/modalController';
import { showDisaster } from '../hud/disasterModal';
import { criticalStatus, captureCheckpoint, restoreCheckpoint } from '../sim/checkpoints';
import { DISASTER_REPAIRS, DISASTER_TOOLS, resolveDisaster } from '../sim/disasters';

function assignmentPreview(taskId: string): string {
  const { mission, lobby } = session;
  const task = taskById(taskId);
  if (!task) return 'Task details unavailable';
  const estimatedWalk = Math.ceil(Math.hypot(task.x - mission.playerX, task.y - mission.playerY) / (WALK_SPEED * movementSpeed()));
  const effect = taskExchange(task, lobby.specialist, mission.majorEventRun.difficulty);
  const setting = task.roomId === 'exterior' ? ' · SUITED EVA' : '';
  return `EST. WALK ${estimatedWalk}s${setting} · SUCCESS: ${metricChips(effect)}`;
}

function eventBaseMetrics(): MissionMetrics {
  return { ...(session.planningEventBase ?? session.mission.metrics) };
}

function applyPlanningEventChoice(choiceId: string): void {
  const { mission, planningEventBase } = session;
  if (!mission.eventCard || !planningEventBase) return;
  if (mission.eventCard.majorEvent) {
    mission.metrics = { ...planningEventBase };
    return;
  }
  const choice = mission.eventCard.responses?.find((item) => item.id === choiceId);
  mission.metrics = applyEvent(
    { ...planningEventBase },
    { ...mission.eventCard, deltas: choice?.deltas ?? mission.eventCard.deltas },
  );
}

function computeProjectedMetrics(): MissionMetrics {
  const { mission, lobby } = session;
  let projected = { ...mission.metrics };
  for (const id of mission.selected) {
    const task = taskById(id);
    if (task) projected = applyTaskCompletion(projected, task, lobby.specialist, mission.majorEventRun.difficulty);
  }
  return projected;
}

function renderProjectedGaugesMarkup(): string {
  const projected = computeProjectedMetrics();
  const keys: (keyof MissionMetrics)[] = ['life', 'power', 'research', 'farm'];
  return keys.map((key) => {
    const before = Math.round(session.mission.metrics[key]);
    const after = Math.round(projected[key]);
    const label = METRIC_LABELS[key].toUpperCase();
    return `
      <div class="shift-gauge">
        <span>${label}</span>
        <div class="spud-stat-track" aria-hidden="true"><div class="spud-stat-fill" style="width:${after}%"></div></div>
        <b class="${after > before ? 'is-gain' : ''}">${before} → ${after}</b>
      </div>
    `;
  }).join('');
}

function refreshPlanningWithDonki(dayStartedAt: number): void {
  const { mission } = session;
  const runSeed = mission.majorEventRun.seed;
  void fetchDonkiReports().then((reports) => {
    if (session.mission !== mission || session.mission.majorEventRun.seed !== runSeed) return;
    session.mission.majorEventRun = storeMajorEventReports(session.mission.majorEventRun, reports);
    if (session.currentScreen !== 'mission' || session.mission.phase !== 'playing'
      || session.mission.dayStartedAt !== dayStartedAt || session.mission.tasks.length > 0) {
      saveTrialProgress();
      return;
    }
    const next = takeNextMajorEvent(session.mission.majorEventRun);
    session.mission.majorEventRun = next.run;
    if (next.event) session.mission.eventCard = next.event;
    if (session.mission.eventCard?.majorEvent) {
      const responses = session.mission.eventCard.responses ?? [];
      session.selectedEventChoice = responses.some((response) => response.id === session.selectedEventChoice)
        ? session.selectedEventChoice
        : responses[0]?.id ?? 'default';
      applyPlanningEventChoice(session.selectedEventChoice);
    }
    if (dom().overlayRoot.querySelector('.shift-planner')) startPlanning();
    updateHUD();
    saveTrialProgress();
  }).catch((error: unknown) => {
    console.warn('NASA DONKI refresh failed; retaining deterministic mission events.', error);
    if (session.mission.majorEventRun.seed === runSeed) {
      session.mission.majorEventRun = storeMajorEventReports(session.mission.majorEventRun, []);
      if (session.currentScreen === 'mission' && session.mission.phase === 'playing'
        && session.mission.dayStartedAt === dayStartedAt && session.mission.tasks.length === 0
        && dom().overlayRoot.querySelector('.shift-planner')) startPlanning();
      saveTrialProgress();
    }
  });
}

function commitAssignments(): void {
  const { overlayRoot } = dom();
  const { mission } = session;
  const emergencyTaskId = mission.eventCard?.majorEvent
    ? `emergency-${mission.eventCard.majorEvent.type.toLowerCase()}`
    : null;
  const hasEmergencyTask = Boolean(emergencyTaskId && taskById(emergencyTaskId));
  mission.tasks = hasEmergencyTask && emergencyTaskId
    ? [...mission.selected, emergencyTaskId]
    : [...mission.selected];
  mission.totalAssigned += mission.tasks.length;
  mission.phase = 'playing';
  mission.dayStartedAt = Date.now();
  mission.shiftDurationMs = dayDurationMs();
  mission.pausedDuration = 0;
  mission.pauseStartedAt = 0;
  mission.modalOpen = false;
  session.evaDrainTicks = 0;
  overlayRoot.replaceChildren();
  mission.pendingDisaster = hasEmergencyTask;
  configureScene({ respawn: true });
  updateHUD();
  const failed = criticalStatus(mission.metrics);
  if (failed && session.planningEventBase) mission.metrics = { ...session.planningEventBase };
  saveCheckpoint(mission.pendingDisaster ? 'before-major-event' : 'shift-start');
  if (failed) {
    rewindMission(`${METRIC_LABELS[failed]} ran out. Let's try again!`, failed);
  } else {
    startLoop();
    if (hasEmergencyTask && emergencyTaskId) {
      const emergencyTask = taskById(emergencyTaskId);
      const room = emergencyTask ? getRoomName(emergencyTask.roomId) : 'the station';
      showToast(`⚠ EMERGENCY: Go to the damaged area in ${room} to repair it! Check Tasks or Map.`, 5500);
    } else {
      showToast('Shift started! Tap a task to walk there.');
    }
  }
}

export function saveCheckpoint(reason: MissionCheckpoint['reason']): void {
  session.mission.checkpoint = captureCheckpoint(session.mission, reason, Date.now());
  saveTrialProgress();
}

export function rewindMission(message: string, failedStatus?: MissionMetric): void {
  const { mission } = session;
  const checkpoint = mission.checkpoint;
  if (session.rewinding || !checkpoint) return;
  session.rewinding = true;
  stopLoop();
  pauseMissionForModal();
  const banner = document.createElement('div');
  banner.className = 'emergency-rewind';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `<strong>Emergency Rewind!</strong><span>${escapeHtml(message)}</span>`;
  const { modalRoot } = dom();
  modalRoot.append(banner);
  const restored = restoreCheckpoint(mission, checkpoint, Date.now(), failedStatus);
  session.manualHelmetOverride = null;
  session.evaDrainTicks = 0;
  mission.pauseStartedAt = Date.now();
  saveTrialProgress();
  window.setTimeout(() => {
    banner.remove();
    if (session.mission !== mission || session.currentScreen !== 'mission') {
      session.rewinding = false;
      return;
    }
    mission.pausedDuration += Date.now() - mission.pauseStartedAt;
    mission.pauseStartedAt = 0;
    session.rewinding = false;
    configureScene({ respawn: true });
    updateHUD();
    if (restored) showToast('Commander Russet: I topped up your low bars to 35%. You’ve got this!');
    else if (mission.pendingDisaster) showToast('⚠ Emergency repair still needed! Go to the highlighted damaged area.');
    startLoop();
  }, 2000);
}

export function handleEmergencyRepair(taskId: string, rescued = false): void {
  const { mission, lobby } = session;
  const event = mission.eventCard;
  if (!event?.majorEvent) return;
  const hazard = event.majorEvent;
  showDisaster(event, lobby.specialist, tool => {
    const result = resolveDisaster(hazard, mission.metrics, tool, lobby.specialist);
    if (!result) {
      const { part } = DISASTER_REPAIRS[hazard.type];
      rewindMission(`${DISASTER_TOOLS[tool].name} can’t fix the ${part}. Try another tool!`);
      return;
    }
    const failed = criticalStatus(result);
    if (failed) {
      rewindMission(`The repair used up your ${METRIC_LABELS[failed]}. Let’s try again!`, failed);
      return;
    }
    mission.metrics = result;
    mission.pendingDisaster = false;
    mission.modalOpen = false;
    if (!mission.completed.includes(taskId)) {
      mission.completed = [...mission.completed, taskId];
      mission.totalCompleted += 1;
    }
    configureScene();
    saveCheckpoint('after-task');
    updateHUD();
    if (mission.completed.length >= mission.tasks.length) {
      finishDay('All shift assignments complete!');
      return;
    }
    startLoop();
    showToast('Great tool choice! Damaged area repaired.');
  }, rescued);
}

function tickClock(): void {
  const { mission } = session;
  if (!isMissionActive()) return;
  if (mission.modalOpen || session.rewinding) return;
  const failed = criticalStatus(mission.metrics);
  if (failed) {
    rewindMission(`Your ${METRIC_LABELS[failed]} bar ran out. Let’s try again!`, failed);
    return;
  }

  if (syncEvaHazardState()) {
    session.evaDrainTicks += 1;
    if (session.evaDrainTicks % 3 === 0) {
      mission.metrics.life = Math.max(0, mission.metrics.life - 1);
      if (criticalStatus(mission.metrics)) {
        rewindMission('Your suit ran out of air. Seal your helmet before going outside!', 'life');
        return;
      }
      updateHUD();
      saveTrialProgress();
    }
  } else {
    session.evaDrainTicks = 0;
  }
}

export function showMissionShell(): void {
  const { overlayRoot, modalRoot, screenRoot, sceneShell, hud, trainingHud } = dom();
  session.splashCleanup?.();
  session.splashCleanup = null;
  setHudDrawer(null);
  session.currentScreen = 'mission';
  session.evaDrainTicks = 0;
  stopMusic();
  stopLoop();
  window.clearTimeout(session.splashTimer);
  overlayRoot.replaceChildren();
  clearActiveModals(modalRoot, { restoreFocus: false });
  screenRoot.hidden = true;
  sceneShell.hidden = false;
  hud.hidden = false;
  trainingHud.hidden = true;
  document.body.dataset.screen = 'game';
  wakeStationGame();
  if (!session.sceneReady) {
    setSceneLoadingState(true, session.sceneLoadProgress > 0 ? session.sceneLoadProgress : undefined);
  }
  if (!session.game) {
    void ensureStationGame('surface').then(() => {
      if (session.currentScreen === 'mission') {
        configureScene({ respawn: true });
        applyOptions();
      }
    }).catch(() => { /* The scene failure handler displays the fallback. */ });
  }
  applyOptions();
  updateHUD();
}

export function beginMission(): void {
  const { lobby, save } = session;
  save.name = lobby.playerName.trim() || 'Spudnaut';
  save.colorId = lobby.colorId;
  save.specialist = lobby.specialist;
  save.destination = lobby.destination;
  save.trialDay = 1;
  save.activeTrial = null;
  session.mission = createMissionState(save.options.difficulty);
  session.mission.phase = 'playing';
  session.mission.day = 1;
  showMissionShell();
  startDay();
}

export function startDay(draft?: SavedTrial['planning']): void {
  const { mission, lobby } = session;
  stopLoop();
  mission.phase = 'playing';
  mission.completed = [];
  mission.tasks = [];
  mission.selected = [];
  mission.offers = [];
  mission.report = null;
  mission.pendingDisaster = false;
  mission.checkpoint = undefined;
  mission.dayStartedAt = Date.now();
  mission.shiftDurationMs = 0;
  mission.pausedDuration = 0;
  mission.pauseStartedAt = 0;
  mission.modalOpen = false;
  session.evaDrainTicks = 0;
  const rng = createRng(seedFor(mission.day, mission.penaltyDay, mission.reports.length));
  const recentReports = mission.reports.slice(-3);
  const resumedMajorEvent = draft?.majorEventReportId
    ? majorEventForReport(mission.majorEventRun, draft.majorEventReportId)
    : null;
  const nextMajorEvent = !draft && mission.penaltyDay === 0 && mission.majorEventRun.reportsLoaded
    ? takeNextMajorEvent(mission.majorEventRun)
    : null;
  if (nextMajorEvent) mission.majorEventRun = nextMajorEvent.run;
  mission.eventCard = resumedMajorEvent ?? nextMajorEvent?.event
    ?? eventForDay(rng, lobby.destination, mission.penaltyDay > 0 ? missionDayNumber() : mission.day, recentReports.map((report) => report.eventId ?? ''));
  session.planningEventBase = draft ? { ...draft.eventBase } : applyDailyOperations(mission.metrics, lobby.specialist);
  const responses = mission.eventCard.responses ?? [];
  session.selectedEventChoice = draft && responses.some((response) => response.id === session.selectedEventChoice)
    ? session.selectedEventChoice
    : responses[0]?.id ?? 'default';
  applyPlanningEventChoice(session.selectedEventChoice);
  mission.offers = offersForDay(TASKS, lobby.specialist, rng, mission.reports.slice(-2).flatMap((report) => report.tasks ?? []));
  if (draft) {
    const savedOffers = draft.offers?.flatMap(id => {
      const task = TASKS.find(item => item.id === id);
      return task ? [assignmentOffer(task)] : [];
    });
    if (savedOffers?.length === DAY.offerCount) mission.offers = savedOffers;
    mission.selected = draft.selected
      .filter((id) => mission.offers.some((offer) => offer.taskId === id))
      .slice(0, DAY.assignmentsPerDay);
  }
  configureScene({ respawn: true });
  updateHUD();
  startPlanning();
  saveTrialProgress();
  if (mission.penaltyDay === 0 && mission.day === 1 && !mission.majorEventRun.reportsLoaded) {
    refreshPlanningWithDonki(mission.dayStartedAt);
  }
}

const PLANNING_SELECTION_SECONDS = 45;
let planningCountdownTimer = 0;

export function startPlanning(): void {
  window.clearInterval(planningCountdownTimer);
  const { overlayRoot } = dom();
  const { mission, lobby, save } = session;
  const event = mission.eventCard?.majorEvent ? null : mission.eventCard;
  const day = missionDayNumber();
  const goal = mission.penaltyDay > 0 ? 'PENALTY SHIFT' : 'DAILY SHIFT';
  const required = DAY.assignmentsPerDay;
  const levelLabel = mission.penaltyDay > 0
    ? 'PENALTY EXTENSION'
    : `${DIFFICULTY_INFO[mission.majorEventRun.difficulty].name.toUpperCase()} · ${Math.round(majorEventChance(mission.majorEventRun.difficulty) * 100)}% PER DONKI REPORT`;
  let inspectedOfferId = mission.offers[0]?.taskId;

  const renderFocusedOfferBox = (): string => {
    const offer = mission.offers.find((item) => item.taskId === inspectedOfferId);
    if (!offer) return '<p>No assignment to preview.</p>';
    return `
      <strong style="color:#ffffff;font-size:15px;">${escapeHtml(offer.name)}</strong>
      <p>${escapeHtml(getRoomName(offer.roomId))} · ${escapeHtml(offer.blurb)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:4px;">${assignmentPreview(offer.taskId)}</div>
    `;
  };

  overlayRoot.innerHTML = `
    <dialog class="spud-canvas-overlay shift-planner has-planning-art ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="shift-planning-title">
      <img class="spud-planning-art-bg" src="/assets/ui/spudnaut/design/moonbase-dark.webp" alt="" aria-hidden="true" draggable="false" />
      <div class="spud-canvas-inner">
        ${renderConstellationTitle('SHIFT PLANNING', 'shift-planning-title', `${goal} · DAY ${String(day).padStart(2, '0')} · ${levelLabel} · ${destinationById(lobby.destination).name.toUpperCase()}`)}

        <section class="spud-copy-stack spud-planning-hazard-card" aria-labelledby="shift-event-title">
          <div class="spud-copy-block">
            <h2 id="shift-event-title">${escapeHtml((event?.kind ?? 'routine').toUpperCase())} · ${escapeHtml((event?.name ?? 'Routine Shift').toUpperCase())}</h2>
            <p>${escapeHtml(event?.description ?? 'The habitat is quiet. Keep the systems steady.')}</p>
            ${event?.source ? `<small class="spud-constellation-kicker" style="margin:0;">NASA DONKI · ${event.source.type} · ${escapeHtml(event.source.date.slice(0, 10))} · <a href="${escapeHtml(event.source.url)}" target="_blank" rel="noopener noreferrer">SOURCE</a></small>` : ''}
          </div>
          ${event?.responses?.length ? `
            <div class="spud-event-responses" role="group" aria-label="Event response">
              ${event.responses.map((choice) => `
                <button type="button" class="event-response" data-event-choice="${choice.id}" aria-pressed="${session.selectedEventChoice === choice.id}">
                  <strong>${escapeHtml(choice.label)}</strong>
                  <small style="display:block;margin-top:3px;">${escapeHtml(choice.description)}</small>
                </button>
              `).join('')}
            </div>
          ` : `<small style="color:var(--spud-ink-muted);font-family:var(--mono);letter-spacing:0.12em;">${escapeHtml(event?.effect ?? 'An alert can come in after you pick your tasks.')}</small>`}
          ${event ? `
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;">
              <span class="spud-constellation-kicker" style="margin:0;">APPLIED IMPACT</span>
              <div id="event-deltas" style="display:flex;flex-wrap:wrap;gap:8px 14px;" aria-live="polite">${metricChips(metricDeltas(eventBaseMetrics(), mission.metrics))}</div>
            </div>
          ` : ''}
        </section>

        <div class="spud-constellation-divider" aria-hidden="true"></div>

        <div class="spud-split-columns spud-planning-columns">
          <section class="spud-copy-stack spud-arcade-panel-box" aria-labelledby="shift-assignments-title">
            <div class="spud-constellation-heading" id="shift-assignments-title">ASSIGNMENTS · CHOOSE ${required} OF ${mission.offers.length}</div>
            <div class="shift-offers" role="group" aria-labelledby="shift-assignments-title">
              ${mission.offers.map((offer) => `
                <button type="button" class="shift-offer" data-offer="${offer.taskId}" aria-pressed="false" style="--offer-accent:${offer.accent}">
                  <img src="/assets/ui/icons/${offer.icon}.png" width="28" height="28" alt="" />
                  <div class="shift-offer-info">
                    <strong>${escapeHtml(offer.name)}</strong>
                    <small>${escapeHtml(getRoomName(offer.roomId))}<span class="shift-urgent" style="color:var(--spud-danger);" hidden> · Critical</span></small>
                    <small class="offer-exchange">${metricChips(taskExchange(taskById(offer.taskId)!, lobby.specialist, mission.majorEventRun.difficulty))}</small>
                  </div>
                  <span class="spud-orbital-check" aria-hidden="true"></span>
                </button>
              `).join('')}
            </div>
          </section>

          <div class="spud-vertical-rule" aria-hidden="true"></div>

          <aside class="spud-copy-stack spud-arcade-panel-box" aria-label="Planning details">
            <div class="spud-copy-block">
              <h2>ASSIGNMENT PREVIEW</h2>
              <div id="planning-offer-inspector">${renderFocusedOfferBox()}</div>
            </div>
            <div class="spud-constellation-divider" aria-hidden="true"></div>
            <div class="spud-copy-block">
              <h2>SHIFT FORECAST</h2>
              <small>Current → projected if all selected assignments succeed.</small>
              <div class="spud-stat-bars is-segmented" id="planning-projected-gauges" style="margin-top:6px;">${renderProjectedGaugesMarkup()}</div>
              <details class="shift-drift" style="margin-top:4px;">
                <summary>DAILY OPERATING COSTS</summary>
                <div style="display:flex;flex-wrap:wrap;gap:8px 14px;padding-top:6px;">${metricChips(DAILY_OPERATIONS_DRIFT)}</div>
              </details>
            </div>
          </aside>
        </div>

        <footer class="spud-constellation-actions">
          <div class="spud-copy-block" role="status">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <strong id="planning-count" style="color:var(--spud-amber-bright);"></strong>
              <span id="planning-timer" class="spud-constellation-kicker" style="margin:0;color:var(--spud-amber-bright);">PICK IN ${PLANNING_SELECTION_SECONDS}s</span>
            </div>
            <small id="planning-instruction"></small>
          </div>
          ${renderConstellationAction({ icon: 'launch', label: 'START SHIFT', attrs: 'data-planning-confirm', variant: 'primary', disabled: true })}
        </footer>
        <div class="planning-status-bars hud-status-bars" id="planning-status-bars" aria-label="Task impact preview">${statusBarsMarkup()}</div>
      </div>
    </dialog>
  `;

  overlayRoot.querySelector<HTMLElement>('#shift-planning-title')?.focus();

  const dialog = overlayRoot.querySelector<HTMLDialogElement>('.shift-planner')!;
  const count = dialog.querySelector<HTMLElement>('#planning-count')!;
  const instruction = dialog.querySelector<HTMLElement>('#planning-instruction')!;
  const confirm = dialog.querySelector<HTMLButtonElement>('[data-planning-confirm]')!;
  const gauges = dialog.querySelector<HTMLElement>('#planning-projected-gauges')!;
  const inspector = dialog.querySelector<HTMLElement>('#planning-offer-inspector')!;
  const offers = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-offer]'));
  const statusBars = dialog.querySelector<HTMLElement>('#planning-status-bars')!;

  const inspectOffer = (id: string): void => {
    inspectedOfferId = id;
    inspector.innerHTML = renderFocusedOfferBox();
    const task = taskById(id);
    statusBars.innerHTML = statusBarsMarkup(task ? taskExchange(task, lobby.specialist, mission.majorEventRun.difficulty) : undefined);
  };

  const refreshPlanning = (): void => {
    for (const button of offers) {
      const offer = mission.offers.find((item) => item.taskId === button.dataset.offer)!;
      button.setAttribute('aria-pressed', String(mission.selected.includes(offer.taskId)));
      button.querySelector<HTMLElement>('.shift-urgent')!.hidden = systemHealth(mission.metrics, offer.system) >= 55;
    }
    const remaining = required - mission.selected.length;
    count.textContent = `${mission.selected.length} of ${required} selected`;
    instruction.textContent = remaining === 0
      ? 'Ready. Press START SHIFT to begin.'
      : `Select ${remaining} more ${remaining === 1 ? 'assignment' : 'assignments'}.`;
    const waitingOnMajorEvent = mission.penaltyDay === 0 && mission.day === 1
      && !mission.majorEventRun.reportsLoaded;
    confirm.disabled = remaining !== 0 || waitingOnMajorEvent;
    if (waitingOnMajorEvent && remaining === 0) instruction.textContent = 'Checking recent NASA space-weather reports before this level starts.';
    gauges.innerHTML = renderProjectedGaugesMarkup();
    if (inspectedOfferId) inspectOffer(inspectedOfferId);
  };

  for (const button of offers) {
    const id = button.dataset.offer!;
    button.addEventListener('pointerenter', () => inspectOffer(id));
    button.addEventListener('focus', () => inspectOffer(id));
    button.addEventListener('click', () => {
      inspectOffer(id);
      if (mission.selected.includes(id)) {
        mission.selected = mission.selected.filter((item) => item !== id);
      } else if (mission.selected.length < required) {
        mission.selected = [...mission.selected, id];
      } else {
        instruction.textContent = 'Plan full. Deselect an assignment to make a swap.';
        return;
      }
      sfx.click();
      refreshPlanning();
      saveTrialProgress();
    });
  }

  const responses = dialog.querySelectorAll<HTMLButtonElement>('[data-event-choice]');
  responses.forEach((button) => button.addEventListener('click', () => {
    session.selectedEventChoice = button.dataset.eventChoice!;
    applyPlanningEventChoice(session.selectedEventChoice);
    responses.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    const deltas = dialog.querySelector('#event-deltas');
    if (deltas) deltas.innerHTML = metricChips(metricDeltas(eventBaseMetrics(), mission.metrics));
    sfx.click();
    refreshPlanning();
    updateHUD();
    saveTrialProgress();
  }));

  confirm.addEventListener('click', () => {
    if (confirm.disabled || mission.selected.length !== required) return;
    window.clearInterval(planningCountdownTimer);
    sfx.launch();
    dialog.close();
    commitAssignments();
  });
  dialog.addEventListener('cancel', (ev) => ev.preventDefault());
  refreshPlanning();
  dialog.showModal();

  const timerEl = dialog.querySelector<HTMLElement>('#planning-timer');
  let secondsLeft = PLANNING_SELECTION_SECONDS;
  planningCountdownTimer = window.setInterval(() => {
    if (!dialog.isConnected || !dialog.open || session.currentScreen !== 'mission') {
      window.clearInterval(planningCountdownTimer);
      return;
    }
    secondsLeft = Math.max(0, secondsLeft - 1);
    if (timerEl) {
      timerEl.textContent = `PICK IN ${secondsLeft}s`;
      timerEl.style.color = secondsLeft <= 10 ? '#ff5a5f' : 'var(--spud-amber-bright)';
    }
    if (secondsLeft > 0) return;
    const waitingOnMajorEvent = mission.penaltyDay === 0 && mission.day === 1
      && !mission.majorEventRun.reportsLoaded;
    if (waitingOnMajorEvent) return;
    window.clearInterval(planningCountdownTimer);
    for (const offer of mission.offers) {
      if (mission.selected.length >= required) break;
      if (!mission.selected.includes(offer.taskId)) {
        mission.selected = [...mission.selected, offer.taskId];
      }
    }
    sfx.launch();
    dialog.close();
    commitAssignments();
  }, 1000);
}

export function startLoop(): void {
  stopLoop();
  tickClock();
  if (isMissionActive()) session.loopTimer = window.setInterval(tickClock, 400);
}

export function finishDay(reason: string): void {
  const { mission, lobby } = session;
  if (mission.phase !== 'playing') return;
  stopLoop();
  mission.phase = 'report';
  const assigned = mission.tasks.length;
  const completed = mission.completed.length;
  if (completed < assigned) {
    mission.metrics = applyMissedDay(mission.metrics, lobby.specialist);
    mission.missedDays += 1;
  }
  const report: EarthProgressReport = {
    day: missionDayNumber(),
    completed,
    assigned,
    event: mission.eventCard?.name ?? 'Routine Shift',
    eventId: mission.eventCard?.id,
    eventChoiceId: session.selectedEventChoice,
    metrics: { ...mission.metrics },
    tasks: [...mission.tasks],
    completedTasks: [...mission.completed],
  };
  mission.report = report;
  mission.reports.push(report);
  configureScene();
  updateHUD();
  saveTrialProgress();
  renderReport(reason);
  if (assigned > 0 && completed === assigned) {
    const accomplishments = mission.completed.map(id => taskById(id)?.name ?? id);
    routes.showDialogue({
      speaker: 'Commander Russet',
      role: 'Mission Commander',
      art: '/assets/potato-repairman.png',
      accent: '#f2b544',
      lines: [
        `Fantastic flying, ${session.save.name}! You finished all three jobs this shift!`,
        `From ${accomplishments[0]} to ${accomplishments.at(-1)}, you made a real difference. Three cheers for our Spudnaut!`,
      ],
    });
  }
}

export function renderReport(reason: string): void {
  const { overlayRoot } = dom();
  const { mission, save } = session;
  const report = mission.report;
  if (!report) {
    advanceAfterReport();
    return;
  }
  const verdict = evaluateMission(mission.metrics, mission.totalAssigned, mission.totalCompleted);
  const maxDays = trialMaxDays(mission.majorEventRun.difficulty);
  const isFinalDay = mission.day >= maxDays;
  const metricOrder: (keyof MissionMetrics)[] = ['life', 'power', 'research', 'farm'];
  const prevReport = mission.reports.length >= 2 ? mission.reports[mission.reports.length - 2] : null;
  const baselineMetrics = prevReport?.metrics ?? (report.day === 1 ? createMetrics() : mission.metrics);

  overlayRoot.innerHTML = `
    <section class="spud-canvas-overlay earth-report-full ${isFinalDay ? (verdict.passed ? 'final-review passed' : 'final-review below-target') : ''} ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="report-screen-title">
      <div class="spud-canvas-inner">
        ${renderConstellationTitle(
          isFinalDay ? 'FINAL HABITAT REVIEW' : 'SHIFT TELEMETRY REPORT',
          'report-screen-title',
          `EARTH PROGRESS REPORT · DAY ${String(report.day).padStart(2, '0')} OF ${maxDays} · ASSIGNMENTS ${report.completed} / ${report.assigned}`,
        )}

        <div class="spud-split-columns">
          <div class="spud-copy-stack">
            <div class="spud-copy-block">
              <h2>SHIFT SUMMARY · ${escapeHtml(report.event.toUpperCase())}</h2>
              <p>${escapeHtml(reason)}</p>
            </div>
            <div class="spud-slot-list">
              ${mission.tasks.map((id) => {
                const task = taskById(id);
                const done = mission.completed.includes(id);
                return `
                  <div class="spud-slot-row report-task ${done ? 'selected' : ''}">
                    <div>
                      <strong>${escapeHtml(task?.name ?? id)}</strong>
                      <small>${escapeHtml(getRoomName(task?.roomId ?? ''))}</small>
                    </div>
                    <span class="spud-status-tag ${done ? 'is-done' : 'is-urgent'}">${done ? 'DONE ✓' : 'MISSED'}</span>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="spud-meta-inline">
              <span>MISSED SHIFT DAYS: ${mission.missedDays}</span>
              <span>CUMULATIVE TASKS: ${mission.totalCompleted} / ${mission.totalAssigned}</span>
            </div>
          </div>

          <div class="spud-vertical-rule" aria-hidden="true"></div>

          <aside class="spud-copy-stack">
            <div class="spud-constellation-heading">HABITAT GAUGES &amp; SHIFT NET DELTA</div>
            <div class="spud-stat-bars">
              ${metricOrder.map((metric) => {
                const value = Math.round(mission.metrics[metric]);
                const prevVal = Math.round(baselineMetrics[metric]);
                const delta = value - prevVal;
                const deltaBadge = delta > 0 ? `+${delta} ▲` : delta < 0 ? `${delta} ▼` : '0';
                const deltaColor = delta > 0 ? 'var(--spud-gain)' : delta < 0 ? 'var(--spud-danger)' : 'var(--spud-ink-muted)';
                const target = PASS_THRESHOLDS[metric as keyof typeof PASS_THRESHOLDS];
                return `
                  <div class="spud-stat-row" style="grid-template-columns:86px 1fr 94px;">
                    <span>${METRIC_LABELS[metric].toUpperCase()}</span>
                    <div class="spud-stat-track"><div class="spud-stat-fill" style="width:${Math.min(100, Math.max(0, value))}%"></div></div>
                    <b style="text-align:right;">${value} <small style="color:${deltaColor};font-weight:600;">(${deltaBadge})</small> <small style="color:var(--spud-ink-muted);font-weight:500;">/ ${typeof target === 'number' ? Math.round(target) : '—'}</small></b>
                  </div>
                `;
              }).join('')}
            </div>
            ${isFinalDay ? `
              <div class="spud-constellation-divider" aria-hidden="true"></div>
              <div class="spud-copy-block">
                <h2>CERTIFICATION TARGETS</h2>
                <div class="spud-telemetry-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;">
                  ${verdict.requirements.map((item) => `
                    <div class="spud-telemetry-cell">
                      <span>${escapeHtml(item.label)}</span>
                      <strong style="color:${item.met ? 'var(--spud-gain)' : 'var(--spud-danger)'};">${item.value} / ${item.target}</strong>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </aside>
        </div>

        <footer class="spud-constellation-actions">
          ${renderConstellationAction({ icon: 'back', label: 'SAVE & EXIT', attrs: 'data-report-save' })}
          ${renderConstellationAction({
            icon: isFinalDay ? 'cert' : 'forward',
            label: isFinalDay ? 'SEE FINAL RESULT' : 'NEXT SHIFT',
            attrs: 'data-report-next',
            variant: 'primary',
          })}
        </footer>
      </div>
    </section>
  `;
  overlayRoot.querySelector('[data-report-save]')?.addEventListener('click', () => {
    sfx.click();
    saveTrialProgress();
    routes.showMenu();
  });
  overlayRoot.querySelector('[data-report-next]')?.addEventListener('click', () => {
    sfx.click();
    advanceAfterReport();
  });
}

export function advanceAfterReport(): void {
  const { mission } = session;
  if (mission.day >= trialMaxDays(mission.majorEventRun.difficulty)) {
    completeMission();
    return;
  }
  mission.day += 1;
  startDay();
}

export function completeMission(): void {
  const { overlayRoot } = dom();
  const { mission, save } = session;
  if (mission.phase === 'complete') return;
  const maxDays = trialMaxDays(mission.majorEventRun.difficulty);
  stopLoop();
  mission.phase = 'complete';
  const verdict = evaluateMission(mission.metrics, mission.totalAssigned, mission.totalCompleted);
  const passed = verdict.passed;
  save.games += 1;
  save.medals += 1;
  if (passed) save.wins += 1;
  else save.losses += 1;
  save.activeTrial = null;
  save.trialDay = 1;
  persistSave(save);
  playHomecoming(overlayRoot, save.options.reducedMotion, () => renderMissionEnd(passed, maxDays));
}

function renderMissionEnd(passed: boolean, maxDays: number): void {
  const { overlayRoot } = dom();
  const { mission, save, lobby } = session;
  const verdict = evaluateMission(mission.metrics, mission.totalAssigned, mission.totalCompleted);
  const destination = destinationById(lobby.destination);
  const specialist = specialistById(lobby.specialist);
  const color = getColor(lobby.colorId);
  overlayRoot.innerHTML = `
    <section class="spud-canvas-overlay mission-end ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="mission-end-title">
      <div class="spud-canvas-inner">
        ${renderConstellationTitle(
          'YOU EARNED THE GOLDEN POTATO MEDAL!',
          'mission-end-title',
          `SPUDNAUT SPACE AGENCY · FINAL EVALUATION · ${passed ? 'CERTIFIED' : 'REVIEW LOGGED'}`,
        )}
        <div class="spud-split-columns">
          <div class="spud-copy-stack">
            <div class="spud-loadout-portrait" style="--choice-accent:${color.css}">
              <div class="spud-portrait-ring">${renderCharacterSpriteThumb(specialist.art, true, lobby.colorId)}</div>
              <div class="spud-loadout-meta">
                <span>GOLDEN POTATO MEDAL</span>
                <h3>${escapeHtml(save.name)} · ${escapeHtml(specialist.name)}</h3>
                <small><i aria-hidden="true"></i>${escapeHtml(destination.name)} · Rank ${escapeHtml(save.trainingRank ?? 'B')}</small>
              </div>
            </div>
            <div class="spud-copy-block">
              <p>
                ${passed
                  ? `${escapeHtml(save.name)} and the crew held all four pillars together for ${maxDays + mission.penaltyDay} days on ${escapeHtml(destination.name)}. Earth approves the habitat design.`
                  : `${escapeHtml(save.name)} completed the trial on ${escapeHtml(destination.name)}, and brought home a Golden Potato Medal. The final checklist shows what to try on your next trip.`}
              </p>
            </div>
            <div class="spud-telemetry-grid is-four">
              <div class="spud-telemetry-cell">
                <span>DAYS</span>
                <strong>${mission.day + mission.penaltyDay}</strong>
                <small>TRIAL SPAN</small>
              </div>
              <div class="spud-telemetry-cell">
                <span>TASKS</span>
                <strong>${mission.totalCompleted}/${mission.totalAssigned}</strong>
                <small>COMPLETED</small>
              </div>
              <div class="spud-telemetry-cell">
                <span>MISSED</span>
                <strong>${mission.missedDays}</strong>
                <small>SHIFTS</small>
              </div>
              <div class="spud-telemetry-cell">
                <span>EXAM</span>
                <strong>${save.examBest}%</strong>
                <small>CERT BEST</small>
              </div>
            </div>
          </div>

          <div class="spud-vertical-rule" aria-hidden="true"></div>

          <aside class="spud-copy-stack">
            <div class="spud-constellation-heading">CERTIFICATION CHECKLIST</div>
            <div class="spud-slot-list">
              ${verdict.requirements.map((item) => `
                <div class="spud-slot-row">
                  <strong>${escapeHtml(item.label)}</strong>
                  <span class="spud-status-tag ${item.met ? 'is-done' : 'is-urgent'}">${item.value} / ${item.target} ${item.met ? '✓' : '×'}</span>
                </div>
              `).join('')}
            </div>
          </aside>
        </div>

        <footer class="spud-constellation-actions">
          ${renderConstellationAction({ icon: 'back', label: 'RETURN TO MENU', attrs: 'data-end-menu' })}
          ${renderConstellationAction({ icon: 'launch', label: 'PLAY AGAIN', attrs: 'data-end-retry', variant: 'primary' })}
        </footer>
      </div>
    </section>
  `;
  overlayRoot.querySelector('[data-end-menu]')?.addEventListener('click', () => {
    sfx.click();
    routes.showMenu();
  });
  overlayRoot.querySelector('[data-end-retry]')?.addEventListener('click', () => {
    sfx.click();
    routes.showLobby();
  });
}

export function resumeTrial(): void {
  const { save } = session;
  const saved = save.activeTrial;
  if (!saved) {
    routes.showLobby();
    return;
  }
  session.lobby = {
    playerName: save.name,
    colorId: save.colorId,
    specialist: save.specialist,
    destination: save.destination,
  };
  const savedEvent = saved.eventId ? EVENT_CARDS.find((event) => event.id === saved.eventId) ?? null : null;
  const restoredEvent = saved.donkiReport && saved.penaltyDay === 0
    ? majorEventForReport(saved.majorEventRun ?? createMajorEventRun(undefined, save.options.difficulty), saved.donkiReport.id) ?? savedEvent
    : savedEvent;
  const shiftDurationMs = saved.shiftDurationMs ?? Math.max(dayDurationMs(saved.penaltyDay), saved.remainingMs ?? 0);
  const elapsedMs = Math.max(0, shiftDurationMs - (saved.remainingMs ?? shiftDurationMs));
  session.planningEventBase = null;
  session.selectedEventChoice = saved.eventChoiceId ?? saved.report?.eventChoiceId ?? '';
  session.mission = {
    ...createMissionState(save.options.difficulty),
    ...saved,
    pendingDisaster: Boolean(saved.pendingDisaster && restoredEvent?.majorEvent),
    majorEventRun: saved.majorEventRun ?? createMajorEventRun(undefined, save.options.difficulty),
    metrics: { ...saved.metrics },
    tasks: [...saved.tasks],
    completed: [...saved.completed],
    reports: [...saved.reports],
    offers: [],
    selected: [],
    eventCard: restoredEvent,
    dayStartedAt: Date.now() - elapsedMs,
    shiftDurationMs,
    pausedDuration: 0,
    pauseStartedAt: 0,
    modalOpen: false,
    report: saved.report,
    playerX: saved.position?.x ?? PLAYER_SPAWN.x,
    playerY: saved.position?.y ?? PLAYER_SPAWN.y,
  };
  showMissionShell();
  configureScene({ respawn: true });
  updateHUD();
  if (saved.phase === 'report' && saved.report) {
    session.mission.phase = 'report';
    renderReport('Saved shift report restored.');
    return;
  }
  session.mission.phase = 'playing';
  if (session.mission.tasks.length > 0) {
    if (!session.mission.checkpoint) saveCheckpoint(session.mission.pendingDisaster ? 'before-major-event' : 'shift-start');
    if (session.mission.completed.length === session.mission.tasks.length) {
      finishDay('All daily assignments completed. Crew systems stable.');
      return;
    }
    startLoop();
    if (isMissionActive()) {
      showToast(session.mission.pendingDisaster
        ? 'Trial resumed. Go to the highlighted damaged area to repair it!'
        : 'Trial resumed. Complete all assignments to finish the shift.');
    }
  } else {
    startDay(saved.planning);
  }
}
