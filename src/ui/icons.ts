import type { MissionMetrics, PlayerColorId, SpecialistId } from '../model';
import { escapeHtml } from '../app/session';
import { getCharacterSpritePreview } from '../game/assets/characterSprites';

export type ConstellationIconId =
  | 'play'
  | 'training'
  | 'options'
  | 'back'
  | 'masterVolume'
  | 'musicVolume'
  | 'sfxVolume'
  | 'reset'
  | 'abort'
  | 'map'
  | 'tasks'
  | 'log'
  | 'help'
  | 'close'
  | 'skip'
  | 'randomize'
  | 'vision'
  | 'cert'
  | 'launch'
  | 'forward'
  | 'fps';

export type FigmaHudIconId =
  | 'tasks' | 'status' | 'settings' | 'map' | 'use'
  | 'menu-resume' | 'menu-play' | 'menu-settings'
  | 'confirm-keep' | 'confirm-launch'
  | 'back' | 'vol-master' | 'vol-music' | 'vol-sfx' | 'fps' | 'reset'
  | 'loadout-class' | 'loadout-color' | 'loadout-difficulty' | 'loadout-next'
  | 'habitat-science' | 'check-target' | 'check-gravity' | 'check-hazard'
  | 'check-duration' | 'check-systems' | 'check-mode'
  | 'location-pin' | 'telemetry-live';

export const METRIC_LABELS: Record<keyof MissionMetrics, string> = {
  life: 'Life',
  power: 'Power',
  research: 'Research',
  farm: 'Farm',
};

export const SPECIALIST_STATS: Record<SpecialistId, { label: string; value: number }[]> = {
  repairman: [
    { label: 'LIFE', value: 84 },
    { label: 'POWER', value: 96 },
    { label: 'RESEARCH', value: 68 },
    { label: 'FARM', value: 62 },
  ],
  farmer: [
    { label: 'LIFE', value: 78 },
    { label: 'POWER', value: 66 },
    { label: 'RESEARCH', value: 74 },
    { label: 'FARM', value: 96 },
  ],
  researcher: [
    { label: 'LIFE', value: 70 },
    { label: 'POWER', value: 72 },
    { label: 'RESEARCH', value: 98 },
    { label: 'FARM', value: 82 },
  ],
};

