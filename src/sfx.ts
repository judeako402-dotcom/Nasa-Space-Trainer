let context: AudioContext | null = null;
let enabled = true;
let masterVolume = 0.6;

const SOUND_FILES = {
  buttonClick: '/assets/audio/sfx/button-click.wav',
  footsteps: '/assets/audio/sfx/footsteps.wav',
  footstepsAlt: '/assets/audio/sfx/footsteps-2.wav',
  flipSwitch: '/assets/audio/sfx/flipping-switch.wav',
  taskComplete: '/assets/audio/sfx/task-completion.wav',
  itemGet: '/assets/audio/sfx/item-get.wav',
  itemSelection: '/assets/audio/sfx/item-selection.wav',
  eventBuzzer: '/assets/audio/sfx/event-buzzer.wav',
  questComplete: '/assets/audio/sfx/quest-complete.wav',
  failureEvent: '/assets/audio/sfx/failure-event.wav',
  grunt: '/assets/audio/sfx/grunting-noise.wav',
  machinery: '/assets/audio/sfx/distant-machinery-humms.wav',
  taskInteraction: '/assets/audio/sfx/task-interaction.wav',
  stomach: '/assets/audio/sfx/stomach-rumbling.wav',
} as const;

type SoundId = keyof typeof SOUND_FILES;
const soundVoices = new Map<SoundId, HTMLAudioElement[]>();
const activeSounds = new Set<HTMLAudioElement>();
const activeGains = new Map<HTMLAudioElement, number>();
const footsteps: (HTMLAudioElement | null)[] = [null, null];
let ambientAudio: HTMLAudioElement | null = null;
let ambientRequested = false;
let walking = false;
let footstepVariant = -1;

export function configureSfx(next: { enabled: boolean; volume: number }): void {
  enabled = next.enabled;
  masterVolume = Math.max(0, Math.min(1, next.volume / 100));
  if (!enabled || masterVolume <= 0) {
    for (const audio of activeSounds) {
      audio.pause();
      audio.currentTime = 0;
    }
    activeSounds.clear();
    activeGains.clear();
    walking = false;
    footsteps.forEach(audio => audio?.pause());
    ambientAudio?.pause();
    return;
  }
  for (const [audio, gain] of activeGains) audio.volume = masterVolume * gain;
  syncAmbient();
  if (walking) startFootsteps();
}

function createAudio(path: string): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  const audio = new Audio(path);
  audio.preload = 'auto';
  return audio;
}

function createVoice(id: SoundId): HTMLAudioElement | null {
  const audio = createAudio(SOUND_FILES[id]);
  if (!audio) return null;
  audio.addEventListener('ended', () => {
    activeSounds.delete(audio);
    activeGains.delete(audio);
  });
  return audio;
}

function playAsset(id: SoundId, gain = 0.16): boolean {
  if (!enabled || masterVolume <= 0) return false;
  try {
    const pool = soundVoices.get(id) ?? [];
    soundVoices.set(id, pool);
    let audio = pool.find(voice => voice.paused || voice.ended);
    if (!audio && pool.length < 3) {
      audio = createVoice(id) ?? undefined;
      if (audio) pool.push(audio);
    }
    if (!audio) {
      audio = pool.reduce((earliest, voice) => voice.currentTime < earliest.currentTime ? voice : earliest);
    }
    audio.currentTime = 0;
    audio.volume = masterVolume * gain;
    activeSounds.add(audio);
    activeGains.set(audio, gain);
    void audio.play().catch(() => {
      activeSounds.delete(audio);
      activeGains.delete(audio);
    });
    return true;
  } catch {
    return false;
  }
}

