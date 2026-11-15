import { DIFFICULTY_EXCHANGE } from '../data/balance';
import type { EventCard } from '../data/events';
import type { DonkiReport, MissionMetric, MissionMetrics, SpecialistId } from '../model';
import { applyMetricExchange, specialistBonus } from './mission';

export const DISASTER_TOOLS = {
  power: {
    name: 'Power Wrench',
    use: 'Gets the power working again.',
    cardImg: '/assets/ui/spudnaut/cards/card-power-wrench.png',
  },
  life: {
    name: 'Shield Patch',
    use: 'Patches the broken shield.',
    cardImg: '/assets/ui/spudnaut/cards/card-shield-patch.png',
  },
  research: {
    name: 'Sensor Fixer',
    use: 'Helps the sensors read clearly again.',
    cardImg: '/assets/ui/spudnaut/cards/card-sensor-fixer.png',
  },
  farm: {
    name: 'Pump Repair Kit',
    use: 'Gets water back to the potato beds.',
    cardImg: '/assets/ui/spudnaut/cards/card-pump-repair.svg',
  },
} as const;

export const DISASTER_REPAIRS = {
  FLR: {
    title: 'Sun Flash',
    system: 'power',
    cost: 'life',
    damage: 'The power box stopped working.',
    briefing: 'A bright flash came from the Sun. Our power box stopped working! Pick the card that fixes power.',
    hint: 'Solar X-rays overloaded the station grid. Use the tool built to restore electrical hardware.',
  },
  CME: {
    title: 'Sun Cloud',
    system: 'life',
    cost: 'farm',
    damage: 'The shield by the airlock door broke.',
    briefing: 'A huge cloud came from the Sun. Our shield by the door broke! Pick the card that patches it.',
    hint: 'A magnetic cloud rattled the outer airlock barrier. Pick the card that seals hull plating.',
  },
  SEP: {
    title: 'Tiny Bits from the Sun',
    system: 'research',
    cost: 'power',
    damage: 'The science sensors are giving mixed-up readings.',
    briefing: 'Tiny, fast bits came from the Sun. Now our science sensors are mixed up! Pick the card that fixes them.',
    hint: 'Fast solar particles scrambled instrument data. Pick the card made for delicate electronics.',
  },
  // Repair support for emergencies assigned in older saves.
  GST: {
    title: 'Space Storm',
    system: 'farm',
    cost: 'research',
    damage: 'The pump that waters the potato beds stopped.',
    briefing: 'A space storm hit. Water stopped flowing to our potatoes! Pick the card that fixes the pump.',
    hint: 'Geomagnetic surges stalled irrigation flow. Pick the kit built for the potato hydro-pumps.',
  },
} as const;

export function disasterTools(type: DonkiReport['type']): readonly MissionMetric[] {
  return type === 'GST' ? ['power', 'research', 'farm'] : ['power', 'life', 'research'];
}

export function resolveDisaster(
  event: NonNullable<EventCard['majorEvent']>, metrics: MissionMetrics, tool: MissionMetric, role: SpecialistId,
): MissionMetrics | null {
  const { system, cost } = DISASTER_REPAIRS[event.type];
  if (tool !== system) return null;
  const exchange = DIFFICULTY_EXCHANGE[event.difficulty];
  const damage = (event.severity === 'high' ? 8 : event.severity === 'moderate' ? 6 : 4);
  return applyMetricExchange(metrics, {
    [system]: exchange.benefit - damage + specialistBonus(role, system),
    [cost]: -exchange.cost,
  });
}
