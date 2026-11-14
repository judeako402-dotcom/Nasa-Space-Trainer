import './styles/index.css';
import { startMusic } from './audio/music';
import { registerRoutes } from './app/router';
import {
  applyOptions, configureScene, dom, interactActiveStation, isMissionActive,
  pauseMissionForModal, resetStationGame, resumeFromModal, resumeMissionAfterModal,
  saveTrialProgress, session, setGameEventHandler, setSceneLoadingState,
  showToast, talkToCrew, walkStationTo,
} from './app/session';
import type { GameEvent } from './game';
import {
  setHudDrawer, syncEvaHazardState, syncHelmetButton, syncHudRoomText,
  toggleHudDrawer, togglePlayerHelmet, updateActionButtons, updateHUD, updateRadarMarker,
} from './hud/hudController';
import {
  openHelp, openMap, openMinigameModal, openMissionLog,
  openExteriorSortieModal, openMissionTask, openTaskList, showDialogue,
} from './hud/missionModals';
import { taskById } from './model';
import { showExamIntro, startExam } from './screens/examScreen';
import {
  showHabitat, showLaunch, showLobby, showResumeStaging, startLaunchSequence,
} from './screens/lobbyScreen';
import { showMenu } from './screens/menuScreen';
import {
  beginMission, completeMission, finishDay, renderReport, resumeTrial,
  showMissionShell, startDay, startLoop, startPlanning,
} from './screens/missionScreens';
import { showCredits, showOptions } from './screens/optionsScreen';
import { showSplash } from './screens/splashScreen';
import {
  handleTrainingInteract, renderTrainingHud, showStory, showTraining,
} from './screens/trainingScreen';
import { sfx } from './sfx';
import { confirmReplaceSavedTrial, showAbortMissionConfirmation } from './ui/confirmDialog';
import { mountAppFrame } from './ui/layout';
import { clearActiveModals } from './ui/modalController';
import { hidePhaserFallback, showPhaserFallback } from './ui/phaserFallback';

function onSceneFailure(message: string): void {
  const retry = (): void => {
    hidePhaserFallback();
    const targetScreen = session.currentScreen;
    resetStationGame();
    if (targetScreen === 'training') showTraining();
    else if (targetScreen === 'mission') {
      showMissionShell();
      configureScene({ respawn: true });
    } else showMenu();
  };
  const backToMenu = (): void => {
    hidePhaserFallback();
    resetStationGame();
    showMenu();
  };
  showPhaserFallback(message, retry, backToMenu);
}

registerRoutes({
  showSplash,
  showMenu,
  showStory,
  showTraining,
  renderTrainingHud,
  handleTrainingInteract,
  showExamIntro,
  startExam,
  showOptions,
  showCredits,
  showLobby,
  showResumeStaging,
  showHabitat,
  showLaunch,
  startLaunchSequence,
  beginMission,
  resumeTrial,
  showMissionShell,
  startDay,
  startPlanning,
  startLoop,
  finishDay,
  renderReport,
  completeMission,
  openMissionTask,
  openMap,
  openTaskList,
  openMissionLog,
  openHelp,
  updateHUD,
  updateActionButtons,
  syncHelmetButton,
  togglePlayerHelmet,
  toggleHudDrawer,
  setHudDrawer,
  updateRadarMarker,
  syncHudRoomText,
  showDialogue,
  openMinigameModal,
  startTutorial: () => false,
  dismissTutorial: () => {},
  showAbortMissionConfirmation,
  confirmReplaceSavedTrial,
  onSceneFailure,
});