function getContext(): AudioContext | null {
  if (!enabled || masterVolume <= 0) return null;
  try {
    if (!context) {
      const AudioCtor = window.AudioContext;
      if (!AudioCtor) return null;
      context = new AudioCtor();
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

interface ToneOptions {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  slideTo?: number;
}

function tone({ frequency, duration, type = 'sine', gain = 0.12, delay = 0, slideTo }: ToneOptions): void {
  const audio = getContext();
  if (!audio) return;
  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const amp = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain * masterVolume, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(amp);
  amp.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function noise(duration: number, gain = 0.08): void {
  const audio = getContext();
  if (!audio) return;
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
  }
  const source = audio.createBufferSource();
  const amp = audio.createGain();
  amp.gain.value = gain * masterVolume;
  source.buffer = buffer;
  source.connect(amp);
  amp.connect(audio.destination);
  source.start();
}

function syncAmbient(): void {
  if (!ambientRequested || !enabled || masterVolume <= 0) {
    ambientAudio?.pause();
    return;
  }
  try {
    ambientAudio ??= createAudio(SOUND_FILES.machinery);
    if (!ambientAudio) return;
    ambientAudio.loop = true;
    ambientAudio.volume = masterVolume * 0.045;
    if (ambientAudio.paused) void ambientAudio.play().catch(() => {});
  } catch {
    ambientAudio = null;
  }
}

export function setAmbient(active: boolean): void {
  ambientRequested = active;
  syncAmbient();
}

function startFootsteps(): void {
  if (!enabled || masterVolume <= 0) return;
  try {
    footstepVariant = (footstepVariant + 1) % footsteps.length;
    const audio = footsteps[footstepVariant] ?? createAudio(
      SOUND_FILES[footstepVariant === 0 ? 'footsteps' : 'footstepsAlt'],
    );
    if (!audio) return;
    footsteps[footstepVariant] = audio;
    footsteps.forEach((voice, index) => {
      if (index !== footstepVariant) voice?.pause();
    });
    audio.loop = true;
    audio.currentTime = 0;
    audio.volume = masterVolume * 0.12;
    void audio.play().catch(() => {});
  } catch {
    footsteps[footstepVariant]?.pause();
  }
}

export function setWalking(active: boolean): void {
  if (walking === active) return;
  walking = active;
  if (active) startFootsteps();
  else footsteps.forEach(audio => audio?.pause());
}

export const sfx = {
  click(): void {
    if (!playAsset('buttonClick', 0.12)) tone({ frequency: 520, duration: 0.06, type: 'square', gain: 0.05 });
  },
  correct(): void {
    if (!playAsset('itemGet', 0.16)) {
      tone({ frequency: 660, duration: 0.1, type: 'triangle', gain: 0.11 });
      tone({ frequency: 880, duration: 0.14, type: 'triangle', gain: 0.1, delay: 0.09 });
      tone({ frequency: 1174, duration: 0.18, type: 'triangle', gain: 0.09, delay: 0.19 });
    }
  },
  wrong(): void {
    if (!playAsset('failureEvent', 0.12)) {
      tone({ frequency: 220, duration: 0.18, type: 'sawtooth', gain: 0.09 });
      tone({ frequency: 155, duration: 0.24, type: 'sawtooth', gain: 0.07, delay: 0.1 });
    }
  },
  complete(): void {
    if (!playAsset('taskComplete', 0.16)) {
      tone({ frequency: 740, duration: 0.08, type: 'sine', gain: 0.08 });
      tone({ frequency: 988, duration: 0.12, type: 'sine', gain: 0.08, delay: 0.07 });
    }
  },
  launch(): void {
    noise(1.6, 0.12);
    tone({ frequency: 70, duration: 1.5, type: 'sawtooth', gain: 0.09, slideTo: 150 });
    tone({ frequency: 240, duration: 1.2, type: 'triangle', gain: 0.05, delay: 0.3, slideTo: 520 });
  },
  win(): void {
    if (!playAsset('questComplete', 0.18)) {
      [523, 659, 784, 1047].forEach((frequency, index) => {
        tone({ frequency, duration: 0.24, type: 'triangle', gain: 0.1, delay: index * 0.13 });
      });
    }
  },
  lose(): void {
    if (!playAsset('failureEvent', 0.14)) {
      [440, 392, 330, 262].forEach((frequency, index) => {
        tone({ frequency, duration: 0.26, type: 'sawtooth', gain: 0.08, delay: index * 0.14 });
      });
    }
  },
  alarm(): void {
    if (!playAsset('eventBuzzer', 0.14)) {
      [0, 0.24].forEach((offset) => {
        tone({ frequency: 880, duration: 0.12, type: 'sawtooth', gain: 0.11, delay: offset, slideTo: 620 });
        tone({ frequency: 620, duration: 0.12, type: 'square', gain: 0.06, delay: offset + 0.1, slideTo: 480 });
      });
    }
  },
  systemFailure(): void {
    if (!playAsset('failureEvent', 0.18)) {
      noise(0.28, 0.14);
      tone({ frequency: 138, duration: 0.48, type: 'sawtooth', gain: 0.14, slideTo: 52 });
      tone({ frequency: 466, duration: 0.28, type: 'triangle', gain: 0.09, delay: 0.06, slideTo: 311 });
    }
  },
  repair(): void {
    if (!playAsset('taskComplete', 0.16)) {
      tone({ frequency: 330, duration: 0.09, type: 'triangle', gain: 0.1 });
      tone({ frequency: 494, duration: 0.1, type: 'triangle', gain: 0.1, delay: 0.08 });
      tone({ frequency: 740, duration: 0.18, type: 'sine', gain: 0.11, delay: 0.16 });
    }
  },
  cardPick(): void {
    if (!playAsset('itemSelection', 0.14)) {
      tone({ frequency: 640, duration: 0.045, type: 'triangle', gain: 0.07, slideTo: 920 });
    }
  },
  flipSwitch(): void {
    playAsset('flipSwitch', 0.16);
  },
  taskInteraction(): void {
    playAsset('taskInteraction', 0.14);
  },
  grunt(): void {
    playAsset('grunt', 0.1);
  },
  stomachRumble(): void {
    playAsset('stomach', 0.1);
  },
  modalOpen(): void {
    tone({ frequency: 460, duration: 0.065, type: 'sine', gain: 0.06, slideTo: 660 });
  },
  modalClose(): void {
    tone({ frequency: 520, duration: 0.06, type: 'sine', gain: 0.05, slideTo: 340 });
  },
  skipDay(): void {
    [523, 392, 294].forEach((frequency, index) => {
      tone({ frequency, duration: 0.18, type: 'sine', gain: 0.08, delay: index * 0.1 });
    });
  },
  warning(): void {
    if (!playAsset('eventBuzzer', 0.12)) {
      tone({ frequency: 760, duration: 0.08, type: 'square', gain: 0.06 });
      tone({ frequency: 760, duration: 0.08, type: 'square', gain: 0.06, delay: 0.12 });
    }
  },
};
