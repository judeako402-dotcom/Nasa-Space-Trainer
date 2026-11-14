let element: HTMLAudioElement | null = null;
let enabled = true;
let volume = 0.55;
let started = false;
let fadeRaf = 0;
let fadeToken = 0;

function cancelActiveFade(): void {
  fadeToken += 1;
  if (fadeRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(fadeRaf);
    fadeRaf = 0;
  }
}

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
    cancelActiveFade();
    element.volume = 0;
    element.pause();
    return;
  }
  if (started) {
    if (element.paused) {
      void element.play().then(() => fadeTo(volume, 800)).catch(() => { /* Autoplay blocked */ });
    } else {
      void fadeTo(volume, 800);
    }
  }
}

export function startMusic(fadeMs = 1400, delayMs = 0): void {
  if (!enabled) return;
  const audio = ensureElement();
  if (!audio) return;
  const alreadyPlaying = started && !audio.paused;
  started = true;
  if (alreadyPlaying) {
    void fadeTo(volume, fadeMs, undefined, delayMs);
    return;
  }
  cancelActiveFade();
  audio.volume = 0;
  void audio.play().then(() => {
    if (started && enabled) return fadeTo(volume, fadeMs, undefined, delayMs);
    return undefined;
  }).catch(() => {
    started = false;
    /* Autoplay blocked: the first pointer gesture retries. */
  });
}

export function stopMusic(fadeMs = 900): void {
  const audio = element;
  if (!audio) {
    started = false;
    cancelActiveFade();
    return;
  }
  started = false;
  if (fadeMs <= 0) {
    cancelActiveFade();
    audio.volume = 0;
    audio.pause();
    return;
  }
  const stopToken = fadeToken + 1;
  void fadeTo(0, fadeMs, stopToken).then((completed) => {
    if (completed && !started) audio.pause();
  });
}

export function duckMusic(ducked: boolean): void {
  if (!started || !enabled) return;
  void fadeTo(ducked ? volume * 0.28 : volume, 500);
}

function fadeTo(target: number, duration: number, forcedToken?: number, delayMs = 0): Promise<boolean> {
  const audio = element;
  cancelActiveFade();
  const token = forcedToken ?? fadeToken;
  fadeToken = token;
  const clampedTarget = Math.max(0, Math.min(1, target));
  if (!audio || (duration <= 0 && delayMs <= 0) || typeof requestAnimationFrame !== 'function') {
    if (audio) audio.volume = clampedTarget;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const from = audio.volume;
    const start = performance.now();
    const tick = (): void => {
      if (token !== fadeToken) {
        resolve(false);
        return;
      }
      const elapsed = performance.now() - start;
      if (elapsed < delayMs) {
        audio.volume = from;
        fadeRaf = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(1, (elapsed - delayMs) / Math.max(1, duration));
      audio.volume = Math.max(0, Math.min(1, from + (clampedTarget - from) * progress));
      if (progress >= 1) {
        fadeRaf = 0;
        resolve(true);
      } else {
        fadeRaf = requestAnimationFrame(tick);
      }
    };
    fadeRaf = requestAnimationFrame(tick);
  });
}

export function musicState(): { started: boolean; enabled: boolean; volume: number; paused: boolean } {
  return { started, enabled, volume, paused: element?.paused ?? true };
}
