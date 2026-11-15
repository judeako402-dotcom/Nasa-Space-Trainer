import { describe, expect, it } from 'vitest';
import { createMissionState } from '../src/app/state';
import { defaultSave, exportSaveJson, parseImportedSaveJson, TASKS } from '../src/model';
import { captureCheckpoint, criticalStatus, restoreCheckpoint } from '../src/sim/checkpoints';
import { DISASTER_REPAIRS, disasterTools, resolveDisaster } from '../src/sim/disasters';
import { applyDailyOperations, specialistBonus, taskExchange } from '../src/sim/mission';

const statuses = { life: 50, power: 50, research: 50, farm: 50 };

describe('shift checkpoints', () => {
  it('restores completed tasks, gauges, position, clock, and the pending alert', () => {
    const mission = createMissionState();
    mission.tasks = ['inspect', 'med-pipes', 'align-engine'];
    mission.completed = ['inspect'];
    mission.totalCompleted = 4;
    mission.playerX = 736;
    mission.playerY = 1376;
    mission.shiftDurationMs = 180000;
    mission.dayStartedAt = 1000;
    mission.pendingDisaster = true;
    const checkpoint = captureCheckpoint(mission, 'before-major-event', 11000);
    mission.pendingDisaster = false;
    mission.completed.push('med-pipes');
    mission.totalCompleted += 1;
    mission.metrics.life = 0;
    mission.playerX = 500;
    restoreCheckpoint(mission, checkpoint, 20000);
    expect(mission).toMatchObject({
      pendingDisaster: true, completed: ['inspect'], totalCompleted: 4,
      metrics: checkpoint.metrics, playerX: 736, playerY: 1376, dayStartedAt: 10000,
    });
  });

  it('tops low gauges up to 35 after two gauge failures at the same checkpoint', () => {
    const mission = createMissionState();
    mission.metrics.power = 4;
    const checkpoint = captureCheckpoint(mission, 'after-task', 1000);
    expect(criticalStatus({ ...mission.metrics, power: 0 })).toBe('power');
    expect(restoreCheckpoint(mission, checkpoint, 1000, 'power')).toBe(false);
    expect(mission.metrics.power).toBe(4);
    expect(restoreCheckpoint(mission, checkpoint, 1000, 'power')).toBe(true);
    expect(mission.metrics.power).toBe(35);
    expect(checkpoint.metrics.power).toBe(35);
  });

  it('round-trips a checkpoint, pending alert, tutorials, and earned medals', () => {
    const mission = createMissionState();
    mission.pendingDisaster = true;
    const checkpoint = captureCheckpoint(mission, 'before-major-event', 1000);
    const save = defaultSave();
    save.tutorialComplete = true;
    save.seenCommanderBriefings = ['landing', 'tasks', 'FLR', 'SEP', 'FLR'];
    save.seenMinigames = ['rainbow', 'wiring'];
    save.medals = 2;
    save.activeTrial = {
      ...mission, phase: 'playing', eventId: 'solar-flare', checkpoint,
      tasks: ['inspect', 'med-pipes', 'align-engine'],
    };
    expect(parseImportedSaveJson(exportSaveJson(save))).toMatchObject({
      tutorialComplete: true, seenCommanderBriefings: ['landing', 'tasks', 'FLR', 'SEP'],
      seenMinigames: ['rainbow', 'wiring'], medals: 2,
      activeTrial: { checkpoint, pendingDisaster: true },
    });
  });

  it('lets older saves encounter each Commander briefing independently', () => {
    const { seenCommanderBriefings: _, ...legacy } = defaultSave();
    expect(parseImportedSaveJson(JSON.stringify(legacy))?.seenCommanderBriefings).toEqual([]);
  });
});

describe('assignments and disaster exchanges', () => {
  it('gives each specialist a bonus in exactly one status and applies shift savings', () => {
    expect(specialistBonus('repairman', 'power')).toBe(3);
    expect(specialistBonus('farmer', 'farm')).toBe(3);
    expect(specialistBonus('researcher', 'research')).toBe(3);
    expect(specialistBonus('researcher', 'power')).toBe(0);
    expect(applyDailyOperations(statuses, 'farmer').life).toBeGreaterThan(applyDailyOperations(statuses).life);
    expect(applyDailyOperations(statuses, 'repairman').power).toBeGreaterThan(applyDailyOperations(statuses).power);
    const lights = TASKS.find(task => task.kind === 'grow-plant')!;
    expect(taskExchange(lights, 'farmer', 'cadet')).toEqual({ farm: 17, power: -2 });
    expect(taskExchange(lights, 'farmer', 'crew')).toEqual({ farm: 15, power: -4 });
    expect(taskExchange(lights, 'farmer', 'veteran')).toEqual({ farm: 13, power: -6 });
  });

  it.each([
    ['med-pipes', 'life', 'power'], ['upload-admin', 'research', 'power'], ['grow-light-balance', 'farm', 'power'],
    ['wiring-electrical', 'power', 'research'], ['power-switches', 'power', 'life'],
  ] as const)('applies the advertised tradeoff for %s', (id, gain, cost) => {
    const task = TASKS.find(item => item.id === id)!;
    const role = gain === 'research' ? 'farmer' : 'researcher';
    expect(taskExchange(task, role, 'crew')).toEqual({ [gain]: 12, [cost]: -4 });
  });

  it.each([
    ['FLR', 'power'], ['CME', 'life'], ['SEP', 'research'], ['GST', 'farm'],
  ] as const)('offers exactly one matching repair tool for %s', (type, matchingTool) => {
    const repair = DISASTER_REPAIRS[type];
    const options = disasterTools(type);
    expect(options).toEqual(type === 'GST' ? ['power', 'research', 'farm'] : ['power', 'life', 'research']);
    for (const tool of options) {
      const result = resolveDisaster({ type, difficulty: 'crew', severity: 'moderate' }, statuses, tool, 'researcher');
      if (tool !== matchingTool) expect(result).toBeNull();
      else {
        expect(result?.[repair.system]).toBeGreaterThan(statuses[repair.system]);
        expect(result?.[repair.cost]).toBe(46);
      }
    }
  });
});
