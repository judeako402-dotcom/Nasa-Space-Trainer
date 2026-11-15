let element: HTMLAudioElement | null = null;
let enabled = true;
let volume = 0.55;
let started = false;
let fadeRaf = 0;
let fadeToken = 0;

type OstMode = 'ambient' | 'alert';
let ostCtx: AudioContext | null = null;
let ostMaster: GainNode | null = null;
let ostTimer = 0;
let ostMode: OstMode | null = null;
let ostStep = 0;
let ostDucked = false;

const AMBIENT_CHORDS = [
  [220, 277.18, 329.63, 440],
  [196, 246.94, 293.66, 392],
  [174.61, 220, 261.63, 349.23],
  [196, 246.94, 329.63, 392],
];

const ALERT_NOTES = [110, 116.54, 110, 146.83, 110, 116.54, 130.81, 103.83];

function syncOstGain(): void {
  if (!ostCtx || !ostMaster) return;
  const target = enabled && ostMode ? volume * (ostDucked ? 0.28 : 1) * 0.38 : 0;
  ostMaster.gain.setTargetAtTime(Math.max(0, target), ostCtx.currentTime, 0.14);
}

function scheduleOstStep(): void {
  if (!enabled || !ostMode || !ostCtx || !ostMaster) return;
  if (ostCtx.state === 'suspended') void ostCtx.resume();
  const now = ostCtx.currentTime;
  if (ostMode === 'alert') {
    const freq = ALERT_NOTES[ostStep % ALERT_NOTES.length];
    const osc = ostCtx.createOscillator();
    const filter = ostCtx.createBiquadFilter();
    const gain = ostCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(540, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ostMaster);
    osc.start(now);
    osc.stop(now + 0.39);
    if (ostStep % 4 === 0) {
      const ping = ostCtx.createOscillator();
      const pingGain = ostCtx.createGain();
      ping.type = 'triangle';
      ping.frequency.setValueAtTime(659.25, now);
      pingGain.gain.setValueAtTime(0.0001, now);
      pingGain.gain.linearRampToValueAtTime(0.11, now + 0.02);
      pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      ping.connect(pingGain);
      pingGain.connect(ostMaster);
      ping.start(now);
      ping.stop(now + 0.28);
    }
  } else {
    const chord = AMBIENT_CHORDS[Math.floor(ostStep / 4) % AMBIENT_CHORDS.length];
    const note = chord[ostStep % chord.length];
    const osc = ostCtx.createOscillator();
    const filter = ostCtx.createBiquadFilter();
    const gain = ostCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(920, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ostMaster);
    osc.start(now);
    osc.stop(now + 1.2);
    if (ostStep % 4 === 0) {
      const bass = ostCtx.createOscillator();
      const bassGain = ostCtx.createGain();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(chord[0] * 0.5, now);
      bassGain.gain.setValueAtTime(0.0001, now);
      bassGain.gain.linearRampToValueAtTime(0.24, now + 0.28);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
      bass.connect(bassGain);
      bassGain.connect(ostMaster);
      bass.start(now);
      bass.stop(now + 2.45);
    }
  }
  ostStep += 1;
}

export function startGameplayOst(mode: OstMode = 'ambient'): void {
  if (!enabled || typeof window === 'undefined' || !window.AudioContext) return;
  if (ostMode === mode && ostTimer) return;
  try {
    if (!ostCtx) {
      ostCtx = new window.AudioContext();
      ostMaster = ostCtx.createGain();
      ostMaster.gain.value = 0;
      ostMaster.connect(ostCtx.destination);
    }
    if (ostCtx.state === 'suspended') void ostCtx.resume();
  } catch {
    return;
  }
  if (ostTimer) {
    window.clearInterval(ostTimer);
    ostTimer = 0;
  }
  ostMode = mode;
  ostStep = 0;
  syncOstGain();
  scheduleOstStep();
  ostTimer = window.setInterval(scheduleOstStep, mode === 'alert' ? 420 : 820);
}

export function stopGameplayOst(): void {
  ostMode = null;
  if (ostTimer) {
    window.clearInterval(ostTimer);
    ostTimer = 0;
  }
  syncOstGain();
}

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
  if (!enabled) stopGameplayOst();
  else syncOstGain();
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
  stopGameplayOst();
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
  stopGameplayOst();
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
  ostDucked = ducked;
  syncOstGain();
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
