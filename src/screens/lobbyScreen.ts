import {
  DIFFICULTY_INFO, PLAYER_COLORS, SPECIALISTS,
  destinationById, getColor, persistSave, specialistById, trialMaxDays,
  type DifficultyId, type MissionMetrics, type PlayerColorId, type SpecialistId,
} from '../model';
import { scheduleSurfacePrewarm } from '../app/prewarm';
import { routes } from '../app/router';
import {
  applyOptions, dom, escapeHtml, saveSettings, session, setScreen,
  syncLobbyFromSave, trialDayLabel,
} from '../app/session';
import { scienceBrief } from '../data/science';
import { sfx } from '../sfx';
import { confirmReplaceSavedTrial, showAbortMissionConfirmation } from '../ui/confirmDialog';
import {
  METRIC_LABELS, SPECIALIST_STATS, renderArcadeButton, renderCharacterSpriteThumb,
  renderConstellationAction, renderConstellationIcon, renderConstellationTitle, renderFigmaIcon,
} from '../ui/icons';
import { renderConstellationVideoScreen } from '../ui/layout';

function renderSpecialistGrid(selectedSpecialist: SpecialistId): string {
  return `
    <div class="spud-loadout-classes" role="group" aria-labelledby="specialist-heading">
      ${SPECIALISTS.map((specialist) => `
        <button
          type="button"
          class="spud-class-row loadout-choice loadout-class"
          data-specialist="${specialist.id}"
          aria-pressed="${selectedSpecialist === specialist.id}"
          style="--choice-accent:${specialist.accent}"
        >
          ${renderCharacterSpriteThumb(specialist.art)}
          <div>
            <strong>${escapeHtml(specialist.name)}</strong>
            <small>${escapeHtml(specialist.role)}</small>
          </div>
          <span class="spud-orbital-check" aria-hidden="true"></span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderSuitColorNodes(selectedColorId: PlayerColorId, standardPalette = false): string {
  return `
    <div class="spud-color-nodes is-suit-swatches" role="group" aria-labelledby="suit-color-heading">
      ${(standardPalette ? ['red', 'orange', 'yellow', 'lime', 'blue', 'purple', 'brown', 'black'].map(id => getColor(id as PlayerColorId)) : PLAYER_COLORS).map((color) => `
        <button
          type="button"
          class="spud-color-node loadout-choice loadout-color"
          data-color="${color.id}"
          aria-pressed="${selectedColorId === color.id}"
          aria-label="${escapeHtml(color.name)} Suit"
          title="${escapeHtml(color.name)} Suit"
          style="--choice-accent:${color.css}"
        >
          <img class="spud-suit-swatch-img" src="/assets/suits/swatch-${color.id}.png" alt="" draggable="false" />
        </button>
      `).join('')}
    </div>
  `;
}

function renderDifficultyStrip(selectedDifficulty: DifficultyId): string {
  return `
    <div class="spud-diff-strip" role="group" aria-labelledby="difficulty-heading">
      ${(Object.keys(DIFFICULTY_INFO) as DifficultyId[]).map((diff) => `
        <button
          type="button"
          class="spud-diff-choice"
          data-difficulty="${diff}"
          aria-pressed="${selectedDifficulty === diff}"
        >
          <strong>${escapeHtml(DIFFICULTY_INFO[diff].name)}</strong>
          <small>${escapeHtml(DIFFICULTY_INFO[diff].description)}</small>
        </button>
      `).join('')}
    </div>
  `;
}

function renderLoadoutUtilityToggles(randomizeAttr: string, suffix: string): string {
  const { options } = session.save;
  return `
    <button type="button" class="spud-text-toggle" ${randomizeAttr} title="Randomize Loadout">
      ${renderConstellationIcon('randomize')}
      <span>RANDOMIZE</span>
    </button>
    <button type="button" class="spud-text-toggle ${options.sound ? 'active' : ''}" data-toggle="sound-${suffix}" aria-pressed="${options.sound}">
      ${renderConstellationIcon('sfxVolume')}
      <span class="spud-toggle-text">SOUND: ${options.sound ? 'ON' : 'OFF'}</span>
    </button>
    <button type="button" class="spud-text-toggle ${options.lineOfSight ? 'active' : ''}" data-toggle="vision-${suffix}" aria-pressed="${options.lineOfSight}">
      ${renderConstellationIcon('vision')}
      <span class="spud-toggle-text">VISION: ${options.lineOfSight ? 'ON' : 'OFF'}</span>
    </button>
  `;
}

function wireLoadoutAudioVisionToggles(root: HTMLElement, suffix: string): void {
  root.querySelector<HTMLButtonElement>(`[data-toggle="sound-${suffix}"]`)?.addEventListener('click', (event) => {
    const btn = event.currentTarget as HTMLButtonElement;
    session.save.options.sound = !session.save.options.sound;
    btn.classList.toggle('active', session.save.options.sound);
    btn.setAttribute('aria-pressed', String(session.save.options.sound));
    const txt = btn.querySelector<HTMLElement>('.spud-toggle-text');
    if (txt) txt.textContent = `SOUND: ${session.save.options.sound ? 'ON' : 'OFF'}`;
    applyOptions();
    saveSettings();
    sfx.click();
  });

  root.querySelector<HTMLButtonElement>(`[data-toggle="vision-${suffix}"]`)?.addEventListener('click', (event) => {
    const btn = event.currentTarget as HTMLButtonElement;
    session.save.options.lineOfSight = !session.save.options.lineOfSight;
    btn.classList.toggle('active', session.save.options.lineOfSight);
    btn.setAttribute('aria-pressed', String(session.save.options.lineOfSight));
    const txt = btn.querySelector<HTMLElement>('.spud-toggle-text');
    if (txt) txt.textContent = `VISION: ${session.save.options.lineOfSight ? 'ON' : 'OFF'}`;
    applyOptions();
    saveSettings();
    sfx.click();
  });
}

function wireDifficultyButtons(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => button.addEventListener('click', () => {
    session.save.options.difficulty = button.dataset.difficulty as DifficultyId;
    root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((el) => {
      el.setAttribute('aria-pressed', String(el === button));
    });
    applyOptions();
    saveSettings();
    sfx.click();
  }));
}

