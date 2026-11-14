import { GAME_MODEL_NOTE, NASA_REFERENCES } from '../data/science';
import {
  DEFAULT_LOBBY, SAVE_BACKUP_KEY, SAVE_KEY, defaultSave, exportSaveJson,
  parseImportedSaveJson, persistSave, type PlayerSave,
} from '../model';
import { routes } from '../app/router';
import {
  applyOptions, dom, escapeHtml, isMissionActive, pauseMissionForModal,
  pauseTrainingForModal, resumeMissionAfterModal, resumeTraining,
  saveSettings, saveTrialProgress, session, setScreen, wakeStationGame,
} from '../app/session';
import { setHudDrawer } from '../hud/hudController';
import { sfx } from '../sfx';
import { openConstellationConfirmDialog } from '../ui/confirmDialog';
import {
  renderArcadeButton, renderConstellationAction, renderConstellationIcon, renderConstellationTitle,
  renderFigmaIcon, renderSpudSettingsIcon, type ConstellationIconId, type SpudSettingsIconKind,
} from '../ui/icons';
import { renderConstellationVideoScreen } from '../ui/layout';

let preMuteMaster = 80;
let preMuteMusic = 70;
let preMuteSfx = 80;
let lastPreviewTick = 0;

interface VolumeControlSpec {
  sliderKey: 'masterVolume' | 'musicVolume' | 'volume';
  muteKey: 'master' | 'music' | 'sound';
  inputId: string;
  pillId: string;
  outputId: string;
  icon: ConstellationIconId;
  label: string;
  sub: string;
  muteTitle: string;
  isMuted: (opts: PlayerSave['options']) => boolean;
  displayVal: (opts: PlayerSave['options']) => number;
  sliderVal: (opts: PlayerSave['options']) => number;
}

const VOLUME_CONTROLS: readonly VolumeControlSpec[] = [
  {
    sliderKey: 'masterVolume',
    muteKey: 'master',
    inputId: 'opt-master-volume',
    pillId: 'opt-master-volume-pill',
    outputId: 'opt-master-volume-value',
    icon: 'masterVolume',
    label: 'Master Volume',
    sub: 'Scales all station & soundtrack audio',
    muteTitle: 'Click to mute/unmute Master',
    isMuted: (opts) => (opts.masterVolume ?? 80) === 0,
    displayVal: (opts) => opts.masterVolume ?? 80,
    sliderVal: (opts) => opts.masterVolume ?? 80,
  },
  {
    sliderKey: 'musicVolume',
    muteKey: 'music',
    inputId: 'opt-music-volume',
    pillId: 'opt-music-volume-pill',
    outputId: 'opt-music-volume-value',
    icon: 'musicVolume',
    label: 'Music Volume',
    sub: 'Orbital synth & menu theme',
    muteTitle: 'Click to mute/unmute Music',
    isMuted: (opts) => !opts.music || opts.musicVolume === 0,
    displayVal: (opts) => (opts.music ? opts.musicVolume : 0),
    sliderVal: (opts) => opts.musicVolume,
  },
  {
    sliderKey: 'volume',
    muteKey: 'sound',
    inputId: 'opt-volume',
    pillId: 'opt-volume-pill',
    outputId: 'opt-volume-value',
    icon: 'sfxVolume',
    label: 'Sound / SFX Volume',
    sub: 'Interface chimes, airlocks & alerts',
    muteTitle: 'Click to mute/unmute SFX',
    isMuted: (opts) => !opts.sound || opts.volume === 0,
    displayVal: (opts) => (opts.sound ? opts.volume : 0),
    sliderVal: (opts) => opts.volume,
  },
];