function onGameEvent(event: GameEvent): void {
  if (event.type === 'load-progress') {
    session.sceneLoadProgress = event.progress;
    if (!session.sceneReady && (session.currentScreen === 'training' || session.currentScreen === 'mission')) {
      setSceneLoadingState(true, event.progress);
    }
    return;
  }
  if (event.type === 'ready') {
    hidePhaserFallback();
    session.sceneReady = true;
    session.sceneLoadProgress = 1;
    const finishReady = (): void => {
      requestAnimationFrame(() => setSceneLoadingState(false));
    };
    if (session.pendingScene) {
      const pending = session.pendingScene;
      session.pendingScene = null;
      if (session.game) {
        const activeGame = session.game;
        void import('./game').then(({ configureStationGame }) => {
          if (activeGame === session.game) configureStationGame(activeGame, pending.state, { respawn: pending.respawn });
          finishReady();
        });
        return;
      }
    }
    configureScene({ onConfigured: finishReady });
    if (!session.game) finishReady();
    return;
  }
  if (event.type === 'error') {
    onSceneFailure(event.message);
    return;
  }
  if (session.currentScreen !== 'mission' && session.currentScreen !== 'training') return;

  if (event.type === 'move') {
    if (session.currentScreen === 'training') {
      session.training.x = event.x;
      session.training.y = event.y;
      if (session.training.room !== event.room) {
        session.training.room = event.room;
        const roomEl = document.querySelector<HTMLElement>('#training-room');
        if (roomEl) roomEl.textContent = event.room.toUpperCase();
        if (session.manualHelmetOverride === null) configureScene();
        syncHelmetButton();
      }
    } else {
      session.mission.playerX = event.x;
      session.mission.playerY = event.y;
      updateRadarMarker(event.x, event.y);
      if (session.mission.room !== event.room) {
        session.mission.room = event.room;
        syncHudRoomText(event.room);
        if (session.manualHelmetOverride === null) configureScene();
        syncHelmetButton();
      } else {
        syncEvaHazardState();
      }
    }
    return;
  }

  if (event.type === 'prompt') {
    session.currentPrompt = {
      id: event.interactionId,
      name: event.name,
      kind: event.kind,
      room: event.room,
    };
    if (session.currentScreen === 'training') {
      const roomChanged = session.training.room !== event.room;
      session.training.room = event.room;
      const roomEl = document.querySelector<HTMLElement>('#training-room');
      if (roomEl) roomEl.textContent = event.room.toUpperCase();
      if (roomChanged) {
        if (session.manualHelmetOverride === null) configureScene();
        syncHelmetButton();
      }
    } else {
      const roomChanged = session.mission.room !== event.room;
      session.mission.room = event.room;
      updateHUD();
      if (roomChanged) {
        if (session.manualHelmetOverride === null) configureScene();
        syncHelmetButton();
      }
    }
    updateActionButtons();
    return;
  }

  if (event.type === 'interact') {
    if (session.currentScreen === 'training') {
      handleTrainingInteract(event.interactionId);
    } else if (event.kind === 'exit' || event.interactionId === 'airlock-exit') {
      openExteriorSortieModal();
    } else {
      openMissionTask(event.interactionId);
    }
    return;
  }

  if (event.type === 'crew') {
    talkToCrew(event.crewId, event.name, event.lines);
    return;
  }

  if (event.type === 'route-blocked') {
    showToast('Auto-pilot stopped. Move clear of the wall and try again.');
    return;
  }

  if (event.type === 'fps') {
    if (!session.save.options.showFps) return;
    const text = `${event.fps} FPS`;
    const badge = session.currentScreen === 'training'
      ? document.querySelector<HTMLElement>('#training-fps')
      : document.querySelector<HTMLElement>('#hud-fps');
    if (badge && badge.textContent !== text) badge.textContent = text;
  }
}