function randomCallsign(): string {
  const callsigns = ['Cmdr. Yukon', 'Nova Spud', 'Russet-7', 'Tater Prime', 'Sol-Tuber', 'Orbit Mash', 'Kennebec'];
  return callsigns[Math.floor(Math.random() * callsigns.length)] ?? 'Spudnaut';
}

function renderSegmentedStatRow(label: string, rawValue: number, suffix = ''): string {
  const clamped = Math.min(100, Math.max(0, Math.round(rawValue)));
  return `
    <div class="spud-seg-row">
      <div class="spud-seg-meta">
        <span>${escapeHtml(label)}</span>
        <b>${clamped}%${suffix}</b>
      </div>
      <div class="spud-seg-track" aria-hidden="true">
        <div class="spud-seg-slots">
          <div class="spud-seg-fill" style="--stat-pct:${clamped}%"></div>
        </div>
      </div>
    </div>
  `;
}

function renderLobbyHeroStage(): string {
  const { lobby } = session;
  const spec = specialistById(lobby.specialist);
  const color = getColor(lobby.colorId);
  return `
    <div class="spud-hero-ring" aria-hidden="true"></div>
    <div class="spud-hero-sprite" data-specialist-preview="${spec.id}">${renderCharacterSpriteThumb(spec.art, true, lobby.colorId)}</div>
    <span class="spud-hero-callsign" id="loadout-callsign">${escapeHtml(lobby.playerName.trim() || 'Spudnaut')}</span>
    <span class="spud-hero-suit-tag"><i aria-hidden="true"></i>${escapeHtml(color.name)} Suit</span>
  `;
}

