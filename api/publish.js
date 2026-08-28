const CHANNEL = '@hackbyt';
const crypto = require('crypto');

const SUBSCRIBE_BLOCK = '<b>Подписывайся и проверяй вместе с нами 👇</b>\n<a href="https://t.me/hackbyt">Hackbyt — бытовые лайфхаки, которые работают.</a>';
const SUBSCRIBE_MARKER = 'https://t.me/hackbyt';

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
  } catch {
    return false;
  }
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

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '');
}

// The subscription block is enforced server-side so it is added even if
// Hackbyt AI forgets to include it in the caption.
function buildCaption(caption) {
  const base = String(caption || '').trim();
  if (base.includes(SUBSCRIBE_MARKER)) return fitCaption(base, 1024);

  const separator = base ? '\n\n' : '';
  const full = `${base}${separator}${SUBSCRIBE_BLOCK}`;
  if (full.length <= 1024) return full;

  // The AI instructions target a short caption. This is only a safety fallback:
  // preserve the mandatory subscription block and shorten the main text first.
  const available = 1024 - separator.length - SUBSCRIBE_BLOCK.length;
  if (available <= 0) return SUBSCRIBE_BLOCK.slice(0, 1024);

  let shortened = base.slice(0, available).trimEnd();
  if (shortened.length < base.length) {
    const safeCut = Math.max(shortened.lastIndexOf('\n'), shortened.lastIndexOf(' '));
    if (safeCut > available * 0.6) shortened = shortened.slice(0, safeCut).trimEnd();
    // Avoid leaving malformed HTML if the safety cut lands inside markup.
    if ((shortened.match(/</g) || []).length !== (shortened.match(/>/g) || []).length) {
      shortened = stripHtml(shortened).trimEnd();
    }
  }

  return `${shortened}${separator}${SUBSCRIBE_BLOCK}`;
}

async function sendPhoto(bytes, contentType, filename, caption) {
  const form = new FormData();
  form.append('chat_id', CHANNEL);
  form.append('photo', new Blob([bytes], { type: contentType }), filename);
  if (caption) form.append('caption', caption);
  form.append('parse_mode', 'HTML');

  const response = await fetch(`https://api.telegram.org/bot${getToken()}/sendPhoto`, {
    method: 'POST',
    body: form
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
}

async function downloadActionFile(ref) {
  if (!ref || typeof ref !== 'object') {
    throw new Error('Invalid openaiFileIdRefs item');
  }

  const downloadLink = ref.download_link;
  if (typeof downloadLink !== 'string' || !downloadLink.startsWith('https://')) {
    throw new Error('The image download_link was not provided by ChatGPT');
  }

  const response = await fetch(downloadLink);
  if (!response.ok) {
    throw new Error(`Could not download the image from ChatGPT (${response.status})`);
  }

  const contentType = String(ref.mime_type || response.headers.get('content-type') || 'image/png').split(';')[0].toLowerCase();
  if (!/^image\/(png|jpe?g|webp)$/i.test(contentType)) {
    throw new Error('Only PNG, JPEG and WebP images are supported');
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 8 * 1024 * 1024) {
    throw new Error('Image is too large. Maximum is 8 MB.');
  }

  const filename = typeof ref.name === 'string' && ref.name.trim()
    ? ref.name.trim()
    : `hackbyt.${contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1]}`;

  return { bytes, contentType, filename };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    if (!authorize(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const body = req.body || {};
    const caption = body.caption ?? body.text ?? '';

    if (typeof caption !== 'string') {
      return res.status(400).json({ ok: false, error: 'Caption must be a string' });
    }

    let image;

    if (Array.isArray(body.openaiFileIdRefs) && body.openaiFileIdRefs.length > 0) {
      image = await downloadActionFile(body.openaiFileIdRefs[0]);
    } else if (typeof body.image_base64 === 'string' && body.image_base64) {
      const contentType = body.content_type || 'image/png';
      if (!/^image\/(png|jpe?g|webp)$/i.test(contentType)) {
        return res.status(400).json({ ok: false, error: 'Only PNG, JPEG and WebP images are supported' });
      }
      const bytes = base64ToBytes(body.image_base64);
      if (bytes.length > 8 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'Image is too large. Maximum is 8 MB.' });
      }
      image = { bytes, contentType, filename: body.filename || 'hackbyt.png' };
    } else {
      return res.status(400).json({ ok: false, error: 'Image is required. Send openaiFileIdRefs from ChatGPT or image_base64 from the web publisher.' });
    }

    // Always publish image + caption as ONE Telegram message.
    // The subscription block is added here server-side and therefore cannot be forgotten by the AI.
    const finalCaption = buildCaption(caption);
    const photoMessage = await sendPhoto(image.bytes, image.contentType, image.filename, finalCaption);

    return res.status(200).json({
      ok: true,
      message_id: photoMessage.message_id,
      channel: CHANNEL,
      type: 'single_photo_post',
      subscription_added: !caption.includes(SUBSCRIBE_MARKER),
      caption_length: finalCaption.length
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
