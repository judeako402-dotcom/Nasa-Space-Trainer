import { dom, escapeHtml, pauseMissionForModal, resumeMissionAfterModal } from '../app/session';
import { EVENT_NAMES } from '../data/donki';
import type { EventCard } from '../data/events';
import type { MissionMetric } from '../model';
import { DISASTER_REPAIRS, DISASTER_TOOLS, disasterTools } from '../sim/disasters';
import { clearActiveModals, mountCustomModal } from '../ui/modalController';

export function showDisaster(
  event: EventCard, choose: (tool: MissionMetric) => void, feedback?: string,
): void {
  if (!event.majorEvent) return;
  const { type } = event.majorEvent;
  const { title, damage, hint } = DISASTER_REPAIRS[type];
  const source = event.source;
  const eventDetail = event.description && event.description !== damage
    ? `${damage} ${event.description}`
    : damage;
  const { modalRoot } = dom();
  pauseMissionForModal();
  mountCustomModal({
    modalRoot,
    markup: `
      <div class="modal-shade">
        <section class="spud-modal-frame disaster-card is-emergency-event${feedback ? '' : ' is-pop-entering'}" role="alertdialog" aria-modal="true" aria-labelledby="disaster-title">
          <div class="hud-event-kicker is-emergency">SPACE WEATHER EMERGENCY · REPAIR PROTOCOL</div>
          <header class="disaster-warning">
            <span class="disaster-warning-glyph" aria-hidden="true">⚠</span>
            <div class="disaster-header-copy">
              <h2 id="disaster-title">${escapeHtml(title)}</h2>
              <small>${source && !source.simulated
                ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">NASA DONKI · ${EVENT_NAMES[type]} · ${escapeHtml(source.date.slice(0, 10))}</a>`
                : 'Simulated space-weather alert'}</small>
            </div>
          </header>
          <div class="disaster-tools">
            ${disasterTools(type).map((tool, index) => `
              <button type="button" class="disaster-tool-btn is-${tool}" data-disaster-tool="${tool}" style="--sibling-index:${index + 1}">
                <img class="disaster-tool-art" src="${DISASTER_TOOLS[tool].cardImg}" alt="" aria-hidden="true" draggable="false" />
                <strong>${DISASTER_TOOLS[tool].name}</strong>
                <small>${DISASTER_TOOLS[tool].use}</small>
              </button>
            `).join('')}
          </div>
          <div class="disaster-briefing-box">
            <p class="disaster-event-desc">${escapeHtml(eventDetail)}</p>
            <p class="disaster-hint"><strong>HINT</strong><span>${escapeHtml(hint)}</span></p>
            ${feedback ? `<p class="disaster-clue" role="status">${escapeHtml(feedback)}</p>` : ''}
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
