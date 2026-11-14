import { DAILY_OPERATIONS_DRIFT, DAY, DIFFICULTY_EXCHANGE, METRIC_START, PASS_THRESHOLDS, SYSTEMS } from '../data/balance';
import { EVENT_CARDS, type EventCard } from '../data/events';
import type { DifficultyId, MissionMetrics, SpecialistId, TaskDef } from '../model';
import type { Rng } from './rng';
import type { DestinationId } from '../model';

export type AssignmentSystem = 'life' | 'power' | 'research' | 'farm';

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
  life: { icon: 'water', accent: '#6fd4e6', blurb: 'Keep the air clean and the water flowing.' },
  power: { icon: 'lightning', accent: '#f2b544', blurb: 'Make sure the Moon base has enough electricity.' },
  research: { icon: 'notepad', accent: '#ba9df0', blurb: 'Find Moon clues and send them to Earth.' },
  farm: { icon: 'sickle', accent: '#9bd15a', blurb: 'Grow enough tasty potatoes for the crew.' },
};

const ROLE_SYSTEM: Record<SpecialistId, AssignmentSystem> = {
  repairman: 'power',
  farmer: 'farm',
  traveller: 'life',
  researcher: 'research',
};

export function specialistBonus(role: SpecialistId, system: AssignmentSystem): number {
  return ROLE_SYSTEM[role] === system ? 3 : 0;
}

export function createMetrics(): MissionMetrics {
  return { ...METRIC_START };
}

export function systemOfTask(task: TaskDef): AssignmentSystem {
  if (task.system) return task.system;
  if (['reactor', 'upper-engine', 'lower-engine', 'electrical'].includes(task.roomId)) return 'power';
  if (['o2', 'medbay', 'shields'].includes(task.roomId) || task.kind === 'shield') return 'life';
  if (task.roomId === 'cafeteria') return 'farm';
  return 'research';
}

export function assignmentOffer(task: TaskDef): AssignmentOffer {
  const system = systemOfTask(task);
  return {
    taskId: task.id,
    name: task.name,
    roomId: task.roomId,
    system,
    ...SYSTEM_META[system],
  };
}

export function offersForDay(tasks: TaskDef[], role: SpecialistId, rng: Rng, recentlyAssigned: string[] = []): AssignmentOffer[] {
  const groups = new Map<AssignmentSystem, TaskDef[]>();
  for (const task of rng.shuffle(tasks)) {
    const system = systemOfTask(task);
    const group = groups.get(system) ?? [];
    if (group.length < 2) group.push(task);
    groups.set(system, group);
  }
  const recent = new Set(recentlyAssigned);
  const pairs = [...groups.entries()].sort(([systemA, a], [systemB, b]) => {
    const freshness = (group: TaskDef[]) => group.filter(task => !recent.has(task.id)).length;
    return Number(systemB === ROLE_SYSTEM[role]) - Number(systemA === ROLE_SYSTEM[role])
      || freshness(b) - freshness(a);
  });
  return pairs.flatMap(([, group]) => group).slice(0, DAY.offerCount).map(assignmentOffer);
}

export function eventForDay(rng: Rng, destination: DestinationId = 'moon', day = 1, recentIds: string[] = []): EventCard {
  if (day === 1) return EVENT_CARDS.find(event => event.id === 'oxygen-alarm')!;
  const available = EVENT_CARDS.filter(event => !event.destinations || event.destinations.includes(destination));
  const fresh = available.filter(event => !recentIds.includes(event.id));
  return rng.pick(fresh.length ? fresh : available);
}

export function applyEvent(metrics: MissionMetrics, event: EventCard): MissionMetrics {
  return applyMetricExchange(metrics, event.deltas);
}

export function applyMetricExchange(metrics: MissionMetrics, deltas: Partial<MissionMetrics>): MissionMetrics {
  const next = { ...metrics };
  for (const [key, delta] of Object.entries(deltas)) {
    const metric = key as keyof MissionMetrics;
    next[metric] = clamp(next[metric] + (delta ?? 0));
  }
  return next;
}

export function applyDailyOperations(metrics: MissionMetrics, role?: SpecialistId): MissionMetrics {
  return applyMetricExchange(metrics, {
    ...DAILY_OPERATIONS_DRIFT,
    life: DAILY_OPERATIONS_DRIFT.life * (role === 'farmer' ? 0.5 : 1),
    power: DAILY_OPERATIONS_DRIFT.power * (role === 'repairman' ? 0.5 : 1),
  });
}

export function metricDeltas(metrics: MissionMetrics, next: MissionMetrics): Partial<MissionMetrics> {
  const deltas: Partial<MissionMetrics> = {};
  for (const key of Object.keys(metrics) as (keyof MissionMetrics)[]) {
    const delta = Math.round(next[key] - metrics[key]);
    if (delta !== 0) deltas[key] = delta;
  }
  return deltas;
}

export function taskExchange(task: TaskDef, role: SpecialistId, difficulty: DifficultyId): Partial<MissionMetrics> {
  const system = systemOfTask(task);
  const { benefit, cost } = DIFFICULTY_EXCHANGE[difficulty];
  return {
    [system]: (task.cost ? benefit : 6) + specialistBonus(role, system),
    ...(task.cost ? { [task.cost]: -cost } : {}),
  };
}

export function applyTaskCompletion(
  metrics: MissionMetrics, task: TaskDef, role: SpecialistId, difficulty: DifficultyId = 'crew',
): MissionMetrics {
  return applyMetricExchange(metrics, taskExchange(task, role, difficulty));
}

export function applyMissedDay(metrics: MissionMetrics, role: SpecialistId): MissionMetrics {
  const next = { ...metrics };
  const farmerMitigation = role === 'farmer' ? 0.5 : 1;
  const repairMitigation = role === 'repairman' ? 0.6 : 1;
  next.life = clamp(next.life - Math.round(6 * farmerMitigation));
  next.power = clamp(next.power - Math.round(5 * repairMitigation));
  next.farm = clamp(next.farm - Math.round(6 * farmerMitigation));
  next.research = clamp(next.research - 2);
  return next;
}

export function systemHealth(metrics: MissionMetrics, systemId: 'life' | 'power' | 'research' | 'farm'): number {
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
    requirement('life', 'Life', metrics.life, PASS_THRESHOLDS.life),
    requirement('power', 'Power', metrics.power, PASS_THRESHOLDS.power),
    requirement('research', 'Research', metrics.research, PASS_THRESHOLDS.research),
    requirement('farm', 'Farm', metrics.farm, PASS_THRESHOLDS.farm),
  ];
  return { passed: requirements.every(item => item.met), requirements, completion };
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function requirement(key: string, label: string, value: number, target: number): Requirement {
  return { key, label, value: Math.round(value), target: Math.round(target), met: value >= target };
}