function wireControls(): void {
  const { screenRoot, modalRoot } = dom();

  document.addEventListener('pointermove', (event) => {
    if (session.save.options.reducedMotion) return;
    if (session.currentScreen === 'training' || session.currentScreen === 'mission') return;
    const nx = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const ny = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    document.documentElement.style.setProperty('--parallax-x', nx.toFixed(3));
    document.documentElement.style.setProperty('--parallax-y', ny.toFixed(3));
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isMissionActive()) {
      pauseMissionForModal();
      saveTrialProgress();
    } else if (!document.hidden && session.currentScreen === 'mission' && session.mission.modalOpen && !modalRoot.childElementCount) {
      resumeMissionAfterModal();
    }
  });

  window.addEventListener('pagehide', () => {
    if (isMissionActive() && !document.hidden) saveTrialProgress();
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('dialog[open]')) return;
    if (event.key === 'Escape' && session.currentScreen === 'options') {
      (screenRoot.querySelector<HTMLButtonElement>('[data-game-return]')
        ?? screenRoot.querySelector<HTMLButtonElement>('[data-options-back]'))?.click();
      return;
    }
    if (target?.closest('input, textarea')) return;

    if (event.key === 'Enter' && (session.currentScreen === 'splash' || session.currentScreen === 'launch') && !target?.closest('button, a')) {
      const skipBtn = screenRoot.querySelector<HTMLButtonElement>('.intro-skip');
      if (skipBtn) {
        event.preventDefault();
        skipBtn.click();
        return;
      }
    }

    if (session.currentScreen === 'menu' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const items = Array.from(screenRoot.querySelectorAll<HTMLButtonElement>('.spud-center-nav .spud-menu-item'));
      if (items.length) {
        event.preventDefault();
        const activeIdx = items.findIndex((el) => el.classList.contains('is-active'));
        const nextIdx = event.key === 'ArrowDown'
          ? (activeIdx + 1) % items.length
          : (activeIdx <= 0 ? items.length - 1 : activeIdx - 1);
        items[nextIdx]?.focus();
        sfx.click();
      }
      return;
    }

    if (event.key === 'Escape') {
      if (session.rewinding || modalRoot.querySelector('.disaster-card')) return;
      if (modalRoot.childElementCount) {
        const close = modalRoot.querySelector<HTMLButtonElement>('[data-result-continue], [data-close]');
        if (close) close.click();
        else {
          clearActiveModals(modalRoot);
          resumeFromModal();
        }
      } else if (session.activeHudDrawer !== null) {
        sfx.click();
        setHudDrawer(null);
      }
      return;
    }

    if (session.currentScreen !== 'mission' && session.currentScreen !== 'training') return;
    if (session.currentScreen === 'mission' && !isMissionActive()) return;
    if (modalRoot.childElementCount || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;

    const key = event.key.toLowerCase();
    if (key === 'm') {
      event.preventDefault();
      openMap();
    } else if (key === 't' && session.currentScreen === 'mission') {
      event.preventDefault();
      openTaskList();
    } else if (key === 'v' && session.currentScreen === 'mission') {
      event.preventDefault();
      toggleHudDrawer('status');
    } else if (key === 'o' && session.currentScreen === 'mission') {
      event.preventDefault();
      showOptions();
    } else if (key === 'l' && session.currentScreen === 'mission') {
      event.preventDefault();
      openMissionLog();
    } else if (key === 'g') {
      event.preventDefault();
      togglePlayerHelmet();
    } else if (key === '?' || key === 'h') {
      event.preventDefault();
      openHelp();
    }
  });

  document.querySelector('[data-action="helmet"]')?.addEventListener('click', () => {
    if (!isMissionActive() && session.currentScreen !== 'training') return;
    togglePlayerHelmet();
  });
  document.querySelector('[data-action="map"]')?.addEventListener('click', () => {
    sfx.click();
    openMap();
  });
  document.querySelector('[data-action="options"]')?.addEventListener('click', () => {
    if (!isMissionActive() || session.mission.modalOpen || session.rewinding) return;
    sfx.click();
    showOptions();
  });
  document.querySelector('[data-action="tasks"]')?.addEventListener('click', () => {
    sfx.click();
    openTaskList();
  });
  document.querySelector('[data-action="status"]')?.addEventListener('click', () => {
    toggleHudDrawer('status');
  });
  document.querySelector('#hud-drawer-backdrop')?.addEventListener('click', () => {
    if (session.activeHudDrawer === null) return;
    sfx.click();
    setHudDrawer(null);
  });
  document.querySelectorAll('[data-drawer-close]').forEach((btn) => btn.addEventListener('click', () => {
    sfx.click();
    setHudDrawer(null);
  }));
  dom().hud.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-drawer-walk-task]');
    const taskId = target?.dataset.drawerWalkTask;
    if (!taskId || !isMissionActive() || session.mission.modalOpen || session.rewinding) return;
    const task = taskById(taskId);
    if (!task) return;
    sfx.click();
    setHudDrawer(null);
    walkStationTo(task.x, task.y, task.name);
  });
  document.querySelector('[data-action="log"]')?.addEventListener('click', () => {
    sfx.click();
    openMissionLog();
  });
  document.querySelector('[data-action="help"]')?.addEventListener('click', () => {
    sfx.click();
    openHelp();
  });
  document.querySelector('[data-action="use"]')?.addEventListener('click', () => {
    if (!session.currentPrompt.id) return;
    sfx.click();
    if (session.currentScreen === 'training') handleTrainingInteract(session.currentPrompt.id);
    else interactActiveStation();
  });

  const unlockAudio = (): void => {
    if (session.currentScreen === 'splash' || session.currentScreen === 'mission' || session.currentScreen === 'training') return;
    if (session.save.options.music) startMusic();
    document.removeEventListener('pointerdown', unlockAudio);
  };
  document.addEventListener('pointerdown', unlockAudio);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {});
}

mountAppFrame();
setGameEventHandler(onGameEvent);
applyOptions();
wireControls();
showSplash();
