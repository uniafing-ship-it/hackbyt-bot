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
  return Buffer.from(normalized, 'base64');
}

function splitTelegramText(text, max = 4096) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < Math.floor(max * 0.5)) cut = rest.lastIndexOf(' ', max);
    if (cut < 1) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function sendPhoto(bytes, contentType, filename, caption) {
  const form = new FormData();
  form.append('chat_id', CHANNEL);
  form.append('photo', new Blob([bytes], { type: contentType }), filename);
  if (caption) form.append('caption', caption);
  form.append('parse_mode', 'HTML');

  const response = await fetch(`https://api.telegram.org/bot${getToken()}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
}

async function sendMessage(text) {
  const response = await fetch(`https://api.telegram.org/bot${getToken()}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHANNEL,
      text,
      parse_mode: 'HTML',
    }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
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
    if (typeof caption !== 'string') {
      return res.status(400).json({ ok: false, error: 'Caption must be a string' });
    }

    const bytes = base64ToBytes(image_base64);
    if (bytes.length > 8 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'Image is too large. Maximum is 8 MB.' });
    }

    const chunks = splitTelegramText(caption, 4096);
    let photoMessage;

    if (chunks.length && chunks[0].length <= 1024) {
      photoMessage = await sendPhoto(bytes, content_type, filename, chunks[0]);
      for (const chunk of chunks.slice(1)) await sendMessage(chunk);
    } else {
      photoMessage = await sendPhoto(bytes, content_type, filename, '');
      for (const chunk of chunks) await sendMessage(chunk);
    }

    return res.status(200).json({
      ok: true,
      message_id: photoMessage.message_id,
      channel: CHANNEL,
      type: 'photo_with_text',
      messages_sent: 1 + (chunks.length > 0 ? (chunks[0].length <= 1024 ? chunks.length - 1 : chunks.length) : 0),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
