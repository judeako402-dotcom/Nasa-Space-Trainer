import { DIFFICULTY_EXCHANGE } from '../data/balance';
import type { EventCard } from '../data/events';
import type { DonkiReport, MissionMetric, MissionMetrics, SpecialistId } from '../model';
import { applyMetricExchange, specialistBonus } from './mission';

export const DISASTER_TOOLS = {
  power: { name: 'Solar Relay Wrench', use: 'Fixes the solar power bus.' },
  life: { name: 'Hull Seal Kit', use: 'Patches leaks in the airlock shield.' },
  research: { name: 'Sensor Tuner', use: 'Lines up the science sensors.' },
  farm: { name: 'Pump Repair Kit', use: 'Gets water back to the potato beds.' },
} as const;

export const DISASTER_REPAIRS = {
  FLR: { part: 'Solar Power Bus', system: 'power', cost: 'life' },
  CME: { part: 'Airlock & Hull Shield', system: 'life', cost: 'farm' },
  SEP: { part: 'Comms & Science Sensors', system: 'research', cost: 'power' },
  GST: { part: 'Hydroponic Grow Pumps', system: 'farm', cost: 'research' },
} as const;

export function disasterTools(type: DonkiReport['type']): MissionMetric[] {
  const systems: MissionMetric[] = ['power', 'life', 'research', 'farm'];
  const target = systems.indexOf(DISASTER_REPAIRS[type].system);
  systems.splice((target + 2) % 4, 1);
  return systems;
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
