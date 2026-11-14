import {
  EXAM_PASS_RATIO, EXAM_QUESTION_COUNT, EXAM_QUESTIONS, shuffle,
} from '../model';
import { scheduleSurfacePrewarm } from '../app/prewarm';
import { routes } from '../app/router';
import {
  dom, escapeHtml, saveSettings, session, setScreen, showToast,
} from '../app/session';
import { sfx } from '../sfx';
import { renderConstellationAction, renderConstellationTitle } from '../ui/icons';
import { renderConstellationVideoScreen } from '../ui/layout';

export function showExamIntro(): void {
  const { screenRoot } = dom();
  scheduleSurfacePrewarm();
  const bodyMarkup = `
    ${renderConstellationTitle('THE SPUD EXAM', 'exam-intro-title', 'EARTH TRAINING FACILITY · CERTIFICATION')}
    <div class="spud-copy-stack">
      <div class="spud-copy-block">
        <h2>FLIGHT QUALIFICATION</h2>
        <p>
          Eight questions on pressure, life support, tools, farming, and crew safety. Score at least ${Math.round(EXAM_PASS_RATIO * 100)}% to earn your flight certification.
        </p>
      </div>
      <div class="spud-telemetry-grid">
        <div class="spud-telemetry-cell">
          <span>TRAINING RANK</span>
          <strong>${escapeHtml(session.save.trainingRank ?? 'B')}</strong>
          <small>DECK EVALUATION</small>
        </div>
        <div class="spud-telemetry-cell">
          <span>PASS TARGET</span>
          <strong>${Math.round(EXAM_PASS_RATIO * 100)}%</strong>
          <small>${EXAM_QUESTION_COUNT} QUESTIONS</small>
        </div>
        <div class="spud-telemetry-cell">
          <span>EXAM BEST</span>
          <strong>${session.save.examBest}%</strong>
          <small>RECORDED SCORE</small>
        </div>
      </div>
    </div>
    <footer class="spud-constellation-actions is-centered">
      ${renderConstellationAction({ icon: 'cert', label: 'TAKE THE EXAM', attrs: 'data-exam-start', variant: 'primary' })}
    </footer>
  `;
  setScreen('exam', renderConstellationVideoScreen({
    ariaLabel: 'Spud Certification Exam Introduction',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-exam-back-menu',
    backAriaLabel: 'Back to Main Menu',
    narrow: true,
    extraClass: 'exam-screen',
  }));
  screenRoot.querySelector('[data-exam-back-menu]')?.addEventListener('click', () => {
    sfx.click();
    routes.showMenu();
  });
  screenRoot.querySelector('[data-exam-start]')?.addEventListener('click', () => {
    sfx.click();
    startExam();
  });
}

export function startExam(): void {
  session.exam = {
    questions: shuffle(EXAM_QUESTIONS).slice(0, EXAM_QUESTION_COUNT),
    index: 0,
    score: 0,
    selected: [],
    submitted: false,
    missed: [],
  };
  renderExamQuestion();
}

