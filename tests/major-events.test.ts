import { describe, expect, it } from 'vitest';
import { solarEventFromDonkiReport } from '../src/data/donki';
import { DEFAULT_OPTIONS, SAVE_KEY, defaultSave, loadSave, persistSave } from '../src/model';
import type { DifficultyId, DonkiReport } from '../src/model';
import { applyEvent, createMetrics, eventForDay } from '../src/sim/mission';
import {
  createMajorEventRun, majorEventChance, majorEventForReport,
  storeMajorEventReports, takeNextMajorEvent,
} from '../src/sim/majorEvents';
import { createRng } from '../src/sim/rng';
import { createMissionState } from '../src/app/state';

const report = (id: string, type: DonkiReport['type'], date: string): DonkiReport => ({
  id,
  type,
  date,
  url: `https://api.nasa.gov/DONKI/${type}`,
  summary: `${type} report ${id}`,
});

const datedReports = [
  report('oldest', 'GST', '2026-11-11T00:00:00.000Z'),
  report('newest', 'SEP', '2026-11-14T00:00:00.000Z'),
  report('middle', 'CME', '2026-11-12T00:00:00.000Z'),
];

describe('difficulty-based major events', () => {
  it('initializes the trial event run from the difficulty selected in the menu', () => {
    expect(createMissionState('cadet').majorEventRun.difficulty).toBe('cadet');
    expect(createMissionState('crew').majorEventRun.difficulty).toBe('crew');
    expect(createMissionState('veteran').majorEventRun.difficulty).toBe('veteran');
  });

  it('maps the menu difficulties to the requested independent report chances', () => {
    expect((['cadet', 'crew', 'veteran'] as DifficultyId[]).map(majorEventChance))
      .toEqual([0.15, 0.3, 0.5]);
  });

  it('guarantees at least 1, 2, and 3 emergency events for cadet, crew, and veteran difficulties', () => {
    const pool = [
      report('r1', 'FLR', '2026-11-14T00:00:00.000Z'),
      report('r2', 'CME', '2026-11-13T00:00:00.000Z'),
      report('r3', 'SEP', '2026-11-12T00:00:00.000Z'),
      report('r4', 'GST', '2026-11-11T00:00:00.000Z'),
    ];
    for (const [difficulty, minCount] of [
      ['cadet', 1], ['crew', 2], ['veteran', 3],
    ] as const) {
      for (let seed = 0; seed < 100; seed += 1) {
        const run = storeMajorEventReports(createMajorEventRun(seed, difficulty), pool);
        const triggered = run.candidates.filter(item => item.triggered).length;
        expect(triggered).toBeGreaterThanOrEqual(minCount);
      }
    }

    const multiReportRun = storeMajorEventReports(createMajorEventRun(3, 'veteran'), datedReports);
    expect(multiReportRun.candidates).toHaveLength(3);
    expect(multiReportRun.candidates.map(item => item.report.id)).toEqual(['newest', 'middle', 'oldest']);
    expect(multiReportRun.candidates.filter(item => item.triggered)).toHaveLength(3);
  });

  it('plays triggered reports newest-first and never reuses a report', () => {
    let run: ReturnType<typeof createMajorEventRun> | undefined;
    for (let seed = 0; seed < 100; seed += 1) {
      const candidate = storeMajorEventReports(createMajorEventRun(seed, 'veteran'), datedReports);
      if (candidate.candidates.every(item => item.triggered)) {
        run = candidate;
        break;
      }
    }
    expect(run).toBeDefined();
    const played: string[] = [];
    for (let index = 0; index < datedReports.length; index += 1) {
      const next = takeNextMajorEvent(run!);
      run = next.run;
      expect(next.event?.majorEvent?.difficulty).toBe('veteran');
      played.push(next.reportId!);
    }
    expect(played).toEqual(['newest', 'middle', 'oldest']);
    const afterQueue = takeNextMajorEvent(run!);
    expect(afterQueue.event).toBeNull();
    expect(afterQueue.run.nextCandidateIndex).toBe(datedReports.length);
  });

  it('applies type-specific low and high severity impacts to station metrics', () => {
    const cases: Array<{ type: DonkiReport['type']; metric: keyof ReturnType<typeof createMetrics> }> = [
      { type: 'FLR', metric: 'power' },
      { type: 'CME', metric: 'life' },
      { type: 'SEP', metric: 'life' },
      { type: 'GST', metric: 'farm' },
    ];
    for (const item of cases) {
      const source = report(`type-${item.type}`, item.type, '2026-11-14T00:00:00.000Z');
      const low = solarEventFromDonkiReport(source, 'cadet');
      const high = solarEventFromDonkiReport(source, 'veteran');
      expect(low.majorEvent?.severity).toBe('low');
      expect(high.majorEvent?.severity).toBe('high');
      expect(high.deltas[item.metric]!).toBeLessThan(low.deltas[item.metric]!);
      expect(applyEvent(createMetrics(), high)[item.metric])
        .toBeLessThan(applyEvent(createMetrics(), low)[item.metric]);
    }
  });

  it('rolls deterministic Space Apps practice alerts when no DONKI reports are available', () => {
    const run = storeMajorEventReports(createMajorEventRun(0, 'crew'), []);
    expect(run.reportsLoaded).toBe(true);
    expect(run.candidates).toHaveLength(4);
    expect(takeNextMajorEvent(run).event?.source?.simulated).toBe(true);
    expect(storeMajorEventReports(createMajorEventRun(0, 'crew'), [])).toEqual(run);
    expect(eventForDay(createRng(17), 'moon', 2).id).not.toBe('solar-flare');
  });

  it('persists candidate results and queue position across save/resume', () => {
    const store = new Map<string, string>();
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    try {
      let run: ReturnType<typeof createMajorEventRun> | undefined;
      for (let seed = 0; seed < 100; seed += 1) {
        const candidate = storeMajorEventReports(createMajorEventRun(seed, 'crew'), datedReports);
        if (candidate.candidates.filter(item => item.triggered).length >= 2) {
          run = candidate;
          break;
        }
      }
      expect(run).toBeDefined();
      const first = takeNextMajorEvent(run!);
      const saved = defaultSave();
      saved.options = { ...DEFAULT_OPTIONS, difficulty: 'crew' };
      saved.activeTrial = {
        phase: 'playing', day: 1, penaltyDay: 0, totalAssigned: 0, totalCompleted: 0, missedDays: 0,
        metrics: createMetrics(), tasks: [], completed: [], eventId: first.event?.id ?? null,
        reports: [], report: null, majorEventRun: first.run, donkiReport: first.event?.source,
        planning: {
          eventBase: createMetrics(), selected: [], majorEventReportId: first.reportId,
        },
      };
      expect(persistSave(saved)).toBe(true);

      const resumed = loadSave().activeTrial!;
      expect(resumed.majorEventRun).toEqual(first.run);
      expect(majorEventForReport(resumed.majorEventRun!, first.reportId)?.source?.id).toBe(first.reportId);
      const next = takeNextMajorEvent(resumed.majorEventRun!);
      expect(next.reportId).not.toBe(first.reportId);
      expect(next.run.nextCandidateIndex).toBeGreaterThan(first.run.nextCandidateIndex);
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
      else delete (globalThis as Record<string, unknown>).localStorage;
    }
  });
});
