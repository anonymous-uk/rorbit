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

async function fetchYouTubeTranscript(videoId) {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!pageRes.ok) throw new Error(`Page fetch HTTP ${pageRes.status}`);
  const html = await pageRes.text();

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = (titleMatch?.[1] ?? '').replace(/ - YouTube$/, '').trim();

  // Locate ytInitialPlayerResponse (no space assumption — handles both "= {" and "={")
  const markerIdx = html.indexOf('ytInitialPlayerResponse=');
  if (markerIdx === -1) throw new Error('ytInitialPlayerResponse not found in page');

  const jsonStart = html.indexOf('{', markerIdx);
  if (jsonStart === -1) throw new Error('Opening brace not found');

  // Slice from '{' to the first "};" that closes the top-level assignment
  const jsonEnd = html.indexOf('};', jsonStart);
  if (jsonEnd === -1) throw new Error('Closing }; not found');

  let playerResponse;
  try {
    playerResponse = JSON.parse(html.slice(jsonStart, jsonEnd + 1));
  } catch {
    throw new Error('Failed to parse ytInitialPlayerResponse JSON');
  }

  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) throw new Error('No caption tracks available for this video');

  const track =
    tracks.find(t => t.languageCode === 'en') ??
    tracks.find(t => t.languageCode?.startsWith('en')) ??
    tracks[0];

  if (!track?.baseUrl) throw new Error('Caption track has no URL');

  // JSON3 format: events[].tStartMs + events[].segs[].utf8
  const captionRes = await fetch(`${track.baseUrl}&fmt=json3`);
  if (!captionRes.ok) throw new Error(`Caption fetch HTTP ${captionRes.status}`);
  const captionData = await captionRes.json();

  return { title, events: captionData.events ?? [] };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { url, startTime, endTime } = req.body ?? {};
  if (!url) return res.status(400).json({ error: 'url required' });

  const videoId = extractYouTubeId(url);

  if (videoId) {
    try {
      const startMs = parseTimeToMs(startTime);
      const endMs   = parseTimeToMs(endTime);

      const { title, events } = await fetchYouTubeTranscript(videoId);

      const filtered = events.filter(e => {
        if (!e.segs) return false;
        if (startMs !== null && e.tStartMs < startMs) return false;
        if (endMs   !== null && e.tStartMs > endMs)   return false;
        return true;
      });

      const text = filtered
        .map(e => (e.segs ?? []).map(s => s.utf8 ?? '').join(''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      let durationNote = 'Full transcript';
      if (startTime && endTime) durationNote = `From ${startTime} to ${endTime}`;
      else if (startTime)       durationNote = `From ${startTime}`;
      else if (endTime)         durationNote = `Up to ${endTime}`;

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
