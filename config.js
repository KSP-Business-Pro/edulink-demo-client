// api/config.js — Vercel Serverless Function
// Expose les variables publiques au client legacy (index.html)
// ⚠ Ne jamais exposer WEBHOOK_SECRET ici — reste côté serveur uniquement

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.edulink.bj');
  res.setHeader('Cache-Control', 's-maxage=3600');
  res.json({
    supabaseUrl:  process.env.VITE_SUPABASE_URL,
    supabaseAnon: process.env.VITE_SUPABASE_ANON_KEY,
  });
}
