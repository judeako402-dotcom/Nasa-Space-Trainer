import { startGameplayOst, stopMusic } from '../audio/music';
import { scheduleIdlePrewarm, scheduleSurfacePrewarm } from '../app/prewarm';
import { routes } from '../app/router';
import {
  TRAINING_SYSTEM_IDS, configureScene, dom, ensureStationGame, escapeHtml,
  interactActiveStation, pauseTrainingForModal, resumeTraining, session,
  setSceneLoadingState, setScreen, showToast, stopLoop, wakeStationGame,
} from '../app/session';
import { createTrainingState } from '../app/state';
import { STORY_BEATS } from '../data/story';
import { TRAINING_DECK } from '../data/trainingDeck';
import { touchControls } from '../game/systems/TouchControls';
import { persistSave, type TaskKind } from '../model';
import { sfx } from '../sfx';
import {
  renderConstellationAction, renderConstellationIcon, renderConstellationTitle,
} from '../ui/icons';
import { renderConstellationVideoScreen } from '../ui/layout';
import { clearActiveModals } from '../ui/modalController';

const TRAINING_TASK_KINDS: Record<string, TaskKind> = {
  'sys-power': 'calibrate',
  'sys-life': 'wiring',
  'sys-farm': 'inspect',
  'sys-research': 'shield',
  sample: 'inspect',
};

export function showStory(index: number): void {
  const { screenRoot } = dom();
  const panel = STORY_BEATS[index];
  if (!panel) {
    showTraining();
    return;
  }
  scheduleIdlePrewarm();
  const stepsMarkup = STORY_BEATS.map((beat, idx) => `
    <button type="button" class="spud-step-node ${idx === index ? 'active' : ''}" data-story-jump="${idx}">
      <span class="spud-step-dot" aria-hidden="true"></span>
      <span>0${idx + 1} · ${escapeHtml(beat.cutscene.toUpperCase())}</span>
    </button>
  `).join('<span class="spud-step-bridge" aria-hidden="true"></span>');

  const utilityMarkup = `
    <button class="spud-text-toggle" type="button" data-story-skip>
      ${renderConstellationIcon('skip')}
      <span>SKIP TO DECK</span>
    </button>
  `;

  const bodyMarkup = `
    ${renderConstellationTitle(panel.title, 'story-screen-title', panel.kicker)}
    <nav class="spud-step-chain" aria-label="Transmission sequence">${stepsMarkup}</nav>
    <div class="spud-constellation-divider" aria-hidden="true"></div>
    <div class="spud-split-columns">
      <div class="spud-copy-stack">
        <div class="spud-art-frame">
          <img src="${escapeHtml(panel.art)}" alt="" />
        </div>
        <div class="spud-meta-inline">
          <span>TRANSMISSION LOG ${String(index + 1).padStart(2, '0')} / ${String(STORY_BEATS.length).padStart(2, '0')}</span>
          <span>HEXABYTE ARCHIVE · 3042</span>
        </div>
      </div>
      <div class="spud-vertical-rule" aria-hidden="true"></div>
      <aside class="spud-copy-stack">
        <div class="spud-copy-block">
          <h2>MISSION BRIEFING</h2>
          <p>${escapeHtml(panel.body)}</p>
        </div>
        <div class="spud-copy-block">
          <h2>OPERATIONAL NOTE</h2>
          <p>${escapeHtml(panel.note)}</p>
        </div>
      </aside>
    </div>
    <footer class="spud-constellation-actions">
      ${index > 0
        ? renderConstellationAction({ icon: 'back', label: 'PREVIOUS LOG', attrs: `data-story-jump="${index - 1}"` })
        : renderConstellationAction({ icon: 'back', label: 'MAIN MENU', attrs: 'data-story-back' })}
      ${renderConstellationAction({
        icon: index === STORY_BEATS.length - 1 ? 'training' : 'forward',
        label: index === STORY_BEATS.length - 1 ? 'BOARD TRAINING DECK' : 'CONTINUE',
        attrs: 'data-story-next',
        variant: 'primary',
      })}
    </footer>
  `;

  setScreen('story', renderConstellationVideoScreen({
    ariaLabel: panel.title,
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-story-back',
    backAriaLabel: 'Back to Main Menu',
    utilityMarkup,
    extraClass: 'story-screen',
  }));
  screenRoot.querySelector('.screen-menu')?.setAttribute('data-cutscene', panel.cutscene);
  screenRoot.querySelectorAll('[data-story-back]').forEach((el) => el.addEventListener('click', () => {
    sfx.click();
    routes.showMenu();
  }));
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-story-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sfx.click();
      showStory(Number(btn.dataset.storyJump));
    });
  });
  screenRoot.querySelector('[data-story-skip]')?.addEventListener('click', () => {
    sfx.click();
    showTraining();
  });
  screenRoot.querySelector('[data-story-next]')?.addEventListener('click', () => {
    sfx.click();
    if (index + 1 < STORY_BEATS.length) showStory(index + 1);
    else showTraining();
  });
}

