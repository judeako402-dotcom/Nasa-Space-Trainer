import { dom, escapeHtml, pauseMissionForModal, resumeMissionAfterModal } from '../app/session';
import { EVENT_NAMES } from '../data/donki';
import type { EventCard } from '../data/events';
import type { MissionMetric, SpecialistId } from '../model';
import { DISASTER_REPAIRS, DISASTER_TOOLS, disasterTools } from '../sim/disasters';
import { clearActiveModals, mountCustomModal } from '../ui/modalController';

export function showDisaster(event: EventCard, role: SpecialistId, choose: (tool: MissionMetric) => void, rescued = false): void {
  if (!event.majorEvent) return;
  const { type } = event.majorEvent;
  const { part, system } = DISASTER_REPAIRS[type];
  const { modalRoot } = dom();
  pauseMissionForModal();
  mountCustomModal({
    modalRoot,
    markup: `
      <div class="modal-shade">
        <section class="spud-modal-frame disaster-card" role="alertdialog" aria-modal="true" aria-labelledby="disaster-title">
          <header class="disaster-warning">
            <span aria-hidden="true">⚠</span>
            <div>
              <h2 id="disaster-title">${EVENT_NAMES[type]}</h2>
              <p><strong>${escapeHtml(part)}</strong> needs your help!</p>
              <small>${event.source?.simulated ? 'Space Apps practice alert' : `NASA DONKI · ${escapeHtml(event.source?.date.slice(0, 10) ?? '')}`}</small>
            </div>
          </header>
          <p>Pick the tool that fixes this part.</p>
          ${rescued ? '<p class="disaster-clue">Commander Russet topped up your low bars to 35%. Give it another go!</p>' : ''}
          ${role === 'researcher' ? `<p class="disaster-clue">Commander Russet’s clue: Try the ${DISASTER_TOOLS[system].name}.</p>` : ''}
          <div class="disaster-tools">
            ${disasterTools(type).map(tool => `
              <button type="button" data-disaster-tool="${tool}">
                <strong>${DISASTER_TOOLS[tool].name}</strong><small>${DISASTER_TOOLS[tool].use}</small>
              </button>
            `).join('')}
          </div>
        </section>
      </div>`,
    focusSelector: '[data-disaster-tool]',
  });
  modalRoot.querySelectorAll<HTMLButtonElement>('[data-disaster-tool]').forEach(button => {
    button.addEventListener('click', () => {
      clearActiveModals(modalRoot, { restoreFocus: false });
      resumeMissionAfterModal();
      choose(button.dataset.disasterTool as MissionMetric);
    });
  });
}
