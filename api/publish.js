const CHANNEL = '@hackbyt';
const crypto = require('crypto');

function getToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  return token;
}

function secret() {
  const value = process.env.PUBLISH_API_KEY;
  if (!value) throw new Error('PUBLISH_API_KEY is not configured');
  return value;
}

function validSession(token) {
  if (!token) return false;
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split('.');
    if (parts.length !== 3) return false;
    const [userId, issued, signature] = parts;
    const issuedAt = Number(issued);
    if (!userId || !Number.isFinite(issuedAt) || Math.abs(Date.now() / 1000 - issuedAt) > 86400) return false;
    const payload = `${userId}.${issued}`;
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
    return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
}

function authorize(req) {
  const expected = secret();
  const header = req.headers.authorization || '';
  if (header === `Bearer ${expected}`) return true;
  const bearer = header.replace(/^Bearer\s+/i, '');
  if (validSession(bearer)) return true;
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)hackbyt_session=([^;]+)/);
  return validSession(match && match[1]);
}

function base64ToBytes(value) {
  const normalized = value.includes(',') ? value.split(',').pop() : value;
  return Buffer.from(normalized, 'base64');
}

// Telegram limits photo captions to 1024 characters.
// Keep the image and text in ONE message rather than sending a second text message.
function fitCaption(text, max = 1024) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  const suffix = '…';
  const limit = max - suffix.length;
  let cut = value.lastIndexOf('\n', limit);
  if (cut < Math.floor(limit * 0.6)) cut = value.lastIndexOf(' ', limit);
  if (cut < 1) cut = limit;
  return value.slice(0, cut).trimEnd() + suffix;
}

async function sendPhoto(bytes, contentType, filename, caption) {
  const form = new FormData();
  form.append('chat_id', CHANNEL);
  form.append('photo', new Blob([bytes], { type: contentType }), filename);
  if (caption) form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  const response = await fetch(`https://api.telegram.org/bot${getToken()}/sendPhoto`, { method: 'POST', body: form });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    if (!authorize(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const {
      image_base64,
      content_type = 'image/png',
      filename = 'hackbyt.png',
      caption = ''
    } = req.body || {};

    if (typeof image_base64 !== 'string' || !image_base64) {
      return res.status(400).json({ ok: false, error: 'image_base64 is required' });
    }

    if (!/^image\/(png|jpe?g|webp)$/i.test(content_type)) {
      return res.status(400).json({ ok: false, error: 'Only PNG, JPEG and WebP images are supported' });
    }

    if (typeof caption !== 'string') {
      return res.status(400).json({ ok: false, error: 'Caption must be a string' });
    }

    const bytes = base64ToBytes(image_base64);
    if (bytes.length > 8 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'Image is too large. Maximum is 8 MB.' });
    }

    // Always publish the image and caption as a single Telegram message.
    // If the caption is too long, shorten it instead of creating a second message.
    const finalCaption = fitCaption(caption, 1024);
    const photoMessage = await sendPhoto(bytes, content_type, filename, finalCaption);

    return res.status(200).json({
      ok: true,
      message_id: photoMessage.message_id,
      channel: CHANNEL,
      type: 'single_photo_post',
      caption_truncated: finalCaption.length < caption.trim().length
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