function renderLobbyInspectorDetails(showPortrait = true): string {
  const { lobby } = session;
  const spec = specialistById(lobby.specialist);
  const color = getColor(lobby.colorId);
  const stats = SPECIALIST_STATS[lobby.specialist] ?? SPECIALIST_STATS.repairman;
  return `
    ${showPortrait ? `
      <div class="spud-loadout-portrait" style="--choice-accent:${color.css}">
        <div class="spud-portrait-ring">${renderCharacterSpriteThumb(spec.art, true, lobby.colorId)}</div>
        <div class="spud-loadout-meta">
          <span id="loadout-callsign">${escapeHtml(lobby.playerName.trim() || 'Spudnaut')}</span>
          <h3>${escapeHtml(spec.name)}</h3>
          <small><i aria-hidden="true"></i>${escapeHtml(color.name)} suit</small>
        </div>
      </div>
    ` : ''}
    <div class="spud-copy-block spud-perk-block">
      <h2>CLASS PERK</h2>
      <p>${escapeHtml(spec.perk)}</p>
    </div>
    <div class="spud-stat-bars is-segmented">
      ${stats.map((row) => renderSegmentedStatRow(row.label, row.value)).join('')}
    </div>
  `;
}

export function showLobby(): void {
  const { screenRoot } = dom();
  const { lobby, save } = session;
  scheduleSurfacePrewarm();
  const spec = specialistById(lobby.specialist);
  const color = getColor(lobby.colorId);

  const bodyMarkup = `
    <header class="spud-arcade-screen-head">
      <h1 id="lobby-title" class="spud-comic-heading" tabindex="-1">CHOOSE YOUR SPUDNAUT</h1>
    </header>
    <div class="spud-loadout-showcase">
      <div class="spud-loadout-left">
        <div class="spud-class-banner" id="loadout-class-banner" aria-live="polite" aria-atomic="true">
          <strong class="spud-class-banner-name">${escapeHtml(spec.name.toUpperCase())}</strong>
        </div>

        <div class="spud-loadout-controls-group">
          <div class="spud-constellation-heading" id="suit-color-heading">
            ${renderFigmaIcon('loadout-color', 'spud-heading-icon')}
            <span>SUIT COLOR</span>
          </div>
          ${renderSuitColorNodes(lobby.colorId, true)}
        </div>

        <div class="spud-loadout-controls-card design-loadout-options">
          <label class="spud-constellation-heading" for="lobby-name">CALLSIGN</label>
          <input class="spud-line-input is-boxed" id="lobby-name" maxlength="18" value="${escapeHtml(lobby.playerName)}" />
          <div class="spud-constellation-heading" id="difficulty-heading">
            ${renderFigmaIcon('loadout-difficulty', 'spud-heading-icon')}
            <span>TRIAL DIFFICULTY</span>
          </div>
          ${renderDifficultyStrip(save.options.difficulty)}
        </div>

        <div class="spud-loadout-cta">
          ${renderArcadeButton({
            label: 'CHOOSE',
            attrs: 'data-lobby-next',
            ariaLabel: 'Choose Habitat',
            size: 'md',
            extraClass: 'spud-loadout-choose',
          })}
        </div>
      </div>

      <div class="spud-loadout-center">
        <div class="spud-hero-carousel" role="group" aria-label="Choose a specialist">
          <button type="button" class="spud-carousel-arrow is-prev" data-specialist-prev aria-label="Previous specialist" aria-controls="loadout-class-banner loadout-hero-stage">
            <span class="spud-back-arrow" aria-hidden="true"></span>
          </button>
          <div class="spud-hero-stage" id="loadout-hero-stage" style="--choice-accent:${color.css}">
            ${renderLobbyHeroStage()}
          </div>
          <button type="button" class="spud-carousel-arrow is-next" data-specialist-next aria-label="Next specialist" aria-controls="loadout-class-banner loadout-hero-stage">
            <span class="spud-back-arrow" aria-hidden="true"></span>
          </button>
        </div>

        <div class="spud-class-pills" role="group" aria-label="Specialist classes">
          ${SPECIALISTS.map((item) => `
            <button
              type="button"
              class="spud-class-pill loadout-choice"
              data-specialist="${item.id}"
              aria-pressed="${lobby.specialist === item.id}"
            >${escapeHtml(item.name)}</button>
          `).join('')}
        </div>
      </div>

      <aside class="spud-stats-card loadout-inspector" aria-label="Crew loadout preview">
        <div class="loadout-details spud-copy-stack">
          ${renderLobbyInspectorDetails(false)}
        </div>
      </aside>
    </div>
  `;

  setScreen('lobby', renderConstellationVideoScreen({
    ariaLabel: 'Choose Your Spudnaut',
    bodyMarkup,
    backLabel: 'MAIN MENU',
    backAttrs: 'data-lobby-back',
    backAriaLabel: 'Back to Main Menu',
    extraClass: 'lobby-screen design-loadout',
    backdropArt: '/assets/ui/spudnaut/design/moonbase-glow.webp',
  }));

  screenRoot.querySelector<HTMLElement>('#lobby-title')?.focus();

  const refreshLobbyInPlace = (): void => {
    const activeSpec = specialistById(lobby.specialist);
    const activeColor = getColor(lobby.colorId);
    screenRoot.querySelectorAll<HTMLButtonElement>('.loadout-choice').forEach((button) => {
      const selected = button.dataset.color === lobby.colorId || button.dataset.specialist === lobby.specialist;
      button.setAttribute('aria-pressed', String(selected));
    });
    const bannerName = screenRoot.querySelector<HTMLElement>('.spud-class-banner-name');
    if (bannerName) bannerName.textContent = activeSpec.name.toUpperCase();
    const heroStage = screenRoot.querySelector<HTMLElement>('#loadout-hero-stage');
    if (heroStage) {
      heroStage.style.setProperty('--choice-accent', activeColor.css);
      heroStage.innerHTML = renderLobbyHeroStage();
    }
    const details = screenRoot.querySelector<HTMLElement>('.loadout-details');
    if (details) details.innerHTML = renderLobbyInspectorDetails(false);
  };

  screenRoot.querySelector<HTMLInputElement>('#lobby-name')?.addEventListener('input', (event) => {
    lobby.playerName = (event.target as HTMLInputElement).value;
    const callsign = screenRoot.querySelector<HTMLElement>('#loadout-callsign');
    if (callsign) callsign.textContent = lobby.playerName.trim() || 'Spudnaut';
  });

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((button) => button.addEventListener('click', () => {
    lobby.colorId = button.dataset.color as PlayerColorId;
    sfx.click();
    refreshLobbyInPlace();
  }));

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-specialist]').forEach((button) => button.addEventListener('click', () => {
    lobby.specialist = button.dataset.specialist as SpecialistId;
    sfx.click();
    refreshLobbyInPlace();
  }));

  const cycleSpecialist = (delta: number): void => {
    const idx = SPECIALISTS.findIndex((item) => item.id === lobby.specialist);
    const nextIdx = (idx + delta + SPECIALISTS.length) % SPECIALISTS.length;
    lobby.specialist = SPECIALISTS[nextIdx]?.id ?? lobby.specialist;
    sfx.click();
    refreshLobbyInPlace();
  };
  screenRoot.querySelector('[data-specialist-prev]')?.addEventListener('click', () => cycleSpecialist(-1));
  screenRoot.querySelector('[data-specialist-next]')?.addEventListener('click', () => cycleSpecialist(1));
  screenRoot.querySelector('.spud-hero-carousel')?.addEventListener('keydown', (event: Event) => {
    const key = (event as KeyboardEvent).key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    event.preventDefault();
    cycleSpecialist(key === 'ArrowLeft' ? -1 : 1);
  });

  wireDifficultyButtons(screenRoot);

  screenRoot.querySelectorAll('[data-lobby-back]').forEach((el) => el.addEventListener('click', () => {
    sfx.click();
    routes.showMenu();
  }));
  screenRoot.querySelector('[data-lobby-next]')?.addEventListener('click', () => {
    sfx.click();
    showHabitat();
  });
}

