import { compare, readCache } from '@/lib/pipeline';
import type { StreamEvent } from '@/lib/types';

export const maxDuration = 120;

// Each live run costs about 65k input tokens plus up to 5 web searches. Cached chip queries are free and unlimited.
// ponytail: per-instance memory, so it resets on a cold start and each instance counts alone. Move to Vercel KV or the
// Vercel firewall if the live route gets abused.
const LIVE_PER_HOUR = 6;
const liveRuns = new Map<string, number[]>();
function allowLive(ip: string) {
  const now = Date.now();
  const recent = (liveRuns.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= LIVE_PER_HOUR) return false;
  liveRuns.set(ip, [...recent, now]);
  return true;
}

// POST { query: string, live?: boolean } -> NDJSON stream of StreamEvent, one per line.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (query.length < 3 || query.length > 120) {
    return Response.json({ error: 'Send a query between 3 and 120 characters.' }, { status: 400 });
  }
  const live = body?.live === true;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if ((live || !(await readCache(query))) && !allowLive(ip)) {
    return Response.json({ error: `Live runs are limited to ${LIVE_PER_HOUR} an hour. The three example chips still work.` }, { status: 429 });
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // If the viewer leaves mid-run the stream is closed. Drop events instead of crashing the run.
      const emit = (e: StreamEvent) => {
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {}
      };
      try {
        // req.signal aborts when the viewer leaves, which stops the Anthropic calls mid-run.
        await compare(query, emit, live, req.signal);
      } catch (e) {
        emit({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
