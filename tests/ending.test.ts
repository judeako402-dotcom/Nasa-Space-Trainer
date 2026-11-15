import { afterEach, describe, expect, it, vi } from 'vitest';

interface ListenerMap {
  [type: string]: Array<(event?: unknown) => void>;
}

function createFakeElement(tag = 'div') {
  const listeners: ListenerMap = {};
  const classSet = new Set<string>();
  const children: FakeElement[] = [];
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    hidden: false,
    disabled: false,
    muted: false,
    volume: 1,
    paused: true,
    duration: 10,
    currentTime: 0,
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
    textContent: '',
    _html: '',
    classList: {
      add: (...names: string[]) => names.forEach((n) => classSet.add(n)),
      remove: (...names: string[]) => names.forEach((n) => classSet.delete(n)),
      toggle: (name: string, force?: boolean) => {
        if (force === true) classSet.add(name);
        else if (force === false) classSet.delete(name);
        else if (classSet.has(name)) classSet.delete(name);
        else classSet.add(name);
      },
      contains: (name: string) => classSet.has(name),
    },
    get className() {
      return [...classSet].join(' ');
    },
    set className(val: string) {
      classSet.clear();
      val.split(/\s+/).filter(Boolean).forEach((n) => classSet.add(n));
    },
    get childElementCount() {
      return children.length;
    },
    get innerHTML() {
      return this._html;
    },
    set innerHTML(val: string) {
      this._html = val;
      children.length = 0;
    },
    replaceChildren: () => {
      el._html = '';
      children.length = 0;
    },
    append: (...nodes: FakeElement[]) => {
      children.push(...nodes);
    },
    addEventListener: (type: string, fn: (event?: unknown) => void) => {
      listeners[type] ??= [];
      listeners[type].push(fn);
    },
    removeEventListener: (type: string, fn: (event?: unknown) => void) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((item) => item !== fn);
    },
    dispatch: (type: string, event: Record<string, unknown> = {}) => {
      for (const fn of [...(listeners[type] ?? [])]) {
        fn({ preventDefault: () => {}, ...event });
      }
    },
    click: () => {
      el.dispatch('click');
    },
    focus: () => {},
    pause: () => {
      el.paused = true;
    },
    play: () => {
      el.paused = false;
      return Promise.resolve();
    },
    querySelector: (selector: string): FakeElement | null => {
      if (selector === '.screen-splash') return el._screenSplash ?? null;
      if (selector === '.opening-video') return el._video ?? null;
      if (selector === '.intro-skip') return el._skipBtn ?? null;
      if (selector === '[data-report-save]') return el._reportSave ?? null;
      if (selector === '[data-report-next]') return el._reportNext ?? null;
      return null;
    },
    querySelectorAll: () => [],
    _screenSplash: null as FakeElement | null,
    _video: null as FakeElement | null,
    _skipBtn: null as FakeElement | null,
    _reportSave: null as FakeElement | null,
    _reportNext: null as FakeElement | null,
  };
  return el;
}

type FakeElement = ReturnType<typeof createFakeElement>;

