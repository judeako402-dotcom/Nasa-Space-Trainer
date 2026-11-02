import Phaser from 'phaser';
import { configureStationGame, createStationGame } from './game';
import type { GameEvent, SceneGameState } from './game';
import {
  CORRIDORS, DEFAULT_LOBBY, DESTINATIONS, DIFFICULTY_INFO, EXAM_PASS_RATIO, EXAM_QUESTION_COUNT,
  EXAM_QUESTIONS, PLAYER_COLORS, PLAYER_SPAWN, PENALTY_MAX_DAY, ROOMS,
  SPECIALISTS, TASKS, TASK_RANGE, TRIAL_MAX_DAY, WORLD_HEIGHT, WORLD_WIDTH,
  destinationById, getColor, getRoomName, loadSave, persistSave, shuffle, specialistById, taskById,
} from './model';
import type {
  DestinationId, DifficultyId, EarthProgressReport, ExamQuestion, GamePhase, LobbySettings,
  MissionMetrics, PlayerColorId, PlayerSave, SavedTrial, SpecialistId, TrialProgress,
} from './model';
import { renderTaskGame } from './minigames';
import { configureSfx, sfx } from './sfx';
import './style.css';

type ScreenId = 'splash' | 'menu' | 'options' | 'story' | 'exam' | 'remedial' | 'graduation' | 'lobby';
interface MissionState extends TrialProgress {
  phase: GamePhase;
  dayStartedAt: number;
  pausedDuration: number;
  pauseStartedAt: number;
  tasks: string[];
  completed: string[];
  playerX: number;
  playerY: number;
  room: string;
  report: EarthProgressReport | null;
  reports: EarthProgressReport[];
  modalOpen: boolean;
}

interface ExamState {
  questions: ExamQuestion[];
  index: number;
  score: number;
  selected: number[];
  submitted: boolean;
  missed: ExamQuestion[];
}

interface StoryPanel {
  kicker: string;
  title: string;
  body: string;
  note: string;
  art: string;
}