const CONSTELLATION_ICON_MARKUP: Record<ConstellationIconId, string> = {
  fps: '<circle cx="18" cy="18" r="10" fill="none" /><line x1="18" y1="18" x2="25" y2="12" /><line x1="8" y1="18" x2="11" y2="18" /><line x1="18" y1="8" x2="18" y2="11" /><line x1="25" y1="18" x2="28" y2="18" /><circle cx="18" cy="18" r="2.3" /><circle cx="25" cy="12" r="2.0" /><circle cx="18" cy="8" r="1.7" />',
  play: '<line x1="8" y1="10" x2="26" y2="16" /><line x1="26" y1="16" x2="14" y2="27" /><line x1="14" y1="27" x2="8" y2="10" /><circle cx="8" cy="10" r="2.5" /><circle cx="26" cy="16" r="3" /><circle cx="14" cy="27" r="2.2" />',
  training: '<line x1="9" y1="9" x2="27" y2="27" /><line x1="27" y1="9" x2="9" y2="27" /><circle cx="9" cy="9" r="2.2" /><circle cx="27" cy="27" r="2.2" /><circle cx="27" cy="9" r="2.2" /><circle cx="9" cy="27" r="2.2" /><circle cx="18" cy="18" r="2.6" />',
  options: '<circle cx="18" cy="18" r="5" fill="none" /><line x1="18" y1="5" x2="18" y2="10" /><line x1="18" y1="26" x2="18" y2="31" /><line x1="5" y1="18" x2="10" y2="18" /><line x1="26" y1="18" x2="31" y2="18" />',
  back: '<line x1="21" y1="8" x2="9" y2="18" /><line x1="9" y1="18" x2="21" y2="28" /><line x1="9" y1="18" x2="27" y2="18" /><circle cx="21" cy="8" r="2.2" /><circle cx="9" cy="18" r="2.8" /><circle cx="21" cy="28" r="2.2" /><circle cx="27" cy="18" r="2.1" />',
  masterVolume: '<line x1="7" y1="14" x2="12" y2="14" /><line x1="12" y1="14" x2="19" y2="8" /><line x1="19" y1="8" x2="19" y2="28" /><line x1="19" y1="28" x2="12" y2="22" /><line x1="12" y1="22" x2="7" y2="22" /><line x1="7" y1="22" x2="7" y2="14" /><line x1="24" y1="12" x2="28" y2="18" /><line x1="28" y1="18" x2="24" y2="24" /><circle cx="7" cy="14" r="1.9" /><circle cx="19" cy="8" r="2.3" /><circle cx="19" cy="28" r="2.3" /><circle cx="7" cy="22" r="1.9" /><circle cx="24" cy="12" r="2.0" /><circle cx="28" cy="18" r="2.5" /><circle cx="24" cy="24" r="2.0" />',
  musicVolume: '<line x1="13" y1="10" x2="27" y2="7" /><line x1="13" y1="10" x2="13" y2="25" /><line x1="27" y1="7" x2="27" y2="22" /><circle cx="13" cy="10" r="2.0" /><circle cx="27" cy="7" r="2.0" /><circle cx="11.5" cy="25" r="3.0" /><circle cx="25.5" cy="22" r="3.0" />',
  sfxVolume: '<line x1="5" y1="18" x2="10" y2="18" /><line x1="10" y1="18" x2="15" y2="8" /><line x1="15" y1="8" x2="21" y2="28" /><line x1="21" y1="28" x2="26" y2="12" /><line x1="26" y1="12" x2="31" y2="18" /><circle cx="5" cy="18" r="1.9" /><circle cx="15" cy="8" r="2.4" /><circle cx="21" cy="28" r="2.4" /><circle cx="26" cy="12" r="2.2" /><circle cx="31" cy="18" r="1.9" />',
  reset: '<line x1="18" y1="8" x2="26" y2="13" /><line x1="26" y1="13" x2="26" y2="23" /><line x1="26" y1="23" x2="18" y2="28" /><line x1="18" y1="28" x2="10" y2="23" /><line x1="10" y1="23" x2="10" y2="13" /><line x1="10" y1="13" x2="15" y2="10" /><line x1="10" y1="13" x2="15" y2="16" /><circle cx="18" cy="8" r="2.0" /><circle cx="26" cy="13" r="2.0" /><circle cx="26" cy="23" r="2.0" /><circle cx="18" cy="28" r="2.0" /><circle cx="10" cy="23" r="2.0" /><circle cx="10" cy="13" r="2.5" />',
  abort: '<polygon points="18,6 30,18 18,30 6,18" fill="none" /><circle cx="18" cy="6" r="2.2" /><circle cx="30" cy="18" r="2.2" /><circle cx="18" cy="30" r="2.2" /><circle cx="6" cy="18" r="2.2" />',
  map: '<line x1="7" y1="11" x2="15" y2="8" /><line x1="15" y1="8" x2="22" y2="12" /><line x1="22" y1="12" x2="29" y2="9" /><line x1="7" y1="26" x2="15" y2="23" /><line x1="15" y1="23" x2="22" y2="27" /><line x1="22" y1="27" x2="29" y2="24" /><line x1="7" y1="11" x2="7" y2="26" /><line x1="15" y1="8" x2="15" y2="23" /><line x1="22" y1="12" x2="22" y2="27" /><line x1="29" y1="9" x2="29" y2="24" /><circle cx="7" cy="11" r="1.9" /><circle cx="15" cy="8" r="2.2" /><circle cx="22" cy="12" r="2.0" /><circle cx="29" cy="9" r="1.9" /><circle cx="15" cy="23" r="2.1" /><circle cx="22" cy="27" r="2.2" />',
  tasks: '<line x1="7" y1="10" x2="11" y2="13" /><line x1="11" y1="13" x2="15" y2="8" /><line x1="18" y1="11" x2="29" y2="11" /><line x1="7" y1="19" x2="11" y2="22" /><line x1="11" y1="22" x2="15" y2="17" /><line x1="18" y1="20" x2="29" y2="20" /><line x1="18" y1="28" x2="29" y2="28" /><circle cx="7" cy="10" r="1.8" /><circle cx="11" cy="13" r="2.1" /><circle cx="15" cy="8" r="1.9" /><circle cx="11" cy="22" r="2.1" /><circle cx="11" cy="28" r="2.2" /><circle cx="29" cy="11" r="1.7" /><circle cx="29" cy="20" r="1.7" /><circle cx="29" cy="28" r="1.7" />',
  log: '<line x1="10" y1="7" x2="26" y2="7" /><line x1="26" y1="7" x2="26" y2="29" /><line x1="26" y1="29" x2="10" y2="29" /><line x1="10" y1="29" x2="10" y2="7" /><line x1="14" y1="13" x2="22" y2="13" /><line x1="14" y1="18" x2="22" y2="18" /><line x1="14" y1="23" x2="19" y2="23" /><circle cx="10" cy="7" r="2.0" /><circle cx="26" cy="7" r="2.0" /><circle cx="26" cy="29" r="2.0" /><circle cx="10" cy="29" r="2.0" /><circle cx="14" cy="13" r="1.7" /><circle cx="14" cy="18" r="1.7" />',
  help: '<circle cx="18" cy="18" r="11" fill="none" /><line x1="18" y1="7" x2="18" y2="11" /><line x1="18" y1="25" x2="18" y2="29" /><line x1="7" y1="18" x2="11" y2="18" /><line x1="25" y1="18" x2="29" y2="18" /><circle cx="18" cy="18" r="2.6" />',
  close: '<path d="M10.5 10.5L25.5 25.5M25.5 10.5L10.5 25.5" stroke-width="3.2" stroke-linecap="round" />',
  skip: '<line x1="8" y1="10" x2="16" y2="18" /><line x1="16" y1="18" x2="8" y2="26" /><line x1="18" y1="10" x2="26" y2="18" /><line x1="26" y1="18" x2="18" y2="26" /><line x1="28" y1="10" x2="28" y2="26" /><circle cx="8" cy="10" r="1.9" /><circle cx="16" cy="18" r="2.3" /><circle cx="8" cy="26" r="1.9" /><circle cx="26" cy="18" r="2.4" /><circle cx="28" cy="10" r="1.9" /><circle cx="28" cy="26" r="1.9" />',
  randomize: '<line x1="7" y1="12" x2="15" y2="12" /><line x1="15" y1="12" x2="21" y2="24" /><line x1="21" y1="24" x2="29" y2="24" /><line x1="7" y1="24" x2="15" y2="24" /><line x1="15" y1="24" x2="21" y2="12" /><line x1="21" y1="12" x2="29" y2="12" /><circle cx="7" cy="12" r="2.0" /><circle cx="29" cy="12" r="2.2" /><circle cx="7" cy="24" r="2.0" /><circle cx="29" cy="24" r="2.2" /><circle cx="18" cy="18" r="2.1" />',
  vision: '<line x1="6" y1="18" x2="18" y2="10" /><line x1="18" y1="10" x2="30" y2="18" /><line x1="30" y1="18" x2="18" y2="26" /><line x1="18" y1="26" x2="6" y2="18" /><circle cx="6" cy="18" r="2.0" /><circle cx="30" cy="18" r="2.0" /><circle cx="18" cy="10" r="2.0" /><circle cx="18" cy="26" r="2.0" /><circle cx="18" cy="18" r="3.1" />',
  cert: '<circle cx="18" cy="15" r="8" fill="none" /><line x1="14" y1="22" x2="12" y2="30" /><line x1="12" y1="30" x2="18" y2="26" /><line x1="18" y1="26" x2="24" y2="30" /><line x1="24" y1="30" x2="22" y2="22" /><circle cx="18" cy="15" r="2.5" /><circle cx="12" cy="30" r="1.9" /><circle cx="24" cy="30" r="1.9" />',
  launch: '<line x1="18" y1="6" x2="11" y2="24" /><line x1="18" y1="6" x2="25" y2="24" /><line x1="11" y1="24" x2="18" y2="20" /><line x1="25" y1="24" x2="18" y2="20" /><line x1="18" y1="20" x2="18" y2="30" /><circle cx="18" cy="6" r="2.7" /><circle cx="11" cy="24" r="2.0" /><circle cx="25" cy="24" r="2.0" /><circle cx="18" cy="30" r="2.1" />',
  forward: '<line x1="15" y1="8" x2="27" y2="18" /><line x1="27" y1="18" x2="15" y2="28" /><line x1="9" y1="18" x2="27" y2="18" /><circle cx="15" cy="8" r="2.2" /><circle cx="27" cy="18" r="2.8" /><circle cx="15" cy="28" r="2.2" /><circle cx="9" cy="18" r="2.1" />',
};

