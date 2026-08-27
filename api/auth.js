const crypto = require('crypto');

function secret() {
  const value = process.env.PUBLISH_API_KEY;
  if (!value) throw new Error('PUBLISH_API_KEY is not configured');
  return value;
}

function validTelegram(data) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  if (!data || !data.id || !data.auth_date || !data.hash) return false;
  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return false;
  const checkString = Object.keys(data).filter(k => k !== 'hash' && data[k] !== undefined && data[k] !== null).sort().map(k => `${k}=${data[k]}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return expected.length === data.hash.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(data.hash));
}

function makeSession(userId) {
  const payload = `${userId}.${Math.floor(Date.now() / 1000)}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const body = req.body || {};
    if (body.key) {
      const a = Buffer.from(body.key), b = Buffer.from(secret());
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ ok: false, error: 'Invalid key' });
      return res.status(200).json({ ok: true, token: makeSession('api') });
    }
    if (!validTelegram(body)) return res.status(401).json({ ok: false, error: 'Invalid Telegram authentication' });
    const token = makeSession(String(body.id));
    res.setHeader('Set-Cookie', `hackbyt_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
    return res.status(200).json({ ok: true, user: { id: body.id, first_name: body.first_name || '', username: body.username || '' } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