export function showResumeStaging(): void {
  const { screenRoot } = dom();
  const { save } = session;
  const saved = save.activeTrial;
  if (!saved) {
    showLobby();
    return;
  }
  scheduleSurfacePrewarm();
  syncLobbyFromSave();
  const { lobby } = session;
  const destination = destinationById(save.destination);
  const dayLabel = trialDayLabel(saved);
  const shiftStageLabel = saved.phase === 'report' && saved.report
    ? 'SAVED SHIFT REPORT'
    : saved.tasks.length > 0
      ? `SHIFT IN PROGRESS · ${saved.completed.length} / ${saved.tasks.length} TASKS`
      : 'SHIFT PLANNING READY';
  const stageShort = saved.phase === 'report' && saved.report
    ? 'REPORT'
    : saved.tasks.length > 0
      ? `${saved.completed.length} / ${saved.tasks.length} TASKS`
      : 'PLANNING';
  const metricOrder: (keyof MissionMetrics)[] = ['life', 'power', 'research', 'farm'];
  const utilityMarkup = renderLoadoutUtilityToggles('data-resume-randomize', 'resume');

  const bodyMarkup = `
    ${renderConstellationTitle('RESUME EXPEDITION', 'resume-title', `${dayLabel} · ${destination.name.toUpperCase()} · ${shiftStageLabel}`)}
    <div class="spud-split-columns">
      <div class="spud-copy-stack">
        <div class="spud-copy-block">
          <label class="spud-constellation-heading" for="resume-name">SPUDNAUT CALLSIGN (APPLIES LIVE)</label>
          <input class="spud-line-input" id="resume-name" maxlength="18" value="${escapeHtml(lobby.playerName)}" />
        </div>

        <div class="spud-constellation-heading" id="suit-color-heading">SUIT COLOR (APPLIES LIVE)</div>
        ${renderSuitColorNodes(lobby.colorId)}

        <div class="spud-copy-block">
          <div class="spud-constellation-heading">DIFFICULTY</div>
          <small>${escapeHtml(DIFFICULTY_INFO[saved.majorEventRun?.difficulty ?? save.options.difficulty].description)}</small>
        </div>

        <div class="spud-constellation-heading" id="specialist-heading">SPECIALIST CLASS · ACTIVE TRIAL (CHANGING OPENS NEW MISSION SETUP)</div>
        ${renderSpecialistGrid(save.specialist)}

        <div class="spud-copy-block">
          <div class="spud-constellation-heading" id="resume-habitat-heading">TARGET HABITAT · LOCKED TO LUNAR BASE</div>
          <small>${escapeHtml(destination.name)} · ${escapeHtml(destination.gravity)} · ${escapeHtml(destination.hazard)}</small>
        </div>
      </div>

      <div class="spud-vertical-rule" aria-hidden="true"></div>

      <aside class="spud-copy-stack loadout-inspector" aria-label="Saved expedition status">
        <div class="loadout-details spud-copy-stack">
          ${renderLobbyInspectorDetails()}
        </div>
        <div class="spud-constellation-heading">SAVED HABITAT TELEMETRY</div>
        <div class="spud-telemetry-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;">
          <div class="spud-telemetry-cell">
            <span>TRIAL DAY</span>
            <strong>${dayLabel}</strong>
            <small>${escapeHtml(destination.name.toUpperCase())}</small>
          </div>
          <div class="spud-telemetry-cell">
            <span>SHIFT STAGE</span>
            <strong>${stageShort}</strong>
            <small>${saved.missedDays} MISSED SHIFTS</small>
          </div>
        </div>
        <div class="spud-stat-bars is-segmented">
          ${metricOrder.map((metric) => renderSegmentedStatRow(
            METRIC_LABELS[metric].split(' ')[0]!.toUpperCase(),
            saved.metrics[metric],
          )).join('')}
        </div>
      </aside>
    </div>

    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'back', label: 'MAIN MENU', attrs: 'data-resume-back' })}
      ${renderConstellationAction({ icon: 'play', label: 'NEW MISSION', attrs: 'data-resume-new' })}
      ${renderConstellationAction({ icon: 'abort', label: 'ABORT TRIAL', attrs: 'data-resume-abort', variant: 'danger' })}
      ${renderArcadeButton({ label: 'CONTINUE SHIFT', attrs: 'data-resume-go', size: 'sm' })}
    </footer>
  `;

  setScreen('lobby', renderConstellationVideoScreen({
    ariaLabel: 'Resume Expedition Loadout and Choices',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-resume-back',
    backAriaLabel: 'Back to Main Menu',
    utilityMarkup,
    extraClass: 'resume-staging-screen',
    backdropArt: '/assets/ui/spudnaut/design/moonbase-dark.webp',
  }));

  screenRoot.querySelector<HTMLElement>('#resume-title')?.focus();

  const persistResumeCustomizations = (): void => {
    save.name = lobby.playerName.trim() || 'Spudnaut';
    save.colorId = lobby.colorId;
    persistSave(save);
  };

  const refreshResumeLoadoutInPlace = (): void => {
    screenRoot.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.color === lobby.colorId));
    });
    const details = screenRoot.querySelector<HTMLElement>('.loadout-details');
    if (details) details.innerHTML = renderLobbyInspectorDetails();
  };

  screenRoot.querySelector<HTMLInputElement>('#resume-name')?.addEventListener('input', (event) => {
    lobby.playerName = (event.target as HTMLInputElement).value;
    persistResumeCustomizations();
    const callsign = screenRoot.querySelector<HTMLElement>('#loadout-callsign');
    if (callsign) callsign.textContent = lobby.playerName.trim() || 'Spudnaut';
  });

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((button) => button.addEventListener('click', () => {
    lobby.colorId = button.dataset.color as PlayerColorId;
    persistResumeCustomizations();
    sfx.click();
    refreshResumeLoadoutInPlace();
  }));

  wireLoadoutAudioVisionToggles(screenRoot, 'resume');

  screenRoot.querySelector('[data-resume-randomize]')?.addEventListener('click', () => {
    lobby.playerName = randomCallsign();
    lobby.colorId = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]?.id ?? lobby.colorId;
    persistResumeCustomizations();
    const input = screenRoot.querySelector<HTMLInputElement>('#resume-name');
    if (input) input.value = lobby.playerName;
    sfx.click();
    refreshResumeLoadoutInPlace();
  });

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-specialist]').forEach((button) => button.addEventListener('click', () => {
    const chosenId = button.dataset.specialist as SpecialistId;
    if (chosenId === save.specialist) {
      sfx.click();
      return;
    }
    const spec = specialistById(chosenId);
    confirmReplaceSavedTrial({
      title: `SWITCH TO ${spec.name.toUpperCase()}?`,
      description: `Changing your Specialist Class starts a new Day 01 expedition setup. Your saved ${dayLabel} mission stays safe until you confirm launch on Flight Check.`,
      confirmLabel: 'OPEN LOADOUT SETUP',
      onConfirm: () => {
        syncLobbyFromSave();
        session.lobby.specialist = chosenId;
        showLobby();
      },
    });
  }));

  screenRoot.querySelectorAll('[data-resume-back]').forEach((el) => el.addEventListener('click', () => {
    sfx.click();
    routes.showMenu();
  }));

  screenRoot.querySelector('[data-resume-new]')?.addEventListener('click', () => {
    confirmReplaceSavedTrial({
      title: 'START A NEW MISSION SETUP?',
      description: `Opens full Loadout and Habitat selection for a fresh Day 01 trial. Your saved ${dayLabel} mission stays intact until you confirm Launch.`,
      confirmLabel: 'GO TO LOADOUT',
      confirmIcon: 'play',
      onConfirm: () => {
        syncLobbyFromSave();
        showLobby();
      },
    });
  });

  screenRoot.querySelector('[data-resume-abort]')?.addEventListener('click', showAbortMissionConfirmation);

  screenRoot.querySelector('[data-resume-go]')?.addEventListener('click', () => {
    persistResumeCustomizations();
    sfx.launch();
    routes.resumeTrial();
  });
}

