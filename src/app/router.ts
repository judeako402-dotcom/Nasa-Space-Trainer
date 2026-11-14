import type { MissionMetric, TaskKind } from '../model';

export interface ScreenRoutes {
  showSplash(): void;
  showMenu(): void;
  showStory(index: number): void;
  showTraining(): void;
  renderTrainingHud(): void;
  handleTrainingInteract(interactionId: string): void;
  showExamIntro(): void;
  startExam(): void;
  showOptions(): void;
  showCredits(): void;
  showLobby(): void;
  showResumeStaging(): void;
  showHabitat(): void;
  showLaunch(): void;
  startLaunchSequence(): void;
  beginMission(): void;
  resumeTrial(): void;
  showMissionShell(): void;
  startDay(draft?: import('../model').SavedTrial['planning']): void;
  startPlanning(tutorialPreview?: boolean): void;
  startLoop(): void;
  finishDay(reason: string): void;
  renderReport(reason: string): void;
  completeMission(): void;
  openMissionTask(taskId: string): void;
  openMap(): void;
  openTaskList(): void;
  openMissionLog(): void;
  openHelp(): void;
  updateHUD(): void;
  updateActionButtons(): void;
  syncHelmetButton(): void;
  togglePlayerHelmet(): void;
  toggleHudDrawer(mode: 'tasks' | 'status'): void;
  setHudDrawer(mode: 'tasks' | 'status' | null): void;
  updateRadarMarker(x?: number, y?: number): void;
  syncHudRoomText(room: string): void;
  showDialogue(options: {
    speaker: string;
    role: string;
    art: string;
    accent: string;
    lines: string[];
    onClose?: () => void;
  }): void;
  openMinigameModal(options: {
    eyebrow: string;
    title: string;
    kind: TaskKind;
    system?: MissionMetric;
    tip?: string;
    onClose: () => void;
    onComplete: () => void;
  }): void;
  startTutorial(options?: { force?: boolean; beforePlanning?: boolean }): boolean;
  dismissTutorial(markComplete?: boolean): void;
  showAbortMissionConfirmation(): void;
  confirmReplaceSavedTrial(opts: {
    title: string;
    description: string;
    confirmLabel: string;
    confirmIcon?: import('../ui/icons').ConstellationIconId;
    variant?: 'primary' | 'danger';
    onConfirm: () => void;
  }): void;
  onSceneFailure(message: string): void;
}

const uninitialized = (): never => {
  throw new Error('Application routes have not been registered yet.');
};

export const routes: ScreenRoutes = {
  showSplash: uninitialized,
  showMenu: uninitialized,
  showStory: uninitialized,
  showTraining: uninitialized,
  renderTrainingHud: uninitialized,
  handleTrainingInteract: uninitialized,
  showExamIntro: uninitialized,
  startExam: uninitialized,
  showOptions: uninitialized,
  showCredits: uninitialized,
  showLobby: uninitialized,
  showResumeStaging: uninitialized,
  showHabitat: uninitialized,
  showLaunch: uninitialized,
  startLaunchSequence: uninitialized,
  beginMission: uninitialized,
  resumeTrial: uninitialized,
  showMissionShell: uninitialized,
  startDay: uninitialized,
  startPlanning: uninitialized,
  startLoop: uninitialized,
  finishDay: uninitialized,
  renderReport: uninitialized,
  completeMission: uninitialized,
  openMissionTask: uninitialized,
  openMap: uninitialized,
  openTaskList: uninitialized,
  openMissionLog: uninitialized,
  openHelp: uninitialized,
  updateHUD: uninitialized,
  updateActionButtons: uninitialized,
  syncHelmetButton: uninitialized,
  togglePlayerHelmet: uninitialized,
  toggleHudDrawer: uninitialized,
  setHudDrawer: uninitialized,
  updateRadarMarker: uninitialized,
  syncHudRoomText: uninitialized,
  showDialogue: uninitialized,
  openMinigameModal: uninitialized,
  startTutorial: uninitialized,
  dismissTutorial: uninitialized,
  showAbortMissionConfirmation: uninitialized,
  confirmReplaceSavedTrial: uninitialized,
  onSceneFailure: uninitialized,
};

export function registerRoutes(impl: ScreenRoutes): void {
  Object.assign(routes, impl);
}
