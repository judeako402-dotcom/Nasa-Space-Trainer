import { EVENT_CARDS, type EventCard } from './events';
import type { DifficultyId, DonkiReport } from '../model';

const EVENT_TYPES = ['FLR', 'CME', 'SEP'] as const;
export type DonkiEventType = typeof EVENT_TYPES[number];
const SUCCESS_CACHE_MS = 15 * 60 * 1000;
const EMPTY_CACHE_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2500;
const DONKI_URL = 'https://api.nasa.gov/DONKI';
const CCMC_API_URL = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get';
const DONKI_EVENTS_URL = 'https://ccmc.gsfc.nasa.gov/DONKI/events';

let cached: { reports: DonkiReport[]; expiresAt: number } | null = null;
let pending: Promise<DonkiReport[]> | null = null;

export function isDonkiEmergencyType(type: DonkiReport['type']): type is DonkiEventType {
  return EVENT_TYPES.some(eventType => eventType === type);
}

function configuredProxyBase(): string | null {
  const raw = import.meta.env.VITE_DONKI_PROXY_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

async function fetchEndpointReports(
  type: DonkiEventType,
  startDate: string,
  endDate: string,
  apiKey: string | undefined,
  fetcher: typeof fetch,
): Promise<DonkiReport[]> {
  const proxyBase = configuredProxyBase();
  if (proxyBase) {
    try {
      const proxyParams = new URLSearchParams({ startDate, endDate }).toString();
      const proxyUrl = `${proxyBase}/${type}?${proxyParams}`;
      const proxyResponse = await fetcher(proxyUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (proxyResponse.ok) {
        return normalizeReports(await proxyResponse.json(), type);
      }
    } catch {
      // Fall back to direct NASA DONKI endpoint when the edge cache proxy is unavailable.
    }
  }

  try {
    const url = new URL(`${apiKey ? DONKI_URL : CCMC_API_URL}/${type}`);
    url.search = new URLSearchParams({ startDate, endDate }).toString();
    if (apiKey) url.searchParams.set('api_key', apiKey);
    const response = await fetcher(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    return normalizeReports(payload, type);
  } catch {
    return [];
  }
}

export function fetchDonkiReports(
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<DonkiReport[]> {
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.reports);
  if (pending) return pending;

  const endDate = new Date(now).toISOString().slice(0, 10);
  const startDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const apiKey = import.meta.env.VITE_NASA_API_KEY?.trim();

  pending = Promise.all(
    EVENT_TYPES.map(type => fetchEndpointReports(type, startDate, endDate, apiKey, fetcher)),
  ).then(groups => {
    const reports = groups.flat()
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .filter((report, index, all) => all.findIndex(item => item.id === report.id) === index);
    cached = { reports, expiresAt: now + (reports.length ? SUCCESS_CACHE_MS : EMPTY_CACHE_MS) };
    return reports;
  }).finally(() => {
    pending = null;
  });

  return pending;
}

export function fetchLatestDonkiReport(
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<DonkiReport | null> {
  return fetchDonkiReports(now, fetcher).then(reports => reports[0] ?? null);
}

export const EVENT_NAMES: Record<DonkiReport['type'], string> = {
  FLR: 'Solar flare',
  CME: 'Coronal mass ejection',
  SEP: 'Solar energetic particle event',
  GST: 'Geomagnetic storm',
};

const SEVERITY_EFFECTS: Record<DonkiReport['type'], Record<'low' | 'high', EventCard['deltas']>> = {
  FLR: { low: { power: -4, life: -2 }, high: { power: -15, life: -9, farm: -3 } },
  CME: { low: { life: -5, power: -2 }, high: { life: -16, power: -8, farm: -3 } },
  SEP: { low: { life: -4, farm: -2 }, high: { life: -15, farm: -9, power: -4 } },
  GST: { low: { power: -4, life: -2, farm: -1 }, high: { power: -14, life: -7, farm: -7 } },
};

export function solarEventFromDonkiReport(report: DonkiReport, difficulty: DifficultyId): EventCard {
  const solarEvent = EVENT_CARDS.find(event => event.id === 'solar-flare');
  if (!solarEvent) throw new Error('The solar-flare event card is required for DONKI reports.');
  const severity = difficulty === 'veteran' ? 'high' : difficulty === 'crew' ? 'moderate' : 'low';
  const { low, high } = SEVERITY_EFFECTS[report.type];
  const effects = severity === 'high' ? high : severity === 'low' ? low
    : Object.fromEntries(Object.entries(high).map(([key, delta]) => [
        key, Math.round((delta + (low[key as keyof typeof low] ?? 0)) / 2),
      ]));
  const severityLabel = severity[0]!.toUpperCase() + severity.slice(1);
  const sourceLabel = report.simulated ? 'Practice alert inspired by NASA Space Apps' : `NASA DONKI report from ${report.date.slice(0, 10)}`;
  const addEffects = (deltas: EventCard['deltas']): EventCard['deltas'] => {
    const combined = { ...effects };
    for (const [metric, delta] of Object.entries(deltas)) {
      const key = metric as keyof EventCard['deltas'];
      combined[key] = (combined[key] ?? 0) + (delta ?? 0);
    }
    return combined;
  };
  return {
    ...solarEvent,
    name: `${severityLabel}-Severity ${EVENT_NAMES[report.type]}`,
    description: `${sourceLabel}. ${report.summary}`,
    effect: `${severityLabel}-severity ${report.type} impacts habitat systems. Values are fictional game balance.`,
    deltas: addEffects(solarEvent.deltas),
    responses: solarEvent.responses?.map(response => ({ ...response, deltas: addEffects(response.deltas) })),
    source: { ...report, url: safeDonkiUrl(report.url) },
    majorEvent: { difficulty, severity, type: report.type },
  };
}

function normalizeReports(value: unknown, type: DonkiEventType): DonkiReport[] {
  if (!Array.isArray(value)) return [];
  const dateField: Record<DonkiEventType, string> = {
    FLR: 'beginTime',
    CME: 'startTime',
    SEP: 'eventTime',
  };
  const idField: Record<DonkiEventType, string> = {
    FLR: 'flrID',
    CME: 'activityID',
    SEP: 'sepID',
  };
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const parsedDate = Date.parse(String(record[dateField[type]] ?? ''));
    if (!Number.isFinite(parsedDate)) return [];
    const date = new Date(parsedDate).toISOString();
    return [{
      id: String(record[idField[type]] ?? `${type}-${date}-${index}`),
      type,
      date,
      url: typeof record.link === 'string' ? safeDonkiUrl(record.link) : DONKI_EVENTS_URL,
      summary: typeof record.note === 'string' && record.note.trim()
        ? record.note.trim()
        : `${type} activity recorded by NASA's space-weather database.`,
    }];
  });
}

function safeDonkiUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:'
      && (url.hostname === 'api.nasa.gov' || url.hostname === 'ccmc.gsfc.nasa.gov' || url.hostname === 'kauai.ccmc.gsfc.nasa.gov')) {
      return url.toString();
    }
  } catch {
    // Use NASA's event catalog if the report has no valid NASA source link.
  }
  return DONKI_EVENTS_URL;
}
