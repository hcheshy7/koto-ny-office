// Who's online right now. Each open copy of the site checks in every 20 seconds.
// POST /api/online  { id, name?, guest?, leave? }  -> { ok:true, people:[team names], visitors:[guest names], guests:n }
// Uses the same Upstash Redis storage as /api/tasks.

const PEOPLE = ["Aleks","Alex","Arthur","David","Emma","Kayla","Mo","Jimmy","Hannah Ca","Hannah Ch","Jada","Simran","Laura","Kiera","Ru","Emilie","Rachel","Neat","Divya","Luke","Katie","LaDawn","Bryce","Alexis","Andreina","Anna","Blake","Goda","Hailey","Jenny","Kim","Lindsey","Maddy","Qichelle","Thalia","Lucy"];
const KEY = 'koto:online';
const WINDOW = 60_000;                         // gone quiet for a minute = offline

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
    const now = Date.now();
    if (req.method === 'POST') {
      const id = String(body.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
      const name = PEOPLE.find(n => n === body.name) || null;
      const guest = name ? '' : String(body.guest || '').replace(/[\u0000-\u001f<>|~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);   // a visitor who typed their own name
      if (id) {
        const all = (await redis(['ZRANGE', KEY, 0, -1])) || [];
        const mine = all.filter(m => m.endsWith('|' + id));          // this browser's old entry (it may have changed who it is)
        if (mine.length) await redis(['ZREM', KEY, ...mine]);
        if (!body.leave) await redis(['ZADD', KEY, now, (name || (guest ? '~' + guest : '')) + '|' + id]);
      }
    } else if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    }
    await redis(['ZREMRANGEBYSCORE', KEY, 0, now - WINDOW]);
    const live = (await redis(['ZRANGE', KEY, 0, -1])) || [];
    const people = [], visitors = [], guests = new Set();
    for (const m of live) {
      const [n, id] = m.split('|');
      if (!n) guests.add(id);
      else if (n.startsWith('~')) { if (!visitors.includes(n.slice(1))) visitors.push(n.slice(1)); }
      else if (!people.includes(n)) people.push(n);
    }
    return res.status(200).json({ ok: true, people, visitors, guests: guests.size });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
