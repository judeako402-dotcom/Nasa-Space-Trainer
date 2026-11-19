import { SYSTEMS } from '../data/balance';
import { REACTOR_POWER_SWITCH } from '../data/missionOpening';
import {
  destinationById, getColor, getRoomName, specialistById, taskById, type MissionMetrics,
} from '../model';
import { routes } from '../app/router';
import {
  activeMap, configureScene, effectivePlayerHelmet, escapeHtml, isMissionActive,
  session, showToast, type HudDrawerMode,
} from '../app/session';
import { isUnpressurizedHazard } from '../app/state';
import { supportsHelmetArt } from '../game/assets/characterSprites';
import { startGameplayOst } from '../audio/music';
import { sfx } from '../sfx';
import { DISASTER_REPAIRS } from '../sim/disasters';
import { assignmentOffer, systemHealth, taskExchange } from '../sim/mission';
import { METRIC_LABELS, renderCharacterSpriteThumb } from '../ui/icons';

const FIGMA_SYSTEM_ACCENTS: Record<string, string> = {
  life: '#8cdae9',
  power: '#e8bc69',
  research: '#c3a6e8',
  farm: '#b7d47d',
};

const DONE_SUMMARY_BY_SYSTEM: Record<string, string> = {
  life: 'Air, water, and pressure loops nominal.',
  power: 'Solar bus and reactor reserves balanced.',
  research: 'Sample telemetry logged for Earth Command.',
  farm: 'Hydroponic trays and starch output holding.',
};

export function metricChips(deltas: Partial<MissionMetrics>): string {
  const entries = Object.entries(deltas);
  if (!entries.length) return '<span class="spud-metric-chip">NO METRIC CHANGE</span>';
  return entries.map(([key, value]) => {
    const delta = value ?? 0;
    const toneClass = delta >= 0 ? 'is-gain' : 'is-loss';
    return `<span class="spud-metric-chip">${METRIC_LABELS[key as keyof MissionMetrics].toUpperCase()} <b class="${toneClass}">${delta >= 0 ? '+' : ''}${delta}</b></span>`;
  }).join('');
}

export function syncHudRoomText(room: string): void {
  const upper = (room || 'Central Hub').toUpperCase();
  const roomEl = document.querySelector<HTMLElement>('#hud-room');
  if (roomEl) roomEl.textContent = upper;
  const tasksCrumb = document.querySelector<HTMLElement>('#hud-tasks-breadcrumb');
  if (tasksCrumb) tasksCrumb.innerHTML = `<i aria-hidden="true"></i>${escapeHtml(upper)} &nbsp;/&nbsp; CREW TASK LOG`;
  const statusCrumb = document.querySelector<HTMLElement>('#hud-status-breadcrumb');
  if (statusCrumb) statusCrumb.innerHTML = `<i aria-hidden="true"></i>${escapeHtml(upper)} &nbsp;/&nbsp; SYSTEM TELEMETRY`;
}

export function setHudDrawer(mode: HudDrawerMode): void {
  const previous = session.activeHudDrawer;
  session.activeHudDrawer = mode;
  const panel = document.querySelector<HTMLElement>('#hud-drawer-panel');
  const restoreFocus = mode === null && previous && panel?.contains(document.activeElement);
  const backdrop = document.querySelector<HTMLElement>('#hud-drawer-backdrop');
  document.querySelectorAll<HTMLButtonElement>('.hud-drawer-tab').forEach((tab) => {
    const active = tab.dataset.action === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-expanded', String(active));
  });
  document.querySelectorAll<HTMLElement>('[data-drawer-view]').forEach((view) => {
    view.hidden = view.dataset.drawerView !== mode;
  });
  if (panel) {
    panel.hidden = mode === null;
    if (mode) panel.dataset.mode = mode;
    else delete panel.dataset.mode;
  }
  if (backdrop) backdrop.hidden = mode === null;
  if (mode !== null) syncHudRoomText(session.mission.room || 'Central Hub');
  if (restoreFocus) document.querySelector<HTMLButtonElement>(`.hud-drawer-tab[data-action="${previous}"]`)?.focus();
}

export function toggleHudDrawer(mode: 'tasks' | 'status'): void {
  if (session.currentScreen !== 'mission' || session.mission.opening === 'blackout') return;
  if (!isMissionActive() && session.activeHudDrawer === null) return;
  sfx.click();
  setHudDrawer(session.activeHudDrawer === mode ? null : mode);
}

