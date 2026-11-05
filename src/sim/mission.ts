import { DAILY_OPERATIONS_DRIFT, DAY, METRIC_START, PASS_THRESHOLDS, SYSTEMS } from '../data/balance';
import { EVENT_CARDS, type EventCard } from '../data/events';
import type { MissionMetrics, SpecialistId, TaskDef } from '../model';
import type { Rng } from './rng';
import type { DestinationId } from '../model';

export type AssignmentSystem = 'power' | 'life' | 'farming' | 'shielding' | 'science';

export interface AssignmentOffer {
  taskId: string;
  name: string;
  roomId: string;
  system: AssignmentSystem;
  blurb: string;
  icon: string;
  accent: string;
}

export interface Requirement {
  key: string;
  label: string;
  value: number;
  target: number;
  met: boolean;
}

export interface MissionVerdict {
  passed: boolean;
  requirements: Requirement[];
  completion: number;
}

const SYSTEM_META: Record<AssignmentSystem, { icon: string; accent: string; blurb: string }> = {
  power: { icon: 'lightning', accent: '#f2b544', blurb: 'Stabilize the power budget before another module browns out.' },
  life: { icon: 'water', accent: '#6fd4e6', blurb: 'Keep air and water inside the safe operating band.' },
  farming: { icon: 'sickle', accent: '#9bd15a', blurb: 'Protect the starch supply that feeds the whole crew.' },
  shielding: { icon: 'shield', accent: '#ba9df0', blurb: 'Patch the hull and hold the radiation barrier together.' },
  science: { icon: 'notepad', accent: '#d8b06a', blurb: 'Collect the evidence Earth needs for the habitability review.' },
};

const ROLE_SYSTEMS: Record<SpecialistId, AssignmentSystem[]> = {
  repairman: ['power', 'shielding', 'life'],
  farmer: ['farming', 'life', 'science'],
  traveller: ['science', 'power', 'shielding'],
  researcher: ['science'],
};

export function createMetrics(): MissionMetrics {
  return { ...METRIC_START };
}

export function systemOfTask(task: TaskDef): AssignmentSystem {
  if (task.system) return task.system;
  if (task.kind === 'shield') return 'shielding';
  if (['reactor', 'upper-engine', 'lower-engine', 'electrical'].includes(task.roomId)) return 'power';
  if (['o2', 'medbay'].includes(task.roomId)) return 'life';
  if (task.roomId === 'cafeteria') return 'farming';
  if (task.roomId === 'shields') return 'shielding';
  return 'science';
}

export function offersForDay(tasks: TaskDef[], role: SpecialistId, rng: Rng, recentlyAssigned: string[] = []): AssignmentOffer[] {
  const preferred = ROLE_SYSTEMS[role];
  const ranked = rng.shuffle(tasks).sort((a, b) => {
    const aRank = preferred.indexOf(systemOfTask(a));
    const bRank = preferred.indexOf(systemOfTask(b));
    return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank);
  });
  const fresh = ranked.filter(task => !recentlyAssigned.includes(task.id));
  const pool = fresh.length >= DAY.offerCount ? fresh : ranked;
  return pool.slice(0, DAY.offerCount).map(task => {
    const system = systemOfTask(task);
    const meta = SYSTEM_META[system];
    return {
      taskId: task.id,
      name: task.name,
      roomId: task.roomId,
      system,
      blurb: meta.blurb,
      icon: meta.icon,
      accent: meta.accent,
    };
  });
}

export function eventForDay(rng: Rng, destination: DestinationId = 'moon', day = 1, recentIds: string[] = []): EventCard {
  if (day === 1) return EVENT_CARDS.find(event => event.id === 'oxygen-alarm')!;
  const available = EVENT_CARDS.filter(event => !event.destinations || event.destinations.includes(destination));
  const fresh = available.filter(event => !recentIds.includes(event.id));
  return rng.pick(fresh.length ? fresh : available);
}