const STORY: StoryPanel[] = [
  {
    kicker: 'YEAR 3042 · EARTH',
    title: 'The planet is drowning in potatoes.',
    body: "Earth's soil has given its last harvest. Overfarming has left the planet buried under mountains of potatoes. The Spudnaut Space Agency has one daring plan: find a new home.",
    note: 'The Great Starch Migration has begun.',
    art: '/assets/hexabyte-splash.jpg',
  },
  {
    kicker: 'THE GREAT STARCH MIGRATION',
    title: 'Ten elite tubers. One impossible mission.',
    body: 'A small crew will travel to the Moon or Mars to test whether a potato habitat can survive. You are the newest recruit, and every day of the trial counts.',
    note: 'Your work will keep the whole crew alive.',
    art: '/assets/potato-traveller.png',
  },
  {
    kicker: 'ORBITAL HUB · TRAINING DECK',
    title: 'Report to Commander Russet.',
    body: 'Commander Russet and the station AI, S.P.U.D.I.E., will put your training to the test before launch.',
    note: 'Pass your certification exam to earn a seat on the mission.',
    art: '/assets/potato-repairman.png',
  },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root element.');

let save: PlayerSave = loadSave();
let lobby: LobbySettings = {
  ...DEFAULT_LOBBY,
  playerName: save.name,
  colorId: save.colorId,
  specialist: save.specialist,
  destination: save.destination,
};
let currentScreen: ScreenId = 'splash';
let exam: ExamState = { questions: [], index: 0, score: 0, selected: [], submitted: false, missed: [] };
let remediationIndex = 0;
let mission: MissionState = freshMission();
let game: Phaser.Game | null = null;
let sceneReady = false;
let pendingScene: SceneGameState | null = null;
let loopTimer = 0;
let splashTimer = 0;
let launchTimer = 0;
let currentTaskPrompt: { id: string | null; name: string; room: string } = { id: null, name: '', room: 'Cafeteria' };

app.innerHTML = `
  <div class="game-frame">
    <main class="screen-root" id="screen-root"></main>
    <div class="scene-shell" id="scene-shell" hidden>
      <div id="game-canvas" class="game-canvas"></div>
      <div class="scene-vignette" aria-hidden="true"></div>
      <div class="hud" id="hud" hidden>
        <div class="hud-top-left">
          <div class="trial-day-pill" id="trial-day">DAY 01 / 30</div>
          <div class="task-meter" aria-live="polite">
            <span class="task-meter-label" id="task-label">TODAY 0 / 1</span>
            <span class="task-meter-track"><span id="task-fill"></span></span>
          </div>
          <span class="alive-pill" id="crew-progress">CREW TRIAL</span>
        </div>
        <div class="hud-top-right">
          <button class="hud-square" data-action="map" title="Station map (M)">MAP</button>
          <button class="hud-square" data-action="tasks" title="Today's assignments">TASKS</button>
          <button class="hud-square" data-action="help" title="Controls">?</button>
        </div>
        <div class="hud-bottom-left">
          <span class="id-swatch" id="hud-color-dot"></span>
          <div class="id-copy">
            <strong id="hud-player-name">SPUDNAUT</strong>
            <small id="hud-player-meta">SPECIALIST · DESTINATION</small>
            <span id="hud-room">CAFETERIA</span>
          </div>
        </div>
        <div class="action-cluster"><span class="interaction-prompt" id="interaction-prompt" aria-live="polite"></span><button class="action-button use" data-action="use" hidden>USE TASK <small>E</small></button></div>
        <div class="day-clock" id="day-clock"></div>
        <div class="toast" id="toast" role="status"></div>
      </div>
    </div>
    <div class="overlay-root" id="overlay-root"></div>
    <div class="modal-root" id="modal-root"></div>
  </div>
`;

const screenRoot = document.querySelector<HTMLDivElement>('#screen-root')!;
const sceneShell = document.querySelector<HTMLDivElement>('#scene-shell')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const overlayRoot = document.querySelector<HTMLDivElement>('#overlay-root')!;
const modalRoot = document.querySelector<HTMLDivElement>('#modal-root')!;

function freshMission(): MissionState {
  return {
    phase: 'menu',
    day: 1,
    penaltyDay: 0,
    totalAssigned: 0,
    totalCompleted: 0,
    missedDays: 0,
    metrics: { oxygen: 100, starch: 100, morale: 100, research: 0 },
    dayStartedAt: 0,
    pausedDuration: 0,
    pauseStartedAt: 0,
    tasks: [],
    completed: [],
    playerX: PLAYER_SPAWN.x,
    playerY: PLAYER_SPAWN.y,
    room: 'Cafeteria',
    report: null,
    reports: [],
    modalOpen: false,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function setScreen(screen: ScreenId, markup: string): void {
  currentScreen = screen;
  stopLoop();
  window.clearTimeout(splashTimer);
  window.clearTimeout(launchTimer);
  overlayRoot.replaceChildren();
  modalRoot.replaceChildren();
  sceneShell.hidden = true;
  hud.hidden = true;
  screenRoot.hidden = false;
  screenRoot.innerHTML = markup;
  document.body.dataset.screen = screen;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function showSplash(): void {
  setScreen('splash', `
    <section class="screen-splash" id="splash-screen">
      <img class="splash-art" src="/assets/hexabyte-splash.jpg" alt="Potato crew preparing for a space mission" />
      <div class="splash-shade"></div>
      <div class="splash-bottom">
        <div class="splash-studio"><span>HEXABYTE</span><small>INTERACTIVE</small></div>
        <div class="splash-loading"><span>LOADING SPUD SYSTEMS</span><div class="splash-track"><i></i></div></div>
        <span class="splash-skip">TAP ANYWHERE TO CONTINUE</span>
      </div>
    </section>
  `);
  screenRoot.querySelector('#splash-screen')?.addEventListener('click', showMenu, { once: true });
  splashTimer = window.setTimeout(() => {
    if (currentScreen === 'splash') showMenu();
  }, 2600);
}

function showMenu(): void {
  const destination = destinationById(save.destination);
  setScreen('menu', `
    <section class="screen-menu">
      <img class="menu-bg" src="/assets/hexabyte-splash.jpg" alt="" />
      <div class="menu-veil"></div><div class="menu-grain" aria-hidden="true"></div>
      <header class="menu-brandbar">
        <div class="hexa-badge"><span>HEXABYTE</span><small>INTERACTIVE</small></div>
        <div class="menu-brand-stats"><span>${save.games} TRIALS</span><span>${save.wins} RETURNS</span><span class="cert-dot ${save.certified ? 'on' : ''}">${save.certified ? 'CERTIFIED' : 'CADET'}</span></div>
      </header>
      <div class="menu-content">
        <div class="menu-copy">
          <span class="eyebrow">A HEXABYTE INTERACTIVE PRODUCTION · YEAR 3042</span>
          <h1 class="spud-logo"><span class="spud-logo-main">SPUDNAUT</span><span class="spud-logo-sub">THE GREAT STARCH MIGRATION</span></h1>
          <p class="menu-blurb">Thirty days. One crew. Keep the habitat alive and send Earth a progress report every day.</p>
          <div class="menu-actions">
            <button class="menu-button primary" data-menu="start"><span class="menu-key">01</span><span class="menu-button-copy"><strong>${save.activeTrial ? 'RESUME TRIAL' : 'START TRIAL'}</strong><small>${save.activeTrial ? `Continue at mission day ${save.activeTrial.penaltyDay ? TRIAL_MAX_DAY + save.activeTrial.penaltyDay : save.activeTrial.day}` : save.certified ? 'Choose your destination' : 'Begin Earth training'}</small></span><i>→</i></button>
            <button class="menu-button" data-menu="options"><span class="menu-key">02</span><span class="menu-button-copy"><strong>OPTIONS</strong><small>Sound · difficulty · accessibility</small></span><i>→</i></button>
            <button class="menu-button" data-menu="credits"><span class="menu-key">03</span><span class="menu-button-copy"><strong>MISSION BRIEF</strong><small>How the 30-day trial works</small></span><i>→</i></button>
          </div>
          <div class="menu-save-row"><span><b>${specialistById(save.specialist).name}</b> specialist</span><span><b>${destination.name}</b> destination</span><span><b>${save.examBest}%</b> exam best</span></div>
        </div>
        <div class="menu-crew" aria-hidden="true"><div class="menu-speech">Thirty days.<br>One crew.</div><img class="menu-potato small left" src="/assets/potato-researcher.png" alt="" /><img class="menu-potato large" src="/assets/potato-traveller.png" alt="" /><img class="menu-potato small right" src="/assets/potato-repairman.png" alt="" /></div>
      </div>
      <footer class="menu-footer"><span>SPUDNAUT SPACE AGENCY · EARTH TRAINING FACILITY</span><span>THE GREAT STARCH MIGRATION</span></footer>
    </section>
  `);
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach(button => button.addEventListener('click', () => {
    sfx.click();
    switch (button.dataset.menu) {
      case 'start':
        if (save.activeTrial) resumeTrial();
        else if (save.certified) showLobby();
        else showStory(0);
        break;
      case 'options': showOptions(); break;
      case 'credits': showBrief(); break;
    }
  }));
}

function showBrief(): void {
  setScreen('options', `
    <section class="screen-simple report-screen">
      <div class="space-backdrop"></div><header class="simple-header"><button class="back-button" data-back>← MENU</button><div><span class="eyebrow">S.P.U.D.I.E. · MISSION BRIEF</span><h1>THE 30-DAY TRIAL</h1></div></header>
      <article class="brief-card">
        <p>Work together to keep oxygen, starch integrity, crew morale, and research on track. Each day brings a station assignment; complete it, then send Earth a progress report.</p>
        <div class="brief-steps"><span>01 · TRAIN</span><span>02 · LAUNCH</span><span>03 · COMPLETE 30 DAYS</span><span>04 · RETURN HOME</span></div>
        <p>Miss too many assignments and the crew receives a 15-day penalty extension. There are no impostors, eliminations, or votes—your crew succeeds or fails together.</p>
        <button class="primary-button" data-back>UNDERSTOOD →</button>
      </article>
    </section>
  `);
  screenRoot.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', showMenu));
}

function showOptions(): void {
  const difficulty = save.options.difficulty;
  setScreen('options', `
    <section class="screen-simple options-screen">
      <div class="space-backdrop"></div><header class="simple-header"><button class="back-button" data-options-back>← BACK</button><div><span class="eyebrow">HEXABYTE · SYSTEM CONFIG</span><h1>OPTIONS</h1></div></header>
      <div class="options-grid">
        <section class="options-card"><span class="card-kicker">CREW COMFORT</span><h2>Audio & accessibility</h2>
          <button class="setting-row" data-toggle-sound aria-pressed="${save.options.sound}"><span><strong>Sound effects</strong><small>Alerts, feedback, and launch audio</small></span><span class="toggle ${save.options.sound ? 'on' : ''}"><i></i></span></button>
          <label class="setting-row slider-row"><span><strong>Master volume</strong><small>${save.options.volume}%</small></span><input type="range" min="0" max="100" step="5" value="${save.options.volume}" id="volume-control" /></label>
          <button class="setting-row" data-toggle-motion aria-pressed="${save.options.reducedMotion}"><span><strong>Reduce motion</strong><small>Calmer menus and overlays</small></span><span class="toggle ${save.options.reducedMotion ? 'on' : ''}"><i></i></span></button>
        </section>
        <section class="options-card"><span class="card-kicker">MISSION PRESSURE</span><h2>Difficulty</h2><div class="difficulty-list">${(Object.keys(DIFFICULTY_INFO) as DifficultyId[]).map(id => `<button class="difficulty-card ${difficulty === id ? 'selected' : ''}" data-difficulty="${id}"><span class="difficulty-mark">${id === 'cadet' ? 'I' : id === 'crew' ? 'II' : 'III'}</span><span><strong>${DIFFICULTY_INFO[id].name}</strong><small>${DIFFICULTY_INFO[id].description}</small></span></button>`).join('')}</div></section>
      </div>
    </section>
  `);
  screenRoot.querySelector('[data-options-back]')?.addEventListener('click', showMenu);
  screenRoot.querySelector('[data-toggle-sound]')?.addEventListener('click', () => {
    save.options.sound = !save.options.sound;
    saveSettings();
    showOptions();
  });
  screenRoot.querySelector('[data-toggle-motion]')?.addEventListener('click', () => {
    save.options.reducedMotion = !save.options.reducedMotion;
    saveSettings();
    showOptions();
  });
  screenRoot.querySelector<HTMLInputElement>('#volume-control')?.addEventListener('input', event => {
    save.options.volume = Number((event.currentTarget as HTMLInputElement).value);
    saveSettings();
    const small = screenRoot.querySelector('.slider-row small');
    if (small) small.textContent = `${save.options.volume}%`;
  });
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.difficulty as DifficultyId | undefined;
    if (next && next in DIFFICULTY_INFO) save.options.difficulty = next;
    saveSettings();
    showOptions();
  }));
}

function saveSettings(): void {
  persistSave(save);
  configureSfx({ enabled: save.options.sound, volume: save.options.volume });
  document.body.classList.toggle('reduce-motion', save.options.reducedMotion);
}

function showStory(index: number): void {
  const panel = STORY[index];
  if (!panel) {
    showExamIntro();
    return;
  }
  setScreen('story', `
    <section class="screen-simple story-screen"><div class="space-backdrop"></div>
      <div class="story-layout"><div class="story-copy"><span class="eyebrow">${panel.kicker}</span><h1>${panel.title}</h1><p>${panel.body}</p><p class="story-note">${panel.note}</p>
        <div class="story-controls"><button class="secondary-button" data-story-back>← MENU</button><span>${String(index + 1).padStart(2, '0')} / ${String(STORY.length).padStart(2, '0')}</span><button class="primary-button" data-story-next>${index === STORY.length - 1 ? 'BEGIN EXAM' : 'CONTINUE →'}</button></div>
      </div><div class="story-art"><img src="${panel.art}" alt="" /></div></div>
    </section>
  `);
  screenRoot.querySelector('[data-story-back]')?.addEventListener('click', showMenu);
  screenRoot.querySelector('[data-story-next]')?.addEventListener('click', () => {
    sfx.click();
    if (index + 1 < STORY.length) showStory(index + 1);
    else showExamIntro();
  });
}

function showExamIntro(): void {
  setScreen('exam', `
    <section class="screen-simple exam-screen"><div class="space-backdrop"></div><div class="exam-intro-card">
      <span class="eyebrow">EARTH TRAINING FACILITY · CERTIFICATION</span><h1>THE SPUD EXAM</h1><p>Eight questions on pressure, life support, tools, farming, and crew safety. Score at least ${Math.round(EXAM_PASS_RATIO * 100)}% to earn your flight certification.</p>
      <button class="primary-button" data-exam-start>TAKE THE EXAM →</button>
    </div></section>
  `);
  screenRoot.querySelector('[data-exam-start]')?.addEventListener('click', startExam);
}

function startExam(): void {
  exam = { questions: shuffle(EXAM_QUESTIONS).slice(0, EXAM_QUESTION_COUNT), index: 0, score: 0, selected: [], submitted: false, missed: [] };
  renderExamQuestion();
}

function renderExamQuestion(): void {
  const question = exam.questions[exam.index];
  if (!question) {
    finishExam();
    return;
  }
  setScreen('exam', `
    <section class="screen-simple exam-screen"><div class="space-backdrop"></div><div class="exam-card">
      <div class="exam-top"><span class="eyebrow">${escapeHtml(question.topic)} · QUESTION ${exam.index + 1} / ${exam.questions.length}</span><span class="exam-score">SCORE ${exam.score}</span></div>
      <div class="exam-progress"><i style="width:${(exam.index / exam.questions.length) * 100}%"></i></div>
      <h1>${escapeHtml(question.prompt)}</h1><p class="exam-instruction">${question.correct.length > 1 ? 'Select every correct answer.' : 'Select one answer.'}</p>
      <div class="exam-options">${question.options.map((option, index) => `<button class="exam-option ${exam.selected.includes(index) ? 'selected' : ''}" data-exam-option="${index}" ${exam.submitted ? 'disabled' : ''}><span>${String.fromCharCode(65 + index)}</span>${escapeHtml(option)}</button>`).join('')}</div>
      <div class="exam-feedback" ${exam.submitted ? '' : 'hidden'}><strong>${exam.missed.includes(question) ? 'NOT QUITE' : 'CORRECT'}</strong><p>${escapeHtml(question.explanation)}</p></div>
      <footer class="exam-footer"><button class="secondary-button" data-exam-exit>EXIT</button><button class="primary-button" data-exam-submit>${exam.submitted ? (exam.index + 1 === exam.questions.length ? 'SEE RESULT' : 'NEXT QUESTION →') : 'SUBMIT ANSWER'}</button></footer>
    </div></section>
  `);
  screenRoot.querySelector('[data-exam-exit]')?.addEventListener('click', showMenu);
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-exam-option]').forEach(button => button.addEventListener('click', () => {
    if (exam.submitted) return;
    const option = Number(button.dataset.examOption);
    if (!Number.isInteger(option)) return;
    if (question.correct.length === 1) exam.selected = [option];
    else exam.selected = exam.selected.includes(option) ? exam.selected.filter(item => item !== option) : [...exam.selected, option];
    renderExamQuestion();
  }));
  screenRoot.querySelector('[data-exam-submit]')?.addEventListener('click', () => {
    if (exam.submitted) {
      exam.index += 1;
      exam.selected = [];
      exam.submitted = false;
      renderExamQuestion();
      return;
    }
    if (!exam.selected.length) {
      showToast('Choose an answer before submitting.');
      return;
    }
    const correct = [...exam.selected].sort().join(',') === [...question.correct].sort().join(',');
    exam.submitted = true;
    if (correct) exam.score += 1;
    else exam.missed.push(question);
    if (correct) sfx.correct();
    else sfx.wrong();
    renderExamQuestion();
  });
}

