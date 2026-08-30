import { generateText, generateImage } from '../lib/openai.js';
import { getChannelPosts, findSimilarPosts, formatPostsForPrompt, CHANNEL_USERNAME } from '../lib/channel.js';

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

async function sendPhoto(chatId, imageBuffer, caption, replyMarkup) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('photo', new Blob([imageBuffer], { type: 'image/png' }), 'hackbyt.png');
  if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));

  const response = await fetch(`https://api.telegram.org/bot${getToken()}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || 'Telegram sendPhoto error');
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
    '/posts — последние публикации канала',
    '/check Тема — проверить тему на повторы',
    '/idea — 5 идей для канала',
    '/create Тема — создать пост + картинку и показать предпросмотр',
    '/write Тема — то же самое, что /create',
    '/rewrite Текст — улучшить текст',
    '/preview Текст — предпросмотр текста',
    '/post Текст — вручную опубликовать текст',
    '',
    'Перед /create Hackbyt AI проверяет историю канала и учитывает уже опубликованные темы.',
    'После /create публикация выполняется кнопкой «Публиковать».',
  ].join('\n');
}

const STYLE = `Ты редактор Telegram-канала «Бытовые лайфхаки, которые работают». Пиши по-русски. Нужны практичные, простые и проверяемые бытовые советы. Не выдумывай факты, не обещай гарантированный результат. Не предлагай опасные эксперименты, смешивание бытовой химии или советы с риском для здоровья. Стиль: коротко, живо, без канцелярита и пустых вступлений. Формат: сильный заголовок, короткое объяснение, пошаговые действия только когда они нужны, важное ограничение при необходимости. Для публикации вместе с картинкой держи текст в пределах 500–850 символов, максимум 900. Используй HTML Telegram: <b>, <i>, <code>, <a>. Не используй Markdown.`;

const IMAGE_STYLE = `Создай вертикальную редакционную обложку для Telegram-канала «Бытовые лайфхаки, которые работают» в утверждённом стиле Hackbyt. Это современное Telegram-медиа, а не Pinterest-инфографика.

Визуальный язык: реалистичная качественная фотография, один главный визуальный сюжет, один крупный объект, чистая премиальная композиция, высокий контраст, хорошо читается на смартфоне.

Палитра: #111111 почти чёрный, #F7F7F7 белый, #C8FF00 кислотный лайм как фирменный акцент, #E5E5E5 светло-серый. Не добавляй множество других ярких цветов.

На изображении допускаются только короткий сильный заголовок, небольшая категория HOME/KITCHEN/LIFE/TECH/MONEY/DO IT и небольшой фирменный элемент Hackbyt. Текст должен быть крупным и читаемым.

Строго не делай: панели 1–2–3, длинные инструкции, блок «КАК РАБОТАЕТ?», много стрелок, несколько маленьких карточек, таблицы, диаграммы, случайные иконки, лампочки, молотки, звёздочки, универсальный клипарт, бежево-зелёную Pinterest-стилистику, перегруженный декор.

Главное правило: картинка должна показывать идею лайфхака, но не объяснять весь способ. Подробности находятся в подписи Telegram. Если убрать текст, фотография всё равно должна визуально объяснять тему.

Сохраняй визуальный язык уже согласованных Hackbyt-обложек с холодильником и банкой, но не копируй их композицию буквально.`;

function stripHtml(text) {
  return text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

async function getChannelContext(topic) {
  const posts = await getChannelPosts({ limit: 120, maxPages: 12 });
  const similar = findSimilarPosts(topic, posts, 8);
  return { posts, similar };
}

function formatCheckResult(topic, posts, similar) {
  const strongest = similar[0];
  const score = strongest ? Math.round(strongest.score * 100) : 0;

  let status = 'УНИКАЛЬНО';
  if (score >= 55) status = 'ПОХОЖАЯ ТЕМА';
  else if (score >= 35) status = 'ЕСТЬ ЧАСТИЧНОЕ СОВПАДЕНИЕ';

  const lines = [
    `Проверил историю @${CHANNEL_USERNAME}. Найдено публикаций: ${posts.length}.`,
    `Статус: ${status}`,
    `Максимальное текстовое сходство: ${score}%`,
  ];

  if (similar.length) {
    lines.push('', 'Похожие публикации:');
    for (const post of similar.slice(0, 5)) {
      const preview = post.text.replace(/\s+/g, ' ').slice(0, 140) || '(пост без текста)';
      lines.push(`• #${post.id} — ${preview}`, post.url);
    }
  } else {
    lines.push('', 'Похожих публикаций не найдено.');
  }

  return lines.join('\n');
}

