// The office bulletin board: sticky notes with little doodles, shared by everyone.
// GET    /api/bulletin                                        -> { ok:true, notes:[{ nid, by, uid, color, img, x, y, r, t }] }
// POST   /api/bulletin { uid, by, color, img, x, y, r }        -> { ok:true, notes }   (img: a small PNG doodle as a data URL)
// DELETE /api/bulletin { nid, uid }                           -> { ok:true, notes }   (only the person who pinned a note can take it down)
// Keeps the newest 40 notes. Uses the same Upstash Redis storage as the other functions.

const KEY = 'koto:bulletin';
const MAX = 40;
const COLORS = ['#ffe27a', '#ffb3c7', '#b8f0c8', '#a9d8ff', '#d6c2ff', '#ffc98a'];

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };

async function redis(cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Storage is not connected yet (add Upstash for Redis to this Vercel project).');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function load() { try { const q = JSON.parse((await redis(['GET', KEY])) || '[]'); return Array.isArray(q) ? q : []; } catch (_) { return []; } }
async function locked(fn) {
  let got = false;
  for (let i = 0; i < 10 && !got; i++) { got = await redis(['SET', KEY + ':lock', '1', 'NX', 'PX', 3000]); if (!got) await new Promise(r => setTimeout(r, 120)); }
  try { return await fn(); } finally { if (got) await redis(['DEL', KEY + ':lock']); }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true, notes: await load() });
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    body = body || {};
    const uid = String(body.uid || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
    if (!uid) return res.status(400).json({ ok: false, error: 'Pick who you are first.' });
    if (req.method === 'POST') {
      const img = String(body.img || '');
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > 20000) return res.status(400).json({ ok: false, error: 'That doodle could not be saved.' });
      const slow = await redis(['SET', 'koto:bulletin-slow:' + uid, '1', 'NX', 'PX', 4000]);
      if (!slow) return res.status(429).json({ ok: false, error: 'Give it a few seconds before pinning another.' });
      const note = { nid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), by: clean(body.by, 20) || 'Someone', uid,
        color: COLORS.includes(body.color) ? body.color : COLORS[0], img, x: num(body.x, 0, .86, .4), y: num(body.y, 0, .76, .3), r: num(body.r, -8, 8, 0), t: Date.now() };
      const notes = await locked(async () => { const q = await load(); q.push(note); const out = q.slice(-MAX); await redis(['SET', KEY, JSON.stringify(out)]); return out; });
      return res.status(200).json({ ok: true, notes });
    }
    if (req.method === 'DELETE') {
      const nid = String(body.nid || '').slice(0, 20);
      const notes = await locked(async () => { const q = await load(); const out = q.filter(n => !(n.nid === nid && n.uid === uid)); if (out.length !== q.length) await redis(['SET', KEY, JSON.stringify(out)]); return out; });
      return res.status(200).json({ ok: true, notes });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