function finishExam(): void {
  const percentage = Math.round((exam.score / exam.questions.length) * 100);
  save.examBest = Math.max(save.examBest, percentage);
  save.certified = percentage >= EXAM_PASS_RATIO * 100;
  saveSettings();
  if (save.certified) {
    setScreen('graduation', `
      <section class="screen-simple graduation-screen"><div class="space-backdrop"></div><div class="graduation-card"><span class="eyebrow">CERTIFICATION RESULT · ${percentage}%</span><h1>FLIGHT APPROVED</h1><p>S.P.U.D.I.E. has certified you for the 30-day cooperative habitat trial.</p><div class="diploma-seal">✦<small>SPUDNAUT</small></div><button class="primary-button" data-graduate>CHOOSE YOUR MISSION →</button></div></section>
    `);
    screenRoot.querySelector('[data-graduate]')?.addEventListener('click', showLobby);
  } else {
    remediationIndex = 0;
    showRemedial();
  }
}

function showRemedial(): void {
  const lessons = exam.missed.length ? exam.missed : exam.questions;
  const question = lessons[remediationIndex % lessons.length];
  if (!question) return showExamIntro();
  setScreen('remedial', `
    <section class="screen-simple remedial-screen"><div class="space-backdrop"></div><article class="remedial-card">
      <span class="eyebrow">REMEDIAL SPUD ACADEMY · ${remediationIndex + 1} / ${lessons.length}</span><h1>REVIEW: ${escapeHtml(question.topic.toUpperCase())}</h1><p>${escapeHtml(question.lesson)}</p>
      <div class="lesson-check"><strong>THE QUESTION</strong><p>${escapeHtml(question.prompt)}</p><span>Correct answer${question.correct.length > 1 ? 's' : ''}: ${question.correct.map(index => question.options[index]).map(escapeHtml).join(' · ')}</span></div>
      <footer><button class="secondary-button" data-remedial-next>NEXT LESSON</button><button class="primary-button" data-retake>RETAKE EXAM →</button></footer>
    </article></section>
  `);
  screenRoot.querySelector('[data-remedial-next]')?.addEventListener('click', () => {
    remediationIndex = (remediationIndex + 1) % lessons.length;
    showRemedial();
  });
  screenRoot.querySelector('[data-retake]')?.addEventListener('click', startExam);
}

