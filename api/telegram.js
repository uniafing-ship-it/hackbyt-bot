const CHANNEL = '@hackbyt';

function getToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  return token;
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

function isAllowedAdmin(message) {
  const allowed = (process.env.ADMIN_USER_IDS || '')
    .split(',').map((v) => v.trim()).filter(Boolean);
  return allowed.length > 0 && allowed.includes(String(message?.from?.id));
}

function helpText() {
  return [
    'Hackbyt Assistant готов.',
    '',
    'Команды:',
    '/id — показать ваш Telegram ID',
    '/help — показать команды',
    '/preview Текст — подготовить черновик',
    '/post Текст — опубликовать в @hackbyt',
    '/cancel — отменить сохранённый черновик',
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const update = req.body || {};
    const message = update.message;
    if (!message?.text) return res.status(200).json({ ok: true });

    const text = message.text.trim();

    // /id intentionally works before authorization so the owner can discover their ID.
    if (text === '/id') {
      await telegram('sendMessage', {
        chat_id: message.chat.id,
        text: `Ваш Telegram ID: ${message.from.id}`,
      });
      return res.status(200).json({ ok: true });
    }

    if (!isAllowedAdmin(message)) return res.status(200).json({ ok: true });

    if (text === '/start' || text === '/help') {
      await telegram('sendMessage', { chat_id: message.chat.id, text: helpText() });
    } else if (text === '/cancel') {
      await telegram('sendMessage', {
        chat_id: message.chat.id,
        text: 'Черновиков сейчас нет. Сохранение черновиков добавим следующим этапом.',
      });
    } else if (text.startsWith('/preview ')) {
      const post = text.slice(9).trim();
      if (!post) throw new Error('Пустой черновик');
      await telegram('sendMessage', {
        chat_id: message.chat.id,
        text: `ПРЕДПРОСМОТР\n\n${post}\n\nДля публикации отправь:\n/post ${post}`,
      });
    } else if (text.startsWith('/post ')) {
      const post = text.slice(6).trim();
      if (!post) throw new Error('Пустой пост');
      await telegram('sendMessage', { chat_id: CHANNEL, text: post });
      await telegram('sendMessage', { chat_id: message.chat.id, text: 'Опубликовано в @hackbyt.' });
    } else {
      await telegram('sendMessage', { chat_id: message.chat.id, text: 'Неизвестная команда. Используй /help.' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
