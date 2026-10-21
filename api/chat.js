// Live chat for the Koto NY office.
// GET  /api/chat?since=<ms>                        -> { ok:true, messages:[{ t, who, guest, text, id }] }   (oldest first; the last 50 if no "since")
// POST /api/chat  { id, name?, guest?, text }      -> { ok:true }
// Uses the same Upstash Redis storage as the other functions. Keeps the most recent 200 messages.

const PEOPLE = ["Aleks","Alex","Arthur","David","Emma","Kayla","Mo","Jimmy","Hannah Ca","Hannah Ch","Jada","Simran","Laura","Kiera","Ru","Emilie","Rachel","Neat","Divya","Luke","Katie","LaDawn","Bryce","Alexis","Andreina","Anna","Blake","Goda","Hailey","Jenny","Kim","Lindsey","Maddy","Qichelle","Thalia","Lucy"];
const KEY = 'koto:chat';

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
      const since = Number(new URL(req.url, 'http://x').searchParams.get('since')) || 0;
      const raw = (await redis(['LRANGE', KEY, 0, since ? 199 : 49])) || [];
      const messages = [];
      for (const s of raw) { try { const m = JSON.parse(s); if (m.t > since) messages.push(m); } catch (_) {} }
      messages.reverse();
      return res.status(200).json({ ok: true, messages });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      body = body || {};
      const id = String(body.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
      const name = PEOPLE.find(n => n === body.name) || null;
      const guest = name ? '' : clean(body.guest, 20).replace(/[|~]/g, '');
      const text = clean(body.text, 200);
      if (!id || (!name && !guest)) return res.status(400).json({ ok: false, error: 'Pick who you are first.' });
      if (!text) return res.status(400).json({ ok: false, error: 'Type a message first.' });
      const ok = await redis(['SET', 'koto:chat-slow:' + id, '1', 'NX', 'PX', 1500]);   // at most one message every 1.5 seconds per person
      if (!ok) return res.status(429).json({ ok: false, error: 'Slow down a little.' });
      const m = { t: Date.now(), who: name || guest, guest: !name, text, id };
      await redis(['LPUSH', KEY, JSON.stringify(m)]);
      await redis(['LTRIM', KEY, 0, 199]);
      await redis(['PUBLISH', 'koto:live', JSON.stringify({ k: 'c', m })]);   // pushed to everyone's chat straight away
      return res.status(200).json({ ok: true, message: m });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
