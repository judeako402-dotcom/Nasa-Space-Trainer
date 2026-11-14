import { describe, expect, it } from 'vitest';
import { isUnpressurizedHazard } from '../src/app/state';
import { surfaceHabitatFor } from '../src/data/surfaceHabitat';
import { defaultSave, exportSaveJson, parseImportedSaveJson } from '../src/model';

describe('Save export / import recovery', () => {
  it('round-trips a save through the portable recovery envelope', () => {
    const save = {
      ...defaultSave(),
      name: 'Cmdr. Yukon',
      certified: true,
      trainingComplete: true,
      trainingRank: 'S' as const,
      examBest: 100,
      specialist: 'researcher' as const,
      destination: 'moon' as const,
    };

    const raw = exportSaveJson(save);
    const parsed = parseImportedSaveJson(raw);

    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      version: 8,
      name: 'Cmdr. Yukon',
      certified: true,
      trainingComplete: true,
      trainingRank: 'S',
      examBest: 100,
      specialist: 'researcher',
      destination: 'moon',
    });
  });

  it('normalizes direct save objects and rejects malformed or unrelated JSON payloads', () => {
    expect(parseImportedSaveJson('not-json')).toBeNull();
    expect(parseImportedSaveJson('[]')).toBeNull();
    expect(parseImportedSaveJson(JSON.stringify({ app: 'other-app' }))).toBeNull();

    const direct = parseImportedSaveJson(JSON.stringify({
      name: 'Tater Prime',
      colorId: 'invalid-color',
      options: { showFps: true, masterVolume: 180 },
    }));
    expect(direct).not.toBeNull();
    expect(direct?.name).toBe('Tater Prime');
    expect(direct?.colorId).toBe(defaultSave().colorId);
    expect(direct?.options.showFps).toBe(true);
    expect(direct?.options.masterVolume).toBe(100);
  });
});

describe('EVA vacuum hazard detection & outdoor Explorer staging', () => {
  it('flags unsealed airlock/exterior zones and clears hazard when helmet is sealed or indoors', () => {
    expect(isUnpressurizedHazard('Central Hub', false, { x: 1000, y: 1000 })).toBe(false);
    expect(isUnpressurizedHazard('Airlock', false, { x: 1700, y: 1500 })).toBe(true);
    expect(isUnpressurizedHazard('Landing Pad', false, { x: 1700, y: 1700 })).toBe(true);
    expect(isUnpressurizedHazard('Landing Pad', true, { x: 1700, y: 1700 })).toBe(false);
    expect(isUnpressurizedHazard('Central Hub', false, { x: 1680, y: 1850 })).toBe(true);
  });

  it('stages Rover Explorer inside the Landing Pad perimeter above the bulkhead wall', () => {
    const moonHab = surfaceHabitatFor('moon');
    const rover = moonHab.crew.find((member) => member.id === 'rover');
    expect(rover).toBeDefined();
    expect(rover?.exteriorOnly).toBe(false);
    expect(rover?.patrolBounds).toEqual({ x: 1476, y: 1380, width: 416, height: 296 });
    expect((rover?.patrolBounds?.y ?? 0) + (rover?.patrolBounds?.height ?? 0)).toBeLessThan(1760);
    expect(rover?.futureIntegration).toMatchObject({
      roleTag: 'explorer',
      status: 'staged',
      missionKind: 'eva-sortie',
    });
  });
});
