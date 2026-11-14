import { shuffle, type TaskKind } from '../model';
import { sfx } from '../sfx';

type AssignmentGame = 'rainbow' | 'harvest' | 'scrub' | 'pipes' | 'solar' | 'crystals' | 'signal';

const INSTRUCTIONS: Record<AssignmentGame | 'wiring', string> = {
  rainbow: 'Slide each colored light until it reaches its mark. Match all three to wake the sprouts!',
  harvest: 'Tap the golden potatoes to toss them into the crate. Leave the weeds alone!',
  scrub: 'Swipe over the dust to wipe it away. Tap the bubbles to pop them.',
  pipes: 'Tap each bent pipe to turn it. Match the little arrow, then latch it shut.',
  solar: 'Slide the mirror to aim at each sunbeam. Catch beams until the battery is full!',
  crystals: 'Sweep the scanner over the rocks to find all the hidden crystals. You can tap rocks too.',
  signal: 'Watch the four flashes, then tap the dishes in that order. The pattern plays again if you miss.',
  wiring: 'Tap a wire on the left, then tap the matching color on the right.',
};

export function assignmentGameTip(kind: TaskKind): string | undefined {
  return Object.hasOwn(INSTRUCTIONS, kind) ? INSTRUCTIONS[kind as keyof typeof INSTRUCTIONS] : undefined;
}

const ROUND_SIZE = 9;