function renderHabitatOrbShowcase(): string {
  const destination = destinationById('moon');
  return `
    <div class="spud-habitat-orb-stage is-moon" style="--habitat-accent:${destination.accent}">
      <img
        class="spud-habitat-hero-img"
        src="/assets/ui/spudnaut/design/moon.webp"
        alt="${escapeHtml(destination.name)}"
        width="560"
        height="560"
      />
    </div>
  `;
}

function renderHabitatBrief(): string {
  const destination = destinationById('moon');
  const brief = scienceBrief('moon');
  return `
    <div class="spud-copy-block spud-habitat-brief-card">
      <h2 class="spud-habitat-name">THE MOON</h2>
      <p>${escapeHtml(brief.fact)}</p>
      <details class="design-moon-notes">
        <summary>Suit safety</summary>
        <p>No air outside! Seal your suit and keep your Life and Power bars healthy.</p>
      </details>
      <div class="spud-habitat-cta">
        ${renderArcadeButton({
          label: 'CHOOSE',
          attrs: 'data-habitat-next',
          ariaLabel: `Choose ${destination.name} and continue to Final Flight Check`,
          size: 'md',
        })}
      </div>
    </div>
  `;
}

export function showHabitat(): void {
  const { screenRoot } = dom();
  session.lobby.destination = 'moon';
  scheduleSurfacePrewarm();
  const bodyMarkup = `
    <header class="spud-arcade-screen-head">
      <h1 id="habitat-title" class="spud-comic-heading" tabindex="-1">HABITAT</h1>
    </header>
    <div class="spud-habitat-band">
      <div class="spud-habitat-showcase is-moon-only">
        <div class="spud-habitat-left">
          <div class="spud-habitat-orb-host">
            ${renderHabitatOrbShowcase()}
          </div>
        </div>
        <aside class="spud-copy-stack habitat-brief" aria-live="polite">
          ${renderHabitatBrief()}
        </aside>
      </div>
    </div>
  `;

  setScreen('lobby', renderConstellationVideoScreen({
    ariaLabel: 'Lunar Target Habitat Briefing',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-habitat-back',
    backAriaLabel: 'Back to Class Selection',
    extraClass: 'habitat-screen design-habitat',
    backdropArt: '/assets/ui/spudnaut/design/moonbase-dark.webp',
  }));

  screenRoot.querySelector<HTMLElement>('#habitat-title')?.focus();

  screenRoot.querySelectorAll('[data-habitat-back]').forEach((el) => el.addEventListener('click', () => {
    sfx.click();
    showLobby();
  }));
  screenRoot.querySelector('[data-habitat-next]')?.addEventListener('click', () => {
    sfx.click();
    showLaunch();
  });
}

