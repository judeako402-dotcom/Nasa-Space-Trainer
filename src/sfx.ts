let context: AudioContext | null = null;
let enabled = true;
let masterVolume = 0.6;

export function configureSfx(next: { enabled: boolean; volume: number }): void {
  enabled = next.enabled;
  masterVolume = Math.max(0, Math.min(1, next.volume / 100));
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

export const sfx = {
  click(): void {
    tone({ frequency: 520, duration: 0.06, type: 'square', gain: 0.05 });
  },
  correct(): void {
    tone({ frequency: 660, duration: 0.1, type: 'triangle', gain: 0.11 });
    tone({ frequency: 880, duration: 0.14, type: 'triangle', gain: 0.1, delay: 0.09 });
    tone({ frequency: 1174, duration: 0.18, type: 'triangle', gain: 0.09, delay: 0.19 });
  },
  wrong(): void {
    tone({ frequency: 220, duration: 0.18, type: 'sawtooth', gain: 0.09 });
    tone({ frequency: 155, duration: 0.24, type: 'sawtooth', gain: 0.07, delay: 0.1 });
  },
  complete(): void {
    tone({ frequency: 740, duration: 0.08, type: 'sine', gain: 0.08 });
    tone({ frequency: 988, duration: 0.12, type: 'sine', gain: 0.08, delay: 0.07 });
  },
  launch(): void {
    noise(1.6, 0.12);
    tone({ frequency: 70, duration: 1.5, type: 'sawtooth', gain: 0.09, slideTo: 150 });
    tone({ frequency: 240, duration: 1.2, type: 'triangle', gain: 0.05, delay: 0.3, slideTo: 520 });
  },
  win(): void {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      tone({ frequency, duration: 0.24, type: 'triangle', gain: 0.1, delay: index * 0.13 });
    });
  },
  lose(): void {
    [440, 392, 330, 262].forEach((frequency, index) => {
      tone({ frequency, duration: 0.26, type: 'sawtooth', gain: 0.08, delay: index * 0.14 });
    });
  },
  alarm(): void {
    [0, 0.24].forEach((offset) => {
      tone({ frequency: 880, duration: 0.12, type: 'sawtooth', gain: 0.11, delay: offset, slideTo: 620 });
      tone({ frequency: 620, duration: 0.12, type: 'square', gain: 0.06, delay: offset + 0.1, slideTo: 480 });
    });
  },
  systemFailure(): void {
    noise(0.28, 0.14);
    tone({ frequency: 138, duration: 0.48, type: 'sawtooth', gain: 0.14, slideTo: 52 });
    tone({ frequency: 466, duration: 0.28, type: 'triangle', gain: 0.09, delay: 0.06, slideTo: 311 });
  },
  repair(): void {
    tone({ frequency: 330, duration: 0.09, type: 'triangle', gain: 0.1 });
    tone({ frequency: 494, duration: 0.1, type: 'triangle', gain: 0.1, delay: 0.08 });
    tone({ frequency: 740, duration: 0.18, type: 'sine', gain: 0.11, delay: 0.16 });
  },
  cardPick(): void {
    tone({ frequency: 640, duration: 0.045, type: 'triangle', gain: 0.07, slideTo: 920 });
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
    tone({ frequency: 760, duration: 0.08, type: 'square', gain: 0.06 });
    tone({ frequency: 760, duration: 0.08, type: 'square', gain: 0.06, delay: 0.12 });
  },
};
