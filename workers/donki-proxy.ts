/**
 * Cloudflare Worker cached proxy template for NASA DONKI alerts.
 * Prevents DEMO_KEY rate limits during classroom / kiosk sessions without a database.
 *
 * Deploy with secret `NASA_API_KEY` and set `VITE_DONKI_PROXY_URL` to the Worker URL
 * (for example: `https://spudnaut-donki.<your-subdomain>.workers.dev`).
 */

interface WorkerEnv {
  NASA_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
}

const VALID_TYPES = new Set(['FLR', 'CME', 'SEP']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_TTL_SECONDS = 900;

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(allowedOrigin) });
    }

    const url = new URL(request.url);
    const segment = url.pathname.split('/').filter(Boolean).pop()?.toUpperCase();
    const type = (url.searchParams.get('type')?.toUpperCase() || segment || '').trim();
    const startDate = url.searchParams.get('startDate') ?? '';
    const endDate = url.searchParams.get('endDate') ?? '';

    if (!VALID_TYPES.has(type) || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      return new Response(JSON.stringify({ error: 'Invalid DONKI query parameters.' }), {
        status: 400,
        headers: { ...corsHeaders(allowedOrigin), 'Content-Type': 'application/json' },
      });
    }

    const upstream = new URL(`https://api.nasa.gov/DONKI/${type}`);
    upstream.search = new URLSearchParams({
      startDate,
      endDate,
      api_key: env.NASA_API_KEY?.trim() || 'DEMO_KEY',
    }).toString();

    const response = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json' },
      cf: { cacheEverything: true, cacheTtl: CACHE_TTL_SECONDS },
    } as RequestInit);

    const headers = new Headers(corsHeaders(allowedOrigin));
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`);

    return new Response(response.body, { status: response.status, headers });
  },
};
