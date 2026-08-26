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

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${getToken()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    if (!authorize(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const {
      text,
      image_url,
      disable_web_page_preview = false,
    } = req.body || {};

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'text is required' });
    }
    if (text.length > 4096) {
      return res.status(400).json({ ok: false, error: 'Telegram text limit is 4096 characters' });
    }
    if (image_url !== undefined && image_url !== null && typeof image_url !== 'string') {
      return res.status(400).json({ ok: false, error: 'image_url must be a URL string' });
    }

    let result;
    if (image_url) {
      if (text.length > 1024) {
        return res.status(400).json({ ok: false, error: 'Telegram photo captions are limited to 1024 characters' });
      }
      result = await telegram('sendPhoto', {
        chat_id: CHANNEL,
        photo: image_url,
        caption: text.trim(),
      });
    } else {
      result = await telegram('sendMessage', {
        chat_id: CHANNEL,
        text: text.trim(),
        disable_web_page_preview,
      });
    }

    return res.status(200).json({
      ok: true,
      message_id: result.message_id,
      channel: CHANNEL,
      type: image_url ? 'photo' : 'text',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
