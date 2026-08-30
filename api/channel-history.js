import { getChannelPosts, findSimilarPosts } from '../lib/channel.js';

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 30, 1), 120);
    const posts = await getChannelPosts({ limit, maxPages: Math.ceil(limit / 5) + 2 });
    const result = posts.map((post) => ({
      id: post.id,
      date: post.date || null,
      url: post.url,
      text: post.text,
    }));

    return json(res, 200, {
      ok: true,
      channel: `@${process.env.TELEGRAM_CHANNEL_USERNAME || 'hackbyt'}`,
      count: result.length,
      posts: result,
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Failed to read channel history' });
  }
}