export function showLaunch(): void {
  const { screenRoot } = dom();
  const { lobby, save } = session;
  lobby.destination = 'moon';
  const specialist = specialistById(lobby.specialist);
  const destination = destinationById('moon');
  const name = lobby.playerName.trim() || 'Spudnaut';
  const color = getColor(lobby.colorId);
  const bodyMarkup = `
    <header class="spud-arcade-screen-head">
      <span class="spud-constellation-kicker is-centered">SPUDNAUT SPACE AGENCY · LAUNCH CLEARANCE</span>
      <h1 id="launch-title" class="spud-comic-heading" tabindex="-1">FINAL FLIGHT CHECK</h1>
    </header>
    <div class="spud-flight-check-showcase">
      <div class="spud-flight-visual-card">
        <img class="spud-flight-panel-art" src="/assets/ui/spudnaut/design/moonbase.webp" alt="" aria-hidden="true" draggable="false" />
        <div class="spud-flight-visual-overlay">
          <div class="spud-flight-crew-ring" style="--choice-accent:${color.css}">
            ${renderCharacterSpriteThumb(specialist.art, true, lobby.colorId)}
          </div>
          <div class="spud-flight-crew-copy">
            <span>CREW MANIFEST LOCKED · ${escapeHtml(color.name.toUpperCase())} SUIT</span>
            <strong>${escapeHtml(name)} · ${escapeHtml(specialist.name)}</strong>
            <small>${escapeHtml(specialist.perk)}</small>
          </div>
        </div>
      </div>

      <div class="spud-flight-details-card">
        <div class="spud-telemetry-grid">
          <div class="spud-telemetry-cell">
            <span class="spud-cell-head">${renderFigmaIcon('check-target', 'spud-cell-icon')}<span>TARGET</span></span>
            <strong>${escapeHtml(destination.name)}</strong>
            <small>SURFACE HABITAT</small>
          </div>
          <div class="spud-telemetry-cell">
            <span class="spud-cell-head">${renderFigmaIcon('check-gravity', 'spud-cell-icon')}<span>GRAVITY</span></span>
            <strong>${escapeHtml(destination.gravity)}</strong>
            <small>FIELD ENV</small>
          </div>
          <div class="spud-telemetry-cell">
            <span class="spud-cell-head">${renderFigmaIcon('check-hazard', 'spud-cell-icon')}<span>HAZARD</span></span>
            <strong>${escapeHtml(destination.hazard)}</strong>
            <small>PRIMARY RISK</small>
          </div>
          <div class="spud-telemetry-cell">
            <span class="spud-cell-head">${renderFigmaIcon('check-duration', 'spud-cell-icon')}<span>DURATION</span></span>
            <strong>${trialMaxDays(save.options.difficulty)} SHIFTS</strong>
            <small>YOUR TIME AT THE MOON BASE</small>
          </div>
          <div class="spud-telemetry-cell">
            <span class="spud-cell-head">${renderFigmaIcon('check-systems', 'spud-cell-icon')}<span>SYSTEMS</span></span>
            <strong>4 CORE</strong>
            <small>LIFE · POWER · RESEARCH · FARM</small>
          </div>
          <div class="spud-telemetry-cell">
            <span class="spud-cell-head">${renderFigmaIcon('check-mode', 'spud-cell-icon')}<span>MODE</span></span>
            <strong>${escapeHtml(DIFFICULTY_INFO[save.options.difficulty].name)}</strong>
            <small>DIFFICULTY</small>
          </div>
        </div>
        <footer class="spud-flight-cta-row">
          ${renderArcadeButton({
            label: 'BEGIN TRIAL · DAY 01',
            attrs: 'data-launch-begin',
            size: 'md',
            iconMarkup: renderFigmaIcon('confirm-launch', 'spud-action-figma-icon is-tight'),
          })}
        </footer>
      </div>
    </div>
  `;

  setScreen('launch', renderConstellationVideoScreen({
    ariaLabel: 'Final Flight Check',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-launch-back',
    backAriaLabel: 'Back to Target Habitat',
    narrow: true,
    extraClass: 'launch-screen',
    backdropArt: '/assets/ui/spudnaut/design/moonbase-dark.webp',
  }));
  screenRoot.querySelector<HTMLElement>('#launch-title')?.focus();
  screenRoot.querySelectorAll('[data-launch-back]').forEach((el) => el.addEventListener('click', () => {
    sfx.click();
    showHabitat();
  }));
  screenRoot.querySelector('[data-launch-begin]')?.addEventListener('click', () => {
    const launchNew = (): void => {
      sfx.launch();
      startLaunchSequence();
    };
    if (save.activeTrial) {
      const savedDay = save.activeTrial.penaltyDay
        ? trialMaxDays(save.options.difficulty) + save.activeTrial.penaltyDay
        : save.activeTrial.day;
      confirmReplaceSavedTrial({
        title: 'LAUNCH DAY 01 & REPLACE SAVED TRIAL?',
        description: `Launching this new expedition will overwrite your saved Day ${String(savedDay).padStart(2, '0')} mission on ${destinationById(save.destination).name}.`,
        confirmLabel: 'LAUNCH DAY 01',
        confirmIcon: 'launch',
        variant: 'danger',
        onConfirm: launchNew,
      });
      return;
    }
    launchNew();
  });
}

