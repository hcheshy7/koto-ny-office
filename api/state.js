// Everything the office needs to stay live, in one small answer that everyone shares.
// GET /api/state -> { ok, t, people, visitors, guests, players, chat, sonos, looksV, boardV }
//
// Every open copy of the site asks for this every few seconds. The answer is cached by Vercel's network for
// 2 seconds, so however many people have the site open, the storage is only read about once every 2 seconds,
// with 5 commands (one round trip). Writes (moving, chatting, checking in) go to the other functions.

const STALE_PLAYER = 30_000;          // someone walking around who hasn't checked in for 30 seconds has gone
const ONLINE_WINDOW = 200_000;        // someone who hasn't checked in for over 3 minutes has closed the site
const SLOT = 210000;                  // one Sonos song

async function pipeline(cmds) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Storage is not connected yet (add Upstash for Redis to this Vercel project).');
  const r = await fetch(url.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error((j && j.error) || 'Storage did not answer.');
  return j.map(x => (x && x.error ? null : x && x.result));
}
const parse = s => { try { return JSON.parse(s); } catch (_) { return null; } };

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
  try {
    const now = Date.now();
    const [online, flat, chatRaw, sonosRaw, meta] = await pipeline([
      ['ZRANGEBYSCORE', 'koto:online', now - ONLINE_WINDOW, '+inf'],
      ['HGETALL', 'koto:players'],
      ['LRANGE', 'koto:chat', 0, 29],
      ['GET', 'koto:sonos'],
      ['HGETALL', 'koto:meta'],
    ]);
    const people = [], visitors = [], guests = new Set();
    for (const m of online || []) {
      const k = m.indexOf('|'), n = m.slice(k + 1), id = m.slice(0, k);
      if (!n) guests.add(id);
      else if (n.startsWith('~')) { if (!visitors.includes(n.slice(1))) visitors.push(n.slice(1)); }
      else if (!people.includes(n)) people.push(n);
    }
    const players = [];
    for (let i = 0; flat && i < flat.length; i += 2) { const p = parse(flat[i + 1]); if (p && now - p.t < STALE_PLAYER) players.push(p); }
    const chat = (chatRaw || []).map(parse).filter(Boolean).reverse();
    const cur = Math.floor(now / SLOT), sonos = (parse(sonosRaw) || []).filter(s => s && s.slot >= cur - 1).sort((a, b) => a.slot - b.slot);
    const m = {}; for (let i = 0; meta && i < meta.length; i += 2) m[meta[i]] = +meta[i + 1] || 0;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=2, stale-while-revalidate=4');   // shared by everyone for 2 seconds
    res.setHeader('Vercel-CDN-Cache-Control', 'max-age=2, stale-while-revalidate=4');
    return res.status(200).json({ ok: true, t: now, people, visitors, guests: guests.size, walking: players.length, players, chat, sonos, looksV: m.looksV || 0, boardV: m.boardV || 0 });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