function showLobby(): void {
  setScreen('lobby', `
    <section class="screen-simple lobby-screen"><div class="space-backdrop"></div><header class="simple-header"><button class="back-button" data-lobby-back>← MENU</button><div><span class="eyebrow">SPUDNAUT SPACE AGENCY · MISSION SELECT</span><h1>PREPARE YOUR CREW</h1></div></header>
      <div class="lobby-grid">
        <section class="lobby-card crew-card"><span class="card-kicker">YOUR CREW ID</span><label class="field-label">CALLSIGN<input id="player-name" maxlength="14" value="${escapeHtml(lobby.playerName)}" /></label><div class="color-picker"><span class="field-label">SUIT COLOR</span><div>${PLAYER_COLORS.map(color => `<button class="color-swatch ${lobby.colorId === color.id ? 'selected' : ''}" data-color="${color.id}" style="--swatch:${color.css}" aria-label="${color.name}" title="${color.name}"></button>`).join('')}</div></div><span class="card-kicker">SPECIALIST</span><div class="specialist-list">${SPECIALISTS.map(item => `<button class="specialist-card ${lobby.specialist === item.id ? 'selected' : ''}" data-specialist="${item.id}"><img src="${item.art}" alt="" /><span><strong>${item.name}</strong><small>${item.role} · ${item.perk}</small></span></button>`).join('')}</div></section>
        <section class="lobby-card destination-card"><span class="card-kicker">MISSION DESTINATION</span><div class="destination-list">${DESTINATIONS.map(item => `<button class="destination-option ${lobby.destination === item.id ? 'selected' : ''}" data-destination="${item.id}" style="--destination-accent:${item.accent}"><strong>${item.name}</strong><span>${item.tagline}</span><small>${item.description}</small><b>${item.gravity} · ${item.hazard}</b></button>`).join('')}</div><div class="mission-callout"><span>TRIAL LENGTH</span><strong>30 DAYS</strong><small>Cooperative crew survival assessment</small></div><button class="primary-button start-mission" id="start-game">BEGIN LAUNCH SEQUENCE →</button></section>
      </div>
    </section>
  `);
  screenRoot.querySelector('[data-lobby-back]')?.addEventListener('click', showMenu);
  screenRoot.querySelector<HTMLInputElement>('#player-name')?.addEventListener('input', event => {
    lobby.playerName = (event.currentTarget as HTMLInputElement).value.slice(0, 14);
  });
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => button.addEventListener('click', () => {
    const color = button.dataset.color as PlayerColorId | undefined;
    if (color && PLAYER_COLORS.some(item => item.id === color)) lobby.colorId = color;
    showLobby();
  }));
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-specialist]').forEach(button => button.addEventListener('click', () => {
    const specialist = button.dataset.specialist as SpecialistId | undefined;
    if (specialist && SPECIALISTS.some(item => item.id === specialist)) lobby.specialist = specialist;
    showLobby();
  }));
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-destination]').forEach(button => button.addEventListener('click', () => {
    const destination = button.dataset.destination as DestinationId | undefined;
    if (destination && DESTINATIONS.some(item => item.id === destination)) lobby.destination = destination;
    showLobby();
  }));
  screenRoot.querySelector('#start-game')?.addEventListener('click', beginMission);
}

function beginMission(): void {
  save.name = lobby.playerName.trim() || 'Spudnaut';
  save.colorId = lobby.colorId;
  save.specialist = lobby.specialist;
  save.destination = lobby.destination;
  mission = freshMission();
  mission.phase = 'launch';
  save.activeTrial = null;
  persistSave(save);
  sceneShell.hidden = false;
  screenRoot.hidden = true;
  hud.hidden = true;
  document.body.dataset.screen = 'game';
  saveTrialProgress();
  if (!game) {
    game = createStationGame(document.querySelector<HTMLDivElement>('#game-canvas')!, onGameEvent);
  }
  configureScene();
  overlayRoot.innerHTML = `
    <section class="launch-screen cooperative-launch">
      <div class="launch-stars" aria-hidden="true">${Array.from({ length: 28 }, (_, index) => `<i style="--x:${(index * 41) % 100}%;--delay:${(index % 8) * 0.12}s"></i>`).join('')}</div>
      <div class="launch-copy"><span class="eyebrow">LAUNCH SEQUENCE · PAD 07</span><h1>LEAVING<br><span>EARTH ORBIT</span></h1><p>The Spud is cleared for ${destinationById(missionDestination()).name}. Your 30-day habitat trial starts at touchdown.</p><div class="launch-readout"><span>T-MINUS</span><strong id="launch-count">03</strong><small>CREW SYSTEMS NOMINAL</small></div></div>
      <div class="launch-rocket" aria-hidden="true"><div class="rocket-body"><span>SPUD</span><i></i></div><div class="rocket-fin left"></div><div class="rocket-fin right"></div><div class="rocket-flame"></div></div>
      <button class="launch-skip" data-launch-skip>SKIP →</button>
    </section>
  `;
  sfx.launch();
  const interval = window.setInterval(() => {
    const count = document.querySelector<HTMLElement>('#launch-count');
    if (!count) return window.clearInterval(interval);
    count.textContent = String(Math.max(1, Number(count.textContent) - 1));
  }, 700);
  const land = (): void => {
    window.clearInterval(interval);
    window.clearTimeout(launchTimer);
    startDay();
  };
  overlayRoot.querySelector('[data-launch-skip]')?.addEventListener('click', land, { once: true });
  launchTimer = window.setTimeout(land, 2800);
}

