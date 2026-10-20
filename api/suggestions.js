// The suggestion box: anonymous notes about what people would like to see on the site.
// POST /api/suggestions { text, id, kind:'idea'|'me', name? } -> { ok:true }
//   kind 'idea': a website idea, anonymous (id is only used to stop floods; it is never stored)
//   kind 'me':   things someone wants their character to do, fun facts about their day; kept with their name
// GET  /api/suggestions?key=<SUGGESTIONS_KEY>               -> a page listing every note, newest first (add &format=json for JSON)
// Reading needs the SUGGESTIONS_KEY environment variable to be set in Vercel, so only the person who knows it can read the notes.
// Keeps the newest 500 notes. Uses the same Upstash Redis storage as the other functions.

const KEY = 'koto:suggestions';
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, '').trim().slice(0, n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      body = body || {};
      const text = clean(body.text, 600), id = String(body.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'anon';
      if (!text) return res.status(400).json({ ok: false, error: 'Write something first.' });
      const ok = await redis(['SET', 'koto:suggest-slow:' + id, '1', 'NX', 'PX', 20000]);   // one note every 20 seconds
      if (!ok) return res.status(429).json({ ok: false, error: 'Thanks! Give it a few seconds before sending another.' });
      const me = body.kind === 'me', name = me ? clean(body.name, 20).replace(/[<>]/g, '') : '';
      if (me && !name) return res.status(400).json({ ok: false, error: 'Pick who you are first.' });
      await redis(['LPUSH', KEY, JSON.stringify(me ? { t: Date.now(), kind: 'me', name, text } : { t: Date.now(), kind: 'idea', text })]);
      await redis(['LTRIM', KEY, 0, 499]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams, secret = process.env.SUGGESTIONS_KEY;
      if (!secret) return res.status(403).send('Reading the suggestion box needs a SUGGESTIONS_KEY. Add one under Settings → Environment Variables in Vercel, then redeploy.');
      if (q.get('key') !== secret) return res.status(403).send('That key is not right.');
      const notes = ((await redis(['LRANGE', KEY, 0, 499])) || []).map(s => { try { return JSON.parse(s); } catch (_) { return null; } }).filter(Boolean);
      if (q.get('format') === 'json') return res.status(200).json({ ok: true, notes });
      const fmt = t => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const section = (title, sub, list, named) => `<h2>${title} <small>(${list.length})</small></h2><p class="c">${sub}</p>` +
        (list.map(n => `<div class="n"><div class="d">${named ? '<b>' + esc(n.name) + '</b> · ' : ''}${esc(fmt(n.t))}</div><div class="x">${esc(n.text)}</div></div>`).join('') || '<p>Nothing yet.</p>');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Suggestion box</title>
<style>body{margin:0;background:#f3d9a8;font-family:ui-monospace,Menlo,monospace;color:#4b1a0e}main{max-width:680px;margin:0 auto;padding:24px 16px}h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:26px 0 2px}h2 small{font-size:14px;opacity:.6}.n .d b{opacity:1;font-size:14px}p.c{margin:0 0 18px;opacity:.7}
.n{background:#fffaf0;border:3px solid #5a2408;border-radius:10px;padding:12px 14px;margin:0 0 12px;box-shadow:0 4px 0 #3a1606}.n .d{font-size:12px;opacity:.6;margin-bottom:6px}.n .x{white-space:pre-wrap;font-size:16px;line-height:1.35}</style></head>
<body><main><h1>Suggestion box</h1><p class="c">Newest first.</p>
${section('About me', 'Things people want their character to do, and fun facts about their days. These come with names.', notes.filter(n => n.kind === 'me'), true)}
${section('Website ideas', 'Anonymous notes about what people want to see on the site.', notes.filter(n => n.kind !== 'me'), false)}</main></body></html>`);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
