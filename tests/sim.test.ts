import { describe, expect, it } from 'vitest';
import { DAY, PASS_THRESHOLDS, VISION } from '../src/data/balance';
import { TRAINING_DECK } from '../src/data/trainingDeck';
import { SURFACE_HABITAT } from '../src/data/surfaceHabitat';
import { EVENT_CARDS } from '../src/data/events';
import { TASKS, taskById } from '../src/model';
import {
  applyDailyOperations, applyEvent, applyMissedDay, applyTaskCompletion, createMetrics, evaluateMission, eventForDay,
  offersForDay, systemHealth,
} from '../src/sim/mission';
import { applySpecialistSpeed, createPlayerState, normalizeInput, stepPlayer } from '../src/sim/movement';
import { MapGeometry } from '../src/sim/navigation';
import { castVision } from '../src/sim/occluders';
import { createRng, seedFor } from '../src/sim/rng';
import { createInitialExam, createMissionState, createTrainingState } from '../src/app/state';

describe('application state factories', () => {
  it('creates independent mission and training sessions', () => {
    const first = createMissionState();
    first.metrics.oxygen = 0;
    first.tasks.push('shields');
    const second = createMissionState();
    expect(second.metrics.oxygen).toBeGreaterThan(0);
    expect(second.tasks).toEqual([]);
    expect(createTrainingState().completed).toEqual([]);
  });

  it('starts each exam with clean progress', () => {
    expect(createInitialExam()).toEqual({
      questions: [], index: 0, score: 0, selected: [], submitted: false, missed: [],
    });
  });
});