const FIGMA_ICON_PATHS: Record<FigmaHudIconId, string> = {
  tasks: '/assets/ui/figma/tasks-icon.svg',
  status: '/assets/ui/figma/status-icon.svg',
  settings: '/assets/ui/figma/settings-icon.svg',
  map: '/assets/ui/figma/map-icon.svg',
  use: '/assets/ui/figma/use-icon.svg',
  'menu-resume': '/assets/ui/figma/menu-resume.svg',
  'menu-play': '/assets/ui/figma/menu-play.svg',
  'menu-settings': '/assets/ui/figma/menu-settings.svg',
  'confirm-keep': '/assets/ui/figma/confirm-keep.svg',
  'confirm-launch': '/assets/ui/figma/confirm-launch.svg',
  back: '/assets/ui/figma/back-icon.svg',
  'vol-master': '/assets/ui/figma/vol-master.svg',
  'vol-music': '/assets/ui/figma/vol-music.svg',
  'vol-sfx': '/assets/ui/figma/vol-sfx.svg',
  fps: '/assets/ui/figma/fps-icon.svg',
  reset: '/assets/ui/figma/reset-icon.svg',
  'loadout-class': '/assets/ui/figma/loadout-class.svg',
  'loadout-color': '/assets/ui/figma/loadout-color.svg',
  'loadout-difficulty': '/assets/ui/figma/loadout-difficulty.svg',
  'loadout-next': '/assets/ui/figma/loadout-next.svg',
  'habitat-science': '/assets/ui/figma/habitat-science.svg',
  'check-target': '/assets/ui/figma/check-target.svg',
  'check-gravity': '/assets/ui/figma/check-gravity.svg',
  'check-hazard': '/assets/ui/figma/check-hazard.svg',
  'check-duration': '/assets/ui/figma/check-duration.svg',
  'check-systems': '/assets/ui/figma/check-systems.svg',
  'check-mode': '/assets/ui/figma/check-mode.svg',
  'location-pin': '/assets/ui/figma/location-pin.svg',
  'telemetry-live': '/assets/ui/figma/telemetry-live-light.svg',
};

