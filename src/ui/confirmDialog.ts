import { persistSave, type PlayerSave } from '../model';
import { createMissionState } from '../app/state';
import { routes } from '../app/router';
import { dom, escapeHtml, session } from '../app/session';
import { sfx } from '../sfx';
import { renderArcadeButton, renderConstellationIcon, renderFigmaIcon, type ConstellationIconId } from './icons';
import { clearActiveModals } from './modalController';

export function openConstellationConfirmDialog(opts: {
  kicker: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmIcon: ConstellationIconId;
  confirmVariant?: 'primary' | 'danger';
  errorText?: string;
  onConfirm: (ctx: { close: () => void; showError: () => void }) => void;
}): void {
  const { modalRoot } = dom();
  sfx.click();
  clearActiveModals(modalRoot, { restoreFocus: false });
  const isDanger = opts.confirmVariant === 'danger';
  const cancelIcon = renderFigmaIcon('confirm-keep', 'spud-confirm-icon');
  const confirmIconHtml = opts.confirmIcon === 'launch'
    ? renderFigmaIcon('confirm-launch', 'spud-confirm-icon is-tight')
    : renderConstellationIcon(opts.confirmIcon, 'spud-confirm-icon');
  modalRoot.innerHTML = `
    <dialog class="game-menu-dialog mission-abort-dialog spud-arcade-confirm${isDanger ? ' is-danger' : ''}" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-description">
      <section class="spud-copy-stack spud-confirm-shell">
        <div class="spud-confirm-hero">
          <img class="spud-confirm-badge-art" src="/assets/ui/spudnaut/badge-override-alert.jpg" alt="" aria-hidden="true" draggable="false" />
          <div class="spud-confirm-heading-group">
            <span class="spud-constellation-kicker">${escapeHtml(opts.kicker)}</span>
            <h2 id="confirm-modal-title" class="spud-comic-heading is-sub">${escapeHtml(opts.title)}</h2>
          </div>
        </div>
        <hr class="spud-dialogue-rule" />
        <div class="spud-copy-block spud-confirm-copy">
          <p id="confirm-modal-description">${escapeHtml(opts.description)}</p>
          ${opts.errorText ? `<p class="mission-abort-error" style="color:var(--spud-danger);" role="alert" hidden>${escapeHtml(opts.errorText)}</p>` : ''}
        </div>
        <footer class="spud-constellation-actions spud-confirm-stack">
          ${renderArcadeButton({
            label: opts.cancelLabel,
            attrs: 'data-confirm-cancel autofocus',
            iconMarkup: cancelIcon,
            variant: 'dark',
            size: 'md',
            fullWidth: true,
          })}
          ${renderArcadeButton({
            label: opts.confirmLabel,
            attrs: 'data-confirm-accept',
            iconMarkup: confirmIconHtml,
            variant: isDanger ? 'danger' : 'amber',
            size: 'md',
            fullWidth: true,
          })}
        </footer>
      </section>
    </dialog>
  `;
  const dialog = modalRoot.querySelector<HTMLDialogElement>('dialog')!;
  const close = (): void => {
    dialog.close();
    clearActiveModals(modalRoot, { restoreFocus: false });
  };
  const showError = (): void => {
    const errEl = dialog.querySelector<HTMLElement>('.mission-abort-error');
    if (errEl) errEl.hidden = false;
  };
  dialog.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => {
    sfx.click();
    close();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.querySelector('[data-confirm-accept]')?.addEventListener('click', () => {
    opts.onConfirm({ close, showError });
  });
  dialog.showModal();
}

export function showAbortMissionConfirmation(): void {
  openConstellationConfirmDialog({
    kicker: 'COMMAND OVERRIDE',
    title: 'ABORT THIS MISSION?',
    description: 'This ends your current trial and clears its shift progress and reports. Your training progress and settings are kept.',
    cancelLabel: 'KEEP MISSION',
    confirmLabel: 'ABORT & RETURN',
    confirmIcon: 'abort',
    confirmVariant: 'danger',
    errorText: 'Could not clear the saved trial. Your mission is still active.',
    onConfirm: ({ close, showError }) => {
      const nextSave: PlayerSave = { ...session.save, activeTrial: null, trialDay: 0 };
      if (!persistSave(nextSave, { replaceBackup: true })) {
        showError();
        return;
      }
      sfx.click();
      session.save = nextSave;
      session.mission = createMissionState(session.save.options.difficulty);
      session.planningEventBase = null;
      session.selectedEventChoice = '';
      close();
      routes.showMenu();
    },
  });
}

export function confirmReplaceSavedTrial(opts: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmIcon?: ConstellationIconId;
  variant?: 'primary' | 'danger';
  onConfirm: () => void;
}): void {
  openConstellationConfirmDialog({
    kicker: 'ACTIVE TRIAL IN PROGRESS',
    title: opts.title,
    description: opts.description,
    cancelLabel: 'KEEP SAVED TRIAL',
    confirmLabel: opts.confirmLabel,
    confirmIcon: opts.confirmIcon ?? 'forward',
    confirmVariant: opts.variant ?? 'primary',
    onConfirm: ({ close }) => {
      sfx.click();
      close();
      opts.onConfirm();
    },
  });
}