async function createDraft(topic) {
  const { posts, similar } = await getChannelContext(topic);
  const history = formatPostsForPrompt(similar.length ? similar : posts.slice(0, 25));

  const post = await generateText(`${STYLE}\n\nТема нового поста: ${topic}\n\nНиже — уже опубликованные материалы из @${CHANNEL_USERNAME}. Используй их только для проверки повторов. Не повторяй их тему, формулировку или тот же самый совет. Если тема слишком похожа, смести угол подачи или предложи другой практический способ.\n\n${history}\n\nНапиши новый готовый пост. Верни только текст поста. Не добавляй комментарии о своей работе.`);
  const plainPost = stripHtml(post);
  const imagePrompt = `${IMAGE_STYLE}\n\nТема поста: ${topic}\n\nТекст поста для понимания смысла:\n${plainPost}\n\nСделай обложку, которая визуально показывает главный лайфхак из этого поста. Не переноси весь текст поста на изображение.`;
  const image = await generateImage(imagePrompt);
  return { post, image, postsChecked: posts.length, similar };
}

async function send(message, text) {
  await telegram('sendMessage', { chat_id: message.chat.id, text });
}

async function publishPreview(callbackQuery) {
  const previewMessage = callbackQuery.message;
  if (!previewMessage?.message_id || !previewMessage?.chat?.id) throw new Error('Не найден предпросмотр');

  await telegram('copyMessage', {
    chat_id: CHANNEL,
    from_chat_id: previewMessage.chat.id,
    message_id: previewMessage.message_id,
  });

  await telegram('answerCallbackQuery', {
    callback_query_id: callbackQuery.id,
    text: 'Опубликовано в @hackbyt',
  });

  try {
    await telegram('editMessageReplyMarkup', {
      chat_id: previewMessage.chat.id,
      message_id: previewMessage.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {}
}

async function cancelPreview(callbackQuery) {
  const message = callbackQuery.message;
  await telegram('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Публикация отменена' });
  if (message?.chat?.id && message?.message_id) {
    try {
      await telegram('editMessageReplyMarkup', {
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {}
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const update = req.body || {};

    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      if (!isAllowedAdmin({ from: callbackQuery.from })) return res.status(200).json({ ok: true });
      if (callbackQuery.data === 'hb_publish') await publishPreview(callbackQuery);
      else if (callbackQuery.data === 'hb_cancel') await cancelPreview(callbackQuery);
      return res.status(200).json({ ok: true });
    }

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
    } else if (text === '/posts') {
      const posts = await getChannelPosts({ limit: 10, maxPages: 3 });
      if (!posts.length) throw new Error('Не удалось найти публикации в публичной ленте канала');
      const lines = [`Последние публикации @${CHANNEL_USERNAME}:`, ''];
      for (const post of posts) {
        const preview = post.text.replace(/\s+/g, ' ').slice(0, 180) || '(пост без текста / только медиа)';
        lines.push(`#${post.id} — ${preview}`, post.url, '');
      }
      await send(message, lines.join('\n').trim());
    } else if (text.startsWith('/check ')) {
      const topic = text.slice(7).trim();
      if (!topic) throw new Error('Укажи тему после /check');
      await send(message, 'Проверяю историю @hackbyt…');
      const { posts, similar } = await getChannelContext(topic);
      await send(message, formatCheckResult(topic, posts, similar));
    } else if (text === '/idea') {
      const posts = await getChannelPosts({ limit: 100, maxPages: 10 });
      const history = formatPostsForPrompt(posts, 18000);
      const result = await generateText(`${STYLE}\n\nПредложи 5 разных идей для следующих постов. Сначала проанализируй уже опубликованные материалы ниже и не повторяй их темы. Для каждой идеи дай заголовок и одну строку, почему она полезна.\n\nИстория @${CHANNEL_USERNAME}:\n${history}`);
      await send(message, result);
    } else if (text.startsWith('/create ') || text.startsWith('/write ')) {
      const topic = text.startsWith('/create ') ? text.slice(8).trim() : text.slice(7).trim();
      if (!topic) throw new Error('Укажи тему после /create');

      await send(message, 'Проверяю историю @hackbyt и готовлю пост с учётом уже опубликованных материалов…');
      const { post, image, postsChecked, similar } = await createDraft(topic);
      const strongest = similar[0];
      const checkLine = strongest
        ? `Проверено публикаций: ${postsChecked}. Ближайшее совпадение по теме: ${Math.round(strongest.score * 100)}%.`
        : `Проверено публикаций: ${postsChecked}. Похожих публикаций не найдено.`;

      await sendPhoto(message.chat.id, image, `${post}\n\n<i>${checkLine}</i>`, {
        inline_keyboard: [[
          { text: 'Публиковать', callback_data: 'hb_publish' },
          { text: 'Отмена', callback_data: 'hb_cancel' },
        ]],
      });
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
      await telegram('sendMessage', { chat_id: CHANNEL, text: post, parse_mode: 'HTML' });
      await send(message, 'Опубликовано в @hackbyt.');
    } else {
      await send(message, 'Неизвестная команда. Используй /help.');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    try {
      if (req.body?.message) await send(req.body.message, `Ошибка: ${error.message}`);
    } catch {}
    return res.status(200).json({ ok: true });
  }
}
