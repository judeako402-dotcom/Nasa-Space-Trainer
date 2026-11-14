/**
 * Modal lifecycle and background inert controller.
 * Ensures mounting/replacing/closing any dialog inside #modal-root runs cleanup callbacks,
 * shields background layers via `inert`, and restores keyboard focus safely.
 */

let activeCleanup: (() => void) | null = null;
let lastFocusedBeforeModal: HTMLElement | null = null;
let backgroundRefs: HTMLElement[] = [];

export function configureModalBackgroundTargets(targets: Array<HTMLElement | null | undefined>): void {
  backgroundRefs = targets.filter((el): el is HTMLElement => Boolean(el));
}

function setBackgroundInert(inert: boolean): void {
  for (const el of backgroundRefs) {
    el.inert = inert;
  }
}

export function clearActiveModals(modalRoot: HTMLElement, options: { restoreFocus?: boolean } = {}): void {
  const cleanup = activeCleanup;
  activeCleanup = null;
  if (cleanup) {
    cleanup();
  }
  modalRoot.replaceChildren();
  setBackgroundInert(false);
  if (options.restoreFocus !== false && lastFocusedBeforeModal?.isConnected) {
    lastFocusedBeforeModal.focus();
  }
  lastFocusedBeforeModal = null;
}

export function mountCustomModal(options: {
  modalRoot: HTMLElement;
  markup?: string;
  node?: HTMLElement;
  onCleanup?: () => void;
  focusSelector?: string;
}): () => void {
  const { modalRoot } = options;
  const previousCleanup = activeCleanup;
  if (!lastFocusedBeforeModal) {
    lastFocusedBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  activeCleanup = null;
  if (previousCleanup) previousCleanup();
  modalRoot.replaceChildren();

  if (options.node) {
    modalRoot.append(options.node);
  } else if (options.markup !== undefined) {
    modalRoot.innerHTML = options.markup;
  }
  setBackgroundInert(true);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    clearActiveModals(modalRoot, { restoreFocus: true });
  };

  activeCleanup = () => {
    closed = true;
    options.onCleanup?.();
  };

  if (options.focusSelector) {
    modalRoot.querySelector<HTMLElement>(options.focusSelector)?.focus();
  }
  return close;
}