export function mountAssignmentGame(
  kind: TaskKind, host: HTMLElement, complete: () => void, cleanups: (() => void)[],
): boolean {
  if (kind === 'wiring' || !assignmentGameTip(kind)) return false;
  host.classList.add('assignment-game');
  const controls = document.createElement('div');
  const status = document.createElement('p');
  status.className = 'assignment-game-status';
  status.setAttribute('role', 'status');
  host.append(controls, status);

  const button = (label: string, action: () => void, parent: HTMLElement = controls): HTMLButtonElement => {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'assignment-control';
    control.textContent = label;
    control.addEventListener('click', action);
    parent.append(control);
    return control;
  };
  const progress = (text: string): void => {
    status.textContent = text;
    sfx.click();
  };

  if (kind === 'rainbow' || kind === 'solar') {
    const rainbow = kind === 'rainbow';
    const targets = rainbow ? shuffle([25, 50, 75]) : shuffle([10, 25, 40, 60, 75, 90]);
    const tones = ['#ff8e94', '#ffd36a', '#86efac'];
    let aligned = 0;
    controls.className = 'assignment-sliders';
    const done = (message: string): void => {
      aligned += 1;
      progress(message);
      if (aligned === targets.length) complete();
    };
    const makeSlider = (target: number, label: string, tone: string): void => {
      const row = document.createElement('label');
      row.className = 'assignment-slider';
      row.style.setProperty('--target', `${target}%`);
      row.style.setProperty('--beam', tone);
      row.innerHTML = `<span>${label}</span><span class="assignment-aim"><i aria-hidden="true"></i>
        <input type="range" min="0" max="100" step="5" value="0" /></span>`;
      const slider = row.querySelector('input')!;
      const value = document.createElement('output');
      value.textContent = `Aim for ${target}%`;
      row.append(value);
      controls.append(row);
      slider.addEventListener('input', () => { value.textContent = `${slider.value}% / ${target}%`; });
      slider.addEventListener('change', () => {
        if (Math.abs(Number(slider.value) - target) > 5) return;
        if (rainbow) {
          slider.disabled = true;
          value.textContent = '🌱 Sprout!';
          done(`${aligned + 1} of 3 sprouts awake!`);
        } else {
          row.remove();
          const charge = Math.round(100 * (aligned + 1) / targets.length);
          done(`⚡ Battery ${charge}%`);
          if (aligned < targets.length) {
            makeSlider(targets[aligned]!, 'Solar mirror', tones[1]!);
            controls.querySelector('input')?.focus();
          }
        }
      });
    };
    if (rainbow) {
      const colors = ['Red light', 'Gold light', 'Green light'];
      targets.forEach((target, index) => makeSlider(target, colors[index]!, tones[index]!));
    } else {
      status.textContent = '⚡ Battery 0%';
      makeSlider(targets[0]!, 'Solar mirror', tones[1]!);
    }
    return true;
  }

  if (kind === 'pipes') {
    controls.className = 'assignment-grid pipes-grid';
    let latched = 0;
    const arrows = ['↑', '→', '↓', '←'];
    const directions = ['up', 'right', 'down', 'left'];
    shuffle([0, 1, 2, 3, 1, 2]).forEach((target, index) => {
      const cell = document.createElement('div');
      let turn = (target + 1 + index % 2) % 4;
      const latch = button('Latch', () => {
        turner.disabled = latch.disabled = true;
        cell.classList.add('is-done');
        latched += 1;
        progress(`${latched} of 6 pipes sealed`);
        if (latched === 6) complete();
      }, cell);
      const update = (): void => {
        turner.textContent = `┗ ${arrows[turn]} · ${arrows[target]}`;
        turner.setAttribute('aria-label', `Pipe ${index + 1} points ${directions[turn]}. Match ${directions[target]}.`);
        latch.disabled = turn !== target;
      };
      const turner = button('', () => {
        turn = (turn + 1) % 4;
        update();
      }, cell);
      cell.prepend(turner);
      update();
      controls.append(cell);
    });
    return true;
  }

  if (kind === 'signal') {
    controls.className = 'assignment-grid signal-grid';
    const sequence = shuffle([0, 1, 2, 3]);
    let step = 0;
    let playbackTimer = 0;
    let playing = true;
    let cue = 0;
    const pads = ['☀ Sun', '☾ Moon', '★ Star', '◆ Comet'].map((label, index) => button(label, () => {
      if (playing) return;
      if (sequence[step] !== index) {
        play('Close! Watch the flashes again.');
        return;
      }
      step += 1;
      progress(`${step} of ${sequence.length} signals sent`);
      if (step === sequence.length) complete();
    }));
    const play = (message: string): void => {
      window.clearTimeout(playbackTimer);
      pads.forEach(pad => pad.classList.remove('is-flashing'));
      step = 0;
      cue = 0;
      playing = true;
      status.textContent = message;
      flash();
    };
    const flash = (): void => {
      if (cue === sequence.length) {
        playing = false;
        progress('Your turn! Tap the same four dishes.');
        return;
      }
      const pad = pads[sequence[cue]!]!;
      pad.classList.add('is-flashing');
      status.textContent = `Watch ${cue + 1}: ${pad.textContent}`;
      playbackTimer = window.setTimeout(() => {
        pad.classList.remove('is-flashing');
        cue += 1;
        playbackTimer = window.setTimeout(flash, 230);
      }, 650);
    };
    const watch = button('Watch pattern', () => play('Watch the dishes light up!'), host);
    watch.classList.add('assignment-watch');
    cleanups.push(() => window.clearTimeout(playbackTimer));
    status.textContent = 'Ready? Tap Watch pattern.';
    return true;
  }

  controls.className = 'assignment-grid';
  const rocks = kind === 'crystals';
  const scrub = kind === 'scrub';
  const selected = shuffle(Array.from({ length: ROUND_SIZE }, (_, index) => index));
  const goal = rocks ? 4 : scrub ? ROUND_SIZE : 6;
  let found = 0;
  for (let index = 0; index < ROUND_SIZE; index += 1) {
    const good = scrub || selected.indexOf(index) < goal;
    const bubble = scrub && index % 3 === 2;
    const label = rocks ? '🪨' : scrub ? (bubble ? '🫧' : '🌫') : good ? '🥔' : '🌿';
    const collect = (): void => {
      if (tile.disabled) return;
      if (!good && !rocks) {
        progress('That’s a weed. Pick a golden potato!');
        return;
      }
      tile.disabled = true;
      tile.classList.add('is-done');
      tile.textContent = rocks ? (good ? '💎' : '·') : '✓';
      if (good) found += 1;
      progress(`${found} of ${goal} ${rocks ? 'crystals found' : scrub ? 'spots clean' : 'potatoes in the crate 📦'}`);
      if (found === goal) complete();
    };
    const tile = button(label, collect);
    tile.setAttribute('aria-label', rocks ? `Scan rock ${index + 1}` : scrub
      ? `${bubble ? 'Pop bubble' : 'Wipe dust'} ${index + 1}` : good ? 'Pick golden potato' : 'Weed');
    if (rocks || (scrub && !bubble)) {
      tile.addEventListener('pointerenter', event => { if (event.buttons === 1) collect(); });
    }
  }
  controls.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch' || (!rocks && !scrub)) return;
    const tile = document.elementFromPoint(event.clientX, event.clientY);
    if (tile instanceof HTMLButtonElement && controls.contains(tile)
      && (rocks || tile.getAttribute('aria-label')?.startsWith('Wipe'))) tile.click();
  });
  controls.classList.toggle('can-sweep', rocks || scrub);
  status.textContent = rocks ? 'Look for four crystals.' : scrub ? 'Make the filter shine!' : 'Fill the crate with six potatoes.';
  return true;
}