function missionDestination(): DestinationId {
  return save.destination;
}

function resumeTrial(): void {
  const saved = save.activeTrial;
  if (!saved) {
    showLobby();
    return;
  }
  lobby = {
    playerName: save.name,
    colorId: save.colorId,
    specialist: save.specialist,
    destination: save.destination,
  };
  mission = {
    ...freshMission(),
    ...saved,
    playerX: PLAYER_SPAWN.x,
    playerY: PLAYER_SPAWN.y,
    room: 'Cafeteria',
    dayStartedAt: Date.now(),
    pausedDuration: 0,
    pauseStartedAt: 0,
    modalOpen: false,
  };
  showMissionShell();
  if (saved.phase === 'playing' && saved.tasks.length === 0) {
    startDay();
    return;
  }
  if (mission.phase === 'report') {
    hud.hidden = true;
    if (mission.report) renderEarthReport();
    else startDay();
    return;
  }
  mission.phase = mission.penaltyDay ? 'penalty' : 'playing';
  mission.completed = [...mission.completed];
  mission.tasks = [...mission.tasks];
  mission.dayStartedAt = Date.now();
  currentTaskPrompt = { id: null, name: '', room: mission.room };
  configureScene();
  hud.hidden = false;
  updateHUD();
  startLoop();
  showToast(`Trial resumed · day ${missionDayNumber()}. Today's timer restarted.`);
}

function showMissionShell(): void {
  overlayRoot.replaceChildren();
  modalRoot.replaceChildren();
  sceneShell.hidden = false;
  screenRoot.hidden = true;
  document.body.dataset.screen = 'game';
  if (!game) game = createStationGame(document.querySelector<HTMLDivElement>('#game-canvas')!, onGameEvent);
}

function saveTrialProgress(): void {
  if (mission.phase === 'complete' || mission.phase === 'menu') return;
  const phase: SavedTrial['phase'] = mission.phase === 'report'
    ? 'report'
    : mission.penaltyDay > 0 ? 'penalty' : 'playing';
  save.activeTrial = {
    phase,
    day: mission.day,
    penaltyDay: mission.penaltyDay,
    tasks: [...mission.tasks],
    completed: [...mission.completed],
    totalAssigned: mission.totalAssigned,
    totalCompleted: mission.totalCompleted,
    missedDays: mission.missedDays,
    metrics: { ...mission.metrics },
    reports: mission.reports.map(report => ({ ...report })),
    report: mission.report ? { ...mission.report } : null,
  };
  save.trialDay = Math.max(save.trialDay, Math.min(TRIAL_MAX_DAY, mission.day));
  persistSave(save);
}

function startDay(): void {
  overlayRoot.replaceChildren();
  mission.phase = mission.penaltyDay > 0 ? 'penalty' : 'playing';
  mission.dayStartedAt = Date.now();
  mission.completed = [];
  mission.report = null;
  mission.room = 'Cafeteria';
  mission.playerX = PLAYER_SPAWN.x;
  mission.playerY = PLAYER_SPAWN.y;
  mission.pausedDuration = 0;
  mission.pauseStartedAt = 0;
  const taskCount = mission.penaltyDay > 0 ? 2 : 1;
  mission.tasks = shuffle(TASKS).slice(0, taskCount).map(task => task.id);
  mission.totalAssigned += mission.tasks.length;
  currentTaskPrompt = { id: null, name: '', room: mission.room };
  hud.hidden = false;
  configureScene();
  updateHUD();
  showToast(mission.penaltyDay ? `Penalty extension · day ${mission.penaltyDay} of ${PENALTY_MAX_DAY}.` : `Trial day ${mission.day} of ${TRIAL_MAX_DAY}.`);
  saveTrialProgress();
  startLoop();
}

function sceneState(): SceneGameState {
  const speed = lobby.specialist === 'traveller' ? 1.18 : 1;
  return {
    playerName: save.name,
    colorId: save.colorId,
    tasks: mission.tasks,
    tasksDone: mission.completed,
    x: mission.playerX,
    y: mission.playerY,
    speed,
    frozen: !isMissionActive() || mission.modalOpen,
  };
}

function isMissionActive(): boolean {
  return mission.phase === 'playing' || mission.phase === 'penalty';
}

function configureScene(): void {
  if (!game) return;
  const next = sceneState();
  if (!sceneReady) pendingScene = next;
  else configureStationGame(game, next);
}

function pauseMissionForModal(): void {
  if (!isMissionActive() || mission.modalOpen) return;
  mission.modalOpen = true;
  mission.pauseStartedAt = Date.now();
  configureScene();
  updateActionButtons();
}

function resumeMissionAfterModal(): void {
  if (!mission.modalOpen) return;
  mission.pausedDuration += Date.now() - mission.pauseStartedAt;
  mission.pauseStartedAt = 0;
  mission.modalOpen = false;
  configureScene();
  updateActionButtons();
}

function closeModal(): void {
  modalRoot.replaceChildren();
  resumeMissionAfterModal();
}

function onGameEvent(event: GameEvent): void {
  if (event.type === 'ready') {
    sceneReady = true;
    if (pendingScene && game) {
      configureStationGame(game, pendingScene);
      pendingScene = null;
    } else configureScene();
    return;
  }
  if (event.type === 'move') {
    mission.playerX = event.x;
    mission.playerY = event.y;
    mission.room = event.room;
    if (!currentTaskPrompt.id) currentTaskPrompt.room = event.room;
    updateHUD();
  } else if (event.type === 'prompt') {
    currentTaskPrompt = {
      id: event.taskId,
      name: event.taskName,
      room: event.taskId ? event.taskRoomName : event.roomName,
    };
    mission.room = event.roomName;
    updateHUD();
    updateActionButtons();
  } else if (event.type === 'task-open') {
    openTask(event.taskId);
  }
}

