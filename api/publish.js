const CHANNEL = '@hackbyt';

function getToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  return token;
}

function authorize(req) {
  const expected = process.env.PUBLISH_API_KEY;
  if (!expected) throw new Error('PUBLISH_API_KEY is not configured');
  const header = req.headers.authorization || '';
  return header === `Bearer ${expected}`;
}

function base64ToBytes(value) {
  const normalized = value.includes(',') ? value.split(',').pop() : value;
  const binary = Buffer.from(normalized, 'base64');
  return binary;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    if (!authorize(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const { image_base64, content_type = 'image/png', filename = 'hackbyt.png', caption = '' } = req.body || {};

    if (typeof image_base64 !== 'string' || !image_base64) {
      return res.status(400).json({ ok: false, error: 'image_base64 is required' });
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(content_type)) {
      return res.status(400).json({ ok: false, error: 'Only PNG, JPEG and WebP images are supported' });
    }
    if (typeof caption !== 'string' || caption.length > 1024) {
      return res.status(400).json({ ok: false, error: 'Caption must be 1024 characters or less' });
    }

    const bytes = base64ToBytes(image_base64);
    if (bytes.length > 8 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'Image is too large. Maximum is 8 MB.' });
    }

    const form = new FormData();
    form.append('chat_id', CHANNEL);
    form.append('photo', new Blob([bytes], { type: content_type }), filename);
    if (caption.trim()) form.append('caption', caption.trim());

    const response = await fetch(`https://api.telegram.org/bot${getToken()}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description || 'Telegram API error');

    return res.status(200).json({ ok: true, message_id: data.result.message_id, channel: CHANNEL, type: 'photo' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
