import { Capacitor } from '@capacitor/core';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function installHelpText(): string {
  const isAppleTouch = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isAppleTouch
    ? 'To install, tap Share in Safari, then choose Add to Home Screen.'
    : 'Open your browser menu and choose Install app or Add to Home screen.';
}

export function mountPwaController(): void {
  const banner = document.querySelector<HTMLElement>('#pwa-banner');
  const title = banner?.querySelector<HTMLElement>('#pwa-banner-title');
  const message = banner?.querySelector<HTMLElement>('#pwa-banner-message');
  const installAction = banner?.querySelector<HTMLButtonElement>('#pwa-install-action');
  const updateAction = banner?.querySelector<HTMLButtonElement>('#pwa-update-action');
  const dismissAction = banner?.querySelector<HTMLButtonElement>('[data-pwa-dismiss]');
  if (!banner || !title || !message || !installAction || !updateAction || !dismissAction) {
    throw new Error('PWA banner markup is incomplete.');
  }

  if (Capacitor.isNativePlatform()) {
    document.body.dataset.nativeApp = 'true';
    banner.hidden = true;
    installAction.hidden = true;
    updateAction.hidden = true;
    return;
  }

  let deferredInstall: InstallPromptEvent | null = null;
  let registration: ServiceWorkerRegistration | null = null;
  let waitingWorker: ServiceWorker | null = null;
  let reloadAfterUpdate = false;

  const standalone = isStandalone();
  document.body.toggleAttribute('data-pwa-installed', standalone);
  installAction.hidden = true;
  updateAction.hidden = true;

  const showBanner = (heading: string, copy: string): void => {
    title.textContent = heading;
    message.textContent = copy;
    banner.hidden = false;
  };
  const dismissBanner = (): void => {
    banner.hidden = true;
  };

  const requestInstall = async (): Promise<void> => {
    if (!deferredInstall) {
      showBanner('Install Spudnaut', installHelpText());
      installAction.hidden = true;
      return;
    }

    const prompt = deferredInstall;
    deferredInstall = null;
    installAction.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        showBanner('Installation started', 'Spudnaut will appear on your home screen when the install finishes.');
        installAction.hidden = true;
      } else {
        dismissBanner();
      }
    } catch (error) {
      console.error('PWA install prompt failed.', error);
      showBanner('Install unavailable', 'Use your browser menu to install Spudnaut.');
      installAction.hidden = true;
    } finally {
      installAction.disabled = false;
    }
  };

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-pwa-install]')
      : null;
    if (!target) return;
    event.preventDefault();
    void requestInstall();
  });
  dismissAction.addEventListener('click', dismissBanner);

  window.addEventListener('beforeinstallprompt', (event) => {
    if (standalone) return;
    event.preventDefault();
    deferredInstall = event as InstallPromptEvent;
    installAction.hidden = false;
    showBanner('Install Spudnaut', 'Keep the habitat trainer ready from your home screen.');
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    document.body.setAttribute('data-pwa-installed', '');
    installAction.hidden = true;
    if (updateAction.hidden) dismissBanner();
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const showWaitingUpdate = (worker?: ServiceWorker | null): void => {
    if (!navigator.serviceWorker.controller) return;
    waitingWorker = worker ?? registration?.waiting ?? null;
    if (!waitingWorker) return;
    updateAction.hidden = false;
    showBanner('Update ready', 'A new version is ready to use. Restart Spudnaut to update.');
  };

  updateAction.addEventListener('click', () => {
    const worker = registration?.waiting ?? waitingWorker;
    if (!worker) {
      updateAction.hidden = true;
      showBanner('Update unavailable', 'The update is no longer waiting. Reload Spudnaut to check again.');
      return;
    }
    reloadAfterUpdate = true;
    updateAction.disabled = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadAfterUpdate) return;
    reloadAfterUpdate = false;
    window.location.reload();
  });

  const observeInstallingWorker = (): void => {
    const installing = registration?.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        showWaitingUpdate(registration?.waiting ?? installing);
      }
    });
  };

  void navigator.serviceWorker.register('/sw.js').then((activeRegistration) => {
    registration = activeRegistration;
    registration.addEventListener('updatefound', observeInstallingWorker);
    observeInstallingWorker();
    showWaitingUpdate(registration.waiting);
  }).catch((error: unknown) => {
    console.error('Service worker registration failed.', error);
    showBanner('Offline support unavailable', 'Spudnaut can still play online, but could not prepare for offline use.');
  });
}
