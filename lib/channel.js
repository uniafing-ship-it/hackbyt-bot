const CHANNEL_USERNAME = process.env.TELEGRAM_CHANNEL_USERNAME || 'hackbyt';
const CHANNEL_URL = `https://t.me/s/${CHANNEL_USERNAME}`;

function decodeHtml(value) {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(html) {
  return decodeHtml(html.replace(/<br\s*\/?>(\r?\n)?/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractMessages(html) {
  const messages = [];
  const markers = [...html.matchAll(/data-post="([^"]+)"/gi)];
  for (let i = 0; i < markers.length; i += 1) {
    const match = markers[i];
    const postRef = match[1];
    const id = Number(postRef.split('/').pop());
    if (!Number.isFinite(id)) continue;
    const start = match.index ?? 0;
    const end = i + 1 < markers.length ? (markers[i + 1].index ?? html.length) : html.length;
    const block = html.slice(start, end);
    const textMatch = block.match(/class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    messages.push({ id, postRef, url: `https://t.me/${postRef}`, text: textMatch ? htmlToText(textMatch[1]) : '' });
  }
  return messages;
}

async function fetchPage(before) {
  const url = before ? `${CHANNEL_URL}?before=${before}` : CHANNEL_URL;
  const response = await fetch(url, { headers: { 'user-agent': 'HackbytAI/1.0', accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`Не удалось получить историю @${CHANNEL_USERNAME}: HTTP ${response.status}`);
  return response.text();
}

export async function getChannelPosts({ limit = 100, maxPages = 10 } = {}) {
  const unique = new Map();
  let before;
  for (let page = 0; page < maxPages && unique.size < limit; page += 1) {
    const html = await fetchPage(before);
    const pagePosts = extractMessages(html);
    if (!pagePosts.length) break;
    for (const post of pagePosts) {
      if (!unique.has(post.id)) unique.set(post.id, post);
      if (unique.size >= limit) break;
    }
    const oldest = pagePosts[pagePosts.length - 1]?.id;
    if (!oldest || oldest === before || pagePosts.length < 5) break;
    before = oldest;
  }
  return [...unique.values()].sort((a, b) => b.id - a.id).slice(0, limit);
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lightweight Russian stemming. It is intentionally conservative so that
// related forms such as "стиралка", "стиралку", "стиралки" and
// "стиралкой" can match without requiring an external NLP dependency.
function stem(word) {
  if (word.length < 5) return word;
  const suffixes = [
    'иями', 'ями', 'ами', 'ого', 'ему', 'ому', 'ыми', 'ими', 'ее', 'ие', 'ые', 'ое',
    'ей', 'ий', 'ый', 'ой', 'ем', 'им', 'ым', 'ом', 'ов', 'ев', 'ам', 'ям', 'ах', 'ях',
    'ию', 'ью', 'ия', 'ья', 'ию', 'ью', 'ую', 'юю', 'ая', 'яя', 'ою', 'ею', 'ую', 'юю',
    'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь', 'й'
  ];
  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

function tokens(text) {
  return new Set(normalize(text).split(' ').filter((word) => word.length >= 4).map(stem));
}

function similarity(a, b) {
  const left = tokens(a); const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection += 1;
  const jaccard = intersection / (left.size + right.size - intersection);
  const containment = intersection / Math.min(left.size, right.size);
  return Math.max(jaccard, containment * 0.8);
}

export function findSimilarPosts(topic, posts, limit = 8) {
  const normalizedTopic = normalize(topic);
  return posts
    .map((post) => {
      const score = similarity(topic, post.text);
      const normalizedText = normalize(post.text);
      const phraseBonus = normalizedTopic.length >= 12 && normalizedText.includes(normalizedTopic) ? 0.35 : 0;
      return { ...post, score: Math.min(1, score + phraseBonus) };
    })
    .filter((post) => post.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function formatPostsForPrompt(posts, maxChars = 18000) {
  let result = '';
  for (const post of posts) {
    const item = `#${post.id} | ${post.url}\n${post.text.slice(0, 700)}\n\n`;
    if (result.length + item.length > maxChars) break;
    result += item;
  }
  return result.trim();
}

export { CHANNEL_USERNAME };
