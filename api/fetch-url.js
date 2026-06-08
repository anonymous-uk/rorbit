import { YoutubeTranscript } from 'youtube-transcript';

const extractYouTubeId = (url) => {
  const m = url.match(/(?:[?&]v=|youtu\.be\/|embed\/)([^?&\s]+)/);
  return m ? m[1] : null;
};

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

  const videoId = extractYouTubeId(url);

  if (videoId) {
    try {
      let title = '';
      try {
        const oe = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (oe.ok) title = (await oe.json()).title ?? '';
      } catch {}

      const entries = await YoutubeTranscript.fetchTranscript(videoId);
      const startMs = parseTimeToMs(startTime);
      const endMs   = parseTimeToMs(endTime);

      const filtered = entries.filter(e => {
        if (startMs !== null && e.offset < startMs) return false;
        if (endMs   !== null && e.offset > endMs)   return false;
        return true;
      });

      const text = filtered.map(e => e.text).join(' ');

      let durationNote = 'Full transcript';
      if (startTime && endTime)   durationNote = `From ${startTime} to ${endTime}`;
      else if (startTime)         durationNote = `From ${startTime}`;
      else if (endTime)           durationNote = `Up to ${endTime}`;

      return res.status(200).json({ text, title, durationNote });
    } catch (err) {
      return res.status(200).json({ error: `Transcript unavailable: ${err.message}` });
    }
  }

  // Generic URL handler
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