describe('movement', () => {
  it('normalizes diagonal input to unit length', () => {
    const input = normalizeInput(1, 1);
    expect(Math.hypot(input.x, input.y)).toBeCloseTo(1, 6);
    expect(input.x).toBeCloseTo(input.y, 6);
  });

  it('returns a zero vector when there is no input', () => {
    expect(normalizeInput(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('moves exactly speed * dt in a fixed step', () => {
    const state = createPlayerState(100, 100);
    stepPlayer(state, { axisX: 1, axisY: 0, moveRequest: null }, 1 / 60, 240, () => true);
    expect(state.x).toBeCloseTo(104, 5);
    expect(state.y).toBe(100);
    expect(state.facing).toBe(1);
    expect(state.moving).toBe(true);
  });

  it('stops instantly when input is released', () => {
    const state = createPlayerState(100, 100);
    stepPlayer(state, { axisX: 1, axisY: 0, moveRequest: null }, 1 / 60, 240, () => true);
    const stoppedAt = state.x;
    stepPlayer(state, { axisX: 0, axisY: 0, moveRequest: null }, 1 / 60, 240, () => true);
    expect(state.x).toBe(stoppedAt);
    expect(state.moving).toBe(false);
  });

  it('flips facing when moving left', () => {
    const state = createPlayerState(100, 100);
    stepPlayer(state, { axisX: -1, axisY: 0, moveRequest: null }, 1 / 60, 240, () => true);
    expect(state.facing).toBe(-1);
  });

  it('slides along a blocked axis instead of passing through walls', () => {
    const state = createPlayerState(100, 100);
    const canStand = (x: number, y: number) => x < 100 || y > 101;
    stepPlayer(state, { axisX: 1, axisY: 1, moveRequest: null }, 1 / 60, 240, canStand);
    expect(state.x).toBe(100);
    expect(state.y).toBeGreaterThan(101);
    expect(state.moving).toBe(true);
  });

  it('walks a queued route to its destination', () => {
    const state = createPlayerState(0, 0);
    stepPlayer(state, { axisX: 0, axisY: 0, moveRequest: { x: 150, y: 0 } }, 1 / 60, 300, () => true);
    for (let index = 0; index < 60; index += 1) {
      stepPlayer(state, { axisX: 0, axisY: 0, moveRequest: null }, 1 / 60, 300, () => true);
    }
    expect(state.x).toBeCloseTo(150, 1);
    expect(state.route).toHaveLength(0);
  });

  it('uses specialist speed and marks waypoint movement as moving', () => {
    const state = createPlayerState(0, 0);
    applySpecialistSpeed(state, 'traveller');
    stepPlayer(state, { axisX: 0, axisY: 0, moveRequest: { x: 150, y: 0 } }, 1 / 60, 300, () => true);
    expect(state.x).toBeCloseTo(5.9, 5);
    expect(state.moving).toBe(true);
  });

  it('does not walk through a blocked waypoint route', () => {
    const state = createPlayerState(100, 100);
    const canStand = (x: number) => x < 150;
    for (let index = 0; index < 30; index += 1) {
      stepPlayer(
        state,
        { axisX: 0, axisY: 0, moveRequest: index === 0 ? { x: 200, y: 100 } : null },
        1 / 60,
        300,
        canStand,
      );
    }
    expect(state.x).toBeLessThan(150);
    expect(state.route).toHaveLength(1);
  });
});

describe('navigation', () => {
  const geometry = new MapGeometry(TRAINING_DECK, 13, 17, 25);

  it('finds a walkable route across the Training Deck', () => {
    const path = geometry.findPath(TRAINING_DECK.spawn, { x: 340, y: 900 });
    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1]!;
    expect(geometry.canStand(last.x, last.y)).toBe(true);
  });

  it('reaches the bridge and the airlock from the spawn', () => {
    expect(geometry.findPath(TRAINING_DECK.spawn, { x: 900, y: 230 }).length).toBeGreaterThan(0);
    expect(geometry.findPath(TRAINING_DECK.spawn, { x: 1440, y: 850 }).length).toBeGreaterThan(0);
  });

  it('returns no route for a point outside the deck', () => {
    expect(geometry.findPath(TRAINING_DECK.spawn, { x: -500, y: -500 })).toEqual([]);
  });

  it('keeps the spawn clear of solid props', () => {
    expect(geometry.canStand(TRAINING_DECK.spawn.x, TRAINING_DECK.spawn.y)).toBe(true);
  });
});

describe('surface mission and destination science', () => {
  it('applies daily life-support use and maintenance without treating gauges as percentages', () => {
    const before = createMetrics();
    const next = applyDailyOperations(before);
    expect(next).toMatchObject({ power: 73, oxygen: 81, water: 75, starch: 77, morale: 71, research: 8 });
    expect(next.hull).toBe(79.5);
    expect(before.power).toBe(74);
  });

  it('keeps the lunar and Martian dust events on their matching destination', () => {
    const lunar = Array.from({ length: 100 }, (_, seed) => eventForDay(createRng(seed + 17), 'moon', 2).id);
    const martian = Array.from({ length: 100 }, (_, seed) => eventForDay(createRng(seed + 17), 'mars', 2).id);
    expect(lunar).not.toContain('mars-dust-storm');
    expect(martian).not.toContain('lunar-dust-intrusion');
    expect(lunar).toContain('lunar-dust-intrusion');
    expect(martian).toContain('mars-dust-storm');
    expect(eventForDay(createRng(2), 'mars', 1).id).toBe('oxygen-alarm');
    expect(eventForDay(createRng(23), 'moon', 2, ['solar-flare']).id).not.toBe('solar-flare');
  });

  it('makes hazard responses trade different survival costs against science', () => {
    const flare = EVENT_CARDS.find(event => event.id === 'solar-flare')!;
    const protectedPlan = applyEvent(createMetrics(), { ...flare, deltas: flare.responses![0]!.deltas });
    const surveyPlan = applyEvent(createMetrics(), { ...flare, deltas: flare.responses![1]!.deltas });
    expect(protectedPlan.hull).toBeGreaterThan(surveyPlan.hull);
    expect(surveyPlan.research).toBeGreaterThan(protectedPlan.research);
  });

  it('provides a reachable return path from the base to the EVA worksite', () => {
    const geometry = new MapGeometry(SURFACE_HABITAT, 13, 17, 25);
    const route = geometry.findPath(SURFACE_HABITAT.spawn, { x: 1450, y: 1580 });
    expect(route.length).toBeGreaterThan(0);
    expect(geometry.canStand(route.at(-1)!.x, route.at(-1)!.y)).toBe(true);
    expect(SURFACE_HABITAT.interactions.filter(item => item.roomId === 'exterior')).toHaveLength(3);
  });

  it('keeps all mission assignment stations reachable from the crew spawn', () => {
    const geometry = new MapGeometry(SURFACE_HABITAT, 13, 17, 25);
    const unreachable = TASKS.filter(task => geometry.findPath(SURFACE_HABITAT.spawn, task).length === 0).map(task => task.id);
    expect(unreachable).toEqual([]);
  });
});

describe('vision', () => {
  it('casts the full radius when nothing blocks the ray', () => {
    const polygon = castVision({ x: 0, y: 0 }, VISION.radius, [], 16);
    expect(polygon).toHaveLength(16);
    for (const point of polygon) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(VISION.radius, 4);
    }
  });

  it('clips rays against a wall segment', () => {
    const wall = { ax: -100, ay: 50, bx: 100, by: 50 };
    const polygon = castVision({ x: 0, y: 0 }, 200, [wall], 8);
    const upward = polygon.find(point => point.y < 0 && Math.abs(point.x) < 0.001);
    expect(upward).toBeDefined();
    expect(Math.hypot(upward!.x, upward!.y)).toBeLessThanOrEqual(200);
  });
});

describe('mission simulation', () => {
  it('offers five unique assignments with role-preferred systems first', () => {
    const offers = offersForDay(TASKS, 'farmer', createRng(seedFor(1, 0)));
    expect(offers).toHaveLength(DAY.offerCount);
    expect(new Set(offers.map(offer => offer.taskId)).size).toBe(DAY.offerCount);
    expect(offers[0]!.system).toBe('farming');
  });

  it('clamps event effects to the metric limits', () => {
    const metrics = createMetrics();
    metrics.oxygen = 4;
    const next = applyEvent(metrics, {
      id: 'test', name: 'Test', kind: 'hazard', description: '', effect: '', deltas: { oxygen: -20 },
    });
    expect(next.oxygen).toBe(0);
  });

  it('applies specialist mitigation to missed days', () => {
    const metrics = createMetrics();
    const repairman = applyMissedDay(metrics, 'repairman');
    const traveller = applyMissedDay(metrics, 'traveller');
    expect(repairman.oxygen).toBeGreaterThan(traveller.oxygen);
    expect(repairman.power).toBeGreaterThan(traveller.power);
  });

  it('awards system progress for a completed assignment', () => {
    const metrics = createMetrics();
    const task = taskById('shields')!;
    const next = applyTaskCompletion(metrics, task, 'repairman');
    expect(next.hull).toBeGreaterThan(metrics.hull);
    expect(systemHealth(next, 'shielding')).toBeGreaterThan(systemHealth(metrics, 'shielding'));
  });

  it('passes only when completion and every metric meet their targets', () => {
    const strong = {
      power: 100, oxygen: 100, water: 100, starch: 100, hull: 100, morale: 100, research: 100,
    };
    const verdict = evaluateMission(strong, 10, 10);
    expect(verdict.passed).toBe(true);
    expect(verdict.requirements.every(item => item.met)).toBe(true);
  });

  it('fails the verdict when research is below target', () => {
    const weak = {
      power: PASS_THRESHOLDS.power,
      oxygen: PASS_THRESHOLDS.oxygen,
      water: PASS_THRESHOLDS.water,
      starch: PASS_THRESHOLDS.starch,
      hull: PASS_THRESHOLDS.hull,
      morale: PASS_THRESHOLDS.morale,
      research: PASS_THRESHOLDS.research - 1,
    };
    const verdict = evaluateMission(weak, 10, 10);
    expect(verdict.passed).toBe(false);
    expect(verdict.requirements.find(item => item.key === 'research')?.met).toBe(false);
  });
});
