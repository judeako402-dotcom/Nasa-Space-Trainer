import { escapeHtml, setSceneLoadingState } from '../app/session';
import { renderConstellationAction } from './icons';

export function showPhaserFallback(
  message: string,
  onRetry: () => void,
  onMenu: () => void,
): void {
  setSceneLoadingState(false);
  const host = document.querySelector<HTMLElement>('#scene-fallback');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="scene-loading-card scene-fallback-card">
      <div class="scene-loading-copy">
        <span class="scene-loading-kicker">RENDERER RECOVERY MODE</span>
        <strong>HABITAT VIEWPORT INTERRUPTED</strong>
        <small>${escapeHtml(message)}</small>
        <div class="spud-constellation-actions" style="margin-top:12px;">
          ${renderConstellationAction({ icon: 'back', label: 'MAIN MENU', attrs: 'data-fallback-menu' })}
          ${renderConstellationAction({ icon: 'reset', label: 'RETRY CANVAS', attrs: 'data-fallback-retry', variant: 'primary' })}
        </div>
      </div>
    </div>
  `;
  host.querySelector('[data-fallback-retry]')?.addEventListener('click', onRetry);
  host.querySelector('[data-fallback-menu]')?.addEventListener('click', onMenu);
}

export function hidePhaserFallback(): void {
  const host = document.querySelector<HTMLElement>('#scene-fallback');
  if (!host) return;
  host.hidden = true;
  host.replaceChildren();
}
