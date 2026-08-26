import { generateText } from '../lib/openai.js';

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
  const allowed = (process.env.ADMIN_USER_IDS || '').split(',').map((v) => v.trim()).filter(Boolean);
  return allowed.length > 0 && allowed.includes(String(message?.from?.id));
}

function helpText() {
  return [
    'Hackbyt AI готов.', '',
    '/id — показать Telegram ID',
    '/help — команды',
    '/idea — 5 идей для канала',
    '/write Тема — написать пост',
    '/rewrite Текст — улучшить текст',
    '/preview Текст — предпросмотр',
    '/post Текст — опубликовать',
  ].join('\n');
}

const STYLE = `Ты редактор Telegram-канала «Бытовые лайфхаки, которые работают». Пиши по-русски. Нужны практичные, простые и проверяемые бытовые советы. Не выдумывай факты, не обещай гарантированный результат. Не предлагай опасные эксперименты, смешивание бытовой химии или советы с риском для здоровья. Стиль: коротко, живо, без кликбейта и без канцелярита. Формат: сильный заголовок, короткое объяснение, пошаговые действия, важное ограничение при необходимости. Не упоминай, что текст создан ИИ.`;

async function send(message, text) {
  await telegram('sendMessage', { chat_id: message.chat.id, text });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const update = req.body || {};
    const message = update.message;
    if (!message?.text) return res.status(200).json({ ok: true });
    const text = message.text.trim();

    if (text === '/id') {
      await send(message, `Ваш Telegram ID: ${message.from.id}`);
      return res.status(200).json({ ok: true });
    }
    if (!isAllowedAdmin(message)) return res.status(200).json({ ok: true });

    if (text === '/start' || text === '/help') {
      await send(message, helpText());
    } else if (text === '/idea') {
      const result = await generateText(`${STYLE}\n\nДай 5 разных идей для следующих постов. Для каждой: заголовок и одна строка, почему это полезно. Не повторяй очевидные советы.`);
      await send(message, result);
    } else if (text.startsWith('/write ')) {
      const topic = text.slice(7).trim();
      if (!topic) throw new Error('Укажи тему после /write');
      const result = await generateText(`${STYLE}\n\nНапиши готовый пост на тему: ${topic}\n\nВерни только текст поста.`);
      await send(message, `ПРЕДПРОСМОТР\n\n${result}\n\nЕсли подходит, отправь /post ${result}`);
    } else if (text.startsWith('/rewrite ')) {
      const source = text.slice(9).trim();
      if (!source) throw new Error('Укажи текст после /rewrite');
      const result = await generateText(`${STYLE}\n\nПерепиши и улучши этот текст, сохранив фактический смысл:\n\n${source}\n\nВерни только готовый текст.`);
      await send(message, `ПРЕДПРОСМОТР\n\n${result}\n\nЕсли подходит, отправь /post ${result}`);
    } else if (text.startsWith('/preview ')) {
      const post = text.slice(9).trim();
      if (!post) throw new Error('Пустой черновик');
      await send(message, `ПРЕДПРОСМОТР\n\n${post}`);
    } else if (text.startsWith('/post ')) {
      const post = text.slice(6).trim();
      if (!post) throw new Error('Пустой пост');
      await telegram('sendMessage', { chat_id: CHANNEL, text: post });
      await send(message, 'Опубликовано в @hackbyt.');
    } else {
      await send(message, 'Неизвестная команда. Используй /help.');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    try { await send(req.body.message, `Ошибка: ${error.message}`); } catch {}
    return res.status(200).json({ ok: true });
  }
}
