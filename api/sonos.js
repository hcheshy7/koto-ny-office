// The Sonos queue for the Koto NY office.
// GET  /api/sonos                                  -> { ok:true, queue:[{ slot, title, artist, by, t }] }
// POST /api/sonos  { id, title, artist?, by }      -> { ok:true, queue }
// DELETE /api/sonos { slot, t }                   -> { ok:true, queue }   (removes an upcoming song; later songs move up)
// A new song starts every 3.5 minutes (one "slot"). A song someone adds takes the next free slot,
// so it plays straight after whatever is on now, or after the songs people added before it.
// Slots nobody fills play the office shuffle. Uses the same Upstash Redis storage as the other functions.

const KEY = 'koto:sonos';
const SLOT = 210000;
const MAX = 30;

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

async function load(now) {
  let q = [];
  try { q = JSON.parse((await redis(['GET', KEY])) || '[]'); } catch (_) { q = []; }
  const cur = Math.floor(now / SLOT);
  return (Array.isArray(q) ? q : []).filter(s => s && s.slot >= cur - 1).sort((a, b) => a.slot - b.slot);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true, queue: await load(Date.now()) });
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      body = body || {};
      const id = String(body.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
      const title = clean(body.title, 60), artist = clean(body.artist, 40), by = clean(body.by, 20) || 'Someone';
      if (!id) return res.status(400).json({ ok: false, error: 'Pick who you are first.' });
      if (!title) return res.status(400).json({ ok: false, error: 'Type a song first.' });
      const slow = await redis(['SET', 'koto:sonos-slow:' + id, '1', 'NX', 'PX', 5000]);   // one song every 5 seconds per person
      if (!slow) return res.status(429).json({ ok: false, error: 'Give it a few seconds before adding another.' });
      let got = false;                                                 // a short lock so two people adding at once don't overwrite each other
      for (let i = 0; i < 10 && !got; i++) { got = await redis(['SET', KEY + ':lock', '1', 'NX', 'PX', 3000]); if (!got) await new Promise(r => setTimeout(r, 120)); }
      try {
        const now = Date.now(), cur = Math.floor(now / SLOT);
        const q = await load(now);
        if (q.filter(s => s.slot > cur).length >= MAX) return res.status(429).json({ ok: false, error: 'The queue is full. Try again later.' });
        const last = q.length ? q[q.length - 1].slot : 0;
        q.push({ slot: Math.max(cur + 1, last + 1), title, artist, by, t: now });
        await redis(['SET', KEY, JSON.stringify(q), 'PX', 864e5]);
        return res.status(200).json({ ok: true, queue: q });
      } finally { if (got) await redis(['DEL', KEY + ':lock']); }
    }
    if (req.method === 'DELETE') {                                    // take a song out of the queue; the songs after it move up
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      body = body || {};
      const slot = Number(body.slot), t = Number(body.t);
      if (!Number.isFinite(slot)) return res.status(400).json({ ok: false, error: 'Which song?' });
      let got = false;
      for (let i = 0; i < 10 && !got; i++) { got = await redis(['SET', KEY + ':lock', '1', 'NX', 'PX', 3000]); if (!got) await new Promise(r => setTimeout(r, 120)); }
      try {
        const now = Date.now(), cur = Math.floor(now / SLOT);
        let q = await load(now);
        const k = q.findIndex(s => s.slot === slot && (!t || s.t === t));
        if (k < 0 || slot <= cur) return res.status(200).json({ ok: true, queue: q });   // already gone, or already playing
        q.splice(k, 1);
        let next = cur + 1;
        for (const s of q) if (s.slot > cur) { s.slot = Math.max(next, Math.min(s.slot, next)); next = s.slot + 1; }
        await redis(['SET', KEY, JSON.stringify(q), 'PX', 864e5]);
        return res.status(200).json({ ok: true, queue: q });
      } finally { if (got) await redis(['DEL', KEY + ':lock']); }
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
