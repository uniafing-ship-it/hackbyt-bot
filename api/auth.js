const crypto = require('crypto');

function secret() {
  const value = process.env.PUBLISH_API_KEY;
  if (!value) throw new Error('PUBLISH_API_KEY is not configured');
  return value;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const { key } = req.body || {};
    if (typeof key !== 'string' || !key) return res.status(400).json({ ok: false, error: 'Key is required' });
    const a = Buffer.from(key), b = Buffer.from(secret());
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ ok: false, error: 'Invalid key' });
    const token = crypto.createHmac('sha256', secret()).update('hackbyt-web-session').digest('hex');
    return res.status(200).json({ ok: true, token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
