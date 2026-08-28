import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const CHANNEL = '@hackbyt';
const FOOTER = 'Подписаться на Hackbyt — полезные лайфхаки каждый день.';

function getConfig() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const session = process.env.TELEGRAM_SESSION_STRING;
  if (!Number.isInteger(apiId) || !apiHash || !session) {
    throw new Error('Для обработки старых постов нужны TELEGRAM_API_ID, TELEGRAM_API_HASH и TELEGRAM_SESSION_STRING.');
  }
  return { apiId, apiHash, session };
}

function addFooter(text = '') {
  const value = String(text || '').trim();
  if (!value) return value;
  if (value.includes(FOOTER)) return value;
  return `${value}\n\n${FOOTER}`;
}

export async function updateOldPosts({ limit = 100 } = {}) {
  const { apiId, apiHash, session } = getConfig();
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 2,
  });

  await client.connect();
  try {
    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for await (const message of client.iterMessages(CHANNEL, { limit })) {
      scanned += 1;
      const text = message.message || '';
      if (!text || text.includes(FOOTER)) {
        skipped += 1;
        continue;
      }

      try {
        await client.invoke(new Api.messages.EditMessage({
          peer: CHANNEL,
          id: message.id,
          message: addFooter(text),
          noWebpage: true,
        }));
        updated += 1;
      } catch (error) {
        errors += 1;
        console.error(`Не удалось обновить сообщение ${message.id}:`, error);
      }
    }

    return { scanned, updated, skipped, errors };
  } finally {
    await client.disconnect();
  }
}

export { FOOTER };