export function syncEvaHazardState(): boolean {
  const pos = { x: session.mission.playerX, y: session.mission.playerY };
  const sealed = effectivePlayerHelmet();
  const hazard = isMissionActive() && isUnpressurizedHazard(session.mission.room, sealed, pos);
  const warningEl = document.querySelector<HTMLElement>('#hud-eva-warning');
  if (warningEl) warningEl.hidden = !hazard;
  const helmetBtn = document.querySelector<HTMLButtonElement>('#hud-helmet-btn');
  helmetBtn?.classList.toggle('is-hazard', hazard);
  if (hazard) {
    const now = Date.now();
    if (now - session.lastHazardWarningAt > 8000) {
      session.lastHazardWarningAt = now;
      showToast('VACUUM HAZARD: Seal EVA helmet (G) in unpressurized zones!', 4000);
    }
  }
  return hazard;
}

export function syncHelmetButton(): void {
  const btn = document.querySelector<HTMLButtonElement>('#hud-helmet-btn');
  const label = document.querySelector<HTMLElement>('#hud-helmet-label');
  if (!btn || !label) return;
  const supported = supportsHelmetArt(specialistById(session.lobby.specialist).art);
  btn.hidden = !supported;
  if (!supported) return;
  const sealed = effectivePlayerHelmet();
  btn.setAttribute('aria-pressed', String(sealed));
  btn.classList.toggle('is-sealed', sealed);
  label.textContent = sealed ? 'EVA: SEALED' : 'EVA: OPEN';
  syncEvaHazardState();
}

export function togglePlayerHelmet(): void {
  if (!supportsHelmetArt(specialistById(session.lobby.specialist).art)) {
    showToast('EVA visor toggle is unavailable for this specialist suit.');
    return;
  }
  const next = !effectivePlayerHelmet();
  session.manualHelmetOverride = next;
  sfx.click();
  configureScene();
  syncHelmetButton();
  const pos = session.currentScreen === 'mission'
    ? { x: session.mission.playerX, y: session.mission.playerY }
    : undefined;
  const room = session.currentScreen === 'mission' ? session.mission.room : session.training.room;
  if (!next && session.currentScreen === 'mission' && isUnpressurizedHazard(room, false, pos)) {
    session.lastHazardWarningAt = Date.now();
    showToast('VACUUM HAZARD: Seal EVA helmet (G) in unpressurized zones!', 4000);
  } else {
    showToast(next ? 'EVA helmet sealed.' : 'EVA helmet retracted.');
  }
}

export function updateRadarMarker(
  x = session.mission.playerX,
  y = session.mission.playerY,
): void {
  const playerDot = document.querySelector<HTMLElement>('#hud-radar-player');
  const map = activeMap();
  if (!playerDot || !map.width || !map.height) return;
  const pctX = Math.max(0, Math.min(100, (x / map.width) * 100));
  const pctY = Math.max(0, Math.min(100, (y / map.height) * 100));
  playerDot.style.left = `${pctX}%`;
  playerDot.style.top = `${pctY}%`;
  playerDot.style.setProperty('--player-color', getColor(session.save.colorId).css);
}

export function updateRadarPings(): void {
  const pingsEl = document.querySelector<HTMLElement>('#hud-radar-pings');
  const map = activeMap();
  if (!pingsEl || !map.width || !map.height) return;
  pingsEl.innerHTML = map.interactions
    .filter((item) => session.mission.tasks.includes(item.id))
    .map((item) => {
      const done = session.mission.completed.includes(item.id);
      const emergency = item.id.startsWith('emergency-') && !done;
      const pctX = Math.max(0, Math.min(100, (item.x / map.width) * 100));
      const pctY = Math.max(0, Math.min(100, (item.y / map.height) * 100));
      return `<span class="hud-radar-ping ${done ? 'is-done' : ''} ${emergency ? 'is-emergency' : ''}" style="left:${pctX}%;top:${pctY}%;"></span>`;
    })
    .join('');
}