function openTask(taskId: string): void {
  const task = taskById(taskId);
  if (!task || !mission.tasks.includes(task.id) || mission.completed.includes(task.id)) return;
  if (!isMissionActive() || mission.modalOpen) return;
  if (Math.hypot(mission.playerX - task.x, mission.playerY - task.y) > TASK_RANGE + 4) return;
  pauseMissionForModal();
  configureScene();
  modalRoot.replaceChildren();
  const shade = document.createElement('div');
  shade.className = 'modal-shade';
  const box = document.createElement('section');
  box.className = 'modal-card task-card';
  box.innerHTML = `<div class="modal-head"><div><span class="eyebrow">DAY ${missionDayNumber()} · ${escapeHtml(getRoomName(task.roomId).toUpperCase())}</span><h2>${escapeHtml(task.name)}</h2></div><button class="modal-close" data-close aria-label="Close task">×</button></div><div class="task-body" id="task-body"></div>`;
  shade.append(box);
  modalRoot.append(shade);
  const cleanups: (() => void)[] = [];
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    cleanups.forEach(cleanup => cleanup());
    shade.remove();
    resumeMissionAfterModal();
  };
  box.querySelector('[data-close]')?.addEventListener('click', close);
  shade.addEventListener('click', event => {
    if (event.target === shade) close();
  });
  renderTaskGame(task.kind, box.querySelector<HTMLDivElement>('#task-body')!, () => {
    if (closed) return;
    close();
    completeTask(task);
  }, cleanups);
}

function completeTask(task: NonNullable<ReturnType<typeof taskById>>): void {
  if (!isMissionActive() || mission.completed.includes(task.id)) return;
  mission.completed.push(task.id);
  mission.totalCompleted += 1;
  const researchGain = lobby.specialist === 'researcher' ? 6 : 4;
  mission.metrics.research = Math.min(100, mission.metrics.research + researchGain);
  mission.metrics.starch = Math.min(100, mission.metrics.starch + (lobby.specialist === 'farmer' ? 4 : 2));
  if (task.kind === 'fuel' || task.kind === 'calibrate' || task.kind === 'wiring') {
    mission.metrics.oxygen = Math.min(100, mission.metrics.oxygen + (lobby.specialist === 'repairman' ? 4 : 2));
  }
  if (task.kind === 'inspect' || task.kind === 'download') mission.metrics.morale = Math.min(100, mission.metrics.morale + 2);
  sfx.complete();
  configureScene();
  updateHUD();
  saveTrialProgress();
  if (mission.completed.length === mission.tasks.length) finishDay('All daily assignments completed. Crew systems stable.');
  else showToast('Assignment complete. One more task remains today.');
}

function missionDayNumber(): number {
  return mission.penaltyDay > 0 ? TRIAL_MAX_DAY + mission.penaltyDay : mission.day;
}

function dayDurationMs(): number {
  const base = save.options.difficulty === 'cadet' ? 150000 : save.options.difficulty === 'veteran' ? 70000 : 100000;
  return mission.penaltyDay > 0 ? Math.round(base * 0.72) : base;
}

function startLoop(): void {
  stopLoop();
  loopTimer = window.setInterval(tickMission, 250);
}

function stopLoop(): void {
  window.clearInterval(loopTimer);
  loopTimer = 0;
}

function tickMission(): void {
  if (!isMissionActive()) return;
  const pausedNow = mission.modalOpen ? Date.now() - mission.pauseStartedAt : 0;
  const elapsed = Date.now() - mission.dayStartedAt - mission.pausedDuration - pausedNow;
  const remaining = Math.max(0, dayDurationMs() - elapsed);
  const clock = document.querySelector<HTMLElement>('#day-clock');
  if (clock) {
    clock.textContent = `${Math.ceil(remaining / 1000)}s`;
    clock.classList.toggle('urgent', remaining < 15000);
  }
  updateHUD();
  if (remaining <= 0) finishDay('Daily review reached before every assignment was complete.');
}

function finishDay(event: string): void {
  if (!isMissionActive()) return;
  stopLoop();
  const assigned = mission.tasks.length;
  const completed = mission.completed.length;
  if (completed < assigned) {
    mission.missedDays += 1;
    mission.metrics.oxygen = Math.max(0, mission.metrics.oxygen - 8);
    mission.metrics.starch = Math.max(0, mission.metrics.starch - (lobby.specialist === 'shield' ? 3 : 7));
    mission.metrics.morale = Math.max(0, mission.metrics.morale - 6);
  }
  mission.phase = 'report';
  mission.report = { day: missionDayNumber(), completed, assigned, event };
  mission.reports.push({ ...mission.report });
  hud.hidden = true;
  saveTrialProgress();
  configureScene();
  renderEarthReport();
}

