import { describe, expect, it } from 'vitest';
import { DAY, PASS_THRESHOLDS, VISION } from '../src/data/balance';
import { TRAINING_DECK } from '../src/data/trainingDeck';
import { SURFACE_HABITAT } from '../src/data/surfaceHabitat';
import { EVENT_CARDS } from '../src/data/events';
import {
  DEFAULT_OPTIONS, SAVE_KEY, SPECIALISTS, TASKS,
  loadSave, migrateMetrics, penaltyMaxDays, persistSave, taskById, trialMaxDays,
} from '../src/model';
import {
  applyDailyOperations, applyEvent, applyMissedDay, applyTaskCompletion, createMetrics, evaluateMission, eventForDay,
  offersForDay, systemHealth,
} from '../src/sim/mission';
import { applySpecialistSpeed, createPlayerState, normalizeInput, stepPlayer } from '../src/sim/movement';
import { MapGeometry } from '../src/sim/navigation';
import { castVision } from '../src/sim/occluders';
import { createRng, seedFor } from '../src/sim/rng';
import { createInitialExam, createMissionState, createTrainingState, remainingShiftMs } from '../src/app/state';

describe('application state factories', () => {
  it('keeps the clock steady through a pause and expires at zero', () => {
    const shift = { shiftDurationMs: 180_000, dayStartedAt: 10_000, pausedDuration: 5_000, pauseStartedAt: 75_000 };
    expect(remainingShiftMs(shift, 100_000)).toBe(120_000);
    shift.pausedDuration += 100_000 - shift.pauseStartedAt;
    shift.pauseStartedAt = 0;
    expect(remainingShiftMs(shift, 101_000)).toBe(119_000);
    expect(remainingShiftMs(shift, 220_000)).toBe(0);
  });

  it('creates independent mission and training sessions', () => {
    const first = createMissionState();
    first.metrics.life = 0;
    first.tasks.push('shields');
    const second = createMissionState();
    expect(second.metrics.life).toBeGreaterThan(0);
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
    expect(next).toMatchObject({ life: 78.5, power: 74.5, research: 30, farm: 77 });
    expect(before.power).toBe(76);
  });

  it('keeps lunar dust events active on The Moon with no Mars hazards', () => {
    const lunar = Array.from({ length: 100 }, (_, seed) => eventForDay(createRng(seed + 17), 'moon', 2).id);
    expect(lunar).not.toContain('mars-dust-storm');
    expect(lunar).toContain('lunar-dust-intrusion');
    expect(eventForDay(createRng(2), 'moon', 1).id).toBe('oxygen-alarm');
    expect(eventForDay(createRng(23), 'moon', 2, ['solar-flare']).id).not.toBe('solar-flare');
  });

  it('makes hazard responses trade different survival costs against science', () => {
    const flare = EVENT_CARDS.find(event => event.id === 'solar-flare')!;
    const protectedPlan = applyEvent(createMetrics(), { ...flare, deltas: flare.responses![0]!.deltas });
    const surveyPlan = applyEvent(createMetrics(), { ...flare, deltas: flare.responses![1]!.deltas });
    expect(protectedPlan.life).toBeGreaterThan(surveyPlan.life);
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
  it('offers six unique assignments with role-preferred systems first', () => {
    const offers = offersForDay(TASKS, 'farmer', createRng(seedFor(1, 0)));
    expect(offers).toHaveLength(DAY.offerCount);
    expect(new Set(offers.map(offer => offer.taskId)).size).toBe(DAY.offerCount);
    expect(offers[0]!.system).toBe('farm');
  });

  it('offers three pairs of tasks in their dedicated rooms', () => {
    for (const specialist of SPECIALISTS) {
      const offers = offersForDay(TASKS, specialist.id, createRng(seedFor(1, 0)));
      expect(new Set(offers.map(offer => offer.system)).size).toBe(3);
      const rooms = { life: 'medbay', power: 'reactor', research: 'communications', farm: 'cafeteria' };
      for (let index = 0; index < offers.length; index += 2) {
        expect(offers[index]!.system).toBe(offers[index + 1]!.system);
        expect(offers[index]!.roomId).toBe(rooms[offers[index]!.system]);
        expect(offers[index + 1]!.roomId).toBe(rooms[offers[index]!.system]);
      }
    }
  });

  it('clamps event effects to the metric limits', () => {
    const metrics = createMetrics();
    metrics.life = 4;
    const next = applyEvent(metrics, {
      id: 'test', name: 'Test', kind: 'hazard', description: '', effect: '', deltas: { life: -20 },
    });
    expect(next.life).toBe(0);
  });

  it('applies specialist mitigation to missed days', () => {
    const metrics = createMetrics();
    const repairman = applyMissedDay(metrics, 'repairman');
    const traveller = applyMissedDay(metrics, 'traveller');
    expect(applyMissedDay(metrics, 'farmer').life).toBeGreaterThan(traveller.life);
    expect(repairman.power).toBeGreaterThan(traveller.power);
  });

  it('awards system progress for a completed assignment', () => {
    const metrics = createMetrics();
    const task = taskById('shields')!;
    const next = applyTaskCompletion(metrics, task, 'repairman');
    expect(next.life).toBeGreaterThan(metrics.life);
    expect(systemHealth(next, 'life')).toBeGreaterThan(systemHealth(metrics, 'life'));
  });

  it('passes only when completion and every metric meet their targets', () => {
    const strong = {
      life: 100, power: 100, research: 100, farm: 100,
    };
    const verdict = evaluateMission(strong, 10, 10);
    expect(verdict.passed).toBe(true);
    expect(verdict.requirements.every(item => item.met)).toBe(true);
  });

  it('fails the verdict when research is below target', () => {
    const weak = {
      life: PASS_THRESHOLDS.life,
      power: PASS_THRESHOLDS.power,
      research: PASS_THRESHOLDS.research - 1,
      farm: PASS_THRESHOLDS.farm,
    };
    const verdict = evaluateMission(weak, 10, 10);
    expect(verdict.passed).toBe(false);
    expect(verdict.requirements.find(item => item.key === 'research')?.met).toBe(false);
  });
});

describe('save options & showFps persistence', () => {
  const withMockStorage = (initial: Record<string, string>, fn: () => void) => {
    const store = new Map<string, string>(Object.entries(initial));
    const prevDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, val: string) => {
          store.set(key, val);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
    try {
      fn();
    } finally {
      if (prevDesc) {
        Object.defineProperty(globalThis, 'localStorage', prevDesc);
      } else {
        delete (globalThis as Record<string, unknown>).localStorage;
      }
    }
  };

  it('scales trial duration and extension days by difficulty and limits metrics to the four core pillars', () => {
    expect(trialMaxDays('cadet')).toBe(3);
    expect(trialMaxDays('crew')).toBe(5);
    expect(trialMaxDays('veteran')).toBe(7);
    expect(penaltyMaxDays('cadet')).toBe(3);
    expect(penaltyMaxDays('crew')).toBe(5);
    expect(penaltyMaxDays('veteran')).toBe(7);
    expect(Object.keys(createMetrics()).sort()).toEqual(['farm', 'life', 'power', 'research']);
  });

  it('migrates legacy 6-metric saves cleanly into life, power, research, and farm', () => {
    const migrated = migrateMetrics({
      oxygen: 90,
      water: 70,
      hull: 80,
      power: 65,
      research: 42,
      starch: 84,
      morale: 72,
    });
    expect(Object.keys(migrated).sort()).toEqual(['farm', 'life', 'power', 'research']);
    expect(migrated.life).toBe(80);
    expect(migrated.power).toBe(65);
    expect(migrated.research).toBe(42);
    expect(migrated.farm).toBe(84);
  });

  it('defaults showFps and tutorialComplete to false and persists tutorialComplete when set', () => {
    expect(DEFAULT_OPTIONS.showFps).toBe(false);
    withMockStorage({}, () => {
      const fresh = loadSave();
      expect(fresh.options.showFps).toBe(false);
      expect(fresh.tutorialComplete).toBe(false);
      fresh.tutorialComplete = true;
      expect(persistSave(fresh)).toBe(true);
      expect(loadSave().tutorialComplete).toBe(true);
    });
  });

  it('persists and restores showFps when true, false, or omitted', () => {
    withMockStorage(
      { [SAVE_KEY]: JSON.stringify({ options: { showFps: true } }) },
      () => expect(loadSave().options.showFps).toBe(true),
    );
    withMockStorage(
      { [SAVE_KEY]: JSON.stringify({ options: { showFps: false } }) },
      () => expect(loadSave().options.showFps).toBe(false),
    );
    withMockStorage(
      { [SAVE_KEY]: JSON.stringify({ options: { masterVolume: 50 } }) },
      () => expect(loadSave().options.showFps).toBe(false),
    );
  });

  it('preserves a shift draft and restores the saved clock and position after launch', () => {
    const eventBase = createMetrics();
    const activeTrial = {
      phase: 'playing', day: 14, penaltyDay: 2, totalAssigned: 0, totalCompleted: 0, missedDays: 0,
      metrics: eventBase, tasks: [], completed: [], eventId: 'solar-flare', eventChoiceId: 'continue',
      reports: [], report: null, planning: { eventBase, selected: ['shields', 'garbage'] },
    };
    withMockStorage({ [SAVE_KEY]: JSON.stringify({ trialDay: 16, activeTrial }) }, () => {
      const save = loadSave();
      expect(save.trialDay).toBe(16);
      expect(save.activeTrial?.planning).toEqual(activeTrial.planning);
      expect(save.activeTrial?.eventChoiceId).toBe('continue');
      expect(save.activeTrial?.shiftDurationMs).toBeUndefined();
      expect(save.activeTrial?.remainingMs).toBeUndefined();
      save.activeTrial = {
        ...save.activeTrial!, planning: undefined, tasks: ['shields', 'garbage'],
        shiftDurationMs: 129_600, remainingMs: 22_100, position: { x: 416, y: 1312 },
      };
      expect(persistSave(save)).toBe(true);
      expect(loadSave().activeTrial).toMatchObject({
        shiftDurationMs: 129_600, remainingMs: 22_100, eventChoiceId: 'continue', position: { x: 416, y: 1312 },
      });
    });
  });
});
