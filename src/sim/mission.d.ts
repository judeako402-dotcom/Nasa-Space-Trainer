import { type EventCard } from '../data/events';
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
export declare function createMetrics(): MissionMetrics;
export declare function systemOfTask(task: TaskDef): AssignmentSystem;
export declare function offersForDay(tasks: TaskDef[], role: SpecialistId, rng: Rng, recentlyAssigned?: string[]): AssignmentOffer[];
export declare function eventForDay(rng: Rng, destination?: DestinationId, day?: number, recentIds?: string[]): EventCard;
export declare function applyEvent(metrics: MissionMetrics, event: EventCard): MissionMetrics;
export declare function applyDailyOperations(metrics: MissionMetrics): MissionMetrics;
export declare function metricDeltas(metrics: MissionMetrics, next: MissionMetrics): Partial<MissionMetrics>;
export declare function applyTaskCompletion(metrics: MissionMetrics, task: TaskDef, role: SpecialistId): MissionMetrics;
export declare function applyMissedDay(metrics: MissionMetrics, role: SpecialistId): MissionMetrics;
export declare function systemHealth(metrics: MissionMetrics, systemId: 'power' | 'life' | 'farming' | 'shielding'): number;
export declare function evaluateMission(metrics: MissionMetrics, totalAssigned: number, totalCompleted: number): MissionVerdict;
export declare function clamp(value: number): number;
