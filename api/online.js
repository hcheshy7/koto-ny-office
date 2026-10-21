// Checking in: each open copy of the site says it's still here every 90 seconds (one storage command).
// POST /api/online  { id, name?, guest?, prev?, leave? }  -> { ok:true, member }
// The list of who's online comes back in /api/state, which everyone shares.
// Uses the same Upstash Redis storage as /api/tasks.

const PEOPLE = ["Aleks","Alex","Arthur","David","Emma","Kayla","Mo","Jimmy","Hannah Ca","Hannah Ch","Jada","Simran","Laura","Kiera","Ru","Emilie","Rachel","Neat","Divya","Luke","Katie","LaDawn","Bryce","Alexis","Andreina","Anna","Blake","Goda","Hailey","Jenny","Kim","Lindsey","Maddy","Qichelle","Thalia","Lucy"];
const KEY = 'koto:online';
const WINDOW = 200_000;                        // gone quiet for over 3 minutes = offline

async function redis(cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Storage is not connected yet (add Upstash for Redis to this Vercel project).');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    body = body || {};
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Use /api/state to see who is online.' }); }
    const now = Date.now(), id = String(body.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
    if (!id) return res.status(400).json({ ok: false, error: 'No id.' });
    const name = PEOPLE.find(n => n === body.name) || null;
    const guest = name ? '' : String(body.guest || '').replace(/[\u0000-\u001f<>|~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);   // a visitor who typed their own name
    const member = id + '|' + (name || (guest ? '~' + guest : ''));
    const prev = typeof body.prev === 'string' && body.prev.startsWith(id + '|') ? body.prev.slice(0, 60) : '';
    let changed = 0;
    if (prev && prev !== member) changed += await redis(['ZREM', KEY, prev]);   // they changed who they are
    if (body.leave) changed += await redis(['ZREM', KEY, member]);
    else changed += await redis(['ZADD', KEY, now, member]);                     // 1 when they've just arrived, 0 for an "I'm still here"
    if (changed) await redis(['PUBLISH', 'koto:live', '{"k":"o"}']);            // the list of who's online changed: everyone refreshes it
    if (Math.random() < 0.05) await redis(['ZREMRANGEBYSCORE', KEY, 0, now - WINDOW]);   // tidy up now and then
    return res.status(200).json({ ok: true, member });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
