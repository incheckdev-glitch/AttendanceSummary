function text(value = '') {
  return String(value ?? '').trim();
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const publicKey = text(
    process.env.VAPID_PUBLIC_KEY ||
      process.env.PUSH_VAPID_PUBLIC_KEY ||
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      process.env.VITE_VAPID_PUBLIC_KEY
  );

  if (!publicKey) {
    return res.status(500).json({ ok: false, error: 'Missing VAPID public key in Vercel.' });
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res.status(200).json({
    ok: true,
    vapidPublicKey: publicKey,
    publicKey,
    first12: publicKey.slice(0, 12),
    last12: publicKey.slice(-12)
  });
}