async function setupMissionHarness() {
  vi.resetModules();

  const store = new Map<string, string>();
  const screenRoot = createFakeElement('div');
  const overlayRoot = createFakeElement('div');
  const modalRoot = createFakeElement('div');
  const sceneShell = createFakeElement('div');
  const hud = createFakeElement('div');
  const trainingHud = createFakeElement('div');
  const app = createFakeElement('div');
  const body = createFakeElement('body');

  // Wire synthetic querySelector targets when markup is assigned into screenRoot / overlayRoot.
  let activeScreenSplash: FakeElement | null = null;
  let activeVideo: FakeElement | null = null;
  let activeSkipBtn: FakeElement | null = null;
  let activeReportSave: FakeElement | null = null;
  let activeReportNext: FakeElement | null = null;

  const origSetScreenHtml = Object.getOwnPropertyDescriptor(screenRoot, 'innerHTML')!.set!;
  Object.defineProperty(screenRoot, 'innerHTML', {
    get: () => screenRoot._html,
    set: (val: string) => {
      origSetScreenHtml.call(screenRoot, val);
      if (val.includes('screen-splash')) {
        activeScreenSplash = createFakeElement('section');
        activeVideo = createFakeElement('video');
        activeSkipBtn = createFakeElement('button');
        screenRoot._screenSplash = activeScreenSplash;
        screenRoot._video = activeVideo;
        screenRoot._skipBtn = activeSkipBtn;
      } else {
        screenRoot._screenSplash = null;
        screenRoot._video = null;
        screenRoot._skipBtn = null;
      }
    },
  });

  const origSetOverlayHtml = Object.getOwnPropertyDescriptor(overlayRoot, 'innerHTML')!.set!;
  Object.defineProperty(overlayRoot, 'innerHTML', {
    get: () => overlayRoot._html,
    set: (val: string) => {
      origSetOverlayHtml.call(overlayRoot, val);
      if (val.includes('earth-report-full')) {
        activeReportSave = createFakeElement('button');
        activeReportNext = createFakeElement('button');
        overlayRoot._reportSave = activeReportSave;
        overlayRoot._reportNext = activeReportNext;
      } else {
        overlayRoot._reportSave = null;
        overlayRoot._reportNext = null;
      }
    },
  });

  let now = 0;
  const rafCallbacks: Array<() => void> = [];

  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal('document', {
    body,
    hidden: false,
    querySelector: () => null,
    createElement: (tag: string) => createFakeElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    scrollTo: () => {},
  });
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  const { setDomRefs, session } = await import('../src/app/session');
  const { createMissionState } = await import('../src/app/state');
  const { registerRoutes } = await import('../src/app/router');
  const missionScreens = await import('../src/screens/missionScreens');

  setDomRefs({
    app: app as unknown as HTMLDivElement,
    screenRoot: screenRoot as unknown as HTMLDivElement,
    sceneShell: sceneShell as unknown as HTMLDivElement,
    hud: hud as unknown as HTMLDivElement,
    trainingHud: trainingHud as unknown as HTMLDivElement,
    overlayRoot: overlayRoot as unknown as HTMLDivElement,
    modalRoot: modalRoot as unknown as HTMLDivElement,
  });

  const showMenu = vi.fn();
  const showDialogue = vi.fn();
  const noop = vi.fn();
  registerRoutes({
    showSplash: noop,
    showMenu,
    showStory: noop,
    showTraining: noop,
    renderTrainingHud: noop,
    handleTrainingInteract: noop,
    showExamIntro: noop,
    startExam: noop,
    showOptions: noop,
    showCredits: noop,
    showLobby: noop,
    showResumeStaging: noop,
    showHabitat: noop,
    showLaunch: noop,
    startLaunchSequence: noop,
    beginMission: missionScreens.beginMission,
    resumeTrial: missionScreens.resumeTrial,
    showMissionShell: missionScreens.showMissionShell,
    startDay: missionScreens.startDay,
    startPlanning: missionScreens.startPlanning,
    startLoop: missionScreens.startLoop,
    finishDay: missionScreens.finishDay,
    renderReport: missionScreens.renderReport,
    completeMission: missionScreens.completeMission,
    openMissionTask: noop,
    openMap: noop,
    openTaskList: noop,
    openMissionLog: noop,
    openHelp: noop,
    updateHUD: noop,
    updateActionButtons: noop,
    syncHelmetButton: noop,
    togglePlayerHelmet: noop,
    toggleHudDrawer: noop,
    setHudDrawer: noop,
    updateRadarMarker: noop,
    syncHudRoomText: noop,
    showDialogue,
    openMinigameModal: noop,
    startTutorial: () => false,
    dismissTutorial: noop,
    showAbortMissionConfirmation: noop,
    confirmReplaceSavedTrial: noop,
    onSceneFailure: noop,
  });

  return {
    session,
    createMissionState,
    missionScreens,
    body,
    screenRoot,
    overlayRoot,
    showMenu,
    showDialogue,
    getActiveElements: () => ({ activeScreenSplash, activeVideo, activeSkipBtn }),
    advanceFade: (ms: number) => {
      now += ms;
      while (rafCallbacks.length) {
        const cb = rafCallbacks.shift()!;
        cb();
        if (now < ms) break;
      }
    },
  };
}