export function showTraining(): void {
  const { overlayRoot, modalRoot, screenRoot, sceneShell, hud, trainingHud } = dom();
  session.splashCleanup?.();
  session.splashCleanup = null;
  session.currentScreen = 'training';
  stopMusic();
  startGameplayOst('ambient');
  stopLoop();
  window.clearTimeout(session.splashTimer);
  overlayRoot.replaceChildren();
  clearActiveModals(modalRoot, { restoreFocus: false });
  screenRoot.hidden = true;
  sceneShell.hidden = false;
  hud.hidden = true;
  trainingHud.hidden = false;
  document.body.dataset.screen = 'game';
  session.training = createTrainingState();
  session.trainingHudExpanded = false;
  session.manualHelmetOverride = null;
  session.currentPrompt = { id: null, name: '', kind: '', room: 'Cafeteria' };
  wakeStationGame();
  if (!session.sceneReady) {
    setSceneLoadingState(true, session.sceneLoadProgress > 0 ? session.sceneLoadProgress : undefined);
  }
  if (session.game) {
    configureScene({ respawn: true });
  } else {
    void ensureStationGame('training').then(() => {
      if (session.currentScreen === 'training') configureScene({ respawn: true });
    });
  }
  renderTrainingHud();
  showToast(touchControls.enabled
    ? 'Drag the joystick to move. Tap a console to walk there, then tap USE. Inspect all four systems.'
    : 'Training Deck online. Walk with WASD, then press E at a console. Inspect all four systems.', 5000);
}

