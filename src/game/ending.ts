import { sfx } from '../sfx';
import { renderConstellationAction } from '../ui/icons';

interface HomecomingOptions {
  soundEnabled?: boolean;
  soundVolume?: number;
  onArrival?: () => void;
}

export function playHomecoming(
  host: HTMLElement,
  reducedMotion: boolean,
  onComplete: () => void,
  options: HomecomingOptions = {},
): void {
  host.innerHTML = `
    <section class="spud-canvas-overlay homecoming ${reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="homecoming-title">
      <div class="homecoming-sky" aria-hidden="true">
        <img class="homecoming-moon" src="/assets/ui/spudnaut/design/moon.webp" alt="">
        <img class="homecoming-earth" src="/assets/placeholders/kenney/planets/planet00.png" alt="">
        <img class="homecoming-rocket" src="/assets/placeholders/kenney/simple-space/ship_A.png" alt="">
      </div>
      <video class="homecoming-video" playsinline preload="auto" aria-hidden="true" tabindex="-1">
        <source src="/assets/ui/spudnaut/ending/homecoming.mp4" type="video/mp4">
      </video>
      <h2 id="homecoming-title" aria-live="polite">Heading back to Earth!</h2>
      <div class="homecoming-medal" role="status" hidden><span aria-hidden="true">🏅</span> Golden Potato Medal</div>
      ${renderConstellationAction({ icon: 'skip', label: 'SKIP FLIGHT', attrs: 'data-skip-homecoming' })}
    </section>`;

  const title = host.querySelector<HTMLElement>('#homecoming-title')!;
  const medal = host.querySelector<HTMLElement>('.homecoming-medal')!;
  const video = host.querySelector<HTMLVideoElement>('.homecoming-video')!;
  const skip = host.querySelector<HTMLButtonElement>('[data-skip-homecoming]')!;
  let finished = false;
  let awarded = false;
  let fallbackStarted = false;
  let awardTimer = 0;
  let endTimer = 0;
  let watchdogTimer = 0;

  const award = (): void => {
    if (awarded) return;
    awarded = true;
    title.textContent = 'Welcome home, Spudnaut!';
    medal.hidden = false;
    options.onArrival?.();
  };
  const finish = (): void => {
    if (finished) return;
    finished = true;
    window.clearTimeout(awardTimer);
    window.clearTimeout(endTimer);
    window.clearTimeout(watchdogTimer);
    video.pause();
    award();
    onComplete();
  };
  const useFallback = (): void => {
    if (finished || fallbackStarted) return;
    fallbackStarted = true;
    window.clearTimeout(watchdogTimer);
    video.pause();
    video.hidden = true;
    awardTimer = window.setTimeout(award, 3000);
    endTimer = window.setTimeout(finish, 5100);
  };

  skip.addEventListener('click', () => {
    sfx.click();
    finish();
  }, { once: true });
  skip.focus();

  if (reducedMotion) {
    video.hidden = true;
    award();
    endTimer = window.setTimeout(finish, 1600);
    return;
  }

  const soundVolume = Math.max(0, Math.min(1, options.soundVolume ?? 0));
  video.muted = !options.soundEnabled || soundVolume === 0;
  video.volume = soundVolume;
  watchdogTimer = window.setTimeout(useFallback, 15_000);
  video.addEventListener('error', useFallback, { once: true });
  video.addEventListener('ended', () => {
    if (fallbackStarted || finished) return;
    window.clearTimeout(watchdogTimer);
    award();
    endTimer = window.setTimeout(finish, 2200);
  }, { once: true });

  try {
    const playback = video.play();
    void playback.catch(() => {
      if (!video.muted) {
        video.muted = true;
        try {
          void video.play().catch(useFallback);
        } catch {
          useFallback();
        }
      } else {
        useFallback();
      }
    });
  } catch {
    useFallback();
  }
}
