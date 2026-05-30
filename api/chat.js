export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const json = await upstream.json();
    return res.status(upstream.status).json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