function tasksDrawerMarkup(): string {
  const { mission, lobby } = session;
  if (!mission.tasks.length) {
    return '<div class="hud-task-empty">Plan today\'s shift to receive crew assignments.</div>';
  }
  return mission.tasks.map(id => {
    const task = taskById(id);
    if (!task) return '';
    const offer = assignmentOffer(task);
    const done = mission.completed.includes(id);
    const isEmergency = Boolean(task.isEmergency);
    const category = isEmergency ? '⚠ DAMAGED AREA' : escapeHtml(offer.system.toUpperCase());
    const summary = done
      ? (DONE_SUMMARY_BY_SYSTEM[offer.system.toLowerCase()] ?? `${offer.system} check complete.`)
      : (isEmergency ? 'Go to the highlighted damaged area and repair it.' : offer.blurb);
    return `
      <button
        type="button"
        class="hud-task-card-item ${done ? 'is-done' : 'is-pending'} ${isEmergency && !done ? 'is-emergency' : ''}"
        ${done ? 'disabled' : `data-drawer-walk-task="${escapeHtml(id)}" title="Show route line to ${escapeHtml(getRoomName(task.roomId))}"`}
      >
        <span class="hud-task-item-kicker">${category}</span>
        <strong class="hud-task-item-title">${escapeHtml(task.name)}</strong>
        <small class="hud-task-item-desc">${escapeHtml(summary)}
          ${!done && !isEmergency ? `<span class="station-task-exchange">${metricChips(taskExchange(task, lobby.specialist, mission.majorEventRun.difficulty))}</span>` : ''}
        </small>
        <span class="hud-task-item-status">
          ${done
            ? '<i class="hud-task-check" aria-hidden="true">✓</i><span>COMPLETED</span>'
            : `<i class="hud-task-route-dot" aria-hidden="true"></i><span>ROUTE · ${escapeHtml(getRoomName(task.roomId).toUpperCase())}</span>`}
        </span>
      </button>
    `;
  }).join('');
}

export function statusBarsMarkup(preview?: Partial<MissionMetrics>): string {
  return SYSTEMS.map(system => {
    const value = systemHealth(session.mission.metrics, system.id);
    const delta = preview?.[system.id];
    const projected = Math.max(0, Math.min(100, value + (delta ?? 0)));
    const level = value < 35 ? 'low' : value < 60 ? 'watch' : 'good';
    return `<div class="mission-status" data-level="${level}">
      <div><img src="/assets/ui/icons/${system.icon}.png" alt="" width="16" height="16" />
        <strong>${METRIC_LABELS[system.id]}</strong><b>${value}%</b>${delta ? `<em class="${delta > 0 ? 'gain' : 'cost'}">${delta > 0 ? '+' : ''}${delta}</em>` : ''}</div>
      <meter min="0" max="100" value="${projected}" aria-label="${METRIC_LABELS[system.id]}"></meter>
    </div>`;
  }).join('');
}

function systemsMarkup(): string {
  const { mission } = session;
  return SYSTEMS.map((system) => {
    const value = systemHealth(mission.metrics, system.id);
    const accent = FIGMA_SYSTEM_ACCENTS[system.id] ?? system.accent;
    const detail = system.metrics
      .map((metric) => `${METRIC_LABELS[metric]} ${Math.round(mission.metrics[metric])}`)
      .join(' · ');
    return `<div class="system-bar hud-status-card" style="--accent:${accent}">
      <div class="hud-status-card-head"><span class="hud-status-bar-tag" aria-hidden="true"></span><span>${system.short}</span></div>
      <div class="hud-status-card-value"><b>${value}</b><small>/ 100</small></div>
      <div class="system-bar-track"><div class="system-bar-fill" style="width:${value}%;background:${accent};"></div></div>
      <small class="hud-status-card-detail">${detail}</small>
    </div>`;
  }).join('');
}

export function updateActionButtons(): void {
  const buttons = [
    document.querySelector<HTMLButtonElement>('[data-action="use"]'),
    document.querySelector<HTMLButtonElement>('[data-training-use]'),
  ].filter((button): button is HTMLButtonElement => button !== null);
  if (!buttons.length) return;
  const { currentPrompt, currentScreen, mission } = session;
  const id = currentPrompt.id;
  const isSpecial = currentPrompt.kind === 'crew' || currentPrompt.kind === 'exit' || currentPrompt.kind === 'bed';
  const relevant = currentScreen === 'mission' && mission.opening === 'blackout'
    ? id === REACTOR_POWER_SWITCH.id && !mission.modalOpen
    : Boolean(id) && (currentScreen === 'training' || (isMissionActive() && (isSpecial || mission.tasks.includes(id ?? ''))));
  for (const use of buttons) {
    // The training USE control stays on screen at all times so its thumb target
    // never jumps around; only its enabled state changes.
    const isMissionUse = use.matches('[data-action="use"]');
    use.dataset.targetName = relevant ? currentPrompt.name : '';
    use.dataset.targetRoom = relevant ? currentPrompt.room : '';
    use.setAttribute('aria-label', relevant ? `Use ${currentPrompt.name} in ${currentPrompt.room}` : 'Use');
    use.hidden = isMissionUse ? (currentScreen === 'mission' ? false : !relevant) : false;
    use.disabled = !relevant;
    use.classList.toggle('is-ready', relevant);
    use.classList.toggle('is-inactive', !relevant);
  }
}