export function renderExamQuestion(): void {
  const { screenRoot } = dom();
  const { exam } = session;
  const question = exam.questions[exam.index];
  if (!question) {
    finishExam();
    return;
  }
  const pct = Math.round(((exam.index + (exam.submitted ? 1 : 0)) / exam.questions.length) * 100);
  const utilityMarkup = `
    <span class="spud-metric-chip">SCORE <b>${exam.score} / ${exam.questions.length}</b></span>
    <span class="spud-metric-chip">PROGRESS <b>${pct}%</b></span>
  `;
  const bodyMarkup = `
    ${renderConstellationTitle(
      `QUESTION ${String(exam.index + 1).padStart(2, '0')} OF ${String(exam.questions.length).padStart(2, '0')}`,
      'exam-question-title',
      `${question.topic} · SPUD CERTIFICATION`,
    )}
    <div class="spud-copy-block">
      <p style="font-size:clamp(15px,1.5vw,18px);color:#ffffff;">${escapeHtml(question.prompt)}</p>
    </div>
    <div class="spud-constellation-divider" aria-hidden="true"></div>
    <div class="spud-split-columns">
      <div class="spud-copy-stack">
        <div class="spud-constellation-heading">
          ${question.correct.length > 1 ? 'MULTI-SELECT · CHOOSE ALL CORRECT ANSWERS' : 'SINGLE-SELECT · CHOOSE ONE ANSWER'}
        </div>
        <div class="spud-exam-options">
          ${question.options.map((option, index) => `
            <button
              class="spud-exam-choice exam-option ${exam.selected.includes(index) ? 'selected' : ''}"
              type="button"
              data-exam-option="${index}"
              ${exam.submitted ? 'disabled' : ''}
            >
              <span class="spud-choice-letter">${String.fromCharCode(65 + index)}</span>
              <strong>${escapeHtml(option)}</strong>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="spud-vertical-rule" aria-hidden="true"></div>
      <aside class="spud-copy-stack">
        <div class="spud-loadout-portrait">
          <div class="spud-portrait-ring"><img src="/assets/potato-researcher.png" alt="" /></div>
          <div class="spud-loadout-meta">
            <span>S.P.U.D.I.E. PROCTOR</span>
            <h3>${escapeHtml(question.topic.toUpperCase())}</h3>
            <small>Question ${exam.index + 1} of ${exam.questions.length}</small>
          </div>
        </div>
        <div class="spud-copy-block" ${exam.submitted ? '' : 'hidden'}>
          <h2>${exam.missed.includes(question) ? 'REVIEW REQUIRED' : 'VERIFIED CORRECT'}</h2>
          <p>${escapeHtml(question.explanation)}</p>
        </div>
        <div class="spud-copy-block" ${exam.submitted ? 'hidden' : ''}>
          <h2>CADET GUIDANCE</h2>
          <p>Select your response on the left, then lock in your answer to receive immediate telemetry verification.</p>
        </div>
      </aside>
    </div>
    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'back', label: 'EXIT EXAM', attrs: 'data-exam-exit' })}
      ${renderConstellationAction({
        icon: exam.submitted ? 'forward' : 'cert',
        label: exam.submitted ? (exam.index + 1 === exam.questions.length ? 'SEE RESULT' : 'NEXT QUESTION') : 'SUBMIT ANSWER',
        attrs: 'data-exam-submit',
        variant: 'primary',
      })}
    </footer>
  `;

  setScreen('exam', renderConstellationVideoScreen({
    ariaLabel: 'Spud Certification Exam Question',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-exam-exit',
    backAriaLabel: 'Exit Exam to Main Menu',
    utilityMarkup,
    extraClass: 'exam-screen',
  }));
  screenRoot.querySelectorAll('[data-exam-exit]').forEach((el) => el.addEventListener('click', () => {
    sfx.click();
    routes.showMenu();
  }));
  screenRoot.querySelectorAll<HTMLButtonElement>('[data-exam-option]').forEach((button) => button.addEventListener('click', () => {
    if (exam.submitted) return;
    const option = Number(button.dataset.examOption);
    if (!Number.isInteger(option)) return;
    sfx.click();
    if (question.correct.length === 1) exam.selected = [option];
    else {
      exam.selected = exam.selected.includes(option)
        ? exam.selected.filter((item) => item !== option)
        : [...exam.selected, option];
    }
    renderExamQuestion();
  }));
  screenRoot.querySelector('[data-exam-submit]')?.addEventListener('click', () => {
    if (exam.submitted) {
      sfx.click();
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

export function finishExam(): void {
  const { screenRoot } = dom();
  const { exam, save } = session;
  const percentage = Math.round((exam.score / exam.questions.length) * 100);
  save.examBest = Math.max(save.examBest, percentage);
  save.certified = percentage >= EXAM_PASS_RATIO * 100;
  saveSettings();
  if (save.certified) {
    const bodyMarkup = `
      ${renderConstellationTitle('FLIGHT APPROVED', 'graduation-title', `CERTIFICATION RESULT · ${percentage}%`)}
      <div class="spud-orbital-seal">✦<small>SPUDNAUT</small></div>
      <div class="spud-copy-block" style="text-align:center;">
        <p>S.P.U.D.I.E. has certified you for the Moon habitat mission.</p>
      </div>
      <div class="spud-telemetry-grid">
        <div class="spud-telemetry-cell">
          <span>TRAINING RANK</span>
          <strong>${escapeHtml(save.trainingRank ?? 'B')}</strong>
          <small>DECK RECORD</small>
        </div>
        <div class="spud-telemetry-cell">
          <span>THIS ATTEMPT</span>
          <strong>${percentage}%</strong>
          <small>FLIGHT SCORE</small>
        </div>
        <div class="spud-telemetry-cell">
          <span>EXAM BEST</span>
          <strong>${save.examBest}%</strong>
          <small>CERTIFIED</small>
        </div>
      </div>
      <footer class="spud-constellation-actions is-centered">
        ${renderConstellationAction({ icon: 'play', label: 'CHOOSE YOUR MISSION', attrs: 'data-graduate', variant: 'primary' })}
      </footer>
    `;
    setScreen('graduation', renderConstellationVideoScreen({
      ariaLabel: 'Flight Approved Certification',
      bodyMarkup,
      backLabel: 'MENU',
      backAttrs: 'data-graduate-menu',
      backAriaLabel: 'Back to Main Menu',
      narrow: true,
      extraClass: 'graduation-screen',
    }));
    screenRoot.querySelector('[data-graduate-menu]')?.addEventListener('click', () => {
      sfx.click();
      routes.showMenu();
    });
    screenRoot.querySelector('[data-graduate]')?.addEventListener('click', () => {
      sfx.click();
      routes.showLobby();
    });
  } else {
    session.remediationIndex = 0;
    showRemedial();
  }
}

export function showRemedial(): void {
  const { screenRoot } = dom();
  const lessons = session.exam.missed.length ? session.exam.missed : session.exam.questions;
  const question = lessons[session.remediationIndex % lessons.length];
  if (!question) {
    showExamIntro();
    return;
  }
  const bodyMarkup = `
    ${renderConstellationTitle(
      `REVIEW: ${question.topic.toUpperCase()}`,
      'remedial-title',
      `REMEDIAL SPUD ACADEMY · ${session.remediationIndex + 1} / ${lessons.length}`,
    )}
    <div class="spud-copy-stack">
      <div class="spud-copy-block">
        <h2>FIELD PRINCIPLE</h2>
        <p>${escapeHtml(question.lesson)}</p>
      </div>
      <div class="spud-constellation-divider" aria-hidden="true"></div>
      <div class="spud-copy-block">
        <h2>MISSED QUESTION</h2>
        <p>${escapeHtml(question.prompt)}</p>
        <small style="color:var(--spud-ice);">
          Correct answer${question.correct.length > 1 ? 's' : ''}: ${question.correct.map((index) => question.options[index] ?? '').map(escapeHtml).join(' · ')}
        </small>
      </div>
    </div>
    <footer class="spud-constellation-actions">
      ${renderConstellationAction({ icon: 'forward', label: 'NEXT LESSON', attrs: 'data-remedial-next' })}
      ${renderConstellationAction({ icon: 'cert', label: 'RETAKE EXAM', attrs: 'data-retake', variant: 'primary' })}
    </footer>
  `;
  setScreen('remedial', renderConstellationVideoScreen({
    ariaLabel: 'Remedial Academy Review',
    bodyMarkup,
    backLabel: 'BACK',
    backAttrs: 'data-remedial-back',
    backAriaLabel: 'Back to Main Menu',
    narrow: true,
    extraClass: 'remedial-screen',
  }));
  screenRoot.querySelector('[data-remedial-back]')?.addEventListener('click', () => {
    sfx.click();
    routes.showMenu();
  });
  screenRoot.querySelector('[data-remedial-next]')?.addEventListener('click', () => {
    sfx.click();
    session.remediationIndex = (session.remediationIndex + 1) % lessons.length;
    showRemedial();
  });
  screenRoot.querySelector('[data-retake]')?.addEventListener('click', () => {
    sfx.click();
    startExam();
  });
}
