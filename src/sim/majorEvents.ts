import type { DifficultyId, DonkiReport, MajorEventRun } from '../model';
import { isDonkiEmergencyType, solarEventFromDonkiReport } from '../data/donki';
import type { EventCard } from '../data/events';
import { createRng } from './rng';

const MAJOR_EVENT_CHANCES: Record<DifficultyId, number> = {
  cadet: 0.15,
  crew: 0.3,
  veteran: 0.5,
};

export const MIN_MAJOR_EVENTS: Record<DifficultyId, number> = {
  cadet: 1,
  crew: 3,
  veteran: 5,
};

export function createMajorEventRun(seed = randomSeed(), difficulty: DifficultyId = 'crew'): MajorEventRun {
  return {
    seed: seed >>> 0,
    difficulty,
    reportsLoaded: false,
    candidates: [],
    nextCandidateIndex: 0,
  };
}

export function majorEventChance(difficulty: DifficultyId): number {
  return MAJOR_EVENT_CHANCES[difficulty];
}

export function storeMajorEventReports(run: MajorEventRun, reports: DonkiReport[], minimum = 1): MajorEventRun {
  if (run.reportsLoaded) return run;
  const minEvents = Math.max(MIN_MAJOR_EVENTS[run.difficulty], minimum);
  const source = reports.filter(report => isDonkiEmergencyType(report.type))
    .filter((report, index, all) => all.findIndex(item => item.id === report.id) === index);
  if (!source.length) source.push(...FALLBACK_ALERTS);
  for (const fallback of FALLBACK_ALERTS) {
    if (source.length >= minEvents) break;
    if (!source.some(item => item.id === fallback.id)) source.push(fallback);
  }
  source.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const rng = createRng(run.seed);
  const candidates = source.map(report => ({
    report,
    triggered: rng.next() < majorEventChance(run.difficulty),
  }));
  let triggeredCount = candidates.filter(c => c.triggered).length;
  if (triggeredCount < minEvents) {
    const untriggeredIndices = rng.shuffle(
      candidates.map((c, idx) => (c.triggered ? -1 : idx)).filter(idx => idx >= 0),
    );
    for (const idx of untriggeredIndices) {
      if (triggeredCount >= minEvents) break;
      candidates[idx]!.triggered = true;
      triggeredCount += 1;
    }
  }
  return {
    ...run,
    reportsLoaded: true,
    candidates,
    nextCandidateIndex: 0,
  };
}

export function takeNextMajorEvent(
  run: MajorEventRun,
): { run: MajorEventRun; event: EventCard | null; reportId?: string } {
  const index = run.candidates.findIndex((candidate, index) =>
    index >= run.nextCandidateIndex && candidate.triggered && isDonkiEmergencyType(candidate.report.type),
  );
  if (index === -1) {
    return { run: { ...run, nextCandidateIndex: run.candidates.length }, event: null };
  }
  const candidate = run.candidates[index]!;
  return {
    run: { ...run, nextCandidateIndex: index + 1 },
    event: solarEventFromDonkiReport(candidate.report, run.difficulty),
    reportId: candidate.report.id,
  };
}

export function majorEventForReport(run: MajorEventRun, reportId?: string): EventCard | null {
  if (!reportId) return null;
  const candidate = run.candidates.find(item => item.report?.id === reportId && item.triggered);
  return candidate?.report ? solarEventFromDonkiReport(candidate.report, run.difficulty) : null;
}

const FALLBACK_ALERTS: DonkiReport[] = [
  { id: 'practice-flr', type: 'FLR', date: '2000-01-05', url: '', summary: 'A flash from the Sun shook our solar power.', simulated: true },
  { id: 'practice-cme', type: 'CME', date: '2000-01-04', url: '', summary: 'A cloud from the Sun bumped our airlock shield.', simulated: true },
  { id: 'practice-sep', type: 'SEP', date: '2000-01-03', url: '', summary: 'Tiny particles from the Sun scrambled our sensors.', simulated: true },
  { id: 'practice-flr-2', type: 'FLR', date: '2000-01-02', url: '', summary: 'A secondary solar flare overloaded the relay bus.', simulated: true },
  { id: 'practice-cme-2', type: 'CME', date: '2000-01-01', url: '', summary: 'A geomagnetic wave strained the habitat bulkhead.', simulated: true },
];

function randomSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  }
  return Math.floor(Math.random() * 0x1_0000_0000);
}