export function renderConstellationIcon(id: ConstellationIconId, extraClass = ''): string {
  const cls = extraClass ? `spud-menu-icon ${extraClass}` : 'spud-menu-icon';
  return `<svg class="${cls}" viewBox="0 0 36 36" aria-hidden="true">${CONSTELLATION_ICON_MARKUP[id]}</svg>`;
}

export function renderFigmaIcon(id: FigmaHudIconId, extraClass = ''): string {
  const cls = extraClass ? `figma-ui-icon ${extraClass}` : 'figma-ui-icon';
  return `<img class="${cls}" src="${FIGMA_ICON_PATHS[id]}" alt="" aria-hidden="true" draggable="false" />`;
}

const BACK_ARROW = '<span class="spud-back-arrow" aria-hidden="true"></span>';

export function renderConstellationBack(label = 'BACK', attrs = 'data-back', ariaLabel = 'Back'): string {
  return `
    <button
      class="spud-constellation-back spud-back-button"
      type="button"
      ${attrs}
      aria-label="${escapeHtml(ariaLabel)}"
    >
      ${BACK_ARROW}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

export function renderConstellationTitle(title: string, titleId: string, kicker?: string): string {
  return `
    <header class="spud-options-header">
      ${kicker ? `<span class="spud-constellation-kicker is-centered">${escapeHtml(kicker)}</span>` : ''}
      <div class="spud-options-title-row">
        <span class="spud-constellation-rule" aria-hidden="true"></span>
        <h1 id="${escapeHtml(titleId)}" class="spud-comic-heading is-page" tabindex="-1">${escapeHtml(title)}</h1>
        <span class="spud-constellation-rule is-right" aria-hidden="true"></span>
      </div>
    </header>
  `;
}

export function renderConstellationAction(opts: {
  icon: ConstellationIconId;
  label: string;
  attrs?: string;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}): string {
  if (opts.icon === 'back' && (!opts.variant || opts.variant === 'default')) {
    return `
      <button class="spud-back-button" type="button" ${opts.attrs ?? ''} ${opts.disabled ? 'disabled' : ''}>
        ${BACK_ARROW}
        <span>${escapeHtml(opts.label)}</span>
      </button>
    `;
  }
  const variantCls = opts.variant === 'primary'
    ? ' is-primary'
    : opts.variant === 'danger'
      ? ' is-danger'
      : ' is-dark';
  const iconHtml = opts.icon === 'forward'
    ? renderFigmaIcon('loadout-next', 'spud-action-figma-icon')
    : opts.icon === 'launch'
      ? renderFigmaIcon('confirm-launch', 'spud-action-figma-icon is-tight')
      : opts.icon === 'back'
        ? renderFigmaIcon('back', 'spud-action-figma-icon')
        : renderConstellationIcon(opts.icon);
  return `
    <button
      class="spud-constellation-action spud-arcade-btn is-md${variantCls}"
      type="button"
      ${opts.attrs ?? ''}
      ${opts.disabled ? 'disabled' : ''}
    >
      <span class="spud-arcade-btn-face">
        <span class="spud-arcade-icon" aria-hidden="true">${iconHtml}</span>
        <span class="spud-menu-label spud-arcade-label">${escapeHtml(opts.label)}</span>
      </span>
    </button>
  `;
}

export function renderCharacterSpriteThumb(
  artPath: string,
  animated = false,
  colorId?: PlayerColorId,
): string {
  const preview = getCharacterSpritePreview(artPath, colorId);
  if (!preview) {
    return `<img src="${escapeHtml(artPath)}" alt="" />`;
  }
  const durationSeconds = (preview.frameCount / preview.fps).toFixed(3);
  return `<span class="spud-sprite-stage${animated ? ' is-animated' : ''}" style="--sprite-frames:${preview.frameCount};--sprite-aspect:${preview.frameWidth} / ${preview.frameHeight};--sprite-duration:${durationSeconds}s" aria-hidden="true"><img class="spud-sprite-strip" src="${escapeHtml(preview.path)}" alt="" draggable="false" /></span>`;
}

export function renderArcadeButton(opts: {
  label: string;
  attrs?: string;
  ariaLabel?: string;
  extraClass?: string;
  subLabel?: string;
  iconMarkup?: string;
  variant?: 'amber' | 'dark' | 'danger';
  fullWidth?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}): string {
  const sizeCls = opts.size ? ` is-${opts.size}` : '';
  const variantCls = opts.variant === 'dark'
    ? ' is-dark'
    : opts.variant === 'danger'
      ? ' is-danger'
      : '';
  const widthCls = opts.fullWidth ? ' is-full' : '';
  const extraCls = opts.extraClass ? ` ${opts.extraClass}` : '';
  const ariaAttr = opts.ariaLabel ? ` aria-label="${escapeHtml(opts.ariaLabel)}"` : '';
  const subHtml = opts.subLabel ? `<small class="spud-arcade-sub">${escapeHtml(opts.subLabel)}</small>` : '';
  const iconHtml = opts.iconMarkup ? `<span class="spud-arcade-icon" aria-hidden="true">${opts.iconMarkup}</span>` : '';
  return `
    <button
      type="button"
      class="spud-arcade-btn${sizeCls}${variantCls}${widthCls}${extraCls}"
      ${opts.attrs ?? ''}
      ${ariaAttr}
      ${opts.disabled ? 'disabled' : ''}
    >
      <span class="spud-arcade-btn-face">
        ${iconHtml}
        <span class="spud-arcade-label">${escapeHtml(opts.label)}</span>
        ${subHtml}
      </span>
    </button>
  `;
}

export type SpudSettingsIconKind = 'master' | 'music' | 'sfx' | 'fps';

const SETTINGS_ICON_PATHS: Record<SpudSettingsIconKind, string> = {
  master: `
    <path d="M5 14h6l8-6v20l-8-6H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 14Z" fill="currentColor" />
    <path d="M23.5 13.2a7 7 0 0 1 0 9.6M27.2 9.5a12.2 12.2 0 0 1 0 17" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" />
  `,
  music: `
    <path d="M14 25.5V9.5l15-3v16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M14 14l15-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
    <ellipse cx="10.5" cy="26" rx="4.5" ry="3.5" fill="currentColor" />
    <ellipse cx="25.5" cy="23" rx="4.5" ry="3.5" fill="currentColor" />
  `,
  sfx: `
    <path d="M6 18h4l4-8 4 16 4-12 3 4h5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
  `,
  fps: `
    <circle cx="18" cy="18" r="10.5" fill="none" stroke="currentColor" stroke-width="2.4" />
    <circle cx="18" cy="18" r="5" fill="none" stroke="currentColor" stroke-width="2" />
    <circle cx="18" cy="18" r="1.8" fill="currentColor" />
    <path d="M18 3.5v5.5M18 27v5.5M3.5 18H9M27 18h5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
  `,
};

export function renderSpudSettingsIcon(kind: SpudSettingsIconKind, extraClass = ''): string {
  const cls = extraClass ? `spud-settings-svg ${extraClass}` : 'spud-settings-svg';
  return `<svg class="${cls}" viewBox="0 0 36 36" aria-hidden="true">${SETTINGS_ICON_PATHS[kind]}</svg>`;
}
