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

function getOpenAIFileUrl(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return ref.startsWith('https://') ? ref : null;
  if (typeof ref === 'object') return ref.download_link || ref.downloadLink || ref.url || null;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    if (!authorize(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const { openaiFileIdRefs, image_url, caption = '' } = req.body || {};

    let imageUrl = null;
    if (Array.isArray(openaiFileIdRefs) && openaiFileIdRefs.length) {
      imageUrl = getOpenAIFileUrl(openaiFileIdRefs[0]);
    }
    imageUrl = imageUrl || (typeof image_url === 'string' ? image_url : null);

    if (!imageUrl) {
      return res.status(400).json({ ok: false, error: 'An image from the current ChatGPT conversation is required.' });
    }

    if (typeof caption !== 'string') {
      return res.status(400).json({ ok: false, error: 'caption must be a string' });
    }
    if (caption.length > 1024) {
      return res.status(400).json({ ok: false, error: 'Telegram photo captions are limited to 1024 characters.' });
    }

    const result = await telegram('sendPhoto', {
      chat_id: CHANNEL,
      photo: imageUrl,
      ...(caption.trim() ? { caption: caption.trim() } : {}),
    });

    return res.status(200).json({
      ok: true,
      message_id: result.message_id,
      channel: CHANNEL,
      type: 'photo',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
