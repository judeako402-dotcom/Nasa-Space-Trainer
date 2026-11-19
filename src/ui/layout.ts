import { escapeHtml, session, setDomRefs, type DomRefs } from '../app/session';
import { StationMapUrls } from '../game/assets/AssetKeys';
import { renderConstellationBack, renderFigmaIcon } from './icons';
import { configureModalBackgroundTargets } from './modalController';

export function mountAppFrame(): DomRefs {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('Missing #app root element.');

  const requestAppFullscreen = (): void => {
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen().catch((error: unknown) => {
      console.warn('Fullscreen request was denied; the game remains sized to the viewport.', error);
    });
  };
  app.addEventListener('pointerdown', requestAppFullscreen, { capture: true });
  app.addEventListener('keydown', requestAppFullscreen, { capture: true });

  app.innerHTML = `
    <div class="game-frame">
      <main class="screen-root" id="screen-root"></main>
      <aside class="pwa-banner" id="pwa-banner" hidden aria-labelledby="pwa-banner-title">
        <div class="pwa-banner-copy">
          <strong id="pwa-banner-title">Spudnaut</strong>
          <p id="pwa-banner-message" role="status" aria-live="polite"></p>
        </div>
        <div class="pwa-banner-actions">
          <button type="button" class="pwa-banner-action" id="pwa-install-action" data-pwa-install hidden>Install</button>
          <button type="button" class="pwa-banner-action" id="pwa-update-action" hidden>Restart to update</button>
          <button type="button" class="pwa-banner-dismiss" data-pwa-dismiss aria-label="Dismiss install or update message">×</button>
        </div>
      </aside>
      <div class="scene-shell" id="scene-shell" hidden>
        <div id="game-canvas" class="game-canvas"></div>
        <div id="station-blackout" class="station-blackout" aria-hidden="true" hidden></div>
        <div class="scene-loading" id="scene-loading" role="status" aria-live="polite" hidden>
          <div class="scene-loading-card">
            <div class="scene-loading-stage" aria-hidden="true">
              <img class="scene-loading-strip" src="/assets/loading/loading-runner-sheet.png" alt="" draggable="false" />
              <img class="scene-loading-poster" src="/assets/loading/loading-poster.png" alt="" draggable="false" />
            </div>
            <div class="scene-loading-copy">
              <span class="scene-loading-kicker">SPUDNAUT TELEMETRY LINK</span>
              <strong id="scene-loading-label">CONNECTING HABITAT ENGINE...</strong>
              <progress class="spud-load-progress" id="scene-loading-progress" max="100"></progress>
              <small id="scene-loading-detail">Streaming station &amp; crew assets</small>
            </div>
          </div>
        </div>
        <div class="scene-fallback" id="scene-fallback" role="alert" hidden></div>
        <div class="scene-vignette" aria-hidden="true"></div>
        <div class="touch-controls" id="touch-controls" hidden>
          <div
            class="touch-joystick"
            id="touch-joystick"
            role="application"
            aria-label="Virtual joystick. Drag to walk around the station."
            tabindex="-1"
          >
            <span class="touch-joystick-hint" aria-hidden="true">DRAG TO WALK</span>
            <span class="touch-joystick-base" aria-hidden="true"><span class="touch-joystick-knob"></span></span>
          </div>
        </div>
        <div class="hud mission-hud" id="hud" hidden>
          <div class="hud-special-alert" id="hud-special-alert" role="alert" hidden>
            <svg class="hud-special-alert-triangle" viewBox="0 0 64 56" width="54" height="48" aria-hidden="true">
              <path d="M32 4 60 52H4Z" fill="rgba(185, 12, 24, 0.3)" stroke="#ff2938" stroke-width="4.5" stroke-linejoin="round" />
              <rect x="29.5" y="19" width="5" height="17" rx="2.5" fill="#ff2938" />
              <circle cx="32" cy="43" r="3.2" fill="#ff2938" />
            </svg>
            <strong class="hud-special-alert-text" id="hud-special-alert-text"></strong>
          </div>
          <div class="hud-top-left">
            <span class="hud-eva-warning" id="hud-eva-warning" role="alert" hidden>VACUUM HAZARD · SEAL EVA (G)</span>
            <nav class="hud-left-rail" aria-label="Mission panels">
              <button type="button" class="hud-drawer-tab" data-action="tasks" aria-expanded="false" aria-controls="hud-drawer-panel" aria-keyshortcuts="T">
                ${renderFigmaIcon('tasks', 'hud-glyph hud-glyph--rail')}
                <span class="hud-tab-label">Tasks</span>
                <kbd aria-hidden="true">T</kbd>
              </button>
              <button type="button" class="hud-drawer-tab" data-action="status" aria-expanded="false" aria-controls="hud-drawer-panel" aria-keyshortcuts="V">
                ${renderFigmaIcon('status', 'hud-glyph hud-glyph--rail')}
                <span class="hud-tab-label">Status</span>
                <kbd aria-hidden="true">V</kbd>
              </button>
            </nav>
          </div>
          <span class="spud-fps-badge hud-fps-pill" id="hud-fps" hidden>-- FPS</span>
          <div class="hud-top-right">
            <button type="button" class="hud-settings-btn" data-action="options" aria-label="Settings" title="Settings (O)" aria-keyshortcuts="O">
              <img src="/assets/ui/spudnaut/ingame/settings-gear.webp" alt="" draggable="false" />
            </button>
            <button type="button" class="hud-map-btn" data-action="map" aria-label="Station map" title="Map (M)" aria-keyshortcuts="M" aria-haspopup="dialog">
              <span class="hud-radar" aria-hidden="true">
                <span class="hud-radar-viewport">
                  <img class="hud-radar-topology" data-station-overview="${StationMapUrls.overview}" alt="" draggable="false" />
                  <span class="hud-radar-pings" id="hud-radar-pings"></span>
                  <span class="hud-radar-player" id="hud-radar-player"></span>
                </span>
              </span>
              <span class="hud-map-caption">Map <kbd aria-hidden="true">M</kbd></span>
            </button>
          </div>
          <div class="hud-drawer-backdrop" id="hud-drawer-backdrop" hidden></div>
          <aside class="hud-drawer-panel" id="hud-drawer-panel" hidden aria-label="Mission Drawer">
            <div class="hud-drawer-view" data-drawer-view="tasks" hidden>
              <header class="hud-drawer-head">
                <div class="hud-drawer-title">
                  <h2><img src="/assets/ui/spudnaut/ingame/tasks-title.webp" alt="Tasks" /></h2>
                </div>
                <div class="hud-drawer-head-right">
                  <span class="hud-drawer-status-summary" id="hud-tasks-summary"><i aria-hidden="true"></i>0 / 3 COMPLETE</span>
                  <button type="button" class="hud-drawer-close" data-drawer-close aria-label="Close Tasks drawer">×</button>
                </div>
              </header>
              <div class="hud-task-card hud-drawer-progress" aria-live="polite">
                <div class="hud-task-card-row">
                  <span class="hud-task-eyebrow">TOTAL TASKS COMPLETED</span>
                  <span class="hud-task-count" id="task-label">0 / 3</span>
                </div>
                <div class="hud-task-track" aria-hidden="true"><span id="task-fill"></span></div>
              </div>
              <div class="hud-tasks-grid" id="hud-tasks-list"></div>
              <footer class="hud-drawer-foot">
                <span class="hud-drawer-crumb" id="hud-tasks-breadcrumb"><i aria-hidden="true"></i>CENTRAL HUB &nbsp;/&nbsp; CREW TASK LOG</span>
                <span class="hud-drawer-foot-actions">
                  <button type="button" class="hud-drawer-link" data-action="log" title="Mission Log (L)">LOG <kbd aria-hidden="true">L</kbd></button>
                  <button type="button" class="hud-drawer-link" data-action="help" title="Controls & Help (H)">HELP <kbd aria-hidden="true">H</kbd></button>
                </span>
              </footer>
            </div>
            <div class="hud-drawer-view" data-drawer-view="status" hidden>
              <header class="hud-drawer-head">
                <div class="hud-drawer-title">
                  <h2><img src="/assets/ui/spudnaut/ingame/status-title.webp" alt="Status" /></h2>
                </div>
                <div class="hud-drawer-head-right">
                  <span class="hud-live-badge">${renderFigmaIcon('telemetry-live', 'hud-live-icon')}LIVE</span>
                  <button type="button" class="hud-drawer-close" data-drawer-close aria-label="Close Status drawer">×</button>
                </div>
              </header>
              <div class="hud-status-content">
                <div class="hud-status-monitor" aria-hidden="true"></div>
                <div class="hud-systems hud-status-grid" id="hud-systems"></div>
              </div>
              <footer class="hud-drawer-foot">
                <span class="hud-drawer-crumb" id="hud-status-breadcrumb"><i aria-hidden="true"></i>CENTRAL HUB &nbsp;/&nbsp; SYSTEM TELEMETRY</span>
              </footer>
            </div>
          </aside>
          <div class="hud-bottom-left">
            <img class="hud-profile-plate" src="/assets/ui/spudnaut/ingame/character.webp" alt="" aria-hidden="true" draggable="false" />
            <div class="hud-profile-content">
              <div class="hud-portrait-wrap">
                <span class="hud-portrait-img" id="hud-portrait" aria-hidden="true"></span>
                <span class="id-swatch hud-color-dot" id="hud-color-dot" aria-hidden="true"></span>
              </div>
              <div class="id-copy">
                <strong id="hud-player-name">NOVA SPUD</strong>
                <small class="hud-player-meta" id="hud-player-meta">SPECIALIST · DESTINATION</small>
                <div class="spud-room-badge hud-room-row">
                  <span id="hud-room">CENTRAL HUB</span>
                </div>
              </div>
              <button
                type="button"
                class="hud-helmet-btn"
                id="hud-helmet-btn"
                data-action="helmet"
                aria-pressed="false"
                aria-keyshortcuts="G"
                title="Toggle EVA Helmet (G)"
              >
                <span id="hud-helmet-label">EVA: OPEN</span>
                <kbd aria-hidden="true">G</kbd>
              </button>
            </div>
          </div>
          <div class="camera-cluster" id="camera-cluster" hidden>
            <button type="button" class="camera-button" data-action="cam-peek" aria-label="Free camera peek, hold to look around" aria-keyshortcuts="Shift">
              <span>PEEK</span>
            </button>
            <button type="button" class="camera-button" data-action="cam-snap" aria-label="Recenter camera on the crew member" aria-keyshortcuts="R">
              <span>RECENTER</span>
            </button>
            <button type="button" class="camera-button" data-action="cam-tour" aria-label="Pan across the station map" aria-keyshortcuts="P">
              <span>TOUR</span>
            </button>
          </div>
          <div class="action-cluster hud-bottom-right">
            <button type="button" class="action-button use is-inactive" data-action="use" aria-keyshortcuts="E" disabled>
              ${renderFigmaIcon('use', 'hud-glyph hud-glyph--use')}
              <span>USE</span>
              <kbd aria-hidden="true">E</kbd>
            </button>
          </div>
          <div class="toast" id="toast" role="status"></div>
        </div>
        <div class="training-hud" id="training-hud" hidden></div>
      </div>
      <div class="overlay-root" id="overlay-root"></div>
      <div class="modal-root" id="modal-root"></div>
    </div>
  `;

  const refs: DomRefs = {
    app,
    screenRoot: document.querySelector<HTMLDivElement>('#screen-root')!,
    sceneShell: document.querySelector<HTMLDivElement>('#scene-shell')!,
    hud: document.querySelector<HTMLDivElement>('#hud')!,
    trainingHud: document.querySelector<HTMLDivElement>('#training-hud')!,
    overlayRoot: document.querySelector<HTMLDivElement>('#overlay-root')!,
    modalRoot: document.querySelector<HTMLDivElement>('#modal-root')!,
  };

  setDomRefs(refs);
  configureModalBackgroundTargets([refs.screenRoot, refs.sceneShell, refs.hud, refs.trainingHud, refs.overlayRoot]);
  return refs;
}