export function startLaunchSequence(): void {
  const { screenRoot } = dom();
  setScreen('launch', `
    <section class="screen-splash launch-sequence" aria-label="Launch and landing cinematic">
      <div class="intro-canvas" id="launch-canvas" aria-hidden="true"></div>
      <div class="intro-accessibility">
        <span>SPUDNAUT SPACE AGENCY · FLIGHT DECK</span>
        <button class="intro-skip" type="button">${renderConstellationIcon('skip')} <span>SKIP FLIGHT</span> <kbd>ENTER</kbd></button>
      </div>
    </section>
  `);
  let finished = false;
  const finish = (): void => {
    if (finished || session.currentScreen !== 'launch') return;
    finished = true;
    session.launchGame?.destroy(true);
    session.launchGame = null;
    routes.beginMission();
  };
  const host = screenRoot.querySelector<HTMLDivElement>('#launch-canvas');
  if (!host) {
    finish();
    return;
  }
  void import('../game/launch').then(({ createLaunchSequence }) => {
    if (session.currentScreen === 'launch') {
      session.launchGame = createLaunchSequence(host, {
        playerArt: specialistById(session.lobby.specialist).art,
        colorId: session.lobby.colorId,
        reducedMotion: session.save.options.reducedMotion,
        onComplete: finish,
      });
    }
  }).catch(finish);
  screenRoot.querySelector('.intro-skip')?.addEventListener('click', finish);
}
