// People walking around the office themselves (a teammate who has taken over their character, or a guest).
// POST /api/players  { id, who, guest, look?, x, y, dir, sit, up }  -> { ok:true, players:[...] }   (send { id, leave:true } to stop)
// Uses the same Upstash Redis storage as the other functions. Anyone quiet for 8 seconds drops off.

const PEOPLE = ["Aleks","Alex","Arthur","David","Emma","Kayla","Mo","Jimmy","Hannah Ca","Hannah Ch","Jada","Simran","Laura","Kiera","Ru","Emilie","Rachel","Neat","Divya","Luke","Katie","LaDawn","Bryce","Alexis","Andreina","Anna","Blake","Goda","Hailey","Jenny","Kim","Lindsey","Maddy","Qichelle","Thalia","Lucy"];
const KEY = 'koto:players';
const STALE = 30000;
const STYLES = ['short','sidepart','undercut','pixie','spiky','buzz','mohawk','curly','curlylong','afro','bob','shoulder','shag','long','bangs','wavy','halfup','mullet','ponytail','pigtails','spacebuns','bun','braids','locs','bald'];
const TOPS = ['tee','graphic','stripes','tank','collar','flannel','hoodie','sweater','turtleneck','vest','cardigan','jacket','overalls'], BOTTOMS = ['pants','joggers','shorts','skirt','longskirt'], ACCS = 30;
const hex = v => /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : null;
function cleanLook(l) {
  l = l || {};
  const o = { skin: hex(l.skin), hair: hex(l.hair), eyes: hex(l.eyes), shirt: hex(l.shirt), pants: hex(l.pants),
    style: STYLES.includes(l.style) ? l.style : 'short', top: TOPS.includes(l.top) ? l.top : 'tee', bottom: BOTTOMS.includes(l.bottom) ? l.bottom : 'pants',
    acc: Math.max(0, Math.min(ACCS - 1, l.acc | 0)), face: Math.max(0, Math.min(3, l.face | 0)), v: l.v === 3 ? 3 : l.v === 2 ? 2 : 1 };
  if (hex(l.streak)) o.streak = l.streak;
  return o;
}
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>|~]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

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
    if (req.method !== 'POST' && req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    body = body || {};
    const now = Date.now(), id = String(body.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
    if (req.method === 'POST' && id) {
      if (body.leave) await redis(['HDEL', KEY, id]);
      else {
        const team = PEOPLE.find(n => n === body.who);
        const who = team || clean(body.who, 20);
        if (who) {
          const p = { id, who, guest: !team, x: Math.max(0, Math.min(60, +body.x || 0)), y: Math.max(0, Math.min(40, +body.y || 0)),
            dir: ['N', 'S', 'E', 'W'].includes(body.dir) ? body.dir : 'S', sit: !!body.sit, up: Math.max(0, Math.min(8, +body.up || 0)), dance: !!body.dance, t: now };
          if (!team && body.look) p.look = cleanLook(body.look);
          if (Array.isArray(body.trail)) p.trail = body.trail.slice(-24).map(q => Array.isArray(q) ? [Math.max(0, Math.min(60, +q[0] || 0)), Math.max(0, Math.min(40, +q[1] || 0)), +q[2] || 0, ['N','S','E','W'].includes(q[3]) ? q[3] : 'S'] : null).filter(Boolean);   // the path they just walked, so others can follow it smoothly
          await redis(['HSET', KEY, id, JSON.stringify(p)]);
        }
      }
    }
    if (req.method === 'POST' && Math.random() > 0.05) return res.status(200).json({ ok: true });   // just saving; everyone reads positions from /api/state
    const flat = (await redis(['HGETALL', KEY])) || [];
    const players = [], stale = [];
    for (let i = 0; i < flat.length; i += 2) {
      try { const p = JSON.parse(flat[i + 1]); if (now - p.t > STALE) stale.push(flat[i]); else players.push(p); } catch (_) { stale.push(flat[i]); }
    }
    if (stale.length) await redis(['HDEL', KEY, ...stale]);
    return res.status(200).json({ ok: true, players });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