function renderEarthReport(): void {
  const report = mission.report;
  if (!report) return;
  const trialComplete = mission.penaltyDay === 0 && mission.day >= TRIAL_MAX_DAY;
  const extensionComplete = mission.penaltyDay >= PENALTY_MAX_DAY;
  const completionRate = mission.totalAssigned ? mission.totalCompleted / mission.totalAssigned : 0;
  const passed = completionRate >= 0.75
    && mission.metrics.oxygen >= 50
    && mission.metrics.starch >= 50
    && mission.metrics.morale >= 45
    && mission.metrics.research >= 65;
  const finalReview = trialComplete || extensionComplete;
  const requirements = finalReview ? `
    <section class="report-requirements" aria-label="Certification requirements">
      <div class="${completionRate >= 0.75 ? 'met' : 'missed'}"><span>ASSIGNMENTS</span><strong>${Math.round(completionRate * 100)}% / 75%</strong></div>
      <div class="${mission.metrics.oxygen >= 50 ? 'met' : 'missed'}"><span>OXYGEN</span><strong>${Math.round(mission.metrics.oxygen)}% / 50%</strong></div>
      <div class="${mission.metrics.starch >= 50 ? 'met' : 'missed'}"><span>STARCH</span><strong>${Math.round(mission.metrics.starch)}% / 50%</strong></div>
      <div class="${mission.metrics.morale >= 45 ? 'met' : 'missed'}"><span>MORALE</span><strong>${Math.round(mission.metrics.morale)}% / 45%</strong></div>
      <div class="${mission.metrics.research >= 65 ? 'met' : 'missed'}"><span>RESEARCH</span><strong>${Math.round(mission.metrics.research)}% / 65%</strong></div>
    </section>
  ` : '';
  let action = 'ADVANCE TO NEXT DAY →';
  let actionKind = 'next-day';
  let title = `DAY ${report.day} · REPORT SENT`;
  let outcome = 'S.P.U.D.I.E. has transmitted the crew status packet to Earth. Continue the cooperative habitat trial.';
  if (trialComplete) {
    action = passed ? 'RETURN HOME →' : 'BEGIN 15-DAY PENALTY EXTENSION →';
    actionKind = passed ? 'return-home' : 'penalty';
    title = passed ? 'TRIAL PASSED' : 'PENALTY EXTENSION';
    outcome = passed
      ? 'Earth has reviewed all 30 reports. Your crew has proven the habitat can support life.'
      : 'The 30-day review needs more evidence. Commander Russet has authorized a 15-day extension.';
  } else if (extensionComplete) {
    action = 'RETURN TO EARTH →';
    actionKind = 'return-home';
    title = 'FINAL REVIEW';
    outcome = passed
      ? 'Your crew completed the penalty extension and met the habitat requirements.'
      : 'The extension is complete. Your crew will return to Earth, but the habitat missed its certification targets.';
  }
  overlayRoot.innerHTML = `
    <section class="earth-report-screen ${finalReview ? 'final-review' : ''} ${passed ? 'passed' : 'below-target'}">
      <div class="report-stars" aria-hidden="true"></div>
      <article class="earth-report-card">
        <header class="report-heading"><span class="eyebrow">S.P.U.D.I.E. · EARTH PROGRESS REPORT</span><h1>${title}</h1><p>${escapeHtml(outcome)}</p></header>
        <div class="report-summary"><div><span>MISSION DAY</span><strong>${String(report.day).padStart(2, '0')} / ${TRIAL_MAX_DAY + PENALTY_MAX_DAY}</strong></div><div><span>TASKS COMPLETED</span><strong>${report.completed} / ${report.assigned}</strong></div><div><span>TRIAL TOTAL</span><strong>${mission.totalCompleted} / ${mission.totalAssigned}</strong></div><div><span>MISSED REVIEWS</span><strong>${mission.missedDays}</strong></div></div>
        <div class="metric-grid">${metricMarkup('Oxygen', mission.metrics.oxygen, 'oxygen')}${metricMarkup('Starch integrity', mission.metrics.starch, 'starch')}${metricMarkup('Crew morale', mission.metrics.morale, 'morale')}${metricMarkup('Research data', mission.metrics.research, 'research')}</div>
        ${requirements}
        <div class="report-event"><span>DAILY LOG</span><p>${escapeHtml(report.event)}</p></div>
        <footer class="report-footer"><span>${escapeHtml(destinationById(missionDestination()).name)} HABITAT · ${escapeHtml(specialistById(lobby.specialist).name.toUpperCase())} SPECIALIST</span><button class="primary-button" data-report-action="${actionKind}">${action}</button></footer>
      </article>
    </section>
  `;
  overlayRoot.querySelector<HTMLButtonElement>('[data-report-action]')?.addEventListener('click', () => {
    sfx.click();
    if (actionKind === 'return-home') {
      completeMission(passed);
    } else if (actionKind === 'penalty') {
      mission.penaltyDay = 1;
      mission.day = TRIAL_MAX_DAY;
      startDay();
    } else {
      if (mission.penaltyDay > 0) mission.penaltyDay += 1;
      else mission.day += 1;
      startDay();
    }
  });
}

function metricMarkup(label: string, value: number, metric: keyof MissionMetrics): string {
  return `<div class="report-metric ${metric}"><div><span>${label}</span><strong>${Math.round(value)}%</strong></div><div class="metric-track"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div></div>`;
}

function completeMission(passed: boolean): void {
  mission.phase = 'complete';
  stopLoop();
  save.games += 1;
  if (passed) save.wins += 1;
  else save.losses += 1;
  save.trialDay = passed ? TRIAL_MAX_DAY : mission.day;
  save.activeTrial = null;
  persistSave(save);
  hud.hidden = true;
  overlayRoot.innerHTML = `
    <section class="mission-ending ${passed ? 'passed' : 'extended'}">
      <div class="report-stars" aria-hidden="true"></div><article class="ending-card">
        <span class="eyebrow">${passed ? 'SPUDNAUT SPACE AGENCY · MISSION SUCCESS' : 'SPUDNAUT SPACE AGENCY · TRIAL COMPLETE'}</span>
        <h1>${passed ? 'WELCOME HOME, SPUDNAUT.' : 'THE TRIAL IS COMPLETE.'}</h1>
        <p>${passed ? 'Your crew proved the habitat works. Earth is ready for the Great Starch Migration.' : 'Your reports have been filed. The crew returns to Earth for additional training.'}</p>
        <div class="ending-stats"><span><strong>${mission.totalCompleted}/${mission.totalAssigned}</strong><small>ASSIGNMENTS</small></span><span><strong>${mission.missedDays}</strong><small>MISSED DAYS</small></span><span><strong>${save.wins}</strong><small>SUCCESSFUL RETURNS</small></span></div>
        <button class="primary-button" data-ending-menu>RETURN TO MAIN MENU →</button>
      </article>
    </section>
  `;
  if (passed) sfx.win();
  else sfx.lose();
  overlayRoot.querySelector('[data-ending-menu]')?.addEventListener('click', showMenu);
}

function renderTaskList(): void {
  if (!isMissionActive() || mission.modalOpen) return;
  pauseMissionForModal();
  const tasks = mission.tasks.map(id => taskById(id)).filter((task): task is NonNullable<typeof task> => Boolean(task));
  const pending = tasks.filter(task => !mission.completed.includes(task.id));
  modalRoot.innerHTML = `<div class="modal-shade"><section class="modal-card task-list-card"><div class="modal-head"><div><span class="eyebrow">DAY ${missionDayNumber()} · CREW ASSIGNMENTS</span><h2>Today's task list</h2></div><button class="modal-close" data-close aria-label="Close task list">×</button></div><div class="report-task-list">${tasks.map(task => `<div class="report-task ${mission.completed.includes(task.id) ? 'done' : ''}"><span>${mission.completed.includes(task.id) ? '✓' : '○'}</span><div><strong>${escapeHtml(task.name)}</strong><small>${escapeHtml(getRoomName(task.roomId))}</small></div></div>`).join('')}</div><p class="modal-lead">${pending.length ? `${pending.length} assignment${pending.length === 1 ? '' : 's'} remain. Move near a marker and press E.` : 'All assignments are complete. Your Earth report is ready.'}</p></section></div>`;
  modalRoot.querySelector('[data-close]')?.addEventListener('click', closeModal);
  modalRoot.querySelector('.modal-shade')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeModal();
  });
}

