import type { EventCard } from './events';

export const COMMANDER_ART = '/assets/ui/spudnaut/design/commander-russet.png';
export const LANDING_PAD_SPAWN = { x: 1696, y: 1520 };
export const REACTOR_POWER_SWITCH = { id: 'reactor-power-switch', x: 856, y: 412 };

export const BLACKOUT_EVENT: EventCard = {
  id: 'station-blackout',
  name: 'Station Blackout',
  kind: 'hazard',
  description: 'You restored reactor power. The habitat lights are back online.',
  effect: 'The station lights come back on when reactor power is restored.',
  deltas: {},
};
