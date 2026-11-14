import { startMusic, stopMusic } from '../audio/music';
import { routes } from '../app/router';
import { dom, session, setScreen, targetMusicGain } from '../app/session';
import { renderArcadeButton } from '../ui/icons';

export function showSplash(): void {
  const { screenRoot } = dom();
  stopMusic(0);
  setScreen('splash', `
    <section class="screen-splash ${session.save.options.reducedMotion ? 'reduce-motion' : ''}" aria-label="Spudnaut opening cinematic">
      <div class="opening-art" aria-hidden="true"><video class="opening-video" src="/assets/opening-cinematic.mp4" preload="auto" playsinline></video></div>
      <div class="intro-accessibility">
        <button class="intro-audio-hint" type="button" hidden>SOUND MUTED BY BROWSER — TAP TO UNMUTE</button>
        ${renderArcadeButton({
          label: 'SKIP INTRO',
          subLabel: 'ENTER',
          extraClass: 'intro-skip',
          attrs: 'aria-keyshortcuts="Enter"',
          ariaLabel: 'Skip intro',
          size: 'md',
        })}
      </div>
    </section>
  `);
  const splashSection = screenRoot.querySelector<HTMLElement>('.screen-splash');
  const video = screenRoot.querySelector<HTMLVideoElement>('.opening-video');
  const audioHint = screenRoot.querySelector<HTMLButtonElement>('.intro-audio-hint');
  const skipBtn = screenRoot.querySelector<HTMLButtonElement>('.intro-skip');
  let finished = false;
  let skipping = false;
  let fadeRaf = 0;
  let monitorRaf = 0;
  let menuCrossfaded = false;

  const removeGestureListeners = (): void => {
    document.removeEventListener('pointerdown', onUnlockGesture, true);
    document.removeEventListener('keydown', onUnlockKey, true);
  };

  const cleanup = (): void => {
    finished = true;
    window.clearTimeout(session.splashTimer);
    if (fadeRaf) {
      cancelAnimationFrame(fadeRaf);
      fadeRaf = 0;
    }
    if (monitorRaf) {
      cancelAnimationFrame(monitorRaf);
      monitorRaf = 0;
    }
    removeGestureListeners();
    if (video) {
      video.pause();
      video.muted = true;
      video.volume = 0;
    }
  };
  session.splashCleanup = cleanup;

  const syncVideoGain = (): void => {
    if (!video || skipping || finished) return;
    const gain = targetMusicGain();
    if (gain <= 0) {
      video.muted = true;
      video.volume = 0;
      if (audioHint) audioHint.hidden = true;
      return;
    }
    if (video.muted) {
      video.volume = 0;
      return;
    }
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const remaining = duration > 0 ? Math.max(0, duration - video.currentTime) : Infinity;
    const fadeWindow = session.save.options.reducedMotion ? 0.45 : 0.95;
    const ratio = remaining < fadeWindow ? Math.max(0, Math.min(1, remaining / fadeWindow)) : 1;
    video.volume = gain * ratio;
  };

  const attemptUnmuteFromGesture = (): void => {
    if (!video || finished || skipping) return;
    const gain = targetMusicGain();
    if (gain <= 0) return;
    video.muted = false;
    syncVideoGain();
    if (video.paused) {
      void video.play().catch(() => { /* Keep silent fallback if browser blocks */ });
    }
    if (audioHint) audioHint.hidden = true;
    removeGestureListeners();
  };

  function onUnlockGesture(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.intro-skip')) return;
    attemptUnmuteFromGesture();
  }

  function onUnlockKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'Tab') return;
    attemptUnmuteFromGesture();
  }

  const finishImmediate = (): void => {
    if (finished || session.currentScreen !== 'splash') return;
    session.splashCleanup = null;
    cleanup();
    if (!menuCrossfaded && session.save.options.music) {
      menuCrossfaded = true;
      startMusic(session.save.options.reducedMotion ? 350 : 1200);
    }
    routes.showMenu();
  };

  const beginSkipFade = (): void => {
    if (finished || skipping || session.currentScreen !== 'splash') return;
    skipping = true;
    window.clearTimeout(session.splashTimer);
    if (monitorRaf) {
      cancelAnimationFrame(monitorRaf);
      monitorRaf = 0;
    }
    removeGestureListeners();
    if (audioHint) audioHint.hidden = true;
    if (skipBtn) skipBtn.disabled = true;
    splashSection?.classList.add('is-fading');
    const durationMs = session.save.options.reducedMotion ? 140 : 340;
    if (session.save.options.music && !menuCrossfaded) {
      menuCrossfaded = true;
      // Play synchronously inside user gesture so autoplay unlock carries over cleanly.
      startMusic(session.save.options.reducedMotion ? 350 : 1200, Math.round(durationMs * 0.55));
    }
    const fromVol = video && !video.muted ? video.volume : 0;
    const startMs = performance.now();
    const step = (): void => {
      if (finished || session.currentScreen !== 'splash') return;
      const progress = Math.min(1, (performance.now() - startMs) / durationMs);
      if (video) {
        video.volume = Math.max(0, fromVol * (1 - progress));
      }
      if (progress >= 1) {
        fadeRaf = 0;
        finishImmediate();
        return;
      }
      fadeRaf = requestAnimationFrame(step);
    };
    fadeRaf = requestAnimationFrame(step);
  };

  const monitorPlayback = (): void => {
    if (finished || skipping || session.currentScreen !== 'splash' || !video) return;
    syncVideoGain();
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (duration > 0) {
      const remaining = Math.max(0, duration - video.currentTime);
      const visualFadeLead = session.save.options.reducedMotion ? 0.25 : 0.45;
      const crossfadeLead = session.save.options.reducedMotion ? 0.15 : 0.35;
      if (remaining <= visualFadeLead) {
        splashSection?.classList.add('is-fading');
      }
      if (remaining <= crossfadeLead && !menuCrossfaded) {
        menuCrossfaded = true;
        if (session.save.options.music) {
          startMusic(session.save.options.reducedMotion ? 350 : 1400);
        }
      }
    }
    monitorRaf = requestAnimationFrame(monitorPlayback);
  };

  if (video) {
    const startMonitor = (): void => {
      if (!monitorRaf && !finished && !skipping) {
        monitorRaf = requestAnimationFrame(monitorPlayback);
      }
    };
    const playVideo = (): void => {
      if (finished || skipping) return;
      const gain = targetMusicGain();
      video.muted = gain <= 0;
      video.volume = gain;
      void video.play().then(() => {
        startMonitor();
      }).catch(() => {
        if (finished || skipping) return;
        video.muted = true;
        video.volume = 0;
        if (gain > 0) {
          if (audioHint) audioHint.hidden = false;
          document.addEventListener('pointerdown', onUnlockGesture, true);
          document.addEventListener('keydown', onUnlockKey, true);
        }
        void video.play().then(() => {
          startMonitor();
        }).catch(() => {
          video.controls = true;
        });
      });
    };
    if (video.readyState >= 2) {
      playVideo();
    } else {
      video.addEventListener('loadeddata', () => {
        if (!finished && !skipping && video.paused) playVideo();
      }, { once: true });
    }
    video.addEventListener('timeupdate', syncVideoGain);
    video.addEventListener('ended', finishImmediate);
    video.addEventListener('error', finishImmediate);
  }

  audioHint?.addEventListener('click', attemptUnmuteFromGesture);
  skipBtn?.addEventListener('click', beginSkipFade);
  session.splashTimer = window.setTimeout(finishImmediate, 30000);
}
