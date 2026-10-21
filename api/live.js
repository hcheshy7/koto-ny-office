// Live updates, pushed the moment they happen: walking, dancing, chat, the Sonos queue, the bulletin board, looks, who's online.
// GET /api/live -> a stream (server-sent events). Each message is one small JSON change, e.g. { k:'p', p:{...} } for someone moving.
//
// The other functions PUBLISH every change on the Redis channel "koto:live"; this one listens on that channel and passes each
// change straight on to everyone who has the site open. A stream lasts about 4.5 minutes, then the browser reconnects by itself.
// If the storage's direct Redis address isn't available, it says "nope" and the site carries on with /api/state checks instead.
import Redis from 'ioredis';

const CHANNEL = 'koto:live';
const LIFETIME = 270_000;      // just under the 300-second limit set in vercel.json

function redisUrl() {
  const direct = process.env.KV_URL || process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;   // Vercel's Upstash integration adds KV_URL and REDIS_URL
  if (direct) return direct;
  const rest = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!rest || !token) return null;
  try { return 'rediss://default:' + encodeURIComponent(token) + '@' + new URL(rest).hostname + ':6379'; } catch (_) { return null; }
}

export default async function handler(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = s => { try { res.write(s); } catch (_) {} };
  const url = redisUrl();
  if (!url) { send('event: nope\ndata: no-redis-url\n\n'); return res.end(); }

  let done, closed = false;
  const finished = new Promise(r => { done = r; });
  const sub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableReadyCheck: false, connectTimeout: 5000, retryStrategy: () => null });
  sub.on('error', () => {});
  const close = () => { if (closed) return; closed = true; clearInterval(hb); clearTimeout(end); sub.disconnect(); try { res.end(); } catch (_) {} done(); };
  const hb = setInterval(() => send(': still here\n\n'), 15000);            // keeps the connection open through quiet spells
  const end = setTimeout(close, LIFETIME);
  req.on('close', close);
  sub.on('end', close);

  try {
    await sub.connect();
    await sub.subscribe(CHANNEL);
  } catch (err) {
    send('event: nope\ndata: ' + JSON.stringify(String(err && err.message || err)) + '\n\n');
    close();
    return finished;
  }
  sub.on('message', (_, m) => send('data: ' + m + '\n\n'));
  send('retry: 1500\nevent: hello\ndata: 1\n\n');
  return finished;
}
