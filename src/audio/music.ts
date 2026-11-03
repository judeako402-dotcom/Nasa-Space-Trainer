let element: HTMLAudioElement | null = null;
let enabled = true;
let volume = 0.55;
let started = false;

function ensureElement(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!element) {
    element = new Audio('/assets/audio/intro-theme.ogg');
    element.loop = true;
    element.preload = 'auto';
    element.volume = 0;
  }
  return element;
}

export function configureMusic(next: { enabled: boolean; volume: number }): void {
  enabled = next.enabled;
  volume = Math.max(0, Math.min(1, next.volume / 100));
  if (!element) return;
  if (!enabled) {
    element.pause();
    return;
  }
  if (started) void fadeTo(volume, 800);
}

export function startMusic(): void {
  if (!enabled) return;
  const audio = ensureElement();
  if (!audio) return;
  started = true;
  audio.volume = 0;
  void audio.play().then(() => fadeTo(volume, 1400)).catch(() => {
    /* Autoplay blocked: the first pointer gesture retries. */
  });
}

export function stopMusic(fadeMs = 900): void {
  const audio = element;
  if (!audio) return;
  started = false;
  void fadeTo(0, fadeMs).then(() => audio.pause());
}

export function duckMusic(ducked: boolean): void {
  if (!started) return;
  void fadeTo(ducked ? volume * 0.28 : volume, 500);
}

function fadeTo(target: number, duration: number): Promise<void> {
  const audio = element;
  if (!audio) return Promise.resolve();
  return new Promise(resolve => {
    const from = audio.volume;
    const start = performance.now();
    const tick = (): void => {
      const progress = Math.min(1, (performance.now() - start) / Math.max(1, duration));
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * progress));
      if (progress >= 1) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function musicState(): { started: boolean; enabled: boolean } {
  return { started, enabled };
}