export function applyEvent(metrics: MissionMetrics, event: EventCard): MissionMetrics {
  const next = { ...metrics };
  for (const [key, delta] of Object.entries(event.deltas)) {
    const metric = key as keyof MissionMetrics;
    next[metric] = clamp(next[metric] + (delta ?? 0));
  }
  return next;
}

export function applyDailyOperations(metrics: MissionMetrics): MissionMetrics {
  const next = { ...metrics };
  for (const [key, delta] of Object.entries(DAILY_OPERATIONS_DRIFT)) {
    const metric = key as keyof MissionMetrics;
    next[metric] = clamp(next[metric] + delta);
  }
  return next;
}

export function metricDeltas(metrics: MissionMetrics, next: MissionMetrics): Partial<MissionMetrics> {
  const deltas: Partial<MissionMetrics> = {};
  for (const key of Object.keys(metrics) as (keyof MissionMetrics)[]) {
    const delta = Math.round(next[key] - metrics[key]);
    if (delta !== 0) deltas[key] = delta;
  }
  return deltas;
}

export function applyTaskCompletion(metrics: MissionMetrics, task: TaskDef, role: SpecialistId): MissionMetrics {
  const system = systemOfTask(task);
  const next = { ...metrics };
  const bonus = ROLE_SYSTEMS[role].includes(system) ? 3 : 0;
  if (system === 'power') next.power = clamp(next.power + 6 + bonus);
  else if (system === 'life') {
    next.oxygen = clamp(next.oxygen + 3 + bonus);
    next.water = clamp(next.water + 4 + bonus);
  } else if (system === 'farming') {
    next.starch = clamp(next.starch + 6 + bonus);
    next.water = clamp(next.water + 1);
  } else if (system === 'shielding') {
    next.hull = clamp(next.hull + 6 + bonus);
  } else {
    next.research = clamp(next.research + 5 + bonus);
  }
  next.morale = clamp(next.morale + 1);
  return next;
}

export function applyMissedDay(metrics: MissionMetrics, role: SpecialistId): MissionMetrics {
  const next = { ...metrics };
  const farmerMitigation = role === 'farmer' ? 0.5 : 1;
  const repairMitigation = role === 'repairman' ? 0.6 : 1;
  next.power = clamp(next.power - Math.round(4 * repairMitigation));
  next.oxygen = clamp(next.oxygen - Math.round(3 * repairMitigation));
  next.water = clamp(next.water - 3);
  next.starch = clamp(next.starch - Math.round(5 * farmerMitigation));
  next.hull = clamp(next.hull - 4);
  next.morale = clamp(next.morale - 6);
  return next;
}

export function systemHealth(metrics: MissionMetrics, systemId: 'power' | 'life' | 'farming' | 'shielding'): number {
  const definition = SYSTEMS.find(system => system.id === systemId);
  if (!definition) return 0;
  const values = definition.metrics.map(metric => metrics[metric]);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
}

export function evaluateMission(
  metrics: MissionMetrics,
  totalAssigned: number,
  totalCompleted: number,
): MissionVerdict {
  const completion = totalAssigned ? totalCompleted / totalAssigned : 0;
  const requirements: Requirement[] = [
    requirement('completion', 'Assignments', completion * 100, PASS_THRESHOLDS.completion * 100),
    requirement('power', 'Power', metrics.power, PASS_THRESHOLDS.power),
    requirement('oxygen', 'Oxygen', metrics.oxygen, PASS_THRESHOLDS.oxygen),
    requirement('water', 'Water', metrics.water, PASS_THRESHOLDS.water),
    requirement('starch', 'Starch', metrics.starch, PASS_THRESHOLDS.starch),
    requirement('hull', 'Shielding / Hull', metrics.hull, PASS_THRESHOLDS.hull),
    requirement('morale', 'Morale', metrics.morale, PASS_THRESHOLDS.morale),
    requirement('research', 'Research', metrics.research, PASS_THRESHOLDS.research),
  ];
  return { passed: requirements.every(item => item.met), requirements, completion };
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function requirement(key: string, label: string, value: number, target: number): Requirement {
  return { key, label, value: Math.round(value), target: Math.round(target), met: value >= target };
}
