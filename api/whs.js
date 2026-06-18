// api/whs.js — injecte le webhook secret côté serveur uniquement
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.WEBHOOK_SECRET ?? '';
  res.send(`window.__WHS__ = '${secret}';`);
}