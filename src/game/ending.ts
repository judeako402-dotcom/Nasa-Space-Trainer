import { renderConstellationAction } from '../ui/icons';

export function playHomecoming(host: HTMLElement, reducedMotion: boolean, onComplete: () => void): void {
  host.innerHTML = `
    <section class="spud-canvas-overlay homecoming ${reducedMotion ? 'reduce-motion' : ''}" aria-labelledby="homecoming-title">
      <div class="homecoming-sky" aria-hidden="true">
        <img class="homecoming-moon" src="/assets/ui/spudnaut/design/moon.webp" alt="">
        <img class="homecoming-earth" src="/assets/placeholders/kenney/planets/planet00.png" alt="">
        <img class="homecoming-rocket" src="/assets/placeholders/kenney/simple-space/ship_A.png" alt="">
      </div>
      <h2 id="homecoming-title">Heading back to Earth!</h2>
      <div class="homecoming-medal" hidden><span aria-hidden="true">🏅</span> Golden Potato Medal</div>
      ${renderConstellationAction({ icon: 'skip', label: 'SKIP FLIGHT', attrs: 'data-skip-homecoming' })}
    </section>`;
  const title = host.querySelector<HTMLElement>('#homecoming-title')!;
  const medal = host.querySelector<HTMLElement>('.homecoming-medal')!;
  const skip = host.querySelector<HTMLButtonElement>('[data-skip-homecoming]')!;
  const award = window.setTimeout(() => {
    title.textContent = 'Welcome home, Spudnaut!';
    medal.hidden = false;
  }, reducedMotion ? 0 : 3000);
  const finish = (): void => {
    window.clearTimeout(award);
    window.clearTimeout(end);
    onComplete();
  };
  const end = window.setTimeout(finish, reducedMotion ? 1600 : 5100);
  skip.addEventListener('click', finish, { once: true });
  skip.focus();
}