function renderOptionsContentMarkup(
  returnScreen: 'menu' | 'training' | 'mission',
  options: PlayerSave['options'],
): string {
  const inGame = returnScreen !== 'menu';
  const volumeIcons: Record<string, SpudSettingsIconKind> = {
    master: 'master',
    music: 'music',
    sound: 'sfx',
  };
  return `
    <article class="spud-options-panel spud-arcade-settings-panel" aria-labelledby="options-window-title">
      <header class="spud-arcade-settings-head">
        <h1 id="options-window-title" class="spud-comic-heading" tabindex="-1">
          ${inGame
            ? '<img class="ingame-settings-gear" src="/assets/ui/spudnaut/ingame/settings-gear.webp" alt="" />Settings'
            : '<img src="/assets/ui/spudnaut/design/settings-heading.webp" alt="Settings" />'}
        </h1>
      </header>

      <div class="spud-options-body spud-arcade-settings-body">
        <section class="spud-volume-section" aria-label="Volume Settings">
          <div class="spud-volume-list">
            ${VOLUME_CONTROLS.map((ctrl) => {
              const shown = ctrl.displayVal(options);
              const val = ctrl.sliderVal(options);
              const muted = ctrl.isMuted(options);
              return `
                <div class="spud-vol-row spud-arcade-setting-row" data-volume-row="${ctrl.sliderKey}">
                  <div class="spud-arcade-icon-slot">${renderSpudSettingsIcon(volumeIcons[ctrl.muteKey] ?? 'sfx')}</div>
                  <div class="spud-vol-main">
                    <div class="spud-vol-top">
                      <div class="spud-vol-copy">
                        <label class="spud-vol-label spud-arcade-setting-label" for="${ctrl.inputId}">${ctrl.label}</label>
                        <small class="spud-vol-sub">${ctrl.sub}</small>
                      </div>
                      <button
                        type="button"
                        class="spud-pct-readout spud-arcade-mute-pill ${muted ? 'is-muted' : ''}"
                        id="${ctrl.pillId}"
                        data-mute-pill="${ctrl.muteKey}"
                        title="${ctrl.muteTitle}"
                      >
                        <output id="${ctrl.outputId}">${shown}%</output>
                      </button>
                    </div>
                    <input
                      class="spud-arcade-range"
                      id="${ctrl.inputId}"
                      data-slider="${ctrl.sliderKey}"
                      type="range"
                      min="0"
                      max="100"
                      value="${val}"
                      aria-valuetext="${shown} percent"
                      style="--attr-min:0;--attr-max:100;--control-value:${val};--fill:${val}%"
                    />
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <section class="spud-display-section" aria-label="Telemetry and Save Settings">
          <div class="spud-toggle-row spud-arcade-setting-row is-toggle-row">
            <div class="spud-arcade-icon-slot">${renderSpudSettingsIcon('fps')}</div>
            <div class="spud-vol-copy">
              <label class="spud-vol-label spud-arcade-setting-label" for="opt-show-fps">SHOW FPS</label>
              <small class="spud-vol-sub">DISPLAY LIVE FRAME RATE DURING GAMEPLAY</small>
            </div>
            <label class="spud-arcade-switch" for="opt-show-fps">
              <input
                class="spud-arcade-switch-input"
                id="opt-show-fps"
                type="checkbox"
                role="switch"
                switch
                data-toggle-option="showFps"
                ${options.showFps ? 'checked' : ''}
                aria-checked="${options.showFps ? 'true' : 'false'}"
                aria-label="Show FPS telemetry"
              />
              <span class="spud-arcade-switch-track" aria-hidden="true">
                <span class="spud-arcade-switch-thumb"></span>
              </span>
              <span class="spud-switch-state spud-arcade-switch-state">${options.showFps ? 'ON' : 'OFF'}</span>
            </label>
          </div>

          <details class="design-extra-settings">
            <summary>More settings</summary>
            <div class="design-extra-audio"></div>
            <label class="design-motion-setting">
              <input type="checkbox" data-toggle-option="reducedMotion" ${options.reducedMotion ? 'checked' : ''} />
              Reduced motion
            </label>
          <div class="spud-arcade-save-strip">
            <div class="spud-vol-copy">
              <span class="spud-vol-label">PORTABLE SAVE JSON</span>
              <small class="spud-vol-sub" id="opt-recovery-status" aria-live="polite">Back up or transfer progress across devices</small>
            </div>
            <div class="spud-recovery-actions">
              <button type="button" class="spud-text-toggle" data-export-save>EXPORT JSON</button>
              <button type="button" class="spud-text-toggle" data-import-save>IMPORT JSON</button>
              <button type="button" class="spud-text-toggle is-danger-outline" data-options-reset aria-label="Reset progress and settings">
                ${renderFigmaIcon('reset', 'spud-reset-constellation')}
                <span>RESET</span>
              </button>
              <input type="file" id="opt-import-file" accept="application/json,.json" hidden />
            </div>
          </div>
          </details>
        </section>
      </div>

      <footer class="spud-options-footer spud-arcade-settings-footer">
        ${returnScreen === 'mission' ? `
          <button class="spud-menu-item spud-options-action is-warn" type="button" data-abort-mission aria-haspopup="dialog">
            ${renderConstellationIcon('abort')}
            <span class="spud-menu-label">ABORT MISSION</span>
          </button>
        ` : ''}
        ${renderArcadeButton({
          label: 'RESUME',
          attrs: `data-options-back ${returnScreen === 'menu' ? '' : 'data-game-return'}`,
          ariaLabel: returnScreen === 'menu' ? 'Close Settings and return to Main Menu' : 'Resume Game',
          size: 'md',
          extraClass: 'spud-settings-resume-btn',
        })}
      </footer>
    </article>
  `;
}

export function showOptions(): void {
  const { screenRoot, sceneShell, hud, trainingHud } = dom();
  setHudDrawer(null);
  window.clearTimeout(session.optionsHideTimer);
  const options = session.save.options;
  if (typeof options.masterVolume !== 'number') options.masterVolume = 80;
  const returnScreen = session.currentScreen === 'training' || session.currentScreen === 'mission'
    ? session.currentScreen
    : 'menu';
  if (returnScreen === 'training') pauseTrainingForModal();
  if (returnScreen === 'mission') {
    pauseMissionForModal();
    if (isMissionActive()) saveTrialProgress();
  }

  const existingMenuStage = returnScreen === 'menu'
    ? screenRoot.querySelector<HTMLElement>('.screen-menu.spud-video-menu')
    : null;
  const existingOverlayHost = existingMenuStage?.querySelector<HTMLElement>('.spud-options-overlay') ?? null;

  let optionsRoot: HTMLElement;

  if (existingMenuStage && existingOverlayHost) {
    session.currentScreen = 'options';
    document.body.dataset.screen = 'options';
    existingOverlayHost.innerHTML = renderOptionsContentMarkup(returnScreen, options);
    existingOverlayHost.hidden = false;
    void existingOverlayHost.offsetWidth;
    existingMenuStage.classList.add('is-options-open');
    optionsRoot = existingOverlayHost;
  } else if (returnScreen !== 'menu') {
    setScreen('options', `<section class="screen-menu is-options-open ingame-options-screen${options.reducedMotion ? ' reduce-motion' : ''}">
      <div class="spud-options-overlay">${renderOptionsContentMarkup(returnScreen, options)}</div>
    </section>`);
    sceneShell.hidden = false;
    optionsRoot = screenRoot;
  } else {
    setScreen('options', `
      <section class="screen-menu spud-video-menu is-options-open is-standalone-options ${options.reducedMotion ? 'reduce-motion' : ''}">
        <img class="menu-ambient-backdrop spud-art-backdrop" src="/assets/ui/spudnaut/design/moonbase.webp" alt="" aria-hidden="true" draggable="false" />
        <div class="video-menu-stage has-spud-art">
          <img class="spud-art-stage-img" src="/assets/ui/spudnaut/design/moonbase.webp" alt="" aria-hidden="true" draggable="false" />
          <div class="menu-video-vignette spud-arcade-vignette" aria-hidden="true"></div>
          <div class="spud-options-overlay">${renderOptionsContentMarkup(returnScreen, options)}</div>
        </div>
      </section>
    `);
    optionsRoot = screenRoot;
  }

  const sfxRow = optionsRoot.querySelector('[data-volume-row="volume"]');
  if (sfxRow && returnScreen === 'menu') optionsRoot.querySelector('.design-extra-audio')?.append(sfxRow);
  optionsRoot.querySelector<HTMLElement>('#options-window-title')?.focus();
  optionsRoot.querySelector('[data-abort-mission]')?.addEventListener('click', () => routes.showAbortMissionConfirmation());

  const syncOptionVisuals = (): void => {
    const currentOpts = session.save.options;
    for (const ctrl of VOLUME_CONTROLS) {
      const shown = ctrl.displayVal(currentOpts);
      const val = ctrl.sliderVal(currentOpts);
      const out = optionsRoot.querySelector<HTMLOutputElement>(`#${ctrl.outputId}`);
      const pill = optionsRoot.querySelector<HTMLElement>(`#${ctrl.pillId}`);
      const input = optionsRoot.querySelector<HTMLInputElement>(`#${ctrl.inputId}`);
      if (out) out.value = `${shown}%`;
      if (pill) pill.classList.toggle('is-muted', ctrl.isMuted(currentOpts));
      if (input) {
        input.value = String(val);
        input.setAttribute('aria-valuetext', `${shown} percent`);
        input.style.setProperty('--attr-min', input.min || '0');
        input.style.setProperty('--attr-max', input.max || '100');
        input.style.setProperty('--control-value', String(val));
        input.style.setProperty('--fill', `${val}%`);
      }
    }
    const motionSwitch = optionsRoot.querySelector<HTMLInputElement>('[data-toggle-option="reducedMotion"]');
    if (motionSwitch) motionSwitch.checked = currentOpts.reducedMotion;
    const fpsSwitch = optionsRoot.querySelector<HTMLInputElement>('[data-toggle-option="showFps"]');
    if (fpsSwitch) {
      const enabled = Boolean(currentOpts.showFps);
      fpsSwitch.checked = enabled;
      fpsSwitch.setAttribute('aria-checked', enabled ? 'true' : 'false');
      const stateEl = optionsRoot.querySelector<HTMLElement>('.spud-arcade-switch-state');
      if (stateEl) stateEl.textContent = enabled ? 'ON' : 'OFF';
    }
  };

  const refresh = (): void => {
    syncOptionVisuals();
    applyOptions();
    saveSettings();
  };

  optionsRoot.querySelector<HTMLInputElement>('[data-toggle-option="reducedMotion"]')?.addEventListener('change', event => {
    session.save.options.reducedMotion = (event.currentTarget as HTMLInputElement).checked;
    saveSettings();
    applyOptions();
  });

  optionsRoot.querySelector<HTMLInputElement>('[data-toggle-option="showFps"]')?.addEventListener('change', (event) => {
    const target = event.currentTarget as HTMLInputElement;
    options.showFps = target.checked;
    sfx.click();
    refresh();
  });

  optionsRoot.querySelectorAll<HTMLButtonElement>('[data-mute-pill]').forEach((pill) => pill.addEventListener('click', () => {
    const target = pill.dataset.mutePill;
    if (target === 'master') {
      const current = options.masterVolume ?? 80;
      if (current > 0) {
        preMuteMaster = current;
        options.masterVolume = 0;
      } else {
        options.masterVolume = preMuteMaster || 80;
      }
    } else if (target === 'music') {
      if (options.music && options.musicVolume > 0) {
        preMuteMusic = options.musicVolume;
        options.music = false;
      } else {
        options.music = true;
        if (options.musicVolume === 0) options.musicVolume = preMuteMusic || 70;
      }
    } else if (target === 'sound') {
      if (options.sound && options.volume > 0) {
        preMuteSfx = options.volume;
        options.sound = false;
      } else {
        options.sound = true;
        if (options.volume === 0) options.volume = preMuteSfx || 80;
      }
    }
    sfx.click();
    refresh();
  }));

  optionsRoot.querySelectorAll<HTMLInputElement>('[data-slider]').forEach((input) => input.addEventListener('input', () => {
    const key = input.dataset.slider;
    if (key !== 'volume' && key !== 'musicVolume' && key !== 'masterVolume') return;
    const val = Number(input.value);
    options[key] = val;
    if (key === 'volume' && val > 0 && !options.sound) options.sound = true;
    if (key === 'musicVolume' && val > 0 && !options.music) options.music = true;
    refresh();
    if ((key === 'volume' || key === 'masterVolume') && Date.now() - lastPreviewTick > 140) {
      lastPreviewTick = Date.now();
      sfx.click();
    }
  }));

  const statusEl = optionsRoot.querySelector<HTMLElement>('#opt-recovery-status');
  optionsRoot.querySelector('[data-export-save]')?.addEventListener('click', () => {
    sfx.click();
    const payload = exportSaveJson(session.save);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spudnaut-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (statusEl) statusEl.textContent = 'Save exported to downloads.';
  });

  const fileInput = optionsRoot.querySelector<HTMLInputElement>('#opt-import-file');
  optionsRoot.querySelector('[data-import-save]')?.addEventListener('click', () => {
    sfx.click();
    fileInput?.click();
  });
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const raw = await file.text();
    const imported = parseImportedSaveJson(raw);
    if (!imported) {
      sfx.wrong();
      if (statusEl) statusEl.textContent = 'Invalid save JSON file. No changes applied.';
      return;
    }
    session.save = imported;
    session.lobby = {
      ...DEFAULT_LOBBY,
      playerName: imported.name,
      colorId: imported.colorId,
      specialist: imported.specialist,
      destination: imported.destination,
    };
    persistSave(imported, { replaceBackup: true });
    applyOptions();
    syncOptionVisuals();
    sfx.complete();
    if (statusEl) statusEl.textContent = `Imported save for ${imported.name}.`;
  });

  optionsRoot.querySelector('[data-options-back]')?.addEventListener('click', () => {
    sfx.click();
    if (returnScreen === 'mission') {
      routes.showMissionShell();
      resumeMissionAfterModal();
      routes.startLoop();
      hud.querySelector<HTMLButtonElement>('[data-action="options"]')?.focus();
    } else if (returnScreen === 'training') {
      session.currentScreen = 'training';
      screenRoot.hidden = true;
      sceneShell.hidden = false;
      hud.hidden = true;
      trainingHud.hidden = false;
      document.body.dataset.screen = 'game';
      wakeStationGame();
      routes.renderTrainingHud();
      applyOptions();
      resumeTraining();
    } else if (existingMenuStage && existingOverlayHost) {
      session.currentScreen = 'menu';
      document.body.dataset.screen = 'menu';
      existingMenuStage.classList.remove('is-options-open');
      window.clearTimeout(session.optionsHideTimer);
      session.optionsHideTimer = window.setTimeout(() => {
        if (session.currentScreen === 'menu') {
          existingOverlayHost.hidden = true;
          existingOverlayHost.replaceChildren();
        }
      }, session.save.options.reducedMotion ? 0 : 280);
      existingMenuStage.querySelector<HTMLButtonElement>('.spud-center-nav [data-menu="options"]')?.focus();
    } else {
      routes.showMenu();
    }
  });

  optionsRoot.querySelector('[data-options-reset]')?.addEventListener('click', () => {
    openConstellationConfirmDialog({
      kicker: 'STORAGE RESET',
      title: 'RESET ALL SAVE DATA?',
      description: 'Reset training progress, settings, and active mission save? Export JSON first if you want a backup.',
      cancelLabel: 'KEEP SAVE',
      confirmLabel: 'RESET EVERYTHING',
      confirmIcon: 'reset',
      confirmVariant: 'danger',
      onConfirm: ({ close }) => {
        session.save = defaultSave();
        session.lobby = {
          ...DEFAULT_LOBBY,
          playerName: session.save.name,
          colorId: session.save.colorId,
          specialist: session.save.specialist,
          destination: session.save.destination,
        };
        try {
          localStorage.removeItem(SAVE_KEY);
          localStorage.removeItem(SAVE_BACKUP_KEY);
        } catch {
          // Storage may be unavailable.
        }
        persistSave(session.save, { replaceBackup: true });
        applyOptions();
        close();
        routes.showMenu();
      },
    });
  });
}

