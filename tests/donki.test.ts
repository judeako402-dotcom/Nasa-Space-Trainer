import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('NASA DONKI reports', () => {
  it('normalizes the newest report across supported types and maps it to the solar event', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const type = new URL(String(input)).pathname.split('/').pop();
      const payload = type === 'FLR'
        ? [{ flrID: 'flare-1', beginTime: '2026-11-13T04:00:00Z' }]
        : type === 'CME'
          ? [{ activityID: 'cme-1', startTime: '2026-11-14T03:00:00Z', link: 'https://example.test/cme' }]
          : type === 'SEP'
            ? [{ sepID: 'sep-1', eventTime: '2026-11-14T08:00:00Z', note: 'Particle activity reported.' }]
            : [{ gstID: 'gst-1', startTime: 'not-a-date' }];
      return new Response(JSON.stringify(payload), { status: 200 });
    });

    const { fetchLatestDonkiReport, solarEventFromDonkiReport } = await import('../src/data/donki');
    const report = await fetchLatestDonkiReport(Date.parse('2026-11-14T12:00:00Z'), fetcher);

    expect(report).toMatchObject({ id: 'sep-1', type: 'SEP', date: '2026-11-14T08:00:00.000Z' });
    expect(fetcher).toHaveBeenCalledTimes(4);
    const event = solarEventFromDonkiReport(report!);
    expect(event.id).toBe('solar-flare');
    expect(event.source).toEqual(report);
    expect(event.responses).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'shelter' }),
      expect.objectContaining({ id: 'continue' }),
    ]));
    expect(event.description).toContain('2026-11-14');
    await expect(fetchLatestDonkiReport(Date.parse('2026-11-14T12:01:00Z'), fetcher)).resolves.toEqual(report);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('does not expose a non-NASA report link', async () => {
    const { solarEventFromDonkiReport } = await import('../src/data/donki');
    const event = solarEventFromDonkiReport({
      id: 'report-1',
      type: 'FLR',
      date: '2026-11-14T08:00:00.000Z',
      url: 'javascript:alert(1)',
      summary: 'Solar activity recorded.',
    });

    expect(event.source?.url).toBe('https://api.nasa.gov/DONKI/FLR');
  });

  it('caches an empty result and preserves the deterministic fallback on failures', async () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    const fetcher = vi.fn(async () => new Response('unavailable', { status: 429 }));
    const { fetchLatestDonkiReport } = await import('../src/data/donki');

    await expect(fetchLatestDonkiReport(now, fetcher)).resolves.toBeNull();
    await expect(fetchLatestDonkiReport(now + 1000, fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
