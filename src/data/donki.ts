import { EVENT_CARDS, type EventCard } from './events';

export type DonkiEventType = 'FLR' | 'CME' | 'SEP' | 'GST';

export interface DonkiReport {
  id: string;
  type: DonkiEventType;
  date: string;
  url: string;
  summary: string;
}

const EVENT_TYPES: DonkiEventType[] = ['FLR', 'CME', 'SEP', 'GST'];
const SUCCESS_CACHE_MS = 15 * 60 * 1000;
const EMPTY_CACHE_MS = 2 * 60 * 1000;
const DONKI_URL = 'https://api.nasa.gov/DONKI';

let cached: { report: DonkiReport | null; expiresAt: number } | null = null;
let pending: Promise<DonkiReport | null> | null = null;

export function fetchLatestDonkiReport(
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<DonkiReport | null> {
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.report);
  if (pending) return pending;

  const endDate = new Date(now).toISOString().slice(0, 10);
  const startDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const apiKey = import.meta.env.VITE_NASA_API_KEY?.trim() || 'DEMO_KEY';

  pending = Promise.all(EVENT_TYPES.map(async type => {
    try {
      const url = new URL(`${DONKI_URL}/${type}`);
      url.search = new URLSearchParams({ startDate, endDate, api_key: apiKey }).toString();
      const response = await fetcher(url.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) return [];
      const payload: unknown = await response.json();
      return normalizeReports(payload, type);
    } catch {
      return [];
    }
  })).then(reports => {
    const report = reports.flat().sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? null;
    cached = { report, expiresAt: now + (report ? SUCCESS_CACHE_MS : EMPTY_CACHE_MS) };
    return report;
  }).finally(() => {
    pending = null;
  });

  return pending;
}

export function solarEventFromDonkiReport(report: DonkiReport): EventCard {
  const solarEvent = EVENT_CARDS.find(event => event.id === 'solar-flare');
  if (!solarEvent) throw new Error('The solar-flare event card is required for DONKI reports.');
  const eventNames: Record<DonkiEventType, string> = {
    FLR: 'Solar flare',
    CME: 'Coronal mass ejection',
    SEP: 'Solar energetic particle event',
    GST: 'Geomagnetic storm',
  };
  return {
    ...solarEvent,
    description: `NASA DONKI ${eventNames[report.type]} report dated ${report.date.slice(0, 10)}. ${report.summary}`,
    source: { ...report, url: safeDonkiUrl(report.url, report.type) },
  };
}

function normalizeReports(value: unknown, type: DonkiEventType): DonkiReport[] {
  if (!Array.isArray(value)) return [];
  const dateField: Record<DonkiEventType, string> = {
    FLR: 'beginTime',
    CME: 'startTime',
    SEP: 'eventTime',
    GST: 'startTime',
  };
  const idField: Record<DonkiEventType, string> = {
    FLR: 'flrID',
    CME: 'activityID',
    SEP: 'sepID',
    GST: 'gstID',
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
      url: safeDonkiUrl(typeof record.link === 'string' ? record.link : DONKI_URL, type),
      summary: typeof record.note === 'string' && record.note.trim()
        ? record.note.trim()
        : `${type} activity recorded by NASA's space-weather database.`,
    }];
  });
}

function safeDonkiUrl(value: string, type: DonkiEventType): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:'
      && (url.hostname === 'api.nasa.gov' || url.hostname === 'kauai.ccmc.gsfc.nasa.gov')) {
      return url.toString();
    }
  } catch {
    // Use NASA's API landing page if the report has no valid NASA source link.
  }
  return `${DONKI_URL}/${type}`;
}
