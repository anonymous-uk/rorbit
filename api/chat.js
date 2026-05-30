export default async function handler(req, res) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
  });
  const data = await response.json();
  return res.status(response.status).json(data);
}