export function renderConstellationVideoScreen(opts: {
  ariaLabel: string;
  bodyMarkup: string;
  backLabel?: string;
  backAttrs?: string;
  backAriaLabel?: string;
  utilityMarkup?: string;
  narrow?: boolean;
  extraClass?: string;
  backdropArt?: string;
}): string {
  const reduced = session.save.options.reducedMotion ? 'reduce-motion' : '';
  const extra = opts.extraClass ? ` ${opts.extraClass}` : '';
  const narrowCls = opts.narrow ? ' is-narrow' : '';
  const backLabel = opts.backAttrs === 'data-habitat-back'
    ? 'LOADOUT'
    : opts.backAttrs === 'data-launch-back'
      ? 'HABITAT'
      : (opts.backLabel ?? 'BACK');
  const outerBackdrop = opts.backdropArt
    ? `<img class="menu-ambient-backdrop spud-art-backdrop" src="${escapeHtml(opts.backdropArt)}" alt="" aria-hidden="true" draggable="false" />`
    : `<img class="menu-ambient-backdrop" src="/assets/main-menu-poster.jpg" alt="" aria-hidden="true" />`;
  const stageBackdrop = opts.backdropArt
    ? `<img class="spud-art-stage-img" src="${escapeHtml(opts.backdropArt)}" alt="" aria-hidden="true" draggable="false" />`
    : `
        <video
          class="menu-video-player"
          src="/assets/main-menu.mp4"
          poster="/assets/main-menu-poster.jpg"
          autoplay
          loop
          muted
          playsinline
          preload="auto"
          aria-hidden="true"
        ></video>
        <img class="menu-video-poster" src="/assets/main-menu-poster.jpg" alt="" aria-hidden="true" />
      `;
  const videoOpenTag = opts.backdropArt
    ? `<div class="video-menu-stage has-spud-art">`
    : `<div class="video-menu-stage">`;
  return `
    <section class="screen-menu spud-video-menu spud-constellation-screen ${reduced}${extra}" aria-label="${escapeHtml(opts.ariaLabel)}">
      ${outerBackdrop}
      ${videoOpenTag}
        ${stageBackdrop}
        <div class="menu-video-vignette" aria-hidden="true"></div>
        ${opts.backAttrs === '' ? '' : renderConstellationBack(backLabel, opts.backAttrs ?? 'data-back', opts.backAriaLabel ?? 'Back')}
        ${opts.utilityMarkup ? `<div class="spud-utility-bar">${opts.utilityMarkup}</div>` : ''}
        <div class="spud-constellation-stage">
          <div class="spud-constellation-body${narrowCls}">
            ${opts.bodyMarkup}
          </div>
        </div>
      </div>
    </section>
  `;
}
