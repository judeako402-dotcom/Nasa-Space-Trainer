import {
  DEFAULT_OPTIONS, DIFFICULTY_INFO, PLAYER_SPAWN, STATION_MISSIONS, TASKS,
  destinationById, getColor, getRoomName, isDifficultyUnlocked, persistSave,
  specialistById, taskById, trialMaxDays,
  type CommanderBriefing, type EarthProgressReport, type MissionCheckpoint, type MissionMetric, type MissionMetrics, type SavedTrial,
} from '../model';
import { DAILY_OPERATIONS_DRIFT, DAY, PASS_THRESHOLDS } from '../data/balance';
import { fetchDonkiReports } from '../data/donki';
import { EVENT_CARDS } from '../data/events';
import { BLACKOUT_EVENT, COMMANDER_ART, LANDING_PAD_SPAWN } from '../data/missionOpening';
import { startGameplayOst, stopMusic } from '../audio/music';
import { playHomecoming } from '../game/ending';
import { WALK_SPEED } from '../game/constants';
import { routes, type DialogueOptions } from '../app/router';
import {
  applyOptions, configureScene, dayDurationMs, dom, ensureStationGame, escapeHtml, pauseMissionForModal,
  isMissionActive, missionDayNumber, movementSpeed, resumeMissionAfterModal, saveTrialProgress, session,
  setSceneLoadingState, showToast, stopLoop, wakeStationGame,
} from '../app/session';
import { createMissionState } from '../app/state';
import { sfx } from '../sfx';
import {
  createMajorEventRun, majorEventChance, majorEventForReport,
  storeMajorEventReports, takeNextMajorEvent,
} from '../sim/majorEvents';
import {
  applyDailyOperations, applyEvent, applyLiveOperationsDrain, applyMetricExchange, applyMissedDay, applyTaskCompletion,
  assignmentOffer, createMetrics, evaluateMission, eventForDay, metricDeltas, offersForDay, systemHealth, taskExchange,
} from '../sim/mission';
import { createRng, seedFor } from '../sim/rng';
import { metricChips, setHudDrawer, statusBarsMarkup, syncEvaHazardState, updateHUD } from '../hud/hudController';
import {
  METRIC_LABELS, renderCharacterSpriteThumb, renderConstellationAction, renderConstellationTitle,
} from '../ui/icons';
import { clearActiveModals, mountCustomModal } from '../ui/modalController';
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
    const label = METRIC_LABELS[key];
    return `
      <div class="shift-gauge" data-metric="${key}">
        <span class="shift-gauge-icon-wrap" aria-hidden="true">
          <img class="shift-gauge-icon" src="/assets/ui/spudnaut/icons/stat-${key}.svg" alt="" draggable="false" />
        </span>
        <div class="spud-stat-track shift-gauge-pill" aria-hidden="true">
          <div class="spud-stat-fill shift-gauge-fill is-${key}" style="height:${after}%"></div>
          <span class="shift-gauge-pct">${after}%</span>
        </div>
        <span class="shift-gauge-name">${label}</span>
        <b class="${after > before ? 'is-gain' : ''}" aria-label="${label} ${before} to ${after}%">${before} → ${after}</b>
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
  const disaster = mission.eventCard?.majorEvent;
  const emergencyTask = disaster && taskById(`emergency-${disaster.type.toLowerCase()}`);
  const alreadyRepaired = mission.opening === 'second-shift' && Boolean(emergencyTask);
  mission.tasks = emergencyTask
    ? [...mission.selected, emergencyTask.id]
    : [...mission.selected];
  mission.totalAssigned += mission.tasks.length;
  if (alreadyRepaired && emergencyTask) {
    mission.completed = [emergencyTask.id];
    mission.totalCompleted += 1;
  }
  mission.phase = 'playing';
  mission.dayStartedAt = Date.now();
  mission.shiftDurationMs = dayDurationMs();
  mission.pausedDuration = 0;
  mission.pauseStartedAt = 0;
  mission.modalOpen = false;
  session.evaDrainTicks = 0;
  overlayRoot.replaceChildren();
  mission.pendingDisaster = Boolean(emergencyTask) && !alreadyRepaired;
  configureScene({ respawn: true });
  updateHUD();
  const failed = criticalStatus(mission.metrics);
  if (failed && session.planningEventBase) mission.metrics = { ...session.planningEventBase };
  if (!failed && mission.opening === 'first-shift') mission.hudBriefing = 'tasks';
  saveCheckpoint(mission.pendingDisaster ? 'before-major-event' : 'shift-start');
  if (failed) {
    failMissionToCheckpoint(failed, `${METRIC_LABELS[failed]} reached 0%. Your mission ended and rolled back to your last major save point.`);
  } else if (mission.hudBriefing) {
    briefAssignmentControls();
  } else {
    startLoop();
    if (mission.pendingDisaster && disaster && emergencyTask) {
      sfx.alarm();
      startGameplayOst('alert');
      const room = getRoomName(emergencyTask.roomId);
      showToast(`Follow the red line to ${room}.`, 5500);
    } else {
      startGameplayOst('ambient');
      showToast('Shift started! Tap a task to walk there.');
    }
  }
}

export function saveCheckpoint(reason: MissionCheckpoint['reason']): void {
  session.mission.checkpoint = captureCheckpoint(session.mission, reason, Date.now());
  saveTrialProgress();
}

export function failMissionToCheckpoint(failedStatus: MissionMetric, reason: string): void {
  const { overlayRoot, modalRoot } = dom();
  const { mission, save, lobby } = session;
  stopLoop();
  sfx.systemFailure();
  lastLiveDrainAt = 0;
  session.rewinding = false;
  session.manualHelmetOverride = null;
  session.evaDrainTicks = 0;
  mission.modalOpen = false;
  clearActiveModals(modalRoot, { restoreFocus: false });

  if (mission.checkpoint) {
    restoreCheckpoint(mission, mission.checkpoint, Date.now(), failedStatus);
  } else {
    mission.metrics = { ...(session.planningEventBase ?? createMetrics()) };
    mission.tasks = [];
    mission.completed = [];
  }
  mission.phase = 'playing';

  save.games += 1;
  save.losses += 1;
  saveTrialProgress();
  persistSave(save);
  configureScene({ respawn: true });
  updateHUD();

  const checkpointLabel = mission.checkpoint?.reason === 'after-task'
    ? 'After Last Completed Task'
    : mission.checkpoint?.reason === 'before-major-event'
      ? 'Before Major Emergency'
      : 'Start of Shift';
  const metricOrder: (keyof MissionMetrics)[] = ['life', 'power', 'research', 'farm'];

  const renderFailureSummary = (): void => {
    overlayRoot.innerHTML = `
      <section class="spud-canvas-overlay mission-end ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="mission-failed-title">
        <div class="spud-canvas-inner">
          ${renderConstellationTitle(
            `${METRIC_LABELS[failedStatus].toUpperCase()} DEPLETED · GAME OVER`,
            'mission-failed-title',
            `DAY ${String(missionDayNumber()).padStart(2, '0')} · ${destinationById(lobby.destination).name.toUpperCase()} · MAJOR SAVE POINT RESTORED`,
          )}
          <div class="spud-copy-stack">
            <div class="spud-copy-block">
              <h2>CRITICAL SYSTEM FAILURE</h2>
              <p>${escapeHtml(reason)}</p>
              <small class="spud-constellation-kicker" style="margin-top:6px;">SAVED CHECKPOINT: ${escapeHtml(checkpointLabel.toUpperCase())} · COMPLETED ${mission.completed.length} / ${mission.tasks.length}</small>
            </div>
            <div class="spud-telemetry-grid is-four">
              ${metricOrder.map((key) => `
                <div class="spud-telemetry-cell">
                  <span>${escapeHtml(METRIC_LABELS[key].toUpperCase())}</span>
                  <strong>${Math.round(mission.metrics[key])}%</strong>
                </div>
              `).join('')}
            </div>
          </div>
          <footer class="spud-constellation-actions">
            ${renderConstellationAction({ icon: 'back', label: 'MAIN MENU', attrs: 'data-failure-menu' })}
            ${renderConstellationAction({ icon: 'launch', label: 'LOAD MAJOR SAVE POINT', attrs: 'data-failure-resume', variant: 'primary' })}
          </footer>
        </div>
      </section>
    `;

    overlayRoot.querySelector('[data-failure-menu]')?.addEventListener('click', () => {
      sfx.click();
      overlayRoot.replaceChildren();
      routes.showMenu();
    });
    overlayRoot.querySelector('[data-failure-resume]')?.addEventListener('click', () => {
      sfx.launch();
      overlayRoot.replaceChildren();
      if (session.save.activeTrial) {
        resumeTrial();
      } else {
        startDay();
      }
    });
  };

  const stings: Record<MissionMetric, { icon: string; title: string; line: string }> = {
    power: { icon: '🥔🔥', title: 'BAKED POTATO', line: 'Power hit 0%. The solar surge turned the crew into foil-wrapped spuds.' },
    life: { icon: '🧊🥔', title: 'VACUUM-SEALED SPUD', line: 'Life Support hit 0%. Freeze-dried in the lunar vacuum.' },
    farm: { icon: '🥀🌱', title: 'FAMINE ON THE MOON', line: 'Farm reserves hit 0%. Not a single sprout survived.' },
    research: { icon: '📡✖️', title: 'MISSION SCRUBBED', line: 'Research hit 0%. NASA HQ pulled the plug on the lunar trial.' },
  };
  const sting = stings[failedStatus];
  overlayRoot.innerHTML = `
    <div class="cooked-spud-sting" role="alert">
      <div class="cooked-spud-sting-card">
        <span class="cooked-spud-sting-icon" aria-hidden="true">${sting.icon}</span>
        <h2>${sting.title}</h2>
        <p>${escapeHtml(sting.line)}</p>
      </div>
    </div>
  `;
  window.setTimeout(() => {
    if (session.mission === mission && session.currentScreen === 'mission') {
      renderFailureSummary();
    }
  }, save.options.reducedMotion ? 500 : 1800);
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
    if (restored) showToast('I gave your low bars a boost to 35%. You’ve got this, Spudnaut!');
    else if (mission.pendingDisaster) showToast('⚠ Emergency repair still needed! Go to the highlighted damaged area.');
    startLoop();
  }, 2000);
}

export function handleEmergencyRepair(taskId: string): void {
  const { mission, lobby } = session;
  const event = mission.eventCard;
  if (!event?.majorEvent || !mission.pendingDisaster || taskId !== `emergency-${event.majorEvent.type.toLowerCase()}`) {
    resumeMissionAfterModal();
    return;
  }
  const hazard = event.majorEvent;
  const repair = DISASTER_REPAIRS[hazard.type];
  const guided = mission.opening === 'guided-emergency';
  const showTools = (feedback?: string): void => showDisaster(event, tool => {
    const result = resolveDisaster(hazard, mission.metrics, tool, lobby.specialist);
    if (!result) {
      const message = `${DISASTER_TOOLS[tool].name} didn’t fix it. Read the cards and try another tool.`;
      if (guided) showTools(message);
      else rewindMission(message);
      return;
    }
    const failed = criticalStatus(result);
    if (failed) {
      failMissionToCheckpoint(failed, `The repair depleted your ${METRIC_LABELS[failed]} to 0%. Your mission ended and rolled back to your last major save point.`);
      return;
    }
    mission.metrics = result;
    mission.pendingDisaster = false;
    sfx.repair();
    startGameplayOst('ambient');
    if (guided) {
      mission.opening = 'second-shift';
      mission.tasks = [];
      configureScene();
      updateHUD();
      saveTrialProgress();
      showCommanderOnce('first-repair', 'You did it, Moon hero! You fixed it. Let’s get ready for the next shift!', () => startDay());
      return;
    }
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
    showToast('You fixed it! The warning is gone.');
  }, feedback);
  showCommanderOnce(hazard.type, repair.briefing, () => showTools());
}

let lastLiveDrainAt = 0;

function tickClock(): void {
  const { mission, lobby } = session;
  if (!isMissionActive() || mission.opening === 'blackout' || mission.opening === 'guided-emergency'
    || (mission.opening === 'first-shift' && mission.completed.length === mission.tasks.length)) {
    lastLiveDrainAt = 0;
    return;
  }
  if (mission.modalOpen || session.rewinding) {
    lastLiveDrainAt = 0;
    return;
  }
  const now = Date.now();
  const elapsedSeconds = lastLiveDrainAt > 0 ? Math.min(2, Math.max(0, (now - lastLiveDrainAt) / 1000)) : 0;
  lastLiveDrainAt = now;
  if (elapsedSeconds > 0) {
    const before = mission.metrics;
    const emergencySystem = mission.pendingDisaster && mission.eventCard?.majorEvent
      ? DISASTER_REPAIRS[mission.eventCard.majorEvent.type].system
      : undefined;
    const next = applyLiveOperationsDrain(before, elapsedSeconds, lobby.specialist, emergencySystem);
    mission.metrics = next;
    const integerChanged = (['life', 'power', 'research', 'farm'] as const).some(
      (k) => Math.round(before[k]) !== Math.round(next[k]),
    );
    if (integerChanged) {
      updateHUD();
      saveTrialProgress();
    }
  }
  const failed = criticalStatus(mission.metrics);
  if (failed) {
    failMissionToCheckpoint(failed, `${METRIC_LABELS[failed]} dropped to 0%. Your mission ended and rolled back to your last major save point.`);
    return;
  }

  if (syncEvaHazardState()) {
    session.evaDrainTicks += 1;
    if (session.evaDrainTicks % 3 === 0) {
      mission.metrics.life = Math.max(0, mission.metrics.life - 1);
      if (criticalStatus(mission.metrics)) {
        failMissionToCheckpoint('life', 'Your suit ran out of air (Life reached 0%). Your mission ended and rolled back to your last major save point.');
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
  startGameplayOst(session.mission.pendingDisaster ? 'alert' : 'ambient');
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
  const chosenDifficulty = isDifficultyUnlocked(save.options.difficulty, save)
    ? save.options.difficulty
    : DEFAULT_OPTIONS.difficulty;
  save.name = lobby.playerName.trim() || 'Spudnaut';
  save.colorId = lobby.colorId;
  save.specialist = lobby.specialist;
  save.destination = lobby.destination;
  save.options.difficulty = chosenDifficulty;
  save.trialDay = 1;
  save.activeTrial = null;
  save.seenCommanderBriefings = [];
  persistSave(save);
  session.mission = createMissionState(chosenDifficulty);
  session.mission.phase = 'playing';
  session.mission.day = 1;
  session.mission.opening = 'blackout';
  session.mission.playerX = LANDING_PAD_SPAWN.x;
  session.mission.playerY = LANDING_PAD_SPAWN.y;
  session.mission.room = 'Landing Pad';
  session.mission.eventCard = BLACKOUT_EVENT;
  session.planningEventBase = null;
  session.selectedEventChoice = '';
  showMissionShell();
  saveTrialProgress();
  beginBlackoutBriefing();
}

function showCommander(line: string, onClose?: () => void, presentation?: Pick<DialogueOptions, 'spotlight' | 'advanceKey'>): void {
  const { mission } = session;
  routes.showDialogue({
    speaker: 'Commander Russet', role: 'Mission Commander', accent: '#f2b544', art: COMMANDER_ART,
    lines: [line], ...presentation,
    onClose: () => {
      if (session.mission === mission && session.currentScreen === 'mission') onClose?.();
    },
  });
}

function showCommanderOnce(
  id: CommanderBriefing, line: string, onClose?: () => void,
  presentation?: Pick<DialogueOptions, 'spotlight' | 'advanceKey'>,
): void {
  const { save } = session;
  if (save.seenCommanderBriefings.includes(id)) {
    onClose?.();
    return;
  }
  const remember = (): void => {
    save.seenCommanderBriefings.push(id);
    persistSave(save);
  };
  // The keyboard walkthrough counts once the player actually uses the highlighted control.
  if (!presentation?.advanceKey) remember();
  showCommander(line, () => {
    if (presentation?.advanceKey) remember();
    onClose?.();
  }, presentation);
}

function beginBlackoutBriefing(): void {
  void fetchDonkiReports();
  showCommanderOnce('landing', `Ready, ${session.save.name}? The Moon base lost power. Use W, A, S, and D to walk. Find the power switch in the Reactor Dome and press E.`);
}

function briefFirstShift(): void {
  showCommanderOnce('power-restored', 'The lights are back! Pick three jobs, then look for them in Tasks.', () => startDay(), { spotlight: 'tasks' });
}

function briefAssignmentControls(): void {
  const { mission } = session;
  const advance = (step: NonNullable<SavedTrial['hudBriefing']>): void => {
    mission.hudBriefing = step;
    saveTrialProgress();
    briefAssignmentControls();
  };
  if (mission.hudBriefing === 'tasks') {
    showCommanderOnce('tasks', 'Press T to open Tasks. Pick a job to see the path. Press M to open the map.',
      () => advance('status'), { spotlight: 'tasks', advanceKey: 'T' });
  } else if (mission.hudBriefing === 'status') {
    setHudDrawer('tasks');
    showCommanderOnce('status', 'Press V to see how the base is doing. Each job helps one bar and uses a little of another.',
      () => advance('status-review'), { spotlight: 'task-drawer', advanceKey: 'V' });
  } else if (mission.hudBriefing === 'status-review') {
    setHudDrawer('status');
    showCommanderOnce('status-review', 'These bars show Life, Power, Research, and Farm. If a bar gets low, pick a job that helps it.', () => {
      mission.hudBriefing = undefined;
      saveTrialProgress();
      startLoop();
      document.querySelector<HTMLButtonElement>('[data-drawer-view="status"] [data-drawer-close]')?.focus();
    }, { spotlight: 'status-drawer' });
  }
}

export function restoreStationPower(): void {
  const { mission } = session;
  if (mission.opening !== 'blackout' || mission.modalOpen) return;
  mission.opening = 'first-shift';
  sfx.repair();
  configureScene();
  updateHUD();
  saveTrialProgress();
  briefFirstShift();
}

function briefGuidedRoute(): void {
  session.mission.spotlightGuide = true;
  configureScene();
  updateHUD();
  showCommanderOnce('red-route', 'Something broke! Follow the red line to see what needs fixing.', () => {
    session.mission.spotlightGuide = false;
    configureScene();
    updateHUD();
  }, { spotlight: 'guide' });
}

async function startGuidedEmergency(): Promise<void> {
  const { mission } = session;
  mission.opening = 'guided-emergency';
  mission.phase = 'playing';
  mission.report = null;
  mission.tasks = [];
  mission.completed = [];
  mission.eventCard = null;
  mission.pendingDisaster = false;
  mission.checkpoint = undefined;
  session.planningEventBase = null;
  session.selectedEventChoice = '';
  dom().overlayRoot.replaceChildren();
  configureScene();
  saveTrialProgress();
  const reports = await fetchDonkiReports();
  if (session.mission !== mission || session.currentScreen !== 'mission') return;
  // Reserve a second DONKI emergency so even Cadet has an event after the guided repair.
  const run = storeMajorEventReports(mission.majorEventRun, reports, 2);
  const next = takeNextMajorEvent(run);
  if (!next.event?.majorEvent) {
    mission.opening = undefined;
    startDay();
    return;
  }
  mission.majorEventRun = next.run;
  mission.eventCard = next.event;
  mission.tasks = [`emergency-${next.event.majorEvent.type.toLowerCase()}`];
  mission.pendingDisaster = true;
  mission.dayStartedAt = Date.now();
  mission.shiftDurationMs = dayDurationMs();
  mission.pausedDuration = 0;
  mission.pauseStartedAt = 0;
  mission.modalOpen = false;
  configureScene();
  updateHUD();
  saveCheckpoint('before-major-event');
  sfx.alarm();
  briefGuidedRoute();
}

export function startDay(draft?: SavedTrial['planning']): void {
  const { mission, lobby } = session;
  const guidedEvent = mission.opening === 'second-shift' ? mission.eventCard : null;
  stopLoop();
  mission.phase = 'playing';
  mission.completed = [];
  mission.tasks = [];
  mission.selected = [];
  mission.offers = [];
  mission.report = null;
  mission.pendingDisaster = false;
  mission.hudBriefing = undefined;
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
  const nextMajorEvent = !draft && !mission.opening && mission.penaltyDay === 0 && mission.majorEventRun.reportsLoaded
    ? takeNextMajorEvent(mission.majorEventRun)
    : null;
  if (nextMajorEvent) mission.majorEventRun = nextMajorEvent.run;
  mission.eventCard = (mission.opening === 'first-shift' ? BLACKOUT_EVENT : guidedEvent) ?? resumedMajorEvent ?? nextMajorEvent?.event
    ?? eventForDay(rng, lobby.destination, mission.penaltyDay > 0 ? missionDayNumber() : mission.day, recentReports.map((report) => report.eventId ?? ''));
  session.planningEventBase = draft ? { ...draft.eventBase } : applyDailyOperations(mission.metrics, lobby.specialist);
  const responses = mission.eventCard.responses ?? [];
  session.selectedEventChoice = draft && responses.some((response) => response.id === session.selectedEventChoice)
    ? session.selectedEventChoice
    : responses[0]?.id ?? 'default';
  applyPlanningEventChoice(session.selectedEventChoice);
  if (mission.opening === 'first-shift') {
    mission.offers = rng.shuffle([...STATION_MISSIONS]).map(assignmentOffer);
  } else {
    mission.offers = offersForDay(TASKS, lobby.specialist, rng, mission.reports.slice(-2).flatMap((report) => report.tasks ?? []));
  }
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
  if (needsPlanningReports()) {
    refreshPlanningWithDonki(mission.dayStartedAt);
  }
}

function needsPlanningReports(): boolean {
  const { mission } = session;
  return !mission.opening && mission.penaltyDay === 0 && mission.day === 1 && !mission.majorEventRun.reportsLoaded;
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

        <section class="spud-copy-stack spud-planning-hazard-card" data-event-kind="${escapeHtml(event?.kind ?? 'routine')}" aria-labelledby="shift-event-title">
          <div class="spud-copy-block">
            <span class="hud-event-kicker">${escapeHtml((event?.kind ?? 'routine').toUpperCase())} SHIFT EVENT</span>
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
    const waitingOnMajorEvent = needsPlanningReports();
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
      sfx.cardPick();
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
    const waitingOnMajorEvent = needsPlanningReports();
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

export function openBedSkipModal(): void {
  const { mission } = session;
  const { modalRoot } = dom();
  if (!isMissionActive() || mission.modalOpen || session.rewinding) return;
  if (mission.opening === 'blackout' || mission.opening === 'guided-emergency') return;
  if (mission.pendingDisaster) {
    showToast('Fix the broken part before going to sleep.');
    return;
  }
  if (mission.opening === 'first-shift') {
    if (mission.completed.length < mission.tasks.length) {
      showToast('Finish your three assignments before resting.');
      return;
    }
    restUntilDayTwo();
    return;
  }
  setHudDrawer(null);
  pauseMissionForModal();

  const keys: MissionMetric[] = ['life', 'power', 'research', 'farm'];
  const preview = applyMetricExchange(mission.metrics, { life: -20, power: -20, research: -20, farm: -20 });

  mountCustomModal({
    modalRoot,
    markup: `
      <div class="modal-shade">
        <section class="spud-modal-frame disaster-card" role="alertdialog" aria-modal="true" aria-labelledby="bed-skip-title">
          <header class="disaster-warning">
            <span aria-hidden="true">🛏️</span>
            <div>
              <h2 id="bed-skip-title">CREW BUNK · SKIP SHIFT</h2>
              <p>Sleep through the rest of Day ${String(missionDayNumber()).padStart(2, '0')}?</p>
              <small>RESTING SKIPS TO THE SHIFT REPORT, BUT DRAINS 20 FROM ALL FOUR SYSTEMS</small>
            </div>
          </header>
          <div class="spud-telemetry-grid is-four" style="margin:12px 0;">
            ${keys.map((key) => `
              <div class="spud-telemetry-cell">
                <span>${escapeHtml(METRIC_LABELS[key].toUpperCase())}</span>
                <strong>${Math.round(mission.metrics[key])}% → ${Math.round(preview[key])}%</strong>
              </div>
            `).join('')}
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button type="button" class="spud-text-toggle" data-bed-cancel>CANCEL</button>
            <button type="button" class="spud-text-toggle is-danger-outline" data-bed-confirm>SLEEP &amp; SKIP DAY (-20 ALL)</button>
          </div>
        </section>
      </div>
    `,
    focusSelector: '[data-bed-cancel]',
  });

  const close = (): void => {
    clearActiveModals(modalRoot, { restoreFocus: false });
    resumeMissionAfterModal();
  };

  modalRoot.querySelector('[data-bed-cancel]')?.addEventListener('click', () => {
    sfx.click();
    close();
  });
  modalRoot.querySelector('[data-bed-confirm]')?.addEventListener('click', () => {
    sfx.skipDay();
    clearActiveModals(modalRoot, { restoreFocus: false });
    const next = applyMetricExchange(mission.metrics, { life: -20, power: -20, research: -20, farm: -20 });
    mission.metrics = next;
    const failed = criticalStatus(next);
    if (failed) {
      failMissionToCheckpoint(failed, `Sleeping in the Crew Bunk dropped ${METRIC_LABELS[failed]} to 0%. Your mission ended and rolled back to your last major save point.`);
      return;
    }
    mission.pendingDisaster = false;
    mission.modalOpen = false;
    finishDay('Slept in Crew Quarters to skip the rest of the shift (-20 all systems).', true);
  });
}

function restUntilDayTwo(): void {
  const { modalRoot } = dom();
  const { mission } = session;
  setHudDrawer(null);
  pauseMissionForModal();
  mountCustomModal({
    modalRoot,
    markup: `<div class="modal-shade">
      <section class="spud-modal-frame disaster-card" role="dialog" aria-modal="true" aria-labelledby="bed-rest-title">
        <h2 id="bed-rest-title">Rest Until Day 2</h2>
        <p>Your three assignments are complete. Sleep at the Crew Bunk to start the next shift.</p>
        <div class="spud-constellation-actions">
          ${renderConstellationAction({ icon: 'back', label: 'CANCEL', attrs: 'data-bed-cancel' })}
          ${renderConstellationAction({ icon: 'forward', label: 'SLEEP', attrs: 'data-bed-confirm', variant: 'primary' })}
        </div>
      </section>
    </div>`,
    focusSelector: '[data-bed-confirm]',
  });
  modalRoot.querySelector('[data-bed-cancel]')?.addEventListener('click', () => {
    clearActiveModals(modalRoot);
    resumeMissionAfterModal();
  });
  modalRoot.querySelector('[data-bed-confirm]')?.addEventListener('click', () => {
    clearActiveModals(modalRoot, { restoreFocus: false });
    sfx.skipDay();
    const wake = (): void => {
      if (session.mission !== mission || session.currentScreen !== 'mission') return;
      resumeMissionAfterModal();
      finishDay('Rested after the Day 1 assignments.');
      advanceAfterReport();
    };
    const game = session.game;
    if (!game) wake();
    else void import('../game').then(({ transitionStationThroughBlack }) => {
      if (session.game !== game || session.currentScreen !== 'mission') return;
      transitionStationThroughBlack(game, () => {}, wake);
    }).catch(wake);
  });
}

export function finishDay(reason: string, skipMissedPenalty = false): void {
  const { mission, lobby } = session;
  if (mission.phase !== 'playing') return;
  stopLoop();
  mission.phase = 'report';
  const assigned = mission.tasks.length;
  const completed = mission.completed.length;
  if (!skipMissedPenalty && completed < assigned) {
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
  if (mission.opening !== 'first-shift' && assigned > 0 && completed === assigned) {
    const accomplishments = mission.completed.map(id => taskById(id)?.name ?? id);
    routes.showDialogue({
      speaker: 'Commander Russet',
      role: 'Mission Commander',
      art: COMMANDER_ART,
      accent: '#f2b544',
      lines: [
        `Three cheers for ${session.save.name}! You finished every job this shift and helped the whole crew.`,
        `From ${accomplishments[0]} to ${accomplishments.at(-1)}, you kept our Moon base going. Way to go, Spudnaut!`,
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
  if (mission.opening === 'first-shift') {
    void startGuidedEmergency();
    return;
  }
  if (mission.opening === 'second-shift') mission.opening = undefined;
  startDay();
}

export function completeMission(): void {
  const { overlayRoot } = dom();
  const { mission, save } = session;
  if (mission.phase === 'complete') return;
  const difficulty = mission.majorEventRun.difficulty;
  const maxDays = trialMaxDays(difficulty);
  stopLoop();
  mission.phase = 'complete';
  const verdict = evaluateMission(mission.metrics, mission.totalAssigned, mission.totalCompleted);
  const passed = verdict.passed;
  save.games += 1;
  save.medals += 1;
  if (passed) save.wins += 1;
  else save.losses += 1;
  const justUnlockedVeteran = difficulty === 'cadet' && !save.completedDifficulties.includes('cadet');
  if (!save.completedDifficulties.includes(difficulty)) {
    save.completedDifficulties = [...save.completedDifficulties, difficulty];
  }
  save.activeTrial = null;
  save.trialDay = 1;
  persistSave(save);
  playHomecoming(overlayRoot, save.options.reducedMotion, () => renderMissionEnd(passed, maxDays, justUnlockedVeteran));
}

function renderMissionEnd(passed: boolean, maxDays: number, justUnlockedVeteran = false): void {
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
                ${justUnlockedVeteran ? ' Veteran difficulty (14 days · 5 dangerous events) is now unlocked in Launch Loadout!' : ''}
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
  const savedEvent = saved.eventId === BLACKOUT_EVENT.id ? BLACKOUT_EVENT
    : saved.eventId ? EVENT_CARDS.find((event) => event.id === saved.eventId) ?? null : null;
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
  if (saved.opening === 'blackout') {
    beginBlackoutBriefing();
    return;
  }
  if (saved.opening === 'guided-emergency') {
    if (session.mission.pendingDisaster && session.mission.tasks.length > 0) briefGuidedRoute();
    else void startGuidedEmergency();
    return;
  }
  if (saved.opening === 'first-shift' && !saved.tasks.length && !saved.planning) {
    briefFirstShift();
    return;
  }
  if (session.mission.tasks.length > 0) {
    if (!session.mission.checkpoint) saveCheckpoint(session.mission.pendingDisaster ? 'before-major-event' : 'shift-start');
    if (saved.hudBriefing) {
      briefAssignmentControls();
      return;
    }
    if (session.mission.completed.length === session.mission.tasks.length) {
      if (saved.opening === 'first-shift') showToast('Go to the Crew Bunk in Crew Quarters and rest until Day 2.');
      else finishDay('All daily assignments completed. Crew systems stable.');
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