export function renderTrainingHud(): void {
  const { trainingHud } = dom();
  const { training, save, trainingHudExpanded } = session;
  const systems = TRAINING_DECK.interactions.filter((interaction) => interaction.kind === 'system');
  const inspected = systems.filter((interaction) => training.completed.includes(interaction.id)).length;
  const talks = Math.min(2, training.crew.length);
  const sample = training.completed.includes('sample');
  trainingHud.innerHTML = `
    <section class="training-panel ${trainingHudExpanded ? 'expanded' : ''}">
      <header class="training-head">
        <div>
          <span class="training-kicker">EARTH SIMULATOR</span>
          <strong>TRAINING DECK</strong>
          <div class="spud-room-badge is-training">
            <span class="spud-room-dot" aria-hidden="true"></span>
            <span id="training-room">${escapeHtml(training.room.toUpperCase())}</span>
          </div>
        </div>
        <div class="training-head-actions">
          <span class="spud-fps-badge" id="training-fps" ${save.options.showFps ? '' : 'hidden'}>-- FPS</span>
          <button class="training-map" type="button" data-training-map aria-haspopup="dialog" aria-keyshortcuts="M">${renderConstellationIcon('map')}<span>Map</span><kbd aria-hidden="true">M</kbd></button>
          <button class="training-exit" type="button" data-training-exit>${renderConstellationIcon('back')}<span>Exit</span></button>
        </div>
      </header>
      <button class="training-toggle" type="button" data-training-toggle aria-expanded="${trainingHudExpanded}"><span>OBJECTIVES · ${inspected} / ${systems.length}</span><span>${trainingHudExpanded ? 'HIDE ▲' : 'SHOW ▼'}</span></button>
      <div class="training-list">
        ${systems.map((interaction) => `<div class="training-objective ${training.completed.includes(interaction.id) ? 'done' : ''}" style="--accent:${interaction.accent ?? '#7ad7ea'}"><img src="/assets/ui/icons/${interaction.icon}.png" alt="" /><span>${escapeHtml(interaction.name)}</span><b>${training.completed.includes(interaction.id) ? '✓' : '○'}</b></div>`).join('')}
      </div>
      <div class="training-meta"><span>CREW TALKS ${talks} / 2</span><span>SAMPLE ${sample ? 'LOGGED' : 'PENDING'}</span></div>
      <div class="training-footer">${inspected === systems.length ? 'REPORT TO THE BRIDGE CONSOLE' : `INSPECT ${systems.length - inspected} MORE SYSTEM${systems.length - inspected === 1 ? '' : 'S'}`}</div>
      <div class="toast training-toast" id="training-toast" role="status"></div>
    </section>
    <button
      type="button"
      class="training-use"
      data-training-use
      aria-keyshortcuts="E"
      aria-label="Use the highlighted console or crew member"
      disabled
    >USE<kbd aria-hidden="true">E</kbd></button>
  `;
  trainingHud.querySelector('[data-training-use]')?.addEventListener('click', () => {
    if (session.currentPrompt.id === null) return;
    sfx.click();
    interactActiveStation();
  });
  trainingHud.querySelector('[data-training-exit]')?.addEventListener('click', () => {
    sfx.click();
    routes.showMenu();
  });
  trainingHud.querySelector('[data-training-map]')?.addEventListener('click', () => {
    sfx.click();
    routes.openMap();
  });
  trainingHud.querySelector('[data-training-toggle]')?.addEventListener('click', () => {
    session.trainingHudExpanded = !session.trainingHudExpanded;
    renderTrainingHud();
    trainingHud.querySelector<HTMLButtonElement>('[data-training-toggle]')?.focus();
  });
  // Re-apply USE state after the markup was rebuilt from scratch.
  routes.updateActionButtons();
}

export function handleTrainingInteract(interactionId: string): void {
  const interaction = TRAINING_DECK.interactions.find((item) => item.id === interactionId);
  if (!interaction) return;
  if (interaction.id === 'spudie') {
    routes.showDialogue({
      speaker: interaction.name,
      role: 'STATION INTELLIGENCE',
      art: '/assets/potato-researcher.png',
      accent: interaction.accent ?? '#7ad7ea',
      lines: interaction.dialogue ?? ['S.P.U.D.I.E. is listening.'],
    });
    return;
  }
  if (interaction.id === 'bridge-exit') {
    const inspected = TRAINING_SYSTEM_IDS.every((id) => session.training.completed.includes(id));
    if (inspected) finishTraining();
    else {
      const remaining = TRAINING_SYSTEM_IDS.filter((id) => !session.training.completed.includes(id));
      routes.showDialogue({
        speaker: 'Cmdr. Russet',
        role: 'TRAINING OFFICER',
        art: '/assets/potato-repairman.png',
        accent: '#f2b544',
        lines: [
          `You’re getting closer, Spudnaut! You still have ${remaining.length} console${remaining.length === 1 ? '' : 's'} to check.`,
          'Look for Life, Power, Research, and Farm as you explore the deck.',
        ],
      });
    }
    return;
  }
  if (interaction.kind === 'system' || interaction.id === 'sample') openTrainingMinigame(interaction.id);
}

