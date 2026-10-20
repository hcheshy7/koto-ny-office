// Shared custom tasks for the Koto NY office.
// GET  /api/tasks                      -> { ok:true, rows:[{ person, tasks:[{say, place}] }] }
// POST /api/tasks  { person, tasks }   -> saves that person's list (an empty list removes it)
// Stored in Upstash Redis (add it from Vercel: Storage -> Upstash for Redis). No packages needed.

const PEOPLE = ["Aleks","Alex","Arthur","David","Emma","Kayla","Mo","Jimmy","Hannah Ca","Hannah Ch","Jada","Simran","Laura","Kiera","Ru","Emilie","Rachel","Neat","Divya","Luke","Katie","LaDawn","Bryce","Alexis","Andreina","Anna","Blake","Goda","Hailey","Jenny","Kim","Lindsey","Maddy","Qichelle","Thalia","Lucy"];
const PLACES = ['desk','visit','coffee','kitchen','couch','window','plants','armchair','pace','bigMeeting','lunchTable'];
const KEY = 'koto:tasks';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

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
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', KEY])) || [];
      const rows = [];
      for (let i = 0; i < flat.length; i += 2) {
        try { rows.push({ person: flat[i], tasks: JSON.parse(flat[i + 1]) }); } catch (_) {}
      }
      return res.status(200).json({ ok: true, rows });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      const person = PEOPLE.find(n => n.toLowerCase() === clean(body && body.person, 30).toLowerCase());
      if (!person) return res.status(400).json({ ok: false, error: 'Unknown name.' });
      const tasks = (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 6).map(t => {
        const say = clean(t && t.say, 46);
        let place = clean(t && t.place, 40);
        const vp = place.startsWith('visit:') && PEOPLE.find(n => n === place.slice(6));
        place = vp ? 'visit:' + vp : PLACES.includes(place) ? place : 'desk';
        return say ? { say, place } : null;
      }).filter(Boolean);
      if (tasks.length) await redis(['HSET', KEY, person, JSON.stringify(tasks)]);
      else await redis(['HDEL', KEY, person]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