describe('final-day ending cutscene flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('skips Final Habitat Review and Mission End overview on the final day, playing homecoming.mp4 and returning straight to menu', async () => {
    const h = await setupMissionHarness();
    h.session.currentScreen = 'mission';
    h.session.mission = h.createMissionState('cadet');
    h.session.mission.phase = 'playing';
    h.session.mission.day = 7;
    h.session.mission.tasks = ['upload-admin', 'grow-light-balance', 'med-pipes'];
    h.session.mission.completed = ['upload-admin', 'grow-light-balance', 'med-pipes'];
    h.session.mission.totalAssigned = 21;
    h.session.mission.totalCompleted = 21;

    h.missionScreens.finishDay('All daily assignments completed. Crew systems stable.');

    expect(h.overlayRoot.innerHTML).toBe('');
    expect(h.showDialogue).not.toHaveBeenCalled();
    expect(h.session.mission.phase).toBe('complete');
    expect(h.session.save.medals).toBe(1);
    expect(h.session.save.games).toBe(1);
    expect(h.session.save.activeTrial).toBeNull();
    expect(h.body.dataset.screen).toBe('ending');
    expect(h.screenRoot.innerHTML).toContain('/assets/ui/spudnaut/ending/homecoming.mp4');
    expect(h.screenRoot.innerHTML).toContain('intro-skip');
    expect(h.screenRoot.innerHTML).not.toContain('homecoming-medal');
    expect(h.screenRoot.innerHTML).not.toContain('FINAL HABITAT REVIEW');
    expect(h.showMenu).not.toHaveBeenCalled();

    const { activeVideo } = h.getActiveElements();
    activeVideo!.dispatch('ended');

    expect(h.showMenu).toHaveBeenCalledTimes(1);
    expect(h.overlayRoot.innerHTML).toBe('');
  });

  it('returns straight to the Main Menu when skipping the ending video', async () => {
    const h = await setupMissionHarness();
    h.session.currentScreen = 'mission';
    h.session.mission = h.createMissionState('cadet');
    h.session.mission.phase = 'playing';
    h.session.mission.day = 7;
    h.session.mission.tasks = ['upload-admin'];
    h.session.mission.completed = ['upload-admin'];

    h.missionScreens.completeMission();
    expect(h.body.dataset.screen).toBe('ending');

    const { activeSkipBtn, activeScreenSplash } = h.getActiveElements();
    activeSkipBtn!.click();
    expect(activeScreenSplash!.classList.contains('is-fading')).toBe(true);

    h.advanceFade(400);
    expect(h.showMenu).toHaveBeenCalledTimes(1);
  });

  it('still shows the Shift Telemetry Report on intermediate days and guards final-day renderReport calls', async () => {
    const h = await setupMissionHarness();
    h.session.currentScreen = 'mission';
    h.session.mission = h.createMissionState('cadet');
    h.session.mission.phase = 'playing';
    h.session.mission.day = 2;
    h.session.mission.tasks = ['upload-admin'];
    h.session.mission.completed = ['upload-admin'];

    h.missionScreens.finishDay('All daily assignments completed. Crew systems stable.');
    expect(h.overlayRoot.innerHTML).toContain('SHIFT TELEMETRY REPORT');
    expect(h.overlayRoot.innerHTML).toContain('NEXT SHIFT');
    expect(h.body.dataset.screen).not.toBe('ending');

    // Guard against restoring a final-day report screen directly.
    h.session.mission.day = 7;
    h.missionScreens.renderReport('Saved shift report restored.');
    expect(h.body.dataset.screen).toBe('ending');
    expect(h.overlayRoot.innerHTML).toBe('');
  });
});
