// Teammates' looks, changed at the bathroom mirror. Everyone's copy of the site picks them up.
// GET  /api/looks                 -> { ok:true, looks:{ name: look } }
// POST /api/looks  { name, look } -> { ok:true }
// Uses the same Upstash Redis storage as the other functions.

const PEOPLE = ["Aleks","Alex","Arthur","David","Emma","Kayla","Mo","Jimmy","Hannah Ca","Hannah Ch","Jada","Simran","Laura","Kiera","Ru","Emilie","Rachel","Neat","Divya","Luke","Katie","LaDawn","Bryce","Alexis","Andreina","Anna","Blake","Goda","Hailey","Jenny","Kim","Lindsey","Maddy","Qichelle","Thalia","Lucy"];
const KEY = 'koto:looks';
const STYLES = ['short','sidepart','pixie','spiky','buzz','mohawk','curly','curlylong','afro','bob','shoulder','long','wavy','mullet','ponytail','pigtails','bun','braids','bald'];
const TOPS = ['tee','stripes','hoodie','collar','sweater','jacket','overalls'], BOTTOMS = ['pants','shorts','skirt'], ACCS = 15;
const hex = v => /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : null;
function cleanLook(l) {
  l = l || {};
  const o = { skin: hex(l.skin), hair: hex(l.hair), eyes: hex(l.eyes), shirt: hex(l.shirt), pants: hex(l.pants),
    style: STYLES.includes(l.style) ? l.style : 'short', top: TOPS.includes(l.top) ? l.top : 'tee', bottom: BOTTOMS.includes(l.bottom) ? l.bottom : 'pants',
    acc: Math.max(0, Math.min(ACCS - 1, l.acc | 0)) };
  if (hex(l.streak)) o.streak = l.streak;
  return o;
}

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
      const flat = (await redis(['HGETALL', KEY])) || [], looks = {};
      for (let i = 0; i < flat.length; i += 2) { try { looks[flat[i]] = JSON.parse(flat[i + 1]); } catch (_) {} }
      return res.status(200).json({ ok: true, looks });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      const name = PEOPLE.find(n => n === (body && body.name));
      if (!name) return res.status(400).json({ ok: false, error: 'Unknown name.' });
      const look = cleanLook(body.look);
      if (!look.skin || !look.hair || !look.eyes || !look.shirt || !look.pants) return res.status(400).json({ ok: false, error: 'Bad colours.' });
      await redis(['HSET', KEY, name, JSON.stringify(look)]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
