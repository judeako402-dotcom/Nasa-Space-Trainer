import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('NASA DONKI reports', () => {
  it('normalizes the newest report across supported types and maps it to the solar event', async () => {
    const sourceUrl = 'https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/49352/-1';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const type = new URL(String(input)).pathname.split('/').pop();
      const payload = type === 'FLR'
        ? [{ flrID: 'flare-1', beginTime: '2026-11-13T04:00:00Z' }]
        : type === 'CME'
          ? [{ activityID: 'cme-1', startTime: '2026-11-14T03:00:00Z', link: 'https://example.test/cme' }]
          : type === 'SEP'
            ? [
                { sepID: 'sep-1', eventTime: '2026-11-14T08:00:00Z', note: 'Particle activity reported.', link: sourceUrl },
                { sepID: 'invalid', eventTime: 'not-a-date' },
              ]
            : [];
      return new Response(JSON.stringify(payload), { status: 200 });
    });

    const { fetchDonkiReports, fetchLatestDonkiReport, solarEventFromDonkiReport } = await import('../src/data/donki');
    const report = await fetchLatestDonkiReport(Date.parse('2026-11-14T12:00:00Z'), fetcher);

    expect(report).toMatchObject({ id: 'sep-1', type: 'SEP', date: '2026-11-14T08:00:00.000Z', url: sourceUrl });
    expect(fetcher.mock.calls.map(([input]) => {
      const url = new URL(String(input));
      return url.origin + url.pathname;
    })).toEqual(['FLR', 'CME', 'SEP'].map(type => `https://ccmc.gsfc.nasa.gov/DONKI-API/get/${type}`));
    const event = solarEventFromDonkiReport(report!, 'cadet');
    expect(event.id).toBe('solar-flare');
    expect(event.source).toEqual(report);
    expect(event.responses).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'shelter' }),
      expect.objectContaining({ id: 'continue' }),
    ]));
    expect(event.description).toContain('2026-11-14');
    await expect(fetchLatestDonkiReport(Date.parse('2026-11-14T12:01:00Z'), fetcher)).resolves.toEqual(report);
    await expect(fetchDonkiReports(Date.parse('2026-11-14T12:01:00Z'), fetcher)).resolves.toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not expose a non-NASA report link', async () => {
    const { solarEventFromDonkiReport } = await import('../src/data/donki');
    const event = solarEventFromDonkiReport({
      id: 'report-1',
      type: 'FLR',
      date: '2026-11-14T08:00:00.000Z',
      url: 'javascript:alert(1)',
      summary: 'Solar activity recorded.',
    }, 'cadet');

    expect(event.source?.url).toBe('https://ccmc.gsfc.nasa.gov/DONKI/events');
  });

  it('caches an empty result and preserves the deterministic fallback on failures', async () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    const fetcher = vi.fn(async () => new Response('unavailable', { status: 429 }));
    const { fetchLatestDonkiReport } = await import('../src/data/donki');

    await expect(fetchLatestDonkiReport(now, fetcher)).resolves.toBeNull();
    await expect(fetchLatestDonkiReport(now + 1000, fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('prefers configured VITE_DONKI_PROXY_URL and falls back to api.nasa.gov on proxy error', async () => {
    vi.stubEnv('VITE_DONKI_PROXY_URL', 'https://proxy.example.test/api/donki/');
    vi.stubEnv('VITE_NASA_API_KEY', 'test-key');
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://proxy.example.test/api/donki/FLR')) {
        return new Response('upstream busy', { status: 503 });
      }
      if (url.startsWith('https://api.nasa.gov/DONKI/FLR')) {
        return new Response(JSON.stringify([{ flrID: 'flr-fallback', beginTime: '2026-11-14T09:00:00Z' }]), { status: 200 });
      }
      if (url.startsWith('https://proxy.example.test/api/donki/CME')) {
        return new Response(JSON.stringify([{ activityID: 'cme-proxy', startTime: '2026-11-14T10:00:00Z' }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    });

    const { fetchDonkiReports } = await import('../src/data/donki');
    const reports = await fetchDonkiReports(Date.parse('2026-11-14T12:00:00Z'), fetcher);

    expect(calls).toEqual(expect.arrayContaining([
      expect.stringMatching(/^https:\/\/proxy\.example\.test\/api\/donki\/FLR\?startDate=/),
      expect.stringMatching(/^https:\/\/api\.nasa\.gov\/DONKI\/FLR\?startDate=/),
      expect.stringMatching(/^https:\/\/proxy\.example\.test\/api\/donki\/CME\?startDate=/),
    ]));
    expect(calls.some((u) => u.startsWith('https://api.nasa.gov/DONKI/CME'))).toBe(false);
    expect(reports.map((r) => r.id)).toEqual(['cme-proxy', 'flr-fallback']);
  });
});