function openMap(): void {
  if (!isMissionActive() || mission.modalOpen) return;
  pauseMissionForModal();
  modalRoot.innerHTML = `<div class="modal-shade map-shade"><section class="modal-card map-card"><div class="modal-head"><div><span class="eyebrow">STATION SCHEMATIC · THE SPUD</span><h2>Today's assignment map</h2></div><button class="modal-close" data-close aria-label="Close map">×</button></div><div class="map-board"><div class="map-canvas" style="aspect-ratio:${WORLD_WIDTH} / ${WORLD_HEIGHT}">${CORRIDORS.map(corridor => `<span class="map-corridor" style="left:${corridor.x / WORLD_WIDTH * 100}%;top:${corridor.y / WORLD_HEIGHT * 100}%;width:${corridor.w / WORLD_WIDTH * 100}%;height:${corridor.h / WORLD_HEIGHT * 100}%"></span>`).join('')}${ROOMS.map(room => `<span class="map-room" style="left:${room.x / WORLD_WIDTH * 100}%;top:${room.y / WORLD_HEIGHT * 100}%;width:${room.w / WORLD_WIDTH * 100}%;height:${room.h / WORLD_HEIGHT * 100}%;--room-tint:#${room.tint.toString(16).padStart(6, '0')}"><b>${room.icon}</b><small>${escapeHtml(room.name)}</small></span>`).join('')}${mission.tasks.map(id => taskById(id)).filter((task): task is NonNullable<typeof task> => Boolean(task)).map(task => `<span class="map-task ${mission.completed.includes(task.id) ? 'done' : ''}" style="left:${task.x / WORLD_WIDTH * 100}%;top:${task.y / WORLD_HEIGHT * 100}%" title="${escapeHtml(task.name)}"></span>`).join('')}<span class="map-you" style="left:${mission.playerX / WORLD_WIDTH * 100}%;top:${mission.playerY / WORLD_HEIGHT * 100}%"><i></i></span></div></div><p class="map-note">Gold markers show today's remaining assignments. WASD or arrow keys move; click a destination to walk there.</p></section></div>`;
  modalRoot.querySelector('[data-close]')?.addEventListener('click', closeModal);
  modalRoot.querySelector('.modal-shade')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeModal();
  });
}

function openHelp(): void {
  if (!isMissionActive() || mission.modalOpen) return;
  pauseMissionForModal();
  modalRoot.innerHTML = `<div class="modal-shade"><section class="modal-card help-card"><div class="modal-head"><div><span class="eyebrow">CREW HANDBOOK</span><h2>Controls & trial rules</h2></div><button class="modal-close" data-close aria-label="Close help">×</button></div><div class="help-grid"><section class="help-block"><h3>Movement</h3><p>WASD or arrow keys to walk. Click a point on the station to follow a route.</p></section><section class="help-block"><h3>Assignments</h3><p>Find the gold task markers. When you are close, press E to open the minigame.</p></section><section class="help-block"><h3>Earth reports</h3><p>Complete today's assignments before the clock runs out to protect crew metrics. After each day, S.P.U.D.I.E. sends Earth a progress report.</p></section><section class="help-block"><h3>Trial goal</h3><p>Work together through 30 days. If the habitat metrics fall short, complete a 15-day penalty extension. The crew always wins or loses together.</p></section></div></section></div>`;
  modalRoot.querySelector('[data-close]')?.addEventListener('click', closeModal);
  modalRoot.querySelector('.modal-shade')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeModal();
  });
}

function updateHUD(): void {
  const remaining = mission.tasks.filter(id => !mission.completed.includes(id)).length;
  const label = document.querySelector<HTMLElement>('#task-label');
  const fill = document.querySelector<HTMLElement>('#task-fill');
  const day = document.querySelector<HTMLElement>('#trial-day');
  const room = document.querySelector<HTMLElement>('#hud-room');
  const prompt = document.querySelector<HTMLElement>('#interaction-prompt');
  const name = document.querySelector<HTMLElement>('#hud-player-name');
  const meta = document.querySelector<HTMLElement>('#hud-player-meta');
  const dot = document.querySelector<HTMLElement>('#hud-color-dot');
  if (label) label.textContent = `TODAY ${mission.tasks.length - remaining} / ${mission.tasks.length}`;
  if (fill) fill.style.width = `${mission.tasks.length ? ((mission.tasks.length - remaining) / mission.tasks.length) * 100 : 0}%`;
  if (day) day.textContent = mission.penaltyDay ? `EXTENSION ${String(mission.penaltyDay).padStart(2, '0')} / 15` : `DAY ${String(mission.day).padStart(2, '0')} / 30`;
  if (room) room.textContent = mission.room.toUpperCase();
  if (prompt) {
    prompt.textContent = currentTaskPrompt.id
      ? `TASK · ${currentTaskPrompt.name} · ${currentTaskPrompt.room}`
      : `LOCATION · ${currentTaskPrompt.room}`;
    prompt.classList.toggle('has-task', Boolean(currentTaskPrompt.id));
  }
  if (name) name.textContent = save.name.toUpperCase();
  if (meta) meta.textContent = `${specialistById(lobby.specialist).name.toUpperCase()} · ${destinationById(missionDestination()).name.toUpperCase()}`;
  if (dot) dot.style.background = getColor(save.colorId).css;
  const crew = document.querySelector<HTMLElement>('#crew-progress');
  if (crew) crew.textContent = 'COOPERATIVE TRIAL';
  updateActionButtons();
}

function updateActionButtons(): void {
  const use = document.querySelector<HTMLButtonElement>('[data-action="use"]');
  if (!use) return;
  const available = Boolean(currentTaskPrompt.id) && isMissionActive() && !mission.modalOpen;
  use.hidden = !available;
  use.disabled = !available;
  use.setAttribute('aria-label', currentTaskPrompt.id
    ? `Use ${currentTaskPrompt.name} in ${currentTaskPrompt.room}`
    : 'No assignment in range');
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(Number(toast.dataset.timer ?? 0));
  toast.dataset.timer = String(window.setTimeout(() => toast.classList.remove('visible'), 2600));
}

function wireControls(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => {
    sfx.click();
    switch (button.dataset.action) {
      case 'use': if (currentTaskPrompt.id) openTask(currentTaskPrompt.id); break;
      case 'map': openMap(); break;
      case 'tasks': renderTaskList(); break;
      case 'help': openHelp(); break;
    }
  }));
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modalRoot.childElementCount) {
      const closeButton = modalRoot.querySelector<HTMLButtonElement>('[data-close]');
      if (closeButton) closeButton.click();
      else closeModal();
    }
    if (event.key.toLowerCase() === 'm' && isMissionActive() && !mission.modalOpen) openMap();
    if (event.key === 'Tab' && isMissionActive() && !mission.modalOpen) {
      event.preventDefault();
      renderTaskList();
    }
  });
}

function applyOptions(): void {
  configureSfx({ enabled: save.options.sound, volume: save.options.volume });
  document.body.classList.toggle('reduce-motion', save.options.reducedMotion);
}

wireControls();
applyOptions();
showSplash();
