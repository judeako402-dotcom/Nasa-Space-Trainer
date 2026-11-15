import { startMusic, stopMusic } from '../audio/music';
import { routes } from '../app/router';
import { dom, session, setScreen, syncLobbyFromSave, targetMusicGain } from '../app/session';
import type { ScreenId } from '../app/state';
import { renderArcadeButton } from '../ui/icons';

export interface CutsceneVideoOptions {
  screenId: ScreenId;
  ariaLabel: string;
  src: string;
  skipLabel: string;
  skipAriaLabel: string;
  footerLabel?: string;
  onComplete: () => void;
}

/** Plays a full-screen video cutscene with skip/fade support, then invokes `onComplete`. */
export function playCutsceneVideo(options: CutsceneVideoOptions): void {
  const { screenRoot } = dom();
  stopMusic(220);
  setScreen(options.screenId, `
    <section class="screen-splash ${session.save.options.reducedMotion ? 'reduce-motion' : ''}" aria-label="${options.ariaLabel}">
      <div class="opening-art" aria-hidden="true">
        <video class="opening-video" src="${options.src}" preload="auto" playsinline></video>
      </div>
      <div class="intro-accessibility">
        ${options.footerLabel ? `<span>${options.footerLabel}</span>` : ''}
        ${renderArcadeButton({
          label: options.skipLabel,
          subLabel: 'ENTER',
          extraClass: 'intro-skip',
          attrs: 'aria-keyshortcuts="Enter"',
          ariaLabel: options.skipAriaLabel,
          size: 'md',
        })}
      </div>
    </section>
  `);

  const section = screenRoot.querySelector<HTMLElement>('.screen-splash');
  const video = screenRoot.querySelector<HTMLVideoElement>('.opening-video');
  const skipBtn = screenRoot.querySelector<HTMLButtonElement>('.intro-skip');
  let finished = false;
  let skipping = false;
  let fadeRaf = 0;
  let monitorRaf = 0;
  let fallbackTimer = 0;

  const cleanup = (): void => {
    finished = true;
    window.clearTimeout(fallbackTimer);
    if (fadeRaf) {
      cancelAnimationFrame(fadeRaf);
      fadeRaf = 0;
    }
    if (monitorRaf) {
      cancelAnimationFrame(monitorRaf);
      monitorRaf = 0;
    }
    if (video) {
      video.pause();
      video.muted = true;
      video.volume = 0;
    }
  };

  const finish = (): void => {
    if (finished || session.currentScreen !== options.screenId) return;
    cleanup();
    if (session.save.options.music && options.screenId === 'play-intro') {
      startMusic(session.save.options.reducedMotion ? 350 : 1000);
    }
    options.onComplete();
  };

  const beginSkipFade = (): void => {
    if (finished || skipping || session.currentScreen !== options.screenId) return;
    skipping = true;
    window.clearTimeout(fallbackTimer);
    if (monitorRaf) {
      cancelAnimationFrame(monitorRaf);
      monitorRaf = 0;
    }
    if (skipBtn) skipBtn.disabled = true;
    section?.classList.add('is-fading');
    const durationMs = session.save.options.reducedMotion ? 140 : 320;
    const fromVol = video && !video.muted ? video.volume : 0;
    const startMs = performance.now();
    const step = (): void => {
      if (finished || session.currentScreen !== options.screenId) return;
      const progress = Math.min(1, (performance.now() - startMs) / durationMs);
      if (video) video.volume = Math.max(0, fromVol * (1 - progress));
      if (progress >= 1) {
        fadeRaf = 0;
        finish();
        return;
      }
      fadeRaf = requestAnimationFrame(step);
    };
    fadeRaf = requestAnimationFrame(step);
  };

  const monitorPlayback = (): void => {
    if (finished || skipping || session.currentScreen !== options.screenId || !video) return;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (duration > 0) {
      const remaining = Math.max(0, duration - video.currentTime);
      const fadeLead = session.save.options.reducedMotion ? 0.25 : 0.45;
      if (remaining <= fadeLead) section?.classList.add('is-fading');
    }
    monitorRaf = requestAnimationFrame(monitorPlayback);
  };

  skipBtn?.addEventListener('click', beginSkipFade);
  section?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      beginSkipFade();
    }
  });

  if (!video) {
    finish();
    return;
  }

  video.addEventListener('ended', finish, { once: true });
  video.addEventListener('error', finish, { once: true });

  const gain = targetMusicGain();
  if (gain <= 0) {
    video.muted = true;
    video.volume = 0;
  } else {
    video.muted = false;
    video.volume = gain;
  }

  try {
    void Promise.resolve(video.play()).catch(() => {
      video.muted = true;
      video.volume = 0;
      return Promise.resolve(video.play()).catch(finish);
    });
  } catch {
    finish();
  }

  monitorRaf = requestAnimationFrame(monitorPlayback);
  fallbackTimer = window.setTimeout(finish, 45000);
}

/** Plays the pre-loadout video cutscene when starting from the main menu, then transitions into the loadout lobby. */
export function showPlayIntro(): void {
  playCutsceneVideo({
    screenId: 'play-intro',
    ariaLabel: 'Mission briefing video',
    src: '/assets/play-intro.mp4',
    skipLabel: 'SKIP',
    skipAriaLabel: 'Skip mission video',
    onComplete: () => {
      syncLobbyFromSave();
      routes.showLobby();
    },
  });
}

/** Plays the fullscreen return-to-Earth ending video after completing all shifts, then returns straight to the Main Menu. */
export function showEndingCutscene(): void {
  playCutsceneVideo({
    screenId: 'ending',
    ariaLabel: 'Return to Earth ending cinematic',
    src: '/assets/ui/spudnaut/ending/homecoming.mp4',
    skipLabel: 'SKIP',
    skipAriaLabel: 'Skip ending video',
    onComplete: () => routes.showMenu(),
  });
}
