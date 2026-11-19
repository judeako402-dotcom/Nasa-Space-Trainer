import { persistSave } from '../model';
import { routes } from '../app/router';
import { dom, escapeHtml, isMissionActive, pauseMissionForModal, resumeMissionAfterModal, session } from '../app/session';
import { touchControls } from '../game/systems/TouchControls';
import { sfx } from '../sfx';
import { renderArcadeButton, renderConstellationIcon } from '../ui/icons';

interface TutorialStep {
  id: string;
  role: string;
  title: string;
  body: string;
  selector: string;
  fallbackSelector?: string;
  preferredDock: 'bottom-right' | 'bottom-left' | 'top-right';
}

let activePopover: HTMLDialogElement | null = null;
let activeSpotlight: HTMLDivElement | null = null;
let activeCleanup: (() => void) | null = null;
let activeStepIndex = 0;
let pausedShift = false;
let showPlannerAfter = false;

const steps: TutorialStep[] = [
  {
    id: 'progress', role: 'COMMANDER RUSSET', title: 'Your shift',
    body: 'Tap Tasks in the upper left to see your shift progress and walk to any job!',
    selector: '.hud-left-rail [data-action="tasks"]', fallbackSelector: '.hud-top-left', preferredDock: 'bottom-right',
  },
  {
    id: 'map', role: 'COMMANDER RUSSET', title: 'Find your way',
    body: 'Tap Map to find rooms. Tap the gear to change your settings.',
    selector: '.hud-top-right', preferredDock: 'bottom-right',
  },
  {
    id: 'bars', role: 'COMMANDER RUSSET', title: 'Keep your bars healthy',
    body: 'Tap Status below Tasks to check Life, Power, Research, and Farm. Every job boosts one bar (+) and uses a little of another (−)!',
    selector: '.hud-left-rail [data-action="status"]', fallbackSelector: '.hud-left-rail', preferredDock: 'bottom-right',
  },
  {
    id: 'planner', role: 'COMMANDER RUSSET', title: 'Pick three jobs',
    body: 'Look at the plus and minus on each card. Then pick three jobs for your shift!',
    selector: '.shift-planner .spud-planning-columns > section', preferredDock: 'bottom-right',
  },
];

const touchStep: TutorialStep = {
  id: 'touch', role: 'COMMANDER RUSSET', title: 'Walk on touch',
  body: 'Drag the joystick to move. Tap the station floor to walk there, then tap USE at a nearby job. PEEK, RECENTER, and TOUR adjust your view.',
  selector: '#touch-joystick', fallbackSelector: '.hud-top-left', preferredDock: 'top-right',
};
let activeSteps = steps;