export function updateHUD(): void {
  if (session.currentScreen !== 'mission') return;
  const { mission, save, lobby } = session;
  const hudRoot = document.querySelector<HTMLElement>('#hud');
  const emergency = mission.pendingDisaster && isMissionActive() ? mission.eventCard?.majorEvent : undefined;
  const isRedAlert = Boolean(emergency);
  hudRoot?.classList.toggle('is-red-alert', isRedAlert);
  hudRoot?.classList.toggle('is-blackout', mission.opening === 'blackout');
  hudRoot?.classList.toggle('is-guide-briefing', Boolean(mission.spotlightGuide));
  const specialAlert = document.querySelector<HTMLElement>('#hud-special-alert');
  if (specialAlert) {
    specialAlert.hidden = !isRedAlert;
    const alertText = document.querySelector<HTMLElement>('#hud-special-alert-text');
    const eventTitle = emergency ? DISASTER_REPAIRS[emergency.type].title : '';
    if (alertText && alertText.textContent !== eventTitle) {
      alertText.textContent = eventTitle;
    }
  }
  if (isMissionActive()) {
    startGameplayOst(isRedAlert ? 'alert' : 'ambient');
  }
  const taskLabel = document.querySelector<HTMLSpanElement>('#task-label');
  const taskStatus = mission.tasks.length ? `${mission.completed.length} / ${mission.tasks.length}` : 'PLANNING';
  if (taskLabel && taskLabel.textContent !== taskStatus) taskLabel.textContent = taskStatus;
  const fill = document.querySelector<HTMLSpanElement>('#task-fill');
  if (fill) {
    const pct = mission.tasks.length ? (mission.completed.length / mission.tasks.length) * 100 : 0;
    fill.style.width = `${pct}%`;
  }
  const tasksSummary = document.querySelector<HTMLElement>('#hud-tasks-summary');
  if (tasksSummary) {
    const allDone = mission.tasks.length > 0 && mission.completed.length >= mission.tasks.length;
    tasksSummary.classList.toggle('is-complete', allDone);
    tasksSummary.innerHTML = `<i aria-hidden="true"></i>${mission.tasks.length ? `${mission.completed.length} / ${mission.tasks.length} COMPLETE` : 'PLANNING SHIFT'}`;
  }
  const tasksList = document.querySelector<HTMLElement>('#hud-tasks-list');
  if (tasksList) tasksList.innerHTML = tasksDrawerMarkup();
  const portrait = document.querySelector<HTMLElement>('#hud-portrait');
  const portraitKey = `${lobby.specialist}:${save.colorId}`;
  if (portrait && portrait.dataset.sprite !== portraitKey) {
    portrait.innerHTML = renderCharacterSpriteThumb(specialistById(lobby.specialist).art, false, save.colorId);
    portrait.dataset.sprite = portraitKey;
  }
  const radarMap = document.querySelector<HTMLImageElement>('.hud-radar-topology');
  if (radarMap?.dataset.stationOverview && !radarMap.hasAttribute('src')) radarMap.src = radarMap.dataset.stationOverview;
  const name = document.querySelector<HTMLElement>('#hud-player-name');
  if (name) name.textContent = save.name.toUpperCase();
  const meta = document.querySelector<HTMLElement>('#hud-player-meta');
  if (meta) meta.textContent = `${specialistById(lobby.specialist).shortName} · ${destinationById(lobby.destination).name.toUpperCase()}`;
  const room = document.querySelector<HTMLElement>('#hud-room');
  if (room) room.textContent = (mission.room || 'Central Hub').toUpperCase();
  syncHudRoomText(mission.room || 'Central Hub');
  syncHelmetButton();
  const fpsBadge = document.querySelector<HTMLElement>('#hud-fps');
  if (fpsBadge) fpsBadge.hidden = !save.options.showFps;
  const dot = document.querySelector<HTMLElement>('#hud-color-dot');
  if (dot) dot.style.background = getColor(save.colorId).css;
  const systems = document.querySelector<HTMLDivElement>('#hud-systems');
  if (systems) systems.innerHTML = systemsMarkup();
  updateRadarMarker();
  updateRadarPings();
  updateActionButtons();
  // Ensure route helper stays wired cleanly via routes if called externally
  void routes;
}
