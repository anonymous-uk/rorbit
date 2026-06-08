// Requires SUPADATA_API_KEY environment variable — set in Vercel project settings.

const isYouTubeUrl = (url) =>
  url.includes('youtube.com/watch') || url.includes('youtu.be/');

const parseTimeToMs = (str) => {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split(':').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return (parts[0] * 60 + parts[1]) * 1000;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { url, startTime, endTime } = req.body ?? {};
  if (!url) return res.status(400).json({ error: 'url required' });

  if (isYouTubeUrl(url)) {
    const apiRes = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(url)}&text=false`,
      { headers: { 'x-api-key': process.env.SUPADATA_API_KEY } }
    );

    if (apiRes.status === 429) return res.status(200).json({ error: 'RATE_LIMIT' });

    // Read body once so we can include it in error detail regardless of status
    let responseBody;
    try { responseBody = await apiRes.json(); } catch { responseBody = null; }

    if (!apiRes.ok) {
      return res.status(200).json({
        error: 'FETCH_FAILED',
        detail: `Supadata status: ${apiRes.status}, body: ${JSON.stringify(responseBody)}`,
      });
    }

    const content = responseBody?.content;
    if (!content?.length) {
      return res.status(200).json({
        error: 'FETCH_FAILED',
        detail: `Supadata status: ${apiRes.status}, body: ${JSON.stringify(responseBody)}`,
      });
    }

    const startMs = parseTimeToMs(startTime);
    const endMs   = parseTimeToMs(endTime);

    const filtered = content.filter(c => {
      if (startMs !== null && c.offset < startMs) return false;
      if (endMs   !== null && c.offset > endMs)   return false;
      return true;
    });

    const text = filtered.map(c => c.text).join(' ').replace(/\s+/g, ' ').trim();

    let durationNote = 'Full transcript';
    if (startTime && endTime) durationNote = `From ${startTime} to ${endTime}`;
    else if (startTime)       durationNote = `From ${startTime}`;
    else if (endTime)         durationNote = `Up to ${endTime}`;

    // Supadata doesn't return a title; leave it empty
    return res.status(200).json({ text, title: '', durationNote });
  }

  // Generic URL handler — unchanged
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ROrbit/1.0)' },
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const text = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    return res.status(200).json({ text, title, durationNote: '' });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