export function showCredits(): void {
  const { screenRoot } = dom();
  const archiveItems = [
    {
      id: 'brief-01',
      badge: 'PHASE 01',
      title: 'Briefing & Onboarding',
      sub: 'Earth Simulator',
      body: 'Read the transmission logs from Year 3042 and board the Earth Training Deck to familiarize yourself with station controls.',
    },
    {
      id: 'brief-02',
      badge: 'PHASE 02',
      title: 'Systems Inspection',
      sub: '4 Core Pillars',
      body: 'Inspect Life, Power, Research, and Farm consoles on the Training Deck and speak with the command crew.',
    },
    {
      id: 'brief-03',
      badge: 'PHASE 03',
      title: 'Spud Certification',
      sub: '70% Pass Threshold',
      body: 'Pass the 8-question Spud Exam covering pressure, life support, botany, and EVA safety to earn flight clearance.',
    },
    {
      id: 'brief-04',
      badge: 'PHASE 04',
      title: 'Difficulty-Scaled Lunar Trial',
      sub: '7 · 14 · 18 Days',
      body: 'Pick three of six jobs each shift, fix station alerts, and keep Life, Power, Research, and Farm healthy.',
    },
    {
      id: 'credits-design',
      badge: 'CREDITS',
      title: 'Mission Design',
      sub: 'Hexabyte Interactive',
      body: 'Spudnaut: The Great Starch Migration — a cooperative habitat survival trial built with Phaser 3, TypeScript, and Vite.',
    },
    {
      id: 'credits-art',
      badge: 'ASSETS',
      title: 'Art, UI & Audio',
      sub: 'Project & Open Packs',
      body: 'Potato crew and lunar vista illustrations by project artists. UI frames & icons: Kenney (CC0) and Wenrexa.',
    },
  ];
  let activeId = archiveItems[0]!.id;
  const bodyMarkup = `
    ${renderConstellationTitle('MISSION BRIEF & ARCHIVES', 'credits-title', 'HEXABYTE INTERACTIVE · YEAR 3042')}
    <div class="spud-split-columns">
      <div class="spud-copy-stack">
        <div class="spud-constellation-heading">ARCHIVE SLOTS · ${archiveItems.length} / ${archiveItems.length} UNLOCKED</div>
        <div class="spud-slot-list">
          ${archiveItems.map((item) => `
            <button type="button" class="spud-slot-row ${item.id === activeId ? 'selected' : ''}" data-archive-slot="${item.id}">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.sub)}</small>
              </div>
              <span class="spud-status-tag">${item.badge}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="spud-vertical-rule" aria-hidden="true"></div>
      <aside class="spud-copy-stack">
        <div class="spud-copy-block" id="credits-inspector-main">
          <h2>${escapeHtml(archiveItems[0]!.badge)} · ${escapeHtml(archiveItems[0]!.title.toUpperCase())}</h2>
          <p>${escapeHtml(archiveItems[0]!.body)}</p>
        </div>
        <div class="spud-constellation-divider" aria-hidden="true"></div>
        <div class="spud-copy-block">
          <h2>SCIENCE NOTES &amp; NASA REFERENCES</h2>
          <p>${escapeHtml(GAME_MODEL_NOTE)}</p>
          <ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:6px;">
            ${NASA_REFERENCES.map((source) => `<li><a href="${source.url}" target="_blank" rel="noreferrer" style="color:var(--spud-ice);">${escapeHtml(source.label)} ↗</a></li>`).join('')}
          </ul>
        </div>
      </aside>
    </div>
    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'back', label: 'BACK TO MENU', attrs: 'data-credits-back' })}
      ${renderConstellationAction({ icon: 'options', label: 'OPTIONS', attrs: 'data-credits-options', variant: 'primary' })}
    </footer>
  `;

  setScreen('credits', renderConstellationVideoScreen({
    ariaLabel: 'Mission Brief & Archives',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-credits-back',
    backAriaLabel: 'Back to Main Menu',
    utilityMarkup: '<span class="spud-metric-chip">SIMULATION MODEL <b>v3042</b></span>',
    extraClass: 'screen-credits',
    backdropArt: '/assets/ui/spudnaut/design/moonbase-dark.webp',
  }));

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-archive-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.archiveSlot;
      const found = archiveItems.find((item) => item.id === id);
      if (!found) return;
      activeId = found.id;
      sfx.click();
      screenRoot.querySelectorAll<HTMLButtonElement>('[data-archive-slot]').forEach((el) => el.classList.toggle('selected', el === btn));
      const box = screenRoot.querySelector<HTMLElement>('#credits-inspector-main');
      if (box) {
        box.innerHTML = `<h2>${escapeHtml(found.badge)} · ${escapeHtml(found.title.toUpperCase())}</h2><p>${escapeHtml(found.body)}</p>`;
      }
    });
  });
  screenRoot.querySelectorAll('[data-credits-back]').forEach((el) => el.addEventListener('click', () => {
    sfx.click();
    routes.showMenu();
  }));
  screenRoot.querySelector('[data-credits-options]')?.addEventListener('click', () => {
    sfx.click();
    routes.showOptions();
  });
}
