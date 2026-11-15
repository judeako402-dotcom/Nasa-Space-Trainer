import { musicState, startMusic } from '../audio/music';
import { scheduleIdlePrewarm } from '../app/prewarm';
import { routes } from '../app/router';
import { dom, session, setScreen, syncLobbyFromSave, trialDayLabel } from '../app/session';
import { sfx } from '../sfx';
import { renderArcadeButton } from '../ui/icons';
import { showPlayIntro } from './playIntroScreen';

export function showMenu(): void {
  const { screenRoot } = dom();
  window.clearTimeout(session.optionsHideTimer);
  const mState = musicState();
  if (!mState.started || mState.paused) {
    startMusic();
  }
  const savedTrial = session.save.activeTrial;
  const badgeMain = savedTrial ? trialDayLabel(savedTrial) : '';
  const resumeMarkup = savedTrial
    ? renderArcadeButton({
        label: 'RESUME',
        subLabel: badgeMain,
        attrs: 'data-menu="resume"',
        ariaLabel: `Resume Mission ${badgeMain}`,
        size: 'lg',
      })
    : '';
  const startLabel = 'START';
  const startAria = savedTrial ? 'Start a New Mission Loadout' : 'Start Mission';
  setScreen('menu', `
    <section class="screen-menu spud-video-menu spud-arcade-menu ${session.save.options.reducedMotion ? 'reduce-motion' : ''}">
      <img class="menu-ambient-backdrop spud-art-backdrop" src="/assets/ui/spudnaut/design/moonbase.webp" alt="" aria-hidden="true" draggable="false" />

      <div class="video-menu-stage has-spud-art">
        <img class="spud-art-stage-img is-menu-art" src="/assets/ui/spudnaut/design/moonbase.webp" alt="" aria-hidden="true" draggable="false" />
        <div class="menu-video-vignette spud-arcade-vignette" aria-hidden="true"></div>
        <div class="menu-zoom-flash" aria-hidden="true"></div>

        <div class="spud-center-menu is-arcade-hero">
          <h1 class="spud-arcade-brand">
            <img class="design-menu-brand" src="/assets/ui/spudnaut/design/brand.webp" alt="Spudnaut Moon — The Great Starch Migration" draggable="false" />
          </h1>

          <nav class="spud-center-nav spud-arcade-menu-nav design-menu-actions" aria-label="Spudnaut Main Menu">
            ${resumeMarkup}
            ${renderArcadeButton({
              label: startLabel,
              attrs: 'data-menu="play"',
              ariaLabel: startAria,
              size: 'lg',
            })}
            ${renderArcadeButton({
              label: 'SETTINGS',
              attrs: 'data-menu="options"',
              ariaLabel: 'Game Settings',
              size: 'lg',
            })}
          </nav>
          <p class="spud-medal-badge" aria-label="Mission rewards">🏅 ${session.save.medals} Golden Potato ${session.save.medals === 1 ? 'Medal' : 'Medals'} · ${session.save.games} finished</p>
          <div class="spud-menu-secondary" aria-label="Training and archives">
            <button type="button" class="spud-tutorial-link" data-menu="training">TRAINING DECK</button>
            <button type="button" class="spud-tutorial-link" data-menu="credits">ARCHIVES</button>
          </div>
        </div>

        <div class="spud-options-overlay" hidden></div>
      </div>
    </section>
  `);

  const menuItems = Array.from(screenRoot.querySelectorAll<HTMLButtonElement>('.spud-arcade-menu-nav .spud-arcade-btn'));
  menuItems.forEach((button, idx) => {
    button.addEventListener('mouseenter', () => {
      if (!button.classList.contains('is-active')) {
        menuItems.forEach((el) => el.classList.toggle('is-active', el === button));
        sfx.click();
      }
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        menuItems[(idx + 1) % menuItems.length]?.focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        menuItems[(idx - 1 + menuItems.length) % menuItems.length]?.focus();
      }
    });
  });

  const launchMenuTransition = (proceed: () => void): void => {
    const menuEl = screenRoot.querySelector<HTMLElement>('.screen-menu');
    if (menuEl && !menuEl.classList.contains('is-zooming')) {
      menuEl.classList.add('is-zooming');
      sfx.launch();
      const delay = session.save.options.reducedMotion ? 180 : 1050;
      window.setTimeout(proceed, delay);
    } else {
      proceed();
    }
  };

  screenRoot.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach((button) => button.addEventListener('click', () => {
    switch (button.dataset.menu) {
      case 'resume':
        launchMenuTransition(() => {
          syncLobbyFromSave();
          routes.resumeTrial();
        });
        break;
      case 'play':
      case 'start':
        launchMenuTransition(() => {
          showPlayIntro();
        });
        break;
      case 'options':
        sfx.click();
        routes.showOptions();
        break;
      case 'training':
        sfx.click();
        if (!session.save.trainingComplete) routes.showStory(0);
        else routes.showTraining();
        break;
      case 'credits':
        sfx.click();
        routes.showCredits();
        break;
    }
  }));

  scheduleIdlePrewarm();
}
