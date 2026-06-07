// api/releve.js — Vercel Serverless Function (proxy Edge Function)
// Reçoit les requêtes du client et les forward à l'Edge Function Supabase
// Le WEBHOOK_SECRET ne sort jamais vers le navigateur

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const WEBHOOK_SECRET  = process.env.WEBHOOK_SECRET;
  const SUPABASE_URL    = process.env.VITE_SUPABASE_URL;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/publish-releve`,
      {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-webhook-secret':  WEBHOOK_SECRET,
        },
        body: JSON.stringify(req.body),
      }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
