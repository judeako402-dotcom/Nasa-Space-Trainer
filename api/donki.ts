/**
 * Vercel Edge Function cached proxy template for NASA DONKI alerts.
 * Prevents DEMO_KEY rate limits during classroom / kiosk sessions without a database.
 *
 * Set `NASA_API_KEY` in Vercel Environment Variables and point `VITE_DONKI_PROXY_URL`
 * to `/api/donki` (with a rewrite from `/api/donki/:type` -> `/api/donki?type=:type`)
 * or `${YOUR_ORIGIN}/api/donki`.
 */

export const config = {
  runtime: 'edge',
};

const VALID_TYPES = new Set(['FLR', 'CME', 'SEP']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_TTL_SECONDS = 900;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const pathTail = url.pathname.split('/').filter(Boolean).pop()?.toUpperCase();
  const type = (url.searchParams.get('type')?.toUpperCase() || pathTail || '').trim();
  const startDate = url.searchParams.get('startDate') ?? '';
  const endDate = url.searchParams.get('endDate') ?? '';

  if (!VALID_TYPES.has(type) || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return new Response(JSON.stringify({ error: 'Invalid DONKI query parameters.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = new URL(`https://api.nasa.gov/DONKI/${type}`);
  upstream.search = new URLSearchParams({
    startDate,
    endDate,
    api_key: process.env.NASA_API_KEY?.trim() || 'DEMO_KEY',
  }).toString();

  const upstreamResponse = await fetch(upstream.toString(), {
    headers: { Accept: 'application/json' },
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=300`,
    },
  });
}
