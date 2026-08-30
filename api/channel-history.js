import { getChannelPosts, findSimilarPosts } from '../lib/channel.js';

function json(res, status, body) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 120, 1), 120);
    const topic = typeof req.query?.topic === 'string' ? req.query.topic.trim() : '';
    const posts = await getChannelPosts({ limit, maxPages: Math.ceil(limit / 5) + 2 });
    const similar = topic ? findSimilarPosts(topic, posts, 10) : [];
    const topScore = similar[0]?.score || 0;
    const status = topScore >= 0.55 ? 'similar' : topScore >= 0.35 ? 'partial' : 'unique';

    return json(res, 200, {
      ok: true,
      channel: `@${process.env.TELEGRAM_CHANNEL_USERNAME || 'hackbyt'}`,
      count: posts.length,
      posts: posts.map((post) => ({ id: post.id, date: post.date || null, url: post.url, text: post.text })),
      ...(topic ? {
        topic,
        status,
        maxSimilarity: Math.round(topScore * 100),
        similar: similar.map((post) => ({ id: post.id, url: post.url, text: post.text, similarity: Math.round(post.score * 100) })),
      } : {}),
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Failed to read channel history' });
  }
}