export function openTrainingMinigame(interactionId: string): void {
  const interaction = TRAINING_DECK.interactions.find((item) => item.id === interactionId);
  const kind = TRAINING_TASK_KINDS[interactionId];
  if (!interaction || !kind) return;
  if (session.training.completed.includes(interactionId)) {
    showToast('Checkpoint already logged.');
    return;
  }
  pauseTrainingForModal();
  routes.openMinigameModal({
    eyebrow: interaction.kind === 'system' ? 'TRAINING CHECKPOINT' : 'SAMPLE ANALYSIS',
    title: interaction.name,
    kind,
    system: interaction.system,
    onClose: resumeTraining,
    onComplete: () => {
      session.training.completed.push(interactionId);
      sfx.complete();
      resumeTraining();
      renderTrainingHud();
      configureScene();
      showToast(`${interaction.name} logged. ${TRAINING_SYSTEM_IDS.filter((id) => !session.training.completed.includes(id)).length} system checkpoint(s) remain.`);
    },
  });
}

export function finishTraining(): void {
  const { overlayRoot, trainingHud } = dom();
  const { training, save } = session;
  scheduleSurfacePrewarm();
  const systemsDone = TRAINING_SYSTEM_IDS.every((id) => training.completed.includes(id));
  const rank: 'S' | 'A' | 'B' = systemsDone && training.crew.length >= 2
    ? 'S'
    : systemsDone && training.crew.length >= 1
      ? 'A'
      : 'B';
  save.trainingComplete = true;
  save.trainingRank = rank;
  persistSave(save);
  pauseTrainingForModal();
  trainingHud.hidden = true;
  overlayRoot.innerHTML = `
    <section class="spud-canvas-overlay training-report-screen ${save.options.reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="training-complete-title">
      <div class="spud-canvas-inner is-narrow">
        ${renderConstellationTitle('TRAINING COMPLETE', 'training-complete-title', 'S.P.U.D.I.E. · TRAINING EVALUATION')}
        <div class="spud-orbital-seal">${escapeHtml(rank)}<small>RANK</small></div>
        <div class="spud-copy-block" style="text-align:center;">
          <p>Four survival systems inspected. ${training.crew.length} crew conversation${training.crew.length === 1 ? '' : 's'} logged. ${systemsDone ? 'Commander Russet has cleared you for the certification exam.' : 'Some checkpoints remain, but the exam console is unlocked for review.'}</p>
        </div>
        <div class="spud-telemetry-grid">
          <div class="spud-telemetry-cell">
            <span>SYSTEMS</span>
            <strong>${TRAINING_SYSTEM_IDS.filter((id) => training.completed.includes(id)).length} / 4</strong>
            <small>CONSOLE TELEMETRY</small>
          </div>
          <div class="spud-telemetry-cell">
            <span>CREW TALKS</span>
            <strong>${Math.min(2, training.crew.length)} / 2</strong>
            <small>COMMAND BRIEF</small>
          </div>
          <div class="spud-telemetry-cell">
            <span>SAMPLE</span>
            <strong>${training.completed.includes('sample') ? 'LOGGED' : 'PENDING'}</strong>
            <small>CORE SPECIMEN</small>
          </div>
        </div>
        <div class="spud-copy-block" style="text-align:center;">
          <small>Rank S requires all four systems and two crew conversations. Your rank is recorded on the final certificate.</small>
        </div>
        <footer class="spud-constellation-actions is-centered">
          ${renderConstellationAction({ icon: 'cert', label: 'TAKE THE SPUD EXAM', attrs: 'data-training-report-next', variant: 'primary' })}
        </footer>
      </div>
    </section>
  `;
  overlayRoot.querySelector('[data-training-report-next]')?.addEventListener('click', () => {
    sfx.click();
    routes.showExamIntro();
  });
}