function isElementVisible(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findSpotlightTarget(step: TutorialStep): HTMLElement | null {
  const primary = document.querySelector<HTMLElement>(step.selector);
  if (isElementVisible(primary)) return primary;
  if (step.fallbackSelector) {
    const fallback = document.querySelector<HTMLElement>(step.fallbackSelector);
    if (isElementVisible(fallback)) return fallback;
  }
  return null;
}

function positionTutorialElements(step: TutorialStep): void {
  if (!activePopover || !activeSpotlight) return;
  const target = findSpotlightTarget(step);
  if (!target) {
    activeSpotlight.hidden = true;
    activePopover.dataset.dock = step.preferredDock;
    return;
  }
  if (step.id === 'planner') target.scrollIntoView({ block: 'nearest' });
  const rect = target.getBoundingClientRect();
  const pad = 6;
  activeSpotlight.hidden = false;
  activeSpotlight.style.left = `${Math.max(4, rect.left - pad)}px`;
  activeSpotlight.style.top = `${Math.max(4, rect.top - pad)}px`;
  activeSpotlight.style.width = `${Math.min(window.innerWidth - 8, rect.width + pad * 2)}px`;
  activeSpotlight.style.height = `${Math.min(window.innerHeight - Math.max(4, rect.top - pad) - 4, rect.height + pad * 2)}px`;

  // Pick a dock corner that never obscures the highlighted HUD target (WCAG 2.4.11).
  if (window.innerWidth <= 680) {
    activePopover.dataset.dock = rect.top > window.innerHeight * 0.48 ? 'mobile-top' : 'mobile-bottom';
    return;
  }
  const inBottomRight = rect.right > window.innerWidth * 0.56 && rect.bottom > window.innerHeight * 0.55;
  const inTopRight = rect.right > window.innerWidth * 0.56 && rect.top < window.innerHeight * 0.45;
  if (step.preferredDock === 'bottom-right' && inBottomRight) {
    activePopover.dataset.dock = 'top-right';
  } else if (step.preferredDock === 'top-right' && inTopRight) {
    activePopover.dataset.dock = 'bottom-right';
  } else {
    activePopover.dataset.dock = step.preferredDock;
  }
}

export function isCommanderTutorialOpen(): boolean {
  return Boolean(activePopover?.isConnected);
}

export function dismissCommanderTutorial(markComplete = false): void {
  const showPlanner = showPlannerAfter;
  showPlannerAfter = false;
  activeCleanup?.();
  activeCleanup = null;
  activePopover?.remove();
  activePopover = null;
  activeSpotlight?.remove();
  activeSpotlight = null;
  if (pausedShift) resumeMissionAfterModal();
  pausedShift = false;
  if (markComplete) {
    session.save.tutorialComplete = true;
    persistSave(session.save);
    if (showPlanner) routes.startPlanning();
    else dom().overlayRoot.querySelector('.shift-planner')?.remove();
  }
}

export function startCommanderTutorial(options: { force?: boolean; beforePlanning?: boolean } = {}): boolean {
  if (session.currentScreen !== 'mission' || (!options.beforePlanning && !isMissionActive())) return false;
  if (!options.force && session.save.tutorialComplete) return false;
  dismissCommanderTutorial(false);

  showPlannerAfter = Boolean(options.beforePlanning);
  activeSteps = touchControls.enabled
    ? [steps[0]!, touchStep, ...steps.slice(1)]
    : steps;
  dom().hud.inert = true;
  if (isMissionActive() && !session.mission.modalOpen) {
    pauseMissionForModal();
    pausedShift = true;
  }
  activeStepIndex = 0;

  const spotlight = document.createElement('div');
  spotlight.id = 'commander-tutorial-spotlight';
  spotlight.className = 'spud-tutorial-spotlight';
  spotlight.setAttribute('aria-hidden', 'true');

  const supportsPopover = 'popover' in HTMLElement.prototype && 'showPopover' in HTMLElement.prototype;
  const popover = document.createElement('dialog');
  popover.id = 'commander-tutorial-popover';
  popover.className = `spud-tutorial-popout spud-dialogue-arcade${session.save.options.reducedMotion ? ' reduce-motion' : ''}`;
  popover.setAttribute('aria-labelledby', 'tutorial-step-title');
  popover.setAttribute('aria-describedby', 'tutorial-step-body');
  if (supportsPopover) {
    popover.setAttribute('popover', 'manual');
  }

  document.body.append(spotlight, popover);
  activeSpotlight = spotlight;
  activePopover = popover;

  if (supportsPopover) {
    try {
      popover.showPopover();
    } catch {
      popover.setAttribute('open', '');
    }
  } else {
    popover.setAttribute('open', '');
  }

  const paintStep = (): void => {
    const planner = dom().overlayRoot.querySelector('.shift-planner');
    if (activeStepIndex === steps.length - 1) {
      if (!planner) routes.startPlanning(true);
    } else {
      planner?.remove();
    }
    const step = activeSteps[activeStepIndex] ?? activeSteps[0]!;
    const isFirst = activeStepIndex === 0;
    const isLast = activeStepIndex >= activeSteps.length - 1;
    popover.innerHTML = `
      <div class="spud-dialogue-badge is-portrait" aria-hidden="true">
        <img class="spud-dialogue-portrait-img" src="/assets/ui/spudnaut/design/commander.webp" alt="" draggable="false" />
      </div>
      <button class="spud-dialogue-dismiss" type="button" data-tutorial-skip aria-label="Skip Commander briefing">
        ${renderConstellationIcon('close')}
      </button>
      <header class="spud-dialogue-header">
        <span class="spud-dialogue-role">${escapeHtml(step.role)}</span>
        <h2 class="spud-dialogue-speaker" id="tutorial-step-title">${escapeHtml(step.title)}</h2>
        <hr class="spud-dialogue-rule" />
      </header>
      <p class="dialogue-line spud-dialogue-quote" id="tutorial-step-body">${escapeHtml(step.body)}</p>
      <footer class="spud-tutorial-footer">
        <span class="spud-dialogue-pager" aria-label="Step ${activeStepIndex + 1} of ${activeSteps.length}">${activeStepIndex + 1} / ${activeSteps.length}</span>
        <div class="spud-tutorial-actions">
          <button type="button" class="spud-tutorial-link" data-tutorial-skip>SKIP</button>
          ${!isFirst ? `<button type="button" class="spud-tutorial-link" data-tutorial-prev>BACK</button>` : ''}
          ${renderArcadeButton({
            label: isLast ? 'LET’S GO' : 'NEXT',
            attrs: 'data-tutorial-next',
            ariaLabel: isLast ? 'Finish briefing' : 'Next briefing tip',
            size: 'sm',
          })}
        </div>
      </footer>
    `;

    popover.querySelectorAll<HTMLElement>('[data-tutorial-skip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.click();
        dismissCommanderTutorial(true);
      });
    });

    popover.querySelector<HTMLButtonElement>('[data-tutorial-prev]')?.addEventListener('click', () => {
      if (activeStepIndex <= 0) return;
      sfx.click();
      activeStepIndex -= 1;
      paintStep();
    });

    popover.querySelector<HTMLButtonElement>('[data-tutorial-next]')?.addEventListener('click', () => {
      sfx.click();
      if (isLast) {
        dismissCommanderTutorial(true);
        return;
      }
      activeStepIndex += 1;
      paintStep();
    });

    positionTutorialElements(step);
    popover.querySelector<HTMLButtonElement>('[data-tutorial-next]')?.focus();
  };

  const handleResize = (): void => {
    const step = activeSteps[activeStepIndex];
    if (step) positionTutorialElements(step);
  };
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      dismissCommanderTutorial(true);
    }
  };
  window.addEventListener('resize', handleResize);
  popover.addEventListener('keydown', handleKeyDown);

  activeCleanup = () => {
    dom().hud.inert = false;
    window.removeEventListener('resize', handleResize);
    popover.removeEventListener('keydown', handleKeyDown);
  };

  paintStep();
  return true;
}
